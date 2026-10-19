'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'
import { SURFACE } from '@/app/dashboard/surface'
import type { Feedback } from '@/lib/auth-errors'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * The frame every auth screen shares, in the dashboard's surface vocabulary:
 * one SURFACE card on the canonical background, TILE for rows inside it.
 *
 * PHONE FIRST. Top-aligned below 640px: a vertically centred card jumps when
 * the keyboard opens, and every install is a phone. Centred from `sm:` up.
 *
 * WEIGHT. No blur, no glow blobs, no framer-motion: the old screens stacked
 * three `blur-[120px]` layers and a `backdrop-blur-2xl` card, which is the
 * most expensive thing a low-end Android WebView can be asked to paint.
 *
 * DIRECTION. Logical classes only (ms-/me-/ps-/pe-/start-/end-/text-start).
 * No tracking-* anywhere on these screens.
 */
export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string
  sub?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="min-h-[100dvh] px-4 pb-10 pt-10 sm:flex sm:items-center sm:justify-center sm:py-12">
      <div className="mx-auto w-full max-w-md">
        {/* No brand mark of its own: the site navbar above already carries the
            logo and the home link, and a second lockup cost ~70px of a phone
            screen above the first field. */}
        <section className={`${SURFACE} p-5 sm:p-8`}>
          <h1 className="text-2xl font-bold leading-tight text-fg sm:text-3xl">{title}</h1>
          {sub && <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{sub}</p>}
          <div className="mt-6">{children}</div>
        </section>

        {footer && <div className="mt-6 px-2 text-center text-xs leading-relaxed text-fg-faint">{footer}</div>}
      </div>
    </main>
  )
}

/** The primary action of a form. One nowrap row: a control cannot reflow. */
export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full bg-brand px-6 text-base font-bold text-fg-on-brand bg-fill-btn shadow-btn press hover:bg-fill-btn-hover disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? (
        <>
          <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  )
}

/**
 * The one place an auth screen says what happened. It receives a KEY from
 * resolveFeedback and renders `t(key)`: there is no prop through which a
 * string from a URL or a provider could reach the page.
 */
export function AuthBanner({ feedback, action }: { feedback: Feedback; action?: ReactNode }) {
  const { t } = useLang()
  const error = feedback.kind === 'error'
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={
        error
          ? 'rounded-row border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-200'
          : 'rounded-row border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm leading-relaxed text-emerald-200'
      }
    >
      <p>{t(feedback.key)}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/** Shared field styling: 16px text so a phone never zooms into the field. */
export const FIELD =
  'h-12 w-full rounded-input border border-transparent bg-field px-4 text-base text-fg shadow-well placeholder:text-fg-faint outline-none transition-colors focus:border-focus focus:ring-2 focus:ring-focus/30'
export const LABEL = 'mb-1.5 block text-sm font-medium text-fg-body'
