'use client'

import { Clock, FileDown, ImageIcon } from 'lucide-react'
import { SURFACE, TILE } from './surface'

/**
 * Everything the user has generated, as a list of rows that read on a phone.
 *
 * PRESENTATION ONLY. The rows, the recall handler and the export handler come
 * from DashboardClient; nothing here fetches or mutates.
 *
 * SHAPE. A heading with its one-line sub, the CSV export as a pill beside it,
 * then one row per generation: the photo as a thumbnail, the generated title
 * on one line, the date under it, and an "open" label at the end. The old
 * five-column table is gone — on a phone it scrolled sideways and every cell
 * but the title was chrome. There is no per-row platform badge: every result
 * covers every platform, so the badge said the same thing on every row.
 *
 * MODEL OUTPUT vs UI. The title is model-written: `data-model-output`,
 * `dir="auto"`, no tracking-*, and nothing near it carries tracking either.
 *
 * DIRECTION. Logical classes only; the row mirrors on the Arabic surface.
 *
 * EMPTY STATE. A card that says what will appear here and what to do first,
 * not a table with no rows. Export is disabled when there is nothing to export.
 */

export interface HistoryRowView {
  id: string
  created_at: string
  image_url: string
  content: { seoTitle?: string }
}

export interface HistoryPanelProps<Row extends HistoryRowView> {
  t: (key: string) => string
  rows: readonly Row[]
  onRecall: (row: Row) => void
  onExport: () => void
}

export default function HistoryPanel<Row extends HistoryRowView>({ t, rows, onRecall, onExport }: HistoryPanelProps<Row>) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[28px] font-bold leading-[1.15] text-white sm:text-[32px]">{t('dash.history')}</h2>
          <p className="mt-1 text-sm text-slate-400">{t('dash.productionHistory')}</p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={rows.length === 0}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-brand/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FileDown className="h-3.5 w-3.5" />
          {t('dash.exportCsv')}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={`${SURFACE} flex flex-col items-center gap-4 px-5 py-12 text-center`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-slate-500">
            <ImageIcon className="h-6 w-6" />
          </span>
          <p className="text-base font-bold text-white">{t('dash.noHistory')}</p>
          <p className="text-sm text-slate-400">{t('dash.noSignatures')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onRecall(row)}
                className={`${TILE} flex w-full items-center gap-4 p-3 text-start transition-colors hover:border-brand/50 sm:p-4`}
              >
                <img src={row.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1">
                  <span data-model-output dir="auto" className="block truncate text-base font-bold text-white">
                    {row.content.seoTitle}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(row.created_at).toLocaleDateString()}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold uppercase text-slate-500">{t('dash.open')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
