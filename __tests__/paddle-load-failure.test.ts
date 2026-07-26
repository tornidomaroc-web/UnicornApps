/**
 * getPaddle() failure-path contract.
 *
 * The bug: initializePaddle() REJECTS when the cdn.paddle.com script fails to
 * load (@paddle/paddle-js dist, loadFromCDN → script 'error' listener). We
 * memoised that promise in a module-level `paddlePromise` with no .catch(), so
 * the rejection was both (a) invisible to callers, who `void`-ed it, and (b)
 * cached forever, so every later click in the same session failed instantly.
 *
 * Each test re-imports the module through jest.isolateModulesAsync so the
 * singleton starts clean — there is deliberately no test-only reset export.
 */

// jsdom is not installed (testEnvironment: 'node'), and getPaddle's first guard
// is `typeof window === 'undefined'`. Give it the two window APIs it touches.
const installWindow = () => {
  ;(globalThis as any).window = {
    dispatchEvent: jest.fn(),
  }
}

const removeWindow = () => {
  delete (globalThis as any).window
}

type PaddleModule = typeof import('../src/lib/paddle')

/**
 * Load src/lib/paddle in a fresh module registry with @paddle/paddle-js and
 * @capacitor/core mocked. `initialize` is the mock backing initializePaddle().
 */
async function loadPaddleModule(
  initialize: jest.Mock,
  opts: { native?: boolean } = {}
): Promise<PaddleModule> {
  let mod!: PaddleModule
  await jest.isolateModulesAsync(async () => {
    jest.doMock('@paddle/paddle-js', () => ({ initializePaddle: initialize }))
    jest.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => opts.native === true },
    }))
    mod = await import('../src/lib/paddle')
  })
  return mod
}

describe('getPaddle load-failure handling', () => {
  const ORIGINAL_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN

  beforeEach(() => {
    jest.resetModules()
    installWindow()
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_token'
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    removeWindow()
    jest.restoreAllMocks()
    if (ORIGINAL_TOKEN === undefined) delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    else process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = ORIGINAL_TOKEN
  })

  it('rejects with a typed PaddleLoadError when the CDN load fails (was: silent)', async () => {
    const initialize = jest.fn().mockRejectedValue(new Error('Failed to load Paddle.js - v1'))
    const { getPaddle, PaddleLoadError } = await loadPaddleModule(initialize)

    await expect(getPaddle()).rejects.toBeInstanceOf(PaddleLoadError)
  })

  it('preserves the underlying SDK error as `reason` (does not swallow it)', async () => {
    const underlying = new Error('Failed to load Paddle.js - v1')
    const initialize = jest.fn().mockRejectedValue(underlying)
    const { getPaddle, PaddleLoadError } = await loadPaddleModule(initialize)

    const err = await getPaddle().catch((e) => e)
    expect(err).toBeInstanceOf(PaddleLoadError)
    expect((err as InstanceType<typeof PaddleLoadError>).reason).toBe(underlying)
  })

  it('treats a resolved-but-empty handle as a failure, not an intentional no-op', async () => {
    // initializePaddle is typed Paddle | undefined. On the client an empty
    // resolution means the script never exposed the global — a load failure.
    const initialize = jest.fn().mockResolvedValue(undefined)
    const { getPaddle, PaddleLoadError } = await loadPaddleModule(initialize)

    await expect(getPaddle()).rejects.toBeInstanceOf(PaddleLoadError)
  })

  it('does NOT permanently poison the singleton: a later call re-enters the load path', async () => {
    const initialize = jest
      .fn()
      .mockRejectedValueOnce(new Error('cdn down'))
      .mockResolvedValueOnce({ Checkout: { open: jest.fn() } })
    const { getPaddle } = await loadPaddleModule(initialize)

    await expect(getPaddle()).rejects.toThrow()

    // The regression this guards: with the cache left populated, this second
    // call re-awaited the SAME rejected promise, initialize was never called
    // again, and the button was dead for the rest of the session.
    const paddle = await getPaddle()
    expect(paddle).toBeDefined()
    expect(initialize).toHaveBeenCalledTimes(2)
  })

  it('memoises the SUCCESS path — initializePaddle runs at most once', async () => {
    const initialize = jest.fn().mockResolvedValue({ Checkout: { open: jest.fn() } })
    const { getPaddle } = await loadPaddleModule(initialize)

    const [a, b] = await Promise.all([getPaddle(), getPaddle()])

    expect(initialize).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('does not emit an unhandled rejection when the very first caller is slow', async () => {
    // The cache-clearing .catch() also marks the attempt handled. Without it, a
    // rejection with no awaiting caller yet surfaces as unhandledrejection and
    // (in Node) can take the process down.
    const onUnhandled = jest.fn()
    process.on('unhandledRejection', onUnhandled)

    const initialize = jest.fn().mockRejectedValue(new Error('cdn down'))
    const { getPaddle } = await loadPaddleModule(initialize)

    await expect(getPaddle()).rejects.toThrow()
    // Let the microtask + macrotask queues drain so any unhandled rejection fires.
    await new Promise((resolve) => setTimeout(resolve, 0))

    process.off('unhandledRejection', onUnhandled)
    expect(onUnhandled).not.toHaveBeenCalled()
  })
})

describe('getPaddle intentional-unavailable branches still no-op', () => {
  const ORIGINAL_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN

  beforeEach(() => {
    jest.resetModules()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    removeWindow()
    jest.restoreAllMocks()
    if (ORIGINAL_TOKEN === undefined) delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    else process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = ORIGINAL_TOKEN
  })

  it('server (no window) -> undefined, never throws, never loads the SDK', async () => {
    removeWindow()
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_token'
    const initialize = jest.fn()
    const { getPaddle } = await loadPaddleModule(initialize)

    await expect(getPaddle()).resolves.toBeUndefined()
    expect(initialize).not.toHaveBeenCalled()
  })

  it('native (Capacitor) -> undefined, never throws, never loads the SDK', async () => {
    // The Android app is deliberately payment-free; Paddle.js must never load
    // there. This must stay a silent no-op, NOT a PaddleLoadError.
    installWindow()
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = 'test_token'
    const initialize = jest.fn()
    const { getPaddle } = await loadPaddleModule(initialize, { native: true })

    await expect(getPaddle()).resolves.toBeUndefined()
    expect(initialize).not.toHaveBeenCalled()
  })

  it('missing client token -> undefined, never throws, never loads the SDK', async () => {
    installWindow()
    delete process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    const initialize = jest.fn()
    const { getPaddle } = await loadPaddleModule(initialize)

    await expect(getPaddle()).resolves.toBeUndefined()
    expect(initialize).not.toHaveBeenCalled()
  })
})
