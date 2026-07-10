// PR 1 — in-code deadline + explicit maxDuration on the two billable routes.
//
// WHAT THESE TESTS ACTUALLY PROVE
// The defect being fixed is: a hung Gemini call runs until the PLATFORM kills
// the function; a platform kill is not a JS exception, so `finally` never runs
// and reserve_credit's decrement is never refunded.
//
// These tests CANNOT reproduce a platform kill — jest has no lambda to SIGKILL,
// and a process that is SIGKILLed cannot assert anything about itself. What
// they prove is the half that is actually in our control and that the fix
// depends on:
//
//   (a) when the deadline fires, the failure arrives as a NORMAL rejection;
//   (b) `finally` therefore runs, and refund_credit is called EXACTLY once;
//   (c) the caller gets 503 + Retry-After, not a 500 with Google's raw text;
//   (d) an attempt is never STARTED below the single-attempt floor;
//   (e) the success path is untouched — no refund, no behavior change.
//
// The unproven residual is the gap between our deadline and the platform's
// kill, which is exactly what DEADLINE_MARGIN_MS is sized to cover. That gap is
// an argument about wall-clock, not something a unit test can settle. Nothing
// here asserts the platform's real maxDuration is 60s.

import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import {
  createDeadline,
  DeadlineExceededError,
  DEADLINE_MARGIN_MS,
  SINGLE_ATTEMPT_FLOOR_MS,
  FUNCTION_MAX_DURATION_S,
} from '../src/lib/deadline'

// ---- module mocks -----------------------------------------------------------

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/credits', () => ({
  ...jest.requireActual('@/lib/credits'),
  createServiceClient: jest.fn(),
}))
// Keep the REAL isRetryableGeminiError — the loop's fallback decision is part of
// what we are asserting. Only the network model-list call is stubbed.
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
import { POST as generatePOST, maxDuration as generateMaxDuration } from '../src/app/api/generate/route'
import { POST as refinePOST, maxDuration as refineMaxDuration } from '../src/app/api/refine/route'

process.env.GEMINI_API_KEY = 'test-key'

const USER = { id: 'user-abc' }
const VALID_CONTENT = { seoTitle: 'A title', amazonBullets: [] }

// Faithful stand-in for what @google/generative-ai throws on abort
// (dist/index.js:409-410 wraps a fetch AbortError in GoogleGenerativeAIAbortError).
function abortError(): Error {
  const e = new Error('Request aborted when fetching https://…: This operation was aborted')
  e.name = 'GoogleGenerativeAIAbortError'
  return e
}

function retryableError(): any {
  const e: any = new Error('The model is overloaded. Please try again later.')
  e.status = 503
  return e
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
  jest.useFakeTimers()

  supabase = createSupabaseMock()
  supabase.client.auth.getUser.mockResolvedValue({ data: { user: USER } })
  ;(createClient as jest.Mock).mockReturnValue(supabase.client)
  ;(createServiceClient as jest.Mock).mockReturnValue(supabase.client)
  ;(resolveGeminiModels as jest.Mock).mockResolvedValue(['model-a', 'model-b', 'model-c'])
})

afterEach(() => {
  jest.useRealTimers()
})

// -----------------------------------------------------------------------------
// 1. The constant the deadline arithmetic depends on must match the literal
//    Next.js actually deploys. These cannot share a symbol (Next requires a
//    static literal), so drift is only catchable here.
// -----------------------------------------------------------------------------
describe('maxDuration literal', () => {
  it('generate route exports the value the deadline math assumes', () => {
    expect(generateMaxDuration).toBe(FUNCTION_MAX_DURATION_S)
  })

  it('refine route exports the value the deadline math assumes', () => {
    expect(refineMaxDuration).toBe(FUNCTION_MAX_DURATION_S)
  })
})

