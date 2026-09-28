// Which Gemini models the generate + refine routes may call. PINNED BY NAME.
//
// This module used to ask the API for its model list and serve the first
// stable "flash" model in Google's order. That order is Google's to change
// with no deploy on our side: Google now lists several newer non-preview
// flash models, priced at up to about four times the per-call cost of the
// model every cost figure in this project was measured on, and nothing in CI
// would have noticed the switch. The list below is now the only place a model
// name may appear. Both routes iterate it in order and never name a model
// themselves; a test walks src/ to hold that line.
//
// PRIMARY — gemini-2.5-flash: the model the measured per-generation cost rests
// on ($0.30 in / $2.50 out per 1M tokens on Google's pricing page, read
// 2026-09-28).
//
// FALLBACK — gemini-3.5-flash-lite, tried only when the primary reports a
// TRANSIENT overload (never on quota, never on a missing model). Chosen because
// (a) Google's pricing page lists it at exactly the primary's price, so the
// cost bound per call does not depend on which of the two served; (b) Google's
// models page directs new projects to it, so of the candidates it is the least
// likely to be withdrawn; (c) gemini-2.5-flash-lite, though cheaper, is on the
// same "past active users only" access list as the primary and was never
// served here, so a fallback to it would most likely answer 404 exactly when
// it is needed. Its output quality on this schema is UNMEASURED;
// usage_events.model records every call it serves, so the ledger will say how
// often that happens and what it cost.
//
// A model that is retired, renamed or not enabled for this project is NOT a
// reason to try the other entry: that is a pricing decision, not an outage,
// and a person has to make it. It fails loud instead — see ModelNotFoundError.
export const GEMINI_MODELS = Object.freeze(['gemini-2.5-flash', 'gemini-3.5-flash-lite'] as const)
export const PRIMARY_GEMINI_MODEL = GEMINI_MODELS[0]
export const FALLBACK_GEMINI_MODEL = GEMINI_MODELS[1]

// How many generateContent calls a single request may make: one per pinned
// model, in order. Every attempt is a real, billed call, so this is a cost
// multiplier, not a retry count — the rate limiter is sized against requests
// x this number. Derived from the list so the two cannot drift apart.
export const MAX_MODEL_ATTEMPTS = GEMINI_MODELS.length

// Thrown when Gemini reports a QUOTA fact. Trying another model would be waste
// (see classifyGeminiError), so the routes stop immediately and answer 503
// rather than burning the rest of the budget on calls that will also fail.
export class QuotaExhaustedError extends Error {
  constructor(message = 'Gemini quota exhausted') {
    super(message)
    this.name = 'QuotaExhaustedError'
  }
}

/** One greppable token for the log line both routes emit when a pinned model is gone. */
export const MODEL_NOT_FOUND_TAG = 'gemini-model-not-found'

/**
 * Thrown when Gemini answers that a PINNED model does not exist for this key:
 * retired, renamed, or never enabled for this project. The routes stop at once
 * (no other model is tried), refund the reserved credit through their
 * `finally`, log ONE line carrying MODEL_NOT_FOUND_TAG, and answer 503 — which
 * the client maps by status to the existing translated "AI service is busy"
 * message. The failure is therefore visible in the log on the first request,
 * and the user never sees Google's English.
 */
export class ModelNotFoundError extends Error {
  readonly model: string
  readonly status: number
  readonly upstreamMessage: string

  constructor(model: string, status: number, upstreamMessage: string) {
    super(`Gemini model ${model} not found (HTTP ${status})`)
    this.name = 'ModelNotFoundError'
    this.model = model
    this.status = status
    this.upstreamMessage = upstreamMessage
  }
}

/**
 * The single-line diagnostic for a ModelNotFoundError. Identical in both
 * routes, so one grep for MODEL_NOT_FOUND_TAG finds every occurrence. Carries
 * the pinned list so the reader sees at once what the code expected to serve.
 * NEVER THROWS: a fault here degrades to a marker line rather than turning the
 * 503 into a 500.
 */
export function formatModelNotFound(route: 'generate' | 'refine', err: ModelNotFoundError): string {
  try {
    return `${MODEL_NOT_FOUND_TAG} ${JSON.stringify({
      route,
      model: err.model,
      status: err.status,
      pinned: GEMINI_MODELS,
      upstream: String(err.upstreamMessage ?? '').slice(0, 500),
    })}`
  } catch {
    return `${MODEL_NOT_FOUND_TAG} {"route":"${route}","diagnosticFailed":true}`
  }
}

export type GeminiErrorClass =
  // Key/project-level: the quota bucket is shared across ALL models on this key,
  // so a different model on the SAME key will fail too. Do NOT fall back.
  | 'quota'
  // The named model does not exist for this key: 404, or a message saying the
  // model is not found / not supported / not enabled. With models pinned by
  // name this is a decision for a person, not something to route around.
  | 'model_not_found'
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
 * message, a 429 carrying "overloaded", a 404 carrying "quota"). That ordering
 * is deliberate and rests on an ASYMMETRIC COST: calling a genuine overload
 * "quota" costs one lost retry; calling quota "overload" costs MAX_MODEL_ATTEMPTS
 * billed calls at the exact moment quota is already exhausted. Those are not
 * comparable, so we bias to quota.
 *
 * MODEL_NOT_FOUND IS TESTED SECOND, before transient, because a missing model
 * must never be read as an outage and retried on the other entry: the whole
 * point of pinning is that no request is ever served by a model nobody chose.
 *
 * Note `quota` / `resource exhausted` used to sit in the FALLBACK regex — they
 * were the most damaging entries in it.
 */
export function classifyGeminiError(status: number, message: string): GeminiErrorClass {
  if (status === 429) return 'quota'
  if (/quota|resource.?exhausted|rate.?limit/i.test(message)) return 'quota'
  if (status === 404) return 'model_not_found'
  if (/not found|not supported for generateContent|does not have access to|not have permission to use/i.test(message)) {
    return 'model_not_found'
  }
  if (status === 503) return 'transient'
  if (/high demand|overloaded|temporarily|unavailable/i.test(message)) return 'transient'
  return 'fatal'
}
