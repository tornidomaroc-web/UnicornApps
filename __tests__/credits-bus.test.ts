import {
  publishCredits,
  subscribeCredits,
  latestCredits,
  fetchCredits,
  refreshCredits,
  resetCreditsBusForTests,
} from '@/lib/credits-bus'

/**
 * The bus is the one path a purchase takes to the navbar counter and the
 * dashboard's out-of-credits gate. It replaced router.refresh(), which on this
 * Next.js version remounts a freshly mounted page segment on its first call
 * (measured live, 2026-09-26) and thereby discarded the reconciliation mid-poll.
 */

beforeEach(() => resetCreditsBusForTests())

describe('publish / subscribe', () => {
  it('starts with nothing published', () => {
    expect(latestCredits()).toBeNull()
  })

  it('delivers every publish to every subscriber, synchronously, and remembers the last value', () => {
    const a: number[] = []
    const b: number[] = []
    subscribeCredits((n) => a.push(n))
    subscribeCredits((n) => b.push(n))
    publishCredits(112)
    publishCredits(142)
    expect(a).toEqual([112, 142])
    expect(b).toEqual([112, 142])
    expect(latestCredits()).toBe(142)
  })

  it('unsubscribe stops delivery without affecting other subscribers', () => {
    const a: number[] = []
    const b: number[] = []
    const off = subscribeCredits((n) => a.push(n))
    subscribeCredits((n) => b.push(n))
    publishCredits(1)
    off()
    publishCredits(2)
    expect(a).toEqual([1])
    expect(b).toEqual([1, 2])
  })
})

describe('fetchCredits — "no answer" is indistinguishable from "no change"', () => {
  const ok = (body: unknown, status = 200) =>
    (async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch

  it('returns the number on a 200 with a numeric balance', async () => {
    await expect(fetchCredits(ok({ credits: 142 }))).resolves.toBe(142)
  })

  it('returns null when signed out (401), on a server error (500), and on a malformed body', async () => {
    await expect(fetchCredits(ok({ code: 'UNAUTHORIZED' }, 401))).resolves.toBeNull()
    await expect(fetchCredits(ok({ code: 'PROFILE_READ_FAILED' }, 500))).resolves.toBeNull()
    await expect(fetchCredits(ok({ credits: '142' }))).resolves.toBeNull()
    await expect(fetchCredits(ok({}))).resolves.toBeNull()
  })

  it('never throws: a network failure or a non-JSON body resolves null', async () => {
    const boom = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(fetchCredits(boom)).resolves.toBeNull()
    const notJson = (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })) as unknown as typeof fetch
    await expect(fetchCredits(notJson)).resolves.toBeNull()
  })

  it('asks for the balance uncached, with the session cookie', async () => {
    const calls: unknown[] = []
    const spy = (async (...args: unknown[]) => {
      calls.push(args)
      return { ok: true, status: 200, json: async () => ({ credits: 1 }) }
    }) as unknown as typeof fetch
    await fetchCredits(spy)
    expect(calls[0]).toEqual(['/api/credits', { cache: 'no-store', credentials: 'same-origin' }])
  })
})

describe('refreshCredits — one read, published on success, silent on failure', () => {
  it('publishes the balance it read', async () => {
    const seen: number[] = []
    subscribeCredits((n) => seen.push(n))
    const ok = (async () => ({ ok: true, status: 200, json: async () => ({ credits: 171 }) })) as unknown as typeof fetch
    await expect(refreshCredits(ok)).resolves.toBe(171)
    expect(seen).toEqual([171])
    expect(latestCredits()).toBe(171)
  })

  it('publishes nothing when the read fails, so a stale counter is never overwritten with garbage', async () => {
    const seen: number[] = []
    subscribeCredits((n) => seen.push(n))
    const bad = (async () => ({ ok: false, status: 500, json: async () => ({ code: 'X' }) })) as unknown as typeof fetch
    await expect(refreshCredits(bad)).resolves.toBeNull()
    expect(seen).toEqual([])
    expect(latestCredits()).toBeNull()
  })
})
