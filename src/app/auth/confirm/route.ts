import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callbackErrorCode, safeNextPath } from '@/lib/auth-errors'

/**
 * Email links in the token_hash form, verified with `verifyOtp`: Supabase's
 * documented route for server-side auth with PKCE.
 *
 * WHY THIS EXISTS BESIDE /auth/callback. A PKCE code can only be exchanged by
 * the browser that asked for it, because the verifier lives in that browser's
 * cookie. A reset requested inside the Android app is opened from the mail app
 * in Chrome, which has no verifier, so /auth/callback can never finish it. A
 * token_hash needs no verifier: it works in whichever browser opens the link.
 *
 * It is reached only once the email template links here
 * (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password`).
 * Until then it is inert, and /auth/callback keeps serving the links already
 * in people's inboxes.
 *
 * Two departures from the guide's sample, both deliberate:
 * - The redirect is a NEW URL built from `next`, not a clone of this request.
 *   A clone keeps `token_hash` in the query string of the page it lands on,
 *   in history and in any Referer it sends.
 * - `type` is checked against the real set, not cast, and `next` must be a
 *   same-site path.
 */
const OTP_TYPES: readonly EmailOtpType[] = ['recovery', 'email', 'signup', 'invite', 'magiclink', 'email_change']

const isOtpType = (v: string | null): v is EmailOtpType =>
  v !== null && (OTP_TYPES as readonly string[]).includes(v)

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = safeNextPath(searchParams.get('next'), type === 'recovery' ? '/update-password' : '/dashboard')

  const toLogin = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, origin))

  if (!tokenHash || !isOtpType(type)) return toLogin('link_expired')

  const supabase = createClient()
  if (!supabase) return toLogin('config_error')

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    console.error('[auth/confirm] verifyOtp failed:', error.code ?? error.message)
    // An email link that fails is, to the user, a link that no longer works.
    return toLogin(callbackErrorCode({ error_code: error.code ?? null }) === 'rate_limited' ? 'rate_limited' : 'link_expired')
  }

  return NextResponse.redirect(new URL(next, origin))
}
