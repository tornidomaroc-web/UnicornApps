// Item 24, first half — response-handling order in the dashboard client.
//
// WHAT THESE TESTS PROVE
// The bug was that `await response.json()` ran BEFORE `if (!response.ok)`.
// Vercel's edge answers oversize requests itself, with a text/plain body, so
// json() threw a SyntaxError, the status was never inspected, and the user saw
// raw English inside an Arabic UI.
//
// These run against REAL `Response` objects (Node 20 global), with the byte-exact
// 413 body captured from production. So they exercise the same parse that failed.
//
// WHAT THEY DO NOT PROVE
// They do NOT render DashboardClient. The suite is `testEnvironment: 'node'` with
// no jsdom and no @testing-library, so the component's own wiring — that it calls
// resolveApiError, and that setError receives the result — is verified by reading
// the code, not by a test. That is precisely why the mapping was extracted into a
// pure function instead of left inline: the part that carries the logic is now
// testable without adding a browser environment to the project.

import { readFileSync } from 'fs'
import { join } from 'path'

import { resolveApiError, readJsonBody } from '../src/lib/api-error'

// Exactly what https://www.unicornapps.app/api/generate returns for an oversize
// body (captured 2026-07-10). Content-Type is text/plain, NOT json.
const VERCEL_413_BODY =
  'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n\ncdg1::xkrsk-1783676595665-e070894c5b60'

// Stand-in translator. Returns the key so a test can assert WHICH key was chosen
// without coupling to copy. Mirrors LanguageContext's own fallback-to-key behavior.
const t = (key: string) => key

const textResponse = (body: string, status: number) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('the bug being fixed', () => {
  it("Vercel's 413 body really does make response.json() throw a SyntaxError", async () => {
    // This is the old code path, reproduced. If this ever stops throwing, the
    // premise of this PR has changed.
    //
    // Asserted on the message, not `toThrow(SyntaxError)`: undici constructs the
    // error in a different realm from jest's VM context, so the constructor
    // identity check fails even though both are named SyntaxError. The message is
    // what the user saw anyway.
    const res = textResponse(VERCEL_413_BODY, 413)
    const copy = res.clone() // must clone BEFORE the body is consumed
    await expect(res.json()).rejects.toThrow(/is not valid JSON/)
    await expect(copy.json()).rejects.toThrow(/Unexpected token 'R'/)
  })

  it('resolveApiError never throws on that same body, and never leaks the SyntaxError', async () => {
    const message = await resolveApiError(textResponse(VERCEL_413_BODY, 413), t)
    expect(message).toBe('dash.filesizeError')
    expect(message).not.toMatch(/SyntaxError|not valid JSON|Unexpected token/i)
  })
})

describe('resolveApiError — status is read before the body', () => {
  it('413 (text/plain, from the edge) -> translated filesize message', async () => {
    await expect(resolveApiError(textResponse(VERCEL_413_BODY, 413), t)).resolves.toBe(
      'dash.filesizeError'
    )
  })

  it('503 from our route -> dash.aiBusy, NOT the untranslated body string', async () => {
    // PR #31's route returns this exact shape. Before the fix this branch was
    // unreachable for any non-JSON body; here it must also beat `body.error`.
    const res = jsonResponse({ error: 'AI service is busy', code: 'DEADLINE_EXCEEDED' }, 503)
    await expect(resolveApiError(res, t)).resolves.toBe('dash.aiBusy')
  })

  it('429 -> dash.aiBusy', async () => {
    await expect(resolveApiError(textResponse('Too Many Requests', 429), t)).resolves.toBe(
      'dash.aiBusy'
    )
  })

  it('503 with a text/plain body still maps to dash.aiBusy', async () => {
    // The status branch must not depend on the body parsing at all.
    await expect(resolveApiError(textResponse('Service Unavailable', 503), t)).resolves.toBe(
      'dash.aiBusy'
    )
  })
})

describe('resolveApiError — our own JSON error bodies are preserved', () => {
  it('422 formatting failure -> the route’s own error string', async () => {
    const res = jsonResponse({ error: 'AI generation failed due to formatting issues.' }, 422)
    await expect(resolveApiError(res, t)).resolves.toBe(
      'AI generation failed due to formatting issues.'
    )
  })

  it('403 insufficient credits -> the route’s own error string (generate has no bespoke branch)', async () => {
    const res = jsonResponse({ error: 'Insufficient credits' }, 403)
    await expect(resolveApiError(res, t)).resolves.toBe('Insufficient credits')
  })

  it('500 with a JSON error -> that error string', async () => {
    const res = jsonResponse({ error: 'Server configuration error.' }, 500)
    await expect(resolveApiError(res, t)).resolves.toBe('Server configuration error.')
  })
})

