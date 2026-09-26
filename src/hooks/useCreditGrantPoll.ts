'use client'

import { useEffect, useRef, useState } from 'react'
import { PADDLE_EVENT } from '@/lib/paddle'
import { checkoutStatusForEvent, type CheckoutStatus } from '@/lib/checkout'
import {
  pollForCreditGrant,
  shouldCatchUpOnFocus,
  statusAfterLateCredits,
  statusAfterPoll,
  type CreditPollLock,
} from '@/lib/credit-refresh'
import { fetchCredits, publishCredits, subscribeCredits } from '@/lib/credits-bus'

/**
 * Post-purchase credit reconciliation, shared by every surface that opens a
 * Paddle checkout (the dashboard and /pricing).
 *
 * THE RACE
 * `checkout.completed` fires in the BROWSER the moment Paddle's overlay reports
 * success. The credits are granted on the SERVER when Paddle delivers
 * `transaction.completed` to the webhook. Nothing orders those two.
 *
 * THE MECHANISM (three phases)
 *   1. checkout.completed → status 'success', then poll: read /api/credits on a
 *      backoff and stop the moment the balance leaves its baseline
 *      (lib/credit-refresh.ts). 'confirmed' when it does, 'success_pending' at
 *      the ceiling. Each read is PUBLISHED on lib/credits-bus.ts, which is what
 *      moves the navbar counter and the dashboard's out-of-credits gate.
 *   2. After the ceiling: no more polling. Read once whenever the tab regains
 *      focus or becomes visible (the buyer comes back from their receipt
 *      email), coalesced so a flurry of focus events costs one request.
 *   3. Whenever the published balance moves off the baseline while pending —
 *      from a focus catch-up, or from any other surface publishing — flip to
 *      'confirmed'.
 *
 * WHY NOT router.refresh()
 * The first version re-read the balance by re-rendering the server tree. On
 * this Next.js version the FIRST refresh after a page segment mounts REMOUNTS
 * the segment — measured live with a bare refresh, no state involved — which
 * discarded this hook's state mid-poll: the banner vanished 1.8s after it
 * appeared and the counter never moved, while the grant had already landed.
 * Nothing here re-renders the server tree, so nothing here can be remounted by
 * its own doing. `initialCredits` (the server-rendered balance the page was
 * given) is only the baseline: the number the buyer was looking at.
 *
 * Every value the listeners need is reached through a ref, so the effects are
 * installed once per mount. Event-name → status lives in lib/checkout.ts so
 * the two surfaces cannot drift.
 */
export function useCreditGrantPoll(initialCredits: number) {
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null)
  // The latest balance any surface has seen: server prop, or a published read.
  const [credits, setCredits] = useState(initialCredits)

  const creditsRef = useRef(initialCredits)
  const statusRef = useRef<CheckoutStatus | null>(null)
  // The number the user was looking at when checkout.completed fired.
  const baselineRef = useRef<number | null>(null)
  const pollActiveRef = useRef(true)
  const pollLockRef = useRef<CreditPollLock>({ busy: false })
  // Lets unmount wake a sleeping poll immediately instead of leaving a timer
  // pending for up to 8s. Resolves (never hangs) so the loop can observe
  // isActive() === false and unwind.
  const cancelSleepRef = useRef<(() => void) | null>(null)
  const lastReadAtRef = useRef<number | null>(null)

  useEffect(() => {
    statusRef.current = checkoutStatus
  }, [checkoutStatus])

  // A server re-render (navigation, or a refresh some other code performs)
  // hands us a newer balance: adopt it.
  useEffect(() => {
    creditsRef.current = initialCredits
    setCredits(initialCredits)
  }, [initialCredits])

  useEffect(() => {
    // Re-armed on mount, not just initialised, so React StrictMode's
    // mount→unmount→mount in dev doesn't leave this permanently false.
    pollActiveRef.current = true

    // One read, published to every subscriber (this hook included).
    const readAndPublish = async () => {
      lastReadAtRef.current = Date.now()
      const n = await fetchCredits()
      if (n !== null && pollActiveRef.current) publishCredits(n)
    }

    // Phase 3, and the counter: every published balance lands here.
    const unsubscribe = subscribeCredits((n) => {
      creditsRef.current = n
      setCredits(n)
      const next = statusAfterLateCredits(statusRef.current, baselineRef.current, n)
      if (next !== statusRef.current) setCheckoutStatus(next)
    })

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
          void readAndPublish()
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
      if (!shouldCatchUpOnFocus(statusRef.current, lastReadAtRef.current, Date.now())) return
      void readAndPublish()
    }

    window.addEventListener(PADDLE_EVENT, onPaddle)
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener(PADDLE_EVENT, onPaddle)
      window.removeEventListener('focus', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
      unsubscribe()
      pollActiveRef.current = false
      cancelSleepRef.current?.()
    }
    // Intentionally empty: every value used inside is reached through a ref.
  }, [])

  return { checkoutStatus, setCheckoutStatus, credits }
}
