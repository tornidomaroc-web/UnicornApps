/**
 * Direct unit tests for resolveGeminiModels (backlog item 25 = item 36 leg b).
 *
 * WHY THESE EXIST: gemini.ts had NO direct tests. Both route suites
 * (gemini-deadline.test.ts:44, gemini-quota-fallback.test.ts:46) MOCK
 * resolveGeminiModels, so nothing anywhere exercised the real ListModels fetch —
 * which is exactly where the unbounded call lived.
 *
 * WHAT IS PROVABLE HERE, AND WHY (contrast with PR #31). PR #31 could NOT test
 * its core claim: a platform SIGKILL has no lambda to kill under jest, and a
 * killed process cannot assert anything about itself. That limit does NOT apply
 * here, because the thing under test is OUR OWN abort — an owned AbortController
 * plus setTimeout, both fully controllable under fake timers. We are not testing
 * that the platform kills us; we are testing that we stop first.
 *
 * The module-scope cache in gemini.ts is process-global state, so every test
 * resets modules and re-imports to get a clean cache. Without that, one test's
 * successful resolve silently satisfies the next test's fetch.
 */
jest.setTimeout(20_000)

/** A fetch stub. Loosely typed on purpose — these tests drive abort behaviour,
 *  not the fetch contract, and the repo convention is the ambient jest global. */
type FetchStub = jest.Mock<any, any>

/** Resolves only when the caller's signal aborts — i.e. a hang. */
const hangUntilAbort = (capture?: (s: AbortSignal) => void) => (
  _url: string,
  init: RequestInit
) =>
  new Promise((_resolve, reject) => {
    capture?.(init.signal!)
    init.signal!.addEventListener('abort', () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    )
  })

const MODELS_OK = {
  models: [
    {
      name: 'models/gemini-2.5-flash',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-pro',
      supportedGenerationMethods: ['generateContent'],
    },
  ],
}

/** Fresh module registry => fresh module-scope `cached`. */
async function freshModule() {
  let mod: typeof import('@/lib/gemini')
  await jest.isolateModulesAsync(async () => {
    mod = await import('@/lib/gemini')
  })
  return mod!
}

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

describe('resolveGeminiModels — bounding the unbounded ListModels call', () => {
  let fetchMock: FetchStub

  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock = jest.fn() as FetchStub
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('passes an AbortSignal to fetch (the whole point — it had none)', async () => {
    const { resolveGeminiModels } = await freshModule()
    fetchMock.mockResolvedValue(okResponse(MODELS_OK))

    await resolveGeminiModels('key')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init!.signal!.aborted).toBe(false)
  })

  it('REJECTS instead of hanging when the fetch never settles', async () => {
    const { resolveGeminiModels, RESOLVE_TIMEOUT_MS, ModelResolutionError } =
      await freshModule()

    // A fetch that only ever settles by abort — i.e. a hang.
    fetchMock.mockImplementation(hangUntilAbort())

    const promise = resolveGeminiModels('key')
    const assertion = expect(promise).rejects.toThrow(ModelResolutionError)

    await jest.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS)
    await assertion
  })

  it('does NOT abort before the timeout elapses', async () => {
    const { resolveGeminiModels, RESOLVE_TIMEOUT_MS } = await freshModule()
    let captured: AbortSignal | undefined

    fetchMock.mockImplementation(hangUntilAbort((s) => { captured = s }))

    const promise = resolveGeminiModels('key')
    const assertion = expect(promise).rejects.toThrow()

    await jest.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS - 1)
    expect(captured!.aborted).toBe(false)

    await jest.advanceTimersByTimeAsync(1)
    expect(captured!.aborted).toBe(true)
    await assertion
  })

  it('clears the timer on success — no timer left pending on a warm process (PR #31 lesson)', async () => {
    const { resolveGeminiModels } = await freshModule()
    const clearSpy = jest.spyOn(global, 'clearTimeout')
    fetchMock.mockResolvedValue(okResponse(MODELS_OK))

    await resolveGeminiModels('key')

    expect(clearSpy).toHaveBeenCalled()
    // Nothing pending: if the abort timer survived, this would advance onto it.
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clamps the timeout to the deadline when less than RESOLVE_TIMEOUT_MS remains', async () => {
    const { resolveGeminiModels } = await freshModule()
    const { createDeadline } = await import('@/lib/deadline')
    let captured: AbortSignal | undefined

    fetchMock.mockImplementation(hangUntilAbort((s) => { captured = s }))

    // A deadline with ~3s of budget left: far less than RESOLVE_TIMEOUT_MS.
    // maxDuration 60s, margin 4s => started 53s ago leaves ~3s.
    const deadline = createDeadline(60, Date.now() - 53_000)
    const promise = resolveGeminiModels('key', deadline)
    const assertion = expect(promise).rejects.toThrow()

    await jest.advanceTimersByTimeAsync(3_100)
    // Aborted well before RESOLVE_TIMEOUT_MS: the clamp is doing the work.
    expect(captured!.aborted).toBe(true)
    await assertion
  })

  it('caches on success and does not re-fetch while fresh', async () => {
    const { resolveGeminiModels } = await freshModule()
    fetchMock.mockResolvedValue(okResponse(MODELS_OK))

    const first = await resolveGeminiModels('key')
    const second = await resolveGeminiModels('key')

    expect(first).toEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ranks flash first', async () => {
    const { resolveGeminiModels } = await freshModule()
    fetchMock.mockResolvedValue(okResponse(MODELS_OK))

    const names = await resolveGeminiModels('key')

    expect(names[0]).toBe('gemini-2.5-flash')
  })
})

