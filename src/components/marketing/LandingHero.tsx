'use client'

import Image from 'next/image'
import { Copy } from 'lucide-react'
import honeyJar from '@/assets/landing/honey-jar.jpg'
import { Dot, GhostLink, PILL_EYEBROW, PrimaryLink } from './Marketing'

/**
 * The landing hero: the headline block, and beside it (below it on a phone)
 * the hero object, a product photo with the page generated from it.
 *
 * THE EXAMPLE IS LABELLED AS ONE. The card is not a live result: its text is
 * written in the generator's own shape (a title, Amazon bullets, hashtags),
 * says only what the photo shows, and the figure's caption names it an
 * example. The Copy pill is a picture of the results panel's button, so it is
 * a span hidden from assistive technology, not a control.
 *
 * THE PHOTO is "clear glass jar with brown liquid" by Art Rachen, Unsplash,
 * https://unsplash.com/photos/clear-glass-jar-with-brown-liquid-Asj5DFw8UAw,
 * free under the Unsplash License (commercial use, no attribution required).
 * Cropped to 4:5 and resized to 1080x1350 here; served by next/image at the
 * width each screen needs. It is the likely LCP element on a phone, so it is
 * preloaded (priority) and its box is reserved by the import's dimensions.
 *
 * DEPTH. The photo frame, the result card and the brand tile carry the clay
 * stack (lite mode flattens all three through the shadow tokens); chips and
 * labels are a tint and a hairline only. Nothing glows.
 */

const CHIP = 'inline-flex items-center rounded-pill border border-line bg-chip px-3 py-1 text-[13px] font-medium text-fg-link'

export function LandingHero({ t }: { t: (key: string) => string }) {
  const facts = [t('home.solo.1.name'), t('home.solo.2.name'), t('home.solo.3.name')]
  const tags = [t('home.ex.tag1'), t('home.ex.tag2')]

  return (
    <section className="grid gap-8 pb-10 pt-2 lg:grid-cols-[0.74fr_1.26fr] lg:items-center lg:gap-10 lg:pb-14 lg:pt-6">
      <div className="flex flex-col items-start gap-[18px]">
        <p className={PILL_EYEBROW}>
          <Dot />
          {t('home.eyebrow')}
        </p>
        <h1 className="text-[36px] font-bold leading-[1.12] text-fg rtl:leading-[1.34] lg:text-[52px] lg:leading-[1.08] lg:rtl:leading-[1.3]">
          {t('home.title')}
        </h1>
        <p className="text-base leading-relaxed text-fg-muted sm:text-lg">{t('home.sub')}</p>
        <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
          <PrimaryLink href="/login">{t('home.cta')}</PrimaryLink>
          <GhostLink href="#output">{t('home.cta2')}</GhostLink>
        </div>
        <ul className="flex flex-wrap gap-2">
          {facts.map((f) => (
            <li key={f} className={CHIP}>
              {f}
            </li>
          ))}
        </ul>
      </div>

      <figure className="mx-auto w-full max-w-xl lg:max-w-none">
        <div className="relative">
          <div className="relative w-[60%] rounded-[34px] bg-row p-2 shadow-tap lg:w-[62%] lg:rounded-[40px] lg:p-2.5">
            <Image
              src={honeyJar}
              alt={t('home.hero.photo.alt')}
              priority
              sizes="(min-width: 1024px) 370px, (min-width: 608px) 330px, 56vw"
              className="aspect-[4/5] h-auto w-full rounded-[26px] object-cover lg:rounded-[30px]"
            />
            <span className="absolute bottom-5 start-5 rounded-pill border border-fg/20 bg-surface/70 px-3.5 py-1.5 text-[13px] font-medium text-fg">
              {t('home.hero.photo')}
            </span>
          </div>

          <span
            aria-hidden
            className="absolute end-1 top-1 flex h-[84px] w-[84px] rotate-6 items-center justify-center rounded-[26px] bg-brand bg-fill-btn shadow-mark rtl:-rotate-6 lg:h-[104px] lg:w-[104px] lg:rounded-[32px]"
          >
            <img src="/unicornapps-mark.svg?v=2" alt="" width={64} height={64} className="h-16 w-16 lg:h-20 lg:w-20" />
          </span>

          <div className="relative -mt-[22%] ms-auto w-[64%] rounded-[28px] bg-row p-[18px] shadow-tap lg:-mt-[9%] lg:w-[66%] lg:rounded-[32px] lg:p-[26px]">
            <div className="flex items-center justify-between gap-2">
              <span className={`${CHIP} whitespace-nowrap`}>{t('home.hero.generated')}</span>
              <span
                aria-hidden
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-pill bg-brand bg-fill-btn px-4 text-sm font-bold text-fg-on-brand shadow-btn"
              >
                <Copy className="h-4 w-4" />
                {t('dash.seo.copy')}
              </span>
            </div>
            <p className="mt-3 font-head text-base font-bold leading-[1.4] text-fg lg:text-xl">{t('home.ex.title')}</p>
            <span className={`${CHIP} mt-3`}>{t('home.out.bullets.name')}</span>
            <ul className="mt-3 space-y-2 text-[13.5px] leading-normal text-fg-body lg:text-[15.5px]">
              {[t('home.ex.b1'), t('home.ex.b2')].map((b) => (
                <li key={b} className="relative ps-3.5">
                  <span aria-hidden className="absolute start-0 top-[0.6em] h-1.5 w-1.5 rounded-full bg-fg-link" />
                  {b}
                </li>
              ))}
            </ul>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li key={tag} className={CHIP}>
                  {tag}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <figcaption className="mt-3 text-sm text-fg-muted">{t('home.hero.example')}</figcaption>
      </figure>
    </section>
  )
}
