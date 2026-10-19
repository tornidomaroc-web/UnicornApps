'use client'

import { useEffect } from 'react'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { initializeApp } from '@/lib/capacitor'
import { LITE_SCRIPT } from '@/lib/lite-mode'
import type { Lang } from '@/lib/i18n/initial-lang'

// Client-only shell extracted from RootLayout so that `layout.tsx` can become a
// server component and read the auth session for the navbar seed. This holds the
// two things that require the client: the Capacitor init effect (native
// back-button/app-state listeners; a no-op on web) and the language context that
// the navbar and every page consume via useLang(). Behavior is identical to the
// previous in-layout wiring — same provider, same mount-time initializeApp().
export default function Providers({
  children,
  initialLang,
}: {
  children: React.ReactNode
  /** Decided by the server layout; see lib/i18n/initial-lang.ts. */
  initialLang: Lang
}) {
  useEffect(() => {
    initializeApp()
  }, [])

  return (
    <>
      {/* Lite-mode switch (lib/lite-mode.ts). First in <body> so it runs before
          the content below it paints. Beyond this tag it adds no element or
          attribute, so hydration is unaffected. */}
      <script dangerouslySetInnerHTML={{ __html: LITE_SCRIPT }} />
      <LanguageProvider initialLang={initialLang}>{children}</LanguageProvider>
    </>
  )
}
