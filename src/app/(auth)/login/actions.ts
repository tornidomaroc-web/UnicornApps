'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Result returned by the email/password + reset actions.
 * `code` is a stable, language-agnostic key the client maps to translated copy
 * (see `login.err.*` / `login.msg.*` in LanguageContext). `detail` carries the
 * raw Supabase message only for the `unknown` fallback so no information is lost.
 */
export type AuthResult = { code: string; detail?: string }

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

/** Map a raw Supabase auth error into a stable, translatable code. */
function mapError(message: string): AuthResult {
  const m = (message || '').toLowerCase()
  if (m.includes('email not confirmed')) return { code: 'email_not_confirmed' }
  if (m.includes('invalid login credentials')) return { code: 'invalid_credentials' }
  if (m.includes('already registered') || m.includes('already been registered'))
    return { code: 'already_registered' }
  if (m.includes('password should be') || m.includes('at least'))
    return { code: 'weak_password' }
  if (m.includes('rate limit') || m.includes('too many') || m.includes('429'))
    return { code: 'rate_limited' }
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
    return { code: 'server_unreachable' }
  return { code: 'unknown', detail: message }
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
  } catch (e: any) {
    // A dead/unreachable backend throws here rather than returning an error.
    return { code: 'server_unreachable', detail: e?.message }
  }

  if (result.error) return mapError(result.error.message)

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
  } catch (e: any) {
    return { code: 'server_unreachable', detail: e?.message }
  }

  if (result.error) return mapError(result.error.message)

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
    result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl()}/auth/callback?next=/update-password`,
    })
  } catch (e: any) {
    return { code: 'server_unreachable', detail: e?.message }
  }

  if (result.error) return mapError(result.error.message)
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
  } catch (e: any) {
    return { code: 'server_unreachable', detail: e?.message }
  }

  if (result.error) return mapError(result.error.message)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function logout() {
  const supabase = createClient()
  if (!supabase) return redirect('/login?error=Server+Configuration+Error')
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function signInWithGoogle() {
  const supabase = createClient()
  if (!supabase) return redirect('/login?error=Server+Configuration+Error')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl()}/auth/callback`,
    },
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  if (data.url) {
    redirect(data.url)
  }
}
