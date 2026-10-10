'use client'

import Link from 'next/link'
import { useFormState } from 'react-dom'
import { ShieldCheck, Sparkles } from 'lucide-react'
import { claimFreeCredits } from './actions'
import { resolveFeedback } from '@/lib/auth-errors'
import { useLang } from '@/lib/i18n/LanguageContext'
import { AuthBanner, AuthShell, SubmitButton } from '@/components/auth/AuthShell'
import { TurnstileWidget } from '@/components/auth/TurnstileWidget'
import { TILE } from '@/app/dashboard/surface'

/**
 * The welcome screen, in the auth screens' frame and vocabulary: one card,
 * logical direction classes, no tracking, no blur. The form carries the
 * Turnstile widget exactly as the sign-up form does; the server does the rest.
 */
export default function WelcomeClient({ claimed, notice }: { claimed: boolean; notice: 'linked' | null }) {
  const { t, lang } = useLang()
  const [state, action] = useFormState(claimFreeCredits, undefined)
  const feedback = resolveFeedback(state)

  if (notice === 'linked') {
    return (
      <AuthShell title={t('welcome.linked.title')}>
        <div className="flex flex-col items-center space-y-5 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <ShieldCheck className="h-7 w-7" aria-hidden />
          </span>
          <p role="status" className="max-w-xs text-[15px] leading-relaxed text-slate-300">
            {t('welcome.linked.body')}
          </p>
          <Link
            href={claimed ? '/dashboard' : '/welcome'}
            className="flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full bg-brand px-6 text-base font-bold text-white shadow-glow-brand hover:bg-brand/90"
          >
            {t('welcome.linked.continue')}
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('welcome.title')} sub={t('welcome.sub')}>
      <form action={action} className="space-y-4">
        <div className={`${TILE} flex items-start gap-3 p-4`}>
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
          <p className="text-sm leading-relaxed text-slate-300">{t('welcome.what')}</p>
        </div>

        {/* Free credits are handed out here, so this form carries the check. */}
        <TurnstileWidget lang={lang === 'ar' ? 'ar' : 'en'} resetKey={state} />

        {feedback && <AuthBanner feedback={feedback} />}

        <SubmitButton label={t('welcome.button')} pendingLabel={t('welcome.pending')} />
      </form>
    </AuthShell>
  )
}
