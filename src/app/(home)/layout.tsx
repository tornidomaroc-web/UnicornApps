import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/page-metadata'

// The landing page is a client component, so its search title and description live here. The (home) group adds no URL segment: this is still /.
export const metadata = pageMetadata('home')

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
