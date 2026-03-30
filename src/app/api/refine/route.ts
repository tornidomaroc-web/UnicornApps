import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
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

    // Parse request body
    const { currentContent, instruction } = await req.json()
    if (!currentContent || !instruction) {
      return NextResponse.json({ error: 'Content and instruction are required' }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'AI features are currently unavailable.' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    // Using gemini-1.5-flash for high-speed refinement
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `You are an elite E-commerce Growth Architect. You are refining existing product copy based on a user instruction.
    
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

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

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

    // Note: No credit deduction as per Phase 3 rules.
    return NextResponse.json(refinedContent)
  } catch (error: any) {
    console.error('Refinement error:', error)
    return NextResponse.json(
      { error: 'Failed to refine content: ' + error.message },
      { status: 500 }
    )
  }
}
