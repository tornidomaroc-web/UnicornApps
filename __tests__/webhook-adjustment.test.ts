// Piece 4 — refund handler (adjustment.created / adjustment.updated).
//
// Reverses the credits granted for a refunded transaction, exactly once, linking
// through the purchases LEDGER (adjustments carry no custom_data.user_id —
// Correction 8a). Invariants that stay in JS and ARE asserted here:
//   - ALLOWLIST (Correction C): only action ∈ {refund, chargeback} reaches the
//     RPC; credit_reverse / *_reverse are undo actions and must NOT claw back.
//   - STATUS GATE (Correction B): reverse only when data.status === 'approved'.
//   - exactly one reverse_credits_for_refund RPC call with the right txn id.
//   - a DB error from the RPC -> throw -> 500 (Paddle retries, event unrecorded).
// Invariants now enforced in SQL (Piece 5 RPC; verified by review + live, not here):
//   - flip-then-deduct CAS so created+updated both-approved can't double-deduct;
//   - subscription_cycle refund forces profile canceled + period_end=now;
//   - unledgered / already-refunded -> RPC returns reversed=false (safe ignore).
//
// Piece 5: the flip+deduct+revoke is now ONE atomic RPC
// (reverse_credits_for_refund). These JS tests assert the handler DELEGATES
// correctly — the allowlist + status gate run in JS, then exactly one RPC call
// with the right transaction_id — and thread reversed/error. The CAS flip, the
// full-reversal clamp, and the subscription-cycle Pro revoke all live in SQL
// (reviewed + run live). Fixtures are DOCS-DERIVED (see fixtures/README).

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import adjCreated from './fixtures/adjustment.created.json'
import adjUpdated from './fixtures/adjustment.updated.json'
import adjChargeback from './fixtures/adjustment.chargeback.json'
import adjPending from './fixtures/adjustment.pending_approval.json'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))

import { createClient as createClientJS } from '@supabase/supabase-js'
import { POST as webhookPOST } from '../src/app/api/webhooks/paddle/route'

process.env.PADDLE_WEBHOOK_SECRET = 'mock_secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-url'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'

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

const insertedEventIds = (mock: SupabaseMock): unknown[] =>
  mock.callsTo('insert').map((c) => c.args[0])
// Piece 5: reversal goes through supabase.rpc('reverse_credits_for_refund', params).
const rpcCalls = (mock: SupabaseMock) =>
  mock.callsTo('rpc').map((c) => ({ fn: c.args[0], params: c.args[1] }))

describe('Paddle webhook — refund adjustment (Piece 4)', () => {
  let mock: SupabaseMock

  beforeEach(() => {
    jest.clearAllMocks()
    mock = createSupabaseMock()
    ;(createClientJS as jest.Mock).mockReturnValue(mock.client)
  })

  it('approved refund (pack): calls the reversal RPC with the txn id, records, 200', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: true }, // reverse rpc(): CAS flipped -> reversed
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(adjCreated))

    expect(res.status).toBe(200)
    // Exactly one reversal RPC, linked via the ledger by transaction_id. The CAS
    // flip + full deduct (pack: no entitlement change) all happen inside the SQL.
    expect(rpcCalls(mock)).toEqual([
      { fn: 'reverse_credits_for_refund', params: { p_paddle_transaction_id: 'txn_01docs_pack' } },
    ])
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjCreated.event_id }])
  })

  it('approved refund (subscription_cycle): delegates to the reversal RPC (Pro revoke is in SQL)', async () => {
    const payload = { ...adjUpdated, data: { ...adjUpdated.data, transaction_id: 'txn_01docs_sub' } }
    mock.queue(
      { data: null }, // dedup
      { data: true }, // reverse rpc(): flipped -> reversed (deduct + canceled + period_end=now in SQL)
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toEqual([
      { fn: 'reverse_credits_for_refund', params: { p_paddle_transaction_id: 'txn_01docs_sub' } },
    ])
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjUpdated.event_id }])
  })

  it('approved chargeback (subscription_cycle): same reversal RPC path as a refund', async () => {
    // A chargeback is a distinct semantic path (forced bank reversal) but is
    // allowlisted alongside 'refund' and routes through the identical RPC.
    mock.queue(
      { data: null }, // dedup
      { data: true }, // reverse rpc(): flipped -> reversed
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(adjChargeback))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toEqual([
      { fn: 'reverse_credits_for_refund', params: { p_paddle_transaction_id: 'txn_01docs_sub' } },
    ])
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjChargeback.event_id }])
  })

  it("pending_approval refund (real Paddle literal): status gate ignores it — no ledger touch, no deduct, recorded, 200", async () => {
    // Layer-2 (2026-06-26): the simulator delivers refunds as status
    // 'pending_approval' (verified literal; approved transition not simulated).
    // The Correction B gate reverses ONLY on === 'approved', so this is ignored.
    expect(adjPending.data.status).toBe('pending_approval')
    mock.queue(
      { data: null }, // dedup
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(adjPending))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toHaveLength(0) // gated before the RPC
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjPending.event_id }])
  })

  it('disallowed action (credit_reverse): allowlist ignores it — no RPC, recorded, 200', async () => {
    const payload = {
      ...adjCreated,
      event_id: 'evt_adj_credit_reverse',
      data: { ...adjCreated.data, action: 'credit_reverse', status: 'approved' },
    }
    mock.queue(
      { data: null }, // dedup
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toHaveLength(0) // allowlist gated before the RPC
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_adj_credit_reverse' }])
  })

  it('reversal RPC returns reversed=false (unledgered OR already refunded): safe ignore, recorded, 200', async () => {
    // Both "no ledger row" and "already refunded" collapse to reversed=false in
    // the RPC (CAS matched no row) — the handler treats them identically.
    const payload = { ...adjUpdated, event_id: 'evt_adj_noop' }
    mock.queue(
      { data: null }, // dedup
      { data: false }, // reverse rpc(): nothing flipped -> no double-deduct
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(rpcCalls(mock)).toEqual([
      { fn: 'reverse_credits_for_refund', params: { p_paddle_transaction_id: 'txn_01docs_pack' } },
    ])
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_adj_noop' }])
  })

  it('reversal RPC returns a DB error: handler throws -> does NOT record, returns 500', async () => {
    mock.queue(
      { data: null }, // dedup
      { data: null, error: { message: 'db unavailable' } }, // reverse rpc(): DB failure
    )

    const res = await webhookPOST(makeReq(adjCreated))

    expect(res.status).toBe(500) // Paddle must retry
    expect(insertedEventIds(mock)).toHaveLength(0) // event left unrecorded
  })
})
