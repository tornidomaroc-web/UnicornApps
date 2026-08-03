/**
 * The diagnostic emitted when Gemini's response fails JSON.parse.
 *
 * WHY THIS EXISTS: both routes clean the model's text with a fence regex and then
 * logged only the CLEANED string. So the one log line we get for a parse failure
 * had already had the prime suspect's fingerprints wiped off it — no log could
 * ever tell us whether the regex caused the failure, masked it, or was innocent.
 * Every fence conclusion drawn from a log before this shipped is untrustworthy
 * for that reason, not because the logs were missing.
 *
 * WHY IT IS NOT JUST `console.error(raw, cleaned)`. Three properties of the
 * platform make that naive version a bad instrument:
 *
 *  1. ONE LINE, ALWAYS. Model output is full of newlines, and a multi-line
 *     console.error becomes several separate log rows that can interleave with
 *     other requests. JSON.stringify escapes the newlines, so the whole
 *     diagnostic survives as a single copy-pasteable row.
 *  2. THE TAIL IS THE EVIDENCE. The leading hypothesis for a parse failure is a
 *     response truncated at the 8192-token ceiling, and truncation is visible
 *     only at the END of the string. A raw dump risks being cut off by the
 *     platform's own per-line limit, which would keep the head and throw away
 *     exactly the part worth reading. Head AND tail are captured explicitly.
 *  3. RETENTION IS ~1 HOUR. There is no second look and no re-running the event,
 *     so the fields have to be chosen before it happens, not after.
 *
 * CONTENT POSTURE. This carries less model output than the line it replaces,
 * which dumped `cleanedText` in full and unbounded. No user id, no email, no
 * credential, no image bytes and no refine instruction is passed in. What can
 * still appear inside the slices is Gemini's own output — the listing copy — the
 * same class of bytes that was already being logged, now capped. The
 * `usage_events` table stays content-free; nothing here goes near it.
 */

/** Unmistakable, greppable, and identical in both routes. One grep finds every one. */
export const PARSE_FAILURE_TAG = 'gemini-parse-failure'

/**
 * Characters kept from each end of the raw text. 1500 + 1500 plus the metadata
 * stays comfortably inside a single platform log line, which is the constraint
 * that sets it — not the size of a response.
 */
export const RAW_SLICE_CHARS = 1500

export type ParseFailureInput = {
  route: 'generate' | 'refine'
  /** Gemini's text EXACTLY as returned, before any cleaning. */
  raw: string
  /** The string that was actually handed to JSON.parse. */
  cleaned: string
  /** candidates[0].finishReason. 'MAX_TOKENS' here settles the truncation question outright. */
  finishReason?: unknown
}

/**
 * Build the single-line diagnostic.
 *
 * NEVER THROWS. This is called from inside the parse-failure catch on a path that
 * must stay a 422: a throw here would unwind through the route's `finally` and
 * turn a clean formatting error into a 500. Any fault degrades to a marker line
 * rather than propagating.
 */
export function formatParseFailure(input: ParseFailureInput): string {
  try {
    const raw = typeof input.raw === 'string' ? input.raw : ''
    const cleaned = typeof input.cleaned === 'string' ? input.cleaned : ''
    const head = raw.slice(0, RAW_SLICE_CHARS)
    // The tail is taken from what the HEAD DID NOT ALREADY TAKE, so the two can
    // never overlap and a response of up to 2x the slice is reported entire, with
    // nothing elided. Slicing the tail off the full string instead looks
    // equivalent and is not: it duplicates the middle of a short response, or —
    // guarded against that with a length test — invents a gap in one that fits.
    const tail = raw.slice(RAW_SLICE_CHARS).slice(-RAW_SLICE_CHARS)
    const elidedChars = Math.max(0, raw.length - head.length - tail.length)

    return `${PARSE_FAILURE_TAG} ${JSON.stringify({
      route: input.route,
      rawLength: raw.length,
      cleanedLength: cleaned.length,
      /**
       * What the cleaning step removed, measured rather than re-derived. Zero
       * EXONERATES the fence regex for this failure without anyone having to
       * reason about the pattern; non-zero says how much it took. Deliberately
       * computed from the two strings and not by re-running the regex, so this
       * stays correct if the routes' pattern ever changes.
       */
      strippedChars: raw.length - cleaned.length,
      finishReason: typeof input.finishReason === 'string' ? input.finishReason : 'unknown',
      elidedChars,
      rawHead: head,
      rawTail: tail,
    })}`
  } catch {
    return `${PARSE_FAILURE_TAG} {"route":"${input?.route ?? 'unknown'}","diagnosticFailed":true}`
  }
}
