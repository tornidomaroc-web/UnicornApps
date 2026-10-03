-- Before-user-created hook: email sign-ups go through the app, OAuth stays open.
--
-- The app creates email/password accounts on its server with the admin API,
-- after a Turnstile check and a per-network cap. Supabase's admin API does NOT
-- run this hook; its PUBLIC sign-up endpoint does (as do OAuth, ID-token and
-- anonymous sign-ups). So this function refuses exactly the path that bypasses
-- the app's checks, an email or phone sign-up arriving at the public endpoint,
-- and lets Google, Apple and any other OAuth provider through unchanged.
--
-- Apply, then enable it LAST in Supabase: Authentication → Hooks → Before User
-- Created → Postgres function → public.hook_require_server_signup. Disable it
-- there to roll back; nothing else depends on it.
CREATE OR REPLACE FUNCTION public.hook_require_server_signup(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  provider  text    := coalesce(event->'user'->'app_metadata'->>'provider', '');
  anonymous boolean := coalesce((event->'user'->>'is_anonymous')::boolean, false);
BEGIN
  IF anonymous OR provider IN ('email', 'phone', '') THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Sign up in the UnicornApps app or website.'
      )
    );
  END IF;
  RETURN '{}'::jsonb;
END;
$$;

-- service_role is listed too: Supabase grants it EXECUTE on new public functions by default.
REVOKE ALL ON FUNCTION public.hook_require_server_signup(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hook_require_server_signup(jsonb) TO supabase_auth_admin;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying; all must hold):
--
--   SELECT public.hook_require_server_signup('{"user":{"app_metadata":{"provider":"email"}}}');
--     -- {"error": {"http_code": 403, ...}}
--   SELECT public.hook_require_server_signup('{"user":{"app_metadata":{"provider":"google"}}}');
--     -- {}
--   SELECT grantee FROM information_schema.role_routine_grants
--   WHERE routine_name = 'hook_require_server_signup';   -- postgres (owner) and supabase_auth_admin only
-- ─────────────────────────────────────────────────────────────────────────────
