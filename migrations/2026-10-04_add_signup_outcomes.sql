-- Sign-up outcome ledger + the health check that reads it.
--
-- WHY. Sign-up is the one path every new user crosses, and a broken one left
-- no durable trace: the guards log only on failure, Vercel keeps about an hour
-- of logs, and a wrong secret, a missing variable or a refusing auth hook all
-- look the same from outside (no new users). This table records ONE ROW PER
-- ATTEMPT that reached the guards: an outcome code and, where useful, a machine
-- code (a Supabase error code, Turnstile's error codes, the limiter window).
-- Nothing in a row identifies a person: no email, no address, no user id, no
-- free text. The CHECK constraints make that structural, not a convention.
--
-- WHO WRITES. The server, with the service role, after each attempt
-- (src/lib/signup-ledger.ts). Clients hold no privilege on the table.
--
-- WHO READS. Two SECURITY DEFINER functions, both STABLE (read only):
--   * `signup_health()` returns the counts, the reasons and the verdict over the
--     last 24 h. service_role ONLY: the numbers are the app's real sign-up
--     volume and are nobody else's business (`npm run signup:health`).
--   * `signup_health_verdict()` returns ONE boolean, alert or not, and is
--     callable with the anon key ON PURPOSE: the scheduled check
--     (.github/workflows/signup-health.yml) then needs no privileged secret
--     anywhere, nothing countable leaves, and a caller can neither write nor
--     silence the alert.
--
-- Apply BEFORE deploying the code that writes here. Until then the writer
-- fails open: it logs and never blocks a sign-up.
CREATE TABLE public.signup_outcomes (
  id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- What happened, from the server's side (the writer documents each).
  outcome           TEXT        NOT NULL CHECK (outcome IN (
                      'created',             -- account made, user signed in
                      'no_supabase_client',  -- Supabase URL or anon key missing on the server
                      'no_turnstile_secret', -- TURNSTILE_SECRET_KEY missing: every sign-up refused
                      'captcha_no_token',    -- form arrived without a widget token
                      'captcha_rejected',    -- Cloudflare said no; detail = its error codes
                      'signup_limited',      -- per-network cap; detail = 'hour' | 'day'
                      'hook_refused_server', -- the before-user-created hook refused OUR admin call
                      'create_failed',       -- admin createUser failed; detail = Supabase error code
                      'signin_failed'        -- account made, the sign-in after it failed; detail = code
                    )),
  -- A machine code only: [a-z0-9_:,.-], so an address or a sentence cannot fit.
  detail            TEXT        NULL CHECK (detail ~ '^[a-z0-9_:,.-]{1,120}$'),
  -- NULL = that guard was never reached. FALSE on Turnstile = Cloudflare was
  -- unreachable and the attempt went through UNCHECKED (fail-open).
  turnstile_checked BOOLEAN     NULL,
  limit_checked     BOOLEAN     NULL
);

-- The health check reads the last 24 h; nothing else reads this table.
CREATE INDEX signup_outcomes_created_at_idx ON public.signup_outcomes (created_at);

-- RLS ON, NO policies: service_role bypasses RLS; clients get zero access.
-- The REVOKE undoes Supabase's default grant of ALL to anon/authenticated.
-- DELETE is for removing a forced test row and for a later retention purge.
ALTER TABLE public.signup_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.signup_outcomes FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, DELETE ON TABLE public.signup_outcomes TO service_role;

-- Counts, reasons and verdict over the last 24 h. `p_now` exists for tests.
--
-- SYSTEM failure = a code no visitor can produce: a missing secret or client,
-- the hook refusing the server, a Supabase error other than the user-caused
-- ones, a Turnstile verdict that blames OUR secret or request. USER error =
-- no token, a bad token, a full network window, an address already in use, a
-- weak password or a malformed address. Only SYSTEM failures and repeated
-- fail-open raise the alert; user errors never do, however many.
--
-- WHEN IT ALERTS (the check runs every 30 min; each failing run is one email):
--   * onset: a SYSTEM failure in the last 65 min and none in the 23 h before
--     (fires on the one or two runs after the first failure, then goes quiet);
--   * reminder: a SYSTEM failure in the last 6 h, on the 00/06/12/18 UTC run;
--   * fail-open: 3+ unchecked attempts in 24 h and one of them in the last 65 min.
CREATE OR REPLACE FUNCTION public.signup_health(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  since      timestamptz := p_now - interval '24 hours';
  recent_cut timestamptz := p_now - interval '65 minutes';
  sixh_cut   timestamptz := p_now - interval '6 hours';
  slot       boolean := (extract(hour from (p_now AT TIME ZONE 'UTC'))::int % 6 = 0)
                        AND extract(minute from (p_now AT TIME ZONE 'UTC')) < 30;
  n_attempts integer; n_created integer; n_user integer; n_system integer; n_unchecked integer;
  sys_recent integer; sys_earlier integer; sys_6h integer; unchecked_recent integer;
  reasons    text[] := '{}';
  by_outcome jsonb;
BEGIN
  WITH w AS (
    SELECT created_at, turnstile_checked,
      CASE
        WHEN outcome IN ('no_supabase_client', 'no_turnstile_secret', 'hook_refused_server', 'signin_failed') THEN 'system'
        WHEN outcome = 'create_failed' AND coalesce(detail, '') NOT IN
             ('email_exists', 'user_already_exists', 'weak_password', 'validation_failed', 'email_address_invalid') THEN 'system'
        WHEN outcome = 'captcha_rejected' AND coalesce(detail, '') ~ '(invalid-input-secret|missing-input-secret|bad-request)' THEN 'system'
        WHEN outcome = 'created' THEN 'created'
        ELSE 'user'
      END AS klass
    FROM signup_outcomes
    WHERE created_at > since AND created_at <= p_now
  )
  SELECT count(*),
         count(*) FILTER (WHERE klass = 'created'),
         count(*) FILTER (WHERE klass = 'user'),
         count(*) FILTER (WHERE klass = 'system'),
         count(*) FILTER (WHERE turnstile_checked = false),
         count(*) FILTER (WHERE klass = 'system' AND created_at > recent_cut),
         count(*) FILTER (WHERE klass = 'system' AND created_at <= recent_cut),
         count(*) FILTER (WHERE klass = 'system' AND created_at > sixh_cut),
         count(*) FILTER (WHERE turnstile_checked = false AND created_at > recent_cut)
    INTO n_attempts, n_created, n_user, n_system, n_unchecked,
         sys_recent, sys_earlier, sys_6h, unchecked_recent
    FROM w;

  IF sys_recent > 0 AND sys_earlier = 0 THEN reasons := array_append(reasons, 'system_failure_started'); END IF;
  IF slot AND sys_6h > 0 THEN reasons := array_append(reasons, 'system_failure_continues'); END IF;
  IF n_unchecked >= 3 AND unchecked_recent > 0 THEN reasons := array_append(reasons, 'turnstile_unchecked_repeatedly'); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('outcome', outcome, 'detail', detail, 'n', n) ORDER BY n DESC), '[]'::jsonb)
    INTO by_outcome
    FROM (SELECT outcome, detail, count(*) AS n
            FROM signup_outcomes
           WHERE created_at > since AND created_at <= p_now
           GROUP BY outcome, detail
           ORDER BY n DESC
           LIMIT 50) s;

  RETURN jsonb_build_object(
    'alert', cardinality(reasons) > 0,
    'reasons', to_jsonb(reasons),
    'window_start', since,
    'counts', jsonb_build_object(
      'attempts', n_attempts, 'created', n_created, 'user_errors', n_user,
      'system_failures', n_system, 'turnstile_unchecked', n_unchecked),
    'by_outcome', by_outcome
  );
END;
$$;

-- Supabase grants EXECUTE on every new public function to anon and authenticated
-- by default privilege, so both are revoked by name; PUBLIC alone is not enough.
REVOKE ALL ON FUNCTION public.signup_health(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_health(timestamptz) TO service_role;

-- The one bit the public check may read. SECURITY DEFINER so that it can call
-- signup_health(), which its callers cannot.
CREATE OR REPLACE FUNCTION public.signup_health_verdict(p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.signup_health(p_now)->>'alert')::boolean;
$$;

REVOKE ALL ON FUNCTION public.signup_health_verdict(timestamptz) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_health_verdict(timestamptz) TO anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying; all must hold):
--
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'signup_outcomes';                   -- postgres + service_role only
--
--   SELECT routine_name, grantee FROM information_schema.role_routine_grants
--   WHERE routine_name LIKE 'signup_health%' ORDER BY 1, 2;
--     -- signup_health: postgres, service_role; signup_health_verdict: anon, postgres, service_role
--
--   SELECT public.signup_health_verdict();                  -- false
--   SELECT public.signup_health();                          -- {"alert": false, ...}
-- ─────────────────────────────────────────────────────────────────────────────
