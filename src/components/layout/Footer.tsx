'use client'

import Link from 'next/link'
import { EYEBROW } from '@/app/dashboard/surface'
import { useIsNative } from '@/hooks/useIsNative'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * The one site footer, shared by the marketing pages. Brand, one line, the
 * page links and the legal links. No social icons: there are no accounts to
 * link to, and a dead "#" link is a claim.
 *
 * The pricing link is WEB ONLY: hidden until native detection resolves to
 * web, the same gate every other pricing surface uses.
 */
export default function Footer() {
  const { t } = useLang()
  const { isNative, resolved } = useIsNative()
  const showPricing = resolved && !isNative
  const link = 'text-[15px] text-slate-400 hover:text-white'

  return (
    <footer className="mx-auto mt-12 w-full max-w-5xl border-t border-white/5 pt-10">
      <div className="grid gap-8 sm:grid-cols-3">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/unicornapps-mark.svg?v=2" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="text-lg font-bold text-white">UnicornApps</span>
          </Link>
          <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-slate-500">{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('footer.nav')}>
          <p className={`${EYEBROW} mb-4`}>{t('footer.nav')}</p>
          <ul className="space-y-3">
            <li><Link href="/" className={link}>{t('nav.home')}</Link></li>
            <li><Link href="/features" className={link}>{t('nav.features')}</Link></li>
            {showPricing && <li><Link href="/pricing" className={link}>{t('nav.pricing')}</Link></li>}
            <li><Link href="/about" className={link}>{t('nav.about')}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t('footer.legal')}>
          <p className={`${EYEBROW} mb-4`}>{t('footer.legal')}</p>
          <ul className="space-y-3">
            <li><Link href="/privacy" className={link}>{t('footer.privacy')}</Link></li>
            <li><Link href="/terms" className={link}>{t('footer.terms')}</Link></li>
            <li><Link href="/refund" className={link}>{t('footer.refund')}</Link></li>
          </ul>
        </nav>
      </div>
      <p className="mt-10 text-xs text-slate-600">
        © {new Date().getFullYear()} UnicornApps. {t('footer.rights')}.
      </p>
    </footer>
  )
}
