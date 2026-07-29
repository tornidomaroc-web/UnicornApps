// The dashboard's banner row: what it looks like, and what is allowed to put a
// message in it.
//
// WHY THIS EXISTS
// `DashboardClient.tsx` held an `error` state that nine call sites wrote to and
// no JSX ever read. A 429 or 503 on the generate path set it and the user saw
// nothing at all. Rendering it needed three decisions that are logic, not
// markup, and the suite runs `testEnvironment: 'node'` with no jsdom, so the
// component itself cannot be rendered in a test. Everything that carries a
// decision lives here instead, as pure functions:
//
//   1. what the banner looks like       -> bannerToneClass / checkoutBannerTone
//   2. when the message is cleared      -> nextDashboardError
//   3. whether a message is fit to show -> UserFacingError / toUserMessage
//
// The component keeps only the wiring, which is verified by reading it (and by
// the structural assertions in __tests__/dashboard-banner.test.ts).

import type { CheckoutStatus } from './checkout'

// --- 1. Appearance ---------------------------------------------------------

export type BannerTone = 'success' | 'pending' | 'failure'

/**
 * Shared by every banner on this surface. Extracted so the error banner cannot
 * drift into a second visual language: it is the SAME container and the SAME
 * failure tone the checkout banner already uses.
 */
export const BANNER_CONTAINER_CLASS =
  'max-w-2xl mx-auto mb-8 rounded-2xl border px-6 py-4 text-center text-sm font-medium'

const TONE_CLASS: Record<BannerTone, string> = {
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  // Functional waiting state, not decorative: reads as neither "done" (emerald)
  // nor "failed" (red). Kept from the checkout banner it was written for.
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  failure: 'border-red-500/30 bg-red-500/10 text-red-200',
}

export function bannerToneClass(tone: BannerTone): string {
  return `${BANNER_CONTAINER_CLASS} ${TONE_CLASS[tone]}`
}

export function checkoutBannerTone(status: CheckoutStatus): BannerTone {
  if (status === 'success') return 'success'
  if (status === 'success_pending') return 'pending'
  // 'failed' (payment declined) and 'error' (Paddle never loaded) are both
  // failures; the copy distinguishes them, the tone does not.
  return 'failure'
}

/**
 * The upload / camera / request error channel is always a failure. Named rather
 * than inlined so the component's banner and this module's tests refer to the
 * same thing.
 */
export const ERROR_BANNER_TONE: BannerTone = 'failure'

// --- 2. Lifetime -----------------------------------------------------------

/**
 * Every dashboard interaction that the error banner must react to.
 *
 * The point of enumerating them is the clearing half. The banner is a pure
 * function of the LAST event, with no dependence on the previous value, so a
 * stale message cannot survive any interaction that emits an event. Adding a
 * new interaction without deciding which kind it is fails to compile.
 */
export type DashboardErrorEvent =
  // A generate or refine request is starting.
  | { kind: 'attempt-started' }
  // A new image arrived, or the current one was removed or swapped. Whatever the
  // banner was complaining about no longer describes what is on screen.
  | { kind: 'input-changed' }
  // The image never left the browser: the client-side size pre-check refused it.
  | { kind: 'input-rejected'; message: string }
  // The camera could not hand us a photo.
  | { kind: 'capture-failed'; message: string }
  // A generate or refine request came back not-ok, or never came back.
  | { kind: 'attempt-failed'; message: string }

export const CLEARING_EVENT_KINDS = ['attempt-started', 'input-changed'] as const
export const RAISING_EVENT_KINDS = [
  'input-rejected',
  'capture-failed',
  'attempt-failed',
] as const

export function nextDashboardError(event: DashboardErrorEvent): string | null {
  switch (event.kind) {
    case 'input-rejected':
    case 'capture-failed':
    case 'attempt-failed':
      return event.message
    case 'attempt-started':
    case 'input-changed':
      return null
    default: {
      const unhandled: never = event
      return unhandled
    }
  }
}

// --- 3. Fitness to show ----------------------------------------------------

/**
 * A message that has already been through the translator and is safe to put in
 * front of a user.
 *
 * The dashboard's catch blocks read `err.message` off whatever was thrown. That
 * was invisible while nothing rendered `error`. Rendering it makes the
 * distinction load-bearing: `resolveApiError` returns translated copy, but a
 * dropped connection throws the browser's own `TypeError: Failed to fetch`, and
 * printing that verbatim would put raw English into the Arabic UI. That is the
 * exact bug lib/api-error.ts was written to end.
 *
 * So: only messages WE produced are shown; anything else falls back to the
 * translated generic. Marked with a plain field rather than relying on
 * `instanceof`, which is not reliable across module realms.
 */
export class UserFacingError extends Error {
  readonly userFacing = true
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export function isUserFacingError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { userFacing?: unknown }).userFacing === true
  )
}

/**
 * @param t translator from LanguageContext; falls back to the raw key when the
 *          key is missing, so both `en` and `ar` must define every key used here.
 */
export function toUserMessage(err: unknown, t: (key: string) => string): string {
  return isUserFacingError(err) ? String((err as Error).message) : t('dash.requestFailed')
}

/**
 * Did the user simply back out of the camera?
 *
 * @capacitor/camera reports a cancelled pick by THROWING, through the same
 * channel as a real permission denial. Once the banner renders, every native
 * user who opens the camera and changes their mind is told "Camera access
 * denied. Please allow camera permissions." That is not an error and must be
 * silent.
 *
 * Heuristic, deliberately: Capacitor carries no error code here, only a message
 * ("User cancelled photos app"). Unknown failures do NOT match and are still
 * shown, so the failure mode of this guard is a visible error, never a swallowed
 * one. CI does not cover native at all, so this is reasoning, not proof.
 */
export function isCameraCancellation(err: unknown): boolean {
  const message =
    typeof err === 'object' && err !== null
      ? String((err as { message?: unknown }).message ?? '')
      : ''
  return /cancel/i.test(message)
}
