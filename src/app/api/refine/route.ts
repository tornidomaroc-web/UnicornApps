import { createClient } from '@/lib/supabase/server'
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

    // ARCHITECTURE: Direct REST API Bypass to Gemini 3.1 Flash-Lite
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${geminiApiKey}`

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
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
      }
    }

    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    const data = await apiResponse.json()

    if (!apiResponse.ok) {
      console.error('Gemini 2.0 REST Error:', data)
      throw new Error(data.error?.message || 'Failed to communicate with Gemini 2.0 API')
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

    return NextResponse.json(refinedContent)
  } catch (error: any) {
    console.error('Refinement error:', error)
    return NextResponse.json(
      { error: 'Failed to refine content: ' + error.message },
      { status: 500 }
    )
  }
}
