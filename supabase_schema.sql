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
