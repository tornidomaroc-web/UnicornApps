// Token / cost telemetry for the Gemini calls (backlog item 23 = item 36 leg c).
//
// WHY THIS EXISTS: nobody has ever measured what one credit costs. The served
// free tier is 5 RPM / 20 RPD for the WHOLE APP, which cannot support a paying
// product, so enabling Gemini billing is the only lever that raises the ceiling —
// and that is a SPEND decision nobody can make without the per-call token cost.
// Every row here is one Gemini call that RETURNED, with the tokens it burned.
//
// FAIL-OPEN, ALWAYS. This is observability, never a correctness gate. A telemetry
// failure must NEVER turn a successful, credit-charged generation into an error,
// and must never convert a 422 into a 500. Every failure path swallows.
//
// ...WHICH IS EXACTLY WHY THE LOG LINE BELOW IS LOUD. Because the write is
// fail-open, a forgotten migration, a typo'd table name or a revoked grant
// produces EXACTLY THE SAME USER EXPERIENCE AS SUCCESS. The only thing standing
// between us and a silently-empty table — discovered a week later when we sit
// down to do the billing math and find zero rows — is a greppable log line. This
// is the discipline item 37 established for envInt(): a fail-open fallback that
// nobody can see is a trap, not a safety net.
//
// NEVER CONSTRUCTS A CLIENT. The caller passes the service client it already has
// (`creditClient`). Reaching any capture site already PROVES that client is the
// service client: a missing service key makes reserve_credit fail (EXECUTE is
// locked to service_role) and the route 500s long before capture.

/** Unmistakable, greppable. If this appears in the logs, the table is not filling. */
const FAILURE_TAG = 'usage-telemetry: INSERT FAILED'

export type UsageRoute = 'generate' | 'refine'

/**
 * 'success'      — content earned, credit spent. These are the EARNED tokens.
 * 'parse_failed' — Gemini SUCCEEDED (consumed input, emitted output, billed in
 *                  full) but the JSON did not parse, so the credit is refunded
 *                  and the user pays nothing. WE ATE THIS COST. It is the
 *                  worst-case cell and it is biased expensive: a parse failure at
 *                  the 8192-token ceiling is usually a TRUNCATED response that
 *                  burned the entire output budget. Excluding it would prune the
 *                  most expensive calls from the sample.
 *
 * BILLED tokens = every row. EARNED tokens = outcome 'success'. The delta is what
 * we pay for and cannot charge for.
 */
export type UsageOutcome = 'success' | 'parse_failed'

export type TokenCounts = {
  promptTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

/**
 * A count is only trustworthy if it is a non-negative integer. Anything else
 * (undefined, null, a string, NaN, a float) yields null — NEVER 0. A 0 would be a
 * lie that silently deflates the daily SUM and makes the model look cheaper than
 * it is; a null is honest and is visible in the rollup as a gap.
 */
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Pull the billable counts out of a raw Gemini `usageMetadata` object.
 *
 * OUTPUT = candidatesTokenCount + thoughtsTokenCount.
 *
 * That sum is the whole point of the column, not a detail. Thinking models (2.5+,
 * which is what we are served) spend output tokens on reasoning BEFORE the answer,
 * and Google bills those thought tokens AT THE OUTPUT RATE — but they do NOT
 * appear in candidatesTokenCount. Storing candidatesTokenCount alone would
 * UNDERSTATE the real output bill on exactly the model class we run, which is the
 * one number this whole table exists to get right. /api/refine already documents
 * the behaviour in its own generationConfig comment (2048 truncated the JSON
 * mid-array because thinking ate the budget).
 *
 * thoughtsTokenCount is treated as 0 when absent (a non-thinking model simply has
 * none), but if candidatesTokenCount itself is missing the result is null — we do
 * not invent an output count from thoughts alone.
 *
 * The raw object is stored alongside these anyway, so a field we did not think of
 * today (cachedContentTokenCount, promptTokensDetails' modality split) is still
 * recoverable tomorrow WITHOUT spending another day of a 20 RPD budget to
 * re-measure.
 */
export function extractTokenCounts(usageMetadata: any): TokenCounts {
  const prompt = count(usageMetadata?.promptTokenCount)
  const candidates = count(usageMetadata?.candidatesTokenCount)
  const thoughts = count(usageMetadata?.thoughtsTokenCount)
  const total = count(usageMetadata?.totalTokenCount)

  return {
    promptTokens: prompt,
    outputTokens: candidates === null ? null : candidates + (thoughts ?? 0),
    totalTokens: total,
  }
}

export type UsageEvent = {
  /** The service client the caller ALREADY has (creditClient). Never built here. */
  client: any
  userId: string
  route: UsageRoute
  outcome: UsageOutcome
  /** Which model actually served the call — null if the loop never assigned one. */
  model: string | null
  /** How many generateContent attempts this request spent (quota amplification). */
  attempts: number | null
  /** The raw Gemini usageMetadata. Counts and modality labels only — never content. */
  usageMetadata: any
}

/**
 * Record one Gemini call. MUST be awaited by the caller: serverless freezes the
 * process the instant the response is returned, so a fire-and-forget promise is
 * silently dropped and the row never lands.
 *
 * Never throws. A telemetry failure is logged and swallowed.
 */
export async function recordUsage({
  client,
  userId,
  route,
  outcome,
  model,
  attempts,
  usageMetadata,
}: UsageEvent): Promise<void> {
  try {
    const { promptTokens, outputTokens, totalTokens } = extractTokenCounts(usageMetadata)

    const { error } = await client.from('usage_events').insert({
      user_id: userId,
      route,
      outcome,
      model,
      attempts,
      prompt_tokens: promptTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      // Counts and modality labels ONLY. No prompt text, no image bytes, no
      // generated content ever reaches this table.
      usage_metadata: usageMetadata ?? null,
    })

    if (error) {
      // Loud on purpose — see the header. A swallowed write that nobody can see
      // is indistinguishable from a working one until the data is needed.
      console.error(
        `${FAILURE_TAG} (${route}/${outcome}) — the cost table is NOT filling. ` +
          `Check that migrations/2026-07-14_add_usage_events.sql was applied. ` +
          `Supabase said: ${error.message}`
      )
    }
  } catch (e: any) {
    console.error(
      `${FAILURE_TAG} (${route}/${outcome}) — threw before/inside the insert. ` +
        `Generation was NOT affected. Cause: ${e?.message}`
    )
  }
}
