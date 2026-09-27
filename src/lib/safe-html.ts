import DOMPurify from 'dompurify'

/**
 * The ONE gate between model-produced HTML and the DOM.
 *
 * `shopifyHtml` comes back from Gemini and is rendered with
 * dangerouslySetInnerHTML in the Shopify tab and the Shopify preview mock-up.
 * What the model writes is steered by the uploaded image (text printed on a
 * label is read and echoed) and by the refine instruction, and the result is
 * stored in `generations.content` and re-rendered every time a history row is
 * reopened. Nothing else stands in the way: the site sends no
 * Content-Security-Policy, and the Supabase session cookie is readable from
 * page script. So a script that reaches the DOM here runs with the user's
 * session.
 *
 * The allowlist is the shape the prompt asks for (<h2>, <p>, a <ul> of
 * features) plus the inline emphasis the model tends to add. No attributes at
 * all: there is no legitimate href, src, style or on* in a product blurb.
 *
 * Runs in the browser only. Without a DOM, DOMPurify has no `sanitize`, and the
 * only correct answer is "render nothing" — never the raw string.
 */
const ALLOWED_TAGS = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br']

export function sanitizeModelHtml(html: string): string {
  if (typeof window === 'undefined' || !DOMPurify.isSupported) return ''
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}
