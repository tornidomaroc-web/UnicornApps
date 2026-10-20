import { readFileSync } from 'fs'
import { join } from 'path'
import config from '../tailwind.config'
import { cn } from '@/lib/utils'

/**
 * Semantic design-token guard.
 *
 * Every semantic token in globals.css is pinned to the value it resolves to, so:
 *   - a value change can only arrive as a deliberate edit to this table, and
 *     a reskin's diff lists exactly which roles it retuned;
 *   - the Tailwind keys cannot collide (a colour and a shadow sharing a name
 *     both emit .shadow-<name>, and the colour form clobbers the shadow);
 *   - cn() keeps a token class next to a default one instead of dropping it.
 *
 * Like rtl-letter-spacing.test.ts, there is no browser here: this proves the
 * declarations, not the rendering. The rendering was proven by screenshot.
 */

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  // Values may wrap over lines in the source; compare them with whitespace collapsed.
  for (const m of Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))) out[m[1]] = m[2].trim().replace(/\s+/g, ' ')
  return out
}

const rootBlock = css.match(/^:root\s*\{([^}]*)\}/m)
const smBlock = css.match(/@media \(min-width: 640px\)\s*\{\s*:root\s*\{([^}]*)\}/)
const root = declarations(rootBlock ? rootBlock[1] : '')
const sm = { ...root, ...declarations(smBlock ? smBlock[1] : '') }

/** Substitute var() references until none remain. */
function resolve(name: string, vars: Record<string, string> = root, depth = 0): string {
  if (depth > 10) throw new Error(`var cycle at ${name}`)
  const raw = vars[name]
  if (raw === undefined) throw new Error(`${name} is not defined in :root`)
  // --font-* come from next/font class names at runtime; leave them as written.
  return raw.replace(/var\((--[\w-]+)\)/g, (m, ref) => (ref.startsWith('--font-') ? m : resolve(ref, vars, depth + 1)))
}

