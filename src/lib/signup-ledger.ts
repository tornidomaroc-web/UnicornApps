import { createClient as createAdminClient } from '@supabase/supabase-js'

// One row per sign-up attempt that reached the guards, so a broken sign-up
// leaves a trace that outlives Vercel's hour of logs, and the scheduled health
// check (.github/workflows/signup-health.yml, SQL function `signup_health`)
// can tell "nobody is signing up" from "everybody is being refused".
//
// NOTHING PERSONAL GOES IN: an outcome code and a machine code. The table's
// CHECK constraints refuse anything else, and `detailCode` filters here too,
// so a sentence or an address never even reaches the wire.
//
// FAILS OPEN, like every other guard: a dead ledger must never block a
// sign-up. The write is awaited (a Vercel function may be frozen the moment it
// answers, so fire-and-forget can be lost) but bounded by LEDGER_TIMEOUT_MS.

/** Mirrors the CHECK constraint on signup_outcomes.outcome; a typo fails loudly in both places. */
export const SIGNUP_OUTCOMES = [
  'created',
  'no_supabase_client',
  'no_turnstile_secret',
  'captcha_no_token',
  'captcha_rejected',
  'signup_limited',
  'hook_refused_server',
  'create_failed',
  'signin_failed',
  // The welcome claim (an account Google made, claiming its free credits) and
  // the identity-link guard; see migrations/2026-10-10_add_free_credit_claim.sql.
  'claimed',
  'claim_failed',
  'linked',
] as const
export type SignupOutcome = (typeof SIGNUP_OUTCOMES)[number]

/** Which path the attempt came through. Mirrors the CHECK on signup_outcomes.method. */
export const SIGNUP_METHODS = ['email', 'google', 'apple'] as const
export type SignupMethod = (typeof SIGNUP_METHODS)[number]

/** Upper bound for the write; a sign-up is never slowed by more than this. */
export const LEDGER_TIMEOUT_MS = 1500

/** Same shape the database enforces on `detail`. */
const DETAIL = /^[a-z0-9_:,.-]{1,120}$/

export type SignupRecord = {
  outcome: SignupOutcome
  /** A machine code (Supabase error code, Turnstile error codes, limiter window). Never a message. */
  detail?: string | null
  /** false = Cloudflare was unreachable and the attempt went through unchecked. */
  turnstileChecked?: boolean | null
  limitChecked?: boolean | null
  /** The sign-up path; the email form when absent. */
  method?: SignupMethod
}

/**
 * A value fit for `detail`, or null. Deliberately strict rather than a
 * sanitiser: it accepts a code that already has the shape and refuses
 * everything else, so a message with a space or an address with an `@` is
 * dropped whole instead of being squeezed into something that still carries it.
 */
export function detailCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  return DETAIL.test(s) ? s : null
}

/** Several codes as one `detail`, each one checked, the bad ones dropped. */
export function joinCodes(codes: readonly unknown[]): string | null {
  const kept = codes.map(c => (typeof c === 'string' ? c.trim().toLowerCase() : '')).filter(c => /^[a-z0-9_.-]{1,40}$/.test(c))
  return kept.length ? detailCode(kept.join(',')) : null
}

/** Records one attempt. Resolves true when the row is in; never throws. */
export async function recordSignupOutcome(r: SignupRecord, timeoutMs: number = LEDGER_TIMEOUT_MS): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[signup-ledger] service credentials missing, not recorded:', r.outcome)
    return false
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await admin
      .from('signup_outcomes')
      .insert({
        outcome: r.outcome,
        detail: detailCode(r.detail),
        turnstile_checked: r.turnstileChecked ?? null,
        limit_checked: r.limitChecked ?? null,
        method: r.method ?? 'email',
      })
      .abortSignal(controller.signal)
    if (error) {
      console.error('[signup-ledger] not recorded:', r.outcome, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error(
      '[signup-ledger] not recorded:',
      r.outcome,
      controller.signal.aborted ? 'timeout' : (err as Error)?.name ?? 'Error'
    )
    return false
  } finally {
    clearTimeout(timer)
  }
}
