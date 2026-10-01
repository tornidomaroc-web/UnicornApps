'use client'

import { useEffect } from 'react'
import StatusScreen, { STATUS_GHOST, STATUS_PRIMARY } from '@/components/StatusScreen'
import { useLang } from '@/lib/i18n/LanguageContext'

// A page that threw while rendering. Rendered inside the root layout, so the
// site bar and the language survive the failure.
//
// The error itself goes to the console and NEVER to the screen: its message is
// untranslated English at best and internal detail at worst.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLang()
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <StatusScreen titleKey="err.crash.title" bodyKey="err.crash.body">
      <button type="button" onClick={reset} className={STATUS_PRIMARY}>
        {t('err.retry')}
      </button>
      {/* A plain link, not a client transition: after a failure the way home
          should reload the app from the server. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className={STATUS_GHOST}>
        {t('legal.back')}
      </a>
    </StatusScreen>
  )
}
