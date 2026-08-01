import { createClient } from '@/lib/supabase/server'
import { REFINE_CREDIT_COST, createServiceClient } from '@/lib/credits'
import {
  classifyGeminiError,
  resolveGeminiModels,
  MAX_MODEL_ATTEMPTS,
  ModelResolutionError,
  QuotaExhaustedError,
} from '@/lib/gemini'
import { checkRateLimit } from '@/lib/rate-limit'
import { recordUsage } from '@/lib/usageTelemetry'
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
      // No `error` prose: see the note on the catch-all 500 at the bottom of this
      // file. `code` is for our logs and telemetry, never for display.
      console.error('Refine: Supabase client is null. Environment variables missing.')
      return NextResponse.json({ code: 'SERVER_MISCONFIGURED' }, { status: 500 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // Cheap validation BEFORE touching credits — a malformed request must never
    // reserve (and then have to refund) a credit.
    const { currentContent, instruction, lang } = await req.json()
    if (!currentContent || !instruction) {
      return NextResponse.json({ code: 'INVALID_REQUEST' }, { status: 400 })
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
      console.error('Refine: GEMINI_API_KEY is missing from environment variables.')
      return NextResponse.json({ code: 'AI_UNAVAILABLE' }, { status: 500 })
    }

    // Same dynamic model lookup as the generate route — never pin a version.
    // Resolved BEFORE the reserve so a resolution failure touches NO credit.
    // Passing the deadline bounds the ListModels round-trip (RESOLVE_TIMEOUT_MS,
    // clamped to what is left of the wall): unbounded, a hang here ran to the
    // platform kill, which is not a JS exception, so no catch ran and the user
    // waited ~60s for an opaque 504.
    const candidates = (await resolveGeminiModels(geminiApiKey, deadline)).slice(
      0,
      MAX_MODEL_ATTEMPTS
    )

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
      return NextResponse.json({ code: 'SERVER_MISCONFIGURED' }, { status: 500 })
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
      // Telemetry bookkeeping (item 23). `modelName` is loop-scoped and dies with
      // the iteration, so the model that actually served the call is NOT in scope
      // at the capture sites below. Inert: nothing reads these except recordUsage.
      let usedModel: string | null = null
      let attempts = 0
      for (const modelName of candidates) {
        usedModel = modelName
        attempts++
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
        const message = data?.error?.message || ''
        const errorClass = classifyGeminiError(apiResponse.status, message)
        // QUOTA is a fact about the KEY, not the model: the next candidate shares
        // the same quota bucket and would fail too. Stop now rather than burn
        // another call. Thrown from INSIDE this try so `finally` still refunds.
        if (errorClass === 'quota') throw new QuotaExhaustedError()
        // 'fatal' breaks to the existing !ok throw below -> 500, as before.
        if (errorClass === 'fatal') break
        console.warn(`Gemini ${modelName} overloaded (${apiResponse.status}), trying next model`)
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
        // TELEMETRY — WE PAY FOR THIS CALL AND THE CUSTOMER DOES NOT (item 23).
        // Gemini SUCCEEDED: it consumed input, emitted output, and under billing
        // we are charged IN FULL. Only the JSON failed to parse, so `settled`
        // stays false, the `finally` refunds the credit, and the user pays
        // nothing. Biased expensive — a parse failure at the 8192 ceiling is
        // usually a TRUNCATED response that burned the whole output budget.
        //
        // Awaited and swallowed inside recordUsage, so the 422 STAYS a 422: an
        // unswallowed throw would unwind through the `finally` (the refund still
        // runs) and surface as a 500.
        await recordUsage({
          client: creditClient,
          userId: user.id,
          route: 'refine',
          outcome: 'parse_failed',
          model: usedModel,
          attempts,
          usageMetadata: data?.usageMetadata,
        })
        // settled stays false -> `finally` refunds the reserved credit.
        //
        // Was `error: 'AI refinement failed due to formatting issues.'`, which
        // resolveApiError showed VERBATIM — untranslated English in the Arabic
        // UI, the §6 violation PR #64 named but deliberately left open because
        // the replacement copy did not exist yet. The code now maps to
        // dash.refineFormatFailed (EN/AR), whose "try a different instruction"
        // is correct HERE and nowhere else on this route.
        return NextResponse.json({ code: 'REFINE_FORMAT_FAILED' }, { status: 422 })
      }

      // Content earned -> the reserved credit stays spent (no refund).
      settled = true

      // TELEMETRY (item 23). Best-effort and OUTSIDE the refund window: a
      // telemetry failure must NEVER refund a credit whose content was already
      // earned. recordUsage swallows every failure.
      //
      // NOTE: this is the FIRST post-settle await in this route (/api/generate
      // already had one — its `generations` insert), so it adds tail latency here
      // that did not exist before. It is a single small insert, well inside the
      // 60s wall.
      await recordUsage({
        client: creditClient,
        userId: user.id,
        route: 'refine',
        outcome: 'success',
        model: usedModel,
        attempts,
        usageMetadata: data?.usageMetadata,
      })

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
    if (error instanceof QuotaExhaustedError) {
      // Google's own quota is exhausted (distinct from RATE_LIMITED, which is OUR
      // limiter throttling this user). 503 maps to dash.aiBusy (EN/AR) by STATUS
      // in src/lib/api-error.ts — previously this fell through to a 500 that
      // leaked Google's untranslated English message to the user.
      console.error('Gemini quota exhausted (upstream)')
      return NextResponse.json(
        { error: 'AI service is busy', code: 'UPSTREAM_QUOTA_EXHAUSTED' },
        { status: 503, headers: { 'Retry-After': '60' } }
      )
    }
    if (error instanceof DeadlineExceededError) {
      console.error('Refinement deadline exceeded:', error.message)
      return NextResponse.json(
        { error: 'AI service is busy', code: 'DEADLINE_EXCEEDED' },
        { status: 503, headers: { 'Retry-After': '30' } }
      )
    }
    if (error instanceof ModelResolutionError) {
      // Could not list models and had no cached list. 503 maps to dash.aiBusy
      // (EN/AR) by STATUS in src/lib/api-error.ts; previously this fell through
      // to the 500 below, which answers the generic dash.requestFailed.
      // Nothing was reserved (resolution runs BEFORE reserve_credit), so there
      // is no credit to refund on this path.
      console.error('Gemini model resolution failed:', error.message)
      return NextResponse.json(
        { error: 'AI service is busy', code: 'MODEL_RESOLUTION_FAILED' },
        { status: 503, headers: { 'Retry-After': '30' } }
      )
    }
    // THE FULL DETAIL STAYS HERE, SERVER SIDE. The response carries no prose.
    //
    // `resolveApiError` trusts any `error` string OUR OWN routes send and shows it
    // to the user verbatim (that is what makes the 422 and 403 strings work). This
    // catch-all is the one place where that string was built from an exception, so
    // `error.message` reached the user untranslated: raw English in the Arabic UI,
    // the exact bug class src/lib/api-error.ts exists to end, and it also leaked
    // internal failure text to anyone who could make this route throw.
    //
    // With no `error` field the client falls through to the translated
    // dash.requestFailed, which is what the ModelResolutionError comment above
    // already claimed this 500 did.
    console.error('Refinement error:', error)
    return NextResponse.json({ code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
