import { createClient } from '@/lib/supabase/server'
import { REFINE_CREDIT_COST, createServiceClient } from '@/lib/credits'
import { isRetryableGeminiError, resolveGeminiModels } from '@/lib/gemini'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  createDeadline,
  DeadlineExceededError,
  SINGLE_ATTEMPT_FLOOR_MS,
} from '@/lib/deadline'
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
      return NextResponse.json(
        { error: 'Server configuration error.' },
        { status: 500 }
      )
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Cheap validation BEFORE touching credits — a malformed request must never
    // reserve (and then have to refund) a credit.
    const { currentContent, instruction, lang } = await req.json()
    if (!currentContent || !instruction) {
      return NextResponse.json({ error: 'Content and instruction are required' }, { status: 400 })
    }

    // Rate limit BEFORE any Gemini work (incl. the resolveGeminiModels ListModels
    // quota call) and BEFORE reserve_credit: a throttled request does zero Gemini
    // work and never touches a credit. The 429 maps to dash.aiBusy (EN/AR) via
    // src/lib/api-error.ts by STATUS, so no new UX is needed. checkRateLimit fails
    // OPEN on any error, so a limiter fault can never block refinement here.
    const rateLimit = await checkRateLimit(user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'AI service is busy', code: 'RATE_LIMITED', scope: rateLimit.scope },
        { status: 429, headers: { 'Retry-After': '30' } }
      )
    }

    const isArabic = lang === 'ar'
    const languageInstruction = isArabic
      ? "\nGENERATE ALL REFINED CONTENT IN ARABIC LANGUAGE. All titles, descriptions, bullet points, hashtags and hooks must be in Arabic."
      : "\nGENERATE ALL REFINED CONTENT IN ENGLISH LANGUAGE."

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'AI features are currently unavailable.' },
        { status: 500 }
      )
    }

    // Same dynamic model lookup as the generate route — never pin a version.
    // Resolved BEFORE the reserve so a resolution failure is a 500 with NO
    // credit touched.
    const candidates = (await resolveGeminiModels(geminiApiKey)).slice(0, 3)

    const prompt = `You are an elite E-commerce Growth Architect. You are refining existing product copy based on a user instruction.
    ${languageInstruction}

    CURRENT CONTENT:
    ${JSON.stringify(currentContent, null, 2)}

    USER INSTRUCTION:
    "${instruction}"

    Return ONLY a valid JSON object with the EXACT SAME schema as the input. Update the fields based on the instruction while maintaining professional e-commerce standards.
    Schema to follow:
    {
      "seoTitle": "String",
      "metaDescription": "String",
      "productDescription": "String",
      "shopifyHtml": "HTML string",
      "amazonBullets": ["Array of 5 strings"],
      "structuredData": {
        "material": "String",
        "dominantColor": "String",
        "targetAudience": "String",
        "careInstructions": "String"
      },
      "viralScript": {
        "hook": "String",
        "concept": "String"
      },
      "socialMediaTags": ["Array of 5 strings"],
      "dynamicTheme": {
        "dominantColorHex": "String",
        "accentColorHex": "String"
      },
      "hotspots": [
        {
          "x": "Number",
          "y": "Number",
          "label": "String"
        }
      ]
    }

    Ensure the response is ONLY the JSON object, no markdown or backticks.`

    // Constructing the REST Payload identical to working generate route structure
    const payload = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        // Thinking models (2.5+) spend output tokens on reasoning before the
        // answer; 2048 truncated the JSON mid-array. JSON mode also stops the
        // model from wrapping the object in markdown fences.
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      }
    }

    // Reserve the credit BEFORE the billable Gemini call. reserve_credit is a
    // single atomic decrement-if-sufficient (row-locked RPC): of N parallel
    // requests on a 1-credit balance, exactly one wins the reserve; the rest get
    // `false` and are rejected WITHOUT calling Gemini. This replaces the old
    // unlocked read-then-check. The reserved credit is refunded in the `finally`
    // below if the billable call fails. (Kept identical to /api/generate.)
    const creditClient = createServiceClient() ?? supabase
    const { data: reserved, error: reserveError } = await creditClient.rpc('reserve_credit', {
      p_user_id: user.id,
      p_cost: REFINE_CREDIT_COST,
    })
    if (reserveError) {
      // Reserve never committed -> nothing to refund. Fail closed (deny) rather
      // than risk a free refinement. Also the path when the service-role key is
      // absent: EXECUTE on reserve_credit is locked to service_role.
      console.error('Credit reserve failed for user', user.id, reserveError)
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
    }
    if (!reserved) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 })
    }

    // From here the credit is spent. Every exit path must either RETURN content
    // (credit earned -> settled=true) or leave settled=false so `finally`
    // refunds. Content is NEVER returned on a Gemini/parse failure.
    let settled = false
    try {
      // Try candidates in order; fall back when a model is over capacity.
      let apiResponse: Response | null = null
      let data: any = null
      for (const modelName of candidates) {
        // Never START an attempt we cannot finish inside the wall. Throws
        // DeadlineExceededError, which unwinds through the `finally` below and
        // refunds the credit. This can cut the fallback loop short when time
        // runs out — a consequence of the budget, not a change to the fan-out
        // policy.
        deadline.assertBudget(SINGLE_ATTEMPT_FLOOR_MS)
        const attempt = deadline.attemptSignal()
        try {
          apiResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: attempt.signal
            }
          )
          data = await apiResponse.json()
        } catch (e: any) {
          // Our deadline timer is the ONLY thing that aborts this signal, so
          // this is an exact test. Rethrown as DeadlineExceededError so the
          // outer catch can answer 503. Any other fetch/JSON error propagates
          // exactly as it did before this change.
          if (attempt.signal.aborted) throw new DeadlineExceededError()
          throw e
        } finally {
          attempt.cancel()
        }
        if (apiResponse.ok) break
        const message = data.error?.message || ''
        if (!isRetryableGeminiError(apiResponse.status, message)) break
        console.warn(`Gemini ${modelName} over capacity (${apiResponse.status}), trying next model`)
      }

      if (!apiResponse || !apiResponse.ok) {
        console.error('Gemini REST error:', data)
        throw new Error(data?.error?.message || 'Failed to communicate with the Gemini API')
      }

      // Extracting text from REST response schema
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

      if (!text) {
        throw new Error('AI returned an empty response')
      }

      // JSON PROTECTION: Cleaning markdown from response
      const cleanedText = text.replace(/```json|```/gi, '').trim()
      let refinedContent;
      try {
        refinedContent = JSON.parse(cleanedText)
      } catch (parseError) {
        console.error('Refinement Parse Error:', cleanedText)
        // settled stays false -> `finally` refunds the reserved credit.
        return NextResponse.json(
          { error: 'AI refinement failed due to formatting issues.' },
          { status: 422 }
        )
      }

      // Content earned -> the reserved credit stays spent (no refund).
      settled = true
      return NextResponse.json(refinedContent)
    } finally {
      // Refund the reserved credit on any failure between reserve and a valid
      // result (Gemini failed/exhausted, hit our deadline, empty response, or
      // JSON parse failed). Gated by `settled`: at most once, never on success.
      //
      // The deadline above is what makes this block reachable on a hung Gemini
      // call: we abort before the platform kills the function, so the failure
      // is a normal rejection rather than a SIGKILL that skips `finally`.
      // Residual: a platform kill during THIS refund RPC (see DEADLINE_MARGIN_MS),
      // or a Supabase call that itself hangs — neither is bounded here.
      if (!settled) {
        const { error: refundError } = await creditClient.rpc('refund_credit', {
          p_user_id: user.id,
          p_cost: REFINE_CREDIT_COST,
        })
        if (refundError) {
          console.error('CRITICAL: credit refund failed after failed refine for user', user.id, refundError)
        }
      }
    }
  } catch (error: any) {
    // Reached only AFTER the inner `finally` has refunded the reserved credit.
    if (error instanceof DeadlineExceededError) {
      console.error('Refinement deadline exceeded:', error.message)
      return NextResponse.json(
        { error: 'AI service is busy', code: 'DEADLINE_EXCEEDED' },
        { status: 503, headers: { 'Retry-After': '30' } }
      )
    }
    console.error('Refinement error:', error)
    return NextResponse.json(
      { error: 'Failed to refine content: ' + error.message },
      { status: 500 }
    )
  }
}
