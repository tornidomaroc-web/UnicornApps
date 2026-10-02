import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cancelSubscriptionNow, isBillable } from '@/lib/paddle-cancel'

// POST /api/account/delete
// Permanently deletes the signed-in user's account.
// Required by Google Play's account-deletion policy for apps with user accounts.
//
// Failures answer with a `code` and no prose: a route cannot translate, and the
// account screen picks its translated sentence from the status alone.
export async function POST() {
  const supabase = createServerClient()
  if (!supabase) {
    return NextResponse.json({ code: 'CONFIG' }, { status: 500 })
  }

  // Identify the caller from their session cookie.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Account deletion error: Supabase service credentials missing')
    return NextResponse.json({ code: 'CONFIG' }, { status: 500 })
  }

  const admin = createAdminClient(supabaseUrl, serviceRoleKey)

  // A subscriber is billed by Paddle, not by us: deleting the profile alone
  // would leave the card being charged for an account that no longer exists.
  // So a subscription that may still bill is canceled, effective at once,
  // BEFORE anything is deleted. If that cannot be done (no API key, Paddle
  // down or slow, Paddle refusing) the account is NOT deleted: a retry can
  // still cancel, while a deleted account would leave an orphaned subscription
  // nobody can reach. No refund and no credit change happen here.
  //
  // A user with no subscription (every Android user) never reaches Paddle.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('subscription_id, subscription_status')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    // Without the row we cannot know whether a subscription is still billing.
    console.error('Account deletion failed reading the profile:', profileError.message)
    return NextResponse.json({ code: 'DELETE_FAILED' }, { status: 500 })
  }

  if (isBillable(profile)) {
    const cancel = await cancelSubscriptionNow(profile.subscription_id)
    if (!cancel.ok) {
      // 409: the account is in a state (a live subscription) that blocks the
      // delete. A status of its own, because the account screen picks its
      // sentence from the status alone.
      console.error(`Account deletion refused: subscription not canceled (${cancel.reason})`)
      return NextResponse.json({ code: 'SUBSCRIPTION_CANCEL_FAILED' }, { status: 409 })
    }
  }

  // Deleting the auth user cascades to `profiles` and `generations`
  // (both declared `REFERENCES auth.users ON DELETE CASCADE` in supabase_schema.sql).
  // `purchases` and `usage_events` rows are kept with their user reference set
  // to NULL (`ON DELETE SET NULL`), which is what the public deletion page says.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)

  if (deleteError) {
    console.error('Account deletion failed:', deleteError.message)
    return NextResponse.json({ code: 'DELETE_FAILED' }, { status: 500 })
  }

  // Clear the local session.
  await supabase.auth.signOut()

  return NextResponse.json({ success: true }, { status: 200 })
}
