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

// How many candidates a single request may try. Every attempt is a real
// generateContent call against a SHARED free-tier quota (5 RPM / 20 RPD for the
// whole app), so this is a quota multiplier, not just a retry count: one request
// can burn up to this many calls. Kept at 2 — the candidate list is rank-sorted,
// so the 2nd entry carries most of the resilience value while the 3rd is
// typically a lower-quality preview model that still costs a full call.
export const MAX_MODEL_ATTEMPTS = 2

// Thrown when Gemini reports a QUOTA fact. Trying another model would be waste
// (see classifyGeminiError), so the routes stop immediately and answer 503
// rather than burning the rest of the budget on calls that will also fail.
export class QuotaExhaustedError extends Error {
  constructor(message = 'Gemini quota exhausted') {
    super(message)
    this.name = 'QuotaExhaustedError'
  }
}

export type GeminiErrorClass =
  // Key/project-level: the quota bucket is shared across ALL models on this key,
  // so a different model on the SAME key will fail too. Do NOT fall back.
  | 'quota'
  // This model is genuinely overloaded/down. Another model CAN succeed —
  // this is the only case where falling back earns its cost.
  | 'transient'
  // Our bug or their refusal (400, safety block, malformed request). Retrying
  // any model is pointless.
  | 'fatal'

/**
 * Classify a Gemini failure to decide whether falling back to another model can
 * possibly help.
 *
 * QUOTA IS TESTED FIRST, so it wins every ambiguous case (a 503 carrying a quota
 * message, a 429 carrying "overloaded"). That ordering is deliberate and rests on
 * an ASYMMETRIC COST: calling a genuine overload "quota" costs one lost retry;
 * calling quota "overload" costs MAX_MODEL_ATTEMPTS x the daily budget at the
 * exact moment the budget is already exhausted. Against a 20 RPD ceiling those
 * are not comparable, so we bias to quota.
 *
 * Note `quota` / `resource exhausted` used to sit in the FALLBACK regex — they
 * were the most damaging entries in it.
 */
export function classifyGeminiError(status: number, message: string): GeminiErrorClass {
  if (status === 429) return 'quota'
  if (/quota|resource.?exhausted|rate.?limit/i.test(message)) return 'quota'
  if (status === 503) return 'transient'
  if (/high demand|overloaded|temporarily|unavailable/i.test(message)) return 'transient'
  return 'fatal'
}
