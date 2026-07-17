// Item 39 — /api/generate asks for JSON in the PROMPT; /api/refine makes it a
// STRUCTURAL contract via responseMimeType. The route without the constraint is
// the route that parse_failed on the only generation we have ever measured.
//
// WHY THIS CHANGE IS JUSTIFIED WITHOUT ANY RATE
// The founding measurement is n=1 — one failure in two calls, by one user, on one
// image. That is a coin landing heads once, NOT a 50% rate, and nothing here
// claims otherwise. The argument stands at n=0:
//   (a) /api/refine constrains the model and /api/generate does not;
//   (b) the schema asks for shopifyHtml = quote-heavy, multi-line HTML embedded
//       in a JSON string — the classic way an LLM emits syntactically bad JSON;
//   (c) the repo already learned this lesson once and applied it to one route
//       only (refine/route.ts:147-151 says so in its own comment).
//
// STRUCTURAL ELIMINATION (derived from code + the ledger, NOT from the expired
// log). A parse_failed ROW PROVES response.text() RETURNED: the SDK throws from
// text() on RECITATION/SAFETY/LANGUAGE (badFinishReasons in
// @google/generative-ai@0.24.1), which would propagate to a 500 and never reach
// recordUsage — recordUsage is only called inside the JSON.parse catch. So those
// three are ruled out. MAX_TOKENS is NOT in badFinishReasons (it returns partial
// text silently), but the founding row burned 3,023 of 8,192 output tokens, so it
// was not truncated either; and candidates=1,207 means it was not empty. The most
// probable finishReason is STOP: a COMPLETE, DELIBERATE response that simply was
// not bare JSON. That is exactly the class responseMimeType prevents.
//
// WHAT THESE TESTS PROVE
//   (a) the route asks for JSON mode, with the cap preserved;
//   (b) the happy path is untouched — 200, one call, NO refund;
//   (c) each malformed shape still yields 422 + refund + parse_failed telemetry
//       (JSON mode narrows the INPUT; it does not change how we handle a bad one);
//   (d) the fence regex is IRRELEVANT to every shape in (c) — asserted directly.
//
// WHAT THESE TESTS CANNOT PROVE — read this before trusting them
//   * THE FREQUENCY. A mock is OUR OWN GUESS about what Gemini returns. Nothing
//     here measures how often a real response is malformed, and no test can.
//   * WHAT GEMINI ACTUALLY RETURNS, or that responseMimeType changes it. That is
//     a live-API fact. The first REAL generation is the check — deliberately not
//     bought with a synthetic call against a 20 RPD ceiling.
//   * THAT JSON MODE WORKS WITH IMAGE INPUT. /api/refine is TEXT-ONLY;
//     /api/generate is IMAGE + TEXT. Refine's success is NOT proof for generate's
//     input shape, and this repo cannot settle it.

import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/credits', () => ({
  ...jest.requireActual('@/lib/credits'),
  createServiceClient: jest.fn(),
}))
jest.mock('@/lib/gemini', () => ({
  ...jest.requireActual('@/lib/gemini'),
  resolveGeminiModels: jest.fn(),
}))

const mockGenerateContent = jest.fn()
// Unlike gemini-quota-fallback.test.ts, getGenerativeModel is a jest.fn() here:
// its ARGUMENT is the thing under test.
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }))
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}))

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/credits'
import { resolveGeminiModels } from '@/lib/gemini'
import { POST as generatePOST } from '../src/app/api/generate/route'

process.env.GEMINI_API_KEY = 'test-key'

const USER = { id: 'user-abc' }
const VALID_CONTENT = { seoTitle: 'A title', amazonBullets: [] }

function generateRequest(): Request {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: 'data:image/jpeg;base64,AAAA', lang: 'en' }),
  })
}

const rpcCalls = (mock: SupabaseMock, fn: string) =>
  mock.calls.filter((c) => c.table === `rpc:${fn}`)

/** The EXACT cleanup line from generate/route.ts:222. */
const fenceRegexClean = (text: string) => text.replace(/```json|```/gi, '').trim()

let supabase: SupabaseMock

beforeEach(() => {
  jest.clearAllMocks()
  supabase = createSupabaseMock()
  supabase.client.auth.getUser.mockResolvedValue({ data: { user: USER } })
  ;(createClient as jest.Mock).mockReturnValue(supabase.client)
  ;(createServiceClient as jest.Mock).mockReturnValue(supabase.client)
  ;(resolveGeminiModels as jest.Mock).mockResolvedValue(['model-a', 'model-b'])
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  ;(console.error as jest.Mock).mockRestore?.()
})

