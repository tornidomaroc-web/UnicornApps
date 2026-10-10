import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import WelcomeClient from './WelcomeClient'

/**
 * Where an account that was made outside our server (a Google sign-in) lands
 * before the dashboard: it claims its free credits here (actions.ts). Also
 * the one screen that tells a user their Google sign-in was joined to a
 * password account and the password was rotated (`?notice=linked`).
 *
 * Server side: no session goes to /login, an account that already holds its
 * credits goes straight to the dashboard. Data only; every string is in
 * WelcomeClient, for the reason dashboard/page.tsx gives.
 */
export default async function WelcomePage({ searchParams }: { searchParams: { notice?: string | string[] } }) {
  const supabase = createClient()
  if (!supabase) redirect('/login?error=config_error')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Own row, readable through the "view own profile" policy.
  const { data: profile } = await supabase
    .from('profiles')
    .select('free_credits_claimed_at')
    .eq('id', user.id)
    .maybeSingle()
  const claimed = Boolean(profile?.free_credits_claimed_at)

  const raw = Array.isArray(searchParams.notice) ? searchParams.notice[0] : searchParams.notice
  const notice = raw === 'linked' ? 'linked' : null
  if (claimed && !notice) redirect('/dashboard')

  return <WelcomeClient claimed={claimed} notice={notice} />
}