describe('resolveApiError — non-JSON and degenerate bodies fall back, never throw', () => {
  it('502 HTML error page -> generic translated fallback', async () => {
    const res = new Response('<!DOCTYPE html><h1>Bad Gateway</h1>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })
    await expect(resolveApiError(res, t)).resolves.toBe('dash.requestFailed')
  })

  it('504 with an empty body -> generic translated fallback', async () => {
    await expect(resolveApiError(new Response('', { status: 504 }), t)).resolves.toBe(
      'dash.requestFailed'
    )
  })

  it('a body that CLAIMS json but is malformed -> fallback, not a SyntaxError', async () => {
    const res = new Response('{not json', {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
    await expect(resolveApiError(res, t)).resolves.toBe('dash.requestFailed')
  })

  it('valid JSON with no `error` field -> generic fallback', async () => {
    await expect(resolveApiError(jsonResponse({ nope: 1 }, 500), t)).resolves.toBe(
      'dash.requestFailed'
    )
  })

  it('valid JSON with an empty `error` string -> generic fallback', async () => {
    await expect(resolveApiError(jsonResponse({ error: '' }, 500), t)).resolves.toBe(
      'dash.requestFailed'
    )
  })
})

describe('readJsonBody', () => {
  it('returns null for a non-JSON content-type without consuming a parse error', async () => {
    await expect(readJsonBody(textResponse(VERCEL_413_BODY, 413))).resolves.toBeNull()
  })

  it('honors a charset suffix on the content-type', async () => {
    const res = new Response(JSON.stringify({ error: 'x' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    })
    await expect(readJsonBody(res)).resolves.toEqual({ error: 'x' })
  })

  it('returns null when there is no content-type at all', async () => {
    await expect(readJsonBody(new Response('whatever', { status: 500 }))).resolves.toBeNull()
  })
})

// -----------------------------------------------------------------------------
// The other half of the contract: what the ROUTES are allowed to put in `error`.
//
// resolveApiError deliberately TRUSTS `body.error` from our own routes and shows
// it verbatim. That trust is what makes the 422 and 403 strings work, and it is
// only safe while every route treats `error` as reviewed, user-facing copy.
//
// Both catch-all 500s used to build it by concatenating `error.message`, so an
// exception was shown to the user untranslated, in the Arabic UI too. These are
// source-level assertions because the condition is "no route may ever do this",
// which no single request-level test can establish.
// -----------------------------------------------------------------------------
describe('routes never put a raw exception in a client-visible error field', () => {
  const ROUTES = ['src/app/api/generate/route.ts', 'src/app/api/refine/route.ts']

  const sourceOf = (rel: string) =>
    readFileSync(join(process.cwd(), rel), 'utf8')
      // Comments FIRST: the explanation of this very rule names `error.message`.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it.each(ROUTES)('%s builds no error string by concatenation', rel => {
    // e.g. `error: 'Failed to refine content: ' + error.message`
    expect(sourceOf(rel)).not.toMatch(/\berror:\s*(['"`])[\s\S]*?\1\s*\+/)
  })

  it.each(ROUTES)('%s never places error.message in a response body', rel => {
    const src = sourceOf(rel)
    for (const match of src.match(/NextResponse\.json\([\s\S]{0,200}?\)/g) ?? []) {
      expect(match).not.toMatch(/error\.message/)
    }
  })

  it.each(ROUTES)('%s still logs the exception server-side', rel => {
    // The detail must not be lost, only kept out of the response.
    expect(sourceOf(rel)).toMatch(/console\.error\('(Generation|Refinement) error:', error\)/)
  })

  it.each(ROUTES)('%s sends no prose with its catch-all 500', rel => {
    expect(sourceOf(rel)).toMatch(/\{ code: 'INTERNAL_ERROR' \}, \{ status: 500 \}/)
  })

  it('a 500 carrying only a code falls through to the translated generic', async () => {
    // The client-side half: this is what the routes above now return.
    const res = jsonResponse({ code: 'INTERNAL_ERROR' }, 500)
    await expect(resolveApiError(res, t)).resolves.toBe('dash.requestFailed')
  })

  it('a 500 carrying a code never surfaces the code itself', async () => {
    const res = jsonResponse({ code: 'SERVER_MISCONFIGURED' }, 500)
    await expect(resolveApiError(res, t)).resolves.not.toMatch(/SERVER_MISCONFIGURED/)
  })
})