// -----------------------------------------------------------------------------
// 1. The one line this PR exists for.
// -----------------------------------------------------------------------------
describe('/api/generate requests JSON mode', () => {
  it('passes responseMimeType: application/json to the model', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(VALID_CONTENT) },
    })
    supabase.queue({ data: true }, { error: null })

    await generatePOST(generateRequest())

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseMimeType: 'application/json',
        }),
      })
    )
  })

  it('keeps the 8192 output cap alongside JSON mode', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(VALID_CONTENT) },
    })
    supabase.queue({ data: true }, { error: null })

    await generatePOST(generateRequest())

    const cfg = mockGetGenerativeModel.mock.calls[0][0] as any
    expect(cfg.generationConfig.maxOutputTokens).toBe(8192)
  })

  it('matches /api/refine, which has set this since its own truncation fix', () => {
    // Guards the ASYMMETRY itself: both routes must constrain the model.
    const refineSrc = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/api/refine/route.ts'),
      'utf8'
    )
    const generateSrc = require('fs').readFileSync(
      require('path').join(__dirname, '../src/app/api/generate/route.ts'),
      'utf8'
    )
    expect(refineSrc).toContain("responseMimeType: 'application/json'")
    expect(generateSrc).toContain("responseMimeType: 'application/json'")
  })
})

// -----------------------------------------------------------------------------
// 2. The happy path must not move.
// -----------------------------------------------------------------------------
describe('/api/generate happy path is untouched by JSON mode', () => {
  it('200, exactly one Gemini call, NO refund', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(VALID_CONTENT) },
    })
    supabase.queue({ data: true }, { error: null })

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(200)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
    expect(await res.json()).toEqual(VALID_CONTENT)
  })

  it('still parses a fenced response (JSON mode narrows input, it does not gate it)', async () => {
    // JSON mode should stop fences arriving at all, but if one does, the
    // existing regex still handles the canonical form. Nothing regressed.
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '```json\n' + JSON.stringify(VALID_CONTENT) + '\n```' },
    })
    supabase.queue({ data: true }, { error: null })

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(200)
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(0)
  })
})

// -----------------------------------------------------------------------------
// 3. Malformed shapes still 422 + refund + record parse_failed.
// -----------------------------------------------------------------------------
// These are the shapes the fence regex CANNOT save. They are the reason JSON
// mode is the fix and the regex is not. Each is asserted end-to-end through the
// REAL route: no Gemini call, no quota.
const MALFORMED: Array<[string, string]> = [
  ['preamble before the object', "Here's the JSON:\n" + JSON.stringify(VALID_CONTENT)],
  ['preamble + canonical fence', "Here's the JSON:\n```json\n" + JSON.stringify(VALID_CONTENT) + '\n```'],
  ['non-json language tag (```js)', '```js\n' + JSON.stringify(VALID_CONTENT) + '\n```'],
  ['trailing commentary', JSON.stringify(VALID_CONTENT) + '\n\nLet me know if you want changes!'],
  // THE BET: shopifyHtml is asked for as multi-line, quote-heavy HTML.
  ['unescaped newline inside shopifyHtml', '{"shopifyHtml":"<h2>Mug</h2>\n<ul><li>Ceramic</li></ul>"}'],
  ['unescaped quotes inside shopifyHtml', '{"shopifyHtml":"<p class="feature">Ceramic</p>"}'],
  ['trailing comma', '{"seoTitle":"Mug","amazonBullets":["a"],}'],
]

describe('/api/generate malformed responses: 422 + refund + parse_failed', () => {
  it.each(MALFORMED)('%s -> 422 and refunds the credit', async (_name, payload) => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => payload, usageMetadata: { totalTokenCount: 3661 } },
    })
    supabase.queue({ data: true }, { error: null }, { data: true })

    const res = await generatePOST(generateRequest())

    expect(res.status).toBe(422)
    // The credit is given back — the customer pays nothing for our bad parse.
    expect(rpcCalls(supabase, 'refund_credit')).toHaveLength(1)
  })

  it.each(MALFORMED)('%s -> the fence regex does NOT rescue it', (_name, payload) => {
    // Asserted directly rather than asserted about: this is WHY the regex is not
    // the fix. Every shape above survives the cleanup line unparseable.
    expect(() => JSON.parse(fenceRegexClean(payload))).toThrow()
  })

  it('records parse_failed telemetry (we pay for this call, the customer does not)', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => "Here's the JSON:\n" + JSON.stringify(VALID_CONTENT),
        usageMetadata: { totalTokenCount: 3661 },
      },
    })
    supabase.queue({ data: true }, { error: null }, { data: true })

    await generatePOST(generateRequest())

    const inserts = supabase.calls.filter(
      (c) => c.table === 'usage_events' && c.method === 'insert'
    )
    expect(inserts).toHaveLength(1)
    expect(inserts[0].args[0]).toEqual(
      expect.objectContaining({ route: 'generate', outcome: 'parse_failed' })
    )
  })
})
