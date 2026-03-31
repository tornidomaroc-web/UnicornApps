import { Metadata } from 'next'
import PricingClient from './PricingClient'

export const metadata: Metadata = {
  title: "Pricing — Simple Plans for Global Sellers",
  description: "Simple, transparent pricing for global e-commerce sellers. Start free, upgrade when ready.",
}

export default function PricingPage() {
  return <PricingClient />
}
