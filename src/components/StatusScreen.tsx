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
  'flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full px-6 text-base font-bold transition-colors'
export const STATUS_PRIMARY = `${STATUS_PILL} bg-brand text-white shadow-glow-brand hover:bg-brand/90`
export const STATUS_GHOST = `${STATUS_PILL} border border-white/10 bg-white/5 text-white hover:bg-white/10`

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
    <div className="min-h-[100dvh] bg-[#070710] px-4 pb-10 pt-10 sm:flex sm:items-center sm:justify-center sm:py-12">
      <section className={`${SURFACE} mx-auto w-full max-w-md p-5 text-center sm:p-8`}>
        <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">{t(titleKey)}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{t(bodyKey)}</p>
        <div className="mt-6 space-y-3">{children}</div>
      </section>
    </div>
  )
}
