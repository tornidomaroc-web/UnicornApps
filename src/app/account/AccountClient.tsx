'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, TriangleAlert } from 'lucide-react'
import { SURFACE, TILE } from '@/app/dashboard/surface'
import { FIELD, LABEL } from '@/components/auth/AuthShell'
import { DELETED_FLAG, deleteErrorKey, isDeleteConfirmed, type DeleteErrorKey } from '@/lib/account-delete'
import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * The account screen, in the dashboard's surface vocabulary: one SURFACE card
 * for who is signed in, one for deleting the account.
 *
 * DELETING TAKES THREE DELIBERATE ACTS. The card opens closed, with one
 * outlined button. Opening it shows what is lost, a field for the
 * confirmation word and the red button, which stays disabled until the word
 * is typed. There is no <form>, so the keyboard's Go key cannot submit it:
 * only a tap on the red button does.
 *
 * ERRORS ARE KEYS. A failed request picks a translated sentence from the
 * status alone (lib/account-delete.ts). Nothing from a response body or an
 * exception is ever rendered.
 *
 * DIRECTION. Logical classes only, no letter-spacing. The email and the
 * confirmation field set their own direction: an address is Latin in every
 * language, and the field takes whichever word the user types.
 */
const PILL =
  'flex h-14 w-full items-center justify-center whitespace-nowrap rounded-full px-6 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2'
const GHOST = `${PILL} border border-white/10 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-brand/60`

export default function AccountClient({ email }: { email: string }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<DeleteErrorKey | null>(null)
  const ready = isDeleteConfirmed(confirm)

  const close = () => {
    setOpen(false)
    setConfirm('')
    setErrorKey(null)
  }

  const handleDelete = async () => {
    if (!ready || busy) return
    setBusy(true)
    setErrorKey(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        setErrorKey(deleteErrorKey(res.status))
        setBusy(false)
        return
      }
      // The public deletion page confirms it. A full navigation, so the site
      // bar is rebuilt from the server and stops showing the deleted account.
      try {
        window.sessionStorage.setItem(DELETED_FLAG, '1')
      } catch {
        // Storage can be unavailable; the page then shows without the notice.
      }
      window.location.replace('/delete-account')
    } catch {
      setErrorKey('account.err.failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#070710] px-4 pb-10 pt-6 text-[#c8cfe0] sm:pt-12">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <section className={`${SURFACE} p-5 sm:p-8`}>
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">{t('account.title')}</h1>
          <div className={`${TILE} mt-6 p-4`}>
            <p className="text-sm font-medium text-slate-400">{t('account.email')}</p>
            <p className="mt-1 text-base font-bold text-white [overflow-wrap:anywhere]">
              <bdi dir="ltr">{email}</bdi>
            </p>
          </div>
        </section>

        <section className={`${SURFACE} p-5 sm:p-8`}>
          <h2 className="text-xl font-bold text-white">{t('account.delete.title')}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">{t('account.delete.body')}</p>
          <Link
            href="/delete-account"
            className="mt-2 inline-flex min-h-[44px] items-center text-[15px] font-bold text-brand underline underline-offset-4 hover:text-brand/80"
          >
            {t('del.what.title')}
          </Link>

          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`${PILL} mt-4 border border-red-500/40 text-red-300 hover:bg-red-500/10 focus-visible:ring-red-500/50`}
            >
              {t('account.delete.start')}
            </button>
          ) : (
            <div className="mt-4 space-y-4 rounded-2xl border border-red-500/25 bg-red-500/5 p-4">
              <div>
                <label htmlFor="delete-word" className={LABEL}>
                  {t('account.delete.confirmLabel')}
                </label>
                <input
                  id="delete-word"
                  dir="auto"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={FIELD}
                />
              </div>

              {errorKey && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-200"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>{t(errorKey)}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleDelete}
                disabled={!ready || busy}
                aria-busy={busy}
                className={`${PILL} bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-600`}
              >
                {busy ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" aria-hidden />
                    {t('account.delete.pending')}
                  </>
                ) : (
                  t('account.delete.submit')
                )}
              </button>
              <button type="button" onClick={close} disabled={busy} className={`${GHOST} disabled:opacity-40`}>
                {t('account.delete.cancel')}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
