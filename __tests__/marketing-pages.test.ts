import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/**
 * The marketing pages (landing, features, about), the site footer and the
 * navbar's menu, pinned at the SOURCE: jsdom is not wired for React in this
 * suite, so these assert the contract a render would not prove anyway. What
 * the pages may claim, how they are allowed to be built, where pricing may
 * appear, and that a phone can reach the pages at all.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILES = {
  home: 'src/app/page.tsx',
  features: 'src/app/features/page.tsx',
  about: 'src/app/about/page.tsx',
  shared: 'src/components/marketing/Marketing.tsx',
  footer: 'src/components/layout/Footer.tsx',
  navbar: 'src/components/Navbar.tsx',
  login: 'src/app/(auth)/login/page.tsx',
}
const code = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, strip(read(p))])) as Record<
  keyof typeof FILES,
  string
>
const PAGES = ['home', 'features', 'about', 'shared', 'footer'] as const

describe('light enough for a phone WebView, and the first paint is the final paint', () => {
  it.each(PAGES)('%s imports no motion library and paints no blur', (k) => {
    expect(code[k]).not.toMatch(/framer-motion|from ['"]motion/)
    expect(code[k]).not.toMatch(/blur/)
    expect(code[k]).not.toMatch(/scaleX/)
  })

  it('the landing hero ships nothing hidden to fade in later', () => {
    expect(code.home).not.toMatch(/initial=|animate=|whileInView|opacity-0/)
  })

  it('the navbar no longer blurs what scrolls under it', () => {
    expect(code.navbar).not.toMatch(/backdrop-blur/)
  })
})

describe('direction is logical, so the Arabic surface mirrors', () => {
  it.each([...PAGES, 'navbar'] as const)('%s uses no physical direction utility', (k) => {
    const classNames = (code[k].match(/className=(?:"[^"]*"|\{`[^`]*`\}|\{'[^']*'\})/g) || []).join(' ')
    const constants = (code[k].match(/^(?:export )?const [A-Z_]+ = '[^']*'/gm) || []).join(' ')
    const all = `${classNames} ${constants}`
    expect(all.length).toBeGreaterThan(100)
    expect(all).not.toMatch(/(^|[\s"`':])-?(ml|mr|pl|pr|left|right)-/)
    expect(all).not.toMatch(/(^|[\s"`':])text-(left|right)\b/)
  })

  it.each(PAGES)('%s carries no letter-spacing of its own (the shared EYEBROW is the one exception)', (k) => {
    expect(code[k]).not.toMatch(/tracking-/)
  })
})

describe('the pages are built on the dashboard surface vocabulary', () => {
  it('the shared module composes SURFACE and TILE', () => {
    expect(code.shared).toMatch(/import \{ EYEBROW, SURFACE, TILE \} from '@\/app\/dashboard\/surface'/)
    expect(code.shared).toMatch(/\$\{SURFACE\}/)
    expect(code.shared).toMatch(/\$\{TILE\}/)
  })

  it.each(['home', 'features', 'about'] as const)('%s renders through the shared module and ends on the footer', (k) => {
    expect(code[k]).toMatch(/from '@\/components\/marketing\/Marketing'/)
    expect(code[k]).toMatch(/<Footer \/>/)
  })
})

describe('pricing stays hidden in the native app', () => {
  it.each(['home', 'features', 'about', 'footer', 'navbar'] as const)('%s gates on resolved && !isNative', (k) => {
    expect(code[k]).toMatch(/const showPricing = resolved && !isNative/)
  })

  it('the pages render the teaser only under the gate', () => {
    for (const k of ['home', 'features'] as const) {
      const uses = code[k].match(/<PricingTeaser/g) || []
      expect(uses).toHaveLength(1)
      expect(code[k]).toMatch(/\{showPricing && <PricingTeaser t=\{t\} \/>\}/)
    }
    expect(code.about).not.toMatch(/PricingTeaser/)
    expect(code.about).toMatch(/\{showPricing && <> \{t\('about\.cost\.web'\)\}<\/>\}/)
  })

  it('every /pricing link in the footer and the menu sits on a showPricing line', () => {
    for (const k of ['footer', 'navbar'] as const) {
      const lines = code[k].split(/\r?\n/).filter((l) => l.includes("'/pricing'") || l.includes('"/pricing"'))
      expect(lines.length).toBeGreaterThan(0)
      for (const l of lines) expect(l).toMatch(/showPricing/)
    }
  })

  it('the shared module links to /pricing only inside the teaser', () => {
    const teaserAt = code.shared.indexOf('export function PricingTeaser')
    expect(teaserAt).toBeGreaterThan(0)
    expect(code.shared.slice(0, teaserAt)).not.toMatch(/pricing/i)
  })

  it('no page states a price of its own', () => {
    for (const k of ['home', 'features', 'about', 'footer'] as const) expect(code[k]).not.toMatch(/\$\d/)
  })
})

describe('a phone can reach the pages: the menu', () => {
  it('has a button below lg that names its state and its panel', () => {
    expect(code.navbar).toMatch(/aria-expanded=\{menuOpen\}/)
    expect(code.navbar).toMatch(/aria-controls="site-menu"/)
    expect(code.navbar).toMatch(/id="site-menu" className="lg:hidden/)
    expect(code.navbar).toMatch(/className="lg:hidden flex h-10 w-10/)
  })

  it('closes on navigation and on Escape', () => {
    expect(code.navbar).toMatch(/useEffect\(\(\) => \{\s*setMenuOpen\(false\);\s*\}, \[pathname\]\);/)
    expect(code.navbar).toMatch(/e\.key === 'Escape'\) setMenuOpen\(false\)/)
  })

  it('lists the marketing pages and the account entry for both auth states', () => {
    for (const href of ["'/'", "'/features'", "'/about'", '"/dashboard"', '"/account"', '"/login"']) {
      expect(code.navbar).toContain(href)
    }
  })
})

describe('the dictionary', () => {
  const dict = read('src/lib/i18n/LanguageContext.tsx')
  const lines = dict.split(/\r?\n/)
  const arStart = lines.findIndex((l) => /^\s{2}ar:\s*\{/.test(l))
  const KEY_RE = /^\s*'([^']+)'\s*:\s*'((?:[^'\\]|\\.)*)',/
  const entries = (from: number, to: number) =>
    lines
      .slice(from, to)
      .map((l) => l.match(KEY_RE))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2]] as const)
  const en = new Map(entries(0, arStart))
  const ar = new Map(entries(arStart, lines.length))
  const enKeys = Array.from(en.keys())
  const MARKETING = /^(home|feat|about|footer)\./
  const marketingKeys = enKeys.filter((k) => MARKETING.test(k))

  it('every marketing key exists in both languages', () => {
    expect(marketingKeys.length).toBeGreaterThan(60)
    for (const k of marketingKeys) expect(ar.has(k)).toBe(true)
  })

  it('every key the pages ask for exists', () => {
    const src = [code.home, code.features, code.about, code.footer, code.navbar, code.shared].join('\n')
    const asked = new Set<string>()
    for (const m of Array.from(src.matchAll(/t\('([^']+)'\)/g))) asked.add(m[1])
    for (const m of Array.from(src.matchAll(/t\(`([^`$]+)\$\{/g))) {
      const prefix = m[1]
      expect(enKeys.some((k) => k.startsWith(prefix))).toBe(true)
    }
    for (const k of Array.from(asked)) {
      expect(en.has(k)).toBe(true)
      expect(ar.has(k)).toBe(true)
    }
  })

  it('makes no claim the product cannot back: no logos, ratings, counts, quotes or superlatives', () => {
    for (const k of marketingKeys) {
      const v = en.get(k)!
      expect(v).not.toMatch(/testimonial|rated|stars?\b|trusted by|veterans?|enterprise|guarantee|#1|\bbest\b|fastest|100\+|4K|\d[\d,]*\+ (users|sellers|merchants)/i)
      expect(v).not.toMatch(/\bads?\b|ad-free|advert/i)
    }
    expect(code.home).not.toMatch(/Amazon", "Shopify"|Twitter|LinkedIn|Instagram/)
  })

  it('the Arabic follows the punctuation convention and carries no invisible characters', () => {
    for (const k of marketingKeys) {
      const v = ar.get(k)!
      expect(v).not.toMatch(/۔/) // Arabic full stop: never
      expect(v).not.toMatch(/[‎‏‪-‮﻿​]/)
      expect(v).not.toMatch(/[ﭐ-﷿ﹰ-﻿]/) // presentation forms
      // A comma inside Arabic text is the Arabic comma.
      const arabicWithAsciiComma = /[؀-ۿ][^,]*,\s*[؀-ۿ]/
      expect(v).not.toMatch(arabicWithAsciiComma)
    }
  })
})

describe('the reset confirmation cannot be lost to a tab change', () => {
  it('is a full panel driven by the action result, not by the mode', () => {
    expect(code.login).toMatch(/if \(resetState\?\.code === 'reset_sent'\) setResetSentOpen\(true\)/)
    expect(code.login).toMatch(/const mailPanel = checkEmailOpen \? 'check_email' : resetSentOpen \? 'reset_sent' : null/)
    expect(code.login).toMatch(/if \(mailPanel\) \{/)
    expect(code.login).toMatch(/t\(`login\.msg\.\$\{mailPanel\}_title`\)/)
    expect(code.login).toMatch(/t\(`login\.msg\.\$\{mailPanel\}`\)/)
  })

  it('there is no root loading screen: with one, the first server action remounted the page and lost the result', () => {
    // Measured with a real click in Chrome against the dev server on
    // 2026-09-30: with src/app/loading.tsx present, the first server action
    // submitted from /login replaced the page subtree (the AuthShell <main>
    // and the form were new DOM nodes; the layout, navbar and language
    // wrapper survived), every client state went back to its initial value,
    // and the user saw the sign-in form with no confirmation while the reset
    // email arrived anyway. A second submission in the same document behaved.
    // With the file removed the page survived and the panel showed. The
    // dashboard keeps its own loading screen; it uses no server actions.
    expect(existsSync(join(process.cwd(), 'src/app/loading.tsx'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src/app/dashboard/loading.tsx'))).toBe(true)
  })

  it('both panels have their copy in both languages', () => {
    const dict = read('src/lib/i18n/LanguageContext.tsx')
    for (const k of ['login.msg.reset_sent', 'login.msg.reset_sent_title', 'login.msg.check_email', 'login.msg.check_email_title']) {
      expect(dict.split(`'${k}':`).length - 1).toBe(2)
    }
  })
})
