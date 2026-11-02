import type { ReactNode } from 'react'
import { pageMetadata } from '@/lib/seo/page-metadata'

// The page is a client component, so its search title, description and noindex live here.
export const metadata = pageMetadata('login')

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
