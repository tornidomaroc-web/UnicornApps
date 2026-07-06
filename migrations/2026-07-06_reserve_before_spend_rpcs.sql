-- Migration: reserve-before-spend credit RPCs (branch feat/reserve-before-spend).
--
-- STATUS: PENDING — apply deliberately to the live Supabase database; NOT yet
-- applied by this PR. Mirrors Section 13 appended to supabase_schema.sql.
--
-- Purpose: close the generation concurrency amplification. /api/generate and
-- /api/refine now atomically DECREMENT the credit BEFORE calling Gemini
-- (reserve_credit) and refund it only if the billable call fails
-- (refund_credit). Both are SECURITY DEFINER and service_role-only, matching
-- the existing grant_credits_for_purchase / reverse_credits_for_refund posture.
-- Idempotent (CREATE OR REPLACE); safe to re-run.

-- reserve_credit: atomic decrement-if-sufficient. Returns TRUE when a credit
-- was reserved, FALSE when the balance was insufficient. The row lock
-- serializes concurrent reserves, so of N parallel calls on a 1-credit balance
-- exactly one succeeds; the rest re-read the decremented value and the
-- `credits >= p_cost` predicate matches nothing (no Gemini call for them).
CREATE OR REPLACE FUNCTION public.reserve_credit(
  p_user_id uuid,
  p_cost    integer
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits - p_cost
  WHERE id = p_user_id
    AND credits >= p_cost;
  RETURN FOUND;
END;
$$;

-- refund_credit: compensating increment for a reserved-but-failed generation,
-- clamped at 500 (= CREDIT_BALANCE_CAP in src/lib/credits.ts — keep in sync).
-- The route gates this behind a `settled` flag so it runs at most once per
-- request and never on success. Residual: a concurrent purchase that already
-- pushed the balance to the cap between reserve and refund silently drops this
-- +p_cost (negligible, documented in the route).
CREATE OR REPLACE FUNCTION public.refund_credit(
  p_user_id uuid,
  p_cost    integer
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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
