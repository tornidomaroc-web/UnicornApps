import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { Sparkles, Zap } from 'lucide-react'

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

  return (
    <div className="container mx-auto py-10 px-4 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-600/20 border border-violet-500/30 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.3)]">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-violet-400 uppercase italic">
              Dashboard
            </span>
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Generate high-converting SEO copy for your e-commerce products.
          </p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4 shadow-[0_0_30px_rgba(124,58,237,0.1)] transition-all hover:bg-white/10 group relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-transparent pointer-events-none" />
          <Zap className="w-5 h-5 text-amber-400 animate-pulse relative z-10" />
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Available Credits
            </p>
            <p className="text-3xl font-black text-white leading-none mt-1">
              {credits}
              <span className="text-sm font-black text-slate-400 ml-2 uppercase tracking-widest">
                {credits === 1 ? 'Credit' : 'Credits'}
              </span>
            </p>
          </div>
        </div>
      </div>

      <DashboardClient
        userId={userId}
        initialCredits={credits}
        initialHistory={history}
      />
    </div>
  )
}
