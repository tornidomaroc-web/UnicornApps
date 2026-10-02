/**
 * POST /api/account/delete ends a Paddle subscription before it deletes.
 *
 * Supabase (both clients) and fetch are mocked at the module boundary; nothing
 * reaches the network. What is pinned:
 *   - a user with no subscription never reaches Paddle and is deleted as before;
 *   - a billable subscription is canceled, immediately, BEFORE deleteUser;
 *   - a missing key, a timeout or a Paddle refusal keeps the account (409);
 *   - a subscription that is already canceled does not block the delete;
 *   - the API key never appears in a log line or a response.
 */
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { POST } from '../src/app/api/account/delete/route'
import { isBillable } from '../src/lib/paddle-cancel'
import { deleteErrorKey } from '../src/lib/account-delete'
import { resolveApiError } from '../src/lib/api-error'

const KEY = 'test_paddle_key_must_never_be_logged'

type Profile = { subscription_id: string | null; subscription_status: string | null } | null

const order: string[] = []

function setup(opts: { profile?: Profile; profileError?: { message: string } | null } = {}) {
  const signOut = jest.fn(async () => ({ error: null }))
  ;(createServerClient as jest.Mock).mockReturnValue({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
      signOut,
    },
  })
  const deleteUser = jest.fn(async () => {
    order.push('deleteUser')
    return { error: null }
  })
  const eq = jest.fn(() => ({
    maybeSingle: jest.fn(async () => ({ data: opts.profile ?? null, error: opts.profileError ?? null })),
  }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  ;(createAdminClient as jest.Mock).mockReturnValue({ from, auth: { admin: { deleteUser } } })
  return { deleteUser, signOut, from, select, eq }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchMock = jest.fn()
const logs: string[] = []

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch
})

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock.mockReset()
  order.length = 0
  logs.length = 0
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-url'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'
  process.env.PADDLE_API_KEY = KEY
  process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox'
  for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
    })
  }
})

afterEach(() => {
  jest.restoreAllMocks()
  // The key must never reach a log line, whatever the case did.
  for (const line of logs) expect(line).not.toContain(KEY)
})

const ACTIVE: Profile = { subscription_id: 'sub_01test', subscription_status: 'active' }