// Each semantic token and the value it renders as (Clay Night).
const TODAY: Record<string, string> = {
  '--ua-page': 'rgb(7 7 16)',
  '--ua-page-image':
    'radial-gradient(70% 34% at 10% -6%, rgb(99 91 255 / 0.28) 0, rgb(99 91 255 / 0) 70%), radial-gradient(38% 26% at 100% 6%, rgb(227 194 111 / 0.11) 0, rgb(227 194 111 / 0) 70%)',
  '--ua-panel': '#14142b',
  '--ua-row': '#1c1c3d',
  '--ua-chip': '#22224a',
  '--ua-tile': 'rgb(255 255 255 / 0.03)',
  '--ua-field': '#0e0e22',
  '--ua-line': 'rgb(255 255 255 / 0.06)',
  '--ua-line-soft': 'rgb(255 255 255 / 0.04)',
  '--ua-fg': '244 242 255',
  '--ua-fg-body': '201 198 230',
  '--ua-fg-muted': '160 156 196',
  '--ua-fg-faint': '148 144 186',
  '--ua-fg-link': '169 164 255',
  '--ua-fg-on-brand': '255 255 255',
  '--ua-fg-on-light': '58 49 196',
  '--ua-focus': '169 164 255',
  '--ua-fill-btn': 'linear-gradient(180deg, #635bff 0%, #4b41e0 100%)',
  '--ua-fill-btn-hover': 'linear-gradient(180deg, #5a52f5 0%, #4339d6 100%)',
  '--ua-fill-ghost': 'linear-gradient(180deg, #2e2e63 0%, #1f1f45 100%)',
  '--ua-fill-tap': 'linear-gradient(180deg, #26264f 0%, #12122a 100%)',
  '--ua-fill-icon': 'linear-gradient(180deg, #3c3c88 0%, #25254f 100%)',
  '--ua-fill-credits': 'linear-gradient(165deg, #635bff 0%, #4338ca 100%)',
  '--ua-fill-on-credits': 'linear-gradient(180deg, #ffffff 0%, #e4e1ff 100%)',
  '--ua-fill-danger': 'linear-gradient(180deg, #dc2626 0%, #b91c1c 100%)',
  '--ua-radius-card': '28px',
  '--ua-radius-row': '24px',
  '--ua-radius-icon': '20px',
  '--ua-radius-input': '18px',
  '--ua-radius-pill': '9999px',
  '--ua-shadow-container':
    '0 18px 30px -14px rgb(0 0 0 / 0.78), inset 0 1.5px 0 rgb(255 255 255 / 0.09), inset 0 -6px 12px rgb(0 0 0 / 0.35)',
  '--ua-shadow-tap':
    '0 6px 8px -3px rgb(0 0 0 / 0.85), inset 0 2.5px 0 rgb(200 196 255 / 0.3), inset 0 -10px 12px rgb(0 0 0 / 0.5)',
  '--ua-shadow-icon':
    '0 6px 8px -3px rgb(0 0 0 / 0.85), inset 0 3px 0 rgb(205 200 255 / 0.32), inset 0 -6px 10px rgb(0 0 0 / 0.45)',
  '--ua-shadow-btn':
    '0 6px 8px -3px rgb(0 0 0 / 0.8), inset 0 3px 0 rgb(255 255 255 / 0.44), inset 0 -9px 12px rgb(26 14 130 / 0.6)',
  '--ua-shadow-ghost':
    '0 6px 8px -3px rgb(0 0 0 / 0.85), inset 0 2.5px 0 rgb(190 185 255 / 0.26), inset 0 -7px 10px rgb(0 0 0 / 0.4)',
  '--ua-shadow-well': 'inset 0 3px 8px rgb(0 0 0 / 0.5), inset 0 -1px 0 rgb(255 255 255 / 0.06)',
  '--ua-shadow-credits':
    '0 10px 12px -8px rgb(0 0 0 / 0.75), inset 0 3px 0 rgb(255 255 255 / 0.4), inset 0 -12px 18px rgb(25 12 120 / 0.5)',
  '--ua-shadow-mark':
    '0 6px 8px -3px rgb(0 0 0 / 0.8), inset 0 3px 0 rgb(255 255 255 / 0.4), inset 0 -6px 9px rgb(30 20 130 / 0.5)',
  '--ua-shadow-on-credits':
    '0 6px 8px -3px rgb(0 0 0 / 0.45), inset 0 3px 0 rgb(255 255 255 / 1), inset 0 -5px 8px rgb(99 91 255 / 0.25)',
  '--ua-shadow-danger':
    '0 6px 8px -3px rgb(0 0 0 / 0.8), inset 0 3px 0 rgb(255 255 255 / 0.3), inset 0 -8px 12px rgb(90 0 0 / 0.45)',
  '--ua-font-head': 'system-ui, sans-serif',
  '--ua-font-body': 'inherit',
  '--ua-text-display': '32px',
  '--ua-leading-display': '1.1',
  '--ua-text-title': '28px',
  '--ua-leading-title': '1.15',
  '--ua-text-page-title': '1.5rem',
  '--ua-leading-page-title': '1.25',
}

// The sm: (640px) step of the type tokens, matching today's sm: classes.
const TODAY_SM: Record<string, string> = {
  '--ua-text-display': '52px',
  '--ua-text-title': '32px',
  '--ua-text-page-title': '1.875rem',
}

describe('semantic tokens resolve to today\'s rendering', () => {
  it('found the :root and sm blocks', () => {
    expect(rootBlock).not.toBeNull()
    expect(smBlock).not.toBeNull()
  })

  it.each(Object.entries(TODAY))('%s = %s', (name, value) => {
    expect(resolve(name)).toBe(value)
  })

  it.each(Object.entries(TODAY_SM))('%s at sm = %s', (name, value) => {
    expect(resolve(name, sm)).toBe(value)
  })

  it('the heading stack is declared on [dir], where next/font defines --font-rubik*', () => {
    // On :root those names are undefined, and a custom property resolves where
    // it is declared: the stack would be invalid and headings would fall back.
    const dirBlock = css.match(/\n\[dir\]\s*\{([^}]*)\}/)
    expect(declarations(dirBlock ? dirBlock[1] : '')['--ua-font-head']).toBe(
      'var(--font-rubik-ar), var(--font-rubik), system-ui, sans-serif'
    )
  })

  it('no "no shadow" token is spelled none (it would void a composed ring)', () => {
    for (const [name, value] of Object.entries(root)) {
      if (name.startsWith('--ua-shadow-')) expect(value).not.toBe('none')
    }
  })

  it('body paints from the semantic tier', () => {
    const body = css.match(/\nbody\s*\{([^}]*)\}/)
    expect(body?.[1]).toMatch(/background-color:\s*var\(--ua-page\)/)
    expect(body?.[1]).toMatch(/color:\s*rgb\(var\(--ua-fg-body\)\)/)
  })
})

