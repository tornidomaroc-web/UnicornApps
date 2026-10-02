'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { SURFACE, TILE } from '@/app/dashboard/surface'
import { useIsNative } from '@/hooks/useIsNative'
import { DELETED_FLAG } from '@/lib/account-delete'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * How to delete an account and what deleting does, in both languages.
 *
 * PUBLIC. Nothing here reads a session: the page must answer a signed-out
 * visitor, because that is who a store reviewer is.
 *
 * EVERY CLAIM FOLLOWS THE CODE. Deleting the auth user removes the profile
 * (email, credit balance) and every generation with it. Purchase records and
 * usage counts are kept with their user reference cleared, so the page says
 * so instead of promising that everything goes.
 *
 * MONEY. The sentences about purchase records and subscriptions are WEB
 * ONLY, hidden until native detection resolves to web, the same gate every
 * other payment surface uses.
 *
 * DIRECTION. Logical classes only, no letter-spacing.
 */
const CARD = `${SURFACE} p-5 sm:p-8`
const H2 = 'text-xl font-bold text-white'
const BODY = 'mt-2 text-[15px] leading-relaxed text-slate-400'

export default function DeleteAccountClient() {
  const { t } = useLang()
  const { isNative, resolved } = useIsNative()
  const showPricing = resolved && !isNative

  // Set by the account screen after a successful delete, read once.
  const [done, setDone] = useState(false)
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DELETED_FLAG)) {
        window.sessionStorage.removeItem(DELETED_FLAG)
        setDone(true)
      }
    } catch {
      // Storage unavailable: the page is still correct without the notice.
    }
  }, [])

  const steps = [t('del.how.1'), t('del.how.2'), t('del.how.3')]

  return (
    <div className="min-h-[100dvh] bg-[#070710] px-4 pb-10 pt-6 text-[#c8cfe0] sm:pt-12">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        {done && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-[15px] font-bold leading-relaxed text-emerald-200"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
            <p>{t('del.done')}</p>
          </div>
        )}

        <section className={CARD}>
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">{t('del.title')}</h1>
          <p className={BODY}>{t('del.intro')}</p>
        </section>

        <section className={CARD}>
          <h2 className={H2}>{t('del.how.title')}</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className={`${TILE} flex items-start gap-4 p-4`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/15 text-base font-bold text-brand">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-2 text-[15px] leading-relaxed text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
          {!done && (
            <Link
              href="/account"
              className="mt-4 flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-6 text-base font-bold text-white transition-colors hover:bg-white/10"
            >
              {t('del.cta')}
            </Link>
          )}
        </section>

        <section className={CARD}>
          <h2 className={H2}>{t('del.what.title')}</h2>
          <p className={BODY}>{t('del.what.body')}</p>
          {showPricing && <p className={BODY}>{t('del.what.subscription')}</p>}
        </section>

        <section className={CARD}>
          <h2 className={H2}>{t('del.keep.title')}</h2>
          <p className={BODY}>{t('del.keep.usage')}</p>
          {showPricing && <p className={BODY}>{t('del.keep.payments')}</p>}
        </section>

        <section className={CARD}>
          <h2 className={H2}>{t('del.help.title')}</h2>
          <p className={BODY}>
            {t('del.help.before')}{' '}
            <a
              href="mailto:support@unicornapps.app"
              dir="ltr"
              className="font-bold text-brand underline underline-offset-4 [overflow-wrap:anywhere]"
            >
              support@unicornapps.app
            </a>{' '}
            {t('del.help.after')}
          </p>
        </section>
      </div>
    </div>
  )
}
