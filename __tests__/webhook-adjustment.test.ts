// Piece 4 — refund handler (adjustment.created / adjustment.updated).
//
// Reverses the credits granted for a refunded transaction, exactly once, linking
// through the purchases LEDGER (adjustments carry no custom_data.user_id —
// Correction 8a). Key invariants asserted here:
//   - ALLOWLIST (Correction C): only action ∈ {refund, chargeback} reverses;
//     credit_reverse / *_reverse are undo actions and must NOT claw back.
//   - STATUS GATE (Correction B): reverse only when data.status === 'approved'.
//   - flip-then-deduct CAS: status completed->refunded flips atomically; only the
//     CAS winner deducts, so created+updated both-approved can't double-deduct.
//   - subscription_cycle refund also forces profile canceled + period_end=now
//     (Correction A's deliberate exception — refund DOES move period_end).
//   - unledgered transaction_id -> safe ignore (record + 200).
//
// deductCredits is mocked: we assert WHETHER/with-what it ran, not the clamp math
// (credits.ts has its own suite). Fixtures are DOCS-DERIVED (see fixtures/README).

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import adjCreated from './fixtures/adjustment.created.json'
import adjUpdated from './fixtures/adjustment.updated.json'
import adjChargeback from './fixtures/adjustment.chargeback.json'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
jest.mock('../src/lib/credits', () => ({ addCredits: jest.fn(), deductCredits: jest.fn() }))

import { createClient as createClientJS } from '@supabase/supabase-js'
import { deductCredits } from '../src/lib/credits'
import { POST as webhookPOST } from '../src/app/api/webhooks/paddle/route'

const mockDeduct = deductCredits as jest.Mock

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

const updates = (mock: SupabaseMock) => mock.callsTo('update').map((c) => c.args[0])
const touched = (mock: SupabaseMock, table: string) => mock.calls.some((c) => c.table === table)
const eqDidQuery = (mock: SupabaseMock, col: string, val: unknown): boolean =>
  mock.callsTo('eq').some((c) => c.args[0] === col && c.args[1] === val)
const insertedEventIds = (mock: SupabaseMock): unknown[] =>
  mock.callsTo('insert').map((c) => c.args[0])

