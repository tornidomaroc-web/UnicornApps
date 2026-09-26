import { localGenerationRow, prependGeneration, HISTORY_LIMIT } from '@/lib/dashboard-history'

/**
 * A generation's history row is now built on the client and prepended, instead
 * of arriving through router.refresh() — which remounted the page and discarded
 * the results the user had just paid for (measured live, 2026-09-26).
 */

const row = (id: string) => ({ id, created_at: '2026-09-26T00:00:00.000Z', content: { t: id }, image_url: 'data:x' })

describe('localGenerationRow', () => {
  it('carries everything the history table renders, with a local id and the platform chosen', () => {
    const now = new Date('2026-09-26T04:55:04.000Z')
    const r = localGenerationRow({ seoTitle: 'x' }, 'data:image/jpeg;base64,abc', 'shopify', now, 42)
    expect(r).toEqual({
      id: 'local-42',
      created_at: '2026-09-26T04:55:04.000Z',
      content: { seoTitle: 'x' },
      image_url: 'data:image/jpeg;base64,abc',
      platform: 'shopify',
    })
  })

  it('two generations in one session never share an id', () => {
    const a = localGenerationRow({}, 'a', 'amazon', new Date(1), 1)
    const b = localGenerationRow({}, 'b', 'amazon', new Date(2), 2)
    expect(a.id).not.toBe(b.id)
  })
})

describe('prependGeneration', () => {
  it('puts the new row first and keeps the rest in order', () => {
    const out = prependGeneration([row('b'), row('c')], row('a'))
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it("caps at the server page size, dropping the oldest, and never mutates the input", () => {
    const seed = Array.from({ length: HISTORY_LIMIT }, (_, i) => row(`s${i}`))
    const frozen = [...seed]
    const out = prependGeneration(seed, row('new'))
    expect(out).toHaveLength(HISTORY_LIMIT)
    expect(out[0].id).toBe('new')
    expect(out[out.length - 1].id).toBe(`s${HISTORY_LIMIT - 2}`)
    expect(seed).toEqual(frozen)
  })

  it('the cap equals the server query limit the list was seeded from', () => {
    expect(HISTORY_LIMIT).toBe(10)
  })
})
