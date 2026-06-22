import type { Paddle, PaddleEventData } from '@paddle/paddle-js'

// Singleton Paddle.js handle. initializePaddle() is the call that injects
// Paddle's external checkout script (cdn.paddle.com/.../paddle.js); we run it at
// most once per web session and NEVER on native.
let paddlePromise: Promise<Paddle | undefined> | null = null

// DOM CustomEvent name that getPaddle() re-broadcasts every Paddle checkout event
// on. Paddle.js only supports a single GLOBAL eventCallback, so this bridge lets
// any React component react to the full lifecycle (loaded / completed /
// payment failed / closed-without-paying) by adding a window listener — without
// coupling this module to React or to any component's state.
export const PADDLE_EVENT = 'paddle:checkout'

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
    paddlePromise = import('@paddle/paddle-js').then(({ initializePaddle }) =>
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
  }
  return paddlePromise
}
