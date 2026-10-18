/**
 * The login server actions: every result is a code, and OAuth is refused on
 * the server whenever its button would not be shown.
 *
 * next/navigation's redirect() throws in Next; the mock does the same so a
 * test can read where an action went.
 */
// Shared through wrappers so a module registry re-created by isolateModules
// (the flags-on suite) still reaches the SAME mocks.
const mockedCreateClient = jest.fn()
const mockedNative = jest.fn(() => false)
jest.mock('@/lib/supabase/server', () => ({ createClient: (...a: unknown[]) => mockedCreateClient(...a) }))
jest.mock('@/lib/native-request', () => ({ isNativeRequest: () => mockedNative() }))
jest.mock('next/cache', () => ({ revalidatePath: () => {} }))
// Sign-up's guards (Turnstile, the per-network cap) are tested in
// signup-guard.test.ts; here they pass so these tests reach the account call.
const mockedAdminCreateUser = jest.fn()
jest.mock('next/headers', () => ({ headers: () => new Headers({ 'x-real-ip': '203.0.113.7' }) }))
jest.mock('@/lib/turnstile', () => ({
  TURNSTILE_FIELD: 'cf-turnstile-response',
  verifyTurnstile: async () => ({ ok: true, checked: true }),
}))
jest.mock('@/lib/signup-limit', () => ({
  clientIp: () => '203.0.113.7',
  checkSignupLimit: async () => ({ allowed: true, checked: true }),
}))
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser: (...a: unknown[]) => mockedAdminCreateUser(...a) } } }),
}))
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role'
jest.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to })
  },
}))

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function redirectedTo(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e: any) {
    if (e?.to) return e.to
    throw e
  }
  throw new Error('expected a redirect')
}

beforeEach(() => {
  mockedCreateClient.mockReset()
  mockedNative.mockReturnValue(false)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => (console.error as jest.Mock).mockRestore())

describe('form actions return codes, never Supabase text', () => {
  // Imported lazily so the provider-flag suite below can re-import with its own mock.
  const actions = () => require('../src/app/(auth)/login/actions')

  it('an unmapped error is `unknown` with nothing else attached', async () => {
    mockedCreateClient.mockReturnValue({
      auth: { signInWithPassword: jest.fn(async () => ({ error: { message: 'Database error granting user' } })) },
    })
    const res = await actions().login(undefined, form({ email: 'a@b.co', password: 'x' }))
    expect(res).toEqual({ code: 'unknown' })
  })

  it('a thrown network error is server_unreachable with nothing else attached', async () => {
    mockedCreateClient.mockReturnValue({ auth: {} })
    mockedAdminCreateUser.mockImplementationOnce(async () => {
      throw new Error('getaddrinfo ENOTFOUND qwgd.supabase.co')
    })
    const res = await actions().signup(undefined, form({ email: 'a@b.co', password: 'secret1' }))
    expect(res).toEqual({ code: 'server_unreachable' })
  })

  it('saving a password with no recovery session is reset_session_missing', async () => {
    mockedCreateClient.mockReturnValue({
      auth: { updateUser: jest.fn(async () => ({ error: { message: 'Auth session missing!', code: undefined } })) },
    })
    const res = await actions().updatePassword(undefined, form({ password: 'secret1' }))
    expect(res).toEqual({ code: 'reset_session_missing' })
  })

  it('the reset email still points at /auth/callback, which the current template needs', async () => {
    const resetPasswordForEmail = jest.fn(async () => ({ error: null }))
    mockedCreateClient.mockReturnValue({ auth: { resetPasswordForEmail } })
    const res = await actions().requestPasswordReset(undefined, form({ email: 'a@b.co' }))
    expect(res).toEqual({ code: 'reset_sent' })
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: 'http://localhost:3000/auth/callback?next=/update-password',
    })
  })

  it('logout with no client redirects with a code', async () => {
    mockedCreateClient.mockReturnValue(null)
    expect(await redirectedTo(actions().logout())).toBe('/login?error=config_error')
  })
})

describe('signInWithProvider is refused on the server', () => {
  const actions = () => require('../src/app/(auth)/login/actions')

  // Google's flag is on (auth-providers.ts); its refusals are the native and
  // provider-error cases below. Apple is the one still behind an off flag.
  it.each(['apple'])('%s is refused while its flag is off, before Supabase is touched', async (p) => {
    expect(await redirectedTo(actions().signInWithProvider(p))).toBe('/login?error=oauth_failed')
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it.each(['github', '', null, { provider: 'google' }])('an unknown provider %p is refused', async (p) => {
    expect(await redirectedTo(actions().signInWithProvider(p))).toBe('/login?error=oauth_failed')
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  describe('with the flags switched on', () => {
    let enabled: any
    beforeEach(() => {
      jest.isolateModules(() => {
        jest.doMock('@/lib/auth-providers', () => ({
          ...jest.requireActual('@/lib/auth-providers'),
          AUTH_PROVIDERS: { google: true, apple: true },
        }))
        enabled = require('../src/app/(auth)/login/actions')
      })
    })
    afterEach(() => jest.dontMock('@/lib/auth-providers'))

    it('the native app is still refused', async () => {
      mockedNative.mockReturnValue(true)
      expect(await redirectedTo(enabled.signInWithProvider('google'))).toBe('/login?error=oauth_failed')
      expect(mockedCreateClient).not.toHaveBeenCalled()
    })

    it('on the web it goes to the provider URL Supabase returns', async () => {
      const signInWithOAuth = jest.fn(async () => ({ data: { url: 'https://accounts.google.com/o/oauth2/auth?x' }, error: null }))
      mockedCreateClient.mockReturnValue({ auth: { signInWithOAuth } })
      expect(await redirectedTo(enabled.signInWithProvider('google'))).toBe('https://accounts.google.com/o/oauth2/auth?x')
      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'http://localhost:3000/auth/callback' },
      })
    })

    it('a provider error becomes oauth_failed, never its message', async () => {
      mockedCreateClient.mockReturnValue({
        auth: { signInWithOAuth: jest.fn(async () => ({ data: { url: null }, error: { message: 'Unsupported provider: provider is not enabled' } })) },
      })
      const to = await redirectedTo(enabled.signInWithProvider('apple'))
      expect(to).toBe('/login?error=oauth_failed')
    })
  })
})
