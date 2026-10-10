'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminAuthClient } from '@/lib/supabase/admin'
import { recordSignupOutcome } from '@/lib/signup-ledger'
import { runSignupGuards } from '@/lib/signup-guards'
import { isServerSignupHookRefusal } from '@/lib/signup-hook'
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
  // Every outcome past the field checks is recorded (lib/signup-ledger.ts), so
  // a broken sign-up is visible after Vercel's logs are gone. The ledger holds
  // codes only, never the address; a failed write never blocks the sign-up.
  const supabase = createClient()
  if (!supabase) {
    await recordSignupOutcome({ outcome: 'no_supabase_client' })
    return { code: 'config_error' }
  }

  // Not recorded: the browser already enforces both, so a hit here is a script,
  // and a script must not be able to fill the ledger with empty posts.
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  if (!email || !password) return { code: 'missing_fields' }
  if (password.length < 6) return { code: 'weak_password' }

  // FREE CREDITS ARE HANDED OUT HERE, so this path is guarded: Turnstile, then
  // the per-network cap (lib/signup-guards.ts, shared with the welcome claim
  // that a Google-made account goes through); only then is an account made.
  const guards = await runSignupGuards(formData, headers(), 'email')
  if (!guards.ok) return { code: guards.code }
  const checks = { ...guards.checks, method: 'email' as const }

  // The account is created by the server with the admin API. Supabase's
  // before-user-created hook refuses email sign-ups made at the PUBLIC
  // endpoint, so the anon key cannot create accounts around the checks above;
  // the admin API does not run that hook, which is why this path works whether
  // the hook is on or off. OAuth (Google, Apple) sign-ups pass the hook and are
  // born with 0 credits instead (handle_new_user); they claim them on /welcome.
  //
  // Missing service credentials cannot be recorded: the ledger needs them too.
  const admin = createAdminAuthClient()
  if (!admin) return { code: 'config_error' }

  let created
  try {
    // email_confirm: confirmation is off for this project, so a new account is
    // usable at once, exactly as public sign-up made it before.
    created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  } catch (e) {
    await recordSignupOutcome({ outcome: 'create_failed', detail: 'server_unreachable', ...checks })
    return unreachable(e)
  }
  if (created.error) {
    // Should the hook ever run for the admin API too, every sign-up would end
    // here with the hook's own sentence. Recorded under its own name so the
    // health check names the cause, and shown as what it is: our fault.
    if (isServerSignupHookRefusal(created.error)) {
      console.error('[auth] the before-user-created hook refused the server: sign-up unavailable')
      await recordSignupOutcome({ outcome: 'hook_refused_server', ...checks })
      return { code: 'config_error' }
    }
    const result = fail(created.error)
    await recordSignupOutcome({ outcome: 'create_failed', detail: created.error.code ?? result.code, ...checks })
    return result
  }

  let session
  try {
    session = await supabase.auth.signInWithPassword({ email, password })
  } catch (e) {
    await recordSignupOutcome({ outcome: 'signin_failed', detail: 'server_unreachable', ...checks })
    return unreachable(e)
  }
  if (session.error) {
    const result = fail(session.error)
    await recordSignupOutcome({ outcome: 'signin_failed', detail: session.error.code ?? result.code, ...checks })
    return result
  }

  await recordSignupOutcome({ outcome: 'created', ...checks })
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
