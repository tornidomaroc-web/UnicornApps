-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add the usage/cost telemetry table (backlog item 23 = item 36 leg c).
--
-- STATUS: NOT YET APPLIED. Apply this by hand in the Supabase SQL editor, then
-- run the VERIFY block at the bottom. The writer (src/lib/usageTelemetry.ts) is
-- FAIL-OPEN, so code and migration can land in EITHER order without breaking
-- anything: until this is applied, every insert errors, is swallowed, and logs
-- the loud `usage-telemetry: INSERT FAILED` line (i.e. generation behaves
-- exactly as it does today, and the failure is greppable rather than silent).
-- Clean order is still: apply this -> verify -> merge the code PR.
--
-- WHY: NOBODY HAS EVER MEASURED WHAT ONE CREDIT COSTS. There is no token
-- counting, no per-call cost logging, no usageMetadata capture anywhere in the
-- app. The served free tier is 5 RPM / 20 RPD for the WHOLE APP, which cannot
-- support a paying product, so ENABLING GEMINI BILLING is the only lever that
-- raises the ceiling — and that is a SPEND decision nobody can make without
-- knowing the per-call token cost. This table is that measurement.
--
-- WHAT IT DELIBERATELY IS NOT: a counter, a limiter, or anything on the money
-- path. It is append-only observability. There is no read-modify-write here and
-- no cross-row invariant, so — unlike reserve_credit / check_rate_limits — it
-- needs NO row-locked RPC. A plain service-role INSERT is the correct shape;
-- wrapping it in a function would be cargo-culting the pattern for zero safety.
--
-- The table + grants below are byte-identical to the block appended to
-- supabase_schema.sql (the canonical mirror).
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per Gemini generateContent call that RETURNED (success or a response
-- we failed to parse). Append-only; bounded in practice by the rate limiter
-- (GLOBAL_RPD=9 today), so growth is single-digit rows/day.
--
--   * user_id is NULLABLE + ON DELETE SET NULL — EXACTLY the purchases pattern.
--     /api/account/delete works by deleting the auth user and relying on the
--     ON DELETE CASCADE from auth.users -> profiles. A naive NOT NULL FK would
--     default to NO ACTION and make that Play-MANDATED endpoint fail with a 500.
--     ON DELETE CASCADE would instead erase our cost history exactly where users
--     churn. SET NULL keeps the row as anonymized token counts + a model name.
--
--   * outcome distinguishes BILLED from EARNED tokens. On 'parse_failed' Gemini
--     SUCCEEDED — it consumed input, emitted output, and under billing we are
--     charged IN FULL — but the JSON did not parse, so the credit is refunded
--     and the user pays nothing. That is the worst-case cost cell (we pay, the
--     customer does not) and it is BIASED EXPENSIVE: a parse failure at the
--     8192-token ceiling is usually a TRUNCATED response that burned the entire
--     output budget. Excluding it would prune the most expensive calls from the
--     sample and make cost-per-credit look better than it is.
--
--   * model records WHICH model actually served the call. resolveGeminiModels
--     pins nothing by design (gemini.ts:1-7, 21-51) — it asks ListModels and
--     takes the top-ranked flash — so GOOGLE CAN ROTATE THE SERVED MODEL UNDER
--     US WITH NO DEPLOY, silently changing our cost per credit. This column is
--     the only mechanism that would ever detect that.
--
--   * token columns are NULL, NEVER 0, when a field is absent. A 0 is a lie that
--     would silently deflate the daily SUM and make the model look cheaper.
--
--   * usage_metadata keeps the FULL raw object. thinking tokens are billed as
--     OUTPUT and do not appear in candidatesTokenCount; cached input is billed at
--     a lower rate; promptTokensDetails carries the modality split (the image in
--     /api/generate is billed as input tokens). Storing the raw object means a
--     field we did not think of today is still recoverable tomorrow WITHOUT
--     spending another day of a 20 RPD budget to re-measure.
--     It contains ONLY counts and modality labels — no prompt text, no image
--     bytes, no generated content.
--
--   * GENERATED ALWAYS AS IDENTITY (not serial): an identity column needs no
--     separate sequence USAGE grant, so GRANT INSERT alone is sufficient for
--     service_role.
CREATE TABLE public.usage_events (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id        UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  route          TEXT        NOT NULL CHECK (route IN ('generate','refine')),
  outcome        TEXT        NOT NULL CHECK (outcome IN ('success','parse_failed')),
  model          TEXT        NULL,
  attempts       INTEGER     NULL,
  prompt_tokens  INTEGER     NULL,
  output_tokens  INTEGER     NULL,
  total_tokens   INTEGER     NULL,
  usage_metadata JSONB       NULL
);

-- The billing question is "tokens per DAY", so the daily rollup is the only
-- access pattern that matters.
CREATE INDEX usage_events_created_at_idx ON public.usage_events (created_at);

-- RLS ON, NO policies by design: service_role bypasses RLS; clients get zero
-- access (same posture as processed_webhook_events, purchases and rate_limits).
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Defense in depth alongside RLS: Supabase's default privileges would otherwise
-- grant anon/authenticated access to a new public table, and only RLS would be
-- standing between a client and our cost ledger. Revoke, then grant exactly what
-- the writer needs (INSERT) plus the SELECT we need to read the measurement back.
REVOKE ALL ON TABLE public.usage_events FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.usage_events TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying; all must hold):
--
--   -- 1. Table exists with RLS enabled and NO policies:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'usage_events';        -- t
--   SELECT count(*) FROM pg_policies WHERE tablename = 'usage_events';         -- 0
--
--   -- 2. Privileges are service_role ONLY (no PUBLIC/anon/authenticated):
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_name = 'usage_events'
--   ORDER BY grantee, privilege_type;         -- service_role / INSERT + SELECT only
--
--   -- 3. The FK is ON DELETE SET NULL (NOT cascade, NOT no-action).
--   --    This is the check that protects /api/account/delete from a 500.
--   SELECT confdeltype                        -- 'n' = SET NULL ('c'=cascade, 'a'=no action)
--   FROM pg_constraint
--   WHERE conrelid = 'public.usage_events'::regclass AND contype = 'f';        -- n
--
--   -- 4. Smoke test: an anonymous (user_id NULL) row inserts and the CHECKs hold.
--   INSERT INTO public.usage_events (route, outcome, model, attempts,
--                                    prompt_tokens, output_tokens, total_tokens,
--                                    usage_metadata)
--   VALUES ('generate','success','smoke-test',1,1,2,3,'{"smoke":true}'::jsonb);
--   SELECT count(*) FROM public.usage_events WHERE model = 'smoke-test';       -- 1
--   DELETE FROM public.usage_events WHERE model = 'smoke-test';                -- clean up
--
--   -- 5. The CHECK constraints actually reject garbage (both must ERROR):
--   -- INSERT INTO public.usage_events (route, outcome) VALUES ('bogus','success');
--   -- INSERT INTO public.usage_events (route, outcome) VALUES ('generate','bogus');
-- ─────────────────────────────────────────────────────────────────────────────
