// Token/cost telemetry (backlog item 23 = item 36 leg c).
//
// SCOPE OF THIS PROOF — stated plainly rather than overclaimed. These are
// NODE-LEVEL tests against the extractor and the writer, with a MOCKED Supabase
// client. They are NOT SQL-proofs.
//
// Unlike PR #29 (credit-rpcs.sql.test.ts) and PR #35 (rate-limit.sql.test.ts),
// which execute the REAL function bodies read off disk against real Postgres via
// PGlite, there is NOTHING HERE FOR PGLITE TO EXECUTE. Both of those suites work
// by regex-extracting a `CREATE OR REPLACE FUNCTION ... $$;` block
// (credit-rpcs.sql.test.ts:35, rate-limit.sql.test.ts:29) — and usage_events has
// no function body, because a plain append-only INSERT has no read-modify-write
// and no cross-row invariant worth serializing. The table's CHECK constraints,
// its RLS posture and the ON DELETE SET NULL FK are verified by the VERIFY block
// in migrations/2026-07-14_add_usage_events.sql, ON THE LIVE DATABASE, not here.
//
// What IS worth pinning here is the arithmetic that decides the billing number:
// NULL-never-zero, thinking tokens counted as output, and full raw passthrough.

import { extractTokenCounts, recordUsage } from '../src/lib/usageTelemetry'

/** Mock service client shaped like supabase-js: client.from(t).insert(row). */
function mockClient(insertResult: any = { error: null }) {
  const insert = jest.fn().mockResolvedValue(insertResult)
  const from = jest.fn().mockReturnValue({ insert })
  return { client: { from }, from, insert }
}

/** The row handed to .insert() by the single recordUsage call under test. */
async function insertedRow(overrides: Partial<Parameters<typeof recordUsage>[0]> = {}) {
  const { client, insert } = mockClient()
  await recordUsage({
    client,
    userId: 'u-1',
    route: 'generate',
    outcome: 'success',
    model: 'gemini-3.5-flash',
    attempts: 1,
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    ...overrides,
  } as any)
  return insert.mock.calls[0][0]
}

describe('extractTokenCounts — NULL, never zero', () => {
  // A 0 would be a LIE: it silently deflates the daily SUM and makes the model
  // look cheaper than it is. A null is honest and shows up as a gap in the rollup.
  it('returns null (not 0) for every field when usageMetadata is absent', () => {
    for (const absent of [undefined, null, {}]) {
      expect(extractTokenCounts(absent)).toEqual({
        promptTokens: null,
        outputTokens: null,
        totalTokens: null,
      })
    }
  })

  it('returns null for individually missing fields while keeping the present ones', () => {
    expect(extractTokenCounts({ promptTokenCount: 7 })).toEqual({
      promptTokens: 7,
      outputTokens: null,
      totalTokens: null,
    })
  })

  it('rejects non-integer / negative / string garbage as null rather than coercing', () => {
    const counts = extractTokenCounts({
      promptTokenCount: '123',
      candidatesTokenCount: -5,
      totalTokenCount: 12.5,
    })
    expect(counts).toEqual({ promptTokens: null, outputTokens: null, totalTokens: null })
  })

  it('keeps a genuine zero token count as 0', () => {
    // 0 reported BY GOOGLE is a fact, not an absence. Only a MISSING field is null.
    expect(extractTokenCounts({ promptTokenCount: 0 }).promptTokens).toBe(0)
  })
})

describe('extractTokenCounts — thinking tokens are billed as OUTPUT', () => {
  // The single most important assertion in this file. Thinking models (2.5+, what
  // we are served) spend output tokens on reasoning before the answer, Google
  // bills them at the OUTPUT rate, and they do NOT appear in candidatesTokenCount.
  // Storing candidatesTokenCount alone would understate the real output bill on
  // exactly the model class we run — the one number this table exists to get right.
  it('sums candidatesTokenCount + thoughtsTokenCount into output', () => {
    const counts = extractTokenCounts({
      promptTokenCount: 1000,
      candidatesTokenCount: 500,
      thoughtsTokenCount: 2000,
      totalTokenCount: 3500,
    })
    expect(counts.outputTokens).toBe(2500) // NOT 500
    expect(counts.promptTokens).toBe(1000)
    expect(counts.totalTokens).toBe(3500)
  })

  it('treats a missing thoughtsTokenCount as 0 (non-thinking model)', () => {
    expect(extractTokenCounts({ candidatesTokenCount: 42 }).outputTokens).toBe(42)
  })

  it('does not invent an output count from thoughts alone', () => {
    // No candidatesTokenCount => we do not know the answer-token count. Null.
    expect(extractTokenCounts({ thoughtsTokenCount: 99 }).outputTokens).toBeNull()
  })
})