describe('resolveGeminiModels — stale-while-error fallback', () => {
  let fetchMock: FetchStub

  beforeEach(() => {
    jest.useFakeTimers()
    fetchMock = jest.fn() as FetchStub
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  /** Resolve once to populate the cache, then let the TTL lapse. */
  async function warmThenExpire(mod: typeof import('@/lib/gemini')) {
    fetchMock.mockResolvedValue(okResponse(MODELS_OK))
    await mod.resolveGeminiModels('key')
    fetchMock.mockReset()
    // Past CACHE_TTL_MS (1h) so the fresh-cache guard no longer short-circuits.
    jest.setSystemTime(Date.now() + 61 * 60 * 1000)
  }

  it('serves the STALE list when a refresh HANGS (turns a failure into a success)', async () => {
    const mod = await freshModule()
    await warmThenExpire(mod)

    fetchMock.mockImplementation(hangUntilAbort())

    const promise = mod.resolveGeminiModels('key')
    await jest.advanceTimersByTimeAsync(mod.RESOLVE_TIMEOUT_MS)

    // The hang does NOT surface as an error — the user still gets a generation.
    await expect(promise).resolves.toEqual(['gemini-2.5-flash', 'gemini-2.5-pro'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves the STALE list on a non-2xx refresh (incl. a 429 on ListModels itself)', async () => {
    const mod = await freshModule()
    await warmThenExpire(mod)

    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as unknown as Response)

    await expect(mod.resolveGeminiModels('key')).resolves.toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ])
  })

  it('serves the STALE list when the refresh returns nothing usable', async () => {
    const mod = await freshModule()
    await warmThenExpire(mod)

    fetchMock.mockResolvedValue(okResponse({ models: [] }))

    await expect(mod.resolveGeminiModels('key')).resolves.toEqual([
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ])
  })

  it('throws ModelResolutionError when there is NO cache to fall back on (cold process)', async () => {
    const { resolveGeminiModels, ModelResolutionError } = await freshModule()

    fetchMock.mockRejectedValue(new Error('ECONNRESET'))

    // The cold-process case: `cached` is null, so the fallback has nothing to
    // serve. This is the common case at 20 RPD, where processes are rarely warm.
    await expect(resolveGeminiModels('key')).rejects.toThrow(ModelResolutionError)
  })

  it('the ModelResolutionError names the timeout when OUR abort fired', async () => {
    const { resolveGeminiModels, RESOLVE_TIMEOUT_MS } = await freshModule()

    fetchMock.mockImplementation(hangUntilAbort())

    const promise = resolveGeminiModels('key')
    const assertion = expect(promise).rejects.toThrow(/Timed out listing Gemini models/)
    await jest.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS)
    await assertion
  })
})
