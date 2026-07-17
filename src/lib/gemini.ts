import type { Deadline } from '@/lib/deadline'

// Shared Gemini model resolution for the generate + refine routes.
//
// We never hardcode a versioned model id: Google retires preview models with
// short notice, and the available set differs per API key / region. Instead we
// ask the API what is available and pick the first stable flash-class text
// model. The result is cached in module scope so warm serverless invocations
// skip the extra round-trip (Vercel reuses the process between requests).

const CACHE_TTL_MS = 60 * 60 * 1000

/**
 * The last list we successfully resolved, kept for the whole process lifetime.
 *
 * Only ever assigned on SUCCESS (below), and never cleared — so once the TTL
 * expires this still holds the previous list. CACHE_TTL_MS controls whether the
 * entry is served FRESH, not whether it is kept. That is what makes the
 * stale-while-error fallback below a few lines rather than a restructuring.
 *
 * NOTE the real bound on staleness is PROCESS LIFETIME, not CACHE_TTL_MS: this
 * is module scope, so it dies with the serverless process and is never shared
 * across instances. At this project's traffic (a 20 RPD ceiling) most
 * invocations are COLD, so `cached` is usually null — see the fallback's own
 * comment for what that means for its real-world value.
 */
let cached: { names: string[]; at: number } | null = null

/**
 * How long the ListModels call may take before we abort it.
 *
 * THIS IS A JUDGEMENT, NOT A MEASUREMENT — exactly like SINGLE_ATTEMPT_FLOOR_MS
 * and DEADLINE_MARGIN_MS in @/lib/deadline, and blocked on the same missing data
 * (CLAUDE.md item 27: usage_events records COST, never LATENCY, so no p50/p95
 * for this call exists). Revisit once elapsed time is actually recorded.
 *
 * Reasoning for 10s: this is a small metadata GET, realistically sub-second and
 * perhaps 1-2s with a cold TLS handshake, so 10s is generous against reality. It
 * leaves ~46s of the 56s budget — room for MAX_MODEL_ATTEMPTS attempts above the
 * 8s floor. And a metadata call that has not answered in 10s is not going to.
 *
 * Sizing this SHORT is the point. The naive fix — reusing the route deadline's
 * own signal — aborts at ~56s: it prevents the platform kill but still burns the
 * user's entire wait and leaves no budget to generate. A hang should cost the
 * user ~10s, not ~56s.
 */
export const RESOLVE_TIMEOUT_MS = 10_000

/**
 * Thrown when we cannot obtain a usable model list AND have no cached list to
 * fall back on. The routes answer 503 + Retry-After, which maps to dash.aiBusy
 * (EN/AR) by STATUS in @/lib/api-error.ts — no new i18n key, same treatment
 * QuotaExhaustedError already gets.
 *
 * An ordinary Error, so it unwinds normally. Nothing is reserved at this point
 * (reserve_credit runs AFTER resolution in both routes), so no credit is at risk
 * on this path and there is nothing to refund.
 */
export class ModelResolutionError extends Error {
  constructor(message = 'Could not resolve a Gemini model') {
    super(message)
    this.name = 'ModelResolutionError'
  }
}

// Specialized variants that also report generateContent support but are wrong
// for text/vision content work.
const EXCLUDED_VARIANTS = /tts|image|audio|robotics|computer-use|deep-research|lyria|nano-banana|gemma/

// Ranked candidate list: stable flash models first, then preview flashes,
// then everything else. Callers try candidates in order so a transient
// "model is experiencing high demand" error on one model falls back to the
// next instead of failing the user's request.
export async function resolveGeminiModels(
  apiKey: string,
  deadline?: Deadline
): Promise<string[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.names

  // Never outlive the route's own wall. Without the clamp a 10s timeout could
  // still start with 3s of budget left and be killed by the platform mid-wait.
  const budgetMs = deadline
    ? Math.min(RESOLVE_TIMEOUT_MS, Math.max(0, deadline.remainingMs()))
    : RESOLVE_TIMEOUT_MS

  // An OWNED controller, not AbortSignal.timeout(): the timer must be clearable
  // (a fast success would otherwise leave a 10s timer pending on a warm, reused
  // process) and AbortSignal.timeout() is untestable under jest fake timers.
  // Both lessons are from PR #31 (@/lib/deadline).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), budgetMs)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: controller.signal }
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
  } catch (err: any) {
    // STALE-WHILE-ERROR. A timeout only turns a hang into a FASTER failure; this
    // turns it into a SUCCESS, which is what actually matters against a hard
    // 20 RPD ceiling where a failure delivers nothing.
    //
    // Covers every way we can fail to get a fresh usable list — abort, network
    // error, non-2xx (incl. a 429 on ListModels itself), malformed body, or a
    // list with nothing usable. In all of them a list we resolved earlier in
    // THIS process is better evidence than nothing.
    //
    // HONEST SIZING — this is narrower than it looks. `cached` is module scope,
    // so it only exists on a WARM process that already resolved once. At a 20 RPD
    // ceiling most invocations are cold, `cached` is null, and this branch does
    // nothing. It is a real win where it applies, not a general availability net.
    //
    // ACCEPTED TRADEOFF: if the stale list's top model has since been RETIRED,
    // the generateContent call fails 'fatal' and burns one call from the 20 RPD
    // budget — worse than failing here, which burns none. Accepted because it is
    // compound-rare (ListModels broken AND the model retired), staleness is
    // bounded by process lifetime rather than accumulating, the credit is still
    // refunded by the routes' `finally`, and usage_events.model would now DETECT
    // a served-model change for the first time. Deliberately NOT bounded by an
    // extra max-age constant: that number would be unmeasured, would essentially
    // never fire (the process dies first), and would rot exactly like
    // CREDIT_BALANCE_CAP did (CLAUDE.md item 8).
    if (cached) {
      console.warn(
        `resolveGeminiModels: refresh failed (${err?.name ?? 'Error'}: ${err?.message ?? err}); ` +
          `serving ${cached.names.length} cached model(s) resolved ${Date.now() - cached.at}ms ago`
      )
      return cached.names
    }
    // Distinguish OUR abort from anything else, so the log says which.
    if (controller.signal.aborted) {
      throw new ModelResolutionError(
        `Timed out listing Gemini models after ${budgetMs}ms with no cached list to fall back on`
      )
    }
    throw new ModelResolutionError(
      `Could not list Gemini models and no cached list to fall back on: ${err?.message ?? err}`
    )
  } finally {
    // Without this a fast success leaves the timer pending on a warm process.
    clearTimeout(timer)
  }
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
