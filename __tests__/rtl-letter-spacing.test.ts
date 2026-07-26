import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Arabic letter-joining guard.
 *
 * WHAT THIS CAN AND CANNOT PROVE — read before trusting it.
 * The repo's jest environment is `node` with no jsdom and no browser, so there
 * is NO getComputedStyle here: nothing in this file proves a browser actually
 * renders Arabic with joined letters. Asserting that would need a real engine
 * (Playwright), which is a different dependency decision than this PR makes.
 *
 * What these tests DO prove is the part that actually regressed and can regress
 * again: that the neutralisation rule exists, is scoped to RTL only, reaches
 * descendants, and — the subtle one — still out-specifies a Tailwind tracking
 * utility. That last property is invisible on inspection and is exactly what a
 * well-meaning "simplification" of the selector would silently destroy.
 */

const GLOBALS = join(process.cwd(), 'src/app/globals.css')
const rawCss = readFileSync(GLOBALS, 'utf8')
// Comments are stripped FIRST: the rule is documented with a long block comment
// that itself mentions [dir="rtl"] and letter-spacing, and would otherwise be
// parsed as part of the selector.
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '')

/** The rule block this suite guards, extracted once. */
const rtlRule = (() => {
  const m = css.match(/([^{}]*\[dir=['"]rtl['"]\][^{}]*)\{([^}]*)\}/)
  return m ? { selector: m[1].trim(), body: m[2].trim() } : null
})()

/**
 * Specificity for the limited selector grammar used here: type selectors,
 * attribute selectors, classes and the universal selector. Returns [ids,
 * classes+attrs, types] — compared lexicographically, as the cascade does.
 */
function specificity(selector: string): [number, number, number] {
  // Neutralise CSS escapes FIRST. Tailwind compiles an arbitrary value like
  // tracking-[0.2em] to the single class `.tracking-\[0\.2em\]`; without this,
  // the escaped \[ \] read as an attribute selector and the class scores
  // (0,2,0) instead of its true (0,1,0).
  const one = selector.split(',')[0].trim().replace(/\\./g, 'x')
  const ids = (one.match(/#[\w-]+/g) || []).length
  const attrs = (one.match(/\[[^\]]+\]/g) || []).length
  const classes = (one.match(/\.[\w\\.[\]/-]+/g) || []).length
  const pseudoClasses = (one.match(/:(?!:)[a-z-]+/g) || []).length
  // Types: bare words not preceded by . # [ or :
  const types = (one.match(/(^|[\s>+~])([a-z][\w-]*)/g) || []).length
  return [ids, attrs + classes + pseudoClasses, types]
}

function gt(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

describe('specificity helper (sanity — it is load-bearing below)', () => {
  it('ranks a type+attribute selector above a bare utility class', () => {
    expect(specificity("html [dir='rtl'] *")).toEqual([0, 1, 1])
    expect(specificity('.tracking-widest')).toEqual([0, 1, 0])
    expect(gt(specificity("html [dir='rtl'] *"), specificity('.tracking-widest'))).toBe(true)
  })

  it('scores an escaped arbitrary-value class as ONE class, not class+attribute', () => {
    // .tracking-\[0\.2em\] is a single class selector. Reading its escaped
    // brackets as an attribute selector would inflate it to (0,2,0) and make the
    // real rule look like it loses.
    expect(specificity('.tracking-\\[0\\.2em\\]')).toEqual([0, 1, 0])
  })

  it('ranks a bare descendant-of-attribute selector as only a TIE with a utility', () => {
    // This is the regression being guarded: [dir="rtl"] * is (0,1,0), same as
    // .tracking-widest, so it would win or lose purely on source order.
    expect(gt(specificity("[dir='rtl'] *"), specificity('.tracking-widest'))).toBe(false)
  })
})

describe('globals.css neutralises letter-spacing under RTL', () => {
  it('defines a rule scoped to [dir="rtl"]', () => {
    expect(rtlRule).not.toBeNull()
  })

  it('sets letter-spacing back to normal', () => {
    expect(rtlRule!.body).toMatch(/letter-spacing:\s*normal/)
  })

  it('reaches DESCENDANTS, not just the wrapper element', () => {
    // Tailwind puts tracking-* on the leaf that renders the text, never on the
    // dir wrapper, so a rule that does not descend fixes nothing.
    expect(rtlRule!.selector).toMatch(/\*/)
  })

  it('out-specifies a Tailwind tracking utility, so no !important is needed', () => {
    // EVERY comma-separated part must win, not just the first — a selector list
    // is only as strong as its weakest member.
    const parts = rtlRule!.selector.split(',').map((s) => s.trim()).filter(Boolean)
    expect(parts.length).toBeGreaterThan(0)
    for (const utility of [
      '.tracking-widest',
      '.tracking-tighter',
      '.tracking-tight',
      '.tracking-wide',
      // Arbitrary values compile to a single escaped class — same specificity.
      '.tracking-\\[0\\.2em\\]',
      '.tracking-\\[0\\.3em\\]',
      '.tracking-\\[0\\.4em\\]',
      // Responsive variant — really present in the compiled sheet. A media query
      // adds no specificity, so this is still a single class.
      '.sm\\:tracking-\\[0\\.2em\\]',
      // Tailwind compiles the ltr: variant as `.ltr\:x:where([dir=ltr] *)`, and
      // :where() contributes ZERO specificity — so even a guarded utility is
      // only (0,1,0). (It is also scoped to dir=ltr, so it cannot match here.)
      '.ltr\\:tracking-widest',
    ]) {
      for (const part of parts) {
        expect(gt(specificity(part), specificity(utility))).toBe(true)
      }
    }
    expect(css).not.toMatch(/letter-spacing:\s*normal\s*!important/)
  })

  it('never applies under LTR — English tracking must be untouched', () => {
    expect(rtlRule!.selector).not.toMatch(/\[dir=['"]ltr['"]\]/)
    // No unscoped global letter-spacing reset anywhere in the sheet.
    const declarations = css.match(/[^{}]*\{[^}]*letter-spacing[^}]*\}/g) || []
    for (const block of declarations) {
      expect(block).toMatch(/\[dir=['"]rtl['"]\]/)
    }
  })
})

describe('the rule is the ONLY thing covering unguarded tracking utilities', () => {
  /** Every tracking-* occurrence in src/, and whether it carries an ltr: guard. */
  function collectTracking(): { total: number; unguarded: number } {
    let total = 0
    let unguarded = 0
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx?|css)$/.test(entry)) {
          for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
            const hits = line.match(/\btracking-[^\s"'`]+/g)
            if (!hits) continue
            total += hits.length
            if (!/\bltr:tracking-/.test(line)) unguarded += hits.length
          }
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    return { total, unguarded }
  }

  it('there ARE unguarded tracking utilities, so deleting the rule reintroduces the bug', () => {
    const { total, unguarded } = collectTracking()
    // Not pinned to an exact count — that would fail on every unrelated UI edit.
    // The point is that the codebase relies on the CSS rule, not on ltr: guards.
    expect(total).toBeGreaterThan(100)
    expect(unguarded).toBeGreaterThan(100)
  })

  it('the CSS rule that covers them is present (fails loudly if it is removed)', () => {
    expect(rtlRule).not.toBeNull()
    expect(rtlRule!.body).toMatch(/letter-spacing:\s*normal/)
  })
})

describe('no sibling property damages Arabic shaping', () => {
  /** Read every source file once. */
  const sources: string[] = (() => {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(tsx?|css)$/.test(entry)) {
          // Strip comments: prose ABOUT these properties (like the rationale
          // block in globals.css) must not read as a usage of them.
          out.push(
            readFileSync(p, 'utf8')
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/^\s*\/\/.*$/gm, '')
          )
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    return out
  })()

  it.each([
    // Disables the `liga`/`calt` features Arabic joining depends on.
    ['font-variant-ligatures', /font-variant-ligatures/],
    ['font-feature-settings', /font-feature-settings/],
    // optimizeSpeed drops ligatures/kerning in some engines.
    ['text-rendering', /text-rendering/],
    // break-all splits a word between two JOINED letters.
    ['word-break: break-all', /break-all|word-break/],
    // Horizontal scaling distorts cursive connectors.
    ['scaleX on text', /scaleX/],
    ['font-stretch', /font-stretch/],
  ])('src/ contains no %s', (_label, pattern) => {
    for (const src of sources) expect(src).not.toMatch(pattern)
  })
})
