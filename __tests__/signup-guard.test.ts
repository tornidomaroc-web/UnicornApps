/**
 * The sign-up action is the only path that hands out free credits, so it alone
 * is guarded: Turnstile, then a per-network cap, then an account created by the
 * server with the admin API. Sign-in and password reset carry no check.
 */
export {} // a module, so its helpers do not collide with other test files under tsc

const mockVerify = jest.fn()
const mockLimit = jest.fn()
const mockCreateUser = jest.fn()
const mockServerClient = jest.fn()
const mockRpc = jest.fn()

jest.mock('next/headers', () => ({
  headers: () => new Headers({ 'x-real-ip': '198.51.100.23', 'x-forwarded-for': '198.51.100.23, 10.0.0.1' }),
}))
jest.mock('next/cache', () => ({ revalidatePath: () => {} }))
jest.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to })
  },
}))
jest.mock('@/lib/native-request', () => ({ isNativeRequest: () => false }))
jest.mock('@/lib/supabase/server', () => ({ createClient: () => mockServerClient() }))
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { createUser: (...a: unknown[]) => mockCreateUser(...a) } },
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'

const form = (f: Record<string, string>) => {
  const d = new FormData()
  for (const [k, v] of Object.entries(f)) d.set(k, v)
  return d
}
const SIGNUP = { email: 'new@example.com', password: 'secret12', 'cf-turnstile-response': 'tok-123' }

async function settle(p: Promise<unknown>): Promise<{ to?: string; result?: unknown }> {
  try {
    return { result: await p }
  } catch (e: any) {
    if (e?.to) return { to: e.to }
    throw e
  }
}

beforeEach(() => {
  jest.resetModules()
  for (const m of [mockVerify, mockLimit, mockCreateUser, mockServerClient, mockRpc]) m.mockReset()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('the sign-up action, with its guards stubbed', () => {
  beforeEach(() => {
    jest.doMock('@/lib/turnstile', () => ({
      TURNSTILE_FIELD: 'cf-turnstile-response',
      verifyTurnstile: (...a: unknown[]) => mockVerify(...a),
    }))
    jest.doMock('@/lib/signup-limit', () => ({
      clientIp: (h: Headers) => h.get('x-real-ip'),
      checkSignupLimit: (...a: unknown[]) => mockLimit(...a),
    }))
  })
  const signup = () => require('../src/app/(auth)/login/actions').signup

  const signIn = jest.fn()
  const signUpPublic = jest.fn()
  beforeEach(() => {
    signIn.mockReset().mockResolvedValue({ error: null })
    signUpPublic.mockReset()
    mockServerClient.mockReturnValue({ auth: { signInWithPassword: signIn, signUp: signUpPublic } })
  })

  it('a failed widget is captcha_failed: no network budget spent, no account made', async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: 'REJECTED' })
    expect(await signup()(undefined, form(SIGNUP))).toEqual({ code: 'captcha_failed' })
    expect(mockVerify).toHaveBeenCalledWith('tok-123', '198.51.100.23')
    expect(mockLimit).not.toHaveBeenCalled()
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('a missing secret is config_error, not a captcha message', async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: 'NO_SECRET' })
    expect(await signup()(undefined, form(SIGNUP))).toEqual({ code: 'config_error' })
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('a network over its cap is signup_limited, with no account made', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: false, window: 'day' })
    expect(await signup()(undefined, form(SIGNUP))).toEqual({ code: 'signup_limited' })
    expect(mockLimit).toHaveBeenCalledWith('198.51.100.23')
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('a passing sign-up: admin account (confirmed), then a session, then the dashboard', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: true, checked: true })
    mockCreateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const out = await settle(signup()(undefined, form(SIGNUP)))
    expect(out.to).toBe('/dashboard')
    expect(mockCreateUser).toHaveBeenCalledWith({ email: 'new@example.com', password: 'secret12', email_confirm: true })
    expect(signIn).toHaveBeenCalledWith({ email: 'new@example.com', password: 'secret12' })
    // The public sign-up endpoint is never used: it is closed in Supabase.
    expect(signUpPublic).not.toHaveBeenCalled()
  })

  it('an address already registered is already_registered, never Supabase text', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: true, checked: true })
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'email_exists', message: 'A user with this email address has already been registered' },
    })
    expect(await signup()(undefined, form(SIGNUP))).toEqual({ code: 'already_registered' })
    expect(signIn).not.toHaveBeenCalled()
  })

  it('the cheap field checks still run before any guard', async () => {
    expect(await signup()(undefined, form({ email: 'a@b.co', password: '123' }))).toEqual({ code: 'weak_password' })
    expect(await signup()(undefined, form({ email: '', password: 'secret12' }))).toEqual({ code: 'missing_fields' })
    expect(mockVerify).not.toHaveBeenCalled()
  })
})

