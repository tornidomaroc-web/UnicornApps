import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * /auth/confirm: loading the link spends nothing; only the Continue button
 * does. The action is tested with Supabase mocked; the page is pinned at
 * the source, since it is a server component and the suite has no DOM.
 */
const mockedCreateClient = jest.fn()
const mockedRedirect = jest.fn((to: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { to })
})
jest.mock('@/lib/supabase/server', () => ({ createClient: (...a: unknown[]) => mockedCreateClient(...a) }))
jest.mock('next/cache', () => ({ revalidatePath: () => {} }))
jest.mock('next/navigation', () => ({ redirect: (to: string) => mockedRedirect(to) }))

import { verifyEmailLink } from '../src/app/auth/confirm/actions'
import { confirmErrorCode, defaultNextForType, isOtpType } from '@/lib/email-links'

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

const fakeSupabase = (verifyError: object | null = null, throws = false) => ({
  auth: {
    verifyOtp: jest.fn(async () => {
      if (throws) throw new Error('fetch failed')
      return { error: verifyError }
    }),
  },
})

beforeEach(() => {
  mockedCreateClient.mockReset()
  mockedRedirect.mockClear()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => (console.error as jest.Mock).mockRestore())

describe('a GET of /auth/confirm never spends the token', () => {
  const dir = 'src/app/auth/confirm'
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const page = strip(readFileSync(join(process.cwd(), dir, 'page.tsx'), 'utf8'))
  const formSrc = strip(readFileSync(join(process.cwd(), dir, 'ConfirmForm.tsx'), 'utf8'))

  it('there is no GET route handler any more', () => {
    expect(existsSync(join(process.cwd(), dir, 'route.ts'))).toBe(false)
  })

  it('the page and the form import no Supabase client and call no verify', () => {
    for (const src of [page, formSrc]) {
      expect(src).not.toMatch(/supabase/i)
      expect(src).not.toMatch(/verifyOtp|exchangeCodeForSession/)
    }
    expect(page).not.toMatch(/'use client'|"use client"/) // a server component: nothing runs on load
  })

  it('the token reaches the action only as hidden fields of a submitted form', () => {
    expect(formSrc).toMatch(/<form action=\{action\}/)
    expect(formSrc).toMatch(/type="hidden" name="token_hash"/)
    expect(formSrc).toMatch(/type="hidden" name="type"/)
    expect(formSrc).toMatch(/type="hidden" name="next"/)
    expect(formSrc).toMatch(/useFormState\(verifyEmailLink/)
    expect(formSrc).toMatch(/login\.confirm\.button/)
  })

  it('a link with no token or no type goes to /login as expired before any render', () => {
    expect(page).toMatch(/if \(!tokenHash \|\| !isOtpType\(type\)\) redirect\('\/login\?error=link_expired'\)/)
  })
})

describe('the Continue POST verifies and redirects on the site', () => {
  it('a recovery token lands on /update-password with the token nowhere in the URL', async () => {
    const sb = fakeSupabase()
    mockedCreateClient.mockReturnValue(sb)
    const to = await redirectedTo(verifyEmailLink(undefined, form({ token_hash: 'th_123', type: 'recovery', next: '/update-password' })))
    expect(sb.auth.verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'th_123' })
    expect(to).toBe('/update-password')
    expect(to).not.toMatch(/th_123|token_hash/)
  })

  it('defaults by type when next is empty', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase())
    expect(await redirectedTo(verifyEmailLink(undefined, form({ token_hash: 'th', type: 'recovery', next: '' })))).toBe('/update-password')
    mockedCreateClient.mockReturnValue(fakeSupabase())
    expect(await redirectedTo(verifyEmailLink(undefined, form({ token_hash: 'th', type: 'email', next: '' })))).toBe('/dashboard')
  })

  it.each(['@evil.com', '//evil.com', 'https://evil.com', '/a/../..//evil.com'])('next=%p cannot leave the site', async (next) => {
    mockedCreateClient.mockReturnValue(fakeSupabase())
    expect(await redirectedTo(verifyEmailLink(undefined, form({ token_hash: 'th', type: 'recovery', next })))).toBe('/update-password')
  })

  it.each([
    ['no token', { type: 'recovery' }],
    ['no type', { token_hash: 'th' }],
    ['an invented type', { token_hash: 'th', type: 'admin' }],
  ])('%s is link_expired without touching Supabase', async (_l, fields) => {
    expect(await verifyEmailLink(undefined, form(fields as Record<string, string>))).toEqual({ code: 'link_expired' })
    expect(mockedCreateClient).not.toHaveBeenCalled()
  })

  it('an expired or used token is link_expired, with no Supabase text', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ code: 'otp_expired', message: 'Email link is invalid or has expired' }))
    expect(await verifyEmailLink(undefined, form({ token_hash: 'th', type: 'recovery' }))).toEqual({ code: 'link_expired' })
  })

  it('a rate limit stays a rate limit', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase({ code: 'over_request_rate_limit', message: 'x' }))
    expect(await verifyEmailLink(undefined, form({ token_hash: 'th', type: 'recovery' }))).toEqual({ code: 'rate_limited' })
  })

  it('a thrown network error and a missing client are codes, not prose', async () => {
    mockedCreateClient.mockReturnValue(fakeSupabase(null, true))
    expect(await verifyEmailLink(undefined, form({ token_hash: 'th', type: 'recovery' }))).toEqual({ code: 'server_unreachable' })
    mockedCreateClient.mockReturnValue(null)
    expect(await verifyEmailLink(undefined, form({ token_hash: 'th', type: 'recovery' }))).toEqual({ code: 'config_error' })
  })
})

describe('email-links helpers', () => {
  it('knows the real OTP types and nothing else', () => {
    for (const t of ['recovery', 'email', 'signup', 'invite', 'magiclink', 'email_change']) expect(isOtpType(t)).toBe(true)
    for (const t of ['admin', '', null, undefined, 'RECOVERY']) expect(isOtpType(t)).toBe(false)
  })
  it('sends recovery to the password form and everything else to the dashboard', () => {
    expect(defaultNextForType('recovery')).toBe('/update-password')
    expect(defaultNextForType('email')).toBe('/dashboard')
  })
  it('reads every verify failure as an expired link except a rate limit', () => {
    expect(confirmErrorCode({ code: 'otp_expired' })).toBe('link_expired')
    expect(confirmErrorCode({ code: 'bad_code_verifier' })).toBe('link_expired')
    expect(confirmErrorCode(null)).toBe('link_expired')
    expect(confirmErrorCode({ code: 'over_email_send_rate_limit' })).toBe('rate_limited')
  })
})
