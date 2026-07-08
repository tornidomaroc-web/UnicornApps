'use client'

import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * Reusable premium template for legal documents (privacy / terms / refund).
 *
 * Presentational + i18n-aware: takes translation KEYS (not resolved strings) and
 * resolves them via the existing t() so each page stays fully bilingual (EN/AR)
 * through the shared LanguageContext. Direction is inherited from the global
 * LanguageProvider wrapper (dir=rtl in Arabic); this component only guards
 * letter-spacing with `ltr:` (tracking breaks Arabic letter-joining) and flips
 * the back arrow with `rtl:`. Consumes the --ua-* design tokens exclusively
 * (bg-surface / bg-surface-2 / text-brand / text-ink-*); no hardcoded palette.
 *
 * Kept general so terms/refund reuse it by passing their own key sets.
 */
export type LegalSection = { id: string; titleKey: string; bodyKey: string }

export type LegalDocProps = {
  backHref: string
  backLabelKey: string
  eyebrowKey: string
  titleKey: string
  versionKey: string
  updatedKey: string
  sections: LegalSection[]
  governingKey: string
  contact: { headingKey: string; subKey: string; ctaKey: string; email: string }
}

export default function LegalDoc({
  backHref,
  backLabelKey,
  eyebrowKey,
  titleKey,
  versionKey,
  updatedKey,
  sections,
  governingKey,
  contact,
}: LegalDocProps) {
  const { t } = useLang()
  const year = new Date().getFullYear()

  return (
    <article className="min-h-screen bg-surface px-6 pt-28 pb-28 sm:pt-32">
      <div className="mx-auto max-w-3xl">
        {/* Back control */}
        <Link
          href={backHref}
          className="group inline-flex items-center gap-2 text-sm text-ink-1 transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t(backLabelKey)}
        </Link>

        {/* Header */}
        <header className="mt-10 border-b border-white/10 pb-8">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-xs font-medium uppercase text-ink-3 ltr:tracking-[0.2em]">
              {t(eyebrowKey)}
            </span>
          </div>
          <h1 className="mb-4 text-4xl font-semibold text-ink-0 sm:text-5xl ltr:tracking-tight">
            {t(titleKey)}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-3">
            <span>{t(versionKey)}</span>
            <span className="h-1 w-1 rounded-full bg-ink-4" aria-hidden="true" />
            <span>{t(updatedKey)}</span>
          </div>
        </header>

        {/* Sections */}
        <div className="mt-12 space-y-5">
          {sections.map((section) => (
            <section
              key={section.id}
              className="rounded-2xl border border-white/[0.08] bg-surface-2/40 p-7 sm:p-8"
            >
              <div className="flex gap-5">
                <span className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-brand">
                  {section.id}
                </span>
                <div className="min-w-0">
                  <h2 className="mb-3 text-lg font-semibold text-ink-0">{t(section.titleKey)}</h2>
                  <p className="leading-relaxed text-ink-1">{t(section.bodyKey)}</p>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-8 flex flex-col gap-6 rounded-2xl border border-white/[0.08] bg-surface-2/40 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h3 className="mb-1.5 text-base font-semibold text-ink-0">{t(contact.headingKey)}</h3>
            <p className="text-sm text-ink-2">{t(contact.subKey)}</p>
          </div>
          <Link
            href={`mailto:${contact.email}`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand/90"
          >
            <Mail className="h-4 w-4" />
            {t(contact.ctaKey)}
          </Link>
        </div>

        {/* Governing-language clause (discreet, current language) */}
        <p className="mt-10 text-sm leading-relaxed text-ink-3">{t(governingKey)}</p>

        {/* Footer */}
        <footer className="mt-16 border-t border-white/10 pt-8">
          <p className="text-sm text-ink-4">
            © {year} UnicornApps Global · {t('footer.rights')}
          </p>
        </footer>
      </div>
    </article>
  )
}
