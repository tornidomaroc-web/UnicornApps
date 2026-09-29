'use client'

import Link from 'next/link'
import { useFormState } from 'react-dom'
import { verifyEmailLink } from './actions'
import { LINK_ERROR_CODES, resolveFeedback, type AuthErrorCode } from '@/lib/auth-errors'
import type { EmailOtpType } from '@/lib/email-links'
import { useLang } from '@/lib/i18n/LanguageContext'
import { AuthBanner, AuthShell, SubmitButton } from '@/components/auth/AuthShell'

/**
 * The Continue step of an email link. One button; the token rides along as
 * hidden fields and is verified by the server action on submit. Same shell,
 * same banner and same failure copy as the other auth screens.
 */
export function ConfirmForm({ tokenHash, type, next }: { tokenHash: string; type: EmailOtpType; next: string }) {
  const { t } = useLang()
  const [state, action] = useFormState(verifyEmailLink, undefined)
  const feedback = resolveFeedback(state)
  const offerNewLink = feedback?.kind === 'error' && LINK_ERROR_CODES.includes(feedback.code as AuthErrorCode)
  const recovery = type === 'recovery'

  return (
    <AuthShell
      title={recovery ? t('login.confirm.recoveryTitle') : t('login.confirm.emailTitle')}
      sub={recovery ? t('login.confirm.recoverySub') : t('login.confirm.emailSub')}
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />

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

        <SubmitButton label={t('login.confirm.button')} pendingLabel={t('login.confirm.pending')} />
      </form>
    </AuthShell>
  )
}
