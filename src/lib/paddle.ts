import type { Paddle, PaddleEventData } from '@paddle/paddle-js'

// Singleton Paddle.js handle. initializePaddle() is the call that injects
// Paddle's external checkout script (cdn.paddle.com/.../paddle.js); we run it at
// most once per web session and NEVER on native.
//
// Holds a Promise<Paddle> (never `undefined`): a resolved-but-empty handle is a
// LOAD FAILURE, not an intentional no-op, and is normalised into a rejection
// below so the two can never be confused by a caller.
let paddlePromise: Promise<Paddle> | null = null

// DOM CustomEvent name that getPaddle() re-broadcasts every Paddle checkout event
// on. Paddle.js only supports a single GLOBAL eventCallback, so this bridge lets
// any React component react to the full lifecycle (loaded / completed /
// payment failed / closed-without-paying) by adding a window listener — without
// coupling this module to React or to any component's state.
export const PADDLE_EVENT = 'paddle:checkout'

/**
 * Paddle was supposed to load and did not.
 *
 * This is the OPPOSITE of getPaddle() returning `undefined`. `undefined` means
 * "Paddle is intentionally unavailable here" (server / native / no token) and is
 * a legitimate no-op. A thrown PaddleLoadError means the user asked to pay, we
 * agreed to try, and the attempt broke — the UI owes them an error.
 */
export class PaddleLoadError extends Error {
  // Not declared via ES2022 `cause` (tsconfig target predates it); explicit field.
  readonly reason?: unknown

  constructor(message: string, reason?: unknown) {
    super(message)
    this.name = 'PaddleLoadError'
    this.reason = reason
    // Required for `instanceof` to survive TS's ES5 class-extends-Error downlevel.
    Object.setPrototypeOf(this, PaddleLoadError.prototype)
  }
}

/**
 * Lazily load + initialize Paddle.js and return the handle.
 *
 * Returns `undefined` (a safe no-op for callers) when Paddle must not run:
 *   - on the server (no window), and
 *   - on native (Capacitor) — the Android app is deliberately payment-free, so
 *     Paddle.js must never load there (preserves the Play-compliant
 *     Android-free model). The native guard returns BEFORE the dynamic import,
 *     so the SDK chunk + external script are never even fetched on native.
 *   - when the client-side token env is missing.
 *
 * THROWS PaddleLoadError when the load itself fails (SDK chunk fetch failed, the
 * cdn.paddle.com script 404'd / was blocked, or initializePaddle resolved empty).
 * The SDK rejects in those cases; before, that rejection was memoised in
 * `paddlePromise` and re-thrown at every later click for the rest of the session
 * while the caller `void`-ed it, so the button silently did nothing forever.
 *
 * On failure the cache is dropped so a later click re-enters the load path.
 * CAVEAT — @paddle/paddle-js keeps its OWN module-level `promiseMap` of the CDN
 * load promise and never clears it on rejection, so a same-page retry after a
 * *CDN* failure re-awaits that cached rejection and fails fast rather than
 * refetching. Only a page reload truly retries that case; the copy behind
 * `pricing.banner.error` says so. Dropping our cache is still required (it is
 * what makes the SDK-chunk failure retryable at all, and what keeps this module
 * from being the thing that pins the failure).
 */
export async function getPaddle(): Promise<Paddle | undefined> {
  // GUARD 1: client-only.
  if (typeof window === 'undefined') return undefined

  // GUARD 2: native no-op. Dynamic import so @capacitor/core isn't pulled into
  // any server graph; a failure to load it means we're on plain web.
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) return undefined
  } catch {
    // Not in a Capacitor context → treat as web.
  }

  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  if (!token) {
    console.error('Paddle: NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set')
    return undefined
  }

  if (!paddlePromise) {
    // Dynamic import: the SDK loads only on web, after the native guard above.
    const attempt = import('@paddle/paddle-js')
      .then(({ initializePaddle }) =>
        initializePaddle({
          environment:
            (process.env.NEXT_PUBLIC_PADDLE_ENV as 'production' | 'sandbox') || 'production',
          token,
          // Re-broadcast every checkout event as a DOM CustomEvent (see PADDLE_EVENT).
          eventCallback: (event: PaddleEventData) => {
            window.dispatchEvent(new CustomEvent(PADDLE_EVENT, { detail: event }))
          },
        })
      )
      .then((paddle) => {
        // initializePaddle is typed Paddle | undefined. On the client, empty means
        // the script loaded without exposing the global — a failure, not a no-op.
        if (!paddle) throw new PaddleLoadError('Paddle.js initialized to undefined')
        return paddle
      })

    paddlePromise = attempt
    // Un-memoise on failure so a later click re-enters the load path instead of
    // being served this same rejection out of our cache forever. Guarded on
    // identity so a retry already in flight is never cleared by a stale loser.
    // This .catch() also marks `attempt` handled — without it, a rejection that
    // no caller is awaiting yet would surface as an unhandledrejection.
    attempt.catch(() => {
      if (paddlePromise === attempt) paddlePromise = null
    })
  }

  try {
    return await paddlePromise
  } catch (reason) {
    // Normalise: callers match on PaddleLoadError, never on the SDK's own shapes.
    throw reason instanceof PaddleLoadError
      ? reason
      : new PaddleLoadError('Failed to load Paddle.js', reason)
  }
}