describe('recordUsage — the row it writes', () => {
  it('writes to usage_events with the mapped columns', async () => {
    const { client, from, insert } = mockClient()
    await recordUsage({
      client,
      userId: 'user-abc',
      route: 'refine',
      outcome: 'success',
      model: 'gemini-3.5-flash',
      attempts: 2,
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22, totalTokenCount: 33 },
    })

    expect(from).toHaveBeenCalledWith('usage_events')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-abc',
        route: 'refine',
        outcome: 'success',
        model: 'gemini-3.5-flash',
        attempts: 2,
        prompt_tokens: 11,
        output_tokens: 22,
        total_tokens: 33,
      })
    )
  })

  it('passes the FULL raw usageMetadata through to the JSONB column', async () => {
    // The raw object is the hedge against re-measuring: cachedContentTokenCount
    // and promptTokensDetails' modality split are billing-relevant and are NOT
    // promoted to columns. Against a 20 RPD budget, re-running to recover a field
    // we forgot is expensive.
    const raw = {
      promptTokenCount: 1,
      candidatesTokenCount: 2,
      totalTokenCount: 3,
      cachedContentTokenCount: 4,
      promptTokensDetails: [{ modality: 'IMAGE', tokenCount: 258 }],
    }
    const row = await insertedRow({ usageMetadata: raw })
    expect(row.usage_metadata).toEqual(raw)
  })

  it('stores usage_metadata as null (not undefined) when Gemini sent none', async () => {
    const row = await insertedRow({ usageMetadata: undefined })
    expect(row.usage_metadata).toBeNull()
    expect(row.prompt_tokens).toBeNull()
  })

  it('records both outcomes — parse_failed is a REAL, BILLED call', async () => {
    // BILLED = every row. EARNED = outcome 'success'. The delta is what we pay for
    // and cannot charge for; dropping parse_failed would prune the most expensive
    // calls (a truncated 8192-token response) from the billing sample.
    const ok = await insertedRow({ outcome: 'success' })
    const failed = await insertedRow({ outcome: 'parse_failed' })
    expect(ok.outcome).toBe('success')
    expect(failed.outcome).toBe('parse_failed')
  })

  it('records a null model when the loop never assigned one', async () => {
    const row = await insertedRow({ model: null, attempts: 0 })
    expect(row.model).toBeNull()
    expect(row.attempts).toBe(0)
  })
})

describe('recordUsage — fails open, but LOUDLY', () => {
  // The whole hazard: because the write is fail-open, a forgotten migration or a
  // revoked grant produces EXACTLY the same UX as success. The loud log is the
  // only thing between us and a silently-empty table found a week later.
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errorSpy.mockRestore())

  it('does not throw when Supabase returns an error, and logs the greppable tag', async () => {
    const { client } = mockClient({ error: { message: 'relation "usage_events" does not exist' } })

    await expect(
      recordUsage({
        client,
        userId: 'u-1',
        route: 'generate',
        outcome: 'success',
        model: 'm',
        attempts: 1,
        usageMetadata: {},
      })
    ).resolves.toBeUndefined()

    const logged = errorSpy.mock.calls[0][0] as string
    expect(logged).toContain('usage-telemetry: INSERT FAILED')
    expect(logged).toContain('relation "usage_events" does not exist')
    // Names the fix, so the log is actionable on its own.
    expect(logged).toContain('2026-07-14_add_usage_events.sql')
  })

  it('does not throw when the client itself blows up mid-insert', async () => {
    // This is the property that keeps a 422 a 422 and a 200 a 200: an unswallowed
    // throw at the parse_failed site would unwind through the route's `finally`
    // and surface as a 500.
    const client = {
      from: () => ({
        insert: () => Promise.reject(new Error('socket hang up')),
      }),
    }

    await expect(
      recordUsage({
        client,
        userId: 'u-1',
        route: 'refine',
        outcome: 'parse_failed',
        model: 'm',
        attempts: 1,
        usageMetadata: {},
      })
    ).resolves.toBeUndefined()

    expect(errorSpy.mock.calls[0][0]).toContain('usage-telemetry: INSERT FAILED')
  })

  it('does not throw when the client is missing entirely', async () => {
    await expect(
      recordUsage({
        client: null,
        userId: 'u-1',
        route: 'generate',
        outcome: 'success',
        model: 'm',
        attempts: 1,
        usageMetadata: {},
      } as any)
    ).resolves.toBeUndefined()
  })
})
