import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * WCAG AA for body text (4.5:1), computed from the token values themselves:
 * each text colour against every surface it is allowed to sit on. Gradient
 * surfaces are checked at their LIGHTER stop, the worst case. This proves the
 * token pairs; it cannot prove that a call site pairs them as intended.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const root = Object.fromEntries(Array.from(css.matchAll(/(--ua-[\w-]+)\s*:\s*([^;]+);/g)).map((m) => [m[1], m[2].trim()]))

const triplet = (name: string): [number, number, number] => root[name].split(/\s+/).map(Number) as [number, number, number]
const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** First (top) stop of a linear-gradient token. */
const topStop = (name: string) => hex(root[name].match(/#[0-9a-f]{6}/i)![0])

const SURFACES: Record<string, [number, number, number]> = {
  page: [7, 7, 16],
  panel: hex(root['--ua-panel']),
  row: hex(root['--ua-row']),
  chip: hex(root['--ua-chip']),
  field: hex(root['--ua-field']),
  'tap (top stop)': topStop('--ua-fill-tap'),
  'ghost (top stop)': topStop('--ua-fill-ghost'),
}

describe('text tokens reach AA on every dark surface', () => {
  const pairs: Array<[string, string, number]> = []
  for (const fg of ['--ua-fg', '--ua-fg-body', '--ua-fg-muted', '--ua-fg-faint', '--ua-fg-link']) {
    for (const [surface, rgb] of Object.entries(SURFACES)) {
      // Faint text (eyebrows, dates, captions) never sits on a ghost button,
      // whose labels are link, body or full-strength text; it measures 4.1:1
      // there, so it must not be put there.
      if (fg === '--ua-fg-faint' && surface.startsWith('ghost')) continue
      pairs.push([fg, surface, ratio(triplet(fg), rgb)])
    }
  }
  it.each(pairs)('%s on %s', (_fg, _surface, r) => {
    expect(r).toBeGreaterThanOrEqual(4.5)
  })
})

describe('text on the primary button', () => {
  it.each([
    ['resting top stop', topStop('--ua-fill-btn')],
    ['hover top stop', topStop('--ua-fill-btn-hover')],
    ['flat brand colour (lite mode)', [99, 91, 255] as [number, number, number]],
  ])('--ua-fg-on-brand on the %s', (_label, rgb) => {
    expect(ratio(triplet('--ua-fg-on-brand'), rgb)).toBeGreaterThanOrEqual(4.5)
  })
})
