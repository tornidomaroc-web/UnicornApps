'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { checkSignupLimit, clientIp } from '@/lib/signup-limit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/turnstile'
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

  // FREE CREDITS ARE HANDED OUT HERE, so this is the one path that is guarded.
  // Order matters: Turnstile first, so a failed widget never spends the
  // network's budget; then the per-network cap; only then is an account made.
  const ip = clientIp(headers())
  const human = await verifyTurnstile(String(formData.get(TURNSTILE_FIELD) || ''), ip)
  if (!human.ok) return { code: human.reason === 'NO_SECRET' ? 'config_error' : 'captcha_failed' }

  const limit = await checkSignupLimit(ip)
  if (!limit.allowed) return { code: 'signup_limited' }

  // The account is created by the server with the admin API. Supabase's
  // before-user-created hook refuses email sign-ups made at the PUBLIC
  // endpoint, so the anon key cannot create accounts around the checks above;
  // the admin API does not run that hook, which is why this path works whether
  // the hook is on or off. OAuth (Google, Apple) sign-ups are not affected.
  const admin = adminAuthClient()
  if (!admin) return { code: 'config_error' }

  let created
  try {
    // email_confirm: confirmation is off for this project, so a new account is
    // usable at once, exactly as public sign-up made it before.
    created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  } catch (e) {
    return unreachable(e)
  }
  if (created.error) return fail(created.error)

  let session
  try {
    session = await supabase.auth.signInWithPassword({ email, password })
  } catch (e) {
    return unreachable(e)
  }
  if (session.error) return fail(session.error)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

function adminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[auth] Supabase service credentials missing: sign-up unavailable')
    return null
  }
  return createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
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
