// Piece 1 — webhook control-flow scaffold (retry semantics + idempotency order).
//
// These tests assert the STRUCTURAL contract only, not credit math:
//   - dedup INSERT happens AFTER the handler succeeds (a thrower records nothing)
//   - genuine handler failure -> 500 (Paddle must retry)
//   - handled / intentionally-ignored / duplicate -> 200 (no retry)
// Credit/entitlement behavior is unchanged by this piece, so addCredits is mocked
// out — we only care WHETHER it ran and whether the event got recorded.
//
// Fixtures are DOCS-DERIVED (see __tests__/fixtures/README.md, two-layer plan):
// real shapes from the Paddle Billing docs now, reconciled against captured
// payloads during live verification after ship.

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createSupabaseMock, SupabaseMock } from './helpers/supabaseMock'
import completedPack from './fixtures/transaction.completed.pack.json'

// Service-role client the route builds via @supabase/supabase-js.createClient.
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }))
// Credit mutation is Piece 2's concern; here it's a spy we can make throw.
jest.mock('../src/lib/credits', () => ({ addCredits: jest.fn() }))

import { createClient as createClientJS } from '@supabase/supabase-js'
import { addCredits } from '../src/lib/credits'
import { POST as webhookPOST } from '../src/app/api/webhooks/paddle/route'

const mockAddCredits = addCredits as jest.Mock

process.env.PADDLE_WEBHOOK_SECRET = 'mock_secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-url'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'

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

const insertedEventIds = (mock: SupabaseMock): unknown[] =>
  mock.callsTo('insert').map((c) => c.args[0])

describe('Paddle webhook — control-flow scaffold (Piece 1)', () => {
  let mock: SupabaseMock

  beforeEach(() => {
    jest.clearAllMocks()
    mock = createSupabaseMock()
    ;(createClientJS as jest.Mock).mockReturnValue(mock.client)
  })

  it('handled event: records event_id AFTER success and returns 200', async () => {
    // dedup .single() -> not seen; then the deferred insert resolves.
    mock.queue({ data: null }, { data: [{ id: 'row' }] })

    const res = await webhookPOST(makeReq(completedPack))

    expect(res.status).toBe(200)
    expect(mockAddCredits).toHaveBeenCalledWith(
      mock.client,
      completedPack.data.custom_data.user_id,
      completedPack.data.custom_data.credits_to_add,
    )
    // Recorded as processed exactly once, with the event_id.
    expect(insertedEventIds(mock)).toEqual([{ event_id: completedPack.event_id }])
  })

  it('handler failure: does NOT record event_id and returns 500', async () => {
    mock.queue({ data: null }) // dedup: not seen
    mockAddCredits.mockRejectedValueOnce(new Error('db unavailable'))

    const res = await webhookPOST(makeReq(completedPack))

    expect(res.status).toBe(500) // Paddle must retry
    expect(mock.callsTo('insert')).toHaveLength(0) // event left unrecorded
  })

  it('duplicate event: fast-path returns 200 without handling or re-recording', async () => {
    mock.queue({ data: { id: 'existing-row' } }) // dedup: already seen

    const res = await webhookPOST(makeReq(completedPack))

    expect(res.status).toBe(200)
    expect(mockAddCredits).not.toHaveBeenCalled()
    expect(mock.callsTo('insert')).toHaveLength(0)
  })

  it('unknown event type: ignored, still recorded, returns 200', async () => {
    mock.queue({ data: null }, { data: [{ id: 'row' }] })
    // No handler exists for this type yet (Pieces 2-4); the else branch ignores it.
    const payload = { event_type: 'subscription.created', event_id: 'evt_unknown_1', data: {} }

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200)
    expect(mockAddCredits).not.toHaveBeenCalled()
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_unknown_1' }])
  })

  it('transaction.completed missing user_id: not retryable, recorded, returns 200', async () => {
    mock.queue({ data: null }, { data: [{ id: 'row' }] })
    const { user_id, ...rest } = completedPack.data.custom_data
    const payload = {
      ...completedPack,
      event_id: 'evt_no_user_1',
      data: { ...completedPack.data, custom_data: rest },
    }

    const res = await webhookPOST(makeReq(payload))

    expect(res.status).toBe(200) // no retry — custom_data won't change
    expect(mockAddCredits).not.toHaveBeenCalled()
    expect(insertedEventIds(mock)).toEqual([{ event_id: 'evt_no_user_1' }])
  })
})
