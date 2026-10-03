/**
 * Auth calls forward the user's address to Supabase (Sb-Forwarded-For), so its
 * per-IP limits count people instead of our server. Database calls are left
 * alone, and the whole thing is inert until a secret key is configured.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { authForwardingFetch, clientIpFrom, forwardingStatus, isIpAddress } from '../src/lib/supabase/forwarded-fetch'

const URL_ = 'https://proj.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiJ9.anon.sig'
const SECRET = 'sb_secret_test_value'
const env = { url: URL_, anonKey: ANON, secretKey: SECRET }

let fetchMock: jest.Mock
beforeEach(() => {
  fetchMock = jest.fn(async () => new Response('{}'))
  global.fetch = fetchMock as unknown as typeof fetch
})

const sent = (i = 0) => {
  const [input, init] = fetchMock.mock.calls[i]
  return { url: String(input), headers: new Headers(init?.headers) }
}

describe('authForwardingFetch', () => {
  it('is inert without a secret key, with a legacy key, or without an address', () => {
    expect(authForwardingFetch('1.2.3.4', { ...env, secretKey: undefined })).toBeUndefined()
    expect(authForwardingFetch('1.2.3.4', { ...env, secretKey: 'eyJhbGciOi.service_role.sig' })).toBeUndefined()
    expect(authForwardingFetch(null, env)).toBeUndefined()
    expect(authForwardingFetch('1.2.3.4', { ...env, url: undefined })).toBeUndefined()
  })

  it('a sign-in carries the secret key and the user address, and drops the anon bearer', async () => {
    const f = authForwardingFetch('203.0.113.9', env)!
    await f(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'content-type': 'application/json' },
    })
    const { headers } = sent()
    expect(headers.get('apikey')).toBe(SECRET)
    expect(headers.get('sb-forwarded-for')).toBe('203.0.113.9')
    expect(headers.get('authorization')).toBeNull()
    expect(headers.get('content-type')).toBe('application/json')
  })

  it("a call made with the user's own token keeps it", async () => {
    const f = authForwardingFetch('203.0.113.9', env)!
    await f(`${URL_}/auth/v1/user`, { headers: { apikey: ANON, Authorization: 'Bearer user.jwt.value' } })
    expect(sent().headers.get('authorization')).toBe('Bearer user.jwt.value')
    expect(sent().headers.get('apikey')).toBe(SECRET)
  })

  it('database calls are untouched: anon key, no forwarded address', async () => {
    const f = authForwardingFetch('203.0.113.9', env)!
    const init = { headers: { apikey: ANON, Authorization: 'Bearer user.jwt.value' } }
    await f(`${URL_}/rest/v1/profiles?select=credits`, init)
    expect(fetchMock.mock.calls[0][1]).toBe(init)
    expect(sent().headers.get('apikey')).toBe(ANON)
    expect(sent().headers.get('sb-forwarded-for')).toBeNull()
  })

  it('another host with an /auth/v1/ path is not given the key', async () => {
    const f = authForwardingFetch('203.0.113.9', env)!
    await f('https://evil.example/auth/v1/token', { headers: { apikey: ANON } })
    expect(sent().headers.get('apikey')).toBe(ANON)
  })
})

describe('clientIpFrom', () => {
  it('prefers x-real-ip, then the first x-forwarded-for hop', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1')
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '2.2.2.2, 10.0.0.1' }))).toBe('2.2.2.2')
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(clientIpFrom(new Headers())).toBeNull()
  })

  it('anything that is not an address is not forwarded', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': 'unknown' }))).toBeNull()
    expect(clientIpFrom(new Headers({ 'x-real-ip': '1.2.3.4 OR 1=1' }))).toBeNull()
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': 'localhost, 2.2.2.2' }))).toBeNull()
    expect(isIpAddress('999.1.1.1')).toBe(false)
  })
})

describe('both server-side clients use it', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
  it('the request-scoped server client', () => {
    const src = read('src/lib/supabase/server.ts')
    expect(src).toMatch(/authForwardingFetch\(ip\)/)
    expect(src).toMatch(/clientIpFrom\(headers\(\)\)/)
  })
  it('the middleware that refreshes sessions', () => {
    const src = read('src/middleware.ts')
    expect(src).toMatch(/authForwardingFetch\(clientIp\)/)
    expect(src).toMatch(/clientIpFrom\(request\.headers\)/)
    expect(src).toMatch(/global: \{ fetch: forwardingFetch \}/)
  })
  it('the browser client is not given anything (it never holds the secret key)', () => {
    expect(read('src/lib/supabase/client.ts')).not.toMatch(/SUPABASE_SECRET_KEY|forwarded-fetch/)
  })
})

describe('forwardingStatus names the reason, never a value', () => {
  it('each state', () => {
    expect(forwardingStatus('1.2.3.4', { url: URL_, secretKey: SECRET })).toBe('active')
    expect(forwardingStatus('1.2.3.4', { url: URL_ })).toBe('no-secret-key')
    expect(forwardingStatus('1.2.3.4', { url: URL_, secretKey: 'eyJ.legacy.key' })).toBe('not-a-secret-key')
    expect(forwardingStatus(null, { url: URL_, secretKey: SECRET })).toBe('no-client-address')
    expect(forwardingStatus('1.2.3.4', { secretKey: SECRET })).toBe('no-url')
  })
})
