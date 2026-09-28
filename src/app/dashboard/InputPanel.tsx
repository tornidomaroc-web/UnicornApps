'use client'

import { useRef, type ChangeEvent, type ReactNode } from 'react'
import { AlertCircle, Camera, CreditCard, Sparkles, UploadCloud, X } from 'lucide-react'
import { EYEBROW, SURFACE, TILE } from './surface'

/**
 * The product-photo input, as one card: how to add a photo, the photo once it
 * is chosen, and what happens to it while the model works.
 *
 * PRESENTATION ONLY. Every piece of state and every handler stays in
 * DashboardClient: this receives the preview, the loading flag, the handlers
 * and, once results exist, the primary action as a slot. Nothing here fetches,
 * spends, or mutates.
 *
 * SHAPE. Before a photo: a title, one line of what the model will read from
 * it, and two option tiles — upload and camera — each a round icon chip beside
 * a name and a one-line hint, stacked on a phone and side by side from 640px.
 * After: the one sentence that names the action and its cost comes FIRST in
 * the DOM, then the photo in a rounded card with a single remove control, then
 * the action slot. First in the DOM means first on a phone, above a square
 * image that would otherwise push it under the fold; on a wide screen the grid
 * puts the sentence beside the photo. DOM order is visual order — no `order:`.
 *
 * THE PRIMARY ACTION IS A SLOT. The parent renders it here once results exist
 * and in its own fixed bar before that, so the control is never on screen
 * twice. PrimaryAction below is the one definition both sites use; the gating
 * (credits, native, checkout) is decided by the parent and arrives as `kind`.
 *
 * MODEL OUTPUT vs UI. Hotspot labels are model-written: `data-model-output`,
 * `dir="auto"`, no tracking-*. Their POSITION is a fraction of the image, so it
 * is set with physical top/left inline: image coordinates do not mirror with
 * text direction, and a logical offset here would put every dot on the wrong
 * side of the Arabic surface.
 *
 * DIRECTION. Logical classes only (start-/end-/ps-/pe-/text-start).
 *
 * WEIGHT. No framer-motion, no blur, no WebGL. The two animations — the sweep
 * over the photo while loading and the bar inside the loading button — are CSS
 * transforms (translate only; never scaleX, which distorts cursive joins).
 */

export type PrimaryKind = 'generate' | 'loading' | 'purchase' | 'limit'

export interface PrimaryActionProps {
  kind: PrimaryKind
  /** Already translated by the parent. */
  label: string
  disabled: boolean
  onClick: () => void
}

/**
 * The one primary control. h-20 is load-bearing: the parent's fixed bar and
 * its spacer are sized to it (105px = 12 + 80 + 12 + 1). The label sits on ONE
 * nowrap row at 16px: this box is fixed-height with overflow hidden, so a
 * control cannot reflow out of trouble the way content can. The out-of-credits
 * copy is the exception — it is a sentence, so it is allowed to wrap.
 */
export function PrimaryAction({ kind, label, disabled, onClick }: PrimaryActionProps) {
  const look = {
    generate: 'bg-brand text-white shadow-glow-brand hover:bg-brand/90',
    purchase: 'bg-brand text-white shadow-glow-brand hover:bg-brand/90',
    loading: 'border border-brand/40 bg-black/40 text-white',
    limit: 'border border-white/10 bg-white/[0.03] text-slate-400',
  }[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={kind === 'loading'}
      className={`relative flex h-20 w-full items-center justify-center overflow-hidden rounded-full transition-colors disabled:cursor-not-allowed ${look}`}
    >
      {kind === 'loading' ? (
        <span className="flex flex-col items-center gap-2">
          <span className="text-base font-bold leading-[1.15]">{label}</span>
          <span aria-hidden className="block h-1 w-40 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full w-1/3 rounded-full bg-brand animate-slide-x" />
          </span>
        </span>
      ) : kind === 'limit' ? (
        <span className="flex items-center gap-2 px-6 text-center text-sm font-bold leading-snug">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {label}
        </span>
      ) : (
        <span className="flex items-center gap-2 whitespace-nowrap text-base font-bold leading-[1.15]">
          {kind === 'purchase' ? <CreditCard className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          {label}
        </span>
      )}
    </button>
  )
}

export interface InputPanelProps {
  t: (key: string) => string
  preview: string | null
  loading: boolean
  /** Model-written feature markers for the current results; shown only when not loading. */
  hotspots?: { x: number; y: number; label: string }[]
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  onOpenCamera: () => void
  onClear: () => void
  /** The primary action, once results exist. Before that the parent's fixed bar carries it. */
  action?: ReactNode
}

export default function InputPanel({
  t,
  preview,
  loading,
  hotspots,
  onFileChange,
  onOpenCamera,
  onClear,
  action,
}: InputPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  if (!preview) {
    return (
      <section className={`${SURFACE} p-5 sm:p-8`}>
        <h2 className="text-[28px] font-bold leading-[1.15] text-white sm:text-[32px]">{t('dash.inputSource')}</h2>
        <p className="mt-2 text-base text-slate-400">{t('dash.uploadSub')}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`${TILE} flex items-center gap-4 p-4 text-start transition-colors hover:border-brand/50 sm:p-5`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <UploadCloud className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-white">{t('dash.uploadBtn')}</span>
              <span className="block text-sm text-slate-400">{t('dash.uploadFormat')}</span>
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCamera}
            className={`${TILE} flex items-center gap-4 p-4 text-start transition-colors hover:border-brand/50 sm:p-5`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Camera className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold text-white">{t('dash.cameraBtn')}</span>
              <span className="block text-sm text-slate-400">{t('dash.cameraSub')}</span>
            </span>
          </button>
        </div>

        <input ref={fileRef} id="file-upload" type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </section>
    )
  }

  return (
    <section className={`${SURFACE} p-5 sm:p-8`}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,360px),1fr] md:items-start">
        <div className="space-y-4">
          <div className={`${TILE} p-5`}>
            <p className={`${EYEBROW} mb-2`}>{t('dash.photo.selected')}</p>
            <p className="text-base font-medium text-slate-200">{t('dash.preflight')}</p>
          </div>
          {action}
        </div>

        <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/10 bg-black/40">
          <img src={preview} alt="Preview" className="h-full w-full object-cover" />

          {loading && (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute inset-0 bg-brand/10" />
              <div className="absolute -top-full start-0 end-0 h-full border-b-2 border-brand shadow-[0_0_24px_rgb(var(--ua-brand-glow)/0.8)] animate-sweep-y" />
            </div>
          )}

          {!loading &&
            hotspots?.map((h, i) => (
              <div
                key={i}
                className="group/hotspot absolute z-10"
                style={{ top: `${h.y}%`, left: `${h.x}%`, transform: 'translate(-50%, -50%)' }}
              >
                <span className="block h-4 w-4 rounded-full border-2 border-white bg-brand shadow-[0_0_16px_rgb(var(--ua-brand-glow)/0.8)]" />
                <span
                  data-model-output
                  dir="auto"
                  className="pointer-events-none absolute bottom-6 whitespace-nowrap rounded-xl border border-white/10 bg-black/90 px-3 py-1.5 text-xs font-bold text-white opacity-0 transition-opacity group-hover/hotspot:opacity-100"
                  style={{ left: '50%', transform: 'translateX(-50%)' }}
                >
                  {h.label}
                </span>
              </div>
            ))}

          <button
            type="button"
            onClick={onClear}
            aria-label={t('dash.removePhoto')}
            className="absolute end-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/70 text-slate-200 transition-colors hover:bg-black hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  )
}
