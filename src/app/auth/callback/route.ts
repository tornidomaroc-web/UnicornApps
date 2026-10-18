import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminAuthClient } from '@/lib/supabase/admin'
import { callbackErrorCode, safeNextPath, type AuthErrorCode } from '@/lib/auth-errors'
import { LINK_SECURED_KEY, randomPassword, unsecuredLinkedProvider } from '@/lib/oauth-link'
import { recordSignupOutcome } from '@/lib/signup-ledger'

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
 *
 * After a successful exchange, two decisions that only this hop can make:
 *   1. a social identity newly joined to a password account gets the password
 *      rotated and the other sessions signed out (lib/oauth-link.ts says why);
 *   2. an account that has not claimed its free credits goes to /welcome.
 * Both read the user Supabase just handed back; nothing comes from the URL.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = safeNextPath(searchParams.get('next'))
  const isReset = next.startsWith('/update-password')
  const go = (path: string) => NextResponse.redirect(new URL(path, origin))

  const toLogin = (code: AuthErrorCode) => {
    // A reset link that fails for a session reason is, to the user, a link
    // that no longer works: offer a new one rather than "sign in again".
    const shown = isReset && code === 'session_expired' ? 'link_expired' : code
    return go(`/login?error=${shown}`)
  }

  const error = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  if (error || errorCode) return toLogin(callbackErrorCode({ error, error_code: errorCode }))

  const code = searchParams.get('code')
  if (!code) return toLogin('oauth_failed')

  const supabase = createClient()
  if (!supabase) return toLogin('config_error')

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    console.error('[auth/callback] code exchange failed:', exchangeError.code ?? exchangeError.message)
    return toLogin(callbackErrorCode({ error_code: exchangeError.code ?? null }))
  }

  // A reset link has one job; the user is an email account that holds its credits.
  const user = data?.user ?? null
  if (isReset || !user) return go(next)

  const linked = unsecuredLinkedProvider(user)
  if (linked) {
    const admin = createAdminAuthClient()
    const secured = admin
      ? await admin.auth.admin.updateUserById(user.id, {
          password: randomPassword(),
          app_metadata: { ...user.app_metadata, [LINK_SECURED_KEY]: new Date().toISOString() },
        })
      : null
    if (!secured || secured.error) {
      // Not secured: the user still gets in, this is logged, and the next
      // sign-in tries again (the marker was not written).
      console.error('[auth/callback] could not secure the linked account:', secured?.error?.code ?? 'no admin client')
    } else {
      await supabase.auth.signOut({ scope: 'others' })
      await recordSignupOutcome({ outcome: 'linked', method: linked })
      return go('/welcome?notice=linked')
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('free_credits_claimed_at')
    .eq('id', user.id)
    .maybeSingle()
  if (profile && profile.free_credits_claimed_at === null) return go('/welcome')

  return go(next)
}
