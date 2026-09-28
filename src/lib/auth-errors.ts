/**
 * Everything the auth screens may say about a failure, as closed sets of codes.
 *
 * WHY CODES, NOT MESSAGES. Supabase and the OAuth providers answer in English
 * prose, and a callback URL carries whatever the last hop put in it. Anything
 * copied from there onto the screen is untranslated in the Arabic UI, and a
 * `?error=` that is rendered verbatim lets anyone who sends a link write their
 * own sentence under our logo. So nothing here ever returns input text: every
 * function maps to a member of a fixed list, and the screens render only
 * `t(key)` for that member.
 *
 * Pure and React-free, so it is unit-tested in node.
 */

/** Failures a screen can show. Each has a `login.err.<code>` string in both languages. */
export const AUTH_ERROR_CODES = [
  'invalid_credentials',
  'email_not_confirmed',
  'already_registered',
  'weak_password',
  'same_password',
  'missing_fields',
  'server_unreachable',
  'rate_limited',
  'config_error',
  'unknown',
  'oauth_cancelled',
  'oauth_failed',
  'link_expired',
  'session_expired',
  'reset_session_missing',
] as const
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number]

/** Outcomes that are good news. Each has a `login.msg.<code>` string. */
export const AUTH_SUCCESS_CODES = ['check_email', 'reset_sent'] as const
export type AuthSuccessCode = (typeof AUTH_SUCCESS_CODES)[number]

/** What a server action hands back to a form. A code, never prose. */
export type AuthResult = { code: AuthErrorCode | AuthSuccessCode }

/**
 * The only codes a URL may carry to /login. Smaller than the full set on
 * purpose: these are the ones our own redirects produce. A form error such as
 * `invalid_credentials` arriving in a link was not produced by us, so it is
 * read as unknown rather than shown as if the user had just typed a password.
 */
export const URL_ERROR_CODES: readonly AuthErrorCode[] = [
  'config_error',
  'rate_limited',
  'unknown',
  'oauth_cancelled',
  'oauth_failed',
  'link_expired',
  'session_expired',
]

/** Errors that get the "send a new link" action next to them. */
export const LINK_ERROR_CODES: readonly AuthErrorCode[] = ['link_expired', 'reset_session_missing']

const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)

export const isAuthErrorCode = (v: unknown): v is AuthErrorCode => has(AUTH_ERROR_CODES, v)
export const isAuthSuccessCode = (v: unknown): v is AuthSuccessCode => has(AUTH_SUCCESS_CODES, v)

/**
 * A provider or Supabase failure, as it arrives on a redirect (`error`,
 * `error_code`) or on an AuthError (`code`), mapped to one of our codes.
 * `error_code` is the precise one and is read first: Supabase sends an expired
 * email link as `error=access_denied&error_code=otp_expired`, which must not
 * read as the user cancelling.
 */
export function callbackErrorCode(p: {
  error?: string | null
  error_code?: string | null
}): AuthErrorCode {
  switch (p.error_code) {
    case 'otp_expired':
      return 'link_expired'
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'bad_code_verifier':
    case 'bad_oauth_state':
    case 'bad_oauth_callback':
      return 'session_expired'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rate_limited'
  }
  if (p.error === 'access_denied') return 'oauth_cancelled'
  return 'oauth_failed'
}

/**
 * A raw Supabase auth error from a form action, mapped to a code. Matches the
 * stable `code` first when the SDK gives one, then the English message. An
 * unmatched error is `unknown`: its text is for the server log, never the page.
 */
export function mapSupabaseAuthError(message: string | null | undefined, code?: string | null): AuthErrorCode {
  switch (code) {
    case 'invalid_credentials':
      return 'invalid_credentials'
    case 'email_not_confirmed':
      return 'email_not_confirmed'
    case 'user_already_exists':
    case 'email_exists':
      return 'already_registered'
    case 'weak_password':
      return 'weak_password'
    case 'same_password':
      return 'same_password'
    case 'session_not_found':
      return 'reset_session_missing'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rate_limited'
  }
  const m = (message || '').toLowerCase()
  if (m.includes('email not confirmed')) return 'email_not_confirmed'
  if (m.includes('invalid login credentials')) return 'invalid_credentials'
  if (m.includes('already registered') || m.includes('already been registered')) return 'already_registered'
  if (m.includes('different from the old password')) return 'same_password'
  if (m.includes('session missing') || m.includes('session_not_found')) return 'reset_session_missing'
  if (m.includes('password should be') || m.includes('at least')) return 'weak_password'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('429')) return 'rate_limited'
  // Network / DNS / backend-unreachable (e.g. a deleted Supabase project).
  if (
    m.includes('fetch') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('enotfound') ||
    m.includes('econnrefused') ||
    m.includes('getaddrinfo') ||
    m.includes('dns')
  )
    return 'server_unreachable'
  return 'unknown'
}

/**
 * A `next` value that can only name a page on this site.
 *
 * `${origin}${next}` is not safe: `next=@evil.com` makes it
 * `https://www.unicornapps.app@evil.com`, whose host is evil.com. So `next`
 * must start with exactly one `/` (no `//host`), carry no backslash (browsers
 * read `/\host` as `//host`) and no control character, and still resolve to
 * the same origin. Anything else is the fallback. Returns a path, never a URL.
 */
export function safeNextPath(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string') return fallback
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback
  const base = 'https://same-origin.invalid'
  try {
    const u = new URL(raw, base)
    if (u.origin !== base) return fallback
    // Dot segments can collapse into a new `//`: `/a/../..//evil.com`
    // resolves to the path `//evil.com`, which is a host again.
    const path = u.pathname + u.search + u.hash
    return path.startsWith('//') ? fallback : path
  } catch {
    return fallback
  }
}

/** The error a URL claims, reduced to a code we produce. Anything else is `unknown`. */
export function urlErrorCode(raw: unknown): AuthErrorCode | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v !== 'string' || v === '') return null
  return has(URL_ERROR_CODES, v) ? v : 'unknown'
}

export type Feedback = { kind: 'success' | 'error'; key: string; code: AuthErrorCode | AuthSuccessCode }

/**
 * What the banner on an auth screen says: a translation KEY, never text. A
 * form result wins over a URL error (it is newer); a code outside the known
 * sets still resolves to the generic `unknown` key.
 */
export function resolveFeedback(
  state: { code?: unknown } | undefined | null,
  urlError?: unknown
): Feedback | null {
  if (state && state.code !== undefined) {
    if (isAuthSuccessCode(state.code)) return { kind: 'success', key: `login.msg.${state.code}`, code: state.code }
    const code = isAuthErrorCode(state.code) ? state.code : 'unknown'
    return { kind: 'error', key: `login.err.${code}`, code }
  }
  const fromUrl = urlErrorCode(urlError)
  return fromUrl ? { kind: 'error', key: `login.err.${fromUrl}`, code: fromUrl } : null
}
