/**
 * /auth/callback as a plain route handler with the server Supabase client
 * mocked at the module boundary. /auth/confirm is a page plus an action now
 * and lives in auth-confirm.test.ts.
 */
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
const mockUpdateUser = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminAuthClient: () => ({ auth: { admin: { updateUserById: (...a: unknown[]) => mockUpdateUser(...a) } } }),
}))
const mockRecord = jest.fn()
jest.mock('@/lib/signup-ledger', () => ({ recordSignupOutcome: (...a: unknown[]) => mockRecord(...a) }))

import { createClient } from '@/lib/supabase/server'
import { GET as callback } from '../src/app/auth/callback/route'

const mockedCreateClient = createClient as unknown as jest.Mock
const ORIGIN = 'https://www.unicornapps.app'

type FakeUser = { id: string; identities: { provider: string }[]; app_metadata: Record<string, unknown> }

function fakeSupabase(
  opts: { exchangeError?: object | null; verifyError?: object | null; user?: FakeUser | null; claimedAt?: string | null } = {}
) {
  const signOut = jest.fn(async () => ({ error: null }))
  return {
    auth: {
      exchangeCodeForSession: jest.fn(async () => ({
        data: { user: opts.user ?? null, session: null },
        error: opts.exchangeError ?? null,
      })),
      verifyOtp: jest.fn(async () => ({ error: opts.verifyError ?? null })),
      signOut,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.user ? { free_credits_claimed_at: opts.claimedAt === undefined ? '2026-10-10T00:00:00Z' : opts.claimedAt } : null,
            error: null,
          }),
        }),
      }),
    }),
    signOut,
  }
}

const get = (path: string) => new Request(`${ORIGIN}${path}`)
const location = (res: Response) => new URL(res.headers.get('location')!)

beforeEach(() => {
  mockedCreateClient.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => (console.error as jest.Mock).mockRestore())

describe('/auth/callback', () => {
  it('exchanges the code and goes to /dashboard by default', async () => {
    const sb = fakeSupabase()
    mockedCreateClient.mockReturnValue(sb)
    const res = await callback(get('/auth/callback?code=abc'))
    expect(sb.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc')
    expect(location(res).href).toBe(`${ORIGIN}/dashboard`)
  })

  it('still finishes a reset link from the CURRENT email template (code + next=/update-password)', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase())
    const res = await callback(get('/auth/callback?code=abc&next=/update-password'))
    expect(location(res).href).toBe(`${ORIGIN}/update-password`)
  })

  it.each(['@evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', '.evil.com'])(
    'next=%p cannot take a signed-in user off the site',
    async (next) => {
      mockedCreateClient.mockReturnValue(fakeSupabase())
      const res = await callback(get(`/auth/callback?code=abc&next=${encodeURIComponent(next)}`))
      expect(location(res).origin).toBe(ORIGIN)
      expect(location(res).pathname).toBe('/dashboard')
    }
  )

  it('turns the provider error into a code and drops its description', async () => {
    const res = await callback(
      get('/auth/callback?error=access_denied&error_description=Your+account+is+locked%2C+email+evil%40x.com')
    )
    const to = location(res)
    expect(to.pathname).toBe('/login')
    expect(to.search).toBe('?error=oauth_cancelled')
    expect(res.headers.get('location')).not.toMatch(/locked|evil/i)
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it('an expired email link is link_expired, not a cancellation', async () => {
    const res = await callback(get('/auth/callback?error=access_denied&error_code=otp_expired&error_description=x'))
    expect(location(res).search).toBe('?error=link_expired')
  })

  it('a reset link opened in another browser offers a new link', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ exchangeError: { code: 'bad_code_verifier', message: 'code challenge does not match' } }))
    const res = await callback(get('/auth/callback?code=abc&next=/update-password'))
    expect(location(res).search).toBe('?error=link_expired')
  })

  it('an OAuth code that fails to exchange is session_expired, with no Supabase text', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ exchangeError: { code: 'flow_state_not_found', message: 'invalid flow state, no valid flow state found' } }))
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).search).toBe('?error=session_expired')
    expect(res.headers.get('location')).not.toMatch(/flow state/i)
  })

  it('no code and no error is a failure, not a redirect to next', async () => {
    const res = await callback(get('/auth/callback?next=/dashboard'))
    expect(location(res).search).toBe('?error=oauth_failed')
  })

  it('a missing server client is config_error', async () => {
    mockedCreateClient.mockReturnValue(null)
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).search).toBe('?error=config_error')
  })
})

describe('/auth/callback after the exchange: the claim and the link guard', () => {
  const google: FakeUser = { id: 'u1', identities: [{ provider: 'google' }], app_metadata: { provider: 'google' } }
  const emailOnly: FakeUser = { id: 'u2', identities: [{ provider: 'email' }], app_metadata: { provider: 'email' } }
  const both: FakeUser = { id: 'u3', identities: [{ provider: 'email' }, { provider: 'google' }], app_metadata: { provider: 'email' } }

  beforeEach(() => {
    mockUpdateUser.mockReset().mockResolvedValue({ data: {}, error: null })
    mockRecord.mockReset().mockResolvedValue(true)
  })

  it('a Google account that has not claimed its credits goes to /welcome, not the dashboard', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: google, claimedAt: null }))
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).pathname).toBe('/welcome')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('a Google account that holds its credits goes where it was going', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: google }))
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).pathname).toBe('/dashboard')
  })

  it('a password account signing in by email link is untouched', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: emailOnly }))
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).pathname).toBe('/dashboard')
    expect(mockUpdateUser).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('a Google identity newly joined to a password account: random password, other sessions out, ledger row, told', async () => {
    const sb = fakeSupabase({ user: both })
    mockedCreateClient.mockReturnValue(sb)
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).pathname + location(res).search).toBe('/welcome?notice=linked')
    expect(mockUpdateUser).toHaveBeenCalledTimes(1)
    const [id, patch] = mockUpdateUser.mock.calls[0] as [string, { password: string; app_metadata: Record<string, unknown> }]
    expect(id).toBe('u3')
    expect(patch.password).toMatch(/^[0-9a-f]{64}$/)
    expect(patch.app_metadata).toMatchObject({ provider: 'email', link_secured: expect.any(String) })
    expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'others' })
    expect(mockRecord).toHaveBeenCalledWith({ outcome: 'linked', method: 'google' })
  })

  it('once secured, a later Google sign-in on that account is left alone', async () => {
    const secured = { ...both, app_metadata: { provider: 'email', link_secured: '2026-10-10T00:00:00Z' } }
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: secured }))
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).pathname).toBe('/dashboard')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('if the rotation fails the user still gets in and nothing claims it was secured', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { code: 'unexpected_failure', message: 'x' } })
    const sb = fakeSupabase({ user: both })
    mockedCreateClient.mockReturnValue(sb)
    const res = await callback(get('/auth/callback?code=abc'))
    expect(location(res).pathname).toBe('/dashboard')
    expect(sb.auth.signOut).not.toHaveBeenCalled()
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('a reset link never runs either decision', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ user: both, claimedAt: null }))
    const res = await callback(get('/auth/callback?code=abc&next=/update-password'))
    expect(location(res).pathname).toBe('/update-password')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})

