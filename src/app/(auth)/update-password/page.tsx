"use client"

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { updatePassword } from '../login/actions'
import type { AuthResult } from '../login/actions'
import { useLang } from '@/lib/i18n/LanguageContext'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-base rounded-xl shadow-[0_0_24px_-6px_rgba(124,58,237,0.7)] transition-all active:scale-[0.99] disabled:opacity-70"
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

export default function UpdatePasswordPage() {
  const { t } = useLang()
  const [showPassword, setShowPassword] = useState(false)
  const [state, action] = useFormState(updatePassword, undefined)

  let feedback: string | null = null
  if (state) {
    feedback = state.code === 'unknown' && state.detail ? state.detail : t(`login.err.${state.code}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070710] px-4 py-10 sm:py-12 relative overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-indigo-500/10 rounded-full blur-[120px]" />
      </div>

      <Card className="w-full max-w-md bg-white/[0.04] backdrop-blur-2xl border-white/10 shadow-[0_0_60px_-25px_rgba(124,58,237,0.45)] rounded-2xl overflow-hidden relative z-10">
        <CardHeader className="space-y-3 pb-6 pt-8">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300/90 to-amber-500/80 text-black shadow-[0_0_18px_-4px_rgba(251,191,36,0.6)]">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-wide text-slate-200">UnicornApps</span>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-white">
            {t('login.updateTitle')}
          </CardTitle>
          <CardDescription className="text-slate-400 text-[15px] leading-relaxed">
            {t('login.updateSub')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                {t('login.newPassword')}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="bg-black/40 border-white/10 text-white placeholder:text-slate-600 focus:border-violet-500/60 focus:ring-violet-500/20 transition-all h-12 rounded-xl ltr:pr-12 rtl:pl-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute top-1/2 -translate-y-1/2 ltr:right-3 rtl:left-3 text-slate-500 hover:text-violet-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {feedback && (
              <div role="alert" className="rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-300">
                {feedback}
              </div>
            )}

            <SubmitButton label={t('login.updateButton')} pendingLabel={t('login.updatePending')} />
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