const theme = config.theme!.extend! as Record<string, Record<string, unknown>>
const keys = (o: Record<string, unknown> | undefined) => Object.keys(o ?? {})

describe('Tailwind keys', () => {
  it('every semantic utility points at a defined variable', () => {
    const groups = ['colors', 'borderRadius', 'boxShadow', 'backgroundImage', 'fontFamily', 'fontSize']
    const used = JSON.stringify(groups.map((g) => theme[g])).match(/--ua-[\w-]+/g) ?? []
    for (const name of Array.from(new Set(used))) expect(root).toHaveProperty([name])
  })

  it('colour names do not collide with shadow, size or image names', () => {
    // colours generate shadow-<c>, text-<c> and bg-<c> alongside those groups
    const colours = new Set(keys(theme.colors))
    for (const g of ['boxShadow', 'fontSize', 'backgroundImage']) {
      expect(keys(theme[g]).filter((k) => colours.has(k))).toEqual([])
    }
  })

  it('the shadcn colour objects are still intact (Card, Input, Button use them)', () => {
    const c = theme.colors as Record<string, unknown>
    for (const k of ['card', 'muted', 'accent', 'primary', 'secondary', 'destructive', 'popover']) {
      expect(c[k]).toEqual(expect.objectContaining({ DEFAULT: expect.any(String), foreground: expect.any(String) }))
    }
  })

  it('no coloured glow: every shadow layer outside an element is black', () => {
    for (const [name, value] of Object.entries(root)) {
      if (!name.startsWith('--ua-shadow-')) continue
      for (const layer of value.split(/,(?![^(]*\))/).map((l) => l.trim())) {
        if (layer.startsWith('inset') || layer === '0 0 #0000') continue
        expect({ name, layer, black: /rgb\(0 0 0 \/ [\d.]+\)$/.test(layer) }).toEqual({ name, layer, black: true })
      }
    }
    expect(theme.boxShadow).not.toHaveProperty(['glow-brand'])
  })

  it('every shadow offset is vertical, so nothing needs mirroring under RTL', () => {
    for (const [name, value] of Object.entries(root)) {
      if (!name.startsWith('--ua-shadow-')) continue
      for (const layer of value.split(/,(?![^(]*\))/).map((l) => l.trim().replace(/^inset\s+/, ''))) {
        expect({ name, layer, x: layer.split(/\s+/)[0] }).toEqual({ name, layer, x: '0' })
      }
    }
  })
})

describe('cn() knows the token classes', () => {
  it.each([
    ['text-display text-fg', 'text-display text-fg'],
    ['text-sm text-display', 'text-display'],
    ['rounded-2xl rounded-card', 'rounded-card'],
    ['shadow-lg shadow-tap', 'shadow-tap'],
    ['bg-brand bg-fill-btn', 'bg-brand bg-fill-btn'],
    ['font-head font-bold', 'font-head font-bold'],
    ['text-fg text-fg-muted', 'text-fg-muted'],
  ])('cn(%j) -> %j', (input, expected) => {
    expect(cn(input)).toBe(expected)
  })

  it('leaves default-class merges as they were', () => {
    expect(cn('px-2 px-4')).toBe('px-4')
    expect(cn('text-white text-slate-400')).toBe('text-slate-400')
    expect(cn('rounded-md rounded-lg')).toBe('rounded-lg')
    expect(cn('text-sm text-white')).toBe('text-sm text-white')
  })
})
