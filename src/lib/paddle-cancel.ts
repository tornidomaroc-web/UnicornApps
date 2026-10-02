// Server-side subscription cancellation, used ONLY by POST /api/account/delete.
//
// WHY THIS EXISTS. Deleting the auth user removes the profile, but Paddle keeps
// the subscription and keeps charging the card. A deleted account must stop
// being billed, so the route ends the subscription here, effective at once,
// BEFORE it deletes anything.
//
// SERVER ONLY. PADDLE_API_KEY is a plain (non NEXT_PUBLIC_) env var, so Next
// never inlines it into a client bundle. This module must never be imported
// from a client component, and the key must never appear in a log line: every
// log below names the HTTP status and Paddle's error code, nothing else.
//
// Plain fetch, no SDK: one call (plus one read to confirm an earlier cancel)
// does not justify a dependency.

const BASE_URL = {
  production: 'https://api.paddle.com',
  sandbox: 'https://sandbox-api.paddle.com',
} as const

/** Upper bound for the whole exchange with Paddle, both calls together. */
export const CANCEL_TIMEOUT_MS = 8000

// Statuses that can never charge again. Everything else, including a NULL
// status beside a stored subscription_id (the first charge can store the id
// before subscription.activated writes the status), is treated as billable:
// the safe direction is to ask Paddle, not to assume.
const ENDED = new Set(['canceled', 'expired'])

export type SubscriptionRow = {
  subscription_id: string | null
  subscription_status: string | null
}

/** True when this profile row points at a subscription that may still bill. */
export function isBillable(row: SubscriptionRow | null | undefined): row is SubscriptionRow & {
  subscription_id: string
} {
  if (!row || typeof row.subscription_id !== 'string' || row.subscription_id === '') return false
  return !(row.subscription_status && ENDED.has(row.subscription_status))
}

export type CancelOutcome =
  | { ok: true; already: boolean; scheduled?: boolean }
  | { ok: false; reason: 'NO_KEY' | 'TIMEOUT' | 'NETWORK' | 'PADDLE_ERROR' }

// Same environment switch as the browser checkout in src/lib/paddle.ts:
// anything but 'sandbox' is production.
function baseUrl(): string {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox' ? BASE_URL.sandbox : BASE_URL.production
}

async function paddleErrorCode(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return typeof body?.error?.code === 'string' ? body.error.code : 'unknown'
  } catch {
    return 'unreadable'
  }
}

/**
 * Cancel a Paddle subscription immediately.
 *
 * Success is EITHER a 2xx from the cancel call OR, when Paddle refuses it, a
 * read of the subscription that shows it will never charge again.
 *
 * Measured in Paddle's sandbox (2026-10-02), not assumed:
 *   - active, paused, and active with a cancel already scheduled for period
 *     end: the immediate cancel is ACCEPTED and the subscription is canceled
 *     at once. A scheduled cancel does not block it.
 *   - already canceled (a retried delete, a cancel from the dashboard): the
 *     cancel is refused with 400 `subscription_update_when_canceled`, and the
 *     read-back showing `canceled` is what lets the deletion go ahead.
 * A read-back carrying a scheduled change whose action is `cancel` also counts
 * as success. Paddle did not refuse that case when measured; it stays as a
 * fallback for a refusal we have not seen (a renewal lock, say), because such a
 * subscription cannot charge again either. A scheduled pause does NOT count: a
 * paused subscription can resume and bill. The outcome is read from the
 * subscription itself rather than matched on an error string.
 *
 * Anything else (no key, a timeout, a network failure, a refusal on a live
 * subscription) is a failure and the caller must NOT delete the account.
 */
export async function cancelSubscriptionNow(
  subscriptionId: string,
  timeoutMs: number = CANCEL_TIMEOUT_MS
): Promise<CancelOutcome> {
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) {
    console.error('Subscription cancel: PADDLE_API_KEY is not set')
    return { ok: false, reason: 'NO_KEY' }
  }

  const url = `${baseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${url}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ effective_from: 'immediately' }),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (res.ok) return { ok: true, already: false }

    const cancelCode = await paddleErrorCode(res)

    // Refused. Already canceled is the one refusal that is a success.
    const check = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (check.ok) {
      const body = await check.json().catch(() => null)
      if (body?.data?.status === 'canceled') return { ok: true, already: true }
      if (body?.data?.scheduled_change?.action === 'cancel') {
        return { ok: true, already: true, scheduled: true }
      }
    }

    console.error(
      `Subscription cancel refused: status ${res.status}, code ${cancelCode}; read back status ${check.status}`
    )
    return { ok: false, reason: 'PADDLE_ERROR' }
  } catch (err) {
    if (controller.signal.aborted) {
      console.error(`Subscription cancel: no answer from Paddle within ${timeoutMs}ms`)
      return { ok: false, reason: 'TIMEOUT' }
    }
    // The error's name only: a fetch error message can echo request details.
    console.error('Subscription cancel: request failed', (err as Error)?.name ?? 'Error')
    return { ok: false, reason: 'NETWORK' }
  } finally {
    clearTimeout(timer)
  }
}
