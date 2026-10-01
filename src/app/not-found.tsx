'use client'

import Link from 'next/link'
import StatusScreen, { STATUS_PRIMARY } from '@/components/StatusScreen'
import { useLang } from '@/lib/i18n/LanguageContext'

// Any address the app does not have. Rendered inside the root layout, so the
// site bar and the language are the same as everywhere else.
export default function NotFound() {
  const { t } = useLang()
  return (
    <StatusScreen titleKey="err.notFound.title" bodyKey="err.notFound.body">
      <Link href="/" className={STATUS_PRIMARY}>
        {t('legal.back')}
      </Link>
    </StatusScreen>
  )
}
