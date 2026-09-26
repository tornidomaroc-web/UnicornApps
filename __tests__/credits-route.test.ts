/**
 * GET /api/credits — the one server read the post-purchase poll performs.
 * Node-testable: the route handler is a plain async function and the server
 * Supabase client is mocked at the module boundary, as the webhook tests do.
 */
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { createClient } from '@/lib/supabase/server'
import { GET } from '../src/app/api/credits/route'

const mockedCreateClient = createClient as unknown as jest.Mock

function fakeSupabase(opts: {
  user?: { id: string } | null
  userError?: { message: string } | null
  profile?: { credits: number } | null
  profileError?: { message: string } | null
}) {
  const single = jest.fn(async () => ({ data: opts.profile ?? null, error: opts.profileError ?? null }))
  const eq = jest.fn(() => ({ single }))
  const select = jest.fn(() => ({ eq }))
  const from = jest.fn(() => ({ select }))
  return {
    auth: { getUser: jest.fn(async () => ({ data: { user: opts.user ?? null }, error: opts.userError ?? null })) },
    from,
    _calls: { from, select, eq },
  }
}

beforeEach(() => mockedCreateClient.mockReset())

describe('GET /api/credits', () => {
  it('returns the signed-in user\'s balance, uncached', async () => {
    const sb = fakeSupabase({ user: { id: 'u1' }, profile: { credits: 142 } })
    mockedCreateClient.mockReturnValue(sb)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    await expect(res.json()).resolves.toEqual({ credits: 142 })
    // RLS-scoped read of the caller's own row, nothing else.
    expect(sb._calls.from).toHaveBeenCalledWith('profiles')
    expect(sb._calls.select).toHaveBeenCalledWith('credits')
    expect(sb._calls.eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('treats a missing credits value as 0, never null', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: { id: 'u1' }, profile: null }))
    await expect((await GET()).json()).resolves.toEqual({ credits: 0 })
  })

  it('401 with a code and no prose when signed out', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: null }))
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ code: 'UNAUTHORIZED' })
    expect(body).not.toHaveProperty('error')
  })

  it('500 with a code and no prose when the client or the read fails', async () => {
    mockedCreateClient.mockReturnValue(null)
    let res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ code: 'SERVER_CONFIG' })

    mockedCreateClient.mockReturnValue(
      fakeSupabase({ user: { id: 'u1' }, profileError: { message: 'boom' } })
    )
    res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ code: 'PROFILE_READ_FAILED' })
  })
})
