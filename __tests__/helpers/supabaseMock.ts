// Chainable + thenable Supabase client mock for the webhook / credit tests.
//
// WHY THIS EXISTS
// The reworked Paddle webhook and tryDeductCredits depend on terminal-call
// semantics that a plain `mockReturnThis()` chain cannot express:
//   - upsert(...).select('id')                  -> [] (duplicate → skip grant)
//                                                   vs [{...}] (newly inserted → grant)
//   - update(...).eq().eq().select('credits')   -> [{...}] (CAS won) vs [] (CAS lost)
//   - select(...).eq().single()                 -> { data: {...} } (one row)
//   - update(...).eq('id', userId)              -> resolves on await of the chain tail
//   - rpc(fn, params)                            -> { data: true/false } or { error } (Piece 5)
//
// This builder lets a test QUEUE the exact { data, error } each terminal await
// should resolve to — in the order the handler awaits them — and RECORDS every
// method call so a test can assert, e.g., that update() was called with
// { credits: 4 } and guarded by .eq('credits', 5).
//
// SCOPE: INFRASTRUCTURE ONLY. No webhook tests are written against it yet — the
// real fixtures (and the tests) land once the sandbox payloads under
// __tests__/fixtures/ are captured for real (see that folder's README). The
// existing suite does not import this file, so it has zero effect on the green
// suite. jest.config.js restricts testMatch to *.test.* so this helper is never
// itself run as a (empty) test suite.

export type QueryResult = { data?: any; error?: any }

export type RecordedCall = { table: string; method: string; args: any[] }

export interface SupabaseMock {
  /** The mocked client to pass into the handler / credit helpers. */
  client: any
  /** Enqueue results consumed (FIFO) by terminal awaits and .single()/.maybeSingle(). */
  queue: (...results: QueryResult[]) => void
  /** Every method call, in invocation order, for assertions. */
  calls: RecordedCall[]
  /** Convenience filter: all recorded calls for a given method name. */
  callsTo: (method: string) => RecordedCall[]
  /** Clear the pending queue and recorded calls between cases. */
  reset: () => void
}

/**
 * Create a fresh chainable Supabase mock.
 *
 * Terminal semantics: a result is dequeued at AWAIT time (not when the chain is
 * built), so constructing `supabase.from('x').update(y).eq('id', u)` consumes
 * nothing until it is awaited. Queue results in the exact order the code under
 * test awaits them.
 */
export function createSupabaseMock(): SupabaseMock {
  const results: QueryResult[] = []
  const calls: RecordedCall[] = []

  const nextResult = (): QueryResult =>
    results.length ? (results.shift() as QueryResult) : { data: null, error: null }

  // A standalone thenable (used by .single()/.maybeSingle()) that defers the
  // dequeue to await time.
  const lazyResult = (): PromiseLike<QueryResult> => ({
    then: (onFulfilled: any, onRejected?: any) =>
      Promise.resolve(nextResult()).then(onFulfilled, onRejected),
  })

  const makeBuilder = (table: string) => {
    const builder: any = {}

    const record = (method: string, args: any[]) => {
      calls.push({ table, method, args })
      return builder
    }

    // Chainable methods. Any of these can also be the chain TAIL: the builder is
    // itself thenable (see builder.then), so awaiting after the last call works.
    for (const method of [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'filter',
      'match', 'order', 'limit', 'range',
    ]) {
      builder[method] = (...args: any[]) => record(method, args)
    }

    // Explicitly terminal single-row accessors → standalone thenable.
    builder.single = (...args: any[]) => {
      calls.push({ table, method: 'single', args })
      return lazyResult()
    }
    builder.maybeSingle = (...args: any[]) => {
      calls.push({ table, method: 'maybeSingle', args })
      return lazyResult()
    }

    // Makes `await supabase.from(t).update(v).eq('id', u)` resolve to the next
    // queued result (the "chain tail awaited directly" case).
    builder.then = (onFulfilled: any, onRejected?: any) =>
      Promise.resolve(nextResult()).then(onFulfilled, onRejected)

    return builder
  }

  const client: any = {
    from: (table: string) => {
      calls.push({ table, method: 'from', args: [table] })
      return makeBuilder(table)
    },
    // Postgres RPC (Piece 5: atomic grant/reversal). Recorded as a single call
    // with args [fnName, paramsObject]; the result is dequeued at AWAIT time, so
    // a test queues e.g. { data: true } (granted), { data: false } (duplicate /
    // no-op), or { data: null, error: {...} } (DB failure -> handler throws 500).
    rpc: (fn: string, params?: any) => {
      calls.push({ table: `rpc:${fn}`, method: 'rpc', args: [fn, params] })
      return lazyResult()
    },
    auth: {
      // Tests drive these with mockResolvedValue(...).
      getUser: jest.fn(),
      getSession: jest.fn(),
    },
  }

  return {
    client,
    queue: (...rs: QueryResult[]) => {
      results.push(...rs)
    },
    calls,
    callsTo: (method: string) => calls.filter((c) => c.method === method),
    reset: () => {
      results.length = 0
      calls.length = 0
    },
  }
}
