import { createServiceClient } from '@/lib/credits'

// Free per-user + global fixed-window rate limiter (backlog item 21), backed by
// the Supabase `check_rate_limits` RPC.
//
// FAIL-OPEN BY DESIGN. This is a protective optimization, never a correctness
// gate. On ANY problem — RPC throws, table/function not yet migrated, service
// client absent, misconfigured limit — we LOG and ALLOW. A limiter fault must
// never take down generation for all users / every Android WebView client. Net
// safety holds because callers run this BEFORE reserve_credit, which still fails
// CLOSED on a missing service key, so allowing here never yields a free
// generation.
//
// Limits are read from plain server env (NOT NEXT_PUBLIC_, so they are read at
// runtime and tunable in Vercel without a rebuild).
//
// THE REAL CEILING (read off the Google AI Studio dashboard, 2026-07-12): the
// served flash-class model is capped at 5 RPM and 20 RPD on the free tier, for
// the WHOLE APP — one shared key, one quota bucket for every user. The earlier
// "~10-15 RPM" figure in this comment was a guess, and it was WRONG.
//
// WHAT THIS LIMITER DOES: makes throttling fair (per-user window), clean (a local
// 429 -> dash.aiBusy instead of Google's raw English), and credit-safe (checked
// before reserve_credit, so a throttled request never spends a credit).
//
// WHAT IT DOES NOT DO: it does NOT guarantee we stay under Google's ceiling. It
// counts REQUESTS; Google counts CALLS. Before PR 2a one request could spend up
// to 3 generateContent calls (a 3-model fallback on ANY 429/503), so a
// request-counted cap could overshoot the call quota by up to 3x — worst exactly
// when the ceiling is already being hit, since that is what triggers fallback.
// PR 2a drops the per-request call count to 1 on quota errors (no fallback on a
// key-level 429 — see classifyGeminiError) and caps it at MAX_MODEL_ATTEMPTS on
// genuine 503 overloads.
//
// SIZE THESE LIMITS AGAINST CALLS x AMPLIFICATION, NEVER AGAINST REQUEST COUNT.

// THE DEFAULT MUST BE SAFE-UNDER-CEILING, NEVER THE MOST PERMISSIVE VALUE.
//
// These are the fallback when an env var is missing, renamed, or non-numeric —
// i.e. they are what a MISCONFIGURATION degrades to. They used to be the
// pre-quota guesses (8 RPM / 1200 RPD), which is 60x over the real daily ceiling:
// one typo in Vercel silently restored the pre-limiter blowout.
//
// Sized against CALLS, not requests: one request costs at most MAX_MODEL_ATTEMPTS
// (=2) generateContent calls, so globalRpm*2 <= 5 RPM and globalRpd*2 <= 20 RPD.
// 1 and 6 clear that with margin (2 calls/min, 12 calls/day).
//
// They deliberately MIRROR the live Vercel values rather than the ceiling-maximal
// legal ones (2 / 9): a misconfiguration must never make us MORE permissive than
// the operator deliberately chose. Worst case — all four vars vanish — the app
// behaves exactly as it does today.
//
// The cost of that choice: a missing var is behaviourally INVISIBLE, so the warn
// in envInt() below is the ONLY signal that one is missing. Keep it.
const DEFAULTS = {
  userRpm: 1,
  userRpd: 5,
  globalRpm: 1,
  globalRpd: 6,
} as const

// Warn once per variable per process: enough to surface a misconfiguration in the
// logs without spamming every request on a warm, reused lambda.
const warnedFor = new Set<string>()

/**
 * Parse a positive integer env var, falling back to `dflt` on missing/invalid.
 * Falling back is not an error (fail-open by design) but it IS worth seeing, so
 * it is logged once per variable.
 */
function envInt(value: string | undefined, dflt: number, name: string): number {
  const n = Number.parseInt(value ?? '', 10)
  if (Number.isFinite(n) && n > 0) return n

  if (!warnedFor.has(name)) {
    warnedFor.add(name)
    const reason = value === undefined ? 'not set' : `not a positive integer (${value})`
    console.warn(`rate-limit: ${name} is ${reason}; using safe default ${dflt}`)
  }
  return dflt
}

export type RateLimitResult = {
  /** True = proceed. Callers must treat any non-true as a 429. */
  allowed: boolean
  /**
   * 'allowed' on success; the blocking window ('global_rpm' | 'global_rpd' |
   * 'user_rpm' | 'user_rpd') when throttled; or a fail-open reason
   * ('no_service_client' | 'rpc_error' | 'exception') when the limiter itself
   * could not run (allowed stays true in those cases).
   */
  scope: string
}

/**
 * Check + increment the caller's rate-limit windows. Returns `{ allowed:false }`
 * ONLY when the RPC positively reports a throttle; every failure path returns
 * `{ allowed:true }` (fail-open).
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  try {
    const service = createServiceClient()
    if (!service) {
      // No service key -> cannot enforce (reserve_credit will fail closed later).
      console.warn('rate-limit: no service client; allowing (fail-open)')
      return { allowed: true, scope: 'no_service_client' }
    }

    const { data, error } = await service.rpc('check_rate_limits', {
      p_user_id: userId,
      p_user_rpm: envInt(process.env.RATE_LIMIT_USER_RPM, DEFAULTS.userRpm, 'RATE_LIMIT_USER_RPM'),
      p_user_rpd: envInt(process.env.RATE_LIMIT_USER_RPD, DEFAULTS.userRpd, 'RATE_LIMIT_USER_RPD'),
      p_global_rpm: envInt(process.env.RATE_LIMIT_GLOBAL_RPM, DEFAULTS.globalRpm, 'RATE_LIMIT_GLOBAL_RPM'),
      p_global_rpd: envInt(process.env.RATE_LIMIT_GLOBAL_RPD, DEFAULTS.globalRpd, 'RATE_LIMIT_GLOBAL_RPD'),
    })

    if (error) {
      console.error('rate-limit: RPC error, allowing (fail-open):', error.message)
      return { allowed: true, scope: 'rpc_error' }
    }

    const scope = typeof data === 'string' ? data : 'allowed'
    if (scope !== 'allowed') {
      console.warn(`rate-limit: throttled user ${userId} (${scope})`)
    }
    return { allowed: scope === 'allowed', scope }
  } catch (e: any) {
    console.error('rate-limit: unexpected error, allowing (fail-open):', e?.message)
    return { allowed: true, scope: 'exception' }
  }
}
