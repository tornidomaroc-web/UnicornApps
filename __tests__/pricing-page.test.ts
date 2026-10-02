import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The pricing page, pinned at the SOURCE as marketing-pages.test.ts pins the
 * landing, features and about pages: jsdom is not wired for React in this
 * suite, so these assert the contract a render would not prove anyway. How the
 * page is built, that it stays unreachable in the native app, and that the
 * money path it hands off to is the one it always used.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const client = strip(read('src/app/pricing/PricingClient.tsx'))
const page = strip(read('src/app/pricing/page.tsx'))
const middleware = strip(read('src/middleware.ts'))

describe('light enough for a phone WebView, and the first paint is the final paint', () => {
  it('imports no motion library and ships nothing hidden to fade in later', () => {
    expect(client).not.toMatch(/framer-motion|from ['"]motion/)
    expect(client).not.toMatch(/initial=|animate=|whileInView|variants=|opacity-0/)
  })

  it('paints no blur, glow blob, perpetual animation, grid backdrop or scale transform', () => {
    expect(client).not.toMatch(/blur/)
    expect(client).not.toMatch(/animate-/)
    expect(client).not.toMatch(/scale-|scaleX/)
    expect(client).not.toMatch(/backgroundImage|linear-gradient/)
    expect(client).not.toMatch(/canvas|webgl/i)
  })

  it('framer-motion is gone from the whole app and from the dependencies', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.dependencies['framer-motion']).toBeUndefined()
    expect(pkg.devDependencies?.['framer-motion']).toBeUndefined()
    const lock = JSON.parse(read('package-lock.json'))
    expect(lock.packages['node_modules/framer-motion']).toBeUndefined()
    expect(lock.packages[''].dependencies['framer-motion']).toBeUndefined()
  })
})

