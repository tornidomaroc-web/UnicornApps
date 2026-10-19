/**
 * @jest-environment jsdom
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { sanitizeModelHtml } from '@/lib/safe-html'

// The suite runs in node (jest.config.js); this file alone opts into jsdom
// because DOMPurify needs a DOM to sanitize and the structural test below
// needs none. Keep the docblock above: without it every assertion here passes
// vacuously on an empty string.

describe('sanitizeModelHtml strips what a product blurb never needs', () => {
  it.each([
    ['inline event handler on an image', '<p>ok</p><img src=x onerror="alert(1)">', /onerror|<img/],
    ['svg onload', '<svg onload="alert(1)"><p>x</p></svg>', /<svg|onload/],
    ['script element', '<h2>T</h2><script>fetch("/api/account/delete",{method:"POST"})</script>', /<script/],
    ['javascript: link', '<p><a href="javascript:alert(1)">buy</a></p>', /<a |javascript:/],
    ['iframe', '<iframe src="https://evil.example"></iframe><p>x</p>', /<iframe/],
    ['style attribute', '<p style="position:fixed;inset:0">x</p>', /style=/],
    ['form that could phish the password', '<form action="https://evil.example"><input name="password"></form>', /<form|<input/],
  ])('%s', (_label, input, forbidden) => {
    expect(sanitizeModelHtml(input)).not.toMatch(forbidden)
  })

  it('keeps the visible text when it drops the markup around it', () => {
    expect(sanitizeModelHtml('<p><a href="javascript:alert(1)">buy</a></p>')).toBe('<p>buy</p>')
  })
})

describe('sanitizeModelHtml leaves the shape the prompt asks for untouched', () => {
  // The literal shape the generate prompt requests: <h2>, <p>, <ul> of features.
  // If this ever changes, the fixture must change with it — the whole point of
  // the allowlist is that ordinary output survives byte-for-byte.
  const sample =
    '<h2>Glow Serum</h2><p>A <strong>brightening</strong> serum with <em>vitamin C</em>.</p>' +
    '<ul><li>30ml bottle</li><li>Dropper cap</li><li>Fragrance-free</li></ul><h3>Care</h3><p>Store cool.<br>Shake well.</p>'

  it('returns ordinary model output unchanged', () => {
    expect(sanitizeModelHtml(sample)).toBe(sample)
  })

  it('returns Arabic output unchanged', () => {
    const ar = '<h2>سيروم فيتامين سي</h2><p>تركيبة <strong>مشرقة</strong> للبشرة.</p><ul><li>٣٠ مل</li></ul>'
    expect(sanitizeModelHtml(ar)).toBe(ar)
  })

  it('returns an empty string for empty input', () => {
    expect(sanitizeModelHtml('')).toBe('')
  })
})

// --- Structural: every raw HTML insertion in src/ goes through the gate -------
// dangerouslySetInnerHTML is the only React API that puts a string into the DOM
// unescaped. This walks src/ and requires the sanitizer call on the same line
// as each use, so a third site added later cannot bypass it silently.
describe('every dangerouslySetInnerHTML in src/ is fed by sanitizeModelHtml', () => {
  const uses: { file: string; line: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(entry)) {
        // Comments stripped first: the gate's own doc comment names the API.
        const code = readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        for (const line of code.split(/\r?\n/)) {
          if (/dangerouslySetInnerHTML|\.innerHTML\s*=|srcDoc=/.test(line)) uses.push({ file: p, line })
        }
      }
    }
  }
  walk(join(process.cwd(), 'src'))

  // The ONE exception: the lite-mode switch inlines a script that is a constant
  // built at module load from literal tokens (lib/lite-mode.ts), with no user
  // or model input anywhere in it. Matched by exact file and exact line, so any
  // other use, or any change to this one, still has to pass the gate.
  const LITE = { file: join('src', 'components', 'Providers.tsx'), line: '<script dangerouslySetInnerHTML={{ __html: LITE_SCRIPT }} />' }
  const isLite = (u: { file: string; line: string }) => u.file.endsWith(LITE.file) && u.line.trim() === LITE.line
  const gated = uses.filter((u) => !isLite(u))

  it('finds the two known model-output sites and the one static script (the test is not scanning nothing)', () => {
    expect(gated.length).toBe(2)
    expect(uses.filter(isLite).length).toBe(1)
  })

  it('the static script is a constant: no runtime value can reach it', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/lite-mode.ts'), 'utf8')
    // Built only from LITE_CSS, which is built only from the LITE_TOKENS literal.
    expect(src).toMatch(/export const LITE_SCRIPT = `[^`]*\$\{JSON\.stringify\(\s*LITE_CSS\s*\)\}[^`]*`/)
    const template = src.slice(src.indexOf('export const LITE_SCRIPT = `'))
    const body = template.slice(0, template.indexOf('`', template.indexOf('`') + 1))
    expect((body.match(/\$\{/g) || []).length).toBe(1)
  })

  it.each(gated.map((u) => [u.file.replace(process.cwd(), ''), u.line]))(
    '%s',
    (_file, line) => {
      expect(line).toMatch(/sanitizeModelHtml\(/)
    }
  )
})
