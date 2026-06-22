import { openCheckout } from '../src/lib/checkout'
import { getPaddle } from '../src/lib/paddle'

// getPaddle is the only dependency: mock it to simulate web (returns a Paddle
// with a Checkout.open spy) vs native/no-token (returns undefined).
jest.mock('../src/lib/paddle', () => ({ getPaddle: jest.fn() }))

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
