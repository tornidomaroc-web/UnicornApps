/**
 * The arithmetic behind the image payload bound. Pure — no DOM, no canvas — so
 * jest (testEnvironment: 'node', no jsdom) can prove every number here. The
 * canvas plumbing that USES these lives in @/lib/prepare-image and stays
 * unproven until item 49's visual pass, the same mechanism/render split
 * rtl-letter-spacing.test.ts already uses.
 */

/**
 * Vercel's serverless request body limit. DECIMAL bytes, not MiB — the platform
 * documents 4.5 MB and enforces bytes. Getting this wrong by a factor of 1.048
 * is how the old guard was built.
 */
export const REQUEST_BODY_LIMIT_BYTES = 4_500_000

/**
 * Room left for the rest of the JSON envelope: the `platform` and `lang` keys,
 * the quoting, and the `data:image/jpeg;base64,` prefix. Deliberately generous —
 * being under the ceiling by 300 KB costs nothing, and being over it costs the
 * whole request with a 413 the user cannot act on.
 */
export const PAYLOAD_MARGIN_BYTES = 300_000

/** What the image string itself may weigh on the wire. */
export const MAX_ENCODED_IMAGE_BYTES = REQUEST_BODY_LIMIT_BYTES - PAYLOAD_MARGIN_BYTES

/**
 * Long-edge cap, in pixels. Gemini resamples to roughly this before it looks at
 * anything, so pixels above it are bought with input tokens, mobile upload time
 * and latency against the 60s budget (FUNCTION_MAX_DURATION_S) and buy no
 * accuracy back. A 24 MP phone photo is 4284x5712; this takes it to 1176x1568.
 */
export const MAX_IMAGE_EDGE = 1568

/**
 * Re-encode qualities, tried in order, first one under budget wins. Starts at
 * 0.85 rather than the plugin's 0.9 because after a downscale to 1568px the
 * difference is not visible and the file is materially smaller.
 */
export const JPEG_QUALITY_LADDER = [0.85, 0.7, 0.55] as const

/**
 * Decode-sanity bound on a chosen FILE, before we ever hand it to the decoder.
 * This is not the payload guard — the payload guard is MAX_ENCODED_IMAGE_BYTES,
 * applied after downscaling. This one exists only so a 100 MP export or a PNG
 * from a desktop does not OOM the WebView during decode.
 */
export const MAX_SOURCE_FILE_BYTES = 20_000_000

/**
 * Bytes this string costs inside the JSON body. A data URL is ASCII (base64
 * alphabet plus the prefix), so its character count IS its byte count and needs
 * no JSON escaping.
 *
 * THIS IS THE QUANTITY THAT MATTERS. The predecessor guard compared the raw
 * File.size against a limit that applies to the base64 payload, which is ~1.37x
 * larger — so it admitted payloads it believed it was rejecting.
 */
export function encodedByteLength(dataUrl: string): number {
  return dataUrl.length
}

/** Size of the underlying image bytes, i.e. what the file weighed before base64. */
export function decodedByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (!base64) return 0
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export function withinPayloadBudget(dataUrl: string): boolean {
  return encodedByteLength(dataUrl) <= MAX_ENCODED_IMAGE_BYTES
}

/**
 * Fit within a MAX_IMAGE_EDGE box, preserving aspect ratio. Returns the input
 * unchanged when it already fits, so an image that needs nothing is never
 * re-encoded — a JPEG round-trip is generation loss, and paying it for no size
 * win would be strictly worse than doing nothing.
 *
 * Degenerate input (zero, negative, NaN, Infinity) is returned as-is rather
 * than thrown on: the caller's job is to bound a payload, not to police a
 * decoder, and a throw here would take down generation for an image the browser
 * was willing to decode.
 */
export function targetDimensionsFor(
  width: number,
  height: number
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return { width, height }
  if (width <= 0 || height <= 0) return { width, height }

  const longest = Math.max(width, height)
  if (longest <= MAX_IMAGE_EDGE) return { width, height }

  const scale = MAX_IMAGE_EDGE / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
