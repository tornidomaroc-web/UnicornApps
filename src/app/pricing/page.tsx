import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PricingClient from './PricingClient'
import { isNativeRequest } from '@/lib/native-request'

export const metadata: Metadata = {
  title: "Pricing — Simple Plans for Global Sellers",
  description: "Simple, transparent pricing for global e-commerce sellers. Start free, upgrade when ready.",
}

export default function PricingPage() {
  // The native Android app is payment-free (Google Play disallows external
  // checkout for digital goods). Make the pricing page physically unreachable
  // there — server-side, before any HTML is sent, so there is no flash and no
  // Paddle URL in the payload.
  if (isNativeRequest()) {
    redirect('/')
  }
  return <PricingClient />
}
