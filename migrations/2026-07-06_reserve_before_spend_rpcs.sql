-- Migration: reserve-before-spend credit RPCs (branch feat/reserve-before-spend).
--
-- STATUS: PENDING — apply deliberately to the live Supabase database; NOT yet
-- applied by this PR. The reserve_credit / refund_credit function bodies here
-- are byte-identical to Section 13 of supabase_schema.sql.
--
-- Purpose: close the generation concurrency amplification. /api/generate and
-- /api/refine now atomically DECREMENT the credit BEFORE calling Gemini
-- (reserve_credit) and refund it only if the billable call fails
-- (refund_credit).
--
-- Security posture: both functions are SECURITY INVOKER (the PostgreSQL default
-- — there is deliberately NO SECURITY DEFINER clause), with EXECUTE revoked
-- from PUBLIC/anon/authenticated and granted only to service_role, matching the
-- existing money-path RPCs grant_credits_for_purchase / reverse_credits_for_refund.
-- The inner UPDATE succeeds because the service_role caller bypasses RLS
-- (BYPASSRLS), NOT because of SECURITY DEFINER. INVOKER is the safer choice
-- here: if EXECUTE were ever mis-granted to a client role, RLS would still block
-- the UPDATE (profiles has no client UPDATE policy), so no self-refund is
-- possible — whereas a DEFINER function would bypass RLS and allow it.
--
-- Wrapped in a single transaction so the CREATE and the REVOKE commit
-- atomically: no other session ever observes the functions in the default
-- PUBLIC-executable state between creation and the REVOKE. CREATE OR REPLACE
-- FUNCTION / REVOKE / GRANT are all transactional DDL, so BEGIN/COMMIT is valid
-- here. Idempotent and safe to re-run.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_credit(
  p_user_id uuid,
  p_cost    integer
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Defense in depth: a non-positive cost must never mutate credits (a negative
  -- cost would invert the arithmetic into a grant). Reserve nothing.
  IF p_cost <= 0 THEN
    RETURN false;
  END IF;

  -- Atomic decrement-if-sufficient. FOUND is TRUE only when a row matched
  -- (credits >= p_cost). The row lock serializes concurrent reserves: of N
  -- parallel calls on a 1-credit balance exactly one succeeds; the rest re-read
  -- the decremented value and match nothing -> reject WITHOUT calling Gemini.
  UPDATE public.profiles
  SET credits = credits - p_cost
  WHERE id = p_user_id
    AND credits >= p_cost;
  RETURN FOUND;
END;
$$;

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

  -- Compensating increment for a reserved-but-failed generation. Clamp = 500
  -- (= CREDIT_BALANCE_CAP in src/lib/credits.ts — keep in sync). Route gates
  -- this behind a `settled` flag: at most once per request, never on success.
  UPDATE public.profiles
  SET credits = LEAST(500, credits + p_cost)
  WHERE id = p_user_id;
END;
$$;

-- Lock down EXECUTE: new public functions default to EXECUTE for PUBLIC, which
-- PostgREST exposes to the anon & authenticated roles. Without these revokes,
-- any client could call reserve/refund directly (self-refund = free credits).
-- Only the service-role generation routes may invoke them.
REVOKE ALL ON FUNCTION public.reserve_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credit(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit(uuid, integer) TO service_role;

COMMIT;
