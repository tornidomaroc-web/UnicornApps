// The Gemini model is PINNED BY NAME. Both routes may call only the models in
// GEMINI_MODELS, in that order, and nothing in src/ may name a model anywhere
// else.
//
// THE DEFECT THIS GUARDS AGAINST
// The routes used to ask Google for its model list and serve the first stable
// "flash" model in Google's order. Google now lists several newer non-preview
// flash models at up to about four times the per-call price of the model every
// cost figure in this project was measured on. Under that logic production
// could move to one of them with no deploy, and no test would fail.
//
// WHAT THESE TESTS PROVE
//   (a) the list is exactly [primary, fallback], frozen, and MAX_MODEL_ATTEMPTS
//       is its length — the rate-limit sizing rests on that number;
//   (b) SOURCE-LEVEL: src/lib/gemini.ts makes no network call and sorts
//       nothing; no file under src/ other than gemini.ts contains a model name;
//       each route iterates GEMINI_MODELS and has exactly one call site, which
//       takes its model from the loop variable;
//   (c) BEHAVIOURAL: on a transient overload the second call is the FALLBACK
//       and telemetry records it; every model name handed to the SDK or put in
//       the REST URL is in the pinned list, in order;
//   (d) a pinned model Google does not serve (a 404, or a "not found" message)
//       makes exactly one call, tries NO other model, refunds the credit,
//       answers 503 + MODEL_NOT_FOUND (which the client maps by status to the
//       translated busy message) and logs ONE line carrying MODEL_NOT_FOUND_TAG
//       that names the model;
//   (e) quota still wins over every other classification.
//
// WHAT THEY CANNOT PROVE: that this project's key is allowed to call the pinned
// models. Google's models page says access to the 2.5 models is limited to
// projects that used them before. That is a live-API fact; the loud failure in
// (d) is what makes it show up on the first real request instead of never.

import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import {
  classifyGeminiError,
  FALLBACK_GEMINI_MODEL,
  formatModelNotFound,
  GEMINI_MODELS,
  MAX_MODEL_ATTEMPTS,
  MODEL_NOT_FOUND_TAG,
  ModelNotFoundError,
  PRIMARY_GEMINI_MODEL,
} from '../src/lib/gemini'

// ---- module mocks (same shape as gemini-quota-fallback.test.ts) --------------

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/credits', () => ({
  ...jest.requireActual('@/lib/credits'),
  createServiceClient: jest.fn(),
}))
// @/lib/gemini is REAL — the pinned list and the classifier are what is under test.

const mockGenerateContent = jest.fn()
// getGenerativeModel is a jest.fn() whose ARGUMENT is the thing under test.
const mockGetGenerativeModel = jest.fn((_opts: { model: string; generationConfig?: unknown }) => ({
  generateContent: mockGenerateContent,
}))
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}))

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/credits'
import { POST as generatePOST } from '../src/app/api/generate/route'
import { POST as refinePOST } from '../src/app/api/refine/route'

process.env.GEMINI_API_KEY = 'test-key'

const USER = { id: 'user-abc' }
const VALID_CONTENT = { seoTitle: 'A title', amazonBullets: [] }

/** Google's actual wording for an unknown model, parameterised on the name. */
const notFoundMessage = (model: string) =>
  `models/${model} is not found for API version v1beta, or is not supported for generateContent.`

/** SDK-shaped error (generate route reads e.status). */
function sdkError(status: number, message: string): any {
  const e: any = new Error(message)
  if (status) e.status = status
  return e
}

/** REST-shaped response (refine route reads apiResponse.status + data.error.message). */
function restError(status: number, message: string) {
  return { ok: false, status, json: async () => ({ error: { message } }) }
}

function restOk(content: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }] }),
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

const rpcCalls = (mock: SupabaseMock, fn: string) => mock.calls.filter((c) => c.table === `rpc:${fn}`)

const usageInserts = (mock: SupabaseMock) =>
  mock.calls.filter((c) => c.table === 'usage_events' && c.method === 'insert')

const modelInUrl = (url: string) => /models\/([^:]+):generateContent/.exec(url)?.[1]

/** The tagged lines console.error received, parsed. Exactly one is expected. */
const taggedLines = (spy: jest.SpyInstance) =>
  spy.mock.calls
    .map((c) => String(c[0]))
    .filter((l) => l.startsWith(`${MODEL_NOT_FOUND_TAG} `))
    .map((l) => JSON.parse(l.slice(MODEL_NOT_FOUND_TAG.length + 1)))