describe('no subscription: unchanged', () => {
  it.each<[string, Profile]>([
    ['no profile row', null],
    ['a profile without a subscription', { subscription_id: null, subscription_status: null }],
    ['a canceled subscription', { subscription_id: 'sub_01old', subscription_status: 'canceled' }],
    ['an expired subscription', { subscription_id: 'sub_01old', subscription_status: 'expired' }],
  ])('%s: never calls Paddle, deletes, 200', async (_label, profile) => {
    const sb = setup({ profile })
    const res = await POST()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sb.deleteUser).toHaveBeenCalledWith('user-1')
    expect(sb.signOut).toHaveBeenCalled()
  })

  it('works without PADDLE_API_KEY at all (the Android path needs no Paddle config)', async () => {
    delete process.env.PADDLE_API_KEY
    const sb = setup({ profile: { subscription_id: null, subscription_status: null } })
    expect((await POST()).status).toBe(200)
    expect(sb.deleteUser).toHaveBeenCalled()
  })

  it('reads the caller’s own row with the service-role client', async () => {
    const sb = setup({ profile: null })
    await POST()
    expect(sb.from).toHaveBeenCalledWith('profiles')
    expect(sb.select).toHaveBeenCalledWith('subscription_id, subscription_status')
    expect(sb.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('a failed profile read refuses with DELETE_FAILED rather than guess', async () => {
    const sb = setup({ profileError: { message: 'db down' } })
    const res = await POST()
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ code: 'DELETE_FAILED' })
    expect(sb.deleteUser).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('a billable subscription is canceled first', () => {
  it.each(['active', 'past_due', 'paused', null])('status %p: cancels immediately, then deletes', async (status) => {
    const sb = setup({ profile: { subscription_id: 'sub_01test', subscription_status: status } })
    fetchMock.mockImplementation(async () => {
      order.push('cancel')
      return json({ data: { id: 'sub_01test', status: 'canceled' } }, 200)
    })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(order).toEqual(['cancel', 'deleteUser'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_01test/cancel')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ effective_from: 'immediately' })
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(sb.deleteUser).toHaveBeenCalledWith('user-1')
  })

  it('uses the production host unless the env says sandbox', async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = 'production'
    setup({ profile: ACTIVE })
    fetchMock.mockResolvedValue(json({ data: { status: 'canceled' } }, 200))
    await POST()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.paddle.com/subscriptions/sub_01test/cancel')

    delete process.env.NEXT_PUBLIC_PADDLE_ENV
    fetchMock.mockClear()
    setup({ profile: ACTIVE })
    await POST()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.paddle.com/subscriptions/sub_01test/cancel')
  })

  it('an already-canceled subscription counts as success', async () => {
    const sb = setup({ profile: ACTIVE })
    fetchMock
      .mockResolvedValueOnce(json({ error: { type: 'request_error', code: 'any_refusal' } }, 400))
      .mockResolvedValueOnce(json({ data: { id: 'sub_01test', status: 'canceled' } }, 200))

    const res = await POST()

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('https://sandbox-api.paddle.com/subscriptions/sub_01test')
    expect(fetchMock.mock.calls[1][1].method).toBe('GET')
    expect(sb.deleteUser).toHaveBeenCalled()
  })
})

describe('fail closed: the account is kept when the subscription is not ended', () => {
  const expectRefused = async (sb: ReturnType<typeof setup>) => {
    const res = await POST()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({ code: 'SUBSCRIPTION_CANCEL_FAILED' })
    expect(JSON.stringify(body)).not.toContain(KEY)
    expect(sb.deleteUser).not.toHaveBeenCalled()
    expect(sb.signOut).not.toHaveBeenCalled()
  }

  it('missing PADDLE_API_KEY', async () => {
    delete process.env.PADDLE_API_KEY
    const sb = setup({ profile: ACTIVE })
    await expectRefused(sb)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Paddle refuses and the subscription is still active', async () => {
    const sb = setup({ profile: ACTIVE })
    fetchMock
      .mockResolvedValueOnce(json({ error: { code: 'internal_error' } }, 500))
      .mockResolvedValueOnce(json({ data: { status: 'active' } }, 200))
    await expectRefused(sb)
  })

  it('Paddle refuses and the read-back fails too', async () => {
    const sb = setup({ profile: ACTIVE })
    fetchMock
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
    await expectRefused(sb)
  })

  it('a network failure', async () => {
    const sb = setup({ profile: ACTIVE })
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expectRefused(sb)
  })

  it('a timeout: the request is aborted and the account kept', async () => {
    jest.useFakeTimers()
    try {
      const sb = setup({ profile: ACTIVE })
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(new Error('The operation was aborted')))
          })
      )
      const pending = POST()
      await jest.advanceTimersByTimeAsync(8000)
      const res = await pending
      expect(res.status).toBe(409)
      await expect(res.json()).resolves.toEqual({ code: 'SUBSCRIPTION_CANCEL_FAILED' })
      expect(sb.deleteUser).not.toHaveBeenCalled()
      expect(logs.some((l) => /within 8000ms/.test(l))).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('the refusal reaches the user as a translated sentence', () => {
  it('the account screen maps 409 from the status alone', () => {
    expect(deleteErrorKey(409)).toBe('account.err.subscription')
    expect(deleteErrorKey(401)).toBe('account.err.session')
    expect(deleteErrorKey(500)).toBe('account.err.failed')
  })

  it('resolveApiError maps the code too', async () => {
    const t = (k: string) => k
    await expect(resolveApiError(json({ code: 'SUBSCRIPTION_CANCEL_FAILED' }, 409), t)).resolves.toBe(
      'account.err.subscription'
    )
  })
})

describe('isBillable', () => {
  it.each<[Profile, boolean]>([
    [null, false],
    [{ subscription_id: null, subscription_status: 'active' }, false],
    [{ subscription_id: '', subscription_status: 'active' }, false],
    [{ subscription_id: 'sub_1', subscription_status: 'canceled' }, false],
    [{ subscription_id: 'sub_1', subscription_status: 'expired' }, false],
    [{ subscription_id: 'sub_1', subscription_status: 'active' }, true],
    [{ subscription_id: 'sub_1', subscription_status: 'past_due' }, true],
    [{ subscription_id: 'sub_1', subscription_status: 'paused' }, true],
    // An id with no status yet: ask Paddle rather than assume it is over.
    [{ subscription_id: 'sub_1', subscription_status: null }, true],
  ])('%j -> %p', (row, expected) => {
    expect(isBillable(row)).toBe(expected)
  })
})
