import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-signature')
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET

    if (!signature || !secret) {
      console.error('Missing signature or webhook secret')
      return new Response('Unauthorized', { status: 401 })
    }

    // Verify webhook signature
    const hmac = crypto.createHmac('sha256', secret)
    const digest = hmac.update(rawBody).digest('hex')

    if (signature !== digest) {
      console.error('Invalid signature')
      return new Response('Invalid signature', { status: 401 })
    }

    const body = JSON.parse(rawBody)
    const eventName = body.meta?.event_name

    console.log(`Received Lemon Squeezy webhook: ${eventName}`)

    if (eventName === 'order_created') {
      const attributes = body.data?.attributes
      const userEmail = attributes?.user_email
      const variantName = attributes?.first_order_item?.variant_name || ''

      if (!userEmail) {
        console.error('No user email found in webhook data')
        return NextResponse.json({ error: 'No user email' }, { status: 400 })
      }

      // Initialize Supabase Admin Client
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // 1. Find user profile by email
      const { data: profile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('id, credits')
        .eq('email', userEmail)
        .single()

      if (fetchError || !profile) {
        console.error(`Profile not found for email: ${userEmail}`, fetchError)
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      }

      // 2. Determine credits to add
      let creditsToAdd = 0
      if (variantName.includes('Starter')) {
        creditsToAdd = 100
      } else if (variantName.includes('Pro')) {
        creditsToAdd = 500
      } else {
        console.warn(`Unknown variant: ${variantName}. Defaulting to 0 credits.`)
      }

      if (creditsToAdd > 0) {
        // 3. Update credits
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ credits: (profile.credits || 0) + creditsToAdd })
          .eq('id', profile.id)

        if (updateError) {
          console.error(`Failed to update credits for ${userEmail}:`, updateError)
          return NextResponse.json({ error: 'Update failed' }, { status: 500 })
        }

        console.log(`Successfully added ${creditsToAdd} credits to ${userEmail}`)
      }
    }

    return new Response('OK', { status: 200 })
  } catch (error: any) {
    console.error('Webhook processing error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
