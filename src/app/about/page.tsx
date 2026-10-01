'use client'

import { EYEBROW, TILE } from '@/app/dashboard/surface'
import Footer from '@/components/layout/Footer'
import { CARD, EndCard, H2, PAGE, SUB, WRAP } from '@/components/marketing/Marketing'
import { useIsNative } from '@/hooks/useIsNative'
import { useLang } from '@/lib/i18n/LanguageContext'

const SUPPORT_EMAIL = 'support@unicornapps.app'

/**
 * The about page: what the product is, who it is for, how it is built, what
 * it costs, and how to reach us. Four short blocks and a contact line, no
 * team story and no figures.
 *
 * The one sentence that mentions buying credits is WEB ONLY, under the same
 * `showPricing` gate as every pricing surface.
 */
export default function AboutPage() {
  const { t } = useLang()
  const { isNative, resolved } = useIsNative()
  const showPricing = resolved && !isNative

  return (
    <main className={PAGE}>
      <div className={WRAP}>
        <section className={CARD}>
          <p className={`${EYEBROW} mb-3`}>{t('about.eyebrow')}</p>
          <h1 className={H2}>{t('about.title')}</h1>
          <p className={SUB}>{t('about.sub')}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className={`${TILE} p-5`}>
              <h2 className="text-base font-bold text-white">{t('about.who.title')}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-400">{t('about.who.body')}</p>
            </div>
            <div className={`${TILE} p-5`}>
              <h2 className="text-base font-bold text-white">{t('about.how.title')}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-400">{t('about.how.body')}</p>
            </div>
            <div className={`${TILE} p-5`}>
              <h2 className="text-base font-bold text-white">{t('about.cost.title')}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-400">
                {t('about.cost.body')}
                {showPricing && <> {t('about.cost.web')}</>}
              </p>
            </div>
            <div className={`${TILE} p-5`}>
              <h2 className="text-base font-bold text-white">{t('about.contact.title')}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-400">
                {t('about.contact.body')}{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-medium text-brand underline underline-offset-4">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        <EndCard title={t('home.end.title')} sub={t('home.end.sub')} cta={t('home.cta')} />
      </div>
      <Footer />
    </main>
  )
}
