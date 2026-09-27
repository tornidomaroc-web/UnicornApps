/**
 * Which language the FIRST paint is in.
 *
 * Pure and React-free, so it is unit-tested in node and can be called from the
 * root layout (server) with the raw cookie value and the raw Accept-Language
 * header. Nothing else decides this: the client provider starts from what the
 * server chose, so the HTML the user first sees is already in that language
 * and never flips after hydration.
 *
 * Precedence:
 *   1. The `ua_lang` cookie, written by the toggle. An explicit choice always
 *      wins, including over a device whose locale later changes.
 *   2. Accept-Language, walked in the browser's own preference order; the first
 *      entry whose primary subtag is one we ship decides. `ar-SA` -> ar,
 *      `fa-IR,en;q=0.8` -> en, `fr,ar;q=0.9` -> ar (fr is not shipped, ar is).
 *   3. English.
 */

export type Lang = 'en' | 'ar'

export const LANG_COOKIE = 'ua_lang'
/** One year. A choice, not a session. */
export const LANG_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

const SUPPORTED: ReadonlySet<string> = new Set<Lang>(['en', 'ar'])

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && SUPPORTED.has(v)
}

/** Accept-Language -> primary subtags, highest q first, browser order on ties. */
export function preferredPrimaryTags(acceptLanguage: string | null | undefined): string[] {
  if (!acceptLanguage) return []
  return acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      const q = qParam ? Number(qParam.slice(2)) : 1
      return { primary: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, index }
    })
    .filter((e) => e.primary && e.primary !== '*' && e.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((e) => e.primary)
}

export function resolveInitialLang(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined
): Lang {
  if (isLang(cookieValue)) return cookieValue
  for (const primary of preferredPrimaryTags(acceptLanguage)) {
    if (isLang(primary)) return primary
  }
  return 'en'
}

/**
 * The Set-Cookie value the client writes on toggle. `Secure` only over https:
 * a Secure cookie set from http://localhost is silently dropped, which would
 * make the toggle look broken in dev while working in production.
 */
export function langCookieString(lang: Lang, secure: boolean): string {
  return `${LANG_COOKIE}=${lang}; Max-Age=${LANG_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`
}
