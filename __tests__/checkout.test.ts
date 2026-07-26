import {
  openCheckout,
  checkoutStatusForEvent,
  PaddleLoadError,
} from '../src/lib/checkout'
import { getPaddle } from '../src/lib/paddle'

// getPaddle is the only dependency: mock it to simulate web (returns a Paddle
// with a Checkout.open spy) vs native/no-token (returns undefined) vs a CDN load
// failure (rejects with PaddleLoadError). requireActual keeps the real
// PaddleLoadError class so `instanceof` in checkout.ts still means something.
jest.mock('../src/lib/paddle', () => ({
  ...jest.requireActual('../src/lib/paddle'),
  getPaddle: jest.fn(),
}))

const mockGetPaddle = getPaddle as jest.Mock

// openCheckout reads these at call time (not import time).
process.env.NEXT_PUBLIC_PADDLE_SUB_PRICE_ID = 'pri_sub_test'
process.env.NEXT_PUBLIC_PADDLE_PACK_PRICE_ID = 'pri_pack_test'

describe('openCheckout gating', () => {
  let open: jest.Mock
  let navigate: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    open = jest.fn()
    navigate = jest.fn()
    // Default: web — Paddle available.
    mockGetPaddle.mockResolvedValue({ Checkout: { open } })
  })

  it('redirects to /login and never opens checkout when userId is null', async () => {
    await openCheckout({ kind: 'sub', userId: null, navigate })

    expect(navigate).toHaveBeenCalledWith('/login')
    expect(mockGetPaddle).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('no-ops on native (getPaddle undefined): no navigate, no checkout', async () => {
    mockGetPaddle.mockResolvedValue(undefined)

    await openCheckout({ kind: 'sub', userId: 'user-123', navigate })

    expect(navigate).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens subscription checkout with the SUB price id and { user_id, plan:pro }', async () => {
    await openCheckout({ kind: 'sub', userId: 'user-123', navigate })

    expect(open).toHaveBeenCalledTimes(1)
    const arg = open.mock.calls[0][0]
    expect(arg.items).toEqual([{ priceId: 'pri_sub_test', quantity: 1 }])
    expect(arg.customData).toEqual({ user_id: 'user-123', plan: 'pro' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens pack checkout with the PACK price id and { user_id, type:pack }', async () => {
    await openCheckout({ kind: 'pack', userId: 'user-123', navigate })

    expect(open).toHaveBeenCalledTimes(1)
    const arg = open.mock.calls[0][0]
    expect(arg.items).toEqual([{ priceId: 'pri_pack_test', quantity: 1 }])
    expect(arg.customData).toEqual({ user_id: 'user-123', type: 'pack' })
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('openCheckout load-failure propagation', () => {
  let navigate: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    navigate = jest.fn()
  })

  it('propagates PaddleLoadError instead of resolving silently', async () => {
    // Previously both call sites did `void openCheckout(...)`, so this rejection
    // was swallowed and the Pay button just did nothing.
    mockGetPaddle.mockRejectedValue(new PaddleLoadError('Failed to load Paddle.js'))

    await expect(
      openCheckout({ kind: 'sub', userId: 'user-123', navigate })
    ).rejects.toBeInstanceOf(PaddleLoadError)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('releases the single-flight guard after a failure (button is not wedged shut)', async () => {
    const open = jest.fn()
    mockGetPaddle.mockRejectedValueOnce(new PaddleLoadError('cdn down'))

    await expect(
      openCheckout({ kind: 'sub', userId: 'user-123', navigate })
    ).rejects.toBeInstanceOf(PaddleLoadError)

    mockGetPaddle.mockResolvedValueOnce({ Checkout: { open } })
    await openCheckout({ kind: 'sub', userId: 'user-123', navigate })

    expect(open).toHaveBeenCalledTimes(1)
  })
})

describe('openCheckout single-flight guard (double-click interlock)', () => {
  let navigate: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    navigate = jest.fn()
  })

  it('a second click during the CDN round-trip does NOT call Checkout.open twice', async () => {
    const open = jest.fn()
    // Hold getPaddle open to model the dynamic import + cdn.paddle.com fetch —
    // the exact window a user can double-click through. A React `disabled` prop
    // alone cannot close it: it only applies after a re-render.
    let release!: (paddle: unknown) => void
    mockGetPaddle.mockReturnValue(new Promise((resolve) => { release = resolve }))

    const first = openCheckout({ kind: 'sub', userId: 'user-123', navigate })
    const second = openCheckout({ kind: 'sub', userId: 'user-123', navigate })

    release({ Checkout: { open } })
    await Promise.all([first, second])

    expect(open).toHaveBeenCalledTimes(1)
    // The re-entrant call must not even reach the loader a second time.
    expect(mockGetPaddle).toHaveBeenCalledTimes(1)
  })

  it('releases after the overlay opens, so a genuine later click still works', async () => {
    const open = jest.fn()
    mockGetPaddle.mockResolvedValue({ Checkout: { open } })

    await openCheckout({ kind: 'sub', userId: 'user-123', navigate })
    await openCheckout({ kind: 'pack', userId: 'user-123', navigate })

    expect(open).toHaveBeenCalledTimes(2)
  })

  it('the not-logged-in redirect is not gated by the guard', async () => {
    // navigate('/login') returns before the guard is taken, so a signed-out user
    // is never left with a dead button.
    await openCheckout({ kind: 'sub', userId: null, navigate })
    await openCheckout({ kind: 'sub', userId: null, navigate })

    expect(navigate).toHaveBeenCalledTimes(2)
  })
})

describe('checkoutStatusForEvent', () => {
  it('maps checkout.completed to success', () => {
    expect(checkoutStatusForEvent('checkout.completed')).toBe('success')
  })

  it.each([
    'checkout.payment.failed',
    'checkout.error',
  ])('keeps mapping the already-handled failure event %s', (name) => {
    expect(checkoutStatusForEvent(name)).toBe('failed')
  })

  it.each([
    'checkout.failed',
    'checkout.payment.error',
  ])('maps the previously DROPPED failure event %s to failed', (name) => {
    // These two are real CheckoutEventNames (verified against the installed
    // @paddle/paddle-js dist) that neither page listened for. A payment failing
    // through either left the banner blank.
    expect(checkoutStatusForEvent(name)).toBe('failed')
  })

  it.each([
    'checkout.loaded',
    'checkout.closed',
    'checkout.updated',
    'checkout.items.updated',
    'checkout.payment.initiated',
    'checkout.customer.created',
    'checkout.discount.applied',
  ])('returns null for the non-outcome event %s', (name) => {
    // Must be null, not a status: a lifecycle event must never CLEAR an outcome
    // already on screen ('checkout.closed' fires right after a failed payment).
    expect(checkoutStatusForEvent(name)).toBeNull()
  })

  it('returns null for undefined / empty / unknown names', () => {
    expect(checkoutStatusForEvent(undefined)).toBeNull()
    expect(checkoutStatusForEvent('')).toBeNull()
    expect(checkoutStatusForEvent('checkout.some.future.event')).toBeNull()
  })
})
