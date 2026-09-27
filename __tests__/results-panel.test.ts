import { readFileSync } from 'fs'
import { join } from 'path'
import { BLOCKS } from '@/app/dashboard/ResultsPanel'

/**
 * The generated product page is rendered by ResultsPanel, presentation only.
 * jsdom is not wired for React here, so this pins the SOURCE: the contract the
 * component must keep for Arabic, for a phone WebView, and for the parent's
 * state, in ways a green render would not prove anyway.
 */
const panel = readFileSync(join(process.cwd(), 'src/app/dashboard/ResultsPanel.tsx'), 'utf8')
const client = readFileSync(join(process.cwd(), 'src/app/dashboard/DashboardClient.tsx'), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const code = strip(panel)
const lines = code.split(/\r?\n/)

describe('every part of the output has its own copy action', () => {
  // The ids the parent receives through onCopy. One per part; the test names them
  // so adding a part without a copy action is a visible omission.
  it.each([
    ['title', "'t'"],
    ['meta description', "'m'"],
    ['product description', "'d'"],
    ['shopify html', "'sh'"],
    ['amazon bullets', "'ab'"],
    ['social hook', "'hk'"],
    ['visual concept', "'cc'"],
    ['hashtags', "'tg'"],
    ['structured data', "'sd'"],
  ])('%s', (_part, id) => {
    expect(code).toMatch(new RegExp(`copy\\(${id},`))
  })

  it('the product description has a block of its own (it had none on the old tab strip)', () => {
    expect(code).toMatch(/id="description"/)
    expect(code).toMatch(/results\.productDescription/)
  })

  it('the chip row names every block, and the ids are stable', () => {
    for (const b of BLOCKS) expect(code).toMatch(new RegExp(`id: '${b}'`))
    expect(BLOCKS).toEqual(['seo', 'description', 'shopify', 'amazon', 'social', 'data', 'preview'])
  })
})

describe('model output is rendered for its own language, not the UI language', () => {
  const outputLines = lines.filter((l) => /data-model-output/.test(l))

  it('marks every model-written element', () => {
    expect(outputLines.length).toBeGreaterThanOrEqual(10)
  })

  it('every marked element carries dir="auto" (or ltr for the raw HTML source)', () => {
    // The attribute may sit on the same line or the next (multi-line JSX).
    for (const l of outputLines) {
      const i = lines.indexOf(l)
      const window = lines.slice(i, i + 3).join(' ')
      expect(window).toMatch(/dir="(auto|ltr)"/)
    }
  })

  it('no marked element carries tracking-* — the RTL guard never fires on the English surface', () => {
    for (const l of outputLines) {
      const i = lines.indexOf(l)
      const window = lines.slice(i, i + 4).join(' ')
      expect(window).not.toMatch(/\btracking-/)
    }
  })

  it('the Shopify HTML goes through the sanitizer and gets real heading/list styles', () => {
    expect(code).toMatch(/dangerouslySetInnerHTML=\{\{ __html: mounted \? sanitizeModelHtml\(/)
    // Inserted only after mount: SSR and the hydrating render both produce '',
    // so React never sees an innerHTML mismatch it would refuse to patch.
    expect(code).toMatch(/useEffect\(\(\) => setMounted\(true\), \[\]\)/)
    expect(code).toMatch(/className="model-html/)
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toMatch(/\.model-html h2/)
    expect(css).toMatch(/\.model-html ul \{ list-style: disc/)
    expect(css).toMatch(/\.model-html ul, \.model-html ol \{ padding-inline-start/)
  })
})

describe('direction is logical, so the Arabic surface mirrors', () => {
  it('uses no physical direction utility', () => {
    const physical = /\b(?:sm:|md:|lg:)?(?:ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|inset-x|-ml|-mr)-[\w[\]/.]+/
    const hits = lines.filter((l) => physical.test(l))
    expect(hits).toEqual([])
  })
})

describe('light enough for a phone WebView', () => {
  it('no entrance animation, blur, or WebGL in the panel', () => {
    expect(code).not.toMatch(/framer-motion|motion\.|AnimatePresence/)
    expect(code).not.toMatch(/backdrop-blur|blur-\[|canvas|WebGL/)
  })
  it('the store previews render only once opened', () => {
    expect(code).toMatch(/previewOpen \? <div[^>]*>\{previewSlot\}<\/div> : null/)
  })
})

describe('DashboardClient keeps its state and hands the panel what it needs', () => {
  const c = strip(client)
  it('renders the panel with the copy handler and copied id it already owned', () => {
    expect(c).toMatch(/<ResultsPanel\s/)
    expect(c).toMatch(/copiedId=\{copySuccess\}/)
    expect(c).toMatch(/onCopy=\{copyToClipboard\}/)
  })
  it('the old tab strip and its per-tab bodies are gone from the client', () => {
    expect(c).not.toMatch(/activeTab === 'seo'/)
    expect(c).not.toMatch(/layoutId="tab-active"/)
  })
  it('the store mock-ups still live in the client and are passed as a slot', () => {
    expect(c).toMatch(/previewSlot=\{/)
    expect(c).toMatch(/<AmazonMockup \/>/)
    expect(c).toMatch(/<ShopifyMockup \/>/)
  })
})
