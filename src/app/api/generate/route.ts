import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
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
    const geminiApiKey = process.env.GEMINI_API_KEY!
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

    const prompt = `You are an expert E-commerce Copywriter. Analyze this product image and output ONLY a valid JSON object with these exact keys: 
    "seoTitle" (max 60 chars), 
    "metaDescription" (max 160 chars), 
    "productDescription" (detailed, based on visible features), 
    "socialMediaTags" (array of 5 hashtags).`

    const result = await model.generateContent([prompt, imagePart])
    const response = await result.response
    const text = response.text()

    // Clean response text to ensure it's valid JSON (Gemini sometimes adds markdown blocks)
    const cleanedText = text.replace(/```json|```/g, '').trim()
    const generatedContent = JSON.parse(cleanedText)

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

    return NextResponse.json(generatedContent)
  } catch (error: any) {
    console.error('Generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate content: ' + error.message },
      { status: 500 }
    )
  }
}
