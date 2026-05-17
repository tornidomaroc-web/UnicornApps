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
import { addCredits, deductCredits } from '@/lib/credits'

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
      await supabase.from('processed_webhook_events').insert({ event_id: eventId })
    }

    console.log(`Webhook Received: ${eventType}`, { customData })

    if (eventType === 'transaction.completed') {
      const userId = customData?.user_id
      const creditsToAdd = Number(customData?.credits_to_add || 0)

      if (!userId) {
        console.error('Webhook Error: Missing user_id in custom_data')
        return new NextResponse('Missing User ID', { status: 200 })
      }

      if (creditsToAdd > 0) {
        await addCredits(supabase, userId, creditsToAdd)
        console.log(`Successfully added ${creditsToAdd} credits to user ${userId}.`)
      }
    } else if (eventType === 'transaction.refunded') {
      const userId = customData?.user_id
      const creditsToDeduct = Number(customData?.credits_to_add || 0)

      if (!userId) {
        console.error('Webhook Error: Missing user_id for refund')
        return new NextResponse('Missing User ID', { status: 200 })
      }

      if (creditsToDeduct > 0) {
        await deductCredits(supabase, userId, creditsToDeduct)
        console.log(`Successfully deducted ${creditsToDeduct} credits from user ${userId}.`)
      }
    } else if (eventType === 'subscription.expired') {
      console.log(`Webhook Event Logged: subscription.expired for user ${customData?.user_id}`)
    }

    // 6. Return 200 OK to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    console.error('Webhook Exception:', error.message)
    return new NextResponse('Internal Server Error', { status: 200 }) // Acknowledge even on error to stop Paddle retries
  }
}
