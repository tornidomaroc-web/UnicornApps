/**
 * Pricing copy must stay true to the configured prices and credit grants.
 *
 * The pricing cards state a per-credit comparison ("about $0.10 per credit, vs
 * $0.17 in the pack"). That figure is derived from three things that live in
 * different places: the displayed price strings in the dictionary, the credit
 * grants in lib/billing.ts, and the copy itself. Nothing else ties them
 * together, so a price change in the dictionary would leave a stale comparison
 * on a live listing with every test green. This test is that tie.
 *
 * Also pins the negative: no card may describe ads in either direction. The
 * app ships no ad SDK and renders no ads, so "ad-free" and "ad-supported" are
 * both false claims.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { creditsForPrice, SUB_PRICE_ID, PACK_PRICE_ID } from '@/lib/billing'

const source = readFileSync(join(process.cwd(), 'src/lib/i18n/LanguageContext.tsx'), 'utf8')
const lines = source.split(/\r?\n/)

// Same block locator as i18n-parity.test.ts: the `en:` block runs up to the
// `ar:` line, and the `ar:` block runs to end of file (the parity test's floor
// is what makes a silently-empty block loud).
const blockStart = (lang: string) => {
  const i = lines.findIndex((l) => new RegExp(`^\\s{2}${lang}:\\s*\\{`).test(l))
  if (i < 0) throw new Error(`could not locate the ${lang} block`)
  return i
}

function block(lang: 'en' | 'ar'): string {
  const start = blockStart(lang)
  const end = lang === 'en' ? blockStart('ar') : lines.length
  return lines.slice(start, end).join('\n')
}

function value(lang: 'en' | 'ar', key: string): string {
  const m = block(lang).match(new RegExp(`^\\s*'${key.replace(/\./g, '\\.')}':\\s*'((?:[^'\\\\]|\\\\.)*)',`, 'm'))
  if (!m) throw new Error(`missing ${lang} key ${key}`)
  return m[1].replace(/\\'/g, "'")
}

const dollars = (s: string) => Number(s.replace(/[^0-9.]/g, ''))
const perCredit = (price: number, credits: number) => (price / credits).toFixed(2)

describe('pricing copy is derived from the configured prices', () => {
  const subCredits = creditsForPrice(SUB_PRICE_ID)
  const packCredits = creditsForPrice(PACK_PRICE_ID)

  it('the grants the copy relies on are the live ones', () => {
    expect(subCredits).toBe(100)
    expect(packCredits).toBe(30)
  })

  it.each(['en', 'ar'] as const)('%s per-credit figures match price ÷ credits', (lang) => {
    const sub = perCredit(dollars(value(lang, 'pricing.sub.price')), subCredits)
    const pack = perCredit(dollars(value(lang, 'pricing.pack.price')), packCredits)
    // $9.99 / 100 = 0.0999 -> "0.10"; $4.99 / 30 = 0.1663 -> "0.17"
    expect(value(lang, 'pricing.sub.desc')).toContain(`$${sub}`)
    expect(value(lang, 'pricing.f.percredit')).toContain(`$${sub}`)
    expect(value(lang, 'pricing.f.percredit')).toContain(`$${pack}`)
  })

  it.each(['en', 'ar'] as const)('%s credit counts in the copy match the grants', (lang) => {
    expect(value(lang, 'pricing.sub.desc')).toContain(String(subCredits))
    expect(value(lang, 'pricing.f.credits100')).toContain(String(subCredits))
    expect(value(lang, 'pricing.pack.desc')).toContain(String(packCredits))
    expect(value(lang, 'pricing.f.credits30')).toContain(String(packCredits))
  })
})

describe('no pricing copy claims anything about ads', () => {
  it.each(['en', 'ar'] as const)('%s pricing.* keys never mention ads', (lang) => {
    const lines = block(lang)
      .split('\n')
      .filter((l) => /^\s*'pricing\./.test(l))
    expect(lines.length).toBeGreaterThan(10)
    for (const l of lines) {
      expect(l).not.toMatch(/\bads?\b|ad-free|ad-supported|advert/i)
      expect(l).not.toMatch(/إعلان/)
    }
  })
})
