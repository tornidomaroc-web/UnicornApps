import { POST as generatePOST } from '../src/app/api/generate/route'
import { POST as webhookPOST } from '../src/app/api/webhooks/paddle/route'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

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
process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'mock_secret'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-url'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock_service_key'

// Mock global fetch for dynamic model lookup
global.fetch = jest.fn().mockResolvedValue({
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
      insert: jest.fn().mockReturnThis()
    };
    
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (createClientJS as jest.Mock).mockReturnValue(mockSupabase);
  })

  it('deducts 1 credit on successful AI generation', async () => {
    // User has 5 credits initially
    mockSupabase.single.mockResolvedValueOnce({ data: { credits: 5 }, error: null });
    mockSupabase.update.mockResolvedValueOnce({ error: null });
    
    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,mock', lang: 'en' })
    });

    const res = await generatePOST(req);
    expect(res.status).toBe(200);

    expect(mockSupabase.update).toHaveBeenCalledWith({ credits: 4 });
  })

  it('rejects generation when user has 0 credits', async () => {
    // User has 0 credits
    mockSupabase.single.mockResolvedValueOnce({ data: { credits: 0 }, error: null });

    const req = new Request('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ image: 'data:image/jpeg;base64,mock', lang: 'en' })
    });

    const res = await generatePOST(req);
    expect(res.status).toBe(403);
    
    const json = await res.json();
    expect(json.error).toBe('Insufficient credits');
    expect(mockSupabase.update).not.toHaveBeenCalled();
  })

  it('adds credits via Lemon Squeezy webhook', async () => {
    // User profile originally has 2 credits
    mockSupabase.single.mockResolvedValueOnce({ data: { credits: 2 }, error: null });

    const payload = {
      meta: { event_name: 'order_created', custom_data: { user_id: 'user-123' } },
      data: { attributes: { total: 900 } } // 900 cents = $9 -> 50 credits
    };
    
    const bodyText = JSON.stringify(payload);
    
    const hmac = crypto.createHmac('sha256', process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!);
    const signature = hmac.update(bodyText).digest('hex');

    const req = new NextRequest('http://localhost/api/webhooks/lemonsqueezy', {
      method: 'POST',
      body: bodyText,
      headers: { 'x-signature': signature }
    });

    const res = await webhookPOST(req);
    expect(res.status).toBe(200);

    // 2 existing + 50 new = 52 credits
    expect(mockSupabase.update).toHaveBeenCalledWith({ credits: 52 });
  })
})
