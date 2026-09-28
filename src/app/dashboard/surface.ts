/**
 * The dashboard's shared surface vocabulary: the same three class strings the
 * results panel introduced, named once so the input card, the history rows and
 * the results blocks cannot drift into three visual languages.
 *
 * SURFACE is a section-level card; TILE is a row or option inside one; EYEBROW
 * is the small label above a block. Nothing here carries letter-spacing on a
 * surface that renders model output — callers put EYEBROW on UI labels only.
 */
export const SURFACE = 'rounded-3xl border border-white/10 bg-white/[0.03]'
export const TILE = 'rounded-2xl border border-white/5 bg-white/5'
export const EYEBROW = 'text-xs font-black uppercase tracking-widest text-slate-500'
