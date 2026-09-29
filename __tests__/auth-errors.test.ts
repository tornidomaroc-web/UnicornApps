import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AUTH_ERROR_CODES,
  AUTH_SUCCESS_CODES,
  URL_ERROR_CODES,
  callbackErrorCode,
  mapSupabaseAuthError,
  resolveFeedback,
  safeNextPath,
  urlErrorCode,
} from '@/lib/auth-errors'

/**
 * The auth screens say only what these functions return, and these functions
 * return only members of fixed lists. That is the whole defence against a
 * link writing its own sentence on the login page, so it is pinned from the
 * attacker's side: hostile input in, a known key out.
 */

describe('safeNextPath: next can never leave the site', () => {
  it.each([
    ['@evil.com'], // `${origin}@evil.com` has host evil.com
    ['//evil.com'],
    ['//evil.com/dashboard'],
    ['/\\evil.com'], // browsers read /\ as //
    ['\\\\evil.com'],
    ['https://evil.com'],
    ['http:evil.com'],
    ['javascript:alert(1)'],
    ['.evil.com'],
    ['evil.com'],
    ['/\t/evil.com'], // a tab is stripped by the URL parser, leaving //evil.com
    ['/\n/evil.com'],
    ['/a/../..//evil.com'], // dot segments collapse into //evil.com
    [''],
    [null],
    [undefined],
    [['/dashboard']],
  ])('%p -> fallback', (raw) => {
    expect(safeNextPath(raw)).toBe('/dashboard')
  })

  it('every accepted value resolves to the same origin', () => {
    for (const raw of ['/dashboard', '/update-password', '/%2F%2Fevil.com', '/a/../..//evil.com', '/x?next=//evil.com#h']) {
      const out = safeNextPath(raw)
      expect(out.startsWith('/')).toBe(true)
      expect(out.startsWith('//')).toBe(false)
      expect(new URL(out, 'https://www.unicornapps.app').host).toBe('www.unicornapps.app')
    }
  })

  it('keeps a plain path, its query and its fragment', () => {
    expect(safeNextPath('/update-password')).toBe('/update-password')
    expect(safeNextPath('/dashboard?tab=history#top')).toBe('/dashboard?tab=history#top')
  })

  it('uses the caller fallback', () => {
    expect(safeNextPath('//evil.com', '/update-password')).toBe('/update-password')
  })
})

describe('callbackErrorCode: provider errors become our codes', () => {
  it('reads error_code before error: an expired email link is not a cancellation', () => {
    expect(callbackErrorCode({ error: 'access_denied', error_code: 'otp_expired' })).toBe('link_expired')
  })

  it('a user backing out of the provider screen is a cancellation', () => {
    expect(callbackErrorCode({ error: 'access_denied' })).toBe('oauth_cancelled')
  })

  it.each(['flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'bad_oauth_state', 'bad_oauth_callback'])(
    '%s -> session_expired',
    (error_code) => expect(callbackErrorCode({ error: 'invalid_request', error_code })).toBe('session_expired')
  )

  it('anything else is a generic OAuth failure', () => {
    expect(callbackErrorCode({ error: 'server_error', error_code: 'something_new' })).toBe('oauth_failed')
    expect(callbackErrorCode({ error: '<b>Your account is suspended, call +1 555</b>' })).toBe('oauth_failed')
  })
})

describe('mapSupabaseAuthError', () => {
  it.each([
    ['Invalid login credentials', undefined, 'invalid_credentials'],
    ['Email not confirmed', undefined, 'email_not_confirmed'],
    ['User already registered', undefined, 'already_registered'],
    ['New password should be different from the old password.', undefined, 'same_password'],
    ['Auth session missing!', undefined, 'reset_session_missing'],
    ['Password should be at least 6 characters.', undefined, 'weak_password'],
    ['fetch failed', undefined, 'server_unreachable'],
    ['anything', 'same_password', 'same_password'],
    ['anything', 'over_email_send_rate_limit', 'rate_limited'],
    ['A sentence nobody mapped', undefined, 'unknown'],
  ])('%p (code %p) -> %p', (message, code, expected) => {
    expect(mapSupabaseAuthError(message, code)).toBe(expected)
  })

  it('checks same_password before the generic weak-password match', () => {
    // "at least" would otherwise never be reached, but "different from the
    // old password" must not fall into weak_password either.
    expect(mapSupabaseAuthError('New password should be different from the old password.')).not.toBe('weak_password')
  })
})

describe('no user-controlled string can reach the login screen', () => {
  const hostile = [
    'Could not authenticate',
    'Server Configuration Error',
    '<img src=x onerror=alert(1)>',
    'Your account is locked. Email support@evil.com',
    'invalid_credentials', // a real code, but not one our redirects produce
    'login.err.unknown',
    '__proto__',
    'constructor',
  ]

  it.each(hostile)('?error=%p shows the generic key, never the text', (raw) => {
    const f = resolveFeedback(undefined, raw)
    expect(f).toEqual({ kind: 'error', key: 'login.err.unknown', code: 'unknown' })
  })

  it('an array param is read as its first value, still through the allowlist', () => {
    expect(resolveFeedback(undefined, ['oauth_cancelled', 'x'])?.key).toBe('login.err.oauth_cancelled')
    expect(resolveFeedback(undefined, ['hello'])?.key).toBe('login.err.unknown')
  })

  it('every key it can return names a known code', () => {
    const inputs: unknown[] = [...hostile, ...AUTH_ERROR_CODES, ...AUTH_SUCCESS_CODES, '', null, undefined, 42, {}]
    for (const raw of inputs) {
      for (const f of [resolveFeedback(undefined, raw), resolveFeedback({ code: raw })]) {
        if (!f) continue
        expect(f.key).toMatch(/^login\.(err|msg)\.[a-z_]+$/)
        expect([...AUTH_ERROR_CODES, ...AUTH_SUCCESS_CODES]).toContain(f.code)
      }
    }
  })

  it('only our own redirect codes pass through a URL', () => {
    for (const code of URL_ERROR_CODES) expect(urlErrorCode(code)).toBe(code)
    expect(urlErrorCode('')).toBeNull()
    expect(urlErrorCode(undefined)).toBeNull()
  })

  it('a form result wins over a stale URL error', () => {
    expect(resolveFeedback({ code: 'reset_sent' }, 'oauth_failed')).toEqual({
      kind: 'success',
      key: 'login.msg.reset_sent',
      code: 'reset_sent',
    })
  })
})

describe('every code has copy in both languages', () => {
  const dict = readFileSync(join(process.cwd(), 'src/lib/i18n/LanguageContext.tsx'), 'utf8')
  const count = (key: string) => dict.split(`'${key}':`).length - 1

  it.each(AUTH_ERROR_CODES)('login.err.%s', (code) => expect(count(`login.err.${code}`)).toBe(2))
  it.each(AUTH_SUCCESS_CODES)('login.msg.%s', (code) => expect(count(`login.msg.${code}`)).toBe(2))
  it.each(['login.apple', 'login.google', 'login.or', 'login.action.send_new_link'])('%s', (key) =>
    expect(count(key)).toBe(2)
  )
})
