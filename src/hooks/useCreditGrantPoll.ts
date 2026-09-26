'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PADDLE_EVENT } from '@/lib/paddle'
import { checkoutStatusForEvent, type CheckoutStatus } from '@/lib/checkout'
import {
  pollForCreditGrant,
  shouldCatchUpOnFocus,
  statusAfterLateCredits,
  statusAfterPoll,
  type CreditPollLock,
} from '@/lib/credit-refresh'

/**
 * Post-purchase credit reconciliation, shared by every surface that opens a
 * Paddle checkout (the dashboard and /pricing).
 *
 * THE RACE
 * `checkout.completed` fires in the BROWSER the moment Paddle's overlay reports
 * success. The credits are granted on the SERVER when Paddle delivers
 * `transaction.completed` to the webhook. Nothing orders those two, so a single
 * router.refresh() usually re-renders the SAME stale count.
 *
 * THE MECHANISM (three phases, all driven off `initialCredits`, the
 * server-rendered balance the page was given — which is also what the navbar's
 * credit counter is seeded from, so when this value moves, the counter moves)
 *   1. checkout.completed → status 'success', then poll: refresh on a backoff
 *      and stop the moment the server-rendered value leaves its baseline
 *      (lib/credit-refresh.ts). 'confirmed' when it does, 'success_pending' at
 *      the ceiling.
 *   2. After the ceiling: no more polling. Re-read once whenever the tab regains
 *      focus or becomes visible (the buyer comes back from their receipt email),
 *      coalesced so a flurry of focus events costs one refresh.
 *   3. Whenever the prop moves off the baseline while pending — from a focus
 *      catch-up, a navigation, anything — flip to 'confirmed'.
 *
 * Every value the listeners need is reached through a ref, so both effects are
 * installed once per mount and a poll is never cancelled by an unrelated
 * re-render. Event-name → status lives in lib/checkout.ts so the two surfaces
 * cannot drift.
 */
export function useCreditGrantPoll(initialCredits: number) {
  const router = useRouter()
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null)

  // Always read through a ref, never a closure: the poll outlives the render it
  // was started from, and the whole point is to observe the prop CHANGING.
  const creditsRef = useRef(initialCredits)
  const statusRef = useRef<CheckoutStatus | null>(null)
  // The number the user was looking at when checkout.completed fired.
  const baselineRef = useRef<number | null>(null)
  const routerRef = useRef(router)
  const pollActiveRef = useRef(true)
  const pollLockRef = useRef<CreditPollLock>({ busy: false })
  // Lets unmount wake a sleeping poll immediately instead of leaving a timer
  // pending for up to 8s. Resolves (never hangs) so the loop can observe
  // isActive() === false and unwind.
  const cancelSleepRef = useRef<(() => void) | null>(null)
  const lastRefreshAtRef = useRef<number | null>(null)

  useEffect(() => {
    routerRef.current = router
  }, [router])

  useEffect(() => {
    statusRef.current = checkoutStatus
  }, [checkoutStatus])

  // Phase 3: a late landing observed through the prop.
  useEffect(() => {
    creditsRef.current = initialCredits
    const next = statusAfterLateCredits(statusRef.current, baselineRef.current, initialCredits)
    if (next !== statusRef.current) setCheckoutStatus(next)
  }, [initialCredits])

  useEffect(() => {
    // Re-armed on mount, not just initialised, so React StrictMode's
    // mount→unmount→mount in dev doesn't leave this permanently false.
    pollActiveRef.current = true

    const onPaddle = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name?: string } | undefined
      const next = checkoutStatusForEvent(detail?.name)
      if (!next) return
      setCheckoutStatus(next)
      if (next !== 'success') return

      // Phase 1. Baseline = the number the user is looking at right now.
      baselineRef.current = creditsRef.current
      void pollForCreditGrant(creditsRef.current, {
        refresh: () => {
          lastRefreshAtRef.current = Date.now()
          routerRef.current.refresh()
        },
        readCredits: () => creditsRef.current,
        sleep: (ms) =>
          new Promise<void>((resolve) => {
            const id = setTimeout(resolve, ms)
            cancelSleepRef.current = () => {
              clearTimeout(id)
              resolve()
            }
          }),
        isActive: () => pollActiveRef.current,
        lock: pollLockRef.current,
      }).then((outcome) => {
        // 'cancelled' / 'skipped' map to null: must not touch state.
        const after = statusAfterPoll(outcome)
        if (after && pollActiveRef.current) setCheckoutStatus(after)
      })
    }

    // Phase 2. Both events, because a tab switch fires visibilitychange without
    // focus and an alt-tab back fires focus without visibilitychange.
    const onReturn = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (!shouldCatchUpOnFocus(statusRef.current, lastRefreshAtRef.current, Date.now())) return
      lastRefreshAtRef.current = Date.now()
      routerRef.current.refresh()
    }

    window.addEventListener(PADDLE_EVENT, onPaddle)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener(PADDLE_EVENT, onPaddle)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
      pollActiveRef.current = false
      cancelSleepRef.current?.()
    }
    // Intentionally empty: every value used inside is reached through a ref.
  }, [])

  return { checkoutStatus, setCheckoutStatus }
}
