// Turning a failed fetch Response into an honest, translated message.
//
// WHY THIS EXISTS
// The dashboard used to do this:
//
//     const data = await response.json()   // <- runs even when !response.ok
//     if (!response.ok) { ...map status... }
//
// Vercel's platform errors never reach our route handlers — the edge answers
// them directly, with a `text/plain` body:
//
//     Request Entity Too Large
//     FUNCTION_PAYLOAD_TOO_LARGE
//
// so `response.json()` threw `SyntaxError: Unexpected token 'R', "Request En"...
// is not valid JSON`, the status was never inspected, and that raw English
// SyntaxError was shown to the user — including in the Arabic UI. It also made
// every status branch below it unreachable for any non-JSON error body.
//
// The rule here: **look at the status first, and only ever parse a body that
// claims to be JSON.**
//
// This lives in its own module rather than inline in the component because the
// component cannot be tested — the suite runs `testEnvironment: 'node'` with no
// jsdom and no @testing-library. A pure function over a real `Response` is
// testable today with no new dependencies.

/**
 * Parse a response body as JSON, but only if it actually claims to be JSON, and
 * never throw. Returns null for a non-JSON content-type, a malformed body, or an
 * empty body.
 */
export async function readJsonBody(response: Response): Promise<any | null> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    // A body that advertised JSON and wasn't. Never let this surface as a
    // SyntaxError — that is the exact bug this module exists to prevent.
    return null
  }
}

/**
 * The user-visible message for a non-ok Response. Always returns a string;
 * never throws.
 *
 * Callers MUST have already checked `!response.ok`, and must handle 403
 * themselves where it has bespoke UI (the refine path pushes a chat message
 * rather than raising an error).
 *
 * @param t translator from LanguageContext; falls back to the raw key if the
 *          key is missing, so both `en` and `ar` must define every key used here.
 */
export async function resolveApiError(
  response: Response,
  t: (key: string) => string
): Promise<string> {
  // Status FIRST — these two never depend on the body, and for 413 there is no
  // JSON body to depend on. Vercel's edge rejects an oversize request before our
  // route runs, so no credit is ever reserved on this path.
  if (response.status === 413) return t('dash.filesizeError')

  // 503/429: our own routes return JSON here, but its `error` is untranslated
  // English. Prefer the localized string. Checking the status before the body
  // is what finally makes this branch reachable.
  if (response.status === 503 || response.status === 429) return t('dash.aiBusy')

  // Our own routes' JSON error bodies — the common case, preserved as-is.
  const body = await readJsonBody(response)
  if (body && typeof body.error === 'string' && body.error.length > 0) {
    return body.error
  }

  // Any other non-ok status whose body is not JSON (502, 504, an HTML error
  // page, an empty body). Previously a SyntaxError.
  return t('dash.requestFailed')
}
