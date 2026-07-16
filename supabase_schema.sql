-- 1. Create the profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT,
  credits INTEGER DEFAULT 3 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- Monetization entitlement columns (added 2026-06-21, Migration Step 1).
  -- All nullable; NULL across the board = a free user. Written ONLY by the
  -- Paddle webhook via the service-role key (no client UPDATE policy exists on
  -- profiles). isPro is COMPUTED from subscription_status + current_period_end,
  -- never stored. Column order mirrors live (appended after created_at).
  subscription_status TEXT NULL,
  subscription_id     TEXT NULL,
  current_period_end  TIMESTAMPTZ NULL,
  plan                TEXT NULL,
  CONSTRAINT profiles_subscription_status_chk
    CHECK (subscription_status IS NULL OR subscription_status IN
          ('active','past_due','canceled','paused','expired')),
  CONSTRAINT profiles_plan_chk
    CHECK (plan IS NULL OR plan IN ('pro'))
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
-- Users can only read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- NOTE: There is intentionally NO client-facing UPDATE policy on profiles.
-- A permissive "Users can update own profile" FOR UPDATE policy was dropped in
-- the live DB (it let any authenticated user self-grant credits via the anon
-- key + their JWT). All credit mutations run server-side with the service-role
-- key (see src/lib/credits.ts -> createServiceClient / tryDeductCredits), which
-- bypasses RLS, so no client UPDATE policy is needed. Do NOT re-add one.

-- 4. Create a trigger to automatically insert a profile for new users
-- First, define the function that the trigger will use
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credits)
  VALUES (new.id, new.email, 3);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Second, link the function to the auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Create the generations table
