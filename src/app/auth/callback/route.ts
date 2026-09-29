import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callbackErrorCode, safeNextPath, type AuthErrorCode } from '@/lib/auth-errors'

/**
 * Where OAuth sign-ins and PKCE email links come back to: exchange the code for
 * a session, then go to `next`.
 *
 * Failures go to /login with ONE code from a fixed list (see auth-errors.ts):
 * never the provider's `error_description`, never an exception message.
 * `next` is reduced to a same-site path before anything else reads it.
 *
 * Password-reset emails sent with the default template still land here as
 * `?code=…&next=/update-password`, so this path must keep working after the
 * token_hash route (/auth/confirm) exists: both are live at once.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = safeNextPath(searchParams.get('next'))
  const isReset = next.startsWith('/update-password')

  const toLogin = (code: AuthErrorCode) => {
    // A reset link that fails for a session reason is, to the user, a link
    // that no longer works: offer a new one rather than "sign in again".
    const shown = isReset && code === 'session_expired' ? 'link_expired' : code
    return NextResponse.redirect(new URL(`/login?error=${shown}`, origin))
  }

  const error = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  if (error || errorCode) return toLogin(callbackErrorCode({ error, error_code: errorCode }))

  const code = searchParams.get('code')
  if (!code) return toLogin('oauth_failed')

  const supabase = createClient()
  if (!supabase) return toLogin('config_error')

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('[auth/callback] code exchange failed:', exchangeError.code ?? exchangeError.message)
    return toLogin(callbackErrorCode({ error_code: exchangeError.code ?? null }))
  }

  return NextResponse.redirect(new URL(next, origin))
}
