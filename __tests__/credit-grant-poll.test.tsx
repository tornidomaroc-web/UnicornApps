/**
 * @jest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useCreditGrantPoll } from '@/hooks/useCreditGrantPoll'
import { PADDLE_EVENT } from '@/lib/paddle'
import { publishCredits, resetCreditsBusForTests } from '@/lib/credits-bus'
import { CREDIT_REFRESH_CEILING_MS } from '@/lib/credit-refresh'

/**
 * useCreditGrantPoll rendered for real (jsdom, fake timers, a fake
 * /api/credits), driven by the same window event Paddle's overlay fires. The
 * pure loop is covered in credit-refresh.test.ts; this covers the wiring, and
 * above all the baseline it compares against.
 *
 * A KNOWN baseline confirms the moment a read moves off it. An UNKNOWN (null)
 * baseline must never confirm by comparison: the first real number could be the
 * old balance or the granted one. It reads, publishes, and ends pending.
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Snapshot = { status: string | null; credits: number | null }
type Reply = number | 'fail'

let root: Root | null = null
let latest: Snapshot = { status: null, credits: null }
let replies: Reply[] = []
let calls = 0

function Probe({ initial }: { initial: number | null }) {
  const { checkoutStatus, credits } = useCreditGrantPoll(initial)
  latest = { status: checkoutStatus, credits }
  return null
}

// Each /api/credits read takes the next scripted reply; the last one repeats.
// A plain object, not a Response: jsdom has no fetch globals, and fetchCredits
// only reads ok and json().
function mockCreditsApi(script: Reply[]) {
  replies = script
  calls = 0
  globalThis.fetch = jest.fn(async () => {
    const reply = replies[Math.min(calls, replies.length - 1)]
    calls += 1
    return reply === 'fail' ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ credits: reply }) }
  }) as unknown as typeof fetch
}

async function mount(initial: number | null) {
  const el = document.createElement('div')
  await act(async () => {
    root = createRoot(el)
    root.render(createElement(Probe, { initial }))
  })
}

async function fire(name: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent(PADDLE_EVENT, { detail: { name } }))
  })
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms)
  })
}

async function focus() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  resetCreditsBusForTests()
  latest = { status: null, credits: null }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  jest.useRealTimers()
})

describe('a known baseline (unchanged behaviour)', () => {
  it('confirms the moment a read moves off it, and stops reading', async () => {
    mockCreditsApi([3, 33])
    await mount(3)
    // Reads go out at t = 0, 1, 3, 6, 10, 16s; each is compared one gap later.
    await fire('checkout.completed') // read 1 = 3
    expect(latest).toEqual({ status: 'success', credits: 3 })

    await advance(1000) // read 1 unchanged; read 2 = 33 is published
    expect(latest).toEqual({ status: 'success', credits: 33 })
    await advance(2000) // read 2 is compared: it moved
    expect(latest).toEqual({ status: 'confirmed', credits: 33 })

    await advance(CREDIT_REFRESH_CEILING_MS)
    expect(calls).toBe(2)
  })

  it('a grant that misses the ceiling is pending, then confirmed by a focus read', async () => {
    mockCreditsApi([3, 3, 3, 3, 3, 3, 33])
    await mount(3)
    await fire('checkout.completed')
    await advance(CREDIT_REFRESH_CEILING_MS)
    expect(latest).toEqual({ status: 'success_pending', credits: 3 })
    expect(calls).toBe(6)

    await advance(10_000)
    await focus()
    await advance(0)
    expect(latest).toEqual({ status: 'confirmed', credits: 33 })
    expect(calls).toBe(7)
  })
})

describe('an unknown (null) baseline', () => {
  it('never confirms from a read, ends pending, and the counter settles on the real balance', async () => {
    // The old balance is 3, the grant lands on the third read.
    mockCreditsApi([3, 3, 33])
    await mount(null)
    expect(latest).toEqual({ status: null, credits: null })
    await fire('checkout.completed') // read 1 = 3: shown, but it is not a baseline
    expect(latest).toEqual({ status: 'success', credits: 3 })

    const seen: Snapshot[] = []
    for (let t = 0; t < CREDIT_REFRESH_CEILING_MS; t += 500) {
      await advance(500)
      seen.push({ ...latest })
    }
    expect(seen.map((s) => s.status)).not.toContain('confirmed')
    expect(latest).toEqual({ status: 'success_pending', credits: 33 })
    expect(calls).toBe(6)
  })

  it('a later read that moves the balance still does not confirm', async () => {
    mockCreditsApi([3])
    await mount(null)
    await fire('checkout.completed')
    await advance(CREDIT_REFRESH_CEILING_MS)
    expect(latest).toEqual({ status: 'success_pending', credits: 3 })

    // Another surface publishes a different number; a focus read sees it too.
    await act(async () => publishCredits(33))
    expect(latest).toEqual({ status: 'success_pending', credits: 33 })
    mockCreditsApi([40])
    await advance(10_000)
    await focus()
    await advance(0)
    expect(latest).toEqual({ status: 'success_pending', credits: 40 })
  })

  it('a read that keeps failing stays pending: six reads, then only coalesced focus reads', async () => {
    mockCreditsApi(['fail'])
    await mount(null)
    await fire('checkout.completed')
    await advance(CREDIT_REFRESH_CEILING_MS)
    expect(latest).toEqual({ status: 'success_pending', credits: null })
    expect(calls).toBe(6)

    // No loop: ten idle minutes cost nothing.
    await advance(10 * 60_000)
    expect(calls).toBe(6)

    // A burst of focus events inside the 10s gap costs one read.
    await focus()
    await focus()
    await advance(2_000)
    await focus()
    expect(calls).toBe(7)
    expect(latest).toEqual({ status: 'success_pending', credits: null })
  })
})

describe('a baseline that arrives late', () => {
  it('a real balance published before checkout becomes the baseline, and confirms as usual', async () => {
    mockCreditsApi([3, 33])
    await mount(null)
    await act(async () => publishCredits(3))
    expect(latest).toEqual({ status: null, credits: 3 })

    await fire('checkout.completed')
    await advance(1000)
    expect(latest.status).toBe('success')
    await advance(2000)
    expect(latest).toEqual({ status: 'confirmed', credits: 33 })
  })

  it('a balance first read DURING the poll is not adopted as a baseline', async () => {
    // Unknown at checkout; the first successful read is already post-grant.
    mockCreditsApi(['fail', 33])
    await mount(null)
    await fire('checkout.completed')
    await advance(CREDIT_REFRESH_CEILING_MS)
    expect(latest).toEqual({ status: 'success_pending', credits: 33 })
  })
})
