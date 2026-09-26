/**
 * The client-side credit balance, as one number every surface agrees on.
 *
 * Server-rendered props seed it (the navbar and the dashboard both receive the
 * balance from a server read). After a purchase, the reconciliation poll
 * fetches the balance from /api/credits and PUBLISHES it here, and every
 * subscriber — the navbar counter, the dashboard's out-of-credits gate, the
 * poll's own stop condition — updates from the same value in the same tick.
 *
 * This replaces router.refresh() as the way a purchase reaches the counter.
 * A refresh re-renders the server tree, and on this Next.js version the first
 * refresh after a page segment mounts REMOUNTS it, discarding the banner, the
 * poll and any generated results on screen (measured live, 2026-09-26). A
 * number on a bus cannot remount anything.
 *
 * Deliberately free of React and of `window`, so it is unit-testable in the
 * repo's node environment (see __tests__/credits-bus.test.ts).
 */

export type CreditsListener = (credits: number) => void

const listeners = new Set<CreditsListener>()
let latest: number | null = null

/** Broadcast a freshly read balance to every subscriber, synchronously. */
export function publishCredits(credits: number): void {
  latest = credits
  listeners.forEach((listener) => listener(credits))
}

/** Subscribe; returns the unsubscribe function. */
export function subscribeCredits(listener: CreditsListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The last published balance, or null if nothing has been published yet. */
export function latestCredits(): number | null {
  return latest
}

/**
 * Read the balance from the server. Resolves null on ANY failure — signed out,
 * server error, network error, malformed body — so a caller polling for a
 * change can treat "no answer" exactly like "no change" and never throw out of
 * a poll loop.
 */
export async function fetchCredits(fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const res = await fetchImpl('/api/credits', { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const credits = (body as { credits?: unknown })?.credits
    return typeof credits === 'number' && Number.isFinite(credits) ? credits : null
  } catch {
    return null
  }
}

/** Test seam: forget every listener and the last value. */
export function resetCreditsBusForTests(): void {
  listeners.clear()
  latest = null
}
