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
