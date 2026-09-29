'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { mapSupabaseAuthError, type AuthResult } from '@/lib/auth-errors'
import { AUTH_PROVIDERS, isSocialProvider } from '@/lib/auth-providers'
import { isNativeRequest } from '@/lib/native-request'

export type { AuthResult } from '@/lib/auth-errors'

/**
 * Every result is a CODE (see auth-errors.ts) that the screen maps to
 * translated copy. The raw Supabase message is logged on the server for an
 * unmapped error and never returned: it is English, and it is not ours.
 */

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

function fail(error: { message?: string; code?: string } | null | undefined): AuthResult {
  const code = mapSupabaseAuthError(error?.message, error?.code)
  if (code === 'unknown') console.error('[auth] unmapped error:', error?.code ?? '', error?.message ?? '')
  return { code }
}

function unreachable(e: unknown): AuthResult {
  console.error('[auth] backend unreachable:', (e as Error)?.message)
  return { code: 'server_unreachable' }
}

export async function login(
  _prev: AuthResult | undefined,
  formData: FormData
): Promise<AuthResult | undefined> {
  const supabase = createClient()
  if (!supabase) return { code: 'config_error' }

  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  if (!email || !password) return { code: 'missing_fields' }

  let result
  try {
    result = await supabase.auth.signInWithPassword({ email, password })
  } catch (e) {
    // A dead/unreachable backend throws here rather than returning an error.
    return unreachable(e)
  }

  if (result.error) return fail(result.error)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(
  _prev: AuthResult | undefined,
  formData: FormData
): Promise<AuthResult | undefined> {
  const supabase = createClient()
  if (!supabase) return { code: 'config_error' }

  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  if (!email || !password) return { code: 'missing_fields' }
  if (password.length < 6) return { code: 'weak_password' }

  let result
  try {
    result = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    })
  } catch (e) {
    return unreachable(e)
  }

  if (result.error) return fail(result.error)

  // When "Confirm email" is enabled, signUp succeeds but returns no session.
  // Tell the user to check their inbox instead of bouncing them to /dashboard
  // (where middleware would silently kick them back to /login).
  if (!result.data.session) return { code: 'check_email' }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function requestPasswordReset(
  _prev: AuthResult | undefined,
  formData: FormData
): Promise<AuthResult | undefined> {
  const supabase = createClient()
  if (!supabase) return { code: 'config_error' }

  const email = String(formData.get('email') || '').trim()
  if (!email) return { code: 'missing_fields' }

  let result
  try {
    // redirectTo stays on /auth/callback: it is what the CURRENT email
    // template sends people to. Once the template links to /auth/confirm with
    // a token_hash, the template decides the target and this value is unused.
    result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/update-password`,
    })
  } catch (e) {
    return unreachable(e)
  }

  if (result.error) return fail(result.error)
  // Always report success-shaped copy to avoid leaking which emails exist.
  return { code: 'reset_sent' }
}

export async function updatePassword(
  _prev: AuthResult | undefined,
  formData: FormData
): Promise<AuthResult | undefined> {
  const supabase = createClient()
  if (!supabase) return { code: 'config_error' }

  const password = String(formData.get('password') || '')
  if (password.length < 6) return { code: 'weak_password' }

  let result
  try {
    result = await supabase.auth.updateUser({ password })
  } catch (e) {
    return unreachable(e)
  }

  if (result.error) return fail(result.error)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function logout() {
  const supabase = createClient()
  if (!supabase) return redirect('/login?error=config_error')
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/**
 * Start an OAuth sign-in. Refused, before any provider is contacted, when the
 * provider is not switched on in AUTH_PROVIDERS or the request comes from the
 * native app: a hidden button is not a disabled one, and the action is
 * reachable without the button.
 */
export async function signInWithProvider(provider: unknown) {
  if (!isSocialProvider(provider) || !AUTH_PROVIDERS[provider] || isNativeRequest()) {
    redirect('/login?error=oauth_failed')
  }
  const supabase = createClient()
  if (!supabase) return redirect('/login?error=config_error')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${siteUrl()}/auth/callback` },
  })

  if (error || !data?.url) {
    console.error('[auth] OAuth start failed:', provider, error?.code ?? error?.message ?? 'no url')
    redirect('/login?error=oauth_failed')
  }

  redirect(data.url)
}
