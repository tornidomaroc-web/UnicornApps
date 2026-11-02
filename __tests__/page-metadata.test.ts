import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PAGE_METADATA, pageMetadata, type PublicPage } from '@/lib/seo/page-metadata'

/**
 * Every public page carries its own search title and description, and the
 * pages whose main heading was an h2 now say h1. Pinned at the SOURCE, like
 * marketing-pages.test.ts: jsdom is not wired for React in this suite. The
 * built HTML was checked by hand for the PR that added this.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PAGES = Object.keys(PAGE_METADATA) as PublicPage[]
const ROUTE_FILES: Record<Exclude<PublicPage, 'pricing'>, string> = {
  home: 'src/app/(home)/layout.tsx',
  features: 'src/app/features/layout.tsx',
  about: 'src/app/about/layout.tsx',
  login: 'src/app/(auth)/login/layout.tsx',
}

describe('the copy', () => {
  it('covers the five public pages', () => {
    expect(PAGES.sort()).toEqual(['about', 'features', 'home', 'login', 'pricing'])
  })

  it.each(PAGES)('%s: a title of 30 to 60 characters and a description of 120 to 160', (p) => {
    const { title, description } = PAGE_METADATA[p]
    expect(Array.from(title).length).toBeGreaterThanOrEqual(30)
    expect(Array.from(title).length).toBeLessThanOrEqual(60)
    expect(Array.from(description).length).toBeGreaterThanOrEqual(120)
    expect(Array.from(description).length).toBeLessThanOrEqual(160)
  })

  it('no two pages share a title or a description', () => {
    const titles = PAGES.map((p) => PAGE_METADATA[p].title)
    const descriptions = PAGES.map((p) => PAGE_METADATA[p].description)
    expect(new Set(titles).size).toBe(PAGES.length)
    expect(new Set(descriptions).size).toBe(PAGES.length)
  })

  it.each(PAGES)('%s: names the brand, and makes no ranking, novelty or price claim', (p) => {
    const text = `${PAGE_METADATA[p].title} ${PAGE_METADATA[p].description}`
    expect(text).toContain('UnicornApps')
    expect(text).not.toMatch(/\bbest\b|#1|\bnumber one\b|\bnew\b|\btop\b|\bleading\b|\bfastest\b/i)
    expect(text).not.toMatch(/[$€£]|\d+(\.\d+)?\s*(usd|dollars?)/i)
    expect(text).not.toMatch(/[—–]/) // no em or en dash
  })

  // These four are also served inside the Android app, which never sells.
  it.each(PAGES.filter((p) => p !== 'pricing'))('%s: says nothing about buying', (p) => {
    const text = `${PAGE_METADATA[p].title} ${PAGE_METADATA[p].description}`
    expect(text).not.toMatch(/\b(buy|purchase|pack|plan|plans|price|pricing|subscri\w*|upgrade|pay)\b/i)
  })

  it('only the login page is kept out of the index, and its links are still followed', () => {
    expect(pageMetadata('login').robots).toEqual({ index: false, follow: true })
    for (const p of PAGES.filter((x) => x !== 'login')) expect(pageMetadata(p).robots).toBeUndefined()
  })
})

describe('each route serves its own entry', () => {
  it.each(Object.entries(ROUTE_FILES))('%s reads its entry from a server layout', (p, file) => {
    const src = strip(read(file))
    expect(src).not.toMatch(/['"]use client['"]/)
    expect(src).toContain(`export const metadata = pageMetadata('${p}')`)
  })

  it('/pricing carries the same title and description in its own metadata export', () => {
    const page = read('src/app/pricing/page.tsx')
    expect(page).toContain(`title: ${JSON.stringify(PAGE_METADATA.pricing.title)},`)
    expect(page).toContain(`description: ${JSON.stringify(PAGE_METADATA.pricing.description)},`)
  })

  it('the landing page lives only in the (home) group, so / has one page', () => {
    expect(existsSync(join(process.cwd(), 'src/app/page.tsx'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src/app/(home)/page.tsx'))).toBe(true)
  })
})

describe('one h1 per page, by element only', () => {
  it('SectionHead switches the element, never the classes', () => {
    const shared = strip(read('src/components/marketing/Marketing.tsx'))
    expect(shared).toMatch(/as: Heading = 'h2'/)
    expect(shared).toContain('<Heading className={landing ? LANDING_H2 : H2}>{title}</Heading>')
  })

  it.each([
    ['features', 'src/app/features/page.tsx', "<SectionHead as=\"h1\" eyebrow={t('feat.eyebrow')}"],
    ['pricing', 'src/app/pricing/PricingClient.tsx', "<SectionHead as=\"h1\" eyebrow={t('pricing.badge')}"],
  ])('%s: the first heading is the only h1', (_p, file, h1) => {
    const src = strip(read(file))
    expect(src).toContain(h1)
    expect(src.split('as="h1"').length - 1).toBe(1)
    expect(src).not.toMatch(/<h1[\s>]/)
  })

  it('h1 and h2 share the heading face, so the swap cannot restyle a heading', () => {
    expect(read('src/app/globals.css')).toMatch(/:where\(h1, h2, h3\) \{\s*font-family: var\(--ua-font-head\);/)
  })
})
