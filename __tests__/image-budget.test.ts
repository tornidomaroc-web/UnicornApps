import {
  MAX_ENCODED_IMAGE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_SOURCE_FILE_BYTES,
  REQUEST_BODY_LIMIT_BYTES,
  JPEG_QUALITY_LADDER,
  decodedByteLength,
  encodedByteLength,
  targetDimensionsFor,
  withinPayloadBudget,
} from '@/lib/image-budget'

/**
 * Base64 inflates by exactly 4/3. Every threshold assertion below turns on that
 * ratio, so it is named once rather than spelled out per test.
 */
const BASE64_RATIO = 4 / 3

const dataUrlOf = (rawBytes: number) => {
  const base64Chars = Math.ceil(rawBytes / 3) * 4
  return `data:image/jpeg;base64,${'A'.repeat(base64Chars)}`
}

describe('encodedByteLength — the quantity the old guard got wrong', () => {
  it('counts the wire cost of the data URL, prefix included', () => {
    const url = 'data:image/jpeg;base64,AAAA'
    expect(encodedByteLength(url)).toBe(url.length)
  })

  it('REGRESSION: 4 MiB of raw file exceeds the body limit once base64-encoded', () => {
    // The predecessor guard was `selectedFile.size > 4 * 1024 * 1024`, compared
    // against the RAW file. A file that just passed it produced a payload over
    // Vercel's limit — the guard admitted exactly what it believed it blocked.
    const justUnderTheOldGuard = 4 * 1024 * 1024 - 1
    expect(justUnderTheOldGuard * BASE64_RATIO).toBeGreaterThan(REQUEST_BODY_LIMIT_BYTES)
    expect(withinPayloadBudget(dataUrlOf(justUnderTheOldGuard))).toBe(false)
  })
})

describe('decodedByteLength', () => {
  it('inverts base64 for a padding-free payload', () => {
    expect(decodedByteLength('data:image/jpeg;base64,AAAA')).toBe(3)
  })

  it.each([
    ['AAAA', 3],
    ['AAA=', 2],
    ['AA==', 1],
  ])('accounts for padding: %s', (b64, expected) => {
    expect(decodedByteLength(`data:image/jpeg;base64,${b64}`)).toBe(expected)
  })

  it('accepts a bare base64 string with no data-url prefix', () => {
    expect(decodedByteLength('AAAA')).toBe(3)
  })

  it('is zero for an empty payload', () => {
    expect(decodedByteLength('data:image/jpeg;base64,')).toBe(0)
  })
})

describe('withinPayloadBudget — where the real threshold sits', () => {
  it('leaves margin under the platform limit for the JSON envelope', () => {
    expect(MAX_ENCODED_IMAGE_BYTES).toBeLessThan(REQUEST_BODY_LIMIT_BYTES)
  })

  it('is exclusive at the boundary and inclusive one byte below', () => {
    expect(withinPayloadBudget('x'.repeat(MAX_ENCODED_IMAGE_BYTES))).toBe(true)
    expect(withinPayloadBudget('x'.repeat(MAX_ENCODED_IMAGE_BYTES + 1))).toBe(false)
  })

  /**
   * Pins the measurement this work was decided on (2026-08-02): one 24 MP phone
   * photo, 4284x5712, 2.7 MB. It passes — but only by ~20%, and JPEG size at
   * fixed dimensions swings several-fold with scene detail. These two cases are
   * the executable record of how narrow that margin is, so nobody re-derives the
   * threshold from scratch or reads "it passed once" as "it passes".
   */
  it('the measured 2.7 MB sample fits — and a 3.4 MB shot of the same scene would not', () => {
    expect(withinPayloadBudget(dataUrlOf(2_700_000))).toBe(true)
    expect(withinPayloadBudget(dataUrlOf(3_400_000))).toBe(false)
  })

  it('bounds the raw size that can ever fit to well under the old 4 MiB guard', () => {
    const largestRawThatFits = Math.floor(MAX_ENCODED_IMAGE_BYTES / BASE64_RATIO)
    expect(largestRawThatFits).toBeLessThan(4 * 1024 * 1024)
    expect(withinPayloadBudget(dataUrlOf(largestRawThatFits - 1024))).toBe(true)
  })
})

describe('targetDimensionsFor', () => {
  it('leaves an image that already fits completely alone', () => {
    expect(targetDimensionsFor(800, 600)).toEqual({ width: 800, height: 600 })
    expect(targetDimensionsFor(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE)).toEqual({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
    })
  })

  it('caps the long edge of the measured 24 MP portrait photo', () => {
    expect(targetDimensionsFor(4284, 5712)).toEqual({ width: 1176, height: 1568 })
  })

  it('caps the long edge in landscape too', () => {
    expect(targetDimensionsFor(5712, 4284)).toEqual({ width: 1568, height: 1176 })
  })

  it('preserves aspect ratio to within a rounded pixel', () => {
    const source = { width: 4284, height: 5712 }
    const out = targetDimensionsFor(source.width, source.height)
    const sourceRatio = source.width / source.height
    expect(out.width / out.height).toBeCloseTo(sourceRatio, 2)
  })

  it('never returns a zero edge for an extreme panorama', () => {
    const out = targetDimensionsFor(20000, 3)
    expect(out.width).toBe(MAX_IMAGE_EDGE)
    expect(out.height).toBeGreaterThanOrEqual(1)
  })

  it.each([
    [0, 100],
    [100, 0],
    [-5, 100],
    [Number.NaN, 100],
    [Number.POSITIVE_INFINITY, 100],
  ])('returns degenerate input %p x %p unchanged rather than throwing', (w, h) => {
    expect(() => targetDimensionsFor(w, h)).not.toThrow()
    expect(targetDimensionsFor(w, h)).toEqual({ width: w, height: h })
  })
})

describe('constants', () => {
  it('the quality ladder descends, so the first fit is the best-looking fit', () => {
    const descending = [...JPEG_QUALITY_LADDER].sort((a, b) => b - a)
    expect([...JPEG_QUALITY_LADDER]).toEqual(descending)
    expect(JPEG_QUALITY_LADDER.every((q) => q > 0 && q <= 1)).toBe(true)
  })

  it('the decode-sanity bound is far above the payload bound — it is not a second payload guard', () => {
    expect(MAX_SOURCE_FILE_BYTES).toBeGreaterThan(MAX_ENCODED_IMAGE_BYTES)
  })
})
