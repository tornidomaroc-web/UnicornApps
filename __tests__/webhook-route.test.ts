// Piece 2 — transaction.completed split (pack vs subscription cycle).
//
// Builds on Piece 1's control-flow scaffold (retry semantics + idempotency order)
// and adds the credit-grant behavior:
//   - credits derived SERVER-SIDE from the price id (billing.creditsForPrice),
//     NEVER from custom_data.credits_to_add
//   - subscription_id presence is the SOLE pack-vs-cycle distinguisher
//   - exactly-once grant via the atomic grant_credits_for_purchase RPC (Piece 5:
//     ledger INSERT + credits increment in one txn; returns granted=false on a
//     duplicate). These JS tests assert the handler DELEGATES correctly (right RPC,
//     right args) and threads granted/duplicate/error; the ledger+credit atomicity
//     and clamp math live in SQL (reviewed + run live).
//   - user resolution: custom_data first, then profiles.subscription_id fallback
//   - unknown price -> fail-safe (grant nothing, still record + 200)
//
// The Supabase client is the chainable createSupabaseMock; each test QUEUES the DB
// results the handler awaits in order (dedup .single() -> grant rpc() -> optional
// profile subscription_id update -> processed_webhook_events insert).
//
// Fixtures are DOCS-DERIVED (see __tests__/fixtures/README.md, two-layer plan):
// real shapes from the Paddle Billing docs now, reconciled against captured
// payloads during live verification after ship.

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import completedPack from './fixtures/transaction.completed.pack.json'
import subscriptionCycle from './fixtures/transaction.completed.subscription.json'

// Service-role client the route builds via @supabase/supabase-js.createClient.
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

import { createClient as createClientJS } from '@supabase/supabase-js'
import { POST as webhookPOST } from '../src/app/api/webhooks/paddle/route'

process.env.PADDLE_WEBHOOK_SECRET = 'mock_secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-url'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'
// NEXT_PUBLIC_PADDLE_{SUB,PACK}_PRICE_ID are set in jest.setup.env.js (before
// billing.ts module-init) -> creditsForPrice('pri_sub_test')=100, ('pri_pack_test')=30.

// Paddle signs `${ts}:${rawBody}` with HMAC-SHA256 and sends
// `paddle-signature: ts=<ts>;h1=<digest>`.
function sign(bodyText: string, ts = '1700000000'): string {
  const digest = crypto
    .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET!)
    .update(`${ts}:${bodyText}`)
    .digest('hex')
  return `ts=${ts};h1=${digest}`
}

function makeReq(payload: unknown): NextRequest {
  const bodyText = JSON.stringify(payload)
  return new NextRequest('http://localhost/api/webhooks/paddle', {
    method: 'POST',
    body: bodyText,
    headers: { 'x-signature': 'present', 'paddle-signature': sign(bodyText) },
  })
}

// event_ids recorded in processed_webhook_events (processed dedup uses .insert();
// the purchases ledger uses .upsert(), so these never collide).
const insertedEventIds = (mock: SupabaseMock): unknown[] =>
  mock.callsTo('insert').map((c) => c.args[0])
const profileUpdates = (mock: SupabaseMock) => mock.callsTo('update').map((c) => c.args[0])
// Piece 5: grant goes through supabase.rpc('grant_credits_for_purchase', params).
const rpcCalls = (mock: SupabaseMock) =>
  mock.callsTo('rpc').map((c) => ({ fn: c.args[0], params: c.args[1] }))

