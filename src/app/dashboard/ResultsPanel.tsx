'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Code2, Eye } from 'lucide-react'
import { sanitizeModelHtml } from '@/lib/safe-html'

/**
 * The generated product page, as a stack of blocks the user can act on.
 *
 * PRESENTATION ONLY. Every piece of state and every handler stays in
 * DashboardClient: this receives the result, the copy callback and which id
 * was last copied, and renders. Nothing here fetches, spends, or mutates.
 *
 * SHAPE. One block per part of the output, each with its own copy action:
 * title (hero), meta description, product description (which had no home on
 * the old tab strip at all), Shopify HTML, Amazon bullets, social hook,
 * concept, hashtags, structured data, and the store previews last. A chip row
 * at the top jumps to a block; nothing is hidden behind a tab, so on a phone
 * the user scrolls one column and every copy button is where its text is.
 *
 * MODEL OUTPUT vs UI. Anything the model wrote is rendered with
 * `data-model-output` and `dir="auto"`: its language is the GENERATION
 * language, not the UI's, so Arabic output on the English surface must align
 * and shape itself. Those elements carry NO tracking-* (the global RTL guard
 * keys on the wrapper's dir and never fires on the English surface). A test
 * pins both.
 *
 * DIRECTION. Logical classes only (ps-/pe-/ms-/me-/start-/end-/text-start), so
 * the Arabic surface mirrors without a second set of rules. A test pins the
 * absence of physical ones.
 *
 * WEIGHT. No entrance animation, no blur, no WebGL: every install is a phone
 * WebView. The store previews render only once opened.
 */

export interface PanelResult {
  seoTitle: string
  metaDescription: string
  productDescription: string
  socialMediaTags: string[]
  shopifyHtml?: string
  amazonBullets?: string[]
  structuredData?: { material: string; dominantColor: string; targetAudience: string; careInstructions: string }
  viralScript?: { hook: string; concept: string }
}

export interface ResultsPanelProps {
  results: PanelResult
  t: (key: string) => string
  /** The id passed to onCopy for the part most recently copied, or null. */
  copiedId: string | null
  onCopy: (text: string, id: string) => void
  /** The Amazon / Shopify store mock-ups, owned by the parent. Rendered only when opened. */
  previewSlot?: ReactNode
}

/** Block ids double as anchor targets for the chip row. Stable: tests pin them. */
export const BLOCKS = ['seo', 'description', 'shopify', 'amazon', 'social', 'data', 'preview'] as const

const SURFACE = 'rounded-3xl border border-white/10 bg-white/[0.03]'
const EYEBROW = 'text-xs font-black uppercase tracking-widest text-slate-500'