// -----------------------------------------------------------------------------
// 2. Pure arithmetic — no routes, no mocks.
// -----------------------------------------------------------------------------
describe('createDeadline', () => {
  it('reserves DEADLINE_MARGIN_MS of the budget for unwinding', () => {
    jest.setSystemTime(1_000_000)
    const d = createDeadline(60, 1_000_000)
    expect(d.remainingMs()).toBe(60_000 - DEADLINE_MARGIN_MS)
  })

  it('assertBudget returns the remaining budget when above the floor', () => {
    jest.setSystemTime(1_000_000)
    const d = createDeadline(60, 1_000_000)
    expect(d.assertBudget(SINGLE_ATTEMPT_FLOOR_MS)).toBe(60_000 - DEADLINE_MARGIN_MS)
  })

  it('assertBudget throws DeadlineExceededError below the floor', () => {
    jest.setSystemTime(1_000_000)
    const d = createDeadline(60, 1_000_000)
    // Advance to leave 1s: 60s - margin - X = 1000ms
    jest.setSystemTime(1_000_000 + (60_000 - DEADLINE_MARGIN_MS) - 1_000)
    expect(d.remainingMs()).toBe(1_000)
    expect(() => d.assertBudget(SINGLE_ATTEMPT_FLOOR_MS)).toThrow(DeadlineExceededError)
  })

  it('attemptSignal aborts at the deadline and cancel() releases the timer', async () => {
    jest.setSystemTime(1_000_000)
    const d = createDeadline(60, 1_000_000)
    const a = d.attemptSignal()
    expect(a.signal.aborted).toBe(false)
    await jest.advanceTimersByTimeAsync(60_000 - DEADLINE_MARGIN_MS)
    expect(a.signal.aborted).toBe(true)

    const b = createDeadline(60, Date.now()).attemptSignal()
    b.cancel()
    await jest.advanceTimersByTimeAsync(60_000)
    expect(b.signal.aborted).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// 3. /api/generate
// -----------------------------------------------------------------------------
describe('/api/generate deadline', () => {
  it('success path is untouched: 200, no refund', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(VALID_CONTENT) },
    })
    supabase.queue({ data: true }, { error: null }) // reserve_credit, generations insert

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(VALID_CONTENT)
    expect(rpcCalls(supabase, 'reserve_credit')).toHaveLength(1)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
  })

  it('a hung call hits the deadline: normal rejection -> finally runs -> refund once -> 503', async () => {
    // Never resolves. Only the deadline's abort can end it — exactly the shape
    // that previously ran until the platform killed the function.
    mockGenerateContent.mockImplementation(
      (_req: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(abortError()))
        })
    )
    supabase.queue({ data: true }, { data: true }) // reserve_credit, refund_credit

    const pending = generatePOST(generateRequest())
    await jest.advanceTimersByTimeAsync(60_000)
    const res = await pending

    // (b) `finally` ran — this is the assertion the whole PR exists for.
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
    expect(rpcCalls(supabase, 'refund_credit')[0].args[1]).toEqual({
      p_user_id: USER.id,
      p_cost: 1,
    })
    // (c) clean 503, not a 500 carrying Google's English message.
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('30')
    const body = await res.json()
    expect(body.code).toBe('DEADLINE_EXCEEDED')
    expect(body.error).not.toMatch(/aborted/i)
  })

  it('never STARTS an attempt below the single-attempt floor', async () => {
    // model-a burns 55s then fails retryably. Only ~1s of budget is left, so
    // model-b must never be attempted.
    mockGenerateContent.mockImplementationOnce(
      (_req: unknown, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(retryableError()), 55_000)
          opts.signal.addEventListener('abort', () => reject(abortError()))
        })
    )
    supabase.queue({ data: true }, { data: true }) // reserve_credit, refund_credit

    const pending = generatePOST(generateRequest())
    await jest.advanceTimersByTimeAsync(60_000)
    const res = await pending

    // (d) one attempt, not three — the loop stopped on budget, not on policy.
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it('a non-deadline Gemini failure still refunds and still returns 500', async () => {
    // Guards the regression risk of the new catch: only ABORTS become 503.
    const boom: any = new Error('safety block')
    boom.status = 400
    mockGenerateContent.mockRejectedValue(boom)
    supabase.queue({ data: true }, { data: true })

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(500)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })
})

// -----------------------------------------------------------------------------
// 4. /api/refine (raw fetch, not the SDK)
// -----------------------------------------------------------------------------
describe('/api/refine deadline', () => {
  it('success path is untouched: 200, no refund', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_CONTENT) }] } }],
      }),
    }) as unknown as typeof fetch
    supabase.queue({ data: true })

    const res = await refinePOST(refineRequest())

    expect(res.status).toBe(200)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
  })

  it('a hung fetch hits the deadline: finally runs -> refund once -> 503', async () => {
    global.fetch = jest.fn(
      (_url: unknown, init: any) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const e = new Error('This operation was aborted')
            e.name = 'AbortError'
            reject(e)
          })
        })
    ) as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    const pending = refinePOST(refineRequest())
    await jest.advanceTimersByTimeAsync(60_000)
    const res = await pending

    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('30')
    await expect(res.json()).resolves.toMatchObject({ code: 'DEADLINE_EXCEEDED' })
  })

  it('passes an AbortSignal to fetch (the fix, at its narrowest)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(VALID_CONTENT) }] } }],
      }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true })

    await refinePOST(refineRequest())

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})
