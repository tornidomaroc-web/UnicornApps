import { readFileSync } from 'fs'
import { join } from 'path'
import config from '../tailwind.config'
import { cn } from '@/lib/utils'

/**
 * Semantic design-token guard.
 *
 * The semantic tier in globals.css was introduced with TODAY's values so it
 * changes no pixel. This suite pins each token to what it resolves to now, so:
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
  for (const m of Array.from(block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))) out[m[1]] = m[2].trim()
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
  return raw.replace(/var\((--[\w-]+)\)/g, (_, ref) => resolve(ref, vars, depth + 1))
}

// Each semantic token and the value it renders as today.
const TODAY: Record<string, string> = {
  '--ua-page': 'rgb(7 7 16)',
  '--ua-page-image': 'none',
  '--ua-panel': 'rgb(255 255 255 / 0.03)',
  '--ua-row': 'rgb(255 255 255 / 0.05)',
  '--ua-field': 'rgb(0 0 0 / 0.4)',
  '--ua-line': 'rgb(255 255 255 / 0.1)',
  '--ua-line-soft': 'rgb(255 255 255 / 0.05)',
  '--ua-fg': '255 255 255',
  '--ua-fg-body': '200 207 224',
  '--ua-fg-muted': '148 163 184',
  '--ua-fg-faint': '100 116 139',
  '--ua-fg-link': '99 91 255',
  '--ua-fg-on-brand': '255 255 255',
  '--ua-focus': '99 91 255',
  '--ua-fill-btn': 'none',
  '--ua-fill-ghost': 'none',
  '--ua-fill-tap': 'none',
  '--ua-fill-icon': 'none',
  '--ua-fill-credits': 'none',
  '--ua-radius-card': '1.5rem',
  '--ua-radius-row': '1rem',
  '--ua-radius-icon': '1rem',
  '--ua-radius-input': '1rem',
  '--ua-radius-pill': '9999px',
  '--ua-shadow-container': '0 0 #0000',
  '--ua-shadow-tap': '0 0 #0000',
  '--ua-shadow-icon': '0 0 #0000',
  '--ua-shadow-btn': '0 0 40px -5px rgb(99 91 255 / 0.5)',
  '--ua-shadow-ghost': '0 0 #0000',
  '--ua-shadow-well': '0 0 #0000',
  '--ua-shadow-credits': '0 0 #0000',
  '--ua-shadow-mark': '0 0 #0000',
  '--ua-font-head': 'inherit',
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

  it('the canonical glow is unchanged and equals shadow-btn today', () => {
    const shadow = theme.boxShadow as Record<string, string>
    expect(shadow['glow-brand']).toBe('0 0 40px -5px rgb(var(--ua-brand-glow) / 0.5)')
    expect(resolve('--ua-shadow-btn')).toBe(shadow['glow-brand'].replace('var(--ua-brand-glow)', '99 91 255'))
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
