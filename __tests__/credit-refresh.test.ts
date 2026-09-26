import {
  pollForCreditGrant,
  CREDIT_REFRESH_DELAYS_MS,
  CREDIT_REFRESH_CEILING_MS,
  type CreditPollDeps,
  type CreditPollLock,
} from '@/lib/credit-refresh'

/**
 * The poll is pure and fully injected, so it is exercised here in the repo's
 * node test environment — no jsdom, no fake timers, no new dev dependencies.
 * `sleep` is a resolved promise, so a 24-second poll runs in microseconds.
 */

interface Harness {
  deps: CreditPollDeps
  lock: CreditPollLock
  /** Every delay passed to sleep(), in order. */
  slept: number[]
  refreshCount: () => number
  setCredits: (n: number) => void
  deactivate: () => void
}

function makeHarness(
  initialCredits = 3,
  opts: {
    /** Change the credit value once this many refreshes have happened. */
    changeAfterRefreshes?: number
    newCredits?: number
    /** Unmount once this many refreshes have happened. */
    deactivateAfterRefreshes?: number
  } = {}
): Harness {
  let credits = initialCredits
  let refreshes = 0
  let active = true
  const slept: number[] = []
  const lock: CreditPollLock = { busy: false }

  const deps: CreditPollDeps = {
    refresh: () => {
      refreshes += 1
      if (opts.changeAfterRefreshes !== undefined && refreshes >= opts.changeAfterRefreshes) {
        credits = opts.newCredits ?? initialCredits + 30
      }
      if (
        opts.deactivateAfterRefreshes !== undefined &&
        refreshes >= opts.deactivateAfterRefreshes
      ) {
        active = false
      }
    },
    readCredits: () => credits,
    sleep: async (ms) => {
      slept.push(ms)
    },
    isActive: () => active,
    lock,
  }

  return {
    deps,
    lock,
    slept,
    refreshCount: () => refreshes,
    setCredits: (n) => {
      credits = n
    },
    deactivate: () => {
      active = false
    },
  }
}

describe('polling schedule', () => {
  it('bounds the total wait inside the 15–30s window', () => {
    expect(CREDIT_REFRESH_CEILING_MS).toBe(24_000)
    expect(CREDIT_REFRESH_CEILING_MS).toBeGreaterThanOrEqual(15_000)
    expect(CREDIT_REFRESH_CEILING_MS).toBeLessThanOrEqual(30_000)
  })

  it('is a real backoff — every gap is >= the one before it', () => {
    const gaps = [...CREDIT_REFRESH_DELAYS_MS]
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1])
    }
  })

  it('derives the ceiling from the gaps rather than hardcoding it', () => {
    expect(CREDIT_REFRESH_CEILING_MS).toBe(
      CREDIT_REFRESH_DELAYS_MS.reduce((a, b) => a + b, 0)
    )
  })
})

describe('pollForCreditGrant — stops on value change', () => {
  it('refreshes immediately before sleeping at all', async () => {
    // The whole point of the first pass: if the webhook already landed, the user
    // sees the new number without waiting out a backoff gap.
    const h = makeHarness(3, { changeAfterRefreshes: 1, newCredits: 33 })

    const outcome = await pollForCreditGrant(3, h.deps)

    expect(outcome).toBe('confirmed')
    expect(h.refreshCount()).toBe(1)
    // Exactly one gap elapsed — the settle window for that first refresh.
    expect(h.slept).toEqual([CREDIT_REFRESH_DELAYS_MS[0]])
  })

  it('stops the moment the value moves mid-backoff, leaving gaps unused', async () => {
    const h = makeHarness(3, { changeAfterRefreshes: 3, newCredits: 33 })

    const outcome = await pollForCreditGrant(3, h.deps)

    expect(outcome).toBe('confirmed')
    expect(h.refreshCount()).toBe(3)
    expect(h.slept).toHaveLength(3)
    expect(h.slept.length).toBeLessThan(CREDIT_REFRESH_DELAYS_MS.length)
  })

  it('treats a DECREASE as a reconciliation too, not just a grant', async () => {
    // A refund reversal moves credits down. The server has still spoken, so the
    // UI is no longer stale and there is nothing left to wait for.
    const h = makeHarness(30, { changeAfterRefreshes: 1, newCredits: 0 })

    await expect(pollForCreditGrant(30, h.deps)).resolves.toBe('confirmed')
    expect(h.refreshCount()).toBe(1)
  })

  it('follows the backoff in order while the value stays put', async () => {
    const h = makeHarness(3, { changeAfterRefreshes: 4, newCredits: 33 })

    await pollForCreditGrant(3, h.deps)

    expect(h.slept).toEqual(CREDIT_REFRESH_DELAYS_MS.slice(0, 4))
  })
})

