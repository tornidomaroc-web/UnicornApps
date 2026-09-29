/**
 * /auth/callback as a plain route handler with the server Supabase client
 * mocked at the module boundary. /auth/confirm is a page plus an action now
 * and lives in auth-confirm.test.ts.
 */
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { createClient } from '@/lib/supabase/server'
import { GET as callback } from '../src/app/auth/callback/route'

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

