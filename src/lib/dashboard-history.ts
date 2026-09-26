/**
 * The dashboard's history list, updated locally after a generation.
 *
 * The list is seeded from the server (the ten most recent rows). A new
 * generation used to reach it through router.refresh(), which re-renders the
 * server tree — and on this Next.js version the first refresh after the page
 * mounts REMOUNTS it, discarding the results the user just spent a credit on
 * (measured live, 2026-09-26). So the row is now built here from what the
 * client already holds and prepended; the server list replaces it on the next
 * visit. Pure and React-free so it is unit-tested in node.
 */

export interface HistoryRow<TContent> {
  id: string
  created_at: string
  content: TContent
  image_url: string
  platform?: string
}

/** Mirrors the server page's `.limit(10)`; the local list never grows past it. */
export const HISTORY_LIMIT = 10

/**
 * Build the local row for a generation that just succeeded. The id is local
 * and unique per call so React keys never collide with server ids or with a
 * second generation in the same session.
 */
export function localGenerationRow<TContent>(
  content: TContent,
  imageUrl: string,
  platform: string,
  now: Date = new Date(),
  seq: number = now.getTime()
): HistoryRow<TContent> {
  return {
    id: `local-${seq}`,
    created_at: now.toISOString(),
    content,
    image_url: imageUrl,
    platform,
  }
}

/** Newest first, capped at the server's page size. Never mutates the input. */
export function prependGeneration<TContent>(
  history: readonly HistoryRow<TContent>[],
  row: HistoryRow<TContent>,
  limit: number = HISTORY_LIMIT
): HistoryRow<TContent>[] {
  return [row, ...history].slice(0, limit)
}
