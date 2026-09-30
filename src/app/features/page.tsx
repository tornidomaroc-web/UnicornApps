'use client'

import {
  AlignLeft,
  Camera,
  Code2,
  FileText,
  Hash,
  History,
  Languages,
  List,
  MessageSquare,
  Palette,
  Store,
  Type,
} from 'lucide-react'
import Footer from '@/components/layout/Footer'
import { CARD, EndCard, PAGE, PricingTeaser, SectionHead, Tile, WRAP } from '@/components/marketing/Marketing'
import { useIsNative } from '@/hooks/useIsNative'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * The features page: the eight blocks one generation produces, then what
 * sits around them (refine, history and CSV, camera, language). Same
 * vocabulary as the landing page; every item is a feature that ships today.
 */
export default function FeaturesPage() {
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

  const around = [
    { icon: MessageSquare, key: 'refine' },
    { icon: History, key: 'history' },
    { icon: Camera, key: 'camera' },
    { icon: Languages, key: 'lang' },
  ] as const

  return (
    <main className={PAGE}>
      <div className={WRAP}>
        <section className={CARD}>
          <SectionHead eyebrow={t('feat.eyebrow')} title={t('feat.title')} sub={t('feat.sub')} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {outputs.map(({ icon, key }) => (
              <Tile key={key} icon={icon} name={t(`home.out.${key}.name`)} desc={t(`home.out.${key}.desc`)} />
            ))}
          </ul>
        </section>

        <section className={`${CARD} mt-6`}>
          <SectionHead title={t('feat.more.title')} />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {around.map(({ icon, key }) => (
              <Tile key={key} icon={icon} name={t(`feat.${key}.name`)} desc={t(`feat.${key}.desc`)} />
            ))}
          </ul>
        </section>

        {showPricing && <PricingTeaser t={t} />}

        <EndCard title={t('feat.end.title')} sub={t('home.end.sub')} cta={t('home.cta')} />
      </div>
      <Footer />
    </main>
  )
}
