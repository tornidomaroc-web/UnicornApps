import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AccountClient from './AccountClient'

export const metadata = {
  title: 'Account | UnicornApps',
  description: 'Manage your UnicornApps account.',
}

export default async function AccountPage() {
  const supabase = createClient()
  if (!supabase) redirect('/login')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <AccountClient email={user.email ?? ''} />
}
