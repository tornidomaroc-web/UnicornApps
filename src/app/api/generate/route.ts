import { createClient } from '@/lib/supabase/server'
import { GENERATE_CREDIT_COST, createServiceClient } from '@/lib/credits'
import { isRetryableGeminiError, resolveGeminiModels } from '@/lib/gemini'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  createDeadline,
  DeadlineExceededError,
  SINGLE_ATTEMPT_FLOOR_MS,
} from '@/lib/deadline'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

// Must stay in sync with FUNCTION_MAX_DURATION_S in @/lib/deadline, which the
// deadline arithmetic is derived from. Next.js requires a literal here, so the
// two cannot share a symbol; a unit test asserts they match.
export const maxDuration = 60

export async function POST(req: Request) {
  // Start the clock before ANY awaited work — the model-list call below is an
  // unbounded network round-trip and spends this budget too.
  const deadline = createDeadline()

  try {
    const supabase = createClient()

    if (!supabase) {
      console.error('SERVER ERROR: Supabase client is null. Environment variables missing.')
      return NextResponse.json(
        { error: 'Server configuration error. Database features are currently unavailable. Check Vercel settings.' },
        { status: 500 }
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Cheap validation BEFORE touching credits — a malformed request must
    //    never reserve (and then have to refund) a credit.
    const { image, lang } = await req.json()
    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    // Rate limit BEFORE any Gemini work (incl. the resolveGeminiModels ListModels
    // quota call) and BEFORE reserve_credit: a throttled request does zero Gemini
    // work and never touches a credit. The 429 maps to dash.aiBusy (EN/AR) via
    // src/lib/api-error.ts by STATUS, so no new UX is needed. checkRateLimit fails
    // OPEN on any error, so a limiter fault can never block generation here.
    const rateLimit = await checkRateLimit(user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'AI service is busy', code: 'RATE_LIMITED', scope: rateLimit.scope },
        { status: 429, headers: { 'Retry-After': '30' } }
      )
    }

    const isArabic = lang === 'ar'
    const languageInstruction = isArabic
      ? "\nGENERATE ALL CONTENT IN ARABIC LANGUAGE. All titles, descriptions, bullet points, hashtags and hooks must be in Arabic."
      : "\nGENERATE ALL CONTENT IN ENGLISH LANGUAGE."

    // 2. Initialize Gemini DYNAMICALLY
    const geminiApiKey = process.env.GEMINI_API_KEY

    if (!geminiApiKey) {
      console.error('SERVER ERROR: GEMINI_API_KEY is missing from environment variables.')
      return NextResponse.json(
        { error: 'Server configuration error. AI features are currently unavailable.' },
        { status: 500 }
      )
    }

    // Model resolution is a cheap list call — do it BEFORE the reserve so a
    // resolution failure is a 500 with NO credit touched.
    const candidates = (await resolveGeminiModels(geminiApiKey)).slice(0, 3)
    const genAI = new GoogleGenerativeAI(geminiApiKey)

    // Prepare image for Gemini (assuming base64)
    const base64Data = image.split(',')[1] || image
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg', // Standardizing on jpeg for analysis
      },
    }

    const prompt = `You are an elite E-commerce Growth Architect. Analyze the product image and return ONLY a valid JSON object with this EXACT schema, no formatting or backticks:
${languageInstruction}
{
  "seoTitle": "String (60 chars max)",
  "metaDescription": "String (160 chars max)",
  "productDescription": "String (detailed, based on visible features)",
  "shopifyHtml": "HTML string containing <h2>, <p> tags, and a <ul> with features",
  "amazonBullets": ["Array of exactly 5 benefit-driven bullet points"],
  "structuredData": {
    "material": "String",
    "dominantColor": "String",
    "targetAudience": "String",
    "careInstructions": "String"
  },
  "viralScript": {
    "hook": "Magnetic first 3-second hook",
    "concept": "Visual storyboard for a 15s Reel/TikTok"
  },
  "socialMediaTags": ["Array of 5 hashtags"],
  "dynamicTheme": {
    "dominantColorHex": "String (Hex code of the most defining, vibrant color in the image. Must look good in a Deep Dark Theme)",
    "accentColorHex": "String (Hex code of a high-contrast accent color from the image)"
  },
  "hotspots": [
    {
      "x": "Number (0-100 percentage, horizontal coordinate of key visual feature)",
      "y": "Number (0-100 percentage, vertical coordinate of key visual feature)",
      "label": "String (Short descriptor, e.g., 'Premium Texture')"
    }
  ]
}`

    // 3. Reserve the credit BEFORE the billable Gemini call. reserve_credit is a
    //    single atomic decrement-if-sufficient (row-locked RPC): of N parallel
    //    requests on a 1-credit balance, exactly one wins the reserve; the rest
    //    get `false` and are rejected WITHOUT calling Gemini. This replaces the
    //    old unlocked read-then-check, which let all N through and each call
    //    Gemini for a single credit. The reserved credit is refunded in the
    //    `finally` below if the billable call fails.
    const creditClient = createServiceClient() ?? supabase
    const { data: reserved, error: reserveError } = await creditClient.rpc('reserve_credit', {
      p_user_id: user.id,
      p_cost: GENERATE_CREDIT_COST,
    })
    if (reserveError) {
      // Reserve never committed -> nothing to refund. Fail closed (deny) rather
      // than risk a free generation. This is also the path when the service-role
      // key is absent: EXECUTE on reserve_credit is locked to service_role.
      console.error('Credit reserve failed for user', user.id, reserveError)
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
    }
    if (!reserved) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 })
    }

    // From here the credit is spent. Every exit path must either RETURN content
    // (credit earned -> set settled=true) or leave settled=false so `finally`
    // refunds. Content is NEVER returned on a Gemini/parse failure.
    let settled = false
    try {
      // Try candidates in order; fall back when a model is over capacity.
      let result: Awaited<ReturnType<ReturnType<typeof genAI.getGenerativeModel>['generateContent']>> | null = null
      let lastError: any = null
      for (const modelName of candidates) {
        // Never START an attempt we cannot finish inside the wall. Throws
        // DeadlineExceededError, which unwinds through the `finally` below and
        // refunds the credit. This can cut the fallback loop short when time
        // runs out — a consequence of the budget, not a change to the fan-out
        // policy.
        deadline.assertBudget(SINGLE_ATTEMPT_FLOOR_MS)
        const attempt = deadline.attemptSignal()
        try {
          // Cap output tokens to bound per-call cost. 8192 matches the value
          // /api/refine already uses and validated against JSON truncation on
          // thinking models (2048 truncated mid-array there); both routes return
          // essentially the same schema.
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: { maxOutputTokens: 8192 },
          })
          result = await model.generateContent([prompt, imagePart], {
            signal: attempt.signal,
          })
          break
        } catch (e: any) {
          lastError = e
          // Our deadline timer is the ONLY thing that aborts this signal, so
          // this is an exact test — no matching on Google's error message or
          // status. Rethrown as DeadlineExceededError so the outer catch can
          // answer 503 instead of leaking Google's English text as a 500.
          if (attempt.signal.aborted) throw new DeadlineExceededError()
          const status = e?.status ?? e?.response?.status ?? 0
          if (!isRetryableGeminiError(status, String(e?.message ?? ''))) throw e
          console.warn(`Gemini ${modelName} over capacity, trying next model`)
        } finally {
          attempt.cancel()
        }
      }
      if (!result) throw lastError ?? new Error('All Gemini models are over capacity.')

      const response = await result.response
      const text = response.text()

      // Clean response text to ensure it's valid JSON (Gemini sometimes adds markdown blocks)
      const cleanedText = text.replace(/```json|```/gi, '').trim()
      let generatedContent;
      try {
        generatedContent = JSON.parse(cleanedText)
      } catch (parseError) {
        console.error('SERVER ERROR: AI returned malformed JSON.', cleanedText)
        // settled stays false -> `finally` refunds the reserved credit.
        return NextResponse.json(
          { error: 'AI generation failed due to formatting issues. Please try again.' },
          { status: 422 }
        )
      }

      // Content earned -> the reserved credit stays spent (no refund).
      settled = true

      // Save generation to database. Best-effort and OUTSIDE the refund window:
      // a failed insert must NOT refund, because the content was already earned.
      const { error: insertError } = await supabase
        .from('generations')
        .insert({
          user_id: user.id,
          content: generatedContent,
          image_url: image, // base64 string
        })

      if (insertError) {
        console.error('Error saving generation:', insertError)
      }

      return NextResponse.json(generatedContent)
    } finally {
      // Refund the reserved credit on any failure between reserve and a valid
      // result (Gemini threw/exhausted, hit our deadline, empty/blocked text,
      // or JSON parse failed). Gated by `settled`: at most once, never on
      // success.
      //
      // The deadline above is what makes this block reachable on a hung Gemini
      // call: we abort before the platform kills the function, so the failure
      // is a normal rejection rather than a SIGKILL that skips `finally`.
      // Residual: a platform kill during THIS refund RPC (see DEADLINE_MARGIN_MS),
      // or a Supabase call that itself hangs — neither is bounded here.
      if (!settled) {
        const { error: refundError } = await creditClient.rpc('refund_credit', {
          p_user_id: user.id,
          p_cost: GENERATE_CREDIT_COST,
        })
        if (refundError) {
          console.error('CRITICAL: credit refund failed after failed generation for user', user.id, refundError)
        }
      }
    }
  } catch (error: any) {
    // Reached only AFTER the inner `finally` has refunded the reserved credit.
    if (error instanceof DeadlineExceededError) {
      console.error('Generation deadline exceeded:', error.message)
      return NextResponse.json(
        { error: 'AI service is busy', code: 'DEADLINE_EXCEEDED' },
        { status: 503, headers: { 'Retry-After': '30' } }
      )
    }
    console.error('Generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate content: ' + error.message },
      { status: 500 }
    )
  }
}
