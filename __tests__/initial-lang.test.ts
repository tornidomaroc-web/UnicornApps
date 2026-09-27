import { readFileSync } from 'fs'
import { join } from 'path'
import {
  resolveInitialLang,
  preferredPrimaryTags,
  langCookieString,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE_S,
} from '@/lib/i18n/initial-lang'

/**
 * The first paint's language is decided on the server from the cookie or the
 * device's Accept-Language. Before this, the provider started from a
 * hard-coded 'en', so the Android app forgot Arabic on every launch and every
 * Arabic-locale phone saw English first.
 */

describe('resolveInitialLang — the cookie is an explicit choice and always wins', () => {
  it('cookie ar beats an English device', () => {
    expect(resolveInitialLang('ar', 'en-US,en;q=0.9')).toBe('ar')
  })
  it('cookie en beats an Arabic device', () => {
    expect(resolveInitialLang('en', 'ar-SA,ar;q=0.9')).toBe('en')
  })
  it('a cookie with a value we do not ship is ignored, not trusted', () => {
    expect(resolveInitialLang('fr', 'ar-SA')).toBe('ar')
    expect(resolveInitialLang('', 'ar-SA')).toBe('ar')
    expect(resolveInitialLang('AR', 'en')).toBe('en')
  })
})

describe('resolveInitialLang — Accept-Language decides when there is no cookie', () => {
  it('ar-SA gives ar', () => {
    expect(resolveInitialLang(undefined, 'ar-SA,ar;q=0.9,en-US;q=0.8')).toBe('ar')
  })
  it('fa-IR gives en (we do not ship Persian)', () => {
    expect(resolveInitialLang(undefined, 'fa-IR,fa;q=0.9')).toBe('en')
  })
  it('a shipped language ranked below an unshipped one still wins', () => {
    expect(resolveInitialLang(null, 'fr-FR,ar;q=0.9')).toBe('ar')
  })
  it('respects q order, not textual order', () => {
    expect(resolveInitialLang(null, 'ar;q=0.5,en;q=0.8')).toBe('en')
  })
  it('primary subtag matching is case-insensitive', () => {
    expect(resolveInitialLang(null, 'AR-sa')).toBe('ar')
  })
  it('no header, empty header, wildcard, or garbage all fall back to English', () => {
    expect(resolveInitialLang(undefined, undefined)).toBe('en')
    expect(resolveInitialLang(undefined, '')).toBe('en')
    expect(resolveInitialLang(undefined, '*')).toBe('en')
    expect(resolveInitialLang(undefined, ';;,,q=')).toBe('en')
  })
})

describe('preferredPrimaryTags', () => {
  it('orders by q, keeps browser order on ties, drops q=0 and wildcards', () => {
    expect(preferredPrimaryTags('en-US,ar;q=0.8,fr;q=0.8,de;q=0,*;q=0.1')).toEqual(['en', 'ar', 'fr'])
  })
})

describe('the cookie the toggle writes', () => {
  it('is a year-long, site-wide, Lax cookie', () => {
    expect(langCookieString('ar', true)).toBe(`${LANG_COOKIE}=ar; Max-Age=${LANG_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax; Secure`)
    expect(LANG_COOKIE_MAX_AGE_S).toBe(31536000)
  })
  it('omits Secure over http so the toggle is not silently dropped in dev', () => {
    expect(langCookieString('en', false)).not.toMatch(/Secure/)
  })
})

// --- Structural: the wiring the pure function relies on ------------------------
describe('the server layout applies the choice before the client runs', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8')
  const provider = readFileSync(join(process.cwd(), 'src/lib/i18n/LanguageContext.tsx'), 'utf8')
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('<body> carries dir and lang', () => {
    expect(strip(layout)).toMatch(/<body\s+dir=\{initialDir\}\s+lang=\{initialLang\}/)
  })
  it('<html lang> is no longer hard-coded', () => {
    expect(strip(layout)).toMatch(/<html lang=\{initialLang\}>/)
    expect(strip(layout)).not.toMatch(/<html lang="en">/)
  })
  it('the layout resolves the language from the cookie and Accept-Language', () => {
    expect(layout).toMatch(/resolveInitialLang\(\s*cookies\(\)\.get\(LANG_COOKIE\)\?\.value,\s*headers\(\)\.get\("accept-language"\)\s*\)/)
  })
  it('the provider starts from the server choice, not from a literal', () => {
    expect(strip(provider)).toMatch(/useState<Lang>\(initialLang\)/)
    expect(strip(provider)).not.toMatch(/useState<Lang>\('en'\)/)
  })
  it("the provider's wrapper keeps its own dir (the letter-spacing rule's test relies on a [dir] ancestor)", () => {
    expect(strip(provider)).toMatch(/<div dir=\{lang === 'ar' \? 'rtl' : 'ltr'\}/)
  })
  it('a toggle keeps <body> in sync', () => {
    expect(strip(provider)).toMatch(/document\.body\.setAttribute\('dir'/)
    expect(strip(provider)).toMatch(/document\.documentElement\.setAttribute\('lang'/)
  })
})