let supabase: SupabaseMock
let errorSpy: jest.SpyInstance
let warnSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  supabase = createSupabaseMock()
  supabase.client.auth.getUser.mockResolvedValue({ data: { user: USER } })
  ;(createClient as jest.Mock).mockReturnValue(supabase.client)
  ;(createServiceClient as jest.Mock).mockReturnValue(supabase.client)
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
  warnSpy.mockRestore()
})

// -----------------------------------------------------------------------------
// 1. The list itself — pure, no routes, no mocks.
// -----------------------------------------------------------------------------
describe('the pinned list', () => {
  it('is exactly [primary, fallback], by name', () => {
    expect([...GEMINI_MODELS]).toEqual(['gemini-2.5-flash', 'gemini-3.5-flash-lite'])
    expect(PRIMARY_GEMINI_MODEL).toBe('gemini-2.5-flash')
    expect(FALLBACK_GEMINI_MODEL).toBe('gemini-3.5-flash-lite')
  })

  it('is frozen — nothing can push a model onto it at runtime', () => {
    expect(Object.isFrozen(GEMINI_MODELS)).toBe(true)
  })

  it('MAX_MODEL_ATTEMPTS is the length of the list — the rate limiter is sized against it', () => {
    expect(MAX_MODEL_ATTEMPTS).toBe(GEMINI_MODELS.length)
    expect(MAX_MODEL_ATTEMPTS).toBe(2)
  })
})

describe('classifyGeminiError — model_not_found, and quota still first', () => {
  it.each([
    // status, message, expected
    [404, 'anything at all', 'model_not_found'],
    [0, notFoundMessage('some-model'), 'model_not_found'],
    [400, 'Model some-model is not found', 'model_not_found'],
    [403, 'Your project does not have access to model some-model', 'model_not_found'],
    // QUOTA WINS: by status, and by message even on a 404.
    [429, 'model not found', 'quota'],
    [404, 'Quota exceeded for this project', 'quota'],
    // Unchanged classes.
    [503, 'The service is unavailable', 'transient'],
    [503, 'The model is overloaded', 'transient'],
    [400, 'Request contains an invalid argument', 'fatal'],
    [500, 'Internal error', 'fatal'],
  ])('status %i + %p -> %s', (status, message, expected) => {
    expect(classifyGeminiError(status as number, message as string)).toBe(expected)
  })
})

describe('ModelNotFoundError / formatModelNotFound', () => {
  it('is an Error, instanceof-detectable, and carries the model', () => {
    const e = new ModelNotFoundError('some-model', 404, 'gone')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(ModelNotFoundError)
    expect(e.name).toBe('ModelNotFoundError')
    expect(e.model).toBe('some-model')
    expect(e.status).toBe(404)
  })

  it('formats ONE line: the tag, then JSON naming route, model, status and the pinned list', () => {
    const line = formatModelNotFound('refine', new ModelNotFoundError('some-model', 404, 'x'.repeat(2000)))
    expect(line.startsWith(`${MODEL_NOT_FOUND_TAG} `)).toBe(true)
    expect(line).not.toMatch(/\n/)
    const parsed = JSON.parse(line.slice(MODEL_NOT_FOUND_TAG.length + 1))
    expect(parsed).toMatchObject({ route: 'refine', model: 'some-model', status: 404 })
    expect(parsed.pinned).toEqual([...GEMINI_MODELS])
    // Upstream text is carried but capped, so one log row stays one log row.
    expect(parsed.upstream).toHaveLength(500)
  })
})

