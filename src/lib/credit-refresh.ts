/**
 * Post-purchase credit reconciliation.
 *
 * THE RACE
 * `checkout.completed` fires in the BROWSER the moment Paddle's overlay reports
 * success. The credits are granted on the SERVER, when Paddle delivers
 * `transaction.completed` to /api/webhooks/paddle. Nothing orders those two
 * events. A single immediate router.refresh() therefore re-renders whatever the
 * database held at that instant — very often the pre-purchase balance — which
 * looks like a fix while still showing the user a stale number.
 *
 * THE BOUND
 * Refresh immediately, then re-read on a backoff, and stop the moment the
 * server-rendered credit value actually moves. Stop unconditionally at the
 * ceiling and tell the truth instead of implying the grant landed.
 *
 * This module is deliberately free of React, timers and globals: every effect is
 * injected, so the loop is unit-testable in the repo's node test environment
 * (see __tests__/credit-refresh.test.ts) with no jsdom and no new dev deps.
 */

/**
 * Gaps BETWEEN refreshes, in ms. Each gap doubles as the settle window for the
 * refresh that precedes it — router.refresh() is fire-and-forget, so the new
 * server props arrive asynchronously and must be given time to land before the
 * value is re-read.
 *
 * Refreshes fire at t = 0, 1, 3, 6, 10, 16s; the final read is at t = 24s.
 * Six server round-trips total.
 *
 * Why 24s: Paddle normally delivers transaction.completed within a second or
 * two of checkout.completed. If it has not arrived in ~24s the realistic cause
 * is a failed delivery awaiting Paddle's own retry schedule, which runs on the
 * order of minutes — no in-page wait we could stomach would catch it, so
 * extending the ceiling buys nothing and just burns queries. Front-loading the
 * backoff catches the overwhelmingly common case (grant already landed, or
 * lands within ~3s) in one or two refreshes.
 */
export const CREDIT_REFRESH_DELAYS_MS: readonly number[] = [1000, 2000, 3000, 4000, 6000, 8000]

/** Total time from checkout.completed to giving up. Derived, never hand-typed. */
export const CREDIT_REFRESH_CEILING_MS = CREDIT_REFRESH_DELAYS_MS.reduce((a, b) => a + b, 0)

export type CreditPollOutcome =
  /** The server-rendered credit value moved. The grant landed; UI is truthful. */
  | 'confirmed'
  /** Ceiling reached with no change. Caller MUST downgrade the success copy. */
  | 'exhausted'
  /** The component unmounted mid-poll. Caller must not touch state. */
  | 'cancelled'
  /** A poll was already running. Caller must leave the existing one alone. */
  | 'skipped'

/** Mutable single-flight latch, owned by the caller (one per component instance). */
export interface CreditPollLock {
  busy: boolean
}

export interface CreditPollDeps {
  /** Re-run the server component (router.refresh()). Fire-and-forget. */
  refresh: () => void
  /** Read the LATEST server-rendered credit value (via a ref, never a stale closure). */
  readCredits: () => number
  /** Resolve after ms. Must resolve — not hang — when the caller cancels it. */
  sleep: (ms: number) => Promise<void>
  /** False once the component has unmounted. */
  isActive: () => boolean
  /** Shared latch so a second checkout cannot start a concurrent poll. */
  lock: CreditPollLock
}

/**
 * Refresh-and-recheck until the credit value moves, or the ceiling is hit.
 *
 * `baseline` must be captured at checkout.completed time — the value the user is
 * currently looking at. Any move off it (up OR down; a refund reversal is still
 * a reconciliation) means the server has spoken and polling is done.
 *
 * The lock is released in `finally`, so a failed or cancelled poll never wedges
 * the next purchase out of reconciling.
 */
export async function pollForCreditGrant(
  baseline: number,
  deps: CreditPollDeps,
  delays: readonly number[] = CREDIT_REFRESH_DELAYS_MS
): Promise<CreditPollOutcome> {
  // A second checkout completing mid-poll must NOT start a rival loop: two
  // interleaved refresh storms would double the query cost and race each other's
  // stop conditions.
  if (deps.lock.busy) return 'skipped'
  deps.lock.busy = true

  try {
    for (const delay of delays) {
      // Checked before every side effect, so an unmount between iterations can
      // never fire another refresh at a dead component.
      if (!deps.isActive()) return 'cancelled'
      deps.refresh()

      await deps.sleep(delay)

      // Re-checked after the await: unmount most likely happens DURING the sleep.
      if (!deps.isActive()) return 'cancelled'
      if (deps.readCredits() !== baseline) return 'confirmed'
    }
    return 'exhausted'
  } finally {
    deps.lock.busy = false
  }
}
