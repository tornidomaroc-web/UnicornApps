// PR 2a (item 36 leg (a)) — stop falling back across models on QUOTA errors.
//
// THE DEFECT
// Both routes tried up to 3 candidate models and advanced to the next one on ANY
// 429 or 503 (isRetryableGeminiError OR'd them together). But a 429 / "resource
// exhausted" is a fact about the KEY, not the model: the whole app shares ONE
// free-tier quota bucket (5 RPM / 20 RPD), so the next candidate fails too. One
// request therefore burned up to 3 calls of a 20-CALL DAILY BUDGET to produce a
// single failure — worst exactly when the ceiling was already being hit, since
// that is what triggered the fallback in the first place.
//
// WHAT THESE TESTS PROVE
//   (a) classifyGeminiError splits quota from transient, and QUOTA WINS every
//       ambiguous case (the asymmetric-cost bias);
//   (b) the routes make exactly ONE Gemini call on a quota error — this is the
//       quota-burn claim, asserted directly as a call count;
//   (c) a genuine 503 still falls back (resilience is NOT lost), bounded by
//       MAX_MODEL_ATTEMPTS;
//   (d) a quota failure now answers 503 + UPSTREAM_QUOTA_EXHAUSTED instead of a
//       500 leaking Google's untranslated English (api-error.ts maps 503 ->
//       dash.aiBusy in EN + AR);
//   (e) the credit is still refunded on every one of those paths.
//
// WHAT THEY CANNOT PROVE: Google's real quota numbers (5 RPM / 20 RPD were read
// off the AI Studio dashboard, not from code), and nothing here measures tokens
// or cost — that is leg (c)/item 23, deliberately not in this PR.

import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import {
  classifyGeminiError,
  MAX_MODEL_ATTEMPTS,
  QuotaExhaustedError,
} from '../src/lib/gemini'

// ---- module mocks (same shape as gemini-deadline.test.ts) --------------------

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/credits', () => ({
  ...jest.requireActual('@/lib/credits'),
  createServiceClient: jest.fn(),
}))
// Keep the REAL classifyGeminiError — the loop's fallback decision is the thing
// under test. Only the network model-list call is stubbed.
jest.mock('@/lib/gemini', () => ({
  ...jest.requireActual('@/lib/gemini'),
  resolveGeminiModels: jest.fn(),
}))

const mockGenerateContent = jest.fn()
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent: mockGenerateContent }),
  })),
}))

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/credits'
import { resolveGeminiModels } from '@/lib/gemini'
import { POST as generatePOST } from '../src/app/api/generate/route'
import { POST as refinePOST } from '../src/app/api/refine/route'

process.env.GEMINI_API_KEY = 'test-key'

const USER = { id: 'user-abc' }
const VALID_CONTENT = { seoTitle: 'A title', amazonBullets: [] }

/** SDK-shaped error (generate route reads e.status). */
function sdkError(status: number, message: string): any {
  const e: any = new Error(message)
  e.status = status
  return e
}

/** REST-shaped response (refine route reads apiResponse.status + data.error.message). */
function restError(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  }
}

function generateRequest(): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA', lang: 'en' }),
  })
}

function refineRequest(): Request {
  return new Request('http://localhost/api/refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentContent: VALID_CONTENT, instruction: 'punchier', lang: 'en' }),
  })
}

const rpcCalls = (mock: SupabaseMock, fn: string) =>
  mock.calls.filter((c) => c.table === `rpc:${fn}`)

let supabase: SupabaseMock

beforeEach(() => {
  jest.clearAllMocks()
  supabase = createSupabaseMock()
  supabase.client.auth.getUser.mockResolvedValue({ data: { user: USER } })
  ;(createClient as jest.Mock).mockReturnValue(supabase.client)
  ;(createServiceClient as jest.Mock).mockReturnValue(supabase.client)
  // Three resolvable models — MORE than MAX_MODEL_ATTEMPTS on purpose, so the
  // slice is what bounds the fan-out, not the length of this list.
  ;(resolveGeminiModels as jest.Mock).mockResolvedValue(['model-a', 'model-b', 'model-c'])
})

