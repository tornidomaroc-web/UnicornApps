import type { EmailOtpType } from '@supabase/supabase-js'
import { callbackErrorCode, type AuthErrorCode } from './auth-errors'

/** Re-exported so the confirm screen needs no import from the SDK at all. */
export type { EmailOtpType }

/**
 * The shape of an email link that lands on /auth/confirm, and what happens
 * to it there. Pure and React-free, so it is unit-tested in node.
 *
 * WHY THE LINK IS NOT SPENT ON ARRIVAL. Mail security tools open links
 * before the reader does (Supabase's templates guide calls this out). A
 * token_hash is one-shot: whoever verifies it first gets the session, and
 * everyone after sees "link expired". So GET /auth/confirm only draws a
 * Continue button; the token is verified by the POST that button sends,
 * which a link prefetcher never issues.
 */

export const OTP_TYPES: readonly EmailOtpType[] = ['recovery', 'email', 'signup', 'invite', 'magiclink', 'email_change']

export const isOtpType = (v: unknown): v is EmailOtpType =>
  typeof v === 'string' && (OTP_TYPES as readonly string[]).includes(v)

/** Where a verified link goes when the email named no `next`. */
export const defaultNextForType = (type: EmailOtpType): string =>
  type === 'recovery' ? '/update-password' : '/dashboard'

/**
 * A verifyOtp failure, as the user should read it: an email link that fails
 * is a link that no longer works, except when Supabase is rate-limiting.
 */
export const confirmErrorCode = (error: { code?: string | null } | null | undefined): AuthErrorCode =>
  callbackErrorCode({ error_code: error?.code ?? null }) === 'rate_limited' ? 'rate_limited' : 'link_expired'

/** The query a template must produce, so the test and the template agree on one string. */
export const CONFIRM_ORIGIN = 'https://www.unicornapps.app'
export const confirmLink = (type: EmailOtpType, next: string) =>
  `${CONFIRM_ORIGIN}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`
