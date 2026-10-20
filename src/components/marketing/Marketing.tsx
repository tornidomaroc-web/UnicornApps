'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EYEBROW, SURFACE, TILE } from '@/app/dashboard/surface'

/**
 * The marketing pages (landing, features, about) in the dashboard's own
 * surface vocabulary, so the product looks like one thing from the first
 * visit to the first result: SURFACE cards, TILE rows with a round icon chip
 * beside a name and a one-line hint, sentence-case bold type, one pill for
 * the primary action.
 *
 * PHONE FIRST. Every install is an Android phone, so the layout is a single
 * column that gains a second one from 640px. Type tops out at 32px on a
 * phone; the landing headline alone goes larger from `sm:` up.
 *
 * WEIGHT. No framer-motion, no blur, no glow blobs, no WebGL. The first
 * paint is the final paint: nothing is shipped hidden to fade in later.
 *
 * DIRECTION. Logical classes only (ms-/me-/ps-/pe-/start-/end-/text-start).
 * The RTL letter-spacing rule in globals.css covers EYEBROW on the Arabic
 * surface; nothing here renders model output.
 *
 * MONEY. Nothing in this file states a price. The pricing teaser reads the
 * dictionary's pricing keys, and the pages render it only under
 * `showPricing`, which is false until native detection has resolved to web.
 */

export const PAGE = 'text-fg-body px-4 pb-10 pt-6 sm:pt-12'
export const WRAP = 'mx-auto w-full max-w-5xl'
export const CARD = `${SURFACE} p-5 sm:p-8`
export const H2 = 'text-[28px] font-bold leading-[1.15] text-fg sm:text-[32px]'
export const SUB = 'mt-2 text-base leading-relaxed text-fg-muted'

/**
 * THE LANDING ONLY: a larger section title (27px, 34px from lg) with taller
 * Arabic lines, and the eyebrow as a tinted pill with a dot. The other pages
 * keep H2 and EYEBROW until their own pass.
 */
export const LANDING_H2 = 'text-[27px] font-bold leading-[1.2] text-fg rtl:leading-[1.4] lg:text-[34px]'
export const PILL_EYEBROW =
  'inline-flex items-center gap-2 rounded-pill border border-line bg-chip px-4 py-2 text-sm font-medium leading-tight text-fg-link'

/** The dot inside PILL_EYEBROW. */
export function Dot() {
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-fg-link" />
}

const PILL = 'inline-flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full px-8 text-base font-bold sm:w-auto'

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${PILL} bg-brand text-fg-on-brand bg-fill-btn shadow-btn hover:bg-fill-btn-hover press`}>
      {children}
    </Link>
  )
}

export function GhostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${PILL} border border-transparent bg-chip bg-fill-ghost text-fg-link shadow-ghost hover:text-fg press`}>
      {children}
    </a>
  )
}

/** A row: round icon chip, a name, one line under it. */
export function Tile({ icon: Icon, name, desc }: { icon: LucideIcon; name: string; desc: string }) {
  return (
    <li className={`${TILE} flex items-start gap-4 p-4 sm:p-5`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-icon bg-chip bg-fill-icon shadow-icon text-fg-link">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-bold text-fg">{name}</span>
        <span className="mt-1 block text-[15px] leading-relaxed text-fg-muted">{desc}</span>
      </span>
    </li>
  )
}

/** A numbered step, same row shape as Tile with the number in the chip. */
export function Step({ n, name, desc }: { n: number; name: string; desc: string }) {
  return (
    <li className={`${TILE} flex items-start gap-4 p-4 sm:p-5`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-icon bg-chip bg-fill-icon shadow-icon text-lg font-bold text-fg-link">
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-bold text-fg">{name}</span>
        <span className="mt-1 block text-[15px] leading-relaxed text-fg-muted">{desc}</span>
      </span>
    </li>
  )
}

export function SectionHead({ eyebrow, title, sub, landing }: { eyebrow?: string; title: string; sub?: string; landing?: boolean }) {
  return (
    <div>
      {eyebrow &&
        (landing ? (
          <p className={`${PILL_EYEBROW} mb-4`}>
            <Dot />
            {eyebrow}
          </p>
        ) : (
          <p className={`${EYEBROW} mb-3`}>{eyebrow}</p>
        ))}
      <h2 className={landing ? LANDING_H2 : H2}>{title}</h2>
      {sub && <p className={SUB}>{sub}</p>}
    </div>
  )
}

/** The closing card every marketing page ends on. */
export function EndCard({ title, sub, cta, landing }: { title: string; sub: string; cta: string; landing?: boolean }) {
  return (
    <section className={`${CARD} mt-6 text-center`}>
      <h2 className={landing ? LANDING_H2 : H2}>{title}</h2>
      <p className={SUB}>{sub}</p>
      <div className="mt-6">
        <PrimaryLink href="/login">{cta}</PrimaryLink>
      </div>
    </section>
  )
}

/**
 * The two plans as two tiles, reading only the dictionary's pricing keys.
 * WEB ONLY: callers render this under `showPricing`. The price strings are
 * Latin, so they are pinned ltr inside the Arabic surface.
 */
export function PricingTeaser({ t }: { t: (key: string) => string }) {
  const plans = [
    {
      name: t('pricing.pack.name'),
      price: t('pricing.pack.price'),
      period: t('pricing.pack.period'),
      lines: [t('pricing.f.credits30'), t('pricing.f.allai')],
    },
    {
      name: t('pricing.sub.name'),
      price: t('pricing.sub.price'),
      period: t('pricing.sub.period'),
      lines: [t('pricing.f.credits100'), t('pricing.f.percredit'), t('pricing.f.allai')],
    },
  ]
  return (
    <section className={`${CARD} mt-6`}>
      <SectionHead title={t('pricing.teaser.title')} />
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <li key={p.name} className={`${TILE} p-5`}>
            <p className="text-base font-bold text-fg">{p.name}</p>
            <p className="mt-1 text-[28px] font-bold leading-none text-fg">
              <span dir="ltr">{p.price}</span>{' '}
              <span className="text-sm font-medium text-fg-faint">{p.period}</span>
            </p>
            <ul className="mt-4 space-y-1.5 text-[15px] text-fg-muted">
              {p.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="mt-6 text-center">
        <Link href="/pricing" className={`${PILL} border border-transparent bg-chip bg-fill-ghost text-fg-link shadow-ghost hover:text-fg press`}>
          {t('pricing.teaser.cta')}
        </Link>
      </div>
    </section>
  )
}
