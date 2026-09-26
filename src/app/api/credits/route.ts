import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/credits — the signed-in user's current credit balance.
//
// Exists for ONE caller: post-purchase reconciliation (hooks/useCreditGrantPoll.ts).
// That poll used to re-read the balance with router.refresh(), which re-renders
// the whole server tree — and on this Next.js version the FIRST refresh after a
// page segment mounts REMOUNTS the segment, wiping every piece of client state
// on it (the checkout banner, the poll itself, the dashboard's generated
// results). Measured live, 2026-09-26, with a bare refresh and no other input.
// A plain fetch of the number cannot remount anything.
//
// Same RLS-scoped read the root layout and the dashboard page perform for the
// navbar counter. Error bodies carry a `code` and no prose: the caller never
// shows them, and a route's JSON `error` field is rendered verbatim elsewhere.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  if (!supabase) {
    return NextResponse.json({ code: 'SERVER_CONFIG' }, { status: 500 })
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()
  if (profileError) {
    console.error('credits: profile read failed:', profileError.message)
    return NextResponse.json({ code: 'PROFILE_READ_FAILED' }, { status: 500 })
  }

  return NextResponse.json(
    { credits: profile?.credits ?? 0 },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
