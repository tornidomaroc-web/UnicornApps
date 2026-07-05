import { createClient } from '@/lib/supabase/server'
import { GENERATE_CREDIT_COST, createServiceClient, tryDeductCredits } from '@/lib/credits'
import { isRetryableGeminiError, resolveGeminiModels } from '@/lib/gemini'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
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

    // 1. Check user credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (profile.credits < GENERATE_CREDIT_COST) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 })
    }

    // 2. Parse request body
    const { image, lang } = await req.json()
    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    const isArabic = lang === 'ar'
    const languageInstruction = isArabic 
      ? "\nGENERATE ALL CONTENT IN ARABIC LANGUAGE. All titles, descriptions, bullet points, hashtags and hooks must be in Arabic." 
      : "\nGENERATE ALL CONTENT IN ENGLISH LANGUAGE."

    // 3. Initialize Gemini DYNAMICALLY
    const geminiApiKey = process.env.GEMINI_API_KEY

    if (!geminiApiKey) {
      console.error('SERVER ERROR: GEMINI_API_KEY is missing from environment variables.')
      return NextResponse.json(
        { error: 'Server configuration error. AI features are currently unavailable.' },
        { status: 500 }
      )
    }

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

    // Try candidates in order; fall back when a model is over capacity.
    let result: Awaited<ReturnType<ReturnType<typeof genAI.getGenerativeModel>['generateContent']>> | null = null
    let lastError: any = null
    for (const modelName of candidates) {
      try {
        // Cap output tokens to bound per-call cost. 8192 matches the value
        // /api/refine already uses and validated against JSON truncation on
        // thinking models (2048 truncated mid-array there); both routes return
        // essentially the same schema.
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { maxOutputTokens: 8192 },
        })
        result = await model.generateContent([prompt, imagePart])
        break
      } catch (e: any) {
        lastError = e
        const status = e?.status ?? e?.response?.status ?? 0
        if (!isRetryableGeminiError(status, String(e?.message ?? ''))) throw e
        console.warn(`Gemini ${modelName} over capacity, trying next model`)
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
      return NextResponse.json(
        { error: 'AI generation failed due to formatting issues. Please try again.' },
        { status: 422 }
      )
    }

    // 4. Deduct credits (compare-and-swap so parallel calls can't write a
    // stale balance; service client so it doesn't lean on the user-update
    // RLS policy)
    const creditClient = createServiceClient() ?? supabase
    const deducted = await tryDeductCredits(creditClient, user.id, GENERATE_CREDIT_COST)
    if (!deducted) {
      console.error('Credit deduction failed after successful generation for user', user.id)
      // We still return the content even if credit deduction fails,
      // but in production, you might want to handle this more strictly.
    }

    // 5. Save generation to database
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
  } catch (error: any) {
    console.error('Generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate content: ' + error.message },
      { status: 500 }
    )
  }
}
