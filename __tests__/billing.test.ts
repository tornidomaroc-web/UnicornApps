import { computeIsPro, creditsForPrice, planForPrice } from '../src/lib/billing'

// Fixed reference "now" so the boundary cases are deterministic.
const NOW = new Date('2026-06-21T00:00:00.000Z')
const FUTURE = new Date('2026-07-21T00:00:00.000Z').toISOString()
const PAST = new Date('2026-05-21T00:00:00.000Z').toISOString()

describe('computeIsPro', () => {
  it('is false when status is null/undefined', () => {
    expect(computeIsPro(null, FUTURE, NOW)).toBe(false)
    expect(computeIsPro(undefined, FUTURE, NOW)).toBe(false)
  })

  it('is false when current_period_end is null/undefined', () => {
    expect(computeIsPro('active', null, NOW)).toBe(false)
    expect(computeIsPro('active', undefined, NOW)).toBe(false)
  })

  it('is false when current_period_end is an invalid date', () => {
    expect(computeIsPro('active', 'not-a-date', NOW)).toBe(false)
  })

  it('is false when the period has elapsed (<= now)', () => {
    expect(computeIsPro('active', PAST, NOW)).toBe(false)
    // Exactly now counts as elapsed (boundary is exclusive).
    expect(computeIsPro('active', NOW.toISOString(), NOW)).toBe(false)
  })

  it('is true for each entitled status within the paid period', () => {
    expect(computeIsPro('active', FUTURE, NOW)).toBe(true)
    expect(computeIsPro('canceled', FUTURE, NOW)).toBe(true) // paid-through after scheduled cancel
    expect(computeIsPro('past_due', FUTURE, NOW)).toBe(true) // dunning grace
  })

  it('is false for paused even within the paid period', () => {
    expect(computeIsPro('paused', FUTURE, NOW)).toBe(false)
  })

  it('is false for an unknown status within the paid period', () => {
    expect(computeIsPro('trialing', FUTURE, NOW)).toBe(false)
    expect(computeIsPro('whatever', FUTURE, NOW)).toBe(false)
  })

  it('accepts a Date object for current_period_end', () => {
    expect(computeIsPro('active', new Date(FUTURE), NOW)).toBe(true)
    expect(computeIsPro('active', new Date(PAST), NOW)).toBe(false)
  })
})

describe('creditsForPrice / planForPrice fail-safe', () => {
  it('returns 0 / null for unknown or empty price ids', () => {
    expect(creditsForPrice('pri_unknown')).toBe(0)
    expect(creditsForPrice('')).toBe(0)
    expect(creditsForPrice(null)).toBe(0)
    expect(creditsForPrice(undefined)).toBe(0)
    expect(planForPrice('pri_unknown')).toBeNull()
    expect(planForPrice(null)).toBeNull()
  })
})
