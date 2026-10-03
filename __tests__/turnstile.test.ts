/**
 * Server-side Turnstile check (lib/turnstile.ts): fails closed on what a
 * farmer controls, open only when Cloudflare cannot be reached.
 */
import { verifyTurnstile } from '../src/lib/turnstile'

const SECRET = 'test-secret-never-logged'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let fetchMock: jest.Mock
let logs: string[]

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = SECRET
  fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  logs = []
  for (const m of ['error', 'warn'] as const)
    jest.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
})
afterEach(() => jest.restoreAllMocks())

describe('verifyTurnstile', () => {
  it('no secret configured: refused, and Cloudflare is not called', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    expect(await verifyTurnstile('tok', '1.2.3.4')).toEqual({ ok: false, reason: 'NO_SECRET' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no token: refused without a call', async () => {
    expect(await verifyTurnstile('   ', '1.2.3.4')).toEqual({ ok: false, reason: 'NO_TOKEN' })
    expect(await verifyTurnstile(null, null)).toEqual({ ok: false, reason: 'NO_TOKEN' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a passing token is accepted; secret, token and address go to siteverify', async () => {
    fetchMock.mockResolvedValue(json({ success: true }))
    expect(await verifyTurnstile('tok', '1.2.3.4')).toEqual({ ok: true, checked: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(String(init.body))
    expect(body.get('secret')).toBe(SECRET)
    expect(body.get('response')).toBe('tok')
    expect(body.get('remoteip')).toBe('1.2.3.4')
  })

  it('a rejected token is refused', async () => {
    fetchMock.mockResolvedValue(json({ success: false, 'error-codes': ['invalid-input-response'] }))
    expect(await verifyTurnstile('tok', null)).toEqual({ ok: false, reason: 'REJECTED' })
  })

  it('an unreadable answer is refused, not waved through', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
    expect(await verifyTurnstile('tok', null)).toEqual({ ok: false, reason: 'REJECTED' })
  })

  it('Cloudflare down (5xx or network): let through, marked unchecked', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503))
    expect(await verifyTurnstile('tok', null)).toEqual({ ok: true, checked: false })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await verifyTurnstile('tok', null)).toEqual({ ok: true, checked: false })
  })

  it('a timeout aborts the call and is treated as unreachable', async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))
    )
    expect(await verifyTurnstile('tok', null, 20)).toEqual({ ok: true, checked: false })
  })

  it('the secret never appears in a log line', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: false, 'error-codes': ['bad'] }))
    await verifyTurnstile('tok', null)
    fetchMock.mockRejectedValueOnce(new Error(`boom ${SECRET}`))
    await verifyTurnstile('tok', null)
    expect(logs.length).toBeGreaterThan(0)
    for (const l of logs) expect(l).not.toContain(SECRET)
  })
})
