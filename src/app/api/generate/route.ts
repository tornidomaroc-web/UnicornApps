import { createClient } from '@/lib/supabase/server'
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

    if (profile.credits <= 0) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 403 })
    }

    // 2. Parse request body
    const { image } = await req.json()
    if (!image) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 })
    }

    // 3. Initialize Gemini DYNAMICALLY
    const geminiApiKey = process.env.GEMINI_API_KEY

    if (!geminiApiKey) {
      console.error('SERVER ERROR: GEMINI_API_KEY is missing from environment variables.')
      return NextResponse.json(
        { error: 'Server configuration error. AI features are currently unavailable.' },
        { status: 500 }
      )
    }

    const modelsResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`
    )
    const modelsData = await modelsResponse.json()

    const dynamicModel = modelsData.models?.find(
      (m: any) =>
        m.supportedGenerationMethods?.includes('generateContent') && m.name?.includes('gemini')
    )

    if (!dynamicModel) {
      throw new Error('No compatible Gemini models found in this environment.')
    }

    const modelName = dynamicModel.name.replace('models/', '')
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: modelName })

    // Prepare image for Gemini (assuming base64)
    const base64Data = image.split(',')[1] || image
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg', // Standardizing on jpeg for analysis
      },
    }

    const prompt = `You are an elite E-commerce Growth Architect. Analyze the product image and return ONLY a valid JSON object with this EXACT schema, no formatting or backticks:
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
  }
}`

    const result = await model.generateContent([prompt, imagePart])
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

    // 4. Deduct 1 credit
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error deducting credit:', updateError)
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
