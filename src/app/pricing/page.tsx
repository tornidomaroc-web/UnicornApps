import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PricingClient from './PricingClient'
import { isNativeRequest } from '@/lib/native-request'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: "Pricing — Simple Plans for Global Sellers",
  description: "Simple, transparent pricing for global e-commerce sellers. Start free, upgrade when ready.",
}

// Must render per-request so the native check (below) always runs — never
// statically prerendered. The primary gate is middleware; this is defense.
export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  // The native Android app is payment-free (Google Play disallows external
  // checkout for digital goods). Make the pricing page physically unreachable
  // there — server-side, before any HTML is sent, so there is no flash and no
  // Paddle URL in the payload.
  if (isNativeRequest()) {
    redirect('/')
  }

  // Resolve the authenticated user on the SERVER and pass the id down. The
  // browser Supabase client cannot read the auth cookie in this deployment, so a
  // client-side read returned null for signed-in users — leaving userId null so
  // openCheckout redirected them to /login, where middleware bounced them to
  // /dashboard: the pricing CTA dead-ended for the exact users most likely to
  // buy. getUser() (not getSession()) VALIDATES the token because this id feeds
  // custom_data.user_id → the credit grant. Defensive: any Supabase/env failure
  // degrades to null (logged-out behavior — pricing stays viewable and the CTA
  // routes to /login), never throwing out of the page.
  let initialUserId: string | null = null
  try {
    const supabase = createClient()
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      initialUserId = user?.id ?? null
    }
  } catch {
    initialUserId = null
  }

  return <PricingClient initialUserId={initialUserId} />
}
