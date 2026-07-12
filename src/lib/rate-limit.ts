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
// runtime and tunable in Vercel without a rebuild). Defaults are conservative
// against the ~10-15 RPM shared free-tier ceiling: the global cap sits below it
// so we 429 locally before Google does, and the per-user cap sits below the
// global so one user cannot starve paying subscribers.

const DEFAULTS = {
  userRpm: 4,
  userRpd: 100,
  globalRpm: 8,
  globalRpd: 1200,
} as const

/** Parse a positive integer env var, falling back to `dflt` on missing/invalid. */
function envInt(value: string | undefined, dflt: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : dflt
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
      p_user_rpm: envInt(process.env.RATE_LIMIT_USER_RPM, DEFAULTS.userRpm),
      p_user_rpd: envInt(process.env.RATE_LIMIT_USER_RPD, DEFAULTS.userRpd),
      p_global_rpm: envInt(process.env.RATE_LIMIT_GLOBAL_RPM, DEFAULTS.globalRpm),
      p_global_rpd: envInt(process.env.RATE_LIMIT_GLOBAL_RPD, DEFAULTS.globalRpd),
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
