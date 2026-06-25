// Piece 3 — subscription.* lifecycle handlers.
//
// One DRY handler driven by a per-event rule writes FIELD-SCOPED profile updates
// (only the columns each event authoritatively owns), so out-of-order delivery
// converges. These tests assert, per event, exactly which columns land in the
// UPDATE payload — most load-bearingly that subscription.canceled writes
// subscription_status ONLY and never touches current_period_end (Correction A:
// current_billing_period is null on canceled, so the paid-through value must
// survive). The webhook only WRITES status/period_end/plan; computeIsPro is not
// involved here.
//
// Fixtures are DOCS-DERIVED (see __tests__/fixtures/README.md, two-layer plan).

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import activated from './fixtures/subscription.activated.json'
import canceled from './fixtures/subscription.canceled.json'
import pastDue from './fixtures/subscription.past_due.json'
import paused from './fixtures/subscription.paused.json'
import renewal from './fixtures/transaction.completed.subscription.json'

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
// addCredits only matters for the out-of-order test's renewal leg (Piece 2 path).
jest.mock('../src/lib/credits', () => ({ addCredits: jest.fn() }))

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

const profileUpdates = (mock: SupabaseMock) => mock.callsTo('update').map((c) => c.args[0])
const insertedEventIds = (mock: SupabaseMock): unknown[] =>
  mock.callsTo('insert').map((c) => c.args[0])
const eqDidQuery = (mock: SupabaseMock, col: string, val: unknown): boolean =>
  mock.callsTo('eq').some((c) => c.args[0] === col && c.args[1] === val)

