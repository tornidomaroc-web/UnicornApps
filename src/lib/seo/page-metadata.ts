import type { Metadata } from 'next'

/**
 * The search title and description of every public page, in one place.
 *
 * English only: the site serves Arabic on the same URLs (chosen per request by
 * the language cookie or the browser), so a crawler sees the English page.
 *
 * Each route reads its entry from a server file next to it: a `layout.tsx`
 * where the page itself is a client component (home, features, about, login),
 * and the page's own `metadata` export on /pricing. The rules every entry must
 * follow (length, distinct, honest wording) are pinned in
 * __tests__/page-metadata.test.ts.
 *
 * The home, features, about and login entries are also served inside the
 * Android app, so they never mention buying anything. Only /pricing, which the
 * app can never reach, talks about packs and plans.
 */
export type PublicPage = 'home' | 'features' | 'about' | 'pricing' | 'login'

export const PAGE_METADATA: Record<PublicPage, { title: string; description: string }> = {
  home: {
    title: 'UnicornApps: AI Product Descriptions from One Photo',
    description:
      'Upload one product photo and get a product page in Arabic or English: title, meta description, description, bullets, Shopify HTML, a social hook and hashtags.',
  },
  features: {
    title: 'Features: What One Product Photo Gives You | UnicornApps',
    description:
      'One photo, one credit: a search-ready title, a meta description, a product description, Amazon-style bullets, Shopify HTML, a TikTok or Reels hook and hashtags.',
  },
  about: {
    title: 'About UnicornApps | A Small AI Tool for Product Copy',
    description:
      'UnicornApps turns a product photo into the description an online store needs, in Arabic or English. Built for solo sellers who list and write on their own.',
  },
  pricing: {
    title: 'Pricing: Credits for AI Product Descriptions | UnicornApps',
    description:
      'Every account starts with three free credits, no card needed. Then buy a one-time credit pack or a monthly plan. One generation or one change costs one credit.',
  },
  login: {
    title: 'Sign In or Create a Free Account | UnicornApps',
    description:
      'Sign in to UnicornApps, or create a free account, and turn a product photo into a title, a description, bullet points and Shopify HTML in Arabic or English.',
  },
}

/** The Next.js metadata for one public page. */
export function pageMetadata(page: PublicPage): Metadata {
  const { title, description } = PAGE_METADATA[page]
  if (page === 'login') {
    // A sign-in form has nothing to rank for, and its ?mode=, ?error= and
    // ?notice= variants would each be a thin duplicate. Kept out of the index;
    // links on it are still followed.
    return { title, description, robots: { index: false, follow: true } }
  }
  return { title, description }
}
