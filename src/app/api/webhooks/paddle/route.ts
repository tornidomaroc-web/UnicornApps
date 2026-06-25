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
import { addCredits } from '@/lib/credits'
import { creditsForPrice } from '@/lib/billing'

export async function POST(req: NextRequest) {
  try {
    // 1. Get raw body for signature verification
    const rawBody = await req.text()
    const signature = req.headers.get('x-signature')

    if (!signature) {
      console.error('Webhook Error: Missing x-signature header')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 2. Verify signature
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

  // data.origin only CORROBORATES — it never decides. Warn (don't act) if it
  // disagrees with subscription_id, so a docs/live shape mismatch surfaces.
  const origin = data?.origin
  if (typeof origin === 'string' && origin.startsWith('subscription_') !== isSubscriptionCycle) {
    console.warn(
      `Webhook: origin "${origin}" disagrees with subscription_id (${subscriptionId}) on txn ${transactionId}; trusting subscription_id.`
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

  // Ledger-guarded, exactly-once grant. paddle_transaction_id is UNIQUE and we
  // ignoreDuplicates, so only the FIRST delivery inserts a row; .select()
  // returns that row only to the inserter. addCredits therefore runs at most
  // once per transaction, even if Paddle delivers it more than once.
  const { data: inserted } = await supabase
    .from('purchases')
    .upsert(
      {
        user_id: userId,
        paddle_transaction_id: transactionId,
        type,
        credits_granted: credits,
        amount_cents: amountCents,
        status: 'completed',
      },
      { onConflict: 'paddle_transaction_id', ignoreDuplicates: true }
    )
    .select()

  if (Array.isArray(inserted) && inserted.length > 0) {
    await addCredits(supabase, userId, credits)
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
