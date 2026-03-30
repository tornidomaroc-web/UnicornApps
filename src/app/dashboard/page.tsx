import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Sparkles, CreditCard } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch user credit count
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', user.id)
    .single()

  const credits = profile?.credits ?? 0

  // Fetch recent generations
  const { data: generations } = await supabase
    .from('generations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const history = generations ?? []

  return (
    <div className="container mx-auto py-10 px-4 max-w-5xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            Dashboard
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Generate high-converting SEO copy for your e-commerce products.
          </p>
        </div>

        <Card className="w-full md:w-auto min-w-[200px] border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
            <CreditCard className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {credits} {credits === 1 ? 'Credit' : 'Credits'}
            </div>
            <p className="text-xs text-zinc-500 mt-1 text-primary hover:underline cursor-pointer">
              Top up for more generations
            </p>
          </CardContent>
        </Card>
      </div>

      <DashboardClient initialCredits={credits} initialHistory={history} />
    </div>
  )
}
