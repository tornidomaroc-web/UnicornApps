import { POST as generatePOST } from '../src/app/api/generate/route'
import { POST as webhookPOST } from '../src/app/api/webhooks/paddle/route'
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { createSupabaseMock } from './helpers/supabaseMock'

// Mock the dependencies
jest.mock('../src/lib/supabase/server', () => ({
  createClient: jest.fn()
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}))

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({ seoTitle: 'Mock Product' })
        }
      })
    })
  }))
}))

// Provide test environment variables
process.env.GEMINI_API_KEY = 'mock_gemini_key'
process.env.PADDLE_WEBHOOK_SECRET = 'mock_secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-url'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'

// Mock global fetch for dynamic model lookup
global.fetch = jest.fn().mockResolvedValue({
  ok: true, // resolveGeminiModels() short-circuits on !res.ok before reading json
  json: () => Promise.resolve({
    models: [{ name: 'models/gemini-1.5-flash', supportedGenerationMethods: ['generateContent'] }]
  })
}) as jest.Mock

import { createClient } from '../src/lib/supabase/server'
import { createClient as createClientJS } from '@supabase/supabase-js'

describe('Credit Logic', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks()

    // Base mock structure for Supabase client
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } } })
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      // Credit reserve/refund now go through service-role RPCs
      // (reserve_credit / refund_credit). Default: no-op success.
      rpc: jest.fn().mockResolvedValue({ data: null, error: null })
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (createClientJS as jest.Mock).mockReturnValue(mockSupabase);
  })

  it('reserves 1 credit BEFORE calling Gemini on a successful generation', async () => {
    // reserve_credit RPC succeeds (atomic decrement-if-sufficient returns true).
    mockSupabase.rpc.mockResolvedValueOnce({ data: true, error: null });

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,mock', lang: 'en' })
    });

    const res = await generatePOST(req);
    expect(res.status).toBe(200);

    // The credit was reserved up front via reserve_credit, and — because the
    // generation succeeded — it was NOT refunded (settled = true).
    const rpcCalls = mockSupabase.rpc.mock.calls.map((c: any[]) => c[0]);
    expect(rpcCalls).toContain('reserve_credit');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('reserve_credit', {
      p_user_id: 'user-123',
      p_cost: 1,
    });
    expect(rpcCalls).not.toContain('refund_credit');
  })

  it('rejects generation when user has 0 credits (reserve returns false)', async () => {
    // reserve_credit finds credits < cost -> no row matched -> returns false.
    mockSupabase.rpc.mockResolvedValueOnce({ data: false, error: null });

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,mock', lang: 'en' })
    });

    const res = await generatePOST(req);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe('Insufficient credits');
    // Insufficient -> Gemini never called and nothing to refund.
    const rpcCalls = mockSupabase.rpc.mock.calls.map((c: any[]) => c[0]);
    expect(rpcCalls).not.toContain('refund_credit');
    expect(mockSupabase.insert).not.toHaveBeenCalled();
  })

  it('adds credits via Paddle webhook on transaction.completed (price-derived, atomic grant RPC)', async () => {
    // Piece 2 + Piece 5: the grant is derived SERVER-SIDE from the PACK price id
    // (creditsForPrice('pri_pack_test') -> 30), NOT from custom_data, and is now
    // committed atomically by the grant_credits_for_purchase RPC (ledger INSERT +
    // credits increment in one txn). This asserts the handler delegates to that
    // RPC with the server-derived amount; the credit math + clamp live in SQL.
    const mock = createSupabaseMock();
    (createClientJS as jest.Mock).mockReturnValue(mock.client);

    mock.queue(
      { data: null }, // dedup .single(): event not seen
      { data: true }, // grant rpc(): newly inserted -> granted
      { data: [{ id: 'row' }] }, // processed_webhook_events insert
    );

    const payload = {
      event_type: 'transaction.completed',
      event_id: 'evt_test_1',
      data: {
        id: 'txn_test_1',
        subscription_id: null,
        custom_data: { user_id: 'user-123' },
        items: [{ price: { id: 'pri_pack_test' }, quantity: 1 }],
        details: { totals: { grand_total: '1900', currency_code: 'USD' } },
      },
    };

    const bodyText = JSON.stringify(payload);

    // Paddle signs `${ts}:${rawBody}` with HMAC-SHA256 and sends it as
    // a `paddle-signature: ts=<ts>;h1=<digest>` header.
    const ts = '1700000000';
    const digest = crypto
      .createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET!)
      .update(`${ts}:${bodyText}`)
      .digest('hex');

    const req = new NextRequest('http://localhost/api/webhooks/paddle', {
      method: 'POST',
      body: bodyText,
      headers: {
        // Real Paddle Billing auth: a valid `Paddle-Signature` HMAC only.
        'paddle-signature': `ts=${ts};h1=${digest}`
      }
    });

    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    // Delegated to the grant RPC with the price-derived 30 credits (not custom_data).
    const rpcCalls = mock.callsTo('rpc').map((c) => ({ fn: c.args[0], params: c.args[1] }));
    expect(rpcCalls).toEqual([
      {
        fn: 'grant_credits_for_purchase',
        params: {
          p_user_id: 'user-123',
          p_paddle_transaction_id: 'txn_test_1',
          p_type: 'pack',
          p_credits: 30,
          p_amount_cents: 1900,
        },
      },
    ]);
  })
})
