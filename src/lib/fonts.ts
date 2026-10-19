import { Rubik } from 'next/font/google'

// Heading face, self-hosted by next/font (downloaded at build time, served
// from our own origin; no third-party request at runtime). One weight only:
// headings are 700, and a heavier request falls back to it.
//
// Two instances so each language preloads only what it uses: the Latin file
// is preloaded (every page has an English heading by default), the Arabic file
// is not, and its unicode-range means it is fetched only when Arabic glyphs
// actually render in a heading. The Arabic instance carries no metric
// fallback: it is first in --ua-font-head, and a local fallback there would
// catch Latin glyphs before the Latin file (see globals.css).
export const rubik = Rubik({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-rubik',
  display: 'swap',
})

export const rubikArabic = Rubik({
  subsets: ['arabic'],
  weight: ['700'],
  variable: '--font-rubik-ar',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})
