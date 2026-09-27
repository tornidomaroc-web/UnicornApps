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

  it('finds the two known sites (the test is not scanning nothing)', () => {
    expect(uses.length).toBe(2)
  })

  it.each(uses.map((u) => [u.file.replace(process.cwd(), ''), u.line]))(
    '%s',
    (_file, line) => {
      expect(line).toMatch(/sanitizeModelHtml\(/)
    }
  )
})
