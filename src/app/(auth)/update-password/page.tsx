"use client"

import { useState } from 'react'
import { useFormState } from 'react-dom'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { updatePassword } from '../login/actions'
import { LINK_ERROR_CODES, resolveFeedback, type AuthErrorCode } from '@/lib/auth-errors'
import { useLang } from '@/lib/i18n/LanguageContext'
import { AuthBanner, AuthShell, FIELD, LABEL, SubmitButton } from '@/components/auth/AuthShell'

export default function UpdatePasswordPage() {
  const { t } = useLang()
  const [showPassword, setShowPassword] = useState(false)
  const [state, action] = useFormState(updatePassword, undefined)
  const feedback = resolveFeedback(state)
  // Without a recovery session there is nothing to save to: the way forward is
  // a fresh link, not another attempt at this form.
  const offerNewLink = feedback?.kind === 'error' && LINK_ERROR_CODES.includes(feedback.code as AuthErrorCode)

  return (
    <AuthShell title={t('login.updateTitle')} sub={t('login.updateSub')}>
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="password" className={LABEL}>
            {t('login.newPassword')}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
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

        {feedback && (
          <AuthBanner
            feedback={feedback}
            action={
              offerNewLink ? (
                <Link href="/login?mode=reset" className="text-sm font-semibold text-white underline underline-offset-4">
                  {t('login.action.send_new_link')}
                </Link>
              ) : undefined
            }
          />
        )}

        <SubmitButton label={t('login.updateButton')} pendingLabel={t('login.updatePending')} />
      </form>
    </AuthShell>
  )
}
