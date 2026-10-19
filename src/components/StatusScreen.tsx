'use client'

import type { ReactNode } from 'react'
import { SURFACE } from '@/app/dashboard/surface'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * The frame for the two screens nobody asks for: a page that does not exist
 * and a page that failed. One SURFACE card, a title, one sentence and the way
 * out, in the language the app is set to. It takes KEYS, never text, so
 * nothing from a URL or an exception can reach the screen.
 */
export const STATUS_PILL =
  'flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full px-6 text-base font-bold'
export const STATUS_PRIMARY = `${STATUS_PILL} bg-brand text-fg-on-brand bg-fill-btn shadow-btn hover:bg-fill-btn-hover press`
export const STATUS_GHOST = `${STATUS_PILL} border border-transparent bg-chip bg-fill-ghost text-fg-link shadow-ghost hover:text-fg press`

export default function StatusScreen({
  titleKey,
  bodyKey,
  children,
}: {
  titleKey: string
  bodyKey: string
  children: ReactNode
}) {
  const { t } = useLang()
  return (
    <div className="min-h-[100dvh] px-4 pb-10 pt-10 sm:flex sm:items-center sm:justify-center sm:py-12">
      <section className={`${SURFACE} mx-auto w-full max-w-md p-5 text-center sm:p-8`}>
        <h1 className="text-2xl font-bold leading-tight text-fg sm:text-3xl">{t(titleKey)}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{t(bodyKey)}</p>
        <div className="mt-6 space-y-3">{children}</div>
      </section>
    </div>
  )
}