describe('sign-in and password reset carry no captcha', () => {
  it('login and requestPasswordReset never touch Turnstile or the cap', async () => {
    jest.doMock('@/lib/turnstile', () => ({
      TURNSTILE_FIELD: 'cf-turnstile-response',
      verifyTurnstile: (...a: unknown[]) => mockVerify(...a),
    }))
    jest.doMock('@/lib/signup-limit', () => ({
      clientIp: () => '198.51.100.23',
      checkSignupLimit: (...a: unknown[]) => mockLimit(...a),
    }))
    const signInWithPassword = jest.fn().mockResolvedValue({ error: null })
    const resetPasswordForEmail = jest.fn().mockResolvedValue({ error: null })
    mockServerClient.mockReturnValue({ auth: { signInWithPassword, resetPasswordForEmail } })
    const a = require('../src/app/(auth)/login/actions')
    await settle(a.login(undefined, form({ email: 'a@b.co', password: 'pw' })))
    await a.requestPasswordReset(undefined, form({ email: 'a@b.co' }))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' })
    expect(mockVerify).not.toHaveBeenCalled()
    expect(mockLimit).not.toHaveBeenCalled()
  })
})

describe('the per-network cap (lib/signup-limit.ts)', () => {
  // The suites above doMock this module; these tests need the real one.
  const lib = () => jest.requireActual('../src/lib/signup-limit')

  it('reads the address Vercel set, x-real-ip first, then the first forwarded hop', () => {
    const { clientIp } = lib()
    expect(clientIp(new Headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1')
    expect(clientIp(new Headers({ 'x-forwarded-for': ' 2.2.2.2 , 10.0.0.1' }))).toBe('2.2.2.2')
    expect(clientIp(new Headers())).toBeNull()
  })

  it('stores a hash, never the address', () => {
    const { networkKey } = lib()
    const k = networkKey('198.51.100.23')
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    expect(k).not.toContain('198')
    expect(networkKey('198.51.100.23')).toBe(k)
    expect(networkKey('198.51.100.24')).not.toBe(k)
  })

  it('asks the database with the hash and the default limits', async () => {
    mockRpc.mockResolvedValue({ data: 'allowed', error: null })
    expect(await lib().checkSignupLimit('198.51.100.23')).toEqual({ allowed: true, checked: true })
    expect(mockRpc).toHaveBeenCalledWith('check_signup_limit', {
      p_network: lib().networkKey('198.51.100.23'),
      p_per_hour: 5,
      p_per_day: 10,
    })
  })

  it('a full window refuses', async () => {
    mockRpc.mockResolvedValue({ data: 'hour', error: null })
    expect(await lib().checkSignupLimit('1.1.1.1')).toEqual({ allowed: false, window: 'hour' })
  })

  it('fails open: no address, an RPC error, a throw, missing credentials', async () => {
    expect(await lib().checkSignupLimit(null)).toEqual({ allowed: true, checked: false })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } })
    expect(await lib().checkSignupLimit('1.1.1.1')).toEqual({ allowed: true, checked: false })
    mockRpc.mockRejectedValueOnce(new Error('network'))
    expect(await lib().checkSignupLimit('1.1.1.1')).toEqual({ allowed: true, checked: false })
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(await lib().checkSignupLimit('1.1.1.1')).toEqual({ allowed: true, checked: false })
    process.env.SUPABASE_SERVICE_ROLE_KEY = key
  })
})

describe('the screen', () => {
  const { readFileSync } = jest.requireActual('fs') as typeof import('fs')
  const page = readFileSync(require('path').join(__dirname, '../src/app/(auth)/login/page.tsx'), 'utf8')
  const widget = readFileSync(require('path').join(__dirname, '../src/components/auth/TurnstileWidget.tsx'), 'utf8')

  it('the widget renders on the sign-up form only, in the UI language', () => {
    const uses = page.match(/<TurnstileWidget\b[^>]*>/g) ?? []
    expect(uses).toHaveLength(1)
    expect(page).toMatch(/mode === 'signup' && <TurnstileWidget lang=\{lang === 'ar' \? 'ar' : 'en'\} resetKey=\{signupState\} \/>/)
  })

  it('the widget uses only the public site key and asks for a fresh token after every result', () => {
    expect(widget).toMatch(/process\.env\.NEXT_PUBLIC_TURNSTILE_SITE_KEY/)
    expect(widget).not.toMatch(/TURNSTILE_SECRET_KEY/)
    expect(widget).toMatch(/window\.turnstile\.reset\(widgetId\.current\)/)
  })
})
