// The privacy policy's "Third-Party Services" section, pinned at the SOURCE.
//
// The section must name every outside service the code actually sends user data
// to, in BOTH languages: Vercel (hosting, and web analytics on the website),
// Google Gemini (the photos and text sent for generation), Supabase (sign-in and
// the database), Cloudflare Turnstile (the sign-up check) and Paddle (website
// payments). A provider added to the code without a line here is a policy that
// says less than the app does; this test is the reminder.
//
// Parses the dictionary source rather than importing it, for the same reason as
// i18n-parity.test.ts: LanguageContext.tsx is a client component and this suite
// has no jsdom.

import { readFileSync } from 'fs'
import { join } from 'path'

const source = readFileSync(join(process.cwd(), 'src/lib/i18n/LanguageContext.tsx'), 'utf8')
const arStart = source.search(/^\s{2}ar:\s*\{/m)

function value(lang: 'en' | 'ar', key: string): string {
  const block = lang === 'en' ? source.slice(0, arStart) : source.slice(arStart)
  const escaped = key.replace(/\./g, '\\.')
  const m = block.match(new RegExp(`'${escaped}':\\s*'((?:[^'\\\\]|\\\\.)*)'`))
  if (!m) throw new Error(`${key} not found in the ${lang} dictionary`)
  return m[1]
}

const PROCESSORS = ['Vercel', 'Vercel Web Analytics', 'Google Gemini', 'Supabase', 'Cloudflare Turnstile', 'Paddle']

describe('privacy policy: third-party services', () => {
  it('finds the Arabic dictionary at all (a parser miss would pass vacuously)', () => {
    expect(arStart).toBeGreaterThan(0)
  })

  it.each(['en', 'ar'] as const)('%s names every processor the code uses', (lang) => {
    const body = value(lang, 'privacy.s4.body')
    for (const name of PROCESSORS) expect(body).toContain(name)
  })

  it.each(['en', 'ar'] as const)('%s says the analytics run on the website only', (lang) => {
    const body = value(lang, 'privacy.s4.body')
    expect(body).toContain(lang === 'en' ? 'not in the Android app' : 'لا في تطبيق Android')
  })

  it('Arabic privacy copy uses Western digits and the ASCII full stop', () => {
    for (const key of ['privacy.version', 'privacy.updated', 'privacy.s4.body']) {
      const v = value('ar', key)
      expect(v).not.toMatch(/[٠-٩۰-۹]/)
      expect(v).not.toContain('۔')
    }
  })
})
