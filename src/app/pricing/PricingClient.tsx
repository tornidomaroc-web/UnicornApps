'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, Globe, Shield, Sparkles, Zap, type LucideIcon } from 'lucide-react'
import { SURFACE } from '@/app/dashboard/surface'
import Footer from '@/components/layout/Footer'
import { CARD, PAGE, SectionHead, WRAP } from '@/components/marketing/Marketing'
import { useLang } from '@/lib/i18n/LanguageContext'
import { useIsNative } from '@/hooks/useIsNative'
import { openCheckout } from '@/lib/checkout'
import { useCreditGrantPoll } from '@/hooks/useCreditGrantPoll'
import { bannerToneClass, checkoutBannerTone } from '@/lib/dashboard-banner'

/**
 * The pricing page in the marketing pages' own vocabulary: SURFACE cards, a
 * round icon chip beside a name, sentence-case bold type, one pill per action.
 *
 * WEIGHT. No framer-motion, no blur, no glow blobs, no scale transforms. The
 * first paint is the final paint: nothing is shipped hidden to fade in later.
 *
 * PHONE FIRST. One column, three from md. Every action is a pill at least 56px
 * tall whose label may wrap onto a second line rather than clip, so no label
 * is cut at 360px in either language.
 *
 * DIRECTION. Logical classes only. Prices are Latin and pinned ltr inside the
 * Arabic surface.
 *
 * MONEY. Paid tiers, the merchant-of-record line and the contact card render
 * only under `showPaid`, false until native detection has resolved to web.
 * The server redirect in page.tsx keeps native off this page entirely; this is
 * the client backstop.
 */
const PILL =
  'inline-flex min-h-14 w-full items-center justify-center rounded-full px-6 py-3 text-center text-base font-bold leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60'
const PRIMARY = `${PILL} bg-brand text-white shadow-glow-brand hover:bg-brand/90 focus-visible:ring-white/60`
const GHOST = `${PILL} border border-white/10 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-brand/60`
const FEATURED = 'rounded-3xl border border-brand/50 bg-brand/[0.06]'

