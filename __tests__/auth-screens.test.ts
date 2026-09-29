import { readFileSync } from 'fs'
import { join } from 'path'
import { AUTH_PROVIDERS, visibleProviders } from '@/lib/auth-providers'

/**
 * The auth screens, pinned at the SOURCE: jsdom is not wired for React in this
 * suite, so these assert the contract a render would not prove anyway: where
 * banner text may come from, which direction classes are allowed, and when
 * social buttons may exist.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILES = {
  login: 'src/app/(auth)/login/page.tsx',
  update: 'src/app/(auth)/update-password/page.tsx',
  shell: 'src/components/auth/AuthShell.tsx',
  social: 'src/components/auth/SocialButtons.tsx',
}
const code = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, strip(read(p))])) as Record<
  keyof typeof FILES,
  string
>

describe('no raw text reaches an auth screen', () => {
  it.each(['login', 'update'] as const)('%s never renders a URL param or an action result directly', (k) => {
    expect(code[k]).not.toMatch(/\{\s*searchParams\.error\s*\}/)
    expect(code[k]).not.toMatch(/\.detail\b/)
    expect(code[k]).not.toMatch(/\{\s*state\.[a-z]+\s*\}/i)
    expect(code[k]).toMatch(/resolveFeedback\(/)
  })

  it('the banner renders only t(key)', () => {
    const banner = code.shell.slice(code.shell.indexOf('export function AuthBanner'))
    const body = banner.slice(0, banner.indexOf('\n}\n'))
    expect(body).toMatch(/\{t\(feedback\.key\)\}/)
    expect(body).not.toMatch(/\{feedback\.(text|message|code)\}/)
  })

  it('the action result type carries no prose field', () => {
    const lib = strip(read('src/lib/auth-errors.ts'))
    expect(lib).toMatch(/export type AuthResult = \{ code: AuthErrorCode \| AuthSuccessCode \}/)
  })

  it('no route or action puts a message into a /login URL', () => {
    for (const p of [
      'src/app/auth/callback/route.ts',
      'src/app/auth/confirm/actions.ts',
      'src/app/auth/confirm/page.tsx',
      'src/app/(auth)/login/actions.ts',
    ]) {
      const src = strip(read(p))
      expect(src).not.toMatch(/login\?error=['"`]?\s*\+/)
      expect(src).not.toMatch(/encodeURIComponent\([^)]*message/)
      expect(src).not.toMatch(/error_description/)
    }
  })
})

describe('direction and weight', () => {
  const ui = [code.login, code.update, code.shell, code.social].join('\n')
  const classNames = (ui.match(/className=(?:"[^"]*"|\{`[^`]*`\})/g) || []).join(' ')

  it('uses logical direction classes only', () => {
    expect(classNames.length).toBeGreaterThan(500)
    expect(classNames).not.toMatch(/(^|[\s"`:])-?(ml|mr|pl|pr|left|right)-/)
    expect(classNames).not.toMatch(/(^|[\s"`:])text-(left|right)\b/)
    expect(classNames).not.toMatch(/(^|[\s"`:])(ltr|rtl):/)
  })

  it('carries no letter-spacing', () => {
    expect(ui).not.toMatch(/tracking-/)
  })

  it('paints no blur', () => {
    expect(ui).not.toMatch(/blur/)
  })

  it('builds on the dashboard surface vocabulary', () => {
    expect(code.shell).toMatch(/\$\{SURFACE\}/)
    expect(code.login).toMatch(/\$\{TILE\}/)
  })
})

describe('social buttons', () => {
  it('both providers are off', () => {
    expect(AUTH_PROVIDERS).toEqual({ google: false, apple: false })
  })

  it('nothing renders until native detection has resolved to web', () => {
    const on = { google: true, apple: true }
    expect(visibleProviders(on, { isNative: false, resolved: false })).toEqual([])
    expect(visibleProviders(on, { isNative: true, resolved: true })).toEqual([])
    expect(visibleProviders(on, { isNative: true, resolved: false })).toEqual([])
    expect(visibleProviders(on, { isNative: false, resolved: true })).toEqual(['google', 'apple'])
    expect(visibleProviders(AUTH_PROVIDERS, { isNative: false, resolved: true })).toEqual([])
  })

  it('the component asks useIsNative and the flags, and returns null when empty', () => {
    expect(code.social).toMatch(/useIsNative\(\)/)
    expect(code.social).toMatch(/visibleProviders\(AUTH_PROVIDERS, native\)/)
    expect(code.social).toMatch(/if \(providers\.length === 0\) return null/)
  })

  it('the old always-rendered Google form is gone from the login page', () => {
    expect(code.login).not.toMatch(/GOOGLE_ENABLED|signInWithGoogle/)
    expect(code.login).toMatch(/<SocialButtons \/>/)
  })
})
