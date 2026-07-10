// Wall-clock budget for the two billable Gemini routes (/api/generate,
// /api/refine).
//
// WHY THIS EXISTS
// Both routes reserve a credit (reserve_credit) BEFORE calling Gemini, and
// refund it from a `finally` block if the call fails. That contract has one
// hole: neither Gemini call had a timeout. A hung call runs until the platform
// kills the function, and a platform kill is not a JavaScript exception — the
// `finally` never runs, refund_credit is never called, and the user's reserved
// credit is silently gone with no content to show for it.
//
// The fix is to stop the call OURSELVES, a little before the platform would,
// so the failure arrives as an ordinary promise rejection. `finally` then runs
// normally and the credit comes back.
//
// WHAT THIS DOES NOT DO
// Aborting is a client-side operation. It does NOT cancel the request inside
// Google's service, and the usage is still billed to our API key. This module
// protects the user's CREDIT and their wait time. It does not protect quota.

/**
 * Must equal the `export const maxDuration` literal in BOTH route files.
 *
 * Next.js requires `maxDuration` to be a statically analyzable literal, so it
 * cannot be imported from here — the routes hardcode `60` and a unit test
 * asserts the literal still matches this constant. If the two ever drift, the
 * deadline arithmetic below silently aims at the wrong wall; the test is what
 * makes that drift loud.
 *
 * 60 is also the ceiling Vercel's deploy validation enforces on this project
 * (fluid compute off). If the plan ever changes, the deploy fails loudly rather
 * than this number quietly being wrong.
 */
export const FUNCTION_MAX_DURATION_S = 60

/**
 * How much of the budget we refuse to spend on Gemini, reserved for unwinding.
 *
 * Sized against everything that must still happen AFTER we give up, plus one
 * term that is easy to miss:
 *
 *   1. Cold-start skew (~0–1500ms). The platform's clock starts at INVOCATION,
 *      which includes Node boot and module init. Our clock starts at handler
 *      entry, strictly later. So our deadline lands that much closer to the
 *      real kill than the arithmetic suggests. This term is invisible if you
 *      size the margin against only the response write.
 *   2. The refund_credit Supabase RPC (~1000ms p99; a cold TLS handshake to
 *      Supabase is the dominant cost, not the query).
 *   3. Response serialization + write (~250ms).
 *
 * 1500 + 1000 + 250 = 2750ms worst-case, rounded up to 4000ms for slack.
 *
 * Cost of being generous: 4s of a 60s budget (6.7%) that Gemini cannot use.
 * Cost of being stingy: the exact bug this module exists to fix. Raising this
 * is cheap; lowering it is not.
 *
 * LIMIT: this margin cannot save us from a refund_credit RPC that itself hangs.
 * Nothing here bounds Supabase. The margin makes the refund overwhelmingly
 * likely to complete, not certain to.
 */
export const DEADLINE_MARGIN_MS = 4_000

/**
 * The least remaining budget worth starting a Gemini attempt with.
 *
 * A flash-class generateContent with maxOutputTokens: 8192 — and, on /generate,
 * an image to read — does not plausibly finish in a couple of seconds. Starting
 * an attempt we cannot finish burns the user's wait and returns nothing.
 *
 * 8000ms is a JUDGEMENT, not a measurement: this project has no latency or
 * token telemetry (see CLAUDE.md backlog item 23), so no honest number exists
 * yet. Revisit once a real p50/p95 for these two calls has been captured.
 */
export const SINGLE_ATTEMPT_FLOOR_MS = 8_000

/**
 * Thrown when the wall-clock budget is exhausted. Crucially an ORDINARY Error:
 * it unwinds through the routes' `finally`, so the reserved credit is refunded
 * before the outer catch turns it into a 503.
 */
export class DeadlineExceededError extends Error {
  constructor(message = 'AI request budget exhausted') {
    super(message)
    this.name = 'DeadlineExceededError'
  }
}

export interface AttemptSignal {
  /** Aborts when the deadline is reached. */
  signal: AbortSignal
  /** Releases the underlying timer. Always call this in a `finally`. */
  cancel: () => void
}

export interface Deadline {
  /** Milliseconds left before the deadline. May be <= 0. */
  remainingMs(): number
  /**
   * Returns the remaining budget, or throws DeadlineExceededError if less than
   * `floorMs` is left. Call this BEFORE starting an attempt.
   */
  assertBudget(floorMs?: number): number
  /**
   * A signal that aborts exactly at the deadline.
   *
   * Only ever call this AFTER assertBudget(), so the signal is never already
   * aborted at construction: @google/generative-ai wires a caller-supplied
   * signal with addEventListener('abort', …) (dist/index.js:449), which never
   * fires for an already-aborted signal — the request would proceed unbounded.
   */
  attemptSignal(): AttemptSignal
}

/**
 * @param maxDurationS the route's `maxDuration`, in seconds.
 * @param startedAtMs  handler-entry timestamp. Injectable for tests.
 */
export function createDeadline(
  maxDurationS: number = FUNCTION_MAX_DURATION_S,
  startedAtMs: number = Date.now()
): Deadline {
  const deadlineAtMs = startedAtMs + maxDurationS * 1_000 - DEADLINE_MARGIN_MS

  const remainingMs = () => deadlineAtMs - Date.now()

  return {
    remainingMs,

    assertBudget(floorMs: number = SINGLE_ATTEMPT_FLOOR_MS): number {
      const remaining = remainingMs()
      if (remaining < floorMs) {
        throw new DeadlineExceededError(
          `Only ${remaining}ms of budget remain; need ${floorMs}ms to start an attempt`
        )
      }
      return remaining
    },

    attemptSignal(): AttemptSignal {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(0, remainingMs()))
      return {
        signal: controller.signal,
        // Without this, a successful fast call leaves a ~50s timer pending on a
        // warm, reused serverless process.
        cancel: () => clearTimeout(timer),
      }
    },
  }
}
