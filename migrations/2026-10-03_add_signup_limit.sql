-- Per-network cap on new accounts (sign-up only).
--
-- Reuses public.rate_limits (RLS on, no policies, service_role only). Keys are
-- 's:<sha256-prefix>:d' and 's:<sha256-prefix>:h'; the raw address never
-- reaches the database. Same shape as check_rate_limits: lock in a fixed key
-- order, check BOTH before writing EITHER, increment all-or-none.
--
-- Returns 'allowed' | 'day' | 'hour'. Apply BEFORE the sign-up code that calls
-- it is deployed; if it is missing the caller fails open (no limit), it never
-- blocks a sign-up.
CREATE OR REPLACE FUNCTION public.check_signup_limit(
  p_network   text,
  p_per_hour  integer,
  p_per_day   integer
) RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  now_s bigint := floor(extract(epoch from now()))::bigint;
  win_h bigint := now_s / 3600;
  win_d bigint := now_s / 86400;
  k_d   text := 's:' || p_network || ':d';
  k_h   text := 's:' || p_network || ':h';
  e_d   integer;
  e_h   integer;
BEGIN
  -- Fail OPEN on misconfiguration or an empty key.
  IF p_per_hour <= 0 OR p_per_day <= 0 OR coalesce(p_network, '') = '' THEN
    RETURN 'allowed';
  END IF;

  INSERT INTO rate_limits (bucket_key, window_start, count) VALUES
    (k_d, win_d, 0),
    (k_h, win_h, 0)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT CASE WHEN window_start = win_d THEN count ELSE 0 END INTO e_d
    FROM rate_limits WHERE bucket_key = k_d FOR UPDATE;
  SELECT CASE WHEN window_start = win_h THEN count ELSE 0 END INTO e_h
    FROM rate_limits WHERE bucket_key = k_h FOR UPDATE;

  IF e_d + 1 > p_per_day  THEN RETURN 'day';  END IF;
  IF e_h + 1 > p_per_hour THEN RETURN 'hour'; END IF;

  UPDATE rate_limits SET count = CASE WHEN window_start = win_d THEN count + 1 ELSE 1 END,
                         window_start = win_d WHERE bucket_key = k_d;
  UPDATE rate_limits SET count = CASE WHEN window_start = win_h THEN count + 1 ELSE 1 END,
                         window_start = win_h WHERE bucket_key = k_h;

  RETURN 'allowed';
END;
$$;

REVOKE ALL ON FUNCTION public.check_signup_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_limit(text, integer, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying; all must hold):
--
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'check_signup_limit';                                -- service_role / EXECUTE only
--
--   SELECT public.check_signup_limit('smoke-test', 5, 10);                    -- 'allowed'
--   DELETE FROM public.rate_limits WHERE bucket_key LIKE 's:smoke-test:%';    -- clean up
-- ─────────────────────────────────────────────────────────────────────────────
