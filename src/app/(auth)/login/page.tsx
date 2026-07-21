"use client"

import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { login, signup, requestPasswordReset, signInWithGoogle } from './actions'
import type { AuthResult } from './actions'
import { useLang } from '@/lib/i18n/LanguageContext'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2, MailCheck, Sparkles } from 'lucide-react'

type Mode = 'signin' | 'signup' | 'reset'

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full h-12 bg-brand hover:bg-brand/90 text-white font-semibold text-base rounded-xl shadow-[0_0_24px_-6px_rgb(var(--ua-brand-glow)/0.7)] transition-all active:scale-[0.99] disabled:opacity-70 disabled:active:scale-100"
    >
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  )
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  const { t } = useLang()
  const [mode, setMode] = useState<Mode>('signin')
  const [showPassword, setShowPassword] = useState(false)

  const [signinState, signinAction] = useFormState(login, undefined)
  const [signupState, signupAction] = useFormState(signup, undefined)
  const [resetState, resetAction] = useFormState(requestPasswordReset, undefined)

  // Successful signup with "Confirm email" ON returns { code: 'check_email' } and
  // no session. Promote that guidance to a full-panel view (replacing the form) so
  // it can't be missed — a thin inline banner under an unchanged form reads as
  // "nothing happened". Driven by a local view flag so switching modes afterwards
  // doesn't re-surface it; a fresh signup submit re-opens it (new state object).
  const [checkEmailOpen, setCheckEmailOpen] = useState(false)
  useEffect(() => {
    if (signupState?.code === 'check_email') setCheckEmailOpen(true)
  }, [signupState])

  const handleBackToSignin = () => {
    setCheckEmailOpen(false)
    setMode('signin')
    setShowPassword(false)
  }

  const state: AuthResult | undefined =
    mode === 'signin' ? signinState : mode === 'signup' ? signupState : resetState
  const action =
    mode === 'signin' ? signinAction : mode === 'signup' ? signupAction : resetAction

  // Translate an action result code into a user-facing message.
  let feedback: { kind: 'success' | 'error'; text: string } | null = null
  if (state) {
    if (state.code === 'check_email' || state.code === 'reset_sent') {
      feedback = { kind: 'success', text: t(`login.msg.${state.code}`) }
    } else if (state.code === 'unknown' && state.detail) {
      feedback = { kind: 'error', text: state.detail }
    } else {
      feedback = { kind: 'error', text: t(`login.err.${state.code}`) }
    }
  } else if (searchParams.error) {
    // OAuth / callback failures arrive here as ?error=...
    feedback = { kind: 'error', text: searchParams.error }
  }

  const title =
    mode === 'signin'
      ? t('login.signinTitle')
      : mode === 'signup'
      ? t('login.signupTitle')
      : t('login.resetTitle')
  const sub =
    mode === 'signin'
      ? t('login.signinSub')
      : mode === 'signup'
      ? t('login.signupSub')
      : t('login.resetSub')

  // Google provider is currently disabled in Supabase, so the button can't work.
  // Flip to true once it's enabled (Supabase → Authentication → Providers → Google)
  // to restore the "Continue with Google" button and the "or" divider.
  const GOOGLE_ENABLED = false
  const showPasswordField = mode !== 'reset'
  const showSocial = GOOGLE_ENABLED && mode !== 'reset'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070710] px-4 py-10 sm:py-12 relative overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-brand/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-brand/10 rounded-full blur-[120px]" />
        <div className="absolute top-[30%] right-[20%] w-[20%] h-[20%] bg-brand/5 rounded-full blur-[100px]" />
      </div>

      <Card className="w-full max-w-md bg-white/[0.04] backdrop-blur-2xl border-white/10 shadow-[0_0_60px_-25px_rgb(var(--ua-brand-glow)/0.45)] rounded-2xl overflow-hidden relative z-10">
        <CardHeader className="space-y-3 pb-6 pt-8">
          {/* Brand mark — home link. w-fit is load-bearing: CardHeader is a flex
              COLUMN, so a stretched <a> would make the whole blank header row
              clickable and a stray tap would navigate away mid-signup, discarding
              typed credentials. Bound the target to the lockup itself. */}
          <Link
            href="/"
            className="flex w-fit items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-[0_0_18px_-4px_rgb(var(--ua-brand-glow)/0.6)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-wide text-slate-200">UnicornApps</span>
          </Link>
          <CardTitle className="text-3xl font-bold tracking-tight text-white">
            {title}
          </CardTitle>
          <CardDescription className="text-slate-400 text-[15px] leading-relaxed">
            {sub}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {checkEmailOpen ? (
            <div className="flex flex-col items-center text-center space-y-4 py-6">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 shadow-[0_0_28px_-8px_rgba(16,185,129,0.6)]">
                <MailCheck className="h-7 w-7" />
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                {t('login.msg.check_email_title')}
              </h2>
              <p role="status" className="text-slate-300 text-[15px] leading-relaxed max-w-xs">
                {t('login.msg.check_email')}
              </p>
              <Button
                type="button"
                onClick={handleBackToSignin}
                className="w-full h-12 bg-brand hover:bg-brand/90 text-white font-semibold text-base rounded-xl shadow-[0_0_24px_-6px_rgb(var(--ua-brand-glow)/0.7)] transition-all active:scale-[0.99]"
              >
                {t('login.action.back_to_sign_in')}
              </Button>
            </div>
          ) : (
          <>
          <form action={action} className="space-y-4" noValidate={false}>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                {t('login.email')}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t('login.emailPlaceholder')}
                required
                className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus:border-brand/60 focus:ring-brand/20 transition-all h-12 rounded-xl"
              />
            </div>

            {showPasswordField && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                    {t('login.password')}
                  </Label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => setMode('reset')}
                      className="text-xs font-medium text-brand hover:text-brand/80 transition-colors"
                    >
                      {t('login.forgot')}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder={t('login.passwordPlaceholder')}
                    required
                    minLength={mode === 'signup' ? 6 : undefined}
                    className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus:border-brand/60 focus:ring-brand/20 transition-all h-12 rounded-xl ltr:pr-12 rtl:pl-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    className="absolute top-1/2 -translate-y-1/2 ltr:right-3 rtl:left-3 text-slate-500 hover:text-brand transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {feedback && (
              <div
                role={feedback.kind === 'error' ? 'alert' : 'status'}
                className={
                  feedback.kind === 'error'
                    ? 'rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-300'
                    : 'rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-sm text-emerald-300'
                }
              >
                {feedback.text}
              </div>
            )}

            <SubmitButton
              label={
                mode === 'signin'
                  ? t('login.signinButton')
                  : mode === 'signup'
                  ? t('login.signupButton')
                  : t('login.resetButton')
              }
              pendingLabel={
                mode === 'signin'
                  ? t('login.signinPending')
                  : mode === 'signup'
                  ? t('login.signupPending')
                  : t('login.resetPending')
              }
            />

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="w-full text-center text-sm font-medium text-slate-400 hover:text-white transition-colors"
              >
                {t('login.backToSignin')}
              </button>
            )}
          </form>

          {showSocial && (
            <>
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#0b0b16] px-3 text-slate-500">{t('login.or')}</span>
                </div>
              </div>

              <form action={signInWithGoogle}>
                <Button
                  variant="outline"
                  type="submit"
                  className="w-full h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 font-medium"
                >
                  <svg
                    className="ltr:mr-3 rtl:ml-3 h-4 w-4"
                    aria-hidden="true"
                    focusable="false"
                    role="img"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 488 512"
                  >
                    <path
                      fill="currentColor"
                      d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                    />
                  </svg>
                  {t('login.google')}
                </Button>
              </form>
            </>
          )}

          {/* Mode toggle — keeps sign-in and create-account clearly distinct */}
          {mode !== 'reset' && (
            <p className="text-center text-sm text-slate-400 pt-1">
              {mode === 'signin' ? t('login.noAccount') : t('login.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setShowPassword(false)
                }}
                className="font-semibold text-brand hover:text-brand/80 transition-colors"
              >
                {mode === 'signin' ? t('login.createOne') : t('login.signinLink')}
              </button>
            </p>
          )}
          </>
          )}
        </CardContent>

        <CardFooter className="pb-8 pt-2">
          <p className="px-4 text-center text-xs text-slate-500 leading-relaxed mx-auto">
            {t('login.agreePrefix')}{' '}
            <Link href="/terms" className="underline underline-offset-4 hover:text-slate-300 transition-colors">
              {t('login.terms')}
            </Link>{' '}
            {t('login.and')}{' '}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-slate-300 transition-colors">
              {t('login.privacy')}
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
