import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/page-metadata'

// The page is a client component, so its search title and description live here.
export const metadata = pageMetadata('features')

export default function FeaturesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
