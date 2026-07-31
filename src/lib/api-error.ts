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
 * Codes our own routes send INSTEAD of prose, mapped to translated keys.
 *
 * WHY A CODE AND NOT A STRING. A route cannot translate. `/api/refine` and
 * `/api/generate` do receive `lang` in the request body, but the 401 is answered
 * BEFORE `await req.json()` runs — it could not localize prose even if we wanted
 * it to. Putting Arabic literals in route files would also fork the dictionary.
 *
 * ⚠️ THIS IS NOT THE ALLOWLIST (backlog item 47). It does not restrict anything.
 * `resolveApiError` still trusts `body.error` verbatim below, and a route that
 * sends prose is still shown verbatim. What stands between a new route and a
 * repeat of the PR #64 leak is the ledger in __tests__/api-error.test.ts, which
 * FAILS CI on new prose — read that, not this, for the enforcement story. The
 * allowlist is finished when this map is the ONLY path and the `body.error`
 * branch is deleted; the blocker for that is the 403 (item 50).
 */
const CODE_KEYS: Record<string, string> = {
  // Both routes ALREADY sent this code, so wiring the 401 was a zero-line route
  // change. Previously fell through to dash.requestFailed ("please try again"),
  // which is futile advice here: every retry 401s too.
  UNAUTHORIZED: 'dash.sessionExpired',
  // The 422 parse failure. Two codes, not one shared code, because
  // resolveApiError takes no route argument and the advice differs per route:
  // /api/generate has no instruction to vary. Keeping it a pure function of the
  // Response is deliberate — that is the shape item 47's allowlist needs.
  FORMAT_FAILED: 'dash.formatFailed',
  REFINE_FORMAT_FAILED: 'dash.refineFormatFailed',
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

  const body = await readJsonBody(response)

  // CODES BEFORE PROSE. A route may send both (the 429/503 bodies carry an
  // untranslated `error` alongside their code), so a named code must win over
  // the trust branch below or the English would beat the translation.
  if (body && typeof body.code === 'string') {
    const key = CODE_KEYS[body.code]
    if (key) return t(key)
  }

  // Our own routes' JSON error bodies — the common case, preserved as-is.
  // Still trusted verbatim; see the warning on CODE_KEYS above.
  if (body && typeof body.error === 'string' && body.error.length > 0) {
    return body.error
  }

  // Any other non-ok status whose body is not JSON (502, 504, an HTML error
  // page, an empty body). Previously a SyntaxError.
  return t('dash.requestFailed')
}
