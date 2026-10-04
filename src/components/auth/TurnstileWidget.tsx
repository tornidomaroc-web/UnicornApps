'use client'

import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile on the SIGN-UP form only.
 *
 * Renders Cloudflare's widget into a box inside the form. The widget writes
 * its token into a hidden `cf-turnstile-response` field there, so the token
 * travels with the form's own submit; the server checks it (lib/turnstile.ts).
 * In managed mode most people see a short "verifying" line and never click.
 *
 * `resetKey` changes after every submit result: a token is single-use, so the
 * widget must fetch a fresh one before the next attempt.
 *
 * No site key configured means no widget. The server then refuses sign-up,
 * which is why the switch-on order puts both keys in place before the code.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => {
        scriptPromise = null
        reject(new Error('turnstile script failed to load'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export function TurnstileWidget({ lang, resetKey }: { lang: 'en' | 'ar'; resetKey: unknown }) {
  const box = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!siteKey) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widgetId.current) return
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          theme: 'dark',
          size: 'flexible',
          language: lang,
          'refresh-expired': 'auto',
        })
      })
      .catch(() => {
        // Blocked or offline: no token, so the server answers captcha_failed
        // and the screen says so in the user's language.
      })
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
    // A language switch re-renders the widget in the new language.
  }, [siteKey, lang])

  useEffect(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [resetKey])

  if (!siteKey) return null
  return <div ref={box} className="min-h-[65px]" data-testid="turnstile" />
}
