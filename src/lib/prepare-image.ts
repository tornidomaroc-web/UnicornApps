import {
  JPEG_QUALITY_LADDER,
  targetDimensionsFor,
  withinPayloadBudget,
} from '@/lib/image-budget'

/**
 * THE SINGLE CHOKE POINT. Every image that reaches /api/generate passes through
 * here, whichever of the three inputs produced it — file upload, the browser
 * webcam canvas, or the native Capacitor camera.
 *
 * WHY ONE CHOKE POINT AND NOT THREE GUARDS: three guards is what this code had.
 * Upload checked File.size against 4 MiB (the wrong quantity — see
 * encodedByteLength), the webcam wrote toDataURL at full videoWidth/videoHeight
 * with no check at all, and the native camera returned a full-resolution
 * quality-90 DataUrl with no check at all. Any future fourth input inherits the
 * bound by construction rather than by someone remembering.
 *
 * FAILS OPEN, DELIBERATELY, and the same way lib/rate-limit.ts does. Every error
 * path returns the original data URL untouched. A bug in a size optimiser must
 * never be the reason a generation cannot be attempted; if an oversized payload
 * gets through, the server answers 413 and api-error.ts maps that to the
 * translated dash.filesizeError, which is exactly the behaviour that exists
 * today. This can only improve on that path, never replace its backstop.
 */
export async function prepareImageForUpload(dataUrl: string): Promise<string> {
  // SSR and any non-browser caller: nothing to do, and document/Image do not exist.
  if (typeof document === 'undefined' || typeof Image === 'undefined') return dataUrl

  try {
    const img = await loadImage(dataUrl)
    const { width, height } = targetDimensionsFor(img.naturalWidth, img.naturalHeight)

    // Already small enough in both dimensions and on the wire: return it
    // untouched rather than pay a JPEG round-trip for nothing.
    const sameSize = width === img.naturalWidth && height === img.naturalHeight
    if (sameSize && withinPayloadBudget(dataUrl)) return dataUrl

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, width, height)

    // JPEG, not PNG: the generate route hardcodes mimeType 'image/jpeg' when it
    // builds the Gemini part, so emitting JPEG here makes that declaration true
    // for a PNG upload as well, which it was not before.
    let smallest = dataUrl
    for (const quality of JPEG_QUALITY_LADDER) {
      const candidate = canvas.toDataURL('image/jpeg', quality)
      if (withinPayloadBudget(candidate)) return candidate
      smallest = candidate
    }

    // Nothing on the ladder fit. Send the smallest we produced and let the 413
    // backstop handle it — still strictly better than sending the original.
    return smallest
  } catch {
    return dataUrl
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('prepare-image: decode failed'))
    img.src = src
  })
}
