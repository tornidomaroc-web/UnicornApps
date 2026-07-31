// EN/AR key parity for the translation dictionary.
//
// WHY THIS EXISTS
// `t()` falls back to returning the raw key when a key is missing, so a key
// added to `en` and forgotten in `ar` does not throw and does not log — it
// renders the literal string "dash.sessionExpired" into the Arabic UI. Nothing
// in the suite caught that before this file.
//
// Parity was ALREADY perfect when this was written (349 keys each, no
// duplicates in either block). This locks a clean state; it is not a cleanup.
// That matters for how to read a future failure: it means someone added a key
// to one dictionary in this PR, not that the file has long-standing drift.
//
// WHY IT PARSES SOURCE INSTEAD OF IMPORTING THE MODULE
// LanguageContext.tsx is a `'use client'` React component. The suite runs
// testEnvironment: 'node' with no jsdom, and every existing test deliberately
// avoids importing components (see the note at the top of api-error.test.ts).
// Pulling React into a node suite to read one plain object is not worth it.
//
// The cost of parsing is that the regex can drift from the real object shape —
// and a parser that quietly stops matching would compare two EMPTY sets and
// PASS, proving nothing while looking green. That is what KEY_FLOOR below is
// for. Do not remove it.

import { readFileSync } from 'fs'
import { join } from 'path'

const DICT = 'src/lib/i18n/LanguageContext.tsx'

// Well below the real count (349 at time of writing) but far above zero, so the
// vacuous-pass failure mode is caught without making this a brittle exact count
// that every copy addition has to bump.
const KEY_FLOOR = 300

const source = readFileSync(join(process.cwd(), DICT), 'utf8')
const lines = source.split(/\r?\n/)

const blockStart = (lang: string) => {
  const i = lines.findIndex(l => new RegExp(`^\\s{2}${lang}:\\s*\\{`).test(l))
  if (i < 0) throw new Error(`${DICT}: could not find the \`${lang}:\` dictionary block`)
  return i
}

const EN_START = blockStart('en')
const AR_START = blockStart('ar')

// Keys are `'some.key': 'value',` on one line. A nested object would break this
// assumption; the floor above is what turns that into a loud failure.
const KEY_RE = /^\s*'([^']+)'\s*:/

function collect(from: number, to: number) {
  const keys: string[] = []
  for (let i = from + 1; i < to; i++) {
    const m = lines[i]?.match(KEY_RE)
    if (m) keys.push(m[1])
  }
  return keys
}

const enKeys = collect(EN_START, AR_START)
const arKeys = collect(AR_START, lines.length)

const dupes = (keys: string[]) => keys.filter((k, i) => keys.indexOf(k) !== i)

describe('the parser itself is still working', () => {
  it('finds both dictionary blocks, in order', () => {
    expect(EN_START).toBeGreaterThan(-1)
    expect(AR_START).toBeGreaterThan(EN_START)
  })

  // Without this, a regex that stops matching makes every assertion below
  // trivially true. This is the whole reason source-parsing is acceptable here.
  it('extracts a plausible number of keys from each block', () => {
    expect(enKeys.length).toBeGreaterThanOrEqual(KEY_FLOOR)
    expect(arKeys.length).toBeGreaterThanOrEqual(KEY_FLOOR)
  })
})

describe('EN/AR dictionary parity', () => {
  it('every EN key has an AR counterpart', () => {
    const missing = enKeys.filter(k => !arKeys.includes(k))
    expect(missing).toEqual([])
  })

  it('every AR key has an EN counterpart', () => {
    const missing = arKeys.filter(k => !enKeys.includes(k))
    expect(missing).toEqual([])
  })

  // A duplicated key silently wins on object-literal evaluation order, so the
  // string a reader sees in the file may not be the string that ships.
  it('neither block declares the same key twice', () => {
    expect(dupes(enKeys)).toEqual([])
    expect(dupes(arKeys)).toEqual([])
  })
})

// The code map in src/lib/api-error.ts names i18n keys as bare strings. A typo
// there is invisible: `t()` returns the key, so the user sees "dash.sessionExpird".
// This ties the map to the dictionary without exporting it.
describe('every i18n key named by the api-error code map exists in BOTH dictionaries', () => {
  const apiError = readFileSync(join(process.cwd(), 'src/lib/api-error.ts'), 'utf8')
  const mapBlock = apiError.match(/const CODE_KEYS[^=]*=\s*\{([\s\S]*?)\n\}/)

  it('the code map is still findable in api-error.ts', () => {
    expect(mapBlock).not.toBeNull()
  })

  // exec loop, not matchAll: tsconfig sets no `target`, so spreading a RegExp
  // iterator needs --downlevelIteration and fails `tsc --noEmit`.
  const mapped: string[] = []
  const mappedKey = /:\s*'([^']+)'/g
  let mk: RegExpExecArray | null
  while ((mk = mappedKey.exec(mapBlock?.[1] ?? '')) !== null) mapped.push(mk[1])

  it('the map is not empty (guards this describe against passing vacuously)', () => {
    expect(mapped.length).toBeGreaterThan(0)
  })

  it.each(mapped)('%s is defined in en and ar', key => {
    expect(enKeys).toContain(key)
    expect(arKeys).toContain(key)
  })
})
