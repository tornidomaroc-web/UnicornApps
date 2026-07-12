-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add the free Supabase-backed rate limiter (backlog item 21, PR 1).
--
-- STATUS: NOT YET APPLIED. Apply this by hand in the Supabase SQL editor, then
-- run the VERIFY block at the bottom. Fail-open (in src/lib/rate-limit.ts and in
-- the SQL) means code and migration can land in EITHER order without breaking
-- anything: until this is applied, every check_rate_limits call errors and the
-- caller allows the request (i.e. the app behaves exactly as it does today).
-- Clean order is still: apply this -> verify -> merge the code PR.
--
-- WHY: one shared Gemini free-tier key (one Google Cloud project = ~10-15 RPM
-- rolling ceiling for ALL users) causes real 429/503 generation failures. This
-- converts our aggregate into clean LOCAL 429s (mapped to dash.aiBusy, credit
-- untouched) before Google's ceiling, and adds per-user fairness so one user
-- cannot starve paying subscribers.
--
-- The table + function + grants below are byte-identical to the block appended
-- to supabase_schema.sql (the canonical mirror).
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per bucket (PK = bucket_key), reused across windows via reset-on-roll,
-- so the table stays bounded at (active users x 2) + 2 — no cleanup job needed.
-- Bucket keys: 'g:m'/'g:d' (global minute/day) and 'u:<uuid>:m'/'u:<uuid>:d'.
CREATE TABLE public.rate_limits (
  bucket_key   TEXT    PRIMARY KEY,
  window_start BIGINT  NOT NULL,   -- window index: floor(epoch_seconds / window_seconds)
  count        INTEGER NOT NULL
);

-- RLS ON, NO policies by design: service_role bypasses RLS; clients get zero
-- access (same posture as processed_webhook_events).
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic per-user + global fixed-window check. Locks all four buckets in a FIXED
-- key order (global before user) so concurrent calls can never deadlock, checks
-- ALL four BEFORE writing ANY (no phantom increments: a request rejected on one
-- window consumes budget on none), then increments all-or-none. Returns the
-- blocking scope as text ('allowed' | 'global_rpm' | 'global_rpd' | 'user_rpm'
-- | 'user_rpd') — the caller only needs allowed = (scope = 'allowed'); the scope
-- is logged for observability.
CREATE OR REPLACE FUNCTION public.check_rate_limits(
  p_user_id     uuid,
  p_user_rpm    integer,
  p_user_rpd    integer,
  p_global_rpm  integer,
  p_global_rpd  integer
) RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  now_s bigint := floor(extract(epoch from now()))::bigint;
  win_m bigint := now_s / 60;      -- current minute window index
  win_d bigint := now_s / 86400;   -- current day window index
  -- Bucket keys in the FIXED order they are inserted and locked below.
  k_gd  text := 'g:d';
  k_gm  text := 'g:m';
  k_ud  text := 'u:' || p_user_id::text || ':d';
  k_um  text := 'u:' || p_user_id::text || ':m';
  e_gd  integer;
  e_gm  integer;
  e_ud  integer;
  e_um  integer;
BEGIN
  -- Fail OPEN on misconfiguration: a non-positive limit must never block the
  -- core feature. Defense in depth alongside the caller's fail-open.
  IF p_user_rpm <= 0 OR p_user_rpd <= 0 OR p_global_rpm <= 0 OR p_global_rpd <= 0 THEN
    RETURN 'allowed';
  END IF;

  -- Ensure all four rows exist so the FOR UPDATE locks below always hold a row.
  -- Same fixed VALUES order as the locks => no insert-time deadlock. New rows are
  -- born at the current window with count 0; existing rows are left untouched.
  INSERT INTO rate_limits (bucket_key, window_start, count) VALUES
    (k_gd, win_d, 0),
    (k_gm, win_m, 0),
    (k_ud, win_d, 0),
    (k_um, win_m, 0)
  ON CONFLICT (bucket_key) DO NOTHING;

  -- Lock + read each bucket in fixed key order. Effective count is 0 when the
  -- stored window has rolled over (a new window => the old count no longer
  -- applies).
  SELECT CASE WHEN window_start = win_d THEN count ELSE 0 END INTO e_gd
    FROM rate_limits WHERE bucket_key = k_gd FOR UPDATE;
  SELECT CASE WHEN window_start = win_m THEN count ELSE 0 END INTO e_gm
    FROM rate_limits WHERE bucket_key = k_gm FOR UPDATE;
  SELECT CASE WHEN window_start = win_d THEN count ELSE 0 END INTO e_ud
    FROM rate_limits WHERE bucket_key = k_ud FOR UPDATE;
  SELECT CASE WHEN window_start = win_m THEN count ELSE 0 END INTO e_um
    FROM rate_limits WHERE bucket_key = k_um FOR UPDATE;

  -- Check ALL before writing ANY. Global before user so the shared ceiling is
  -- reported when both would block.
  IF e_gd + 1 > p_global_rpd THEN RETURN 'global_rpd'; END IF;
  IF e_gm + 1 > p_global_rpm THEN RETURN 'global_rpm'; END IF;
  IF e_ud + 1 > p_user_rpd   THEN RETURN 'user_rpd';   END IF;
  IF e_um + 1 > p_user_rpm   THEN RETURN 'user_rpm';   END IF;

  -- All admit the request -> increment all four (reset to 1 on window roll).
  UPDATE rate_limits SET count = CASE WHEN window_start = win_d THEN count + 1 ELSE 1 END,
                         window_start = win_d WHERE bucket_key = k_gd;
  UPDATE rate_limits SET count = CASE WHEN window_start = win_m THEN count + 1 ELSE 1 END,
                         window_start = win_m WHERE bucket_key = k_gm;
  UPDATE rate_limits SET count = CASE WHEN window_start = win_d THEN count + 1 ELSE 1 END,
                         window_start = win_d WHERE bucket_key = k_ud;
  UPDATE rate_limits SET count = CASE WHEN window_start = win_m THEN count + 1 ELSE 1 END,
                         window_start = win_m WHERE bucket_key = k_um;

  RETURN 'allowed';
END;
$$;

-- Lock down EXECUTE exactly like reserve_credit/refund_credit: default PUBLIC
-- EXECUTE would let anon/authenticated clients call this via PostgREST and skew
-- everyone's limits. Only the service-role generation routes may invoke it.
REVOKE ALL ON FUNCTION public.check_rate_limits(uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limits(uuid, integer, integer, integer, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying; all must hold):
--
--   -- 1. Table exists with RLS enabled and NO policies:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'rate_limits';        -- t
--   SELECT count(*) FROM pg_policies WHERE tablename = 'rate_limits';         -- 0
--
--   -- 2. EXECUTE is service_role ONLY (no PUBLIC/anon/authenticated):
--   SELECT grantee, privilege_type
--   FROM information_schema.role_routine_grants
--   WHERE routine_name = 'check_rate_limits';                                 -- service_role / EXECUTE only
--
--   -- 3. Smoke test (does not persist meaningfully; uses a throwaway uuid):
--   SELECT public.check_rate_limits('00000000-0000-0000-0000-000000000000', 4, 100, 8, 1200);  -- 'allowed'
--   DELETE FROM public.rate_limits WHERE bucket_key LIKE 'u:00000000-%';      -- clean up the smoke-test rows
-- ─────────────────────────────────────────────────────────────────────────────