describe('Paddle webhook — subscription.* lifecycle (Piece 3)', () => {
  let mock: SupabaseMock

  beforeEach(() => {
    jest.clearAllMocks()
    mock = createSupabaseMock()
    ;(createClientJS as jest.Mock).mockReturnValue(mock.client)
  })

  it('activated: writes status=active + subscription_id + plan + current_period_end, 200', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: [{ id: 'user-123' }] }, // profiles update tail
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(activated))

    expect(res.status).toBe(200)
    expect(profileUpdates(mock)).toEqual([
      {
        subscription_status: 'active',
        subscription_id: 'sub_01docs',
        plan: 'pro', // planForPrice('pri_sub_test')
        current_period_end: '2026-07-22T12:00:00.000000Z',
      },
    ])
    expect(eqDidQuery(mock, 'id', 'user-123')).toBe(true) // scoped to the user
    expect(insertedEventIds(mock)).toEqual([{ event_id: activated.event_id }])
  })

  it('canceled (Correction A): writes subscription_status ONLY, never current_period_end', async () => {
    mock.queue(
      { data: null }, // dedup .single()
      { data: [{ id: 'user-123' }] }, // profiles update tail
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(canceled))

    expect(res.status).toBe(200)
    const updates = profileUpdates(mock)
    expect(updates).toEqual([{ subscription_status: 'canceled' }])
    // The load-bearing assertion: current_period_end is NOT in the payload, so a
    // null current_billing_period can't erase the paid-through value.
    expect('current_period_end' in (updates[0] as object)).toBe(false)
    expect(insertedEventIds(mock)).toEqual([{ event_id: canceled.event_id }])
  })

  it('past_due: writes status=past_due + current_period_end (grace), no plan/subscription_id', async () => {
    mock.queue(
      { data: null },
      { data: [{ id: 'user-123' }] },
      { data: [{ id: 'row' }] },
    )

    const res = await webhookPOST(makeReq(pastDue))

    expect(res.status).toBe(200)
    expect(profileUpdates(mock)).toEqual([
      { subscription_status: 'past_due', current_period_end: '2026-08-22T12:00:00.000000Z' },
    ])
  })

  it('paused: writes subscription_status=paused only', async () => {
    mock.queue(
      { data: null },
      { data: [{ id: 'user-123' }] },
      { data: [{ id: 'row' }] },
    )

    const res = await webhookPOST(makeReq(paused))

    expect(res.status).toBe(200)
    expect(profileUpdates(mock)).toEqual([{ subscription_status: 'paused' }])
  })

  it('updated with a whitelisted status: refreshes status + plan + period_end, 200', async () => {
    // 'updated' takes its status from the payload (here past_due) — a status we
    // model, so it's written; plan + period_end are refreshed (field-scoped).
    const payload = {
      ...activated,
      event_type: 'subscription.updated',
      event_id: 'evt_sub_updated_known',
      data: { ...activated.data, status: 'past_due' },
    }
    mock.queue(
      { data: null }, // dedup .single()
      { data: [{ id: 'user-123' }] }, // profiles update tail
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(profileUpdates(mock)).toEqual([
      { subscription_status: 'past_due', plan: 'pro', current_period_end: '2026-07-22T12:00:00.000000Z' },
    ])
  })

  it('updated with an UNMAPPED status (trialing): safely ignored — writes nothing, records, 200, no throw', async () => {
    // Guards the infinite-retry loop: an unmapped status must NOT be written
    // (it would be rejected by the DB CHECK → 500 → Paddle retries forever).
    const payload = {
      ...activated,
      event_type: 'subscription.updated',
      event_id: 'evt_sub_updated_trialing',
      data: { ...activated.data, status: 'trialing' },
    }
    mock.queue(
      { data: null }, // dedup .single()
      { data: [{ id: 'row' }] }, // processed insert (no profile update in between)
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200) // NOT 500 — safely ignored, no retry storm
    expect(mock.callsTo('update')).toHaveLength(0) // nothing written
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_sub_updated_trialing' }])
  })

  it('resolves user by subscription_id when custom_data has no user_id', async () => {
    const { user_id, ...rest } = activated.data.custom_data
    const payload = {
      ...activated,
      event_id: 'evt_activated_fallback',
      data: { ...activated.data, custom_data: rest },
    }
    mock.queue(
      { data: null }, // dedup .single()
      { data: { id: 'user-xyz' } }, // profiles fallback .single(): owner by subscription_id
      { data: [{ id: 'user-xyz' }] }, // profiles update tail
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(eqDidQuery(mock, 'subscription_id', 'sub_01docs')).toBe(true) // fallback query
    expect(eqDidQuery(mock, 'id', 'user-xyz')).toBe(true) // update scoped to resolved user
    expect(profileUpdates(mock)[0]).toMatchObject({ subscription_status: 'active', subscription_id: 'sub_01docs' })
  })

  it('unresolved user: records + 200, writes nothing', async () => {
    const payload = {
      event_type: 'subscription.canceled',
      event_id: 'evt_sub_no_user',
      data: { id: 'sub_unknown', status: 'canceled' }, // no custom_data
    }
    mock.queue(
      { data: null }, // dedup .single()
      { data: null }, // fallback .single(): no owner found
      { data: [{ id: 'row' }] }, // processed insert
    )

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(mock.callsTo('update')).toHaveLength(0) // nothing written
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_sub_no_user' }])
  })

  it('out-of-order activated vs renewal: each writes only its own fields (convergent)', async () => {
    mock.queue(
      // activated leg
      { data: null }, // dedup
      { data: [{ id: 'user-123' }] }, // activated profile update tail
      { data: [{ id: 'row_a' }] }, // processed insert (activated)
      // renewal (transaction.completed for the subscription) — Piece 2 path
      { data: null }, // dedup
      { data: [{ id: 'pur' }] }, // purchases upsert .select(): inserted
      { data: [{ id: 'user-123' }] }, // renewal's subscription_id persist tail
      { data: [{ id: 'row_b' }] }, // processed insert (renewal)
    )

    const resA = await webhookPOST(makeReq(activated))
    const resB = await webhookPOST(makeReq(renewal))

    expect(resA.status).toBe(200)
    expect(resB.status).toBe(200)

    const updates = profileUpdates(mock)
    expect(updates).toHaveLength(2)

    // activated owns status + period_end + plan + subscription_id.
    expect(updates[0]).toEqual({
      subscription_status: 'active',
      subscription_id: 'sub_01docs',
      plan: 'pro',
      current_period_end: '2026-07-22T12:00:00.000000Z',
    })
    // The renewal touches ONLY subscription_id — it never clobbers the status or
    // period_end that 'activated' owns, so either delivery order converges to a
    // profile holding both subscription_id and current_period_end.
    expect(updates[1]).toEqual({ subscription_id: 'sub_01docs' })
    expect('subscription_status' in (updates[1] as object)).toBe(false)
    expect('current_period_end' in (updates[1] as object)).toBe(false)
  })
})