// -----------------------------------------------------------------------------
// 1. classifyGeminiError — pure, no routes, no mocks.
// -----------------------------------------------------------------------------
describe('classifyGeminiError', () => {
  it.each([
    // status, message, expected
    [429, 'Too many requests', 'quota'],
    [0, 'Quota exceeded for quota metric', 'quota'],
    [0, 'RESOURCE_EXHAUSTED', 'quota'],
    [0, 'You have hit the rate limit', 'quota'],
    [503, 'The model is overloaded. Please try again later.', 'transient'],
    [0, 'The model is experiencing high demand', 'transient'],
    [0, 'Service temporarily down', 'transient'],
    [0, 'The service is unavailable', 'transient'],
    [400, 'Request contains an invalid argument', 'fatal'],
    [500, 'Internal error', 'fatal'],
  ])('status %i + %p -> %s', (status, message, expected) => {
    expect(classifyGeminiError(status as number, message as string)).toBe(expected)
  })

  // The two ambiguous cases. QUOTA WINS BOTH — deliberately. Mis-reading an
  // overload as quota costs one lost retry; mis-reading quota as overload costs
  // MAX_MODEL_ATTEMPTS x the daily budget at the exact moment it is exhausted.
  it('503 status carrying a QUOTA message -> quota (quota wins)', () => {
    expect(classifyGeminiError(503, 'resource exhausted for this project')).toBe('quota')
  })

  it('429 status carrying an OVERLOADED message -> quota (status 429 is key-level)', () => {
    expect(classifyGeminiError(429, 'the model is overloaded')).toBe('quota')
  })

  it('MAX_MODEL_ATTEMPTS is a small, explicit quota multiplier', () => {
    expect(MAX_MODEL_ATTEMPTS).toBe(2)
  })
})

// -----------------------------------------------------------------------------
// 2. /api/generate — the SDK path.
// -----------------------------------------------------------------------------
describe('/api/generate quota vs transient', () => {
  it('QUOTA (429): makes exactly ONE Gemini call — no fallback — refunds, 503', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(429, 'Quota exceeded'))
    supabase.queue({ data: true }, { data: true }) // reserve_credit, refund_credit

    const res = await generatePOST(generateRequest())

    // THE ASSERTION THIS PR EXISTS FOR: one request == one call, not three.
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('60')
    const body = await res.json()
    expect(body.code).toBe('UPSTREAM_QUOTA_EXHAUSTED')
    // The user must not see Google's raw English.
    expect(body.error).not.toMatch(/quota exceeded/i)
    // The credit is given back.
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('TRANSIENT (503): still falls back, bounded by MAX_MODEL_ATTEMPTS', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(503, 'The model is overloaded'))
    supabase.queue({ data: true }, { data: true })

    const res = await generatePOST(generateRequest())

    // Resilience preserved — and bounded.
    expect(mockGenerateContent).toHaveBeenCalledTimes(MAX_MODEL_ATTEMPTS)
    expect(res.status).toBe(500) // exhausted all candidates: unchanged behavior
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('FATAL (400 safety block): one call, no fallback, still refunds, still 500', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(400, 'safety block'))
    supabase.queue({ data: true }, { data: true })

    const res = await generatePOST(generateRequest())

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(500)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('success path untouched: 200, one call, NO refund', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(VALID_CONTENT) },
    })
    supabase.queue({ data: true }, { error: null }) // reserve_credit, generations insert

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(200)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------------
// 3. /api/refine — the raw-fetch path (different transport, same policy).
// -----------------------------------------------------------------------------
describe('/api/refine quota vs transient', () => {
  it('QUOTA (429): exactly ONE fetch — no fallback — refunds, 503', async () => {
    const fetchMock = jest.fn().mockResolvedValue(restError(429, 'Quota exceeded'))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    const res = await refinePOST(refineRequest())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('60')
    await expect(res.json()).resolves.toMatchObject({ code: 'UPSTREAM_QUOTA_EXHAUSTED' })
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('QUOTA by MESSAGE on a 503 status: still only ONE fetch (quota wins)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(restError(503, 'resource exhausted'))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    const res = await refinePOST(refineRequest())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'UPSTREAM_QUOTA_EXHAUSTED' })
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('TRANSIENT (503): still falls back, bounded by MAX_MODEL_ATTEMPTS', async () => {
    const fetchMock = jest.fn().mockResolvedValue(restError(503, 'The model is overloaded'))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    const res = await refinePOST(refineRequest())

    expect(fetchMock).toHaveBeenCalledTimes(MAX_MODEL_ATTEMPTS)
    expect(res.status).toBe(500)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('success path untouched: 200, one fetch, NO refund', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_CONTENT) }] } }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true })

    const res = await refinePOST(refineRequest())

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------------
// 4. The typed error must survive `instanceof` across the throw/catch boundary —
//    that is what routes the failure to 503 instead of the generic 500.
// -----------------------------------------------------------------------------
describe('QuotaExhaustedError', () => {
  it('is an Error and is instanceof-detectable', () => {
    const e = new QuotaExhaustedError()
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(QuotaExhaustedError)
    expect(e.name).toBe('QuotaExhaustedError')
  })
})