describe('Paddle webhook — transaction.completed split (Piece 2)', () => {
  let mock: SupabaseMock

  beforeEach(() => {
    jest.clearAllMocks()
    mock = createSupabaseMock()
    ;(createClientJS as jest.Mock).mockReturnValue(mock.client)
  })

  // --- Grant behavior -------------------------------------------------------

  it('pack: grants creditsForPrice (NOT custom_data) via grant RPC, type=pack, records, 200', async () => {
    mock.queue(
      { data: null }, // dedup .single(): not seen
      { data: true }, // grant rpc(): newly inserted -> granted
      { data: [{ id: 'row' }] }, // processed_webhook_events insert
    )

    const res = await webhookPOST(makeReq(completedPack))

    expect(res.status).toBe(200)
    // 30 from the PACK price id — NOT the 50 in custom_data.credits_to_add.
    expect(completedPack.data.custom_data.credits_to_add).toBe(50)

    // One atomic grant RPC with server-derived credits + the parsed amount.
    expect(rpcCalls(mock)).toHaveLength(1)
    expect(rpcCalls(mock)[0]).toEqual({
      fn: 'grant_credits_for_purchase',
      params: {
        p_user_id: 'user-123',
        p_paddle_transaction_id: 'txn_01docs_pack',
        p_type: 'pack',
        p_credits: 30,
        p_amount_cents: 1900, // grand_total "1900" (string) -> Number
      },
    })
    expect(typeof rpcCalls(mock)[0].params.p_amount_cents).toBe('number')

    // A pack is not a subscription cycle: no subscription_id persisted.
    expect(profileUpdates(mock)).toHaveLength(0)
    expect(insertedEventIds(mock)).toEqual([{ event_id: completedPack.event_id }])
  })

  it('subscription cycle: grants SUB credits via RPC (type=subscription_cycle), persists subscription_id', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: true }, // grant rpc(): inserted -> granted
      { data: [{ id: 'user-123' }] }, // profiles update (persist subscription_id)
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(subscriptionCycle))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)[0]).toEqual({
      fn: 'grant_credits_for_purchase',
      params: {
        p_user_id: 'user-123',
        p_paddle_transaction_id: 'txn_01docs_sub',
        p_type: 'subscription_cycle',
        p_credits: 100,
        p_amount_cents: 900,
      },
    })
    // subscription_id opportunistically stored so future cycles resolve (this
    // stays a plain idempotent profile write, outside the atomic grant).
    expect(profileUpdates(mock)).toEqual([{ subscription_id: 'sub_01docs' }])
    expect(insertedEventIds(mock)).toEqual([{ event_id: subscriptionCycle.event_id }])
  })

  it('subscription cycle without custom_data.user_id: resolves via profiles.subscription_id fallback', async () => {
    const { user_id, ...rest } = subscriptionCycle.data.custom_data
    const payload = {
      ...subscriptionCycle,
      event_id: 'evt_sub_fallback',
      data: { ...subscriptionCycle.data, custom_data: rest },
    }
    mock.queue(
      { data: null }, // dedup .single()
      { data: { id: 'user-xyz' } }, // profiles fallback .single(): owner found
      { data: true }, // grant rpc(): inserted -> granted
      { data: [{ id: 'user-xyz' }] }, // profiles update (persist subscription_id)
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    // Grant RPC resolved the user via the subscription_id fallback.
    expect(rpcCalls(mock)[0].params.p_user_id).toBe('user-xyz')
    // The fallback queried profiles by subscription_id.
    expect(
      mock.callsTo('eq').some((c) => c.args[0] === 'subscription_id' && c.args[1] === 'sub_01docs'),
    ).toBe(true)
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_sub_fallback' }])
  })

  // --- Idempotency / fail-safe ---------------------------------------------

  it('same transaction delivered twice (new event_id each): grant RPC enforces exactly-once', async () => {
    mock.queue(
      // delivery 1
      { data: null }, // dedup .single(): event 1 not seen
      { data: true }, // grant rpc(): inserted -> granted
      { data: [{ id: 'row1' }] }, // processed insert (event 1)
      // delivery 2 — same data.id, fresh event_id
      { data: null }, // dedup .single(): event 2 not seen
      { data: false }, // grant rpc(): ON CONFLICT -> already granted -> false
      { data: [{ id: 'row2' }] }, // processed insert (event 2)
    )

    const res1 = await webhookPOST(makeReq(completedPack))
    const res2 = await webhookPOST(makeReq({ ...completedPack, event_id: 'evt_pack_redelivery' }))

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    // Both deliveries call the grant RPC with the SAME transaction id; the RPC
    // (ON CONFLICT DO NOTHING) is what makes the grant happen exactly once —
    // delivery 2 returns granted=false. (Once-only credit math is the SQL's job.)
    const calls = rpcCalls(mock)
    expect(calls).toHaveLength(2)
    expect(calls[0].params.p_paddle_transaction_id).toBe('txn_01docs_pack')
    expect(calls[1].params.p_paddle_transaction_id).toBe('txn_01docs_pack')
    expect(insertedEventIds(mock)).toEqual([
      { event_id: completedPack.event_id },
      { event_id: 'evt_pack_redelivery' },
    ])
  })

  it('unknown/misconfigured price id: grants nothing, no ledger row, still recorded, 200', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: [{ id: 'row' }] }, // processed insert
    )
    const payload = {
      ...completedPack,
      event_id: 'evt_unknown_price',
      data: { ...completedPack.data, items: [{ price: { id: 'pri_not_configured' }, quantity: 1 }] },
    }

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200) // fail-safe: not retryable
    expect(rpcCalls(mock)).toHaveLength(0) // grant RPC never called
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_unknown_price' }])
  })

  // --- Structural contract carried over from Piece 1 ------------------------

  it('grant RPC returns a DB error: handler throws -> does NOT record event_id, returns 500', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: null, error: { message: 'db unavailable' } }, // grant rpc(): DB failure
    )

    const res = await webhookPOST(makeReq(completedPack))

    expect(res.status).toBe(500) // Paddle must retry
    expect(insertedEventIds(mock)).toHaveLength(0) // event left unrecorded
  })

  it('duplicate event (already processed): fast-path 200, no handling, no re-record', async () => {
    mock.queue({ data: { id: 'existing-row' } }) // dedup .single(): already seen

    const res = await webhookPOST(makeReq(completedPack))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toHaveLength(0)
    expect(mock.callsTo('insert')).toHaveLength(0)
  })

  it('unknown event type: ignored, still recorded, returns 200', async () => {
    mock.queue({ data: null }, { data: [{ id: 'row' }] })
    // A type with no handler (not transaction.completed, not subscription.*).
    const payload = { event_type: 'customer.updated', event_id: 'evt_unknown_1', data: {} }

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toHaveLength(0)
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_unknown_1' }])
  })

  it('transaction.completed pack missing user_id: not retryable, recorded, returns 200', async () => {
    mock.queue({ data: null }, { data: [{ id: 'row' }] })
    const { user_id, ...rest } = completedPack.data.custom_data
    const payload = {
      ...completedPack,
      event_id: 'evt_no_user_1',
      data: { ...completedPack.data, custom_data: rest },
    }

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200) // no retry — custom_data won't change
    expect(rpcCalls(mock)).toHaveLength(0) // no grant attempted (user unresolved)
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_no_user_1' }])
  })
})
