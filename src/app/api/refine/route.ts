import { createClient } from '@/lib/supabase/server'
import { REFINE_CREDIT_COST, createServiceClient, tryDeductCredits } from '@/lib/credits'
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

    // Check user credits — same gate as the generate route
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.credits < REFINE_CREDIT_COST) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 })
    }

    // Parse request body
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
      return NextResponse.json(
        { error: 'AI refinement failed due to formatting issues.' },
        { status: 422 }
      )
    }

    // Deduct only after a successful refinement — capacity fallbacks and
    // parse failures above must never charge the user.
    const creditClient = createServiceClient() ?? supabase
    const deducted = await tryDeductCredits(creditClient, user.id, REFINE_CREDIT_COST)
    if (!deducted) {
      console.error('Credit deduction failed after successful refine for user', user.id)
    }

    return NextResponse.json(refinedContent)
  } catch (error: any) {
    console.error('Refinement error:', error)
    return NextResponse.json(
      { error: 'Failed to refine content: ' + error.message },
      { status: 500 }
    )
  }
}