export default function PricingClient({
  initialUserId,
  initialCredits,
}: {
  initialUserId: string | null
  // The server-rendered balance (same read the navbar counter is seeded from).
  // The post-purchase poll watches THIS prop move; without it, a buyer who paid
  // here saw the counter frozen until a full reload.
  initialCredits: number
}) {
  const { t } = useLang()
  // Backstop: the server already redirects /pricing → / on native, but if that
  // is ever bypassed, default to HIDDEN and only reveal paid tiers once the
  // client confirms it is web. No native flash of paid plans / Paddle links.
  const { isNative, resolved } = useIsNative()
  const showPaid = resolved && !isNative
  const router = useRouter()
  // Seeded from the SERVER (page.tsx reads the validated session and passes the
  // id down). We do NOT read auth in the browser: the browser Supabase client
  // cannot see the auth cookie in this deployment, so a client getSession()
  // returned null for signed-in users and the paid CTA dead-ended at /login.
  // This page remounts on every visit (page is force-dynamic) and auth
  // transitions navigate away from /pricing, so a one-time seed is enough — no
  // reconcile effect needed.
  const [userId] = useState<string | null>(initialUserId)
  // Checkout lifecycle + post-purchase credit reconciliation: one shared hook
  // with the dashboard (hooks/useCreditGrantPoll.ts), so the two surfaces
  // cannot drift and the poll's stop condition is the same server-rendered
  // value on both.
  const { checkoutStatus: status, setCheckoutStatus: setStatus } = useCreditGrantPoll(initialCredits)
  // Which tier is opening, from the click until Paddle's overlay is up (or the
  // attempt failed). Both paid CTAs disable so the dynamic-import + CDN
  // round-trip cannot be clicked through twice, but only the clicked one shows
  // the pending label. lib/checkout.ts holds the real interlock (see there).
  const [pending, setPending] = useState<'sub' | 'pack' | null>(null)

  const handlePaid = async (kind: 'sub' | 'pack') => {
    if (pending) return
    setPending(kind)
    setStatus(null)
    try {
      await openCheckout({ kind, userId, navigate: (path) => router.push(path) })
    } catch (err) {
      // Paddle.js failed to load. Previously `void`-ed, so the button silently
      // did nothing and every later click in the session failed the same way.
      console.error('Checkout: Paddle failed to load', err)
      setStatus('error')
    } finally {
      setPending(null)
    }
  }

  // Three cards: Free (signup credits) + the two locked paid products. All copy
  // is sourced from LanguageContext (EN + AR). The app shows no ads anywhere, so
  // no card may claim an ad-related benefit in either direction.
  const tiers: {
    name: string
    price: string
    period: string
    description: string
    features: string[]
    cta: string
    featured: boolean
    href?: string
    checkoutKind?: 'sub' | 'pack'
    icon: LucideIcon
  }[] = [
    {
      name: t('pricing.free'),
      price: '$0',
      period: '',
      description: t('pricing.free.desc'),
      features: [t('pricing.f.gen3'), t('pricing.f.vision.std'), t('pricing.f.seo.basic'), t('pricing.f.nocard')],
      cta: t('pricing.cta.free'),
      featured: false,
      href: '/login',
      icon: Shield,
    },
    {
      name: t('pricing.sub.name'),
      price: t('pricing.sub.price'),
      period: t('pricing.sub.period'),
      description: t('pricing.sub.desc'),
      features: [t('pricing.f.credits100'), t('pricing.f.percredit'), t('pricing.f.allai')],
      cta: t('pricing.sub.cta'),
      featured: true,
      checkoutKind: 'sub',
      icon: Sparkles,
    },
    {
      name: t('pricing.pack.name'),
      price: t('pricing.pack.price'),
      period: t('pricing.pack.period'),
      description: t('pricing.pack.desc'),
      features: [t('pricing.f.credits30'), t('pricing.f.noexpiry'), t('pricing.f.allai')],
      cta: t('pricing.pack.cta'),
      featured: false,
      checkoutKind: 'pack',
      icon: Zap,
    },
  ]

  const shown = showPaid ? tiers : tiers.filter((tier) => !tier.checkoutKind)

  return (
    <main className={PAGE}>
      <div className={WRAP}>
        <section className={CARD}>
          <SectionHead eyebrow={t('pricing.badge')} title={t('pricing.title')} sub={t('pricing.sub')} />
        </section>

        {/* Same container and tone table as the dashboard's checkout banner
            (lib/dashboard-banner.ts): green only once the grant has been SEEN,
            amber while waiting, red on failure. */}
        {status && (
          <div className={`${bannerToneClass(checkoutBannerTone(status))} mt-6`}>
            {status === 'success'
              ? t('pricing.banner.success')
              : status === 'confirmed'
                ? t('pricing.banner.confirmed')
                : status === 'success_pending'
                  ? t('pricing.banner.successPending')
                  : status === 'error'
                    ? t('pricing.banner.error')
                    : t('pricing.banner.failed')}
          </div>
        )}

        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {shown.map((tier) => {
            const Icon = tier.icon
            return (
              <li key={tier.name} className={`${tier.featured ? FEATURED : SURFACE} flex flex-col p-5 sm:p-6`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 className="min-w-0 text-xl font-bold text-white">{tier.name}</h2>
                  {tier.featured && (
                    <span className="rounded-full bg-brand/15 px-3 py-1 text-sm font-bold text-brand">
                      {t('pricing.popular')}
                    </span>
                  )}
                </div>

                <p className="mt-4 text-[15px] leading-relaxed text-slate-400">{tier.description}</p>

                <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
                  <span dir="ltr" className="text-[40px] font-bold leading-none text-white">
                    {tier.price}
                  </span>
                  {tier.period && <span className="text-[15px] font-medium text-slate-500">{tier.period}</span>}
                </p>

                <ul className="mt-5 flex-grow space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-[15px] leading-relaxed text-slate-300">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />
                      <span className="min-w-0">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {tier.checkoutKind ? (
                    // Paid action. Only reachable on web (showPaid filters the
                    // tier out on native); openCheckout() is a further no-op on
                    // native via getPaddle(). Null userId redirects to /login.
                    showPaid && (
                      <button
                        type="button"
                        onClick={() => void handlePaid(tier.checkoutKind!)}
                        disabled={pending !== null}
                        aria-busy={pending === tier.checkoutKind}
                        className={tier.featured ? PRIMARY : GHOST}
                      >
                        {pending === tier.checkoutKind ? t('checkout.pending') : tier.cta}
                      </button>
                    )
                  ) : (
                    <Link href={tier.href!} className={tier.featured ? PRIMARY : GHOST}>
                      {tier.cta}
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        {/* Merchant-of-record disclosure. Inside the SAME `showPaid` gate as the
            paid CTAs it describes: native never reaches this page at all
            (middleware + server redirect), and showPaid is the client backstop —
            payment copy must not outlive the buttons it belongs to. The Refund
            Policy link adds navigation only, no new claim. */}
        {showPaid && (
          <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-slate-500">
            {t('checkout.mor')}{' '}
            <Link href="/refund" className="text-slate-300 underline underline-offset-4 hover:text-white">
              {t('refund.title')}
            </Link>
          </p>
        )}

        {showPaid && (
          <section className={`${CARD} mt-6 flex flex-col gap-5 sm:flex-row sm:items-center`}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Globe className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-white">{t('pricing.enterprise.title')}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-400">{t('pricing.enterprise.sub')}</p>
            </div>
            <div className="sm:w-64 sm:shrink-0">
              <a href="mailto:support@unicornapps.app" className={GHOST}>
                {t('pricing.enterprise.cta')}
              </a>
            </div>
          </section>
        )}
      </div>
      <Footer />
    </main>
  )
}