describe('pollForCreditGrant — stops at the ceiling', () => {
  it('returns "exhausted" when the grant never lands', async () => {
    const h = makeHarness(3) // value never changes

    const outcome = await pollForCreditGrant(3, h.deps)

    expect(outcome).toBe('exhausted')
  })

  it('never exceeds the configured number of refreshes', async () => {
    const h = makeHarness(3)

    await pollForCreditGrant(3, h.deps)

    // This is the cost bound: a stuck webhook costs exactly this many server
    // round-trips and not one more.
    expect(h.refreshCount()).toBe(CREDIT_REFRESH_DELAYS_MS.length)
    expect(h.slept).toEqual([...CREDIT_REFRESH_DELAYS_MS])
    expect(h.slept.reduce((a, b) => a + b, 0)).toBe(CREDIT_REFRESH_CEILING_MS)
  })

  it('releases the lock after exhausting, so the next purchase can reconcile', async () => {
    const h = makeHarness(3)

    await pollForCreditGrant(3, h.deps)

    expect(h.lock.busy).toBe(false)
  })
})

describe('pollForCreditGrant — does not continue after unmount', () => {
  it('stops refreshing once the component is gone', async () => {
    const h = makeHarness(3, { deactivateAfterRefreshes: 2 })

    const outcome = await pollForCreditGrant(3, h.deps)

    expect(outcome).toBe('cancelled')
    // Refresh 2 flipped it inactive; the loop must not fire a third.
    expect(h.refreshCount()).toBe(2)
  })

  it('never refreshes at all if unmounted before the first pass', async () => {
    const h = makeHarness(3)
    h.deactivate()

    const outcome = await pollForCreditGrant(3, h.deps)

    expect(outcome).toBe('cancelled')
    expect(h.refreshCount()).toBe(0)
    expect(h.slept).toEqual([])
  })

  it('reports "cancelled" rather than "confirmed" if it unmounts as the value lands', async () => {
    // Ordering guard: the caller must not setState on a dead component just
    // because the number happened to change on the way out.
    const h = makeHarness(3, {
      changeAfterRefreshes: 1,
      newCredits: 33,
      deactivateAfterRefreshes: 1,
    })

    await expect(pollForCreditGrant(3, h.deps)).resolves.toBe('cancelled')
  })

  it('releases the lock on cancellation (no wedged latch after a remount)', async () => {
    const h = makeHarness(3)
    h.deactivate()

    await pollForCreditGrant(3, h.deps)

    expect(h.lock.busy).toBe(false)
  })
})

describe('pollForCreditGrant — does not run twice concurrently', () => {
  it('a second checkout completing mid-poll is skipped, not interleaved', async () => {
    const h = makeHarness(3)
    // Hold the first poll open inside its first sleep so the second call lands
    // while it is genuinely in flight.
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let firstSleep = true
    h.deps.sleep = async (ms) => {
      h.slept.push(ms)
      if (firstSleep) {
        firstSleep = false
        await gate
      }
    }

    const first = pollForCreditGrant(3, h.deps)
    const second = await pollForCreditGrant(3, h.deps)

    expect(second).toBe('skipped')
    // The skipped call must not have added a refresh of its own.
    expect(h.refreshCount()).toBe(1)

    release()
    await expect(first).resolves.toBe('exhausted')
    expect(h.refreshCount()).toBe(CREDIT_REFRESH_DELAYS_MS.length)
  })

  it('a skipped call leaves the running poll untouched', async () => {
    const h = makeHarness(3)
    h.lock.busy = true

    const outcome = await pollForCreditGrant(3, h.deps)

    expect(outcome).toBe('skipped')
    expect(h.refreshCount()).toBe(0)
    // Must NOT clear a latch it does not own — that would let a third call in.
    expect(h.lock.busy).toBe(true)
  })

  it('allows a genuinely sequential second poll once the first finished', async () => {
    const h = makeHarness(3, { changeAfterRefreshes: 1, newCredits: 33 })

    await expect(pollForCreditGrant(3, h.deps)).resolves.toBe('confirmed')
    h.setCredits(33)
    await expect(pollForCreditGrant(33, h.deps)).resolves.toBe('exhausted')
  })
})

