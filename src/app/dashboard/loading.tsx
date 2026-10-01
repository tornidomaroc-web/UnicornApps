'use client'

import { Loader2 } from 'lucide-react'
import { SURFACE } from '@/app/dashboard/surface'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * What the dashboard shows while its server data loads: one SURFACE card on
 * the dashboard's own background and gutters, a spinner and one translated
 * line. No motion library, no glow and no transform other than the spinner's
 * rotation, so a low-end WebView paints it in one pass.
 */
export default function Loading() {
  const { t } = useLang()
  return (
    <div className="min-h-screen bg-[#070710] px-4 py-8 md:px-8">
      <div
        role="status"
        className={`${SURFACE} mx-auto flex min-h-[40vh] max-w-7xl flex-col items-center justify-center gap-4 p-8 text-center`}
      >
        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden />
        <p className="text-base font-bold text-white">{t('dash.loading')}</p>
      </div>
    </div>
  )
}
