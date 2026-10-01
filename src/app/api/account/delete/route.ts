import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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
