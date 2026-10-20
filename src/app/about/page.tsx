'use client'

import { Mail, Sparkles, UserRound, Zap, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EYEBROW, TILE } from '@/app/dashboard/surface'
import Footer from '@/components/layout/Footer'
import { CARD, EndCard, H2, PAGE, SUB, WRAP } from '@/components/marketing/Marketing'
import { useIsNative } from '@/hooks/useIsNative'
import { useLang } from '@/lib/i18n/LanguageContext'

const SUPPORT_EMAIL = 'support@unicornapps.app'

/**
 * One block: a clay icon tile beside a heading and its text, the same shape as
 * the landing's feature tiles. The icons say what each block is about, in the
 * app's own vocabulary: one person (who it is for), the sparkle the Generate
 * button carries (how it is built: the AI writes), the lightning bolt of the
 * credits counter and card (what it costs), an envelope (contact).
 */
function Block({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className={`${TILE} flex items-start gap-4 p-5`}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-icon bg-chip bg-fill-icon shadow-icon text-fg-link">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-xl font-bold leading-snug text-fg">{title}</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-fg-muted">{children}</p>
      </div>
    </div>
  )
}

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
            <Block icon={UserRound} title={t('about.who.title')}>
              {t('about.who.body')}
            </Block>
            <Block icon={Sparkles} title={t('about.how.title')}>
              {t('about.how.body')}
            </Block>
            <Block icon={Zap} title={t('about.cost.title')}>
              {t('about.cost.body')}
              {showPricing && <> {t('about.cost.web')}</>}
            </Block>
            <Block icon={Mail} title={t('about.contact.title')}>
              {t('about.contact.body')}{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="font-medium text-fg-link underline underline-offset-4">
                {SUPPORT_EMAIL}
              </a>
              .
            </Block>
          </div>
        </section>

        <EndCard title={t('home.end.title')} sub={t('home.end.sub')} cta={t('home.cta')} />
      </div>
      <Footer />
    </main>
  )
}
