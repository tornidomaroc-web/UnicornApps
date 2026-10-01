import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { CONFIRM_WORD, deleteErrorKey, isDeleteConfirmed } from '@/lib/account-delete'

/**
 * The account screen, the public deletion page, the dashboard loading screen
 * and the not-found and crash screens.
 *
 * The two decisions that matter are pure functions and are tested as such. The
 * screens themselves are pinned at the SOURCE: jsdom is not wired for React in
 * this suite, so these assert the contract a render would not prove anyway.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const FILES = {
  account: 'src/app/account/AccountClient.tsx',
  deletion: 'src/app/delete-account/DeleteAccountClient.tsx',
  deletionPage: 'src/app/delete-account/page.tsx',
  loading: 'src/app/dashboard/loading.tsx',
  status: 'src/components/StatusScreen.tsx',
  notFound: 'src/app/not-found.tsx',
  crash: 'src/app/error.tsx',
}
const code = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, strip(read(p))])) as Record<
  keyof typeof FILES,
  string
>
const SCREENS = ['account', 'deletion', 'loading', 'status', 'notFound', 'crash'] as const

describe('the confirmation word', () => {
  it('is one word per language', () => {
    expect(CONFIRM_WORD).toEqual({ en: 'DELETE', ar: 'حذف' })
  })

  it.each(['DELETE', 'delete', 'Delete', '  DELETE  ', 'حذف', ' حذف ', 'حَذْف', 'حـذف', '‏حذف‏'])(
    'accepts %j',
    (typed) => {
      expect(isDeleteConfirmed(typed)).toBe(true)
    }
  )

  it.each(['', ' ', 'DELET', 'DELETE!', 'DELETE my account', 'yes', 'حذ', 'احذف', 'حذف حسابي', 'الحذف', 'DELETE حذف'])(
    'refuses %j',
    (typed) => {
      expect(isDeleteConfirmed(typed)).toBe(false)
    }
  )

  it('either word unlocks either screen, so a Latin-only keyboard is never a dead end', () => {
    expect(isDeleteConfirmed(CONFIRM_WORD.en)).toBe(true)
    expect(isDeleteConfirmed(CONFIRM_WORD.ar)).toBe(true)
  })
})

describe('a failed delete is a translated key chosen from the status alone', () => {
  it('maps 401 to the session sentence and everything else to the generic one', () => {
    expect(deleteErrorKey(401)).toBe('account.err.session')
    for (const status of [400, 403, 404, 413, 429, 500, 502, 503, 504]) {
      expect(deleteErrorKey(status)).toBe('account.err.failed')
    }
  })

  it('the screen never reads the response body or an exception message', () => {
    expect(code.account).not.toMatch(/\.json\(\)|\.text\(\)/)
    expect(code.account).not.toMatch(/\.message|data\.error|new Error/)
    expect(code.account).toMatch(/setErrorKey\(deleteErrorKey\(res\.status\)\)/)
    expect(code.account).toMatch(/<p>\{t\(errorKey\)\}<\/p>/)
  })
})

describe('deleting is hard to do by accident', () => {
  it('the card opens closed and the red button stays disabled until the word is typed', () => {
    expect(code.account).toMatch(/const \[open, setOpen\] = useState\(false\)/)
    expect(code.account).toMatch(/const ready = isDeleteConfirmed\(confirm\)/)
    expect(code.account).toMatch(/disabled=\{!ready \|\| busy\}/)
    expect(code.account).toMatch(/if \(!ready \|\| busy\) return/)
  })

  it('has no form, so the keyboard cannot submit it', () => {
    expect(code.account).not.toMatch(/<form|onSubmit|type="submit"/)
  })

  it('cancel closes the card and clears what was typed', () => {
    expect(code.account).toMatch(/const close = \(\) => \{\s*setOpen\(false\)\s*setConfirm\(''\)/)
  })

  it('a success is confirmed on the public page through session storage, never through the URL', () => {
    expect(code.account).toMatch(/sessionStorage\.setItem\(DELETED_FLAG, '1'\)/)
    expect(code.account).toMatch(/window\.location\.replace\('\/delete-account'\)/)
    expect(code.deletion).toMatch(/sessionStorage\.getItem\(DELETED_FLAG\)/)
    expect(code.deletion).not.toMatch(/useSearchParams|searchParams/)
  })
})

describe('the public deletion page', () => {
  it('stays at /delete-account and reads no session', () => {
    expect(existsSync(join(process.cwd(), FILES.deletionPage))).toBe(true)
    for (const k of ['deletion', 'deletionPage'] as const) {
      expect(code[k]).not.toMatch(/supabase|getUser|redirect\(/)
    }
    const middleware = strip(read('src/middleware.ts'))
    expect(middleware).not.toMatch(/delete-account/)
    expect(middleware.match(/pathname\.startsWith\('\/[a-z-]+'\)/g)).toEqual([
      "pathname.startsWith('/dashboard')",
      "pathname.startsWith('/login')",
    ])
  })

  it('says what is kept, because the schema keeps it', () => {
    const schema = read('supabase_schema.sql')
    // What goes with the account.
    expect(schema).toMatch(/CREATE TABLE public\.profiles \(\s*id UUID REFERENCES auth\.users ON DELETE CASCADE/)
    expect(schema).toMatch(/user_id UUID REFERENCES auth\.users ON DELETE CASCADE NOT NULL/)
    // What stays, with its link to the account cleared.
    expect(schema.match(/user_id\s+UUID\s+NULL REFERENCES public\.profiles\(id\) ON DELETE SET NULL/g)).toHaveLength(2)
    expect(code.deletion).toMatch(/t\('del\.keep\.usage'\)/)
    expect(code.deletionPage).not.toMatch(/all associated data/)
  })

  it('shows the sentence about purchase records on the web only', () => {
    expect(code.deletion).toMatch(/const showPricing = resolved && !isNative/)
    expect(code.deletion).toMatch(/\{showPricing && <p className=\{BODY\}>\{t\('del\.keep\.payments'\)\}<\/p>\}/)
    expect(code.deletion.match(/del\.keep\.payments/g)).toHaveLength(1)
  })
})

describe('the same visual language, and light', () => {
  it.each(SCREENS)('%s carries no letter-spacing, no uppercase and no type below 14px', (k) => {
    expect(code[k]).not.toMatch(/tracking-/)
    expect(code[k]).not.toMatch(/\buppercase\b/)
    expect(code[k]).not.toMatch(/text-\[(9|10|11|12|13)px\]|text-xs\b/)
  })

  it.each(SCREENS)('%s imports no motion library and paints no blur, glow blob or scale', (k) => {
    expect(code[k]).not.toMatch(/framer-motion|from ['"]motion/)
    expect(code[k]).not.toMatch(/blur|scale/i)
    expect(code[k]).not.toMatch(/violet|124,\s*58,\s*237/)
  })

  it.each(SCREENS)('%s uses no physical direction utility', (k) => {
    const classNames = (code[k].match(/className=(?:"[^"]*"|\{`[^`]*`\}|\{'[^']*'\})/g) || []).join(' ')
    const constants = (code[k].match(/^(?:export )?const [A-Z_]+ =\s*(?:'[^']*'|`[^`]*`)/gm) || []).join(' ')
    const all = `${classNames} ${constants}`
    // The two root screens take every class from the shared frame's constants.
    if (k !== 'notFound' && k !== 'crash') expect(all.length).toBeGreaterThan(60)
    expect(all).not.toMatch(/(^|[\s"`':])-?(ml|mr|pl|pr|left|right)-/)
    expect(all).not.toMatch(/(^|[\s"`':])text-(left|right)\b/)
  })

  it.each(['account', 'deletion', 'loading', 'status'] as const)('%s is built on the shared surface', (k) => {
    expect(code[k]).toMatch(/from '@\/app\/dashboard\/surface'/)
    expect(code[k]).toMatch(/\$\{SURFACE\}/)
  })

  it('the loading screen is one spinner and one translated line', () => {
    expect(code.loading).toMatch(/<Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden \/>/)
    expect(code.loading).toMatch(/\{t\('dash\.loading'\)\}/)
    expect(code.loading).not.toMatch(/LOADING|🦄/)
  })
})

describe('the not-found and crash screens', () => {
  it('both exist at the root of the app', () => {
    expect(existsSync(join(process.cwd(), FILES.notFound))).toBe(true)
    expect(existsSync(join(process.cwd(), FILES.crash))).toBe(true)
  })

  it('both offer the way home', () => {
    expect(code.notFound).toMatch(/<Link href="\/" className=\{STATUS_PRIMARY\}>/)
    expect(code.crash).toMatch(/<a href="\/" className=\{STATUS_GHOST\}>/)
  })

  it('the crash screen offers a retry and never shows the error', () => {
    expect(code.crash).toMatch(/onClick=\{reset\}/)
    expect(code.crash).toMatch(/console\.error\(error\)/)
    expect(code.crash).not.toMatch(/error\.message|error\.digest|error\.stack|\{error\}/)
  })

  it('the frame takes keys, never text', () => {
    expect(code.status).toMatch(/\{t\(titleKey\)\}/)
    expect(code.status).toMatch(/\{t\(bodyKey\)\}/)
  })
})

describe('every sentence on these screens is in the dictionary, in both languages', () => {
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
  const OURS = /^(account|del|err)\.|^dash\.loading$/
  const ours = Array.from(en.keys()).filter((k) => OURS.test(k))

  it('finds the keys at all', () => {
    expect(arStart).toBeGreaterThan(0)
    expect(ours.length).toBeGreaterThan(30)
  })

  it('every key a screen asks for exists in both languages', () => {
    const src = SCREENS.map((k) => code[k]).join('\n')
    const asked = new Set<string>()
    for (const m of Array.from(src.matchAll(/t\('([^']+)'\)/g))) asked.add(m[1])
    for (const m of Array.from(src.matchAll(/(?:titleKey|bodyKey)="([^"]+)"/g))) asked.add(m[1])
    for (const m of Array.from(src.matchAll(/'(account\.err\.[a-z]+)'/g))) asked.add(m[1])
    expect(asked.size).toBeGreaterThan(25)
    for (const k of Array.from(asked)) {
      expect(en.has(k)).toBe(true)
      expect(ar.has(k)).toBe(true)
    }
    for (const k of ['account.err.session', 'account.err.failed']) expect(ar.has(k)).toBe(true)
  })

  it('no screen carries a sentence of its own', () => {
    // Text between tags that is not an expression: a word of three letters or
    // more directly inside JSX. The support address is the one exception.
    for (const k of SCREENS) {
      const jsxText = (code[k].match(/>\s*[A-Za-z][A-Za-z ,.'’]{2,}\s*</g) || []).filter(
        (s) => !/support@unicornapps\.app/.test(s)
      )
      expect(jsxText).toEqual([])
    }
  })

  it('each language names its own confirmation word, and the steps name the buttons as written', () => {
    expect(en.get('account.delete.confirmLabel')).toContain(CONFIRM_WORD.en)
    expect(ar.get('account.delete.confirmLabel')).toContain(CONFIRM_WORD.ar)
    expect(en.get('del.how.3')).toContain(CONFIRM_WORD.en)
    expect(ar.get('del.how.3')).toContain(CONFIRM_WORD.ar)
    for (const d of [en, ar]) {
      expect(d.get('del.how.3')).toContain(d.get('account.delete.start')!)
      expect(d.get('del.how.3')).toContain(d.get('account.delete.submit')!)
    }
  })

  it('the Arabic is Arabic, follows the punctuation convention and carries no invisible characters', () => {
    for (const k of ours) {
      const v = ar.get(k)!
      expect(v).toBeDefined()
      expect(v).toMatch(/[؀-ۿ]/)
      expect(v).not.toMatch(/۔/) // Arabic full stop: never
      expect(v).not.toMatch(/[​-‏‪-‮⁦-⁩﻿]/)
      expect(v).not.toMatch(/[ﭐ-﷿ﹰ-﻿]/) // presentation forms
      // A comma or a question mark inside Arabic text is the Arabic one.
      expect(v).not.toMatch(/[؀-ۿ][^,]*,\s*[؀-ۿ]/)
      expect(v).not.toMatch(/[؀-ۿ]\s*\?/)
    }
  })

  it('makes no promise about a purchase or a price', () => {
    for (const k of ours) {
      const v = en.get(k)!
      expect(v).not.toMatch(/\$\d|upgrade|subscribe|buy more|pricing/i)
    }
  })
})
