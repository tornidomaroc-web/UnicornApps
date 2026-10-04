import { createHash } from 'crypto'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Per-network cap on NEW ACCOUNTS, the second layer behind Turnstile.
//
// Turnstile stops scripts; this stops a person solving the widget by hand,
// account after account, to collect the free credits. The limits are loose on
// purpose: phone networks in this app's markets put many real people behind
// one address (carrier NAT), so a tight cap would turn away real sign-ups.
//
// The address is the one Vercel saw on the request (x-real-ip, then the first
// x-forwarded-for hop; Vercel sets both itself). Only a SHA-256 of it reaches
// the database, inside a counter that rolls over with its time window.
//
// Fails OPEN, like the generation limiter: a fault here must never block a
// real sign-up. Turnstile has already run, and the Gemini spend cap bounds the
// rest.

const DEFAULTS = { perHour: 5, perDay: 10 } as const

export type SignupLimitOutcome =
  | { allowed: true; checked: boolean }
  | { allowed: false; window: 'hour' | 'day' }

function envInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** The client address as Vercel reports it, or null when there is none (local dev). */
export function clientIp(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first || null
}

/** What is stored instead of the address. */
export function networkKey(ip: string): string {
  return createHash('sha256').update(`signup-network:${ip}`).digest('hex').slice(0, 32)
}

export async function checkSignupLimit(ip: string | null): Promise<SignupLimitOutcome> {
  if (!ip) return { allowed: true, checked: false }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[signup-limit] Supabase service credentials missing: not limiting')
    return { allowed: true, checked: false }
  }

  try {
    const admin = createAdminClient(url, serviceKey, { auth: { persistSession: false } })
    const { data, error } = await admin.rpc('check_signup_limit', {
      p_network: networkKey(ip),
      p_per_hour: envInt(process.env.SIGNUP_LIMIT_PER_HOUR, DEFAULTS.perHour),
      p_per_day: envInt(process.env.SIGNUP_LIMIT_PER_DAY, DEFAULTS.perDay),
    })
    if (error) {
      console.error('[signup-limit] check failed, not limiting:', error.message)
      return { allowed: true, checked: false }
    }
    if (data === 'hour' || data === 'day') return { allowed: false, window: data }
    return { allowed: true, checked: true }
  } catch (err) {
    console.error('[signup-limit] check threw, not limiting:', (err as Error)?.message)
    return { allowed: true, checked: false }
  }
}
