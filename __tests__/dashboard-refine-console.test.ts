import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The refine console's height guard.
 *
 * WHAT THIS CAN AND CANNOT PROVE — read before trusting it.
 * The jest environment is `node`: there is no layout engine, so nothing here
 * measures a rendered height. Proving "the card is not 40% empty on a phone"
 * would need a real browser, which is a different dependency decision than
 * this change makes. The rendered behaviour (grows with the conversation up
 * to the cap, then the history scrolls inside it, the input stays in the
 * card) was checked by hand in Chromium at 411 and 1440 px, in both
 * languages and under both user agents.
 *
 * What this DOES pin is the part that produced the empty box and can come
 * back with a one-token edit:
 *   - the card must not carry a FIXED height (`h-[650px]`, `h-96`, `lg:h-…`).
 *     A fixed height is what left roughly 40% of a phone screen empty while
 *     the conversation was one or two messages long;
 *   - the card keeps a CAP (`max-h-…`), or a long conversation would grow the
 *     page without bound;
 *   - the history area keeps `min-h-0`. Without it a flex child cannot shrink
 *     below its content, so once the card reaches the cap the history pushes
 *     the input row out of the card instead of scrolling inside it.
 */

const SOURCE = readFileSync(join(process.cwd(), 'src/app/dashboard/DashboardClient.tsx'), 'utf8')

/** True for a fixed-height utility, with or without a responsive/state variant. */
function isFixedHeightToken(token: string): boolean {
  const base = token.split(':').pop() as string
  return /^h-(\[|\d|screen$|full$|px$|svh|lvh|dvh)/.test(base)
}

/** className of the first element matching `pattern`, taken from the source after `marker`. */
function classNameAfter(marker: string, pattern: RegExp): string | null {
  const at = SOURCE.indexOf(marker)
  if (at < 0) return null
  const m = SOURCE.slice(at).match(pattern)
  return m ? m[1] : null
}

const consoleCard = classNameAfter('{/* REFINE CONSOLE */}', /<Card\s+className="([^"]+)"/)
const historyArea = classNameAfter('{/* Chat History Area */}', /<div\s+className="([^"]+)"/)

describe('refine console height', () => {
  it('finds the console card and its history area (the guard is not vacuous)', () => {
    expect(consoleCard).not.toBeNull()
    expect(historyArea).not.toBeNull()
    expect(historyArea).toContain('custom-scrollbar')
  })

  it('does not give the console card a fixed height', () => {
    const fixed = (consoleCard as string).split(/\s+/).filter(isFixedHeightToken)
    expect(fixed).toEqual([])
  })

  it('caps the console card so a long conversation cannot grow the page without bound', () => {
    expect(consoleCard).toMatch(/(^|\s)max-h-\S+/)
  })

  it('lets the history area shrink below its content, so it scrolls inside the card and the input stays in it', () => {
    const tokens = (historyArea as string).split(/\s+/)
    expect(tokens).toContain('min-h-0')
    expect(tokens).toContain('overflow-y-auto')
    expect(tokens).toContain('flex-grow')
  })

  it('recognises the fixed heights it is meant to reject, and only those', () => {
    for (const bad of ['h-[650px]', 'h-96', 'h-screen', 'h-full', 'lg:h-[650px]', 'md:h-64', 'h-px']) {
      expect(isFixedHeightToken(bad)).toBe(true)
    }
    for (const ok of ['max-h-[650px]', 'min-h-0', 'min-h-[600px]', 'h-auto', 'flex-grow', 'lg:max-h-[40rem]']) {
      expect(isFixedHeightToken(ok)).toBe(false)
    }
  })
})
