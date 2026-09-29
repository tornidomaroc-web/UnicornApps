'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath, type AuthResult } from '@/lib/auth-errors'
import { confirmErrorCode, defaultNextForType, isOtpType } from '@/lib/email-links'

/**
 * The only place a token_hash is spent. Reached by the Continue button on
 * /auth/confirm, never by loading the page: see email-links.ts for why.
 *
 * Follows Supabase's server-side auth guide for Next.js (verifyOtp with
 * token_hash and type), with two departures: the redirect is a same-site
 * path built from `next`, not a clone of the request URL, so the token does
 * not travel into the landing page; and a failure returns a CODE for the
 * screen to translate instead of bouncing to an error page.
 */
export async function verifyEmailLink(
  _prev: AuthResult | undefined,
  formData: FormData
): Promise<AuthResult | undefined> {
  const tokenHash = String(formData.get('token_hash') || '')
  const type = String(formData.get('type') || '')
  if (!tokenHash || !isOtpType(type)) return { code: 'link_expired' }

  const next = safeNextPath(formData.get('next'), defaultNextForType(type))

  const supabase = createClient()
  if (!supabase) return { code: 'config_error' }

  let result
  try {
    result = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  } catch (e) {
    console.error('[auth/confirm] backend unreachable:', (e as Error)?.message)
    return { code: 'server_unreachable' }
  }

  if (result.error) {
    console.error('[auth/confirm] verifyOtp failed:', result.error.code ?? result.error.message)
    return { code: confirmErrorCode(result.error) }
  }

  revalidatePath('/', 'layout')
  redirect(next)
}
