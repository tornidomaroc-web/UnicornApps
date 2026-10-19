import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import config from '../tailwind.config'
import { bannerToneClass, BANNER_CONTAINER_CLASS } from '../src/lib/dashboard-banner'

/**
 * Tailwind only generates a class it finds in a `content` file. The banner
 * classes live in src/lib, which was not scanned, so five of them never
 * existed in production CSS (the pending banner rendered with no colour).
 *
 * This compiles utilities with the REAL config and its REAL content globs,
 * so it fails if src/lib drops out of the scan or a banner class stops
 * resolving to a rule.
 */

let generated = ''
beforeAll(async () => {
  const result = await postcss([tailwindcss({ ...config, corePlugins: { preflight: false } })]).process(
    '@tailwind utilities;',
    { from: undefined }
  )
  generated = result.css
}, 60000)

/** Tailwind's selector for a plain utility: `.` + the class with `/ [ ] .` escaped. */
const selectorFor = (cls: string) => '.' + cls.replace(/([/[\].:])/g, '\\$1')

describe('Tailwind scans src/lib', () => {
  it('the content globs include src/lib', () => {
    expect(config.content).toEqual(expect.arrayContaining(['./src/lib/**/*.{js,ts,jsx,tsx,mdx}']))
  })

  it.each(['success', 'pending', 'failure'] as const)('every %s banner class is generated', (tone) => {
    for (const cls of bannerToneClass(tone).split(/\s+/)) {
      expect({ cls, generated: generated.includes(selectorFor(cls) + ' ') || generated.includes(selectorFor(cls) + '{') }).toEqual({
        cls,
        generated: true,
      })
    }
  })

  it('the banner container sets no outer margin of its own (callers space it)', () => {
    expect(BANNER_CONTAINER_CLASS.split(/\s+/).filter((c) => /^-?m[tbyse]?-/.test(c) && c !== 'mx-auto')).toEqual([])
  })
})
