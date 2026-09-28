'use client'

import type { RefObject } from 'react'
import { Camera, X } from 'lucide-react'

/**
 * The web camera, full screen: the live video, one shutter, one close control.
 *
 * PRESENTATION ONLY. The stream, the refs and both handlers belong to
 * DashboardClient (which also owns the native Capacitor camera path — that one
 * never renders this: the system camera app opens instead).
 *
 * The two floating rows are offset by the safe-area insets exactly as before
 * (mt-safe / mb-safe from globals.css), so on a notched phone neither sits
 * under a system bar. Logical classes only; no framer-motion — the old fade
 * was the only thing it did, and a camera should open at once.
 */
export interface CameraModalProps {
  t: (key: string) => string
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  onCapture: () => void
  onClose: () => void
}

export default function CameraModal({ t, videoRef, canvasRef, onCapture, onClose }: CameraModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('dash.cameraPoint')}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
    >
      <div className="absolute start-0 end-0 top-8 z-10 mt-safe text-center">
        <p className="text-xs font-black uppercase tracking-widest text-white/50">{t('dash.cameraVision')}</p>
        <h3 className="mt-2 text-base font-bold text-white">{t('dash.cameraPoint')}</h3>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute start-0 end-0 bottom-12 z-10 mb-safe flex items-center justify-center gap-12">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('dash.cameraClose')}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
        >
          <X className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={onCapture}
          aria-label={t('dash.cameraCapture')}
          className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-brand text-white shadow-glow-brand transition-colors hover:bg-brand/90"
        >
          <Camera className="h-10 w-10" />
        </button>

        {/* Balances the close control so the shutter stays centred. */}
        <div aria-hidden className="h-14 w-14" />
      </div>
    </div>
  )
}