// --- Status derivation after the poll, and the two catch-up paths ------------
// Pure helpers consumed by hooks/useCreditGrantPoll.ts. The hook itself is React
// wiring the node environment cannot render; these are the decisions it makes.
import {
  statusAfterPoll,
  statusAfterLateCredits,
  shouldCatchUpOnFocus,
  FOCUS_CATCH_UP_MIN_GAP_MS,
} from '@/lib/credit-refresh'

describe('statusAfterPoll', () => {
  it('confirmed -> confirmed, exhausted -> success_pending', () => {
    expect(statusAfterPoll('confirmed')).toBe('confirmed')
    expect(statusAfterPoll('exhausted')).toBe('success_pending')
  })

  it('cancelled and skipped return null — the caller must not touch state', () => {
    expect(statusAfterPoll('cancelled')).toBeNull()
    expect(statusAfterPoll('skipped')).toBeNull()
  })
})

describe('statusAfterLateCredits — a grant landing after the poll gave up', () => {
  it('flips success_pending to confirmed the moment the value leaves its baseline', () => {
    expect(statusAfterLateCredits('success_pending', 82, 112)).toBe('confirmed')
    // A decrease is still a reconciliation (refund reversal); the server spoke.
    expect(statusAfterLateCredits('success_pending', 82, 52)).toBe('confirmed')
  })

  it('leaves success_pending alone while the value sits on its baseline', () => {
    expect(statusAfterLateCredits('success_pending', 82, 82)).toBe('success_pending')
  })

  it('never promotes without a baseline, and never touches any other status', () => {
    expect(statusAfterLateCredits('success_pending', null, 112)).toBe('success_pending')
    for (const s of ['success', 'confirmed', 'failed', 'error', null] as const) {
      expect(statusAfterLateCredits(s, 82, 112)).toBe(s)
    }
  })
})

describe('shouldCatchUpOnFocus — after the ceiling, re-read on return, not on a timer', () => {
  it('only ever fires while pending', () => {
    for (const s of ['success', 'confirmed', 'failed', 'error', null] as const) {
      expect(shouldCatchUpOnFocus(s, null, 1_000_000)).toBe(false)
    }
    expect(shouldCatchUpOnFocus('success_pending', null, 1_000_000)).toBe(true)
  })

  it('coalesces a flurry of focus events into one refresh per gap', () => {
    const t0 = 1_000_000
    expect(shouldCatchUpOnFocus('success_pending', t0, t0 + FOCUS_CATCH_UP_MIN_GAP_MS - 1)).toBe(false)
    expect(shouldCatchUpOnFocus('success_pending', t0, t0 + FOCUS_CATCH_UP_MIN_GAP_MS)).toBe(true)
  })

  it('the gap is longer than the poll ceiling gap, so it can never out-poll the poll', () => {
    // The last backoff gap is 8s; a focus catch-up must be rarer than that.
    expect(FOCUS_CATCH_UP_MIN_GAP_MS).toBeGreaterThan(Math.max(...CREDIT_REFRESH_DELAYS_MS))
  })
})

// --- The wiring must never re-render the server tree -------------------------
// hooks/useCreditGrantPoll.ts is React wiring the node environment cannot
// render, but the property that failed live is a property of its SOURCE: it
// re-read the balance with router.refresh(). On this Next.js version the first
// refresh after a page segment mounts remounts the segment (measured live with
// a bare refresh: /pricing and /dashboard, hard load and client navigation
// alike), which threw the hook's state away mid-poll. The balance must reach
// the page as a number, never as a re-render.
import { readFileSync } from 'fs'
import { join } from 'path'

describe('useCreditGrantPoll never re-renders the server tree', () => {
  const source = readFileSync(join(process.cwd(), 'src/hooks/useCreditGrantPoll.ts'), 'utf8')
  // Strip comments so the prose explaining the rule cannot satisfy or break it.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('does not import the router', () => {
    expect(code).not.toMatch(/from\s+['"]next\/navigation['"]/)
    expect(code).not.toMatch(/useRouter\s*\(/)
  })

  it('never calls refresh()', () => {
    expect(code).not.toMatch(/\.refresh\s*\(/)
  })

  it('reads the balance through the credits bus instead', () => {
    expect(code).toMatch(/from\s+['"]@\/lib\/credits-bus['"]/)
    // refreshCredits = fetch + publish in one call (lib/credits-bus.ts).
    expect(code).toMatch(/refreshCredits\s*\(/)
    expect(code).toMatch(/subscribeCredits\s*\(/)
  })
})
