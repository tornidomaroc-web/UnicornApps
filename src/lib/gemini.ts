// Shared Gemini model resolution for the generate + refine routes.
//
// We never hardcode a versioned model id: Google retires preview models with
// short notice, and the available set differs per API key / region. Instead we
// ask the API what is available and pick the first stable flash-class text
// model. The result is cached in module scope so warm serverless invocations
// skip the extra round-trip (Vercel reuses the process between requests).

const CACHE_TTL_MS = 60 * 60 * 1000

let cached: { names: string[]; at: number } | null = null

// Specialized variants that also report generateContent support but are wrong
// for text/vision content work.
const EXCLUDED_VARIANTS = /tts|image|audio|robotics|computer-use|deep-research|lyria|nano-banana|gemma/

// Ranked candidate list: stable flash models first, then preview flashes,
// then everything else. Callers try candidates in order so a transient
// "model is experiencing high demand" error on one model falls back to the
// next instead of failing the user's request.
export async function resolveGeminiModels(apiKey: string): Promise<string[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.names

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  )
  if (!res.ok) {
    throw new Error(`Could not list Gemini models (HTTP ${res.status})`)
  }
  const data = await res.json()

  const usable = (data.models ?? []).filter(
    (m: any) =>
      m.supportedGenerationMethods?.includes('generateContent') &&
      /gemini-\d/.test(m.name ?? '') &&
      !EXCLUDED_VARIANTS.test(m.name)
  )

  const rank = (name: string) =>
    (name.includes('flash') ? 0 : 2) + (name.includes('preview') ? 1 : 0)
  const names: string[] = usable
    .map((m: any) => m.name.replace('models/', ''))
    .sort((a: string, b: string) => rank(a) - rank(b))

  if (!names.length) {
    throw new Error('No compatible Gemini models found in this environment.')
  }

  cached = { names, at: Date.now() }
  return names
}

// True for quota / capacity errors where trying another model can succeed.
export function isRetryableGeminiError(status: number, message: string): boolean {
  return (
    status === 429 ||
    status === 503 ||
    /high demand|overloaded|temporarily|quota|resource.?exhausted/i.test(message)
  )
}
