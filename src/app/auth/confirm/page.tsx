import { redirect } from 'next/navigation'
import { isOtpType } from '@/lib/email-links'
import { ConfirmForm } from './ConfirmForm'

/**
 * Where every email link lands. This page verifies NOTHING: it checks the
 * link has the two parts a token needs and draws a Continue button. The
 * token is spent only by the POST that button sends (actions.ts), so a mail
 * scanner that opens the link ahead of the reader leaves it intact.
 *
 * No Supabase import belongs in this file; a test pins that.
 */
export default function ConfirmPage({
  searchParams,
}: {
  searchParams: { token_hash?: string | string[]; type?: string | string[]; next?: string | string[] }
}) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  const tokenHash = one(searchParams.token_hash)
  const type = one(searchParams.type)

  if (!tokenHash || !isOtpType(type)) redirect('/login?error=link_expired')

  return <ConfirmForm tokenHash={tokenHash} type={type} next={one(searchParams.next)} />
}
