import { getPaddle, PaddleLoadError } from './paddle'

export type CheckoutKind = 'sub' | 'pack'

/**
 * What the UI should show about the last checkout attempt.
 *   success         — Paddle says the payment went through AND the credit grant
 *                     has been observed server-side.
 *   success_pending — payment went through, but the grant had not landed by the
 *                     time lib/credit-refresh.ts hit its ceiling. UI-only: never
 *                     returned by checkoutStatusForEvent, only set by the poll.
 *                     Exists so a bare "success" is never shown beside a credit
 *                     count that has not moved.
 *   failed          — Paddle says the payment did not go through.
 *   error           — we never got as far as a payment: Paddle.js failed to load.
 */
export type CheckoutStatus = 'success' | 'success_pending' | 'failed' | 'error'

// Paddle's CheckoutEventNames (verified against @paddle/paddle-js dist) contains
// FIVE outcome events, not the three we used to listen for. 'checkout.failed'
// and 'checkout.payment.error' were dropped on the floor, so a payment that
// failed through either of those left the banner blank and the user with no
// signal at all.
const SUCCESS_EVENTS: readonly string[] = ['checkout.completed']
const FAILURE_EVENTS: readonly string[] = [
  'checkout.payment.failed',
  'checkout.error',
  'checkout.failed',
  'checkout.payment.error',
]

/**
 * Map a Paddle checkout event name to a banner status.
 *
 * Returns null for every non-outcome event ('checkout.loaded', 'checkout.closed',
 * 'checkout.items.updated', …) so callers can ignore them without enumerating
 * them — and, importantly, so a lifecycle event never CLEARS an outcome already
 * on screen.
 */
export function checkoutStatusForEvent(name: string | undefined): CheckoutStatus | null {
  if (!name) return null
  if (SUCCESS_EVENTS.includes(name)) return 'success'
  if (FAILURE_EVENTS.includes(name)) return 'failed'
  return null
}

export interface OpenCheckoutArgs {
  kind: CheckoutKind
  // The authenticated Supabase user id, or null if not logged in.
  userId: string | null
  // Navigation callback (e.g. router.push) — injected so this stays a pure,
  // node-testable function with no React/router import.
  navigate: (path: string) => void
}

// Single-flight guard. Paddle's overlay is a process-wide singleton, and the
// window between a click and Checkout.open() is a dynamic import plus a CDN
// round-trip — long enough to double-click through. A React `disabled` prop
// alone cannot close this: it only takes effect after a re-render, so two clicks
// dispatched inside one frame can both pass it. This guard is the actual
// interlock; the disabled button is the user-visible half of it.
let inFlight = false

/**
 * Open the Paddle overlay checkout for a subscription or one-time pack.
 *
 * Gating:
 *   - Not logged in (userId null) -> redirect to /login; identity can't be
 *     attached to the purchase otherwise, so we never open checkout.
 *   - Paddle INTENTIONALLY unavailable (getPaddle() -> undefined: server /
 *     native / missing client token) -> silent no-op, by design.
 *   - Missing price-id env -> log + no-op (never open a malformed checkout).
 *   - Already opening -> no-op, so a double click cannot open two checkouts.
 *
 * THROWS PaddleLoadError when Paddle was supposed to load and could not. This is
 * NOT a no-op and callers must not `void` it: the user clicked Pay and nothing
 * happened, so the UI owes them an error banner. (The previous version of this
 * doc claimed the load-failure branch was a no-op. It never was — getPaddle()
 * rejected, and `void openCheckout(...)` at both call sites swallowed it.)
 *
 * customData carries identity + routing ONLY. The webhook derives the credit
 * grant server-side from the price id (billing.ts), never from customData, so a
 * tampered checkout cannot inflate a grant. Shapes match what that webhook
 * expects: sub -> { user_id, plan:'pro' }, pack -> { user_id, type:'pack' }.
 */
export async function openCheckout({ kind, userId, navigate }: OpenCheckoutArgs): Promise<void> {
  if (!userId) {
    navigate('/login')
    return
  }

  if (inFlight) return
  inFlight = true

  try {
    const paddle = await getPaddle()
    if (!paddle) return // server / native / missing client token -> intentional no-op

    const isSub = kind === 'sub'
    const priceId = isSub
      ? process.env.NEXT_PUBLIC_PADDLE_SUB_PRICE_ID
      : process.env.NEXT_PUBLIC_PADDLE_PACK_PRICE_ID

    if (!priceId) {
      console.error(`Checkout: NEXT_PUBLIC_PADDLE_${isSub ? 'SUB' : 'PACK'}_PRICE_ID is not set`)
      return
    }

    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: isSub
        ? { user_id: userId, plan: 'pro' }
        : { user_id: userId, type: 'pack' },
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
      },
    })
  } finally {
    // Released even when getPaddle() throws, so one failed load does not wedge
    // the button shut for the rest of the session.
    inFlight = false
  }
}

// Re-exported so call sites can narrow a caught error without importing from two
// modules; `openCheckout` is the only thing that raises it in practice.
export { PaddleLoadError }
