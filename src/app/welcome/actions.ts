'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminAuthClient } from '@/lib/supabase/admin'
import { runSignupGuards } from '@/lib/signup-guards'
import { detailCode, recordSignupOutcome } from '@/lib/signup-ledger'
import { signupMethodOf } from '@/lib/oauth-link'
import type { AuthResult } from '@/lib/auth-errors'

/**
 * The welcome claim: an account that Supabase created outside our server (a
 * Google sign-in) collects its 3 free credits here, and nowhere else.
 *
 * Same guards, same order, same counters as the email sign-up: Turnstile,
 * then the per-network cap, then the ledger. The grant itself is the
 * row-locked `claim_free_credits` RPC, callable by the service role only, so
 * a script holding the anon key cannot reach it, and a double submit cannot
 * pay twice. Every result is a code the screen translates; nothing from
 * Supabase is shown.
 */
export async function claimFreeCredits(
  _prev: AuthResult | undefined,
  formData: FormData
): Promise<AuthResult | undefined> {
  const supabase = createClient()
  if (!supabase) {
    await recordSignupOutcome({ outcome: 'no_supabase_client' })
    return { code: 'config_error' }
  }

  let user
  try {
    user = (await supabase.auth.getUser()).data.user
  } catch (e) {
    console.error('[welcome] backend unreachable:', (e as Error)?.message)
    return { code: 'server_unreachable' }
  }
  if (!user) redirect('/login')
  const method = signupMethodOf(user)

  const guards = await runSignupGuards(formData, headers(), method)
  if (!guards.ok) return { code: guards.code }
  const checks = { ...guards.checks, method }

  const admin = createAdminAuthClient()
  if (!admin) return { code: 'config_error' }

  let granted
  try {
    granted = await admin.rpc('claim_free_credits', { p_user_id: user.id })
  } catch (e) {
    console.error('[welcome] claim unreachable:', (e as Error)?.message)
    await recordSignupOutcome({ outcome: 'claim_failed', detail: 'server_unreachable', ...checks })
    return { code: 'server_unreachable' }
  }
  if (granted.error) {
    console.error('[welcome] claim failed:', granted.error.code ?? granted.error.message)
    await recordSignupOutcome({ outcome: 'claim_failed', detail: detailCode(granted.error.code) ?? 'rpc_error', ...checks })
    return { code: 'config_error' }
  }

  if (granted.data === 'claimed') {
    await recordSignupOutcome({ outcome: 'claimed', ...checks })
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  }
  if (granted.data === 'already_claimed') {
    // A double submit, or a second tab: the credits are there, go and use them.
    await recordSignupOutcome({ outcome: 'claim_failed', detail: 'already_claimed', ...checks })
    revalidatePath('/', 'layout')
    redirect('/dashboard')
  }
  // 'no_profile' or anything new: the row the trigger should have made is
  // missing. Our fault, recorded under its own name.
  await recordSignupOutcome({ outcome: 'claim_failed', detail: detailCode(granted.data) ?? 'unexpected', ...checks })
  return { code: 'config_error' }
}
