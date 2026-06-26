/*
CREATE TABLE public.processed_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
*/
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { creditsForPrice, planForPrice } from '@/lib/billing'

export async function POST(req: NextRequest) {
  try {
    // 1. Get raw body for signature verification
    const rawBody = await req.text()

    // 2. Verify signature. Paddle Billing authenticates webhooks with the
    // `Paddle-Signature` header (HMAC-SHA256 over `${ts}:${rawBody}`), verified
    // below — that HMAC is the SOLE authenticator. (A previous `x-signature`
    // presence gate here was dead Lemon Squeezy convention: Paddle never sends
    // that header, so it 401'd every real Paddle event before this real check
    // ran. Removed. It checked only header presence, never any secret, so it
    // added no security.)
    const secret = process.env.PADDLE_WEBHOOK_SECRET
    if (!secret) {
      console.error('Webhook Error: PADDLE_WEBHOOK_SECRET is not configured')
      return new NextResponse('Server Configuration Error', { status: 500 })
    }

    const paddleHeader = req.headers.get('paddle-signature') || ''
    const ts = paddleHeader.match(/ts=(\d+)/)?.[1] || ''
    const h1 = paddleHeader.match(/h1=([a-f0-9]+)/)?.[1] || ''

    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(`${ts}:${rawBody}`).digest('hex')

    if (h1 !== digest) {
      console.error('Webhook Error: Invalid signature')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 3. Parse the event
    const payload = JSON.parse(rawBody)
    const eventType = payload.event_type
    const data = payload.data
    const customData = data?.custom_data || data?.passthrough
    const eventId = payload.event_id

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Webhook Error: Supabase credentials missing')
      return new NextResponse('Internal Error', { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 4. Idempotency fast-path: if this event_id was already processed
    // successfully, skip and acknowledge. The matching INSERT is deferred to
    // AFTER the handler succeeds (below), so a mid-handler failure is NOT
    // recorded as processed and Paddle's retry can re-run the handler.
    if (eventId) {
      const { data: existingEvent } = await supabase
        .from('processed_webhook_events')
        .select('id')
        .eq('event_id', eventId)
        .single()

      if (existingEvent) {
        console.log(`Duplicate event ignored: ${eventId}`)
        return NextResponse.json({ received: true }, { status: 200 })
      }
    }

    console.log(`Webhook Received: ${eventType}`, { customData })

    // 5. Dispatch. Contract for Pieces 2-4 to slot into:
    //   - A handler that needs Paddle to RETRY must THROW; the catch below
    //     turns that into a 500 and the event is left unrecorded.
    //   - Reaching the end of dispatch normally — whether the event was handled
    //     or intentionally ignored (unknown type, non-actionable payload) — is a
    //     success: the event is recorded as processed and we return 200. A
    //     handler that hits a NON-retryable condition (unknown price, unresolved
    //     user) must `return` from its helper, not throw, so it still records.
    if (eventType === 'transaction.completed') {
      await handleTransactionCompleted(supabase, data, customData)
    } else if (typeof eventType === 'string' && eventType.startsWith('subscription.')) {
      await handleSubscriptionLifecycle(supabase, eventType, data, customData)
    } else if (eventType === 'adjustment.created' || eventType === 'adjustment.updated') {
      await handleRefundAdjustment(supabase, data)
    } else {
      // Unknown / not-yet-handled event type: intentionally ignored.
      console.log(`Webhook event ignored (no handler): ${eventType}`)
    }

    // 6. Handler completed without throwing → record as processed, then ack.
    if (eventId) {
      await supabase.from('processed_webhook_events').insert({ event_id: eventId })
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    // Genuine handler failure: do NOT record the event as processed. Return 500
    // so Paddle retries and the handler gets another chance to succeed.
    console.error('Webhook Exception:', error.message)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// transaction.completed — fires for both a one-time credit pack and every
// subscription billing cycle (first charge + each renewal). Grants credits
// exactly once per Paddle transaction.
//
// THROW only on RETRYABLE failures (a DB/grant call rejects) so the POST catch
// returns 500 and Paddle retries. For NON-retryable conditions (unknown price,
// unresolved user) just `return`: the caller records the event and returns 200,
// because retrying would not change the outcome.
async function handleTransactionCompleted(
  supabase: any,
  data: any,
  customData: any
): Promise<void> {
  const transactionId = data?.id
  // Distinguisher: a non-null subscription_id means this charge belongs to a
  // subscription cycle; null means a one-time pack. This is the SOLE decider.
  const subscriptionId = data?.subscription_id ?? null
  const isSubscriptionCycle = subscriptionId != null
  const type = isSubscriptionCycle ? 'subscription_cycle' : 'pack'

  // data.origin only CORROBORATES — it never decides. We warn (don't act) ONLY on
  // the genuinely contradictory direction: a charge that CLAIMS a subscription
  // origin yet carries no subscription_id. Layer-2 capture (2026-06-26) confirmed a
  // subscription's FIRST charge arrives with origin "web" (not "subscription_*")
  // while subscription_id IS present — that pairing is legitimate (renewals carry
  // "subscription_recurring"), so it must NOT warn. The old symmetric check fired a
  // false alarm on every real first subscription purchase.
  const origin = data?.origin
  if (typeof origin === 'string' && origin.startsWith('subscription_') && !isSubscriptionCycle) {
    console.warn(
      `Webhook: origin "${origin}" claims a subscription charge but subscription_id is null on txn ${transactionId}; trusting subscription_id (treating as pack).`
    )
  }

  // Credits are derived SERVER-SIDE from the price id — NEVER from custom_data,
  // so a tampered checkout cannot inflate a grant.
  const priceId = data?.items?.[0]?.price?.id ?? null
  const credits = creditsForPrice(priceId)
  if (credits <= 0) {
    // Unknown/misconfigured price id. Not retryable — fail safe, grant nothing.
    console.warn(
      `Webhook: unknown/misconfigured price id "${priceId}" on txn ${transactionId} — granting nothing.`
    )
    return
  }

  // amount_cents: Paddle sends grand_total as a STRING of minor units (USD
  // cents). Coerce to Number; null-guard so a missing/garbage total stores null
  // rather than 0 or NaN.
  const rawTotal = data?.details?.totals?.grand_total
  const parsedTotal = rawTotal == null ? null : Number(rawTotal)
  const amountCents = parsedTotal != null && Number.isFinite(parsedTotal) ? parsedTotal : null

  // User resolution: custom_data first; for a subscription cycle, fall back to
  // the profile that already owns this subscription_id.
  let userId: string | null = customData?.user_id ?? null
  if (!userId && isSubscriptionCycle && subscriptionId) {
    const { data: owner } = await supabase
      .from('profiles')
      .select('id')
      .eq('subscription_id', subscriptionId)
      .single()
    userId = owner?.id ?? null
  }

  if (!userId) {
    // First-cycle chicken/egg: the profile may not carry subscription_id until
    // subscription.activated (Piece 3) writes it, so the fallback can miss the
    // very first charge if custom_data is also absent there. Not retryable here
    // (a retry won't add custom_data); record + 200. Piece 3 closes this gap by
    // persisting subscription_id on activation.
    console.error(
      `Webhook: could not resolve user for txn ${transactionId} (subscription_id=${subscriptionId}).`
    )
    return
  }

  if (!transactionId) {
    // Without data.id we can't ledger-guard, so we can't grant exactly once.
    console.error('Webhook: transaction.completed missing data.id — cannot ledger-guard a grant.')
    return
  }

  // Atomic, ledger-guarded, exactly-once grant (Piece 5). The ledger INSERT and
  // the profiles.credits increment commit-or-fail TOGETHER inside one Postgres
  // transaction (grant_credits_for_purchase), closing the Piece-2 lost-grant
  // window where the upsert committed but a separate addCredits then threw.
  // paddle_transaction_id is UNIQUE with ON CONFLICT DO NOTHING, so only the
  // FIRST delivery grants; the RPC returns false for duplicates.
  const { data: granted, error: grantError } = await supabase.rpc('grant_credits_for_purchase', {
    p_user_id: userId,
    p_paddle_transaction_id: transactionId,
    p_type: type,
    p_credits: credits,
    p_amount_cents: amountCents,
  })

  // rpc() surfaces DB failures as { error } (it does not throw on its own). A DB
  // failure here IS retryable — throw so the POST catch returns 500, the event
  // is left unrecorded, and Paddle retries.
  if (grantError) {
    throw new Error(
      `grant_credits_for_purchase failed for txn ${transactionId}: ${grantError.message}`
    )
  }

  if (granted) {
    console.log(`Granted ${credits} credits to ${userId} (txn ${transactionId}, ${type}).`)
  } else {
    console.log(`Duplicate transaction ${transactionId} — credits already granted; skipping.`)
  }

  // Opportunistically persist subscription_id on the profile so future cycles
  // resolve via the fallback above even if custom_data is dropped on renewals.
  // Idempotent (same value), so it's safe on retries and duplicate deliveries.
  if (isSubscriptionCycle && subscriptionId) {
    await supabase.from('profiles').update({ subscription_id: subscriptionId }).eq('id', userId)
  }
}

// subscription.* lifecycle. One DRY handler driven by a per-event rule. Each
// rule writes ONLY the profile columns that event authoritatively owns, so
// out-of-order delivery converges (a later 'updated' can't clobber a field a
// different event owns; see Part 4 of the plan). The webhook only WRITES
// subscription_status / subscription_id / current_period_end / plan — it never
// reads entitlement (computeIsPro is derived elsewhere at read time).
//
//   status:        fixed subscription_status to write (omit if fromDataStatus)
//   fromDataStatus: take subscription_status from the payload's data.status
//   setSubscriptionId: store subscription_id (= data.id) — the resolution key
//   setPlan:       refresh plan from planForPrice(price id), when a price is present
//   setPeriodEnd:  write current_period_end from current_billing_period.ends_at,
//                  NULL-GUARDED (only when present)
const SUBSCRIPTION_LIFECYCLE: Record<
  string,
  {
    status?: string
    fromDataStatus?: boolean
    setSubscriptionId?: boolean
    setPlan?: boolean
    setPeriodEnd?: boolean
  }
> = {
  // First activation (and 'created', treated identically): seed the full row.
  'subscription.activated': { status: 'active', setSubscriptionId: true, setPlan: true, setPeriodEnd: true },
  'subscription.created': { status: 'active', setSubscriptionId: true, setPlan: true, setPeriodEnd: true },
  // Generic mutation: trust the payload's own status, refresh period + plan.
  'subscription.updated': { fromDataStatus: true, setPlan: true, setPeriodEnd: true },
  // Scheduled cancel: status only. current_billing_period is NULL on canceled
  // (Correction A), so we must NOT touch current_period_end — the paid-through
  // value already stored keeps the user Pro until it elapses.
  'subscription.canceled': { status: 'canceled' },
  // Dunning grace: still has a paid-through period.
  'subscription.past_due': { status: 'past_due', setPeriodEnd: true },
  // Paused: status only (no active billing period to write).
  'subscription.paused': { status: 'paused' },
  // Resume after pause: back to active with a fresh period.
  'subscription.resumed': { status: 'active', setPeriodEnd: true },
}

// Statuses subscription.updated is allowed to write. This is the subset of
// profiles_subscription_status_chk (active/past_due/canceled/paused/expired) that
// we actually MODEL — 'expired' is excluded because Paddle Billing never emits it
// (see billing.ts: expiry is timestamp-driven, not a status). Keeping this list
// strict means 'updated' can never hand the DB a value its CHECK constraint would
// reject and throw on. 'trialing' is intentionally absent: we don't offer trials,
// so it's IGNORED (see handler) rather than mapped to 'active' — that entitlement
// call belongs in computeIsPro, not the webhook.
const UPDATED_STATUS_WHITELIST = new Set(['active', 'past_due', 'canceled', 'paused'])

async function handleSubscriptionLifecycle(
  supabase: any,
  eventType: string,
  data: any,
  customData: any
): Promise<void> {
  const rule = SUBSCRIPTION_LIFECYCLE[eventType]
  if (!rule) {
    // A subscription.* event we don't model yet — intentionally ignored.
    console.log(`Webhook subscription event ignored (no handler): ${eventType}`)
    return
  }

  // For subscription.* the object IS the subscription, so data.id is its id.
  const subscriptionId = data?.id ?? null

  // User resolution: custom_data first, then the profile that owns this
  // subscription_id (seeded by activated — this is what lets later renewals and
  // lifecycle events resolve, closing Piece 2's first-cycle chicken/egg).
  let userId: string | null = customData?.user_id ?? null
  if (!userId && subscriptionId) {
    const { data: owner } = await supabase
      .from('profiles')
      .select('id')
      .eq('subscription_id', subscriptionId)
      .single()
    userId = owner?.id ?? null
  }
  if (!userId) {
    // Not retryable (a retry won't add identity); record + 200.
    console.error(`Webhook: could not resolve user for ${eventType} (subscription_id=${subscriptionId}).`)
    return
  }

  // Build a FIELD-SCOPED update: only the columns this event owns.
  const update: Record<string, any> = {}

  if (rule.fromDataStatus) {
    // subscription.updated trusts the payload's own status — but ONLY for statuses
    // we model. An unmapped status (e.g. 'trialing', or anything outside the CHECK
    // set) written verbatim would be wrong or be rejected by
    // profiles_subscription_status_chk, throwing → 500 → infinite retry (the status
    // never changes on retry). So we gate here and keep the DB CHECK strict:
    // unmapped status → ignore the WHOLE event (write nothing), warn, and let the
    // caller record it + return 200 as a safely-ignored event.
    const incoming = data?.status
    if (typeof incoming !== 'string' || !UPDATED_STATUS_WHITELIST.has(incoming)) {
      console.warn(`Webhook: ${eventType} with unmapped status "${incoming}" — ignoring (no fields written).`)
      return
    }
    update.subscription_status = incoming
  } else if (rule.status) {
    update.subscription_status = rule.status
  }

  if (rule.setSubscriptionId && subscriptionId) {
    update.subscription_id = subscriptionId
  }

  if (rule.setPlan) {
    const priceId = data?.items?.[0]?.price?.id ?? null
    // Null-guard: only refresh plan when a price is present, so a payload that
    // omits items can't clobber the stored plan label.
    if (priceId) update.plan = planForPrice(priceId)
  }

  if (rule.setPeriodEnd) {
    const endsAt = data?.current_billing_period?.ends_at
    // NULL-GUARD: only write current_period_end when actually present, so a null
    // period (e.g. an unexpected shape) never erases the paid-through value.
    if (endsAt != null) update.current_period_end = endsAt
  }

  if (Object.keys(update).length === 0) {
    console.warn(`Webhook: ${eventType} produced no fields to write (subscription_id=${subscriptionId}).`)
    return
  }

  await supabase.from('profiles').update(update).eq('id', userId)
  console.log(`Updated profile ${userId} from ${eventType}:`, update)
}

// adjustment.created / adjustment.updated — refunds & chargebacks. Reverses the
// credits granted for the refunded transaction, exactly once, linking through the
// purchases LEDGER (adjustments carry no custom_data.user_id — Correction 8a).
//
// Non-retryable conditions (disallowed action, not-yet-approved, unledgered txn,
// already-refunded) just `return`: the caller records the event and returns 200.
async function handleRefundAdjustment(supabase: any, data: any): Promise<void> {
  const action = data?.action

  // Correction C — ALLOWLIST. Only money-returning adjustments claw back credits.
  // The *_reverse / credit / credit_reverse actions UNDO a prior adjustment;
  // reversing on them would double-claw. Anything outside {refund,chargeback} is
  // safely ignored.
  if (action !== 'refund' && action !== 'chargeback') {
    console.log(`Webhook: adjustment action "${action}" not in {refund,chargeback} — ignoring.`)
    return
  }

  // Correction B — STATUS GATE. Only an APPROVED adjustment actually moves money.
  // created-already-approved reverses here; created 'pending' then updated
  // 'approved' reverses on the updated delivery. pending/rejected: ignore.
  if (data?.status !== 'approved') {
    console.log(`Webhook: adjustment status "${data?.status}" not approved — ignoring (no reversal yet).`)
    return
  }

  const transactionId = data?.transaction_id
  if (!transactionId) {
    console.error('Webhook: adjustment missing transaction_id — cannot link to a purchase.')
    return
  }

  // Atomic flip-then-deduct-then-revoke (Piece 5). In ONE Postgres transaction
  // (reverse_credits_for_refund) the ledger row is CAS-flipped completed->refunded
  // (guarded so only ONE of two concurrent approved deliveries wins), the FULL
  // credits_granted is decremented (clamped at 0), and — for a subscription cycle
  // — Pro is revoked (status=canceled, current_period_end=now, Correction A's
  // exception). This closes the Piece-4 lost-reversal window where the CAS flip
  // committed but a separate deductCredits then threw.
  //
  // We INTENTIONALLY do not inspect the refund amount (data.totals.total stays
  // unused): any approved refund/chargeback reverses the FULL grant, the safer
  // error direction (partial-refund clawback abuse is the worse failure). Partial
  // logic is deferred until real refund patterns warrant it.
  const { data: reversed, error: reverseError } = await supabase.rpc(
    'reverse_credits_for_refund',
    { p_paddle_transaction_id: transactionId }
  )

  // DB failure is retryable — throw so the POST catch returns 500 and Paddle
  // retries (rpc() returns { error } rather than throwing).
  if (reverseError) {
    throw new Error(
      `reverse_credits_for_refund failed for txn ${transactionId}: ${reverseError.message}`
    )
  }

  if (reversed) {
    console.log(`Reversed credits for txn ${transactionId} (approved ${action}).`)
  } else {
    // CAS matched no row: unledgered txn OR already refunded (a concurrent
    // delivery won, or this is a redelivery). Non-actionable — no double-deduct.
    console.log(`Webhook: txn ${transactionId} not reversed (unledgered or already refunded).`)
  }
}
