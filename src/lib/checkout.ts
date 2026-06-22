import { getPaddle } from './paddle'

export type CheckoutKind = 'sub' | 'pack'

export interface OpenCheckoutArgs {
  kind: CheckoutKind
  // The authenticated Supabase user id, or null if not logged in.
  userId: string | null
  // Navigation callback (e.g. router.push) — injected so this stays a pure,
  // node-testable function with no React/router import.
  navigate: (path: string) => void
}

/**
 * Open the Paddle overlay checkout for a subscription or one-time pack.
 *
 * Gating:
 *   - Not logged in (userId null) -> redirect to /login; identity can't be
 *     attached to the purchase otherwise, so we never open checkout.
 *   - Native / Paddle unavailable (getPaddle() -> undefined) -> no-op.
 *   - Missing price-id env -> log + no-op (never open a malformed checkout).
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

  const paddle = await getPaddle()
  if (!paddle) return // server / native / missing client token -> no-op

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
}