// -----------------------------------------------------------------------------
// 2. SOURCE-LEVEL: no code path can produce a model name that is not on the list.
//    A regex over source, like the api-error ledger — a backstop, not an AST.
// -----------------------------------------------------------------------------
describe('no code path can select a model that is not pinned', () => {
  const GEMINI_LIB = 'src/lib/gemini.ts'
  const ROUTES = ['src/app/api/generate/route.ts', 'src/app/api/refine/route.ts']

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) return walk(p)
      return /\.(ts|tsx)$/.test(entry.name) ? [p] : []
    })

  const SRC_FILES = walk(join(process.cwd(), 'src')).map((p) =>
    relative(process.cwd(), p).split(sep).join('/')
  )

  // Comments first: the explanations in gemini.ts name the models on purpose,
  // and a comment must not read as a call site.
  const codeOf = (rel: string) =>
    readFileSync(join(process.cwd(), rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('discovers the files it is about to police', () => {
    expect(SRC_FILES).toContain(GEMINI_LIB)
    for (const r of ROUTES) expect(SRC_FILES).toContain(r)
    expect(SRC_FILES.length).toBeGreaterThan(10)
  })

  it('gemini.ts makes no network call and ranks nothing', () => {
    const code = codeOf(GEMINI_LIB)
    expect(code).not.toMatch(/\bfetch\s*\(/)
    expect(code).not.toMatch(/models\?key/)
    expect(code).not.toMatch(/\.sort\s*\(/)
    expect(code).not.toMatch(/supportedGenerationMethods/)
    expect(code).not.toMatch(/includes\(['"]flash['"]\)/)
  })

  it.each(SRC_FILES.filter((f) => f !== GEMINI_LIB))(
    '%s names no Gemini model — the list in gemini.ts is the only place one may appear',
    (rel) => {
      expect(codeOf(rel)).not.toMatch(/\bgemini-\d/)
    }
  )

  it.each(ROUTES)('%s iterates GEMINI_MODELS and never resolves a list', (rel) => {
    const code = codeOf(rel)
    expect(code).toMatch(/for \(const modelName of GEMINI_MODELS\)/)
    expect(code).not.toMatch(/resolveGeminiModels|ListModels|MODEL_RESOLUTION_FAILED/)
  })

  it('generate has exactly one SDK call site and it takes its model from the loop', () => {
    const code = codeOf(ROUTES[0])
    expect(code.match(/getGenerativeModel\s*\(/g)).toHaveLength(1)
    expect(code).toMatch(/getGenerativeModel\(\{\s*model: modelName,/)
  })

  it('refine has exactly one REST call site and it takes its model from the loop', () => {
    const code = codeOf(ROUTES[1])
    expect(code.match(/:generateContent/g)).toHaveLength(1)
    expect(code).toMatch(/models\/\$\{modelName\}:generateContent/)
  })
})

// -----------------------------------------------------------------------------
// 3. /api/generate — the SDK path.
// -----------------------------------------------------------------------------
describe('/api/generate calls only pinned models, in order', () => {
  it('serves the PRIMARY first; on a transient overload the second call is the FALLBACK, and telemetry says so', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(sdkError(503, 'The model is overloaded'))
      .mockResolvedValueOnce({ response: { text: () => JSON.stringify(VALID_CONTENT) } })
    supabase.queue({ data: true }, { error: null }) // reserve_credit, generations insert

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(200)
    expect(mockGetGenerativeModel.mock.calls.map((c) => c[0].model)).toEqual([
      PRIMARY_GEMINI_MODEL,
      FALLBACK_GEMINI_MODEL,
    ])
    const inserts = usageInserts(supabase)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].args[0]).toMatchObject({ model: FALLBACK_GEMINI_MODEL, attempts: 2, outcome: 'success' })
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
  })

  it('every model handed to the SDK is on the pinned list, even when all are tried', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(503, 'The model is overloaded'))
    supabase.queue({ data: true }, { data: true })

    await generatePOST(generateRequest())

    const called = mockGetGenerativeModel.mock.calls.map((c) => c[0].model)
    expect(called).toEqual([...GEMINI_MODELS])
    for (const m of called) expect(GEMINI_MODELS).toContain(m)
  })

  it('404 on the PRIMARY: one call, NO fallback, refund once, 503 MODEL_NOT_FOUND, ONE tagged log line naming it', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(404, notFoundMessage(PRIMARY_GEMINI_MODEL)))
    supabase.queue({ data: true }, { data: true }) // reserve_credit, refund_credit

    const res = await generatePOST(generateRequest())

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('60')
    const body = await res.json()
    expect(body.code).toBe('MODEL_NOT_FOUND')
    // The user must not see Google's raw English.
    expect(body.error).not.toMatch(/not found|v1beta/i)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)

    const tagged = taggedLines(errorSpy)
    expect(tagged).toHaveLength(1)
    expect(tagged[0]).toMatchObject({ route: 'generate', model: PRIMARY_GEMINI_MODEL, status: 404 })
    expect(tagged[0].pinned).toEqual([...GEMINI_MODELS])
  })

  it('a "not found" MESSAGE with no status is model_not_found too — same one call, same 503', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(0, notFoundMessage(PRIMARY_GEMINI_MODEL)))
    supabase.queue({ data: true }, { data: true })

    const res = await generatePOST(generateRequest())

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(taggedLines(errorSpy)).toHaveLength(1)
  })

  it('transient on the PRIMARY then 404 on the FALLBACK: two calls, 503 MODEL_NOT_FOUND naming the fallback, refund once', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(sdkError(503, 'The model is overloaded'))
      .mockRejectedValueOnce(sdkError(404, notFoundMessage(FALLBACK_GEMINI_MODEL)))
    supabase.queue({ data: true }, { data: true })

    const res = await generatePOST(generateRequest())

    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
    const tagged = taggedLines(errorSpy)
    expect(tagged).toHaveLength(1)
    expect(tagged[0].model).toBe(FALLBACK_GEMINI_MODEL)
  })

  it('quota on the PRIMARY still wins: one call, 503 UPSTREAM_QUOTA_EXHAUSTED, no tagged line', async () => {
    mockGenerateContent.mockRejectedValue(sdkError(429, 'Quota exceeded'))
    supabase.queue({ data: true }, { data: true })

    const res = await generatePOST(generateRequest())

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    await expect(res.json()).resolves.toMatchObject({ code: 'UPSTREAM_QUOTA_EXHAUSTED' })
    expect(taggedLines(errorSpy)).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------------
// 4. /api/refine — the raw-fetch path (different transport, same policy).
// -----------------------------------------------------------------------------
describe('/api/refine calls only pinned models, in order', () => {
  it('serves the PRIMARY first; on a transient overload the second URL names the FALLBACK, and telemetry says so', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(restError(503, 'The model is overloaded'))
      .mockResolvedValueOnce(restOk(VALID_CONTENT))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }) // reserve_credit

    const res = await refinePOST(refineRequest())

    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.map((c) => modelInUrl(String(c[0])))).toEqual([
      PRIMARY_GEMINI_MODEL,
      FALLBACK_GEMINI_MODEL,
    ])
    const inserts = usageInserts(supabase)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].args[0]).toMatchObject({ model: FALLBACK_GEMINI_MODEL, attempts: 2, outcome: 'success' })
  })

  it('every model in a REST URL is on the pinned list, even when all are tried', async () => {
    const fetchMock = jest.fn().mockResolvedValue(restError(503, 'The model is overloaded'))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    await refinePOST(refineRequest())

    const called = fetchMock.mock.calls.map((c) => modelInUrl(String(c[0])))
    expect(called).toEqual([...GEMINI_MODELS])
  })

  it('404 on the PRIMARY: one fetch, NO fallback, refund once, 503 MODEL_NOT_FOUND, ONE tagged log line naming it', async () => {
    const fetchMock = jest.fn().mockResolvedValue(restError(404, notFoundMessage(PRIMARY_GEMINI_MODEL)))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    const res = await refinePOST(refineRequest())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('60')
    const body = await res.json()
    expect(body.code).toBe('MODEL_NOT_FOUND')
    expect(body.error).not.toMatch(/not found|v1beta/i)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)

    const tagged = taggedLines(errorSpy)
    expect(tagged).toHaveLength(1)
    expect(tagged[0]).toMatchObject({ route: 'refine', model: PRIMARY_GEMINI_MODEL, status: 404 })
  })

  it('transient on the PRIMARY then 404 on the FALLBACK: two fetches, 503 MODEL_NOT_FOUND naming the fallback', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(restError(503, 'The model is overloaded'))
      .mockResolvedValueOnce(restError(404, notFoundMessage(FALLBACK_GEMINI_MODEL)))
    global.fetch = fetchMock as unknown as typeof fetch
    supabase.queue({ data: true }, { data: true })

    const res = await refinePOST(refineRequest())

    expect(fetchMock).toHaveBeenCalledTimes(2)
    await expect(res.json()).resolves.toMatchObject({ code: 'MODEL_NOT_FOUND' })
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
    expect(taggedLines(errorSpy)[0].model).toBe(FALLBACK_GEMINI_MODEL)
  })
})
