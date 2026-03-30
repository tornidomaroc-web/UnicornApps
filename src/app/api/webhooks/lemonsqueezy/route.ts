import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

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
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET
    if (!secret) {
      console.error('Webhook Error: LEMON_SQUEEZY_WEBHOOK_SECRET is not configured')
      return new NextResponse('Server Configuration Error', { status: 500 })
    }

    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(rawBody).digest('hex')

    if (signature !== digest) {
      console.error('Webhook Error: Invalid signature')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 3. Parse the event
    const payload = JSON.parse(rawBody)
    const eventName = payload.meta.event_name
    const customData = payload.meta.custom_data
    const attributes = payload.data.attributes

    console.log(`Webhook Received: ${eventName}`, { customData, total: attributes.total })

    if (eventName === 'order_created') {
      const userId = customData?.user_id
      const totalCents = attributes.total // e.g., 900 or 2900

      if (!userId) {
        console.error('Webhook Error: Missing user_id in custom_data')
        return new NextResponse('Missing User ID', { status: 200 }) // Acknowledge receipt anyway
      }

      // 4. Determine credits to add
      let creditsToAdd = 0
      if (totalCents === 900) {
        creditsToAdd = 50
      } else if (totalCents === 2900) {
        creditsToAdd = 500
      } else {
        // Fallback or logarithmic/proportional logic if needed
        // For now, let's stick to the specific plans
        console.warn(`Webhook Warning: Unexpected order total: ${totalCents}`)
        // Optional: add credits proportionally if you want to support coupons/variations
        // creditsToAdd = Math.floor(totalCents / 100 * 5) 
      }

      if (creditsToAdd > 0) {
        // 5. Update Supabase using Service Role Key (bypassing RLS)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceRoleKey) {
          console.error('Webhook Error: Supabase credentials missing')
          return new NextResponse('Internal Error', { status: 500 })
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

        // Atomic-like update: Fetch then Update (since we are server-side with service role)
        const { data: profile, error: fetchError } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', userId)
          .single()

        if (fetchError || !profile) {
          console.error('Webhook Error: Failed to fetch profile:', fetchError)
          return new NextResponse('Profile Not Found', { status: 200 })
        }

        const newCredits = (profile.credits || 0) + creditsToAdd

        const { error: updateError } = await supabase
          .from('profiles')
          .update({ credits: newCredits })
          .eq('id', userId)

        if (updateError) {
          console.error('Webhook Error: Failed to update credits:', updateError)
          return new NextResponse('Database Error', { status: 200 })
        }

        console.log(`Successfully added ${creditsToAdd} credits to user ${userId}. New total: ${newCredits}`)
      }
    }

    // 6. Return 200 OK to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    console.error('Webhook Exception:', error.message)
    return new NextResponse('Internal Server Error', { status: 200 }) // Acknowledge even on error to stop LS retries
  }
}
