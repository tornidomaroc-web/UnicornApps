import { runInNewContext } from 'vm'
import { readFileSync } from 'fs'
import { join } from 'path'
import { LITE_CSS, LITE_SCRIPT, LITE_TOKENS } from '../src/lib/lite-mode'

/**
 * The lite-mode switch is a string of script inlined into the page, so it is
 * tested by running that exact string against stub devices. What this cannot
 * prove: how a real low-end phone paints. That was checked on an emulator.
 */

type Device = { deviceMemory?: number; hardwareConcurrency?: number; userAgent?: string; stored?: string | null; noCSSOM?: boolean }

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'

function run(d: Device) {
  const sheets: Array<{ text: string }> = []
  const document = { adoptedStyleSheets: [] as Array<{ text: string }> }
  const window: Record<string, unknown> = {}
  class CSSStyleSheet {
    text = ''
    replaceSync(t: string) {
      this.text = t
    }
  }
  const ctx: Record<string, unknown> = {
    navigator: { deviceMemory: d.deviceMemory, hardwareConcurrency: d.hardwareConcurrency, userAgent: d.userAgent ?? ANDROID },
    localStorage: { getItem: () => (d.stored === undefined ? null : d.stored) },
    document,
    window,
  }
  if (!d.noCSSOM) ctx.CSSStyleSheet = CSSStyleSheet
  runInNewContext(LITE_SCRIPT, ctx)
  sheets.push(...document.adoptedStyleSheets)
  return { lite: window.__uaLite === true, sheets }
}

describe('who gets lite mode', () => {
  it.each<[string, Device, boolean]>([
    ['2 GB', { deviceMemory: 2, hardwareConcurrency: 8 }, true],
    ['1 GB', { deviceMemory: 1 }, true],
    ['0.5 GB', { deviceMemory: 0.5 }, true],
    ['4 GB', { deviceMemory: 4, hardwareConcurrency: 4 }, false],
    ['8 GB', { deviceMemory: 8 }, false],
    ['no memory signal, Android, 4 cores', { hardwareConcurrency: 4 }, true],
    ['no memory signal, Android, 8 cores', { hardwareConcurrency: 8 }, false],
    ['no memory signal, desktop, 4 cores', { hardwareConcurrency: 4, userAgent: DESKTOP }, false],
    ['no signal at all', {}, false],
    ['forced on', { deviceMemory: 8, stored: '1' }, true],
    ['forced off', { deviceMemory: 1, stored: '0' }, false],
  ])('%s -> %s', (_label, device, expected) => {
    expect(run(device).lite).toBe(expected)
  })

  it('an engine without constructable stylesheets keeps the full skin and does not throw', () => {
    expect(() => run({ deviceMemory: 1, noCSSOM: true })).not.toThrow()
    expect(run({ deviceMemory: 1, noCSSOM: true }).lite).toBe(false)
  })
})

describe('what lite mode changes', () => {
  it('adopts exactly one sheet holding the lite tokens', () => {
    const { sheets } = run({ deviceMemory: 2 })
    expect(sheets).toHaveLength(1)
    expect(sheets[0].text).toBe(LITE_CSS)
  })

  it('every lite shadow has zero blur, and every gradient and wash is gone', () => {
    for (const [name, value] of Object.entries(LITE_TOKENS)) {
      if (name.startsWith('--ua-shadow-')) {
        // inset X Y BLUR [SPREAD] colour: the blur (third length) is 0
        const lengths = value.replace(/^inset\s+/, '').split(/\s+/)
        expect({ name, blur: lengths[2] }).toEqual({ name, blur: '0' })
      } else {
        expect({ name, value }).toEqual({ name, value: 'none' })
      }
    }
  })

  it('covers every costly token the full skin defines', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const costly = Array.from(css.matchAll(/(--ua-(?:shadow|fill)-[\w-]+|--ua-page-image)\s*:/g)).map((m) => m[1])
    expect(Object.keys(LITE_TOKENS).sort()).toEqual(Array.from(new Set(costly)).sort())
  })
})
