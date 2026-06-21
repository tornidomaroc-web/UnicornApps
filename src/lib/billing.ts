// Billing config + entitlement logic. PURE: no DB / Supabase imports, so it can
// be shared by the server webhook, the (upcoming) /api/entitlement route, and
// the browser checkout. All credit grants are derived here from the Paddle price
// id — never from client-supplied custom_data — so a tampered checkout cannot
// inflate a grant.

// Paddle Billing price IDs. NEXT_PUBLIC_* so the same constants serve the browser
// checkout (Paddle.Checkout.open) and the server webhook. If unset, every lookup
// below fails safe to 0 / null (grant nothing) — never over-grant.
export const SUB_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_SUB_PRICE_ID ?? ''
export const PACK_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PACK_PRICE_ID ?? ''

// Credits granted per completed charge, keyed by price id.
const PRICE_CREDITS: Record<string, number> = {
  [SUB_PRICE_ID]: 100, // monthly subscription allotment
  [PACK_PRICE_ID]: 30, // one-time credit pack
}

// Plan label written to profiles.plan (subscriptions only).
const PRICE_PLAN: Record<string, string> = {
  [SUB_PRICE_ID]: 'pro',
}

// Fail-safe: unknown/empty price id -> 0 credits. The caller (webhook) logs the
// miss so a misconfigured price id surfaces instead of silently over/under-granting.
export function creditsForPrice(priceId: string | null | undefined): number {
  if (!priceId) return 0
  return PRICE_CREDITS[priceId] ?? 0
}

// Fail-safe: unknown/empty price id -> null plan.
export function planForPrice(priceId: string | null | undefined): string | null {
  if (!priceId) return null
  return PRICE_PLAN[priceId] ?? null
}

// Computed entitlement — the single source of truth for ad suppression / Pro
// state. Paddle Billing has no 'expired' event or status; expiry is purely
// timestamp-driven (a canceled sub keeps its paid-through current_period_end
// until it elapses; the refund path forces current_period_end to now()).
// 'paused' (and any unknown status) is excluded by design.
export function computeIsPro(
  subscriptionStatus: string | null | undefined,
  currentPeriodEnd: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!subscriptionStatus || !currentPeriodEnd) return false
  const end =
    currentPeriodEnd instanceof Date ? currentPeriodEnd : new Date(currentPeriodEnd)
  if (isNaN(end.getTime()) || end.getTime() <= now.getTime()) return false
  // 'active' | 'canceled' (paid-through) | 'past_due' (dunning grace) => Pro.
  // Add 'trialing' here if trials are ever introduced.
  return ['active', 'canceled', 'past_due'].includes(subscriptionStatus)
}
