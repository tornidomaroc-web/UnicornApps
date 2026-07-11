'use client'

import { useEffect } from 'react'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { initializeApp } from '@/lib/capacitor'

// Client-only shell extracted from RootLayout so that `layout.tsx` can become a
// server component and read the auth session for the navbar seed. This holds the
// two things that require the client: the Capacitor init effect (native
// back-button/app-state listeners; a no-op on web) and the language context that
// the navbar and every page consume via useLang(). Behavior is identical to the
// previous in-layout wiring — same provider, same mount-time initializeApp().
export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initializeApp()
  }, [])

  return <LanguageProvider>{children}</LanguageProvider>
}
