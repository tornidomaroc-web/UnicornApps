-- Migration: remove the 500-credit balance cap from the purchase grant path
-- (branch fix/remove-purchased-credit-cap). Backlog item 5.
--
-- STATUS: APPLIED — applied by hand to the live Supabase database on 2026-07-09
-- (SQL Editor, in a transaction) and verified with the queries at the bottom of
-- this file:
--   * has_cap FALSE on both grant_credits_for_purchase and refund_credit
--     (before: TRUE on both — the LEAST(500, ...) clamp was present).
--   * EXECUTE privilege: service_role ONLY on both. No anon, no authenticated,
--     no PUBLIC.
--   * purchases table: ZERO rows — so no customer was ever affected by the cap.
--     This retires the one forensic gap the cap left behind: purchases records
--     only the INTENDED grant (credits_granted), never the applied delta, so a
--     historical under-grant would have been undetectable. There was none.
-- Retained for provenance. The bodies are idempotent (CREATE OR REPLACE), so
-- re-running is harmless. The verification queries at the bottom still apply;
-- note the "VERIFY BEFORE RUNNING" block describes the pre-migration state and
-- will no longer match a live database that has this migration applied.
--
-- WHY. The cap (`LEAST(500, ...)`) was introduced in d1fc5d6 with a single
-- stated rationale, in a code comment (src/lib/credits.ts:8-10): it clamps the
-- balance "so subscription rollover (and pack top-ups) can't accumulate
-- unbounded AI COGS". Three problems, all established by investigation:
--   1. It does not bound COGS. Cost is incurred when a credit is SPENT (one
--      Gemini call in reserve_credit), not when it is GRANTED. The cap bounds
--      the prepaid-credit LIABILITY, not the burn rate.
--   2. That liability is revenue-positive: the customer prepaid ~$0.10-$0.17
--      per credit (pack $4.99/30, sub $9.99/100). Gemini is on the free tier —
--      operator-confirmed against the live Google AI Studio dashboard: spend
--      $0.00, billing account inactive. The cap therefore guards a cost that
--      does not currently exist.
--   3. It can only ever fire on PAYING customers. Free users receive 3 credits
--      (profiles.credits DEFAULT 3 + handle_new_user()), which never approaches
--      500. grant_credits_for_purchase is the only function that can hit the
--      ceiling, and it runs only when someone pays.
--
-- The cap also directly causes backlog item 5, in two faces:
--   (a) SILENT UNDER-GRANT (no refund needed). A subscriber at 500 pays $9.99
--       and receives LEAST(500, 500+100) - 500 = 0 credits, every month, while
--       the purchases ledger records credits_granted = 100.
--   (b) OVER-CLAWBACK on refund. reverse_credits_for_refund subtracts the
--       ledger's credits_granted (the INTENDED grant), not the clamped delta.
--       At a 490 balance a 30-pack applies +10 but ledgers 30; a later refund
--       subtracts 30, destroying 20 credits the customer already held.
-- Removing the clamp makes the applied delta equal p_credits unconditionally,
-- so grant and reversal become exactly symmetric and (b) cannot fire. (a) is
-- fixed at the same time, by the same line.
--
-- WHY refund_credit IS ALSO CHANGED HERE (it is not optional).
-- refund_credit's `LEAST(500, credits + p_cost)` is inert TODAY only because the
-- grant cap guarantees no balance exceeds 500. Removing the grant cap makes
-- balances >500 reachable and turns that clamp into an active credit destroyer:
-- it fires from the `finally` block of /api/generate and /api/refine on every
-- failed Gemini call (429/503/empty/parse-error — see isRetryableGeminiError).
-- Verified against real Postgres: balance 600 -> reserve -> 599 -> refund_credit
-- -> 500. One transient 503 destroys 100 credits.
-- Dropping the clamp there is provably safe: refund_credit runs ONLY after a
-- successful reserve_credit (route-gated by the `settled` flag), so
-- `credits + p_cost` can never exceed the balance held before that reserve. The
-- clamp can never prevent an over-grant; it can only destroy credits.
--
-- EXPLICITLY UNCHANGED:
--   * reserve_credit — no clamp; correct as-is.
--   * reverse_credits_for_refund — its GREATEST(0, ...) floor STAYS. It is
--     disclosed in Terms §04 ("if your balance is lower than the amount granted,
--     it is reduced to zero") and is backlog item 6, accepted.
--   * The purchases ledger schema. No credits_applied column (backlog item 5's
--     option F), no lot tracking (item 7). Not needed once the delta always
--     equals p_credits.
--
-- Security posture is preserved verbatim: SECURITY INVOKER (no DEFINER clause),
-- EXECUTE revoked from PUBLIC/anon/authenticated, granted only to service_role.
-- Wrapped in one transaction so no session observes the functions in the default
-- PUBLIC-executable state between CREATE and REVOKE. Idempotent (CREATE OR
-- REPLACE); safe to re-run.

BEGIN;

-- grant_credits_for_purchase: identical to the live definition EXCEPT the
-- balance UPDATE, which loses `LEAST(500, ...)`. The ledger INSERT, the
-- ON CONFLICT exactly-once guard, the signature and the return contract are
-- unchanged.
CREATE OR REPLACE FUNCTION public.grant_credits_for_purchase(
  p_user_id               uuid,
  p_paddle_transaction_id text,
  p_type                  text,
  p_credits               integer,
  p_amount_cents          integer
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Exactly-once ledger guard. The UNIQUE index on paddle_transaction_id
  -- serializes concurrent/duplicate deliveries of the SAME transaction: only
  -- the first INSERT succeeds; the rest hit ON CONFLICT DO NOTHING.
  INSERT INTO public.purchases (
    user_id, paddle_transaction_id, type, credits_granted, amount_cents, status
  ) VALUES (
    p_user_id, p_paddle_transaction_id, p_type, p_credits, p_amount_cents, 'completed'
  )
  ON CONFLICT (paddle_transaction_id) DO NOTHING;

  -- FOUND is false when ON CONFLICT skipped the insert -> already granted.
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Newly inserted -> grant once, in the SAME transaction as the ledger row.
  -- NO CEILING: the applied delta now always equals p_credits, so the ledger's
  -- credits_granted is exact and the reversal is symmetric. GREATEST(0, ...) is
  -- retained as defense against a negative p_credits (the webhook already
  -- returns early when creditsForPrice() <= 0).
  UPDATE public.profiles
  SET credits = GREATEST(0, COALESCE(credits, 0) + p_credits)
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

-- refund_credit: identical to the live definition EXCEPT the UPDATE, which loses
-- `LEAST(500, ...)`. See the header note — with balances >500 now reachable, the
-- clamp would silently destroy credits on every failed generation.
CREATE OR REPLACE FUNCTION public.refund_credit(
  p_user_id uuid,
  p_cost    integer
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Defense in depth: a non-positive cost must never mutate credits. No-op.
  IF p_cost <= 0 THEN
    RETURN;
  END IF;

  -- Compensating increment for a reserved-but-failed generation. NO CEILING:
  -- this only ever runs after a successful reserve_credit (route-gated by the
  -- `settled` flag, at most once per request, never on success), so it can only
  -- restore what that reserve took. A clamp here cannot prevent an over-grant —
  -- it can only destroy credits held above the ceiling.
  UPDATE public.profiles
  SET credits = credits + p_cost
  WHERE id = p_user_id;
END;
$$;

-- Re-assert the lock-down. CREATE OR REPLACE preserves existing grants, so these
-- are belt-and-braces; they matter if the function is ever dropped + recreated.
REVOKE ALL ON FUNCTION public.grant_credits_for_purchase(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits_for_purchase(uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, integer) TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY BEFORE RUNNING (confirm what is ACTUALLY live — do not trust the
-- schema file). Both bodies below should still contain `LEAST(500`:
--
--   SELECT p.proname, pg_get_functiondef(p.oid) AS definition
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('grant_credits_for_purchase', 'refund_credit');
--
-- VERIFY AFTER RUNNING — expect ZERO rows (no clamp anywhere):
--
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('grant_credits_for_purchase', 'refund_credit')
--     AND pg_get_functiondef(p.oid) LIKE '%LEAST(500%';
--
-- AND confirm EXECUTE is still locked to service_role — expect exactly
-- 'service_role' for each, and NOT anon/authenticated/PUBLIC:
--
--   SELECT p.proname, r.rolname
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN pg_roles r
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('grant_credits_for_purchase', 'refund_credit')
--     AND has_function_privilege(r.oid, p.oid, 'EXECUTE')
--     AND r.rolname IN ('anon', 'authenticated', 'service_role', 'public');
-- ---------------------------------------------------------------------------
