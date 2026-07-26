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