CREATE TABLE public.generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  image_url TEXT,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 6. Enable RLS for generations
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS Policies for generations
CREATE POLICY "Users can view own generations" 
ON public.generations 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generations"
ON public.generations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 8. Paddle webhook idempotency / dedup table.
-- Written and read ONLY by the Paddle webhook route using the service-role key
-- (src/app/api/webhooks/paddle/route.ts). No client ever touches it.
CREATE TABLE public.processed_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 9. Enable RLS with NO policies. Service-role (webhook) bypasses RLS, so its
-- reads/writes are unaffected; clients on the anon key get zero access (no
-- SELECT/INSERT/UPDATE/DELETE). This prevents leaking processed event IDs and
-- prevents replay (DELETE) or denial-of-credit (INSERT) attacks via the Data API.
ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- 10. Purchases ledger (added 2026-06-21, Migration Step 1).
-- Append-only record of every completed/refunded Paddle transaction, written
-- ONLY by the Paddle webhook (service-role). Drives refund-safe credit reversal
-- and one-time-pack vs subscription-cycle accounting.
--   * paddle_transaction_id UNIQUE → exactly-once grant (idempotency) + the
--     join target for refunds (adjustment.* references the original txn).
--   * user_id is NULLABLE + ON DELETE SET NULL: account deletion must NEVER
--     erase the revenue/tax ledger — the row survives as an orphaned record.
--   * amount_cents is USD cents (never floats).
CREATE TABLE public.purchases (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  paddle_transaction_id TEXT NOT NULL UNIQUE,
  type                  TEXT NOT NULL CHECK (type IN ('pack','subscription_cycle')),
  credits_granted       INTEGER NOT NULL DEFAULT 0,
  amount_cents          INTEGER NULL,
  status                TEXT NOT NULL DEFAULT 'completed'
                          CHECK (status IN ('completed','refunded')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at           TIMESTAMPTZ NULL
);

CREATE INDEX purchases_user_id_idx ON public.purchases (user_id);

-- 11. Enable RLS with NO policies (same posture as processed_webhook_events):
-- service-role webhook bypasses RLS; anon/auth clients get zero access so the
-- financial ledger (transaction IDs, amounts) is never exposed via the Data API.
-- Add a "SELECT own" policy ONLY when a purchase-history UI ships.
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- 12. Atomic money-path RPCs (added 2026-06-26, Piece 5). ===================
-- Mirror of the live migration. These close three non-atomic defects from
-- Pieces 2 & 4 by committing the ledger mutation and the credit delta (and the
-- subscription entitlement write, on reversal) in ONE transaction each:
--   * grant_credits_for_purchase : ledger INSERT + credits increment together
--     (was: upsert .select() then a SEPARATE addCredits that could throw after
--     the ledger row committed -> lost grant).
--   * reverse_credits_for_refund : ledger CAS flip + credits decrement + Pro
--     revoke together (was: flip then a SEPARATE deductCredits that could throw
--     -> lost reversal).
-- Both use `SET credits = <expr over credits>` so the increment/decrement runs
-- under the row lock (READ COMMITTED re-reads the latest committed value) and a
-- concurrent generate-spend can never lose-update profiles.credits.
-- Clamps live in SQL: the grant has NO ceiling (the 500 cap was removed
-- 2026-07-09 — see migrations/2026-07-09_remove_purchased_credit_cap.sql), and
-- the reversal floors at 0. NOTE src/lib/credits.ts still exports a stale
-- CREDIT_BALANCE_CAP = 500, read ONLY by the dead addCredits helper; it governs
-- nothing and is removed with that helper under backlog item 8.
-- Called ONLY by the Paddle webhook via the service-role key; EXECUTE is locked
-- to service_role (see grants below) so no anon/authenticated client can invoke.

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
  -- NO CEILING (cap removed 2026-07-09, migration
  -- 2026-07-09_remove_purchased_credit_cap.sql). The applied delta now always
  -- equals p_credits, so purchases.credits_granted is exact and the reversal is
  -- symmetric. GREATEST(0, ...) is defensive against a negative p_credits.
  UPDATE public.profiles
  SET credits = GREATEST(0, COALESCE(credits, 0) + p_credits)
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_credits_for_refund(
  p_paddle_transaction_id text
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_credits integer;
  v_type    text;
BEGIN
  -- CAS flip completed->refunded. The `status = 'completed'` predicate is the
  -- guard: of two concurrent approved deliveries (adjustment.created +
  -- adjustment.updated), only one matches the row; the other waits on the row
  -- lock, then re-checks and finds status already 'refunded' -> matches nothing.
  -- An unledgered txn also matches nothing. Either way -> no double-deduct.
  UPDATE public.purchases
  SET status = 'refunded', refunded_at = NOW()
  WHERE paddle_transaction_id = p_paddle_transaction_id
    AND status = 'completed'
  RETURNING user_id, credits_granted, type
  INTO v_user_id, v_credits, v_type;

  IF NOT FOUND THEN
    RETURN false;  -- unledgered OR already refunded
  END IF;

  -- Full reversal of the granted credits, floored at 0, in the SAME transaction
  -- as the flip. v_user_id may be NULL (account deleted -> FK ON DELETE SET NULL).
  IF v_user_id IS NOT NULL AND v_credits > 0 THEN
    UPDATE public.profiles
    SET credits = GREATEST(0, COALESCE(credits, 0) - v_credits)
    WHERE id = v_user_id;
  END IF;

  -- A refunded subscription cycle ends Pro immediately (Correction A's
  -- deliberate exception: unlike a scheduled cancel, a refund DOES write
  -- current_period_end = now, revoking the paid-through entitlement).
  IF v_type = 'subscription_cycle' AND v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET subscription_status = 'canceled', current_period_end = NOW()
    WHERE id = v_user_id;
  END IF;

  RETURN true;
END;
$$;

-- CRITICAL lock-down: new public-schema functions default to EXECUTE for PUBLIC,
-- which PostgREST exposes to the anon & authenticated roles. Without these
-- revokes, any client could call grant_credits_for_purchase and self-grant
-- credits — a hole worse than the profiles UPDATE policy we dropped. Only the
-- service-role webhook may call these.
REVOKE ALL ON FUNCTION public.grant_credits_for_purchase(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_credits_for_refund(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_credits_for_purchase(uuid, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_credits_for_refund(text) TO service_role;

-- 13. Reserve-before-spend credit RPCs (added 2026-07-06). ===================
-- reserve_credit mirrors migrations/2026-07-06_reserve_before_spend_rpcs.sql
-- byte-identically. refund_credit does NOT: its LEAST(500, ...) clamp was later
-- removed by migrations/2026-07-09_remove_purchased_credit_cap.sql, which is the
-- current source of truth for that body. The 07-06 file is an APPLIED migration
-- and is deliberately left unedited as a historical record.
-- Close the generation concurrency amplification: /api/generate
-- and /api/refine now atomically DECREMENT the credit BEFORE calling Gemini
-- (reserve_credit) and refund it only if the billable call fails (refund_credit).
-- The reserve is a single decrement-if-sufficient under the row lock, so N
-- parallel requests on a 1-credit balance can't all pass an unlocked pre-check
-- and each call Gemini.
--
-- Security: both are SECURITY INVOKER (the default; deliberately NO SECURITY
-- DEFINER), EXECUTE revoked from PUBLIC/anon/authenticated and granted only to
-- service_role — same lockdown as the money-path RPCs above. The inner UPDATE
-- works because the service_role caller bypasses RLS (BYPASSRLS), NOT via
-- SECURITY DEFINER; INVOKER is safer if EXECUTE is ever mis-granted (RLS then
-- still blocks the UPDATE). NOTE: the standalone migration file wraps these in
-- BEGIN/COMMIT so CREATE and REVOKE commit atomically; this schema mirror stays
-- bare DDL to match the convention of the sections above (Section 12 is
-- unwrapped too).

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

  -- Compensating increment for a reserved-but-failed generation. NO CEILING
  -- (clamp removed 2026-07-09 together with the grant cap: with balances >500
  -- now reachable, LEAST(500, ...) here would DESTROY credits on every failed
  -- Gemini call). Safe without a clamp because the route gates this behind a
  -- `settled` flag and it only ever runs after a successful reserve_credit, so
  -- it can only restore what that reserve took — it can never over-grant.
  UPDATE public.profiles
  SET credits = credits + p_cost
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Rate limiting (backlog item 21). Free, Supabase-backed fixed-window limiter.
--
-- WHY: the app calls one shared Gemini free-tier key (a single Google Cloud
-- project = one ~10-15 RPM rolling ceiling for ALL users). Bursts blow past it,
-- and /api/generate + /api/refine surface real 429/503 failures. This converts
-- our aggregate into clean LOCAL 429s (mapped to dash.aiBusy, credit untouched)
-- before Google's ceiling is hit, and gives per-user fairness so one user cannot
-- starve paying subscribers.
--
-- POSTURE: this is a protective optimization, NOT a correctness gate. The caller
-- (src/lib/rate-limit.ts) fails OPEN on any error, and the SQL fails open on a
-- misconfigured non-positive limit. A limiter fault must never take down
-- generation. Net safety holds because the check runs BEFORE reserve_credit,
-- which still fails CLOSED on a missing service key.
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
-- 13. Usage / cost telemetry (added 2026-07-14; backlog item 23 = item 36 leg c).
-- Mirror of migrations/2026-07-14_add_usage_events.sql.
--
-- WHY: NOBODY HAS EVER MEASURED WHAT ONE CREDIT COSTS. The served free tier is
-- 5 RPM / 20 RPD for the WHOLE APP, which cannot support a paying product, so
-- enabling Gemini billing is the only lever that raises the ceiling — and that is
-- a SPEND decision nobody can make without the per-call token cost. This is that
-- measurement.
--
-- POSTURE: append-only observability, NOT a counter and NOT on the money path.
-- No read-modify-write, no cross-row invariant => NO row-locked RPC (unlike
-- reserve_credit / check_rate_limits). A plain service-role INSERT is correct;
-- the writer (src/lib/usageTelemetry.ts) fails OPEN and logs loudly.
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per Gemini generateContent call that RETURNED (success, or a response
-- we failed to parse). Bounded in practice by the rate limiter (GLOBAL_RPD=9),
-- so growth is single-digit rows/day.
--
--   * user_id is NULLABLE + ON DELETE SET NULL — EXACTLY the purchases pattern
--     above. /api/account/delete deletes the auth user and relies on the CASCADE
--     auth.users -> profiles; a naive NOT NULL FK defaults to NO ACTION and would
--     make that Play-MANDATED endpoint fail with a 500, while CASCADE would erase
--     the cost history precisely where users churn. SET NULL keeps the row as
--     anonymized counts + a model name.
--
--   * outcome separates BILLED from EARNED tokens. On 'parse_failed' Gemini
--     SUCCEEDED (consumed input, emitted output, billed in full) but the JSON did
--     not parse, so the credit is refunded and the user pays nothing. That is the
--     worst-case cost cell — we pay, the customer does not — and it is BIASED
--     EXPENSIVE: a parse failure at the 8192 ceiling is usually a TRUNCATED
--     response that burned the whole output budget.
--
--   * model records WHICH model actually served the call. resolveGeminiModels
--     pins nothing by design (gemini.ts:1-7, 21-51), so Google can rotate the
--     served flash model under us with NO deploy, silently changing cost per
--     credit. This column is the only thing that would ever detect it.
--
--   * token columns are NULL, NEVER 0, when absent — a 0 would silently deflate
--     the daily SUM and make the model look cheaper than it is.
--
--   * usage_metadata keeps the FULL raw object: thinking tokens are billed as
--     OUTPUT but are absent from candidatesTokenCount, cached input is billed
--     lower, and promptTokensDetails carries the modality split. Counts and
--     modality labels ONLY — no prompt text, no image bytes, no generated content.
--
--   * GENERATED ALWAYS AS IDENTITY (not serial): needs no separate sequence USAGE
--     grant, so GRANT INSERT alone suffices for service_role.
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

-- The billing question is "tokens per DAY" — the daily rollup is the only access
-- pattern that matters.
CREATE INDEX usage_events_created_at_idx ON public.usage_events (created_at);

-- RLS ON, NO policies by design: service_role bypasses RLS; clients get zero
-- access. Same RLS posture as processed_webhook_events, purchases and
-- rate_limits — but the PRIVILEGE posture below is deliberately STRICTER here
-- than on those three.
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Defense in depth alongside RLS. Supabase's ALTER DEFAULT PRIVILEGES grants ALL
-- on every new public table to postgres, anon, authenticated AND service_role, so
-- without this REVOKE anon/authenticated would each hold all seven privileges and
-- ONLY RLS would stand between a client and the cost ledger.
--
-- LIVE POSTURE — CONFIRMED 2026-07-16 (information_schema.role_table_grants):
--   processed_webhook_events -> anon, authenticated, postgres, service_role  (all seven each)
--   purchases                -> anon, authenticated, postgres, service_role  (all seven each)
--   rate_limits              -> anon, authenticated, postgres, service_role  (all seven each)
--   usage_events             -> postgres, service_role ONLY  (no anon, no authenticated)
-- usage_events is the most locked-down table in this schema: TWO layers (RLS with
-- zero policies + no client grant) vs ONE (RLS alone) on the other three. Those
-- three are safe today — RLS with zero policies is deny-all for any role without
-- BYPASSRLS — but single-layer. Giving them this second layer is HARDENING, not a
-- fix; tracked in CLAUDE.md as its own migration/decision.
--
-- The REVOKE names three of the four default-granted roles. service_role is NOT
-- named, so it KEEPS its default ALL and the GRANT below is a NO-OP. INTENDED:
-- service_role is BYPASSRLS and server-only, so its grant list is not a security
-- boundary — possession of the service key is. Do NOT add service_role to the
-- REVOKE; it would make this the only table with a restricted service_role for
-- zero threat reduction. Full reasoning in the VERIFY block of
-- migrations/2026-07-14_add_usage_events.sql (step 2).
REVOKE ALL ON TABLE public.usage_events FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.usage_events TO service_role;
