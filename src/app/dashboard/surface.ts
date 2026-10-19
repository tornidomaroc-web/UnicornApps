/**
 * The dashboard's shared surface vocabulary: the same three class strings the
 * results panel introduced, named once so the input card, the history rows and
 * the results blocks cannot drift into three visual languages.
 *
 * SURFACE is a section-level card (not tappable: a soft drop and a faint rim).
 * BLOCK is the same card kept flat, for generated results: the content is the
 * point, so it gets no depth at all.
 * TILE is a static block inside one (a hairline ring, no shadow). ROW is a
 * tappable row or option (the clay stack: gradient body, lit top rim, inner
 * shade, tight contact shadow, press transform). EYEBROW is the small label
 * above a block: no uppercase and no letter-spacing, so Arabic is never
 * touched. Nothing here carries letter-spacing on a surface that renders model
 * output.
 *
 * Each keeps a transparent 1px border so it occupies the same box as before.
 * The flat background colour under each gradient is what lite mode shows.
 */
export const SURFACE = 'rounded-card border border-transparent bg-panel shadow-container'
export const TILE = 'rounded-row border border-line bg-tile'
export const BLOCK = 'rounded-card border border-transparent bg-panel'
export const ROW = 'press rounded-row border border-transparent bg-row bg-fill-tap shadow-tap'
export const EYEBROW = 'text-sm font-bold text-fg-link'
