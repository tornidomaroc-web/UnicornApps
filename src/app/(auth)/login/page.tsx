"use client"

import { useEffect, useState } from 'react'
import { useFormState } from 'react-dom'
import Link from 'next/link'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { login, signup, requestPasswordReset } from './actions'
import {
  LINK_ERROR_CODES,
  callbackErrorCode,
  resolveFeedback,
  type AuthErrorCode,
} from '@/lib/auth-errors'
import { useLang } from '@/lib/i18n/LanguageContext'
import { AuthBanner, AuthShell, FIELD, LABEL, SubmitButton } from '@/components/auth/AuthShell'
import { SocialButtons } from '@/components/auth/SocialButtons'
import { TurnstileWidget } from '@/components/auth/TurnstileWidget'
import { TILE } from '@/app/dashboard/surface'
import { useIsNative } from '@/hooks/useIsNative'

type Mode = 'signin' | 'signup' | 'reset'
const MODES: readonly Mode[] = ['signin', 'signup', 'reset']

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string | string[]; mode?: string | string[] }
}) {
  const { t, lang } = useLang()
  // Inside the Android app there is no Google button (the WebView cannot run
  // it), so an account made with Google on the website has no way in but a
  // password. The hint below the sign-in form says how to set one. Shown only
  // once native detection has RESOLVED to native: never on the web.
  const native = useIsNative()
  const requestedMode = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode
  const [mode, setMode] = useState<Mode>(
    MODES.includes(requestedMode as Mode) ? (requestedMode as Mode) : 'signin'
  )
  const [showPassword, setShowPassword] = useState(false)
  // The URL error is shown until the user does something; switching mode or
  // submitting a form replaces it.
  const [urlError, setUrlError] = useState<unknown>(searchParams.error)

  const [signinState, signinAction] = useFormState(login, undefined)
  const [signupState, signupAction] = useFormState(signup, undefined)
  const [resetState, resetAction] = useFormState(requestPasswordReset, undefined)

  // An implicit-flow failure arrives in the FRAGMENT (#error=…&error_code=…),
  // which the server never sees, and a redirect without its own fragment
  // carries the old one along. Read it here, reduce it to a code like the
  // callback does, and clear it from the address bar.
  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    if (!hash) return
    const p = new URLSearchParams(hash)
    const error = p.get('error')
    const errorCode = p.get('error_code')
    if (!error && !errorCode) return
    setUrlError(callbackErrorCode({ error, error_code: errorCode }))
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  // Successful signup with "Confirm email" ON returns { code: 'check_email' } and
  // no session. Promote that guidance to a full-panel view (replacing the form) so
  // it can't be missed. Driven by a local view flag so switching modes afterwards
  // doesn't re-surface it; a fresh signup submit re-opens it (new state object).
  const [checkEmailOpen, setCheckEmailOpen] = useState(false)
  useEffect(() => {
    if (signupState?.code === 'check_email') setCheckEmailOpen(true)
  }, [signupState])

  // A sent reset link gets the same full panel. The one-line banner it used to
  // get was rendered only while `mode` was 'reset': the result and the view
  // were coupled through a tab, so anything that moved the tab during the
  // request left the user on the sign-in form with no confirmation at all.
  // The panel is driven by the result alone and replaces the form, so it
  // cannot be missed and cannot be lost to a mode change.
  const [resetSentOpen, setResetSentOpen] = useState(false)
  useEffect(() => {
    if (resetState?.code === 'reset_sent') setResetSentOpen(true)
  }, [resetState])
  const mailPanel = checkEmailOpen ? 'check_email' : resetSentOpen ? 'reset_sent' : null

  const switchMode = (next: Mode) => {
    setMode(next)
    setShowPassword(false)
    setUrlError(undefined)
  }

  const state = mode === 'signin' ? signinState : mode === 'signup' ? signupState : resetState
  const action = mode === 'signin' ? signinAction : mode === 'signup' ? signupAction : resetAction
  const feedback = resolveFeedback(state, urlError)
  const offerNewLink =
    feedback?.kind === 'error' && mode !== 'reset' && LINK_ERROR_CODES.includes(feedback.code as AuthErrorCode)

  const title =
    mode === 'signin' ? t('login.signinTitle') : mode === 'signup' ? t('login.signupTitle') : t('login.resetTitle')
  const sub =
    mode === 'signin' ? t('login.signinSub') : mode === 'signup' ? t('login.signupSub') : t('login.resetSub')

  const footer = (
    <>
      {t('login.agreePrefix')}{' '}
      <Link href="/terms" className="underline underline-offset-4 hover:text-slate-300">
        {t('login.terms')}
      </Link>{' '}
      {/* Arabic "و" is written joined to the word it introduces. */}
      {t('login.and')}
      {lang === 'ar' ? '' : ' '}
      <Link href="/privacy" className="underline underline-offset-4 hover:text-slate-300">
        {t('login.privacy')}
      </Link>
      .
    </>
  )

  if (mailPanel) {
    return (
      <AuthShell title={t(`login.msg.${mailPanel}_title`)} footer={footer}>
        <div className="flex flex-col items-center space-y-5 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <MailCheck className="h-7 w-7" aria-hidden />
          </span>
          <p role="status" className="max-w-xs text-[15px] leading-relaxed text-slate-300">
            {t(`login.msg.${mailPanel}`)}
          </p>
          <button
            type="button"
            onClick={() => {
              setCheckEmailOpen(false)
              setResetSentOpen(false)
              switchMode('signin')
            }}
            className="flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full bg-brand px-6 text-base font-bold text-white shadow-glow-brand hover:bg-brand/90"
          >
            {t('login.action.back_to_sign_in')}
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={title} sub={sub} footer={footer}>
      <div className="space-y-5">
        {mode !== 'reset' && (
          <div className={`${TILE} grid grid-cols-2 gap-1 p-1`}>
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={`h-11 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {m === 'signin' ? t('login.signinLink') : t('login.signupButton')}
              </button>
            ))}
          </div>
        )}

        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="email" className={LABEL}>
              {t('login.email')}
            </label>
            {/* An address is Latin and left-to-right in every UI language. */}
            <input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              placeholder={t('login.emailPlaceholder')}
              required
              className={FIELD}
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="password" className={LABEL}>
                  {t('login.password')}
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="mb-1.5 text-sm font-medium text-brand hover:text-brand/80"
                  >
                    {t('login.forgot')}
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={t('login.passwordPlaceholder')}
                  required
                  minLength={mode === 'signup' ? 6 : undefined}
                  className={`${FIELD} pe-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-brand"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              </div>
            </div>
          )}

          {/* Sign-up hands out free credits, so it alone carries the check. */}
          {mode === 'signup' && <TurnstileWidget lang={lang === 'ar' ? 'ar' : 'en'} resetKey={signupState} />}

          {feedback && (
            <AuthBanner
              feedback={feedback}
              action={
                offerNewLink ? (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-sm font-semibold text-white underline underline-offset-4"
                  >
                    {t('login.action.send_new_link')}
                  </button>
                ) : undefined
              }
            />
          )}

          <SubmitButton
            label={
              mode === 'signin' ? t('login.signinButton') : mode === 'signup' ? t('login.signupButton') : t('login.resetButton')
            }
            pendingLabel={
              mode === 'signin' ? t('login.signinPending') : mode === 'signup' ? t('login.signupPending') : t('login.resetPending')
            }
          />
        </form>

        {mode === 'reset' ? (
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className="w-full text-center text-sm font-medium text-slate-400 hover:text-white"
          >
            {t('login.backToSignin')}
          </button>
        ) : (
          <SocialButtons />
        )}

        {mode === 'signin' && native.resolved && native.isNative && (
          <p className="text-center text-xs leading-relaxed text-slate-500">{t('login.nativeGoogleHint')}</p>
        )}
      </div>
    </AuthShell>
  )
}
