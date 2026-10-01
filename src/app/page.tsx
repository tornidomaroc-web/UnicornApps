'use client'

import {
  AlignLeft,
  Code2,
  Copy,
  FileText,
  Hash,
  Languages,
  List,
  Palette,
  Smartphone,
  Store,
  Type,
} from 'lucide-react'
import { EYEBROW } from '@/app/dashboard/surface'
import Footer from '@/components/layout/Footer'
import {
  CARD,
  EndCard,
  GhostLink,
  PAGE,
  PricingTeaser,
  PrimaryLink,
  SectionHead,
  Step,
  Tile,
  WRAP,
} from '@/components/marketing/Marketing'
import { useIsNative } from '@/hooks/useIsNative'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * The landing page. What the product does, said once: one photo in, every
 * part of a product page out, each part copied in one tap, in Arabic or
 * English, for a seller working alone.
 *
 * THE HERO IS PLAIN HTML. It used to be a framer-motion tree whose hidden
 * variant was opacity:0; the entrance animation was traded away so the first
 * paint would not be a black rectangle on a slow phone. There is no motion
 * library on this page now, so the first paint is the final paint by
 * construction and nothing can put that trade back by accident.
 *
 * EVERY CLAIM BELOW IS A FEATURE THAT EXISTS TODAY: the block names are the
 * results panel's blocks, the step costs are the dashboard's, the free
 * credits are the sign-up default. No logos, ratings, counts or quotes.
 *
 * Pricing is WEB ONLY: the teaser renders under `showPricing`, false until
 * native detection resolves to web, the same gate as every other surface.
 */
export default function Home() {
  const { t } = useLang()
  const { isNative, resolved } = useIsNative()
  const showPricing = resolved && !isNative

  const outputs = [
    { icon: Type, key: 'title' },
    { icon: AlignLeft, key: 'desc' },
    { icon: List, key: 'bullets' },
    { icon: FileText, key: 'meta' },
    { icon: Code2, key: 'shopify' },
    { icon: Hash, key: 'social' },
    { icon: Palette, key: 'data' },
    { icon: Store, key: 'preview' },
  ] as const

  const solo = [
    { icon: Copy, key: '1' },
    { icon: Languages, key: '2' },
    { icon: Smartphone, key: '3' },
  ] as const

  return (
    <main className={PAGE}>
      <div className={WRAP}>
        <section className="px-1 pb-10 pt-6 text-center sm:pb-16 sm:pt-12">
          <p className={EYEBROW}>{t('home.eyebrow')}</p>
          <h1 className="mx-auto mt-4 max-w-3xl text-[32px] font-bold leading-[1.1] text-white sm:text-[52px]">
            {t('home.title')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">{t('home.sub')}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <PrimaryLink href="/login">{t('home.cta')}</PrimaryLink>
            <GhostLink href="#output">{t('home.cta2')}</GhostLink>
          </div>
        </section>

        <section id="output" className={`${CARD} scroll-mt-24`}>
          <SectionHead eyebrow={t('home.out.eyebrow')} title={t('home.out.title')} sub={t('home.out.sub')} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {outputs.map(({ icon, key }) => (
              <Tile key={key} icon={icon} name={t(`home.out.${key}.name`)} desc={t(`home.out.${key}.desc`)} />
            ))}
          </ul>
        </section>

        <section className={`${CARD} mt-6`}>
          <SectionHead eyebrow={t('home.how.eyebrow')} title={t('home.how.title')} />
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Step key={n} n={n} name={t(`home.how.${n}.name`)} desc={t(`home.how.${n}.desc`)} />
            ))}
          </ol>
        </section>

        <section className={`${CARD} mt-6`}>
          <SectionHead eyebrow={t('home.solo.eyebrow')} title={t('home.solo.title')} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {solo.map(({ icon, key }) => (
              <Tile key={key} icon={icon} name={t(`home.solo.${key}.name`)} desc={t(`home.solo.${key}.desc`)} />
            ))}
          </ul>
        </section>

        {showPricing && <PricingTeaser t={t} />}

        <EndCard title={t('home.end.title')} sub={t('home.end.sub')} cta={t('home.cta')} />
      </div>
      <Footer />
    </main>
  )
}