function CopyButton({
  id,
  text,
  label,
  copiedId,
  onCopy,
}: {
  id: string
  text: string
  label: string
  copiedId: string | null
  onCopy: (text: string, id: string) => void
}) {
  const done = copiedId === id
  return (
    <button
      type="button"
      onClick={() => onCopy(text, id)}
      aria-live="polite"
      className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-xs font-black uppercase tracking-widest transition-colors ${
        done
          ? 'border-brand/40 bg-brand/15 text-white'
          : 'border-white/10 bg-white/5 text-slate-300 hover:border-brand/50 hover:text-white'
      }`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </button>
  )
}

function Block({
  id,
  eyebrow,
  action,
  children,
}: {
  id: (typeof BLOCKS)[number]
  eyebrow: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={`result-${id}`} className={`${SURFACE} scroll-mt-24 p-5 sm:p-8`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className={EYEBROW}>{eyebrow}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function ResultsPanel({ results, t, copiedId, onCopy, previewSlot }: ResultsPanelProps) {
  const [shopifyView, setShopifyView] = useState<'preview' | 'code'>('preview')
  const [previewOpen, setPreviewOpen] = useState(false)
  // The sanitizer needs a DOM, so on the server it returns ''. If this panel is
  // ever server-rendered with results, the client's first render must also be
  // '' — React does not patch an innerHTML mismatch during hydration, and the
  // block would stay blank. So the HTML is inserted only after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const bullets = results.amazonBullets ?? []
  const tags = results.socialMediaTags ?? []
  const data = results.structuredData
  const dataRows = data
    ? [
        [t('dash.data.material'), data.material],
        [t('dash.data.color'), data.dominantColor],
        [t('dash.data.audience'), data.targetAudience],
        [t('dash.data.care'), data.careInstructions],
      ]
    : []

  const copy = (id: string, text: string, label = t('dash.seo.copy')) => (
    <CopyButton id={id} text={text} label={copiedId === id ? t('dash.copied') : label} copiedId={copiedId} onCopy={onCopy} />
  )

  const chips: { id: (typeof BLOCKS)[number]; label: string }[] = [
    { id: 'seo', label: t('dash.tab.seo') },
    { id: 'description', label: t('dash.block.description') },
    { id: 'shopify', label: t('dash.tab.shopify') },
    { id: 'amazon', label: t('dash.tab.amazon') },
    { id: 'social', label: t('dash.tab.social') },
    { id: 'data', label: t('dash.tab.data') },
    { id: 'preview', label: t('dash.tab.preview') },
  ]

  return (
    <div className="space-y-5">
      {/* HERO: the one string every block is about, and the first thing copied. */}
      <div className={`${SURFACE} p-5 sm:p-8`}>
        <p className={`${EYEBROW} mb-3`}>{t('dash.seo.target')}</p>
        <p data-model-output dir="auto" className="break-words text-start text-[28px] font-bold leading-[1.15] text-white sm:text-[32px]">
          {results.seoTitle}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">{copy('t', results.seoTitle)}</div>
      </div>

      {/* CHIP ROW: jump links, scrollable on a phone, never hides a destination. */}
      <nav
        aria-label={t('dash.block.sections')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {chips.map((c) => (
          <a
            key={c.id}
            href={`#result-${c.id}`}
            onClick={(e) => {
              e.preventDefault()
              if (c.id === 'preview') setPreviewOpen(true)
              document.getElementById(`result-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-slate-300 hover:border-brand/50 hover:text-white"
          >
            {c.label}
          </a>
        ))}
      </nav>

      <Block id="seo" eyebrow={t('dash.seo.meta')} action={copy('m', results.metaDescription)}>
        <p data-model-output dir="auto" className="text-start text-base leading-relaxed text-slate-300">
          {results.metaDescription}
        </p>
      </Block>

      <Block id="description" eyebrow={t('dash.block.description')} action={copy('d', results.productDescription)}>
        <p data-model-output dir="auto" className="whitespace-pre-line text-start text-base leading-relaxed text-slate-300">
          {results.productDescription}
        </p>
      </Block>

      <Block
        id="shopify"
        eyebrow={t('dash.shopify.title')}
        action={copy('sh', results.shopifyHtml ?? '', t('dash.copyCode'))}
      >
        <div className="mb-4 inline-flex rounded-full border border-white/10 bg-black/40 p-1">
          {(['preview', 'code'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setShopifyView(v)}
              aria-pressed={shopifyView === v}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-black uppercase tracking-widest transition-colors ${
                shopifyView === v ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {v === 'preview' ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
              {v === 'preview' ? t('dash.shopify.preview') : t('dash.shopify.code')}
            </button>
          ))}
        </div>
        {shopifyView === 'preview' ? (
          <div
            data-model-output
            dir="auto"
            className="model-html max-h-[520px] overflow-auto rounded-2xl border border-white/5 bg-black/40 p-5 text-start custom-scrollbar"
            dangerouslySetInnerHTML={{ __html: mounted ? sanitizeModelHtml(results.shopifyHtml ?? '') : '' }}
          />
        ) : (
          <pre
            data-model-output
            dir="ltr"
            className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/5 bg-black/60 p-5 text-start font-mono text-xs leading-relaxed text-brand/80 custom-scrollbar"
          >
            {results.shopifyHtml}
          </pre>
        )}
      </Block>

      <Block id="amazon" eyebrow={t('dash.amazon.title')} action={copy('ab', bullets.join('\n'))}>
        <ul className="space-y-3">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/5 p-4">
              <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand" />
              <p data-model-output dir="auto" className="min-w-0 flex-1 text-start text-slate-200">
                {b}
              </p>
            </li>
          ))}
        </ul>
      </Block>

      <Block id="social" eyebrow={t('dash.social.hook')} action={copy('hk', results.viralScript?.hook ?? '')}>
        <p data-model-output dir="auto" className="text-start text-lg font-bold leading-snug text-white">
          {results.viralScript?.hook}
        </p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className={EYEBROW}>{t('dash.social.concept')}</span>
              {copy('cc', results.viralScript?.concept ?? '')}
            </div>
            <p data-model-output dir="auto" className="text-start text-sm leading-relaxed text-slate-300">
              {results.viralScript?.concept}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className={EYEBROW}>{t('dash.social.tags')}</span>
              {copy('tg', tags.join(' '))}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  data-model-output
                  dir="auto"
                  className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-bold text-brand"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Block>

      <Block id="data" eyebrow={t('dash.tab.data')} action={copy('sd', dataRows.map(([k, v]) => `${k}: ${v}`).join('\n'))}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {dataRows.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/5 bg-white/5 p-4">
              <dt className={`${EYEBROW} mb-2`}>{k}</dt>
              <dd data-model-output dir="auto" className="text-start text-base font-bold text-white">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </Block>

      {previewSlot ? (
        <Block
          id="preview"
          eyebrow={t('dash.tab.preview')}
          action={
            <button
              type="button"
              onClick={() => setPreviewOpen((o) => !o)}
              aria-expanded={previewOpen}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-slate-300 hover:border-brand/50 hover:text-white"
            >
              <Eye className="h-3.5 w-3.5" />
              {previewOpen ? t('dash.preview.hide') : t('dash.preview.show')}
            </button>
          }
        >
          {previewOpen ? <div className="space-y-10">{previewSlot}</div> : null}
        </Block>
      ) : null}
    </div>
  )
}
