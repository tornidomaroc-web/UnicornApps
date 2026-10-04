// Cloudflare Turnstile, verified on the server, for SIGN-UP ONLY.
//
// WHY HERE AND NOT IN SUPABASE. Supabase's built-in captcha, once switched on,
// demands a token on every password sign-in and every password reset too, not
// only on sign-up. A check placed in our own sign-up action covers exactly the
// path that hands out free credits and leaves sign-in and reset untouched.
// It holds because accounts are created by this server with the admin API
// (see signup in login/actions.ts), and a before-user-created hook in Supabase
// (migrations/2026-10-03_add_before_user_created_hook.sql) refuses any email
// sign-up arriving at the PUBLIC endpoint. Without that hook the public anon key
// could create accounts around this check. Google and Apple sign-ups pass the
// hook untouched.
//
// SERVER ONLY. TURNSTILE_SECRET_KEY is never NEXT_PUBLIC_ and never logged.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Upper bound for the call to Cloudflare. */
export const TURNSTILE_TIMEOUT_MS = 5000

/** The form field the Turnstile widget writes its token into. */
export const TURNSTILE_FIELD = 'cf-turnstile-response'

export type TurnstileOutcome =
  | { ok: true; checked: boolean }
  | { ok: false; reason: 'NO_SECRET' | 'NO_TOKEN' | 'REJECTED' }

/**
 * Verify a widget token with Cloudflare.
 *
 * Fails CLOSED on a missing secret, a missing token, or Cloudflare saying no:
 * those are the cases a farmer can produce. Fails OPEN only when Cloudflare
 * cannot be reached (timeout, network, 5xx): a real person must not be turned
 * away by someone else's outage, and the per-network limit that runs next
 * still bounds what an open door lets through. `checked: false` marks that.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp: string | null,
  timeoutMs: number = TURNSTILE_TIMEOUT_MS
): Promise<TurnstileOutcome> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.error('[turnstile] TURNSTILE_SECRET_KEY is not set: sign-up refused')
    return { ok: false, reason: 'NO_SECRET' }
  }
  const response = typeof token === 'string' ? token.trim() : ''
  if (!response) return { ok: false, reason: 'NO_TOKEN' }

  const body = new URLSearchParams({ secret, response })
  if (remoteIp) body.set('remoteip', remoteIp)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(SITEVERIFY, {
      method: 'POST',
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (res.status >= 500) {
      console.error(`[turnstile] siteverify answered ${res.status}: letting this sign-up through unchecked`)
      return { ok: true, checked: false }
    }
    const data = (await res.json().catch(() => null)) as { success?: boolean; 'error-codes'?: string[] } | null
    if (data?.success === true) return { ok: true, checked: true }
    console.warn('[turnstile] token rejected:', (data?.['error-codes'] ?? []).join(',') || 'no reason')
    return { ok: false, reason: 'REJECTED' }
  } catch (err) {
    console.error(
      '[turnstile] siteverify unreachable, letting this sign-up through unchecked:',
      controller.signal.aborted ? 'timeout' : (err as Error)?.name ?? 'Error'
    )
    return { ok: true, checked: false }
  } finally {
    clearTimeout(timer)
  }
}
