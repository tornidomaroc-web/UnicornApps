-- Free credits are CLAIMED, not granted on creation.
--
-- WHY. Sign-in with Google is coming to the website. Supabase creates a Google
-- account inside its own callback, before any code of ours runs, and anyone
-- holding the public anon key can start that flow from a script. Nothing in
-- the app can therefore stand between a bot and the account itself. What the
-- bot wants is the 3 free credits (3 billed Gemini calls, and 3 draws on the
-- app-wide daily ceiling), so the gate moves to the credits:
--
--   * an account our server made with the admin API (provider 'email') has
--     already passed Turnstile, the per-network cap and the ledger, so it is
--     born with its 3 credits and is marked claimed, exactly as before;
--   * every other account (google, apple, phone, anonymous, unknown) is born
--     with 0 credits and unclaimed. Both generate routes reserve a credit
--     before calling Gemini, so an unclaimed account costs nothing;
--   * the 3 credits are granted once, by `claim_free_credits`, which only the
--     server can call, after the SAME three checks the email sign-up runs
--     (src/app/welcome/actions.ts). One network therefore gets one budget of
--     new accounts a day, however they were created.
--
-- The ledger gains a `method` column (which sign-up path) and three outcomes:
-- 'claimed' (credits granted), 'claim_failed' (the grant itself failed) and
-- 'linked' (a Google identity was attached to an existing password account and
-- the password was rotated, see src/app/auth/callback/route.ts).
--
-- ORDER. Apply BEFORE the Google provider is switched on in Supabase, and
-- before the code that calls claim_free_credits is deployed: the old code
-- keeps working against this schema (its admin-created accounts are 'email',
-- so they are born claimed; its ledger rows take the 'email' default).
--
-- Every statement is idempotent or guarded, so a re-run is harmless.
BEGIN;

-- 1. The claimed marker. Every existing account was made through the guarded
--    path (or before any guard existed, which this release does not revisit),
--    so all of them are backfilled as claimed.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS free_credits_claimed_at TIMESTAMPTZ NULL;

UPDATE public.profiles
   SET free_credits_claimed_at = created_at
 WHERE free_credits_claimed_at IS NULL;

-- 2. New accounts: 3 credits for the guarded path only.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 'email' = made by our server with the admin API, behind Turnstile, the
  -- per-network cap and the ledger. Anything else reached the database
  -- without those checks and must claim its credits (claim_free_credits).
  guarded boolean := coalesce(new.raw_app_meta_data->>'provider', '') = 'email';
BEGIN
  INSERT INTO public.profiles (id, email, credits, free_credits_claimed_at)
  VALUES (new.id, new.email,
          CASE WHEN guarded THEN 3 ELSE 0 END,
          CASE WHEN guarded THEN now() ELSE NULL END);
  RETURN NEW;
END;
$$;

-- 3. The one-time grant. Row-locked, so two parallel claims cannot both pay.
--    Returns 'claimed' | 'already_claimed' | 'no_profile'.
CREATE OR REPLACE FUNCTION public.claim_free_credits(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_claimed_at timestamptz;
BEGIN
  SELECT free_credits_claimed_at INTO v_claimed_at
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'no_profile';
  END IF;
  IF v_claimed_at IS NOT NULL THEN
    RETURN 'already_claimed';
  END IF;
  UPDATE profiles
     SET credits = credits + 3,
         free_credits_claimed_at = now()
   WHERE id = p_user_id;
  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_credits(uuid) TO service_role;

-- 4. The ledger: which path, and the three new outcomes.
ALTER TABLE public.signup_outcomes
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'email'
    CHECK (method IN ('email', 'google', 'apple'));

ALTER TABLE public.signup_outcomes DROP CONSTRAINT IF EXISTS signup_outcomes_outcome_check;
ALTER TABLE public.signup_outcomes ADD CONSTRAINT signup_outcomes_outcome_check CHECK (outcome IN (
  'created',             -- account made, user signed in
  'no_supabase_client',  -- Supabase URL or anon key missing on the server
  'no_turnstile_secret', -- TURNSTILE_SECRET_KEY missing: every sign-up refused
  'captcha_no_token',    -- form arrived without a widget token
  'captcha_rejected',    -- Cloudflare said no; detail = its error codes
  'signup_limited',      -- per-network cap; detail = 'hour' | 'day'
  'hook_refused_server', -- the before-user-created hook refused OUR admin call
  'create_failed',       -- admin createUser failed; detail = Supabase error code
  'signin_failed',       -- account made, the sign-in after it failed; detail = code
  'claimed',             -- free credits granted to an account made outside the server (Google)
  'claim_failed',        -- the grant failed; detail = 'already_claimed' | 'no_profile' | an error code
  'linked'               -- a Google identity joined a password account; the password was rotated
));

-- 5. The health check learns the new codes: a failed grant is a SYSTEM
--    failure unless it was the harmless double submit; a claim counts as a
--    sign-up; a link never alerts. Body otherwise unchanged from 2026-10-04.
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
        WHEN outcome = 'claim_failed' AND coalesce(detail, '') <> 'already_claimed' THEN 'system'
        WHEN outcome = 'create_failed' AND coalesce(detail, '') NOT IN
             ('email_exists', 'user_already_exists', 'weak_password', 'validation_failed', 'email_address_invalid') THEN 'system'
        WHEN outcome = 'captcha_rejected' AND coalesce(detail, '') ~ '(invalid-input-secret|missing-input-secret|bad-request)' THEN 'system'
        WHEN outcome IN ('created', 'claimed') THEN 'created'
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

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying; all must hold):
--
--   SELECT count(*) FROM public.profiles WHERE free_credits_claimed_at IS NULL;   -- 0
--
--   SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--   WHERE routine_name = 'claim_free_credits';                                     -- service_role / EXECUTE only
--
--   SELECT public.claim_free_credits('00000000-0000-0000-0000-000000000000');      -- 'no_profile'
--
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.signup_outcomes'::regclass;
--     -- includes signup_outcomes_outcome_check and signup_outcomes_method_check
--
--   SELECT public.signup_health_verdict();                                         -- false
-- ─────────────────────────────────────────────────────────────────────────────