describe('the same visual language as the marketing pages', () => {
  it('is built on the shared surface, the shared page frame and the shared footer', () => {
    expect(client).toMatch(/from '@\/app\/dashboard\/surface'/)
    expect(client).toMatch(/from '@\/components\/marketing\/Marketing'/)
    expect(client).toMatch(/<main className=\{PAGE\}>/)
    expect(client).toMatch(/<Footer \/>/)
  })

  it('takes its accent from the brand token, never a raw violet', () => {
    expect(client).toMatch(/bg-brand/)
    expect(client).not.toMatch(/violet|indigo|#7c3aed|#a855f7|#8b5cf6|124,\s*58,\s*237/)
  })

  it('stays on the dark surface', () => {
    expect(client).not.toMatch(/bg-white(?![/\]])|bg-slate-(50|100|200)\b/)
  })

  it('carries no letter-spacing, no uppercase, no italic and no type below 14px', () => {
    expect(client).not.toMatch(/tracking-/)
    expect(client).not.toMatch(/\buppercase\b|\bitalic\b/)
    expect(client).not.toMatch(/text-\[(9|10|11|12|13)px\]|text-xs\b/)
  })

  it('uses no physical direction utility', () => {
    const classNames = (client.match(/className=(?:"[^"]*"|\{`[^`]*`\}|\{'[^']*'\})/g) || []).join(' ')
    const constants = (client.match(/^const [A-Z_]+ =\s*(?:'[^']*'|`[^`]*`)/gm) || []).join(' ')
    const all = `${classNames} ${constants}`
    expect(all.length).toBeGreaterThan(300)
    expect(all).not.toMatch(/(^|[\s"`':])-?(ml|mr|pl|pr|left|right)-/)
    expect(all).not.toMatch(/(^|[\s"`':])text-(left|right)\b/)
    expect(all).not.toMatch(/rounded-(bl|br|tl|tr)-/)
  })

  it('pins the Latin price ltr inside the Arabic surface', () => {
    expect(client).toMatch(/<span dir="ltr"[^>]*>\s*\{tier\.price\}/)
  })

  it('carries no sentence of its own: every visible string comes from the dictionary', () => {
    const jsxText = (client.match(/>\s*[A-Za-z][A-Za-z ,.'’]{2,}\s*</g) || []).filter(
      (s) => !/support@unicornapps\.app/.test(s)
    )
    expect(jsxText).toEqual([])
    expect(client).not.toMatch(/Powered by|UnicornApps Global/)
  })
})

describe('every action is a 44px target whose label cannot clip', () => {
  it('one pill shape: at least 56px tall, wrapping rather than clipping', () => {
    expect(client).toMatch(/const PILL =\s*'inline-flex min-h-14 w-full /)
    const pill = client.match(/const PILL =\s*'([^']*)'/)![1]
    expect(pill).not.toMatch(/whitespace-nowrap|truncate|overflow-hidden|(^|\s)h-\d/)
    expect(pill).toMatch(/text-center/)
  })

  it('every button and link on the page takes its classes from that pill', () => {
    // Up to the control's className, so an arrow function's `>` cannot end it early.
    const controls = client.match(/<(button|Link|a)\b[^<]*?className=(\{[^}]*\}|"[^"]*")/g) || []
    expect(controls.length).toBeGreaterThanOrEqual(4)
    for (const c of controls) {
      if (/href="\/refund"/.test(c)) continue // an inline text link inside a sentence
      expect(c).toMatch(/className=\{(tier\.featured \? PRIMARY : GHOST|GHOST|PRIMARY)\}/)
    }
    expect(client).toMatch(/const PRIMARY = `\$\{PILL\} /)
    expect(client).toMatch(/const GHOST = `\$\{PILL\} /)
  })

  it('no Link wraps a Button, and the shadcn Button and Card are gone', () => {
    expect(client).not.toMatch(/@\/components\/ui\/(button|card)/)
    expect(client).not.toMatch(/<Link[^>]*>\s*<button/)
  })
})

describe('Android ships payment-free: the gates are unchanged', () => {
  it('page.tsx still redirects a native request on the server and renders per request', () => {
    expect(page).toMatch(/export const dynamic = 'force-dynamic'/)
    expect(page).toMatch(/if \(isNativeRequest\(\)\) \{\s*redirect\('\/'\)\s*\}/)
  })

  it('middleware still keeps native off /pricing', () => {
    expect(middleware).toMatch(/isNativeApp && \(pathname === '\/pricing' \|\| pathname\.startsWith\('\/pricing\/'\)\)/)
  })

  it('the client defaults to hidden and reveals paid tiers only once resolved to web', () => {
    expect(client).toMatch(/const showPaid = resolved && !isNative/)
    expect(client).toMatch(/showPaid \? tiers : tiers\.filter\(\(tier\) => !tier\.checkoutKind\)/)
    expect(client).toMatch(/showPaid && \(\s*<button/)
    expect(client).toMatch(/\{showPaid && \(\s*<p[^>]*>\s*\{t\('checkout\.mor'\)\}/)
    expect(client.match(/\{showPaid && \(/g)).toHaveLength(2)
    expect(client.match(/mailto:/g)).toHaveLength(1)
  })
})

describe('the money path is the one it always was', () => {
  it('checkout opens through openCheckout with the server-seeded user id', () => {
    expect(client).toMatch(/import \{ openCheckout \} from '@\/lib\/checkout'/)
    expect(client).toMatch(/await openCheckout\(\{ kind, userId, navigate: \(path\) => router\.push\(path\) \}\)/)
    expect(client).toMatch(/useState<string \| null>\(initialUserId\)/)
  })

  it('the post-purchase poll watches the server-rendered balance', () => {
    expect(client).toMatch(/useCreditGrantPoll\(initialCredits\)/)
  })

  it('the two paid tiers are the sub and the pack, priced from the dictionary', () => {
    expect(client).toMatch(/checkoutKind: 'sub'/)
    expect(client).toMatch(/checkoutKind: 'pack'/)
    expect(client).toMatch(/price: t\('pricing\.sub\.price'\)/)
    expect(client).toMatch(/price: t\('pricing\.pack\.price'\)/)
    expect(client).not.toMatch(/pri_|PRICE_ID/)
  })

  it('a double click cannot open two checkouts', () => {
    expect(client).toMatch(/if \(pending\) return/)
    expect(client).toMatch(/disabled=\{pending !== null\}/)
  })
})

describe('promises nothing the product does not do', () => {
  const dictionary = read('src/lib/i18n/LanguageContext.tsx')

  // There is no public API and no bulk licence. The contact card stays as a
  // way to reach us; it may not describe an offer behind it.
  it('the contact card carries no offer line, in either language', () => {
    expect(client).not.toMatch(/pricing\.enterprise\.sub/)
    expect(dictionary).not.toMatch(/'pricing\.enterprise\.sub'/)
    expect(dictionary).not.toMatch(/Custom API access|bulk licensing/i)
  })
})
