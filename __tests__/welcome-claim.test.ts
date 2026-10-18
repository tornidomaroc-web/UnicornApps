/**
 * The welcome claim (app/welcome/actions.ts) is the only way an account that
 * Supabase created outside our server gets its free credits, so it carries
 * the same guards in the same order as the email sign-up, and the grant is
 * the service-role RPC. Guards and the RPC stubbed at the module boundary.
 */
export {}

const mockVerify = jest.fn()
const mockLimit = jest.fn()
const mockRpc = jest.fn()
const mockGetUser = jest.fn()
const mockRecord = jest.fn()

jest.mock('next/headers', () => ({ headers: () => new Headers({ 'x-real-ip': '198.51.100.23' }) }))
jest.mock('next/cache', () => ({ revalidatePath: () => {} }))
jest.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { to })
  },
}))
jest.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: () => mockGetUser() } }) }))
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}))
jest.mock('@/lib/turnstile', () => ({
  TURNSTILE_FIELD: 'cf-turnstile-response',
  verifyTurnstile: (...a: unknown[]) => mockVerify(...a),
}))
jest.mock('@/lib/signup-limit', () => ({
  clientIp: (h: Headers) => h.get('x-real-ip'),
  checkSignupLimit: (...a: unknown[]) => mockLimit(...a),
}))
jest.mock('@/lib/signup-ledger', () => ({
  ...jest.requireActual('../src/lib/signup-ledger'),
  recordSignupOutcome: (...a: unknown[]) => mockRecord(...a),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'

import { claimFreeCredits } from '../src/app/welcome/actions'

const form = (token?: string) => {
  const d = new FormData()
  if (token !== undefined) d.set('cf-turnstile-response', token)
  return d
}
const GOOGLE_USER = { id: 'u-google', app_metadata: { provider: 'google', providers: ['google'] } }
const recorded = () => mockRecord.mock.calls.map(c => c[0])

async function settle(p: Promise<unknown>): Promise<{ to?: string; result?: unknown }> {
  try {
    return { result: await p }
  } catch (e: any) {
    if (e?.to) return { to: e.to }
    throw e
  }
}

beforeEach(() => {
  for (const m of [mockVerify, mockLimit, mockRpc, mockGetUser, mockRecord]) m.mockReset()
  mockRecord.mockResolvedValue(true)
  mockGetUser.mockResolvedValue({ data: { user: GOOGLE_USER } })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('claimFreeCredits', () => {
  it('no session: back to /login, nothing checked, nothing recorded', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await settle(claimFreeCredits(undefined, form('tok')))).to).toBe('/login')
    expect(mockVerify).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(recorded()).toEqual([])
  })

  it('a failed widget is captcha_failed: no budget spent, no grant, recorded under the Google method', async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: 'REJECTED', codes: ['invalid-input-response'] })
    expect(await claimFreeCredits(undefined, form('tok'))).toEqual({ code: 'captcha_failed' })
    expect(mockVerify).toHaveBeenCalledWith('tok', '198.51.100.23')
    expect(mockLimit).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(recorded()).toEqual([{ outcome: 'captcha_rejected', detail: 'invalid-input-response', turnstileChecked: true, method: 'google' }])
  })

  it('no token is captcha_failed too', async () => {
    mockVerify.mockResolvedValue({ ok: false, reason: 'NO_TOKEN' })
    expect(await claimFreeCredits(undefined, form())).toEqual({ code: 'captcha_failed' })
    expect(mockRpc).not.toHaveBeenCalled()
    expect(recorded()).toEqual([{ outcome: 'captcha_no_token', method: 'google' }])
  })

  it('a network over its cap is signup_limited: the same cap as the email sign-up, no grant', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: false, window: 'hour' })
    expect(await claimFreeCredits(undefined, form('tok'))).toEqual({ code: 'signup_limited' })
    expect(mockLimit).toHaveBeenCalledWith('198.51.100.23')
    expect(mockRpc).not.toHaveBeenCalled()
    expect(recorded()).toEqual([{ outcome: 'signup_limited', detail: 'hour', turnstileChecked: true, method: 'google' }])
  })

  it('a passing claim: the service-role RPC for THIS user, a ledger row, then the dashboard', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: true, checked: true })
    mockRpc.mockResolvedValue({ data: 'claimed', error: null })
    expect((await settle(claimFreeCredits(undefined, form('tok')))).to).toBe('/dashboard')
    expect(mockRpc).toHaveBeenCalledWith('claim_free_credits', { p_user_id: 'u-google' })
    expect(recorded()).toEqual([{ outcome: 'claimed', turnstileChecked: true, limitChecked: true, method: 'google' }])
  })

  it('a second submit finds the credits already there and still goes to the dashboard', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: true, checked: true })
    mockRpc.mockResolvedValue({ data: 'already_claimed', error: null })
    expect((await settle(claimFreeCredits(undefined, form('tok')))).to).toBe('/dashboard')
    expect(recorded()).toEqual([{ outcome: 'claim_failed', detail: 'already_claimed', turnstileChecked: true, limitChecked: true, method: 'google' }])
  })

  it('a missing profile, an RPC error and an unreachable backend are our failures, never Supabase text', async () => {
    mockVerify.mockResolvedValue({ ok: true, checked: true })
    mockLimit.mockResolvedValue({ allowed: true, checked: true })
    mockRpc.mockResolvedValueOnce({ data: 'no_profile', error: null })
    expect(await claimFreeCredits(undefined, form('tok'))).toEqual({ code: 'config_error' })
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for function claim_free_credits' } })
    expect(await claimFreeCredits(undefined, form('tok'))).toEqual({ code: 'config_error' })
    mockRpc.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await claimFreeCredits(undefined, form('tok'))).toEqual({ code: 'server_unreachable' })
    expect(recorded().map(r => [r.outcome, r.detail])).toEqual([
      ['claim_failed', 'no_profile'],
      ['claim_failed', '42501'],
      ['claim_failed', 'server_unreachable'],
    ])
  })

  it('an email account that somehow lands here is recorded under its own method', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u-email', app_metadata: { provider: 'email' } } } })
    mockVerify.mockResolvedValue({ ok: false, reason: 'NO_TOKEN' })
    await claimFreeCredits(undefined, form())
    expect(recorded()).toEqual([{ outcome: 'captcha_no_token', method: 'email' }])
  })
})