describe('Paddle webhook — refund adjustment (Piece 4)', () => {
  let mock: SupabaseMock

  beforeEach(() => {
    jest.clearAllMocks()
    mock = createSupabaseMock()
    ;(createClientJS as jest.Mock).mockReturnValue(mock.client)
  })

  it('approved refund (pack): CAS-flips ledger to refunded and deducts the granted credits', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: { id: 'pur_1', user_id: 'user-123', credits_granted: 30, type: 'pack', status: 'completed' } }, // ledger lookup
      { data: [{ id: 'pur_1' }] }, // CAS flip .select(): one row flipped -> winner
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(adjCreated))

    expect(res.status).toBe(200)
    // Linked via the ledger by transaction_id.
    expect(eqDidQuery(mock, 'paddle_transaction_id', 'txn_01docs_pack')).toBe(true)
    // CAS flip: status->refunded with a refunded_at, guarded by status='completed'.
    const flip = updates(mock).find((u) => u.status === 'refunded')
    expect(flip).toBeDefined()
    expect(typeof flip.refunded_at).toBe('string')
    expect(eqDidQuery(mock, 'status', 'completed')).toBe(true)
    expect(eqDidQuery(mock, 'id', 'pur_1')).toBe(true)
    // Full reversal of the granted credits.
    expect(mockDeduct).toHaveBeenCalledWith(mock.client, 'user-123', 30)
    // Pack: no profile entitlement change.
    expect(updates(mock).some((u) => 'subscription_status' in u)).toBe(false)
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjCreated.event_id }])
  })

  it('approved refund (subscription_cycle): also forces profile canceled + period_end=now', async () => {
    const payload = { ...adjUpdated, data: { ...adjUpdated.data, transaction_id: 'txn_01docs_sub' } }
    mock.queue(
      { data: null }, // dedup
      { data: { id: 'pur_2', user_id: 'user-123', credits_granted: 100, type: 'subscription_cycle', status: 'completed' } }, // ledger
      { data: [{ id: 'pur_2' }] }, // CAS flip winner
      { data: [{ id: 'user-123' }] }, // profiles entitlement update
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(mockDeduct).toHaveBeenCalledWith(mock.client, 'user-123', 100)
    // Entitlement revoked immediately: status canceled + period_end set to now.
    const entitlement = updates(mock).find((u) => u.subscription_status === 'canceled')
    expect(entitlement).toBeDefined()
    expect(typeof entitlement.current_period_end).toBe('string')
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjUpdated.event_id }])
  })

  it('approved chargeback (subscription_cycle): reverses credits + revokes Pro, identically to refund', async () => {
    // A chargeback is a distinct semantic path (forced bank reversal) but is
    // allowlisted alongside 'refund' and must behave identically.
    mock.queue(
      { data: null }, // dedup
      { data: { id: 'pur_cb', user_id: 'user-123', credits_granted: 100, type: 'subscription_cycle', status: 'completed' } }, // ledger
      { data: [{ id: 'pur_cb' }] }, // CAS flip winner
      { data: [{ id: 'user-123' }] }, // profiles entitlement update
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(adjChargeback))

    expect(res.status).toBe(200)
    expect(eqDidQuery(mock, 'paddle_transaction_id', 'txn_01docs_sub')).toBe(true)
    const flip = updates(mock).find((u) => u.status === 'refunded')
    expect(flip).toBeDefined()
    expect(typeof flip.refunded_at).toBe('string')
    expect(mockDeduct).toHaveBeenCalledWith(mock.client, 'user-123', 100)
    const entitlement = updates(mock).find((u) => u.subscription_status === 'canceled')
    expect(entitlement).toBeDefined()
    expect(typeof entitlement.current_period_end).toBe('string')
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjChargeback.event_id }])
  })

  it('pending refund: status gate ignores it — no ledger touch, no deduct, recorded, 200', async () => {
    const payload = { ...adjCreated, data: { ...adjCreated.data, status: 'pending' } }
    mock.queue(
      { data: null }, // dedup
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(mockDeduct).not.toHaveBeenCalled()
    expect(touched(mock, 'purchases')).toBe(false) // never reached the ledger
    expect(insertedEventIds(mock)).toEqual([{ event_id: adjCreated.event_id }])
  })

  it('disallowed action (credit_reverse): allowlist ignores it — no deduct, recorded, 200', async () => {
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
    expect(mockDeduct).not.toHaveBeenCalled()
    expect(touched(mock, 'purchases')).toBe(false)
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_adj_credit_reverse' }])
  })

  it('already-refunded (CAS flips no row): does NOT double-deduct', async () => {
    const payload = { ...adjUpdated, event_id: 'evt_adj_dup' }
    mock.queue(
      { data: null }, // dedup
      { data: { id: 'pur_1', user_id: 'user-123', credits_granted: 30, type: 'pack', status: 'refunded' } }, // already refunded
      { data: [] }, // CAS flip .select(): NO row flipped (status no longer 'completed')
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(mockDeduct).not.toHaveBeenCalled() // CAS loser — no reversal
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_adj_dup' }])
  })

  it('unledgered transaction_id: safe ignore — no deduct, no flip, recorded, 200', async () => {
    const payload = {
      ...adjCreated,
      event_id: 'evt_adj_unledgered',
      data: { ...adjCreated.data, transaction_id: 'txn_not_in_ledger' },
    }
    mock.queue(
      { data: null }, // dedup
      { data: null }, // ledger lookup: no row
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(mockDeduct).not.toHaveBeenCalled()
    expect(updates(mock)).toHaveLength(0) // no CAS flip attempted
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_adj_unledgered' }])
  })
})
