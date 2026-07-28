import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { isNativeRequest } from '@/lib/native-request'

export default async function DashboardPage() {
  let credits = 0
  let history: any[] = []
  let mustRedirect = false
  let userId = ''

  try {
    const supabase = createClient()

    if (!supabase) {
      console.error('SERVER ERROR: Supabase client is null. Environment misconfigured.')
      return (
        <div className="container mx-auto py-20 px-4 text-center">
          <h1 className="text-3xl font-bold text-red-500">Service Configuration Error</h1>
          <p className="mt-4 text-zinc-500">The application is missing critical environment variables. Check Vercel settings.</p>
        </div>
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      mustRedirect = true
    } else {
      userId = user.id
      // Fetch user credit count
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Error fetching profile:', profileError)
      } else {
        credits = profile?.credits ?? 0
      }

      // Fetch recent generations
      const { data: generations, error: genError } = await supabase
        .from('generations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (genError) {
        console.error('Error fetching generations:', genError)
      } else {
        history = generations ?? []
      }
    }
  } catch (err) {
    console.error('Dashboard Server Error:', err)
    mustRedirect = true
  }

  if (mustRedirect) {
    redirect('/login')
  }

  // NO PRESENTATION HERE ON PURPOSE. This is a SERVER component, so it cannot
  // call useLang()/t(): the language lives in client React state
  // (LanguageContext.tsx). Anything rendered here is therefore permanently
  // English on the Arabic surface, which is exactly how the deleted header
  // ("Dashboard" / its subtitle / "Available Credits") survived. Keep this file
  // to data-fetch + prop-pass; put every visible string in DashboardClient.
  //
  // `credits` is still load-bearing: it feeds initialCredits below, which
  // DashboardClient mirrors into creditsRef and the #58 post-purchase poll reads
  // through readCredits() as its stop condition (lib/credit-refresh.ts). The
  // deleted block only ever DISPLAYED this value; it never produced it.
  return (
    <div className="container mx-auto py-10 px-4 max-w-5xl">
      <DashboardClient
        userId={userId}
        initialCredits={credits}
        initialHistory={history}
        serverIsNative={isNativeRequest()}
      />
    </div>
  )
}
