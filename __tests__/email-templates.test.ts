import { readFileSync } from 'fs'
import { join } from 'path'
import { confirmLink } from '@/lib/email-links'

/**
 * The stored Supabase email templates. What is pasted into the dashboard
 * must be what is here, so this pins the parts that matter: the link lands
 * on our own host and our Continue page, never on supabase.co, and the
 * copy follows the project's Arabic punctuation convention.
 */
const TEMPLATES = {
  reset: { file: 'supabase/templates/reset-password.html', link: confirmLink('recovery', '/update-password') },
  signup: { file: 'supabase/templates/confirm-signup.html', link: confirmLink('email', '/dashboard') },
} as const

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const subjectOf = (html: string) => (html.match(/^<!-- Subject: (.*?) -->/) || [])[1] ?? ''
const textOf = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
const withoutComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const hrefsOf = (html: string) => {
  const out: string[] = []
  const re = /href="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.push(m[1])
  return out
}
const arabicOf = (text: string) => text.match(/[؀-ۿ][^\n]*/g) ?? []

describe.each(Object.entries(TEMPLATES))('%s template', (_name, { file, link }) => {
  const html = read(file)
  const text = textOf(html)

  it('links only to our own host, with token_hash, and never to ConfirmationURL', () => {
    const hrefs = hrefsOf(html)
    expect(hrefs.length).toBeGreaterThanOrEqual(2) // the button and the plain link
    for (const h of hrefs) expect(h).toBe(link)
    // The header comment is allowed to NAME what must not appear; the mail itself is not.
    const body = withoutComments(html)
    expect(body).not.toMatch(/ConfirmationURL/)
    expect(body).not.toMatch(/SiteURL/)
    expect(body).not.toMatch(/supabase\.co/)
  })

  it('shows the plain link as text, for a client that strips the button', () => {
    expect(text).toContain(link)
  })

  it('carries the parts every email needs, in both languages', () => {
    expect(subjectOf(html)).toMatch(/UnicornApps/)
    expect(subjectOf(html)).toMatch(/[؀-ۿ]/)
    expect(text).toMatch(/UnicornApps/)
    expect(text).toMatch(/ignore this email/i)
    expect(text).toMatch(/تجاهل هذه الرسالة/)
    expect(html).toMatch(/dir="rtl"/)
  })

  it('Arabic uses U+060C for the comma and the ASCII full stop, with no dashes', () => {
    const arabic = arabicOf(text).join('\n')
    expect(arabic.length).toBeGreaterThan(80)
    expect(arabic).not.toMatch(/۔/) // Arabic full stop
    expect(arabic).not.toMatch(/[؀-ۿ],/) // Latin comma after Arabic
    expect(arabic).not.toMatch(/[-–—]/) // hyphen, en dash, em dash
    expect(arabic).toMatch(/[؀-ۿ]\./) // ASCII full stop ends a sentence
  })

  it('has no letter-spacing, a light colour scheme, and inline styles only', () => {
    expect(html).not.toMatch(/letter-spacing/)
    expect(html).toMatch(/color-scheme" content="light"/)
    expect(html).not.toMatch(/<link /)
    expect(html).not.toMatch(/<script/)
  })
})

describe('the confirm-signup template is stored, not enabled', () => {
  it('says so in its header, because email confirmation is off', () => {
    expect(read(TEMPLATES.signup.file)).toMatch(/STORED, NOT IN USE/)
  })
})
