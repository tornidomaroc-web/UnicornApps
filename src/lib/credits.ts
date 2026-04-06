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
