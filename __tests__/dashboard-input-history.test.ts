import { readFileSync } from 'fs'
import { join } from 'path'
import { localGenerationRow } from '@/lib/dashboard-history'

/**
 * The dashboard's input card, history list and web camera are presentation
 * components; the state, the handlers and the payment gating stay in
 * DashboardClient. jsdom is not wired for React here, so this pins the SOURCE:
 * the contract each file must keep for Arabic, for a phone WebView, for the
 * parent's state, and for the store policy the gating exists for.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
// Comments FIRST: the explanations in these files name the very things asserted on.
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const PANELS = {
  input: 'src/app/dashboard/InputPanel.tsx',
  history: 'src/app/dashboard/HistoryPanel.tsx',
  camera: 'src/app/dashboard/CameraModal.tsx',
} as const

const code = Object.fromEntries(Object.entries(PANELS).map(([k, p]) => [k, strip(read(p))])) as Record<
  keyof typeof PANELS,
  string
>
const client = strip(read('src/app/dashboard/DashboardClient.tsx'))
const dict = read('src/lib/i18n/LanguageContext.tsx')
const css = read('src/app/globals.css')

const PHYSICAL =
  /\b(?:sm:|md:|lg:)?(?:ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|inset-x|-ml|-mr)-[\w[\]/.]+/

describe('the three panels are presentation only', () => {
  it.each(Object.keys(PANELS) as (keyof typeof PANELS)[])('%s holds no state and performs no request', (k) => {
    expect(code[k]).not.toMatch(/useState\(/)
    expect(code[k]).not.toMatch(/\bfetch\s*\(/)
    expect(code[k]).not.toMatch(/refreshCredits|setResults|setPreview|useRouter|openCheckout/)
  })

  it.each(Object.keys(PANELS) as (keyof typeof PANELS)[])('%s is light enough for a phone WebView', (k) => {
    expect(code[k]).not.toMatch(/framer-motion|motion\.|AnimatePresence/)
    expect(code[k]).not.toMatch(/backdrop-blur|blur-\[|WebGL/)
    expect(code[k]).not.toMatch(/scaleX/)
  })

  it.each(Object.keys(PANELS) as (keyof typeof PANELS)[])('%s uses no physical direction utility', (k) => {
    const hits = code[k].split(/\r?\n/).filter((l) => PHYSICAL.test(l))
    expect(hits).toEqual([])
  })

  it('no panel states a price', () => {
    for (const k of Object.keys(PANELS) as (keyof typeof PANELS)[]) expect(code[k]).not.toMatch(/\$\d/)
  })
})

describe('model output is rendered for its own language', () => {
  const marked = (src: string) => {
    const lines = src.split(/\r?\n/)
    return lines
      .map((l, i) => (/data-model-output/.test(l) ? lines.slice(i, i + 4).join(' ') : null))
      .filter((w): w is string => w !== null)
  }

  it('the history title is model-written: marked, dir="auto", no tracking', () => {
    const windows = marked(code.history)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatch(/dir="auto"/)
    expect(windows[0]).not.toMatch(/\btracking-/)
    expect(windows[0]).toMatch(/seoTitle/)
  })

  it('hotspot labels are model-written: marked, dir="auto", no tracking', () => {
    const windows = marked(code.input)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatch(/dir="auto"/)
    expect(windows[0]).not.toMatch(/\btracking-/)
  })

  it('hotspot POSITION is physical on purpose — image coordinates do not mirror', () => {
    expect(code.input).toMatch(/style=\{\{ top: `\$\{h\.y\}%`, left: `\$\{h\.x\}%`/)
  })
})

describe('the input card', () => {
  it('has the two ways in, and the file input the handlers expect', () => {
    expect(code.input).toMatch(/id="file-upload"/)
    expect(code.input).toMatch(/onChange=\{onFileChange\}/)
    expect(code.input).toMatch(/onClick=\{onOpenCamera\}/)
    expect(code.input).toMatch(/onClick=\{onClear\}/)
    expect(code.input).toMatch(/aria-label=\{t\('dash\.removePhoto'\)\}/)
  })

  it('the primary action is one definition with four kinds, h-20 for the fixed bar', () => {
    expect(code.input).toMatch(/export function PrimaryAction/)
    expect(code.input).toMatch(/'generate' \| 'loading' \| 'purchase' \| 'limit'/)
    expect(code.input).toMatch(/h-20 w-full/)
  })

  it('the loading state sweeps the photo with a CSS transform, and nothing blurs', () => {
    expect(code.input).toMatch(/animate-sweep-y/)
    expect(css).toMatch(/@keyframes sweep-y \{\s*from \{ transform: translateY\(0\); \}\s*to \{ transform: translateY\(100%\); \}/)
    expect(css).toMatch(/@keyframes slide-x \{\s*from \{ transform: translateX\(-100%\); \}/)
  })

  it('the sentence that names the action comes before the photo in the DOM', () => {
    const sentence = code.input.indexOf("t('dash.preflight')")
    const photo = code.input.indexOf('<img src={preview}')
    expect(sentence).toBeGreaterThan(-1)
    expect(photo).toBeGreaterThan(sentence)
  })
})

describe('the history list', () => {
  it('renders rows through the recall handler and the export through its handler', () => {
    expect(code.history).toMatch(/onClick=\{\(\) => onRecall\(row\)\}/)
    expect(code.history).toMatch(/onClick=\{onExport\}/)
    expect(code.history).toMatch(/disabled=\{rows\.length === 0\}/)
  })

  it('has an empty state and no table', () => {
    expect(code.history).toMatch(/rows\.length === 0 \? \(/)
    expect(code.history).toMatch(/t\('dash\.noHistory'\)/)
    expect(code.history).not.toMatch(/<table|<th\b|<td\b/)
  })

  it('carries no per-row platform badge', () => {
    expect(code.history).not.toMatch(/platform/i)
  })
})

describe('DashboardClient keeps every state, handler and gate', () => {
  it('renders the three panels with the handlers it already owned', () => {
    expect(client).toMatch(/<InputPanel\s/)
    expect(client).toMatch(/onFileChange=\{handleFileChange\}/)
    expect(client).toMatch(/onOpenCamera=\{openCamera\}/)
    expect(client).toMatch(/onClear=\{clearPhoto\}/)
    expect(client).toMatch(/<HistoryPanel\s/)
    expect(client).toMatch(/onRecall=\{recallGeneration\}/)
    expect(client).toMatch(/onExport=\{\(\) => downloadCSV\(history/)
    expect(client).toMatch(/<CameraModal\s/)
    expect(client).toMatch(/onCapture=\{capturePhoto\}/)
    expect(client).toMatch(/onClose=\{closeCamera\}/)
  })

  it('the out-of-credits gate is unchanged: purchase only in the bar, only on web, only at zero', () => {
    expect(client).toMatch(/const purchaseHere = allowPurchase && outOfCredits && !isNative/)
    expect(client).toMatch(/isNative \? t\('dash\.limitReached'\) : t\('dash\.noCredits'\)/)
    // Exactly two render sites, and only the fixed bar may become a purchase.
    expect(client.match(/primaryProps\(\{ allowPurchase: true \}\)/g)).toHaveLength(1)
    expect(client.match(/primaryProps\(\{ allowPurchase: false \}\)/g)).toHaveLength(1)
    expect(client.match(/<PrimaryAction /g)).toHaveLength(2)
  })

  it('the fixed bar and its spacer are intact', () => {
    expect(client).toMatch(/\{preview && !results && \(/)
    expect(client).toMatch(/className="h-\[105px\] mb-safe"/)
    expect(client).toMatch(/className="pb-safe"/)
  })

  it('the platform picker and its badge are gone', () => {
    expect(client).not.toMatch(/selectedPlatform|platformBadge|const platforms|<style jsx/)
    expect(client).not.toMatch(/'dash\.platform'|dash\.platformName/)
  })

  it('the client no longer imports framer-motion', () => {
    expect(client).not.toMatch(/framer-motion/)
  })

  it('no fake price, rating count or returns claim in the store mock-ups', () => {
    expect(client).not.toMatch(/\$\d/)
    expect(client).not.toMatch(/ratings|FREE Returns/)
  })

  it('the generate request carries no platform', () => {
    expect(client).not.toMatch(/platform: selectedPlatform/)
    expect(client).toMatch(/localGenerationRow\(data, preview\)/)
  })
})

describe('the history lib no longer requires a platform', () => {
  it('omits the key when none is given, and keeps it when one is', () => {
    expect(localGenerationRow({ a: 1 }, 'data:x')).not.toHaveProperty('platform')
    expect(localGenerationRow({ a: 1 }, 'data:x', 'shopify')).toHaveProperty('platform', 'shopify')
  })
})

describe('the dictionary', () => {
  const NEW_KEYS = ['dash.photo.selected', 'dash.removePhoto', 'dash.open', 'dash.cameraClose', 'dash.cameraCapture']
  const REMOVED_KEYS = [
    'dash.platform',
    'dash.platformName',
    'dash.id',
    'dash.asset',
    'dash.matrixSignature',
    'dash.action',
    'dash.badge.edge',
    'dash.badge.vercel',
    'dash.badge.gemini',
  ]

  it.each(NEW_KEYS)('%s is defined in both languages', (key) => {
    expect(dict.split(`'${key}':`).length - 1).toBe(2)
  })

  it.each(REMOVED_KEYS)('%s is gone from both languages', (key) => {
    expect(dict).not.toMatch(new RegExp(`'${key.replace(/\./g, '\\.')}':`))
  })

  it('neither pre-flight sentence names a platform any more', () => {
    for (const key of ['dash.preflight', 'dash.analysisComplete']) {
      const values = dict.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']*)'`, 'g')) ?? []
      expect(values).toHaveLength(2)
      for (const v of values) expect(v).not.toMatch(/\{platform\}/)
    }
  })

  it('the new Arabic strings carry no dash, bidi, zero-width or presentation-form character', () => {
    const FORBIDDEN = /[‐-―−​-‏‪-‮⁦-⁩﻿ﭐ-﷿ﹰ-﻾]/
    const arStart = dict.indexOf('\n  ar: {')
    const ar = dict.slice(arStart)
    for (const key of [...NEW_KEYS, 'dash.preflight', 'dash.analysisComplete']) {
      const m = ar.match(new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']*)'`))
      expect(m).not.toBeNull()
      expect({ key, forbidden: FORBIDDEN.test(m![1]) }).toEqual({ key, forbidden: false })
      // Arabic comma, never the Urdu full stop.
      expect(m![1]).not.toMatch(/۔/)
    }
  })
})
