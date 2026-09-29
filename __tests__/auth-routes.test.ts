/**
 * /auth/callback and /auth/confirm, as plain route handlers with the server
 * Supabase client mocked at the module boundary.
 */
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { createClient } from '@/lib/supabase/server'
import { GET as callback } from '../src/app/auth/callback/route'
import { GET as confirm } from '../src/app/auth/confirm/route'

const mockedCreateClient = createClient as unknown as jest.Mock
const ORIGIN = 'https://www.unicornapps.app'

function fakeSupabase(opts: { exchangeError?: object | null; verifyError?: object | null } = {}) {
  return {
    auth: {
      exchangeCodeForSession: jest.fn(async () => ({ error: opts.exchangeError ?? null })),
      verifyOtp: jest.fn(async () => ({ error: opts.verifyError ?? null })),
    },
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

describe('/auth/confirm (token_hash + verifyOtp)', () => {
  it('verifies a recovery token and lands on /update-password with NO token in the URL', async () => {
    const sb = fakeSupabase()
    mockedCreateClient.mockReturnValue(sb)
    const res = await confirm(get('/auth/confirm?token_hash=th_123&type=recovery&next=/update-password'))
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'th_123' })
    const to = location(res)
    expect(to.href).toBe(`${ORIGIN}/update-password`)
    expect(res.headers.get('location')).not.toMatch(/token_hash|th_123|type=/)
  })

  it('defaults a recovery link to /update-password when next is missing', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase())
    const res = await confirm(get('/auth/confirm?token_hash=th&type=recovery'))
    expect(location(res).pathname).toBe('/update-password')
  })

  it.each(['@evil.com', '//evil.com', 'https://evil.com'])('next=%p stays on the site', async (next) => {
    mockedCreateClient.mockReturnValue(fakeSupabase())
    const res = await confirm(get(`/auth/confirm?token_hash=th&type=recovery&next=${encodeURIComponent(next)}`))
    expect(location(res).origin).toBe(ORIGIN)
    expect(location(res).pathname).toBe('/update-password')
  })

  it.each([
    ['no token', '/auth/confirm?type=recovery'],
    ['no type', '/auth/confirm?token_hash=th'],
    ['an invented type', '/auth/confirm?token_hash=th&type=admin'],
  ])('%s -> link_expired without calling Supabase', async (_label, path) => {
    const res = await confirm(get(path))
    expect(location(res).search).toBe('?error=link_expired')
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it('an expired or used token is link_expired, with no Supabase text', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ verifyError: { code: 'otp_expired', message: 'Email link is invalid or has expired' } }))
    const res = await confirm(get('/auth/confirm?token_hash=th&type=recovery'))
    expect(location(res).search).toBe('?error=link_expired')
    expect(res.headers.get('location')).not.toMatch(/invalid|expired\b.*link/i)
  })
})
