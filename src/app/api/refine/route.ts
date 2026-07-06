import { createClient } from '@/lib/supabase/server'
import { REFINE_CREDIT_COST, createServiceClient } from '@/lib/credits'
import { isRetryableGeminiError, resolveGeminiModels } from '@/lib/gemini'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
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
        apiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }
        )
        data = await apiResponse.json()
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
      // result (Gemini failed/exhausted, empty response, or JSON parse failed).
      // Gated by `settled`: at most once, never on success. Residual: a hard
      // function timeout/SIGKILL here skips `finally` and leaves the user down
      // one credit (unrecoverable without manual/periodic intervention).
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
    console.error('Refinement error:', error)
    return NextResponse.json(
      { error: 'Failed to refine content: ' + error.message },
      { status: 500 }
    )
  }
}
