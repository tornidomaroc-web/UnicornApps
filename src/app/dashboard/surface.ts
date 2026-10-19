/**
 * The dashboard's shared surface vocabulary: the same three class strings the
 * results panel introduced, named once so the input card, the history rows and
 * the results blocks cannot drift into three visual languages.
 *
 * SURFACE is a section-level card; TILE is a row or option inside one; EYEBROW
 * is the small label above a block. Nothing here carries letter-spacing on a
 * surface that renders model output — callers put EYEBROW on UI labels only.
 *
 * Spelled in the semantic tokens (globals.css), which resolve to exactly the
 * previous rounded-3xl / white-10 / white-3%, rounded-2xl / white-5 / white-5%
 * and slate-500, so the reskin retunes the tokens instead of these strings.
 */
export const SURFACE = 'rounded-card border border-line bg-panel'
export const TILE = 'rounded-row border border-line-soft bg-row'
export const EYEBROW = 'text-xs font-black uppercase tracking-widest text-fg-faint'
