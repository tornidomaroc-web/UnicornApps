import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Credit cost per AI action. Credits are stored as INTEGER in profiles, so
// the smallest non-free cost is 1. Tune here, not in the route handlers.
export const GENERATE_CREDIT_COST = 1
export const REFINE_CREDIT_COST = 1

// Service-role client for credit mutations. Deductions must not depend on
// the permissive "users can update own profile" RLS policy (which should be
// tightened — see supabase_schema.sql notes), so they run with the service
// key like the Paddle webhook does.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createSupabaseClient(url, key)
}

// Compare-and-swap deduction: the UPDATE only applies if the balance still
// has the value we just read, so concurrent calls can never write a stale
// balance (the plain read-modify-write this replaces could charge once for
// two parallel calls). Returns false when the balance is below `amount`.
export async function tryDeductCredits(
  supabase: any,
  userId: string,
  amount: number
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()
    if (!profile || (profile.credits ?? 0) < amount) return false

    const { data: updated } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - amount })
      .eq('id', userId)
      .eq('credits', profile.credits)
      .select('credits')
    if (updated && updated.length > 0) return true
    // Balance changed under us — re-read and retry.
  }
  return false
}

export async function addCredits(supabase: any, userId: string, amount: number): Promise<void> {
  const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single()
  if (profile) {
    const newCredits = Math.max(0, (profile.credits || 0) + amount)
    await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId)
  }
}

export async function deductCredits(supabase: any, userId: string, amount: number): Promise<void> {
  const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single()
  if (profile) {
    const newCredits = Math.max(0, (profile.credits || 0) - amount)
    await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId)
  }
}
