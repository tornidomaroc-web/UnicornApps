import { joinCodes, recordSignupOutcome, type SignupMethod } from '@/lib/signup-ledger'
import { checkSignupLimit, clientIp } from '@/lib/signup-limit'
import { TURNSTILE_FIELD, verifyTurnstile } from '@/lib/turnstile'
import type { AuthErrorCode } from '@/lib/auth-errors'

// The checks that stand in front of FREE CREDITS, in the one order that holds:
// Turnstile first, so a failed widget never spends the network's budget; then
// the per-network cap. Two paths run them with the same code and the same
// counters: the email sign-up (login/actions.ts), where the account is made
// afterwards, and the welcome claim (welcome/actions.ts), where the account
// already exists (Google made it) and only the credits are at stake. One
// network therefore gets ONE budget of new accounts a day, however they came.
//
// Each refusal is recorded in the ledger here; the caller records the rest.

export type GuardsPassed = {
  ok: true
  /** What the ledger row of the final outcome should carry. */
  checks: { turnstileChecked: boolean; limitChecked: boolean }
}
export type GuardsFailed = { ok: false; code: AuthErrorCode }

export async function runSignupGuards(
  formData: FormData,
  headers: Headers,
  method: SignupMethod
): Promise<GuardsPassed | GuardsFailed> {
  const ip = clientIp(headers)
  const human = await verifyTurnstile(String(formData.get(TURNSTILE_FIELD) || ''), ip)
  if (!human.ok) {
    if (human.reason === 'NO_SECRET') {
      await recordSignupOutcome({ outcome: 'no_turnstile_secret', method })
      return { ok: false, code: 'config_error' }
    }
    await recordSignupOutcome(
      human.reason === 'NO_TOKEN'
        ? { outcome: 'captcha_no_token', method }
        : { outcome: 'captcha_rejected', detail: joinCodes(human.codes), turnstileChecked: true, method }
    )
    return { ok: false, code: 'captcha_failed' }
  }

  const limit = await checkSignupLimit(ip)
  if (!limit.allowed) {
    await recordSignupOutcome({ outcome: 'signup_limited', detail: limit.window, turnstileChecked: human.checked, method })
    return { ok: false, code: 'signup_limited' }
  }

  return { ok: true, checks: { turnstileChecked: human.checked, limitChecked: limit.checked } }
}
