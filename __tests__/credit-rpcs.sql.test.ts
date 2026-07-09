/**
 * SQL-level tests for the money-path credit RPCs.
 *
 * These run the ACTUAL `CREATE FUNCTION` bodies — read verbatim from the
 * migration and schema files on disk — against a real PostgreSQL engine
 * (PGlite: Postgres compiled to WASM, in-process, no server, no Docker). The
 * arithmetic under test is the arithmetic that ships.
 *
 * Why this file exists: every other webhook test mocks `supabase.rpc`, so the
 * `LEAST(500, ...)` clamp, the `GREATEST(0, ...)` floor, and their interaction
 * had ZERO coverage — the exact lines that caused backlog item 5.
 *
 * HONEST LIMITS. PGlite is upstream Postgres, not Supabase. It does NOT model
 * RLS policies, the `service_role` BYPASSRLS behaviour, or PostgREST exposure.
 * The stub roles created below exist only so the migration's REVOKE/GRANT
 * statements parse. These tests verify SQL SEMANTICS (the arithmetic), not the
 * security posture. Grants are asserted at the text level, and must still be
 * confirmed against the live database with the queries at the bottom of
 * migrations/2026-07-09_remove_purchased_credit_cap.sql.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'

jest.setTimeout(60_000)

const ROOT = join(__dirname, '..')
const MIGRATION = readFileSync(
  join(ROOT, 'migrations', '2026-07-09_remove_purchased_credit_cap.sql'),
  'utf8'
)
const SCHEMA = readFileSync(join(ROOT, 'supabase_schema.sql'), 'utf8')

/** Extract one `CREATE OR REPLACE FUNCTION public.<name>(...) ... $$;` block. */
function extractFn(sql: string, name: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`)
  const m = sql.match(re)
  if (!m) throw new Error(`Could not extract function ${name}`)
  return m[0]
}

const USER = '11111111-1111-1111-1111-111111111111'

/** Minimal schema: only what the money-path RPCs touch. */
const TABLES = `
  CREATE TABLE public.profiles (
    id UUID PRIMARY KEY,
    credits INTEGER DEFAULT 3 NOT NULL,
    subscription_status TEXT NULL,
    current_period_end TIMESTAMPTZ NULL
  );
  CREATE TABLE public.purchases (
    id                    SERIAL PRIMARY KEY,
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
`

// Supabase roles referenced by the migration's REVOKE/GRANT. Stubs only — see
// HONEST LIMITS above. These do not model RLS or BYPASSRLS.
const ROLES = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
`

async function freshDb(startingCredits: number) {
  const db = await PGlite.create()
  await db.exec(ROLES)
  await db.exec(TABLES)
  await db.query(`INSERT INTO public.profiles (id, credits) VALUES ($1, $2)`, [
    USER,
    startingCredits,
  ])
  return db
}

const balance = async (db: PGlite): Promise<number> => {
  const r = await db.query<{ credits: number }>(
    `SELECT credits FROM public.profiles WHERE id = $1`,
    [USER]
  )
  return r.rows[0].credits
}

// ── The definitions this migration REPLACES. Copied verbatim from the live
// bodies (supabase_schema.sql @ 8f2b121). Kept so the suite demonstrates the
// bug it fixes, rather than only asserting the happy path afterwards.
const OLD_GRANT = `
CREATE OR REPLACE FUNCTION public.grant_credits_for_purchase(
  p_user_id uuid, p_paddle_transaction_id text, p_type text,
  p_credits integer, p_amount_cents integer
) RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.purchases (user_id, paddle_transaction_id, type, credits_granted, amount_cents, status)
  VALUES (p_user_id, p_paddle_transaction_id, p_type, p_credits, p_amount_cents, 'completed')
  ON CONFLICT (paddle_transaction_id) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.profiles
  SET credits = LEAST(500, GREATEST(0, COALESCE(credits, 0) + p_credits))
  WHERE id = p_user_id;
  RETURN true;
END; $$;`

const OLD_REFUND_CREDIT = `
CREATE OR REPLACE FUNCTION public.refund_credit(p_user_id uuid, p_cost integer)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF p_cost <= 0 THEN RETURN; END IF;
  UPDATE public.profiles SET credits = LEAST(500, credits + p_cost) WHERE id = p_user_id;
END; $$;`

// Unchanged by this migration; pulled from the schema mirror so symmetry can be
// exercised end-to-end.
const RESERVE_CREDIT = extractFn(SCHEMA, 'reserve_credit')
const REVERSE_REFUND = extractFn(SCHEMA, 'reverse_credits_for_refund')

const grant = (db: PGlite, txn: string, type: string, credits: number) =>
  db.query(`SELECT public.grant_credits_for_purchase($1,$2,$3,$4,$5) AS ok`, [
    USER,
    txn,
    type,
    credits,
    499,
  ])

const reverse = (db: PGlite, txn: string) =>
  db.query(`SELECT public.reverse_credits_for_refund($1) AS ok`, [txn])

// ───────────────────────────────────────────────────────────────────────────
describe('CHARACTERIZATION — the bug this migration fixes (OLD definitions)', () => {
  it('item 5(a) SILENT UNDER-GRANT: a subscriber at 500 pays and receives nothing', async () => {
    const db = await freshDb(500)
    await db.exec(OLD_GRANT)
    await grant(db, 'txn_undergrant', 'subscription_cycle', 100)

    expect(await balance(db)).toBe(500) // paid $9.99, applied delta = 0

    const led = await db.query<{ credits_granted: number }>(
      `SELECT credits_granted FROM public.purchases WHERE paddle_transaction_id = 'txn_undergrant'`
    )
    // The ledger claims 100 were granted. Zero actually were.
    expect(led.rows[0].credits_granted).toBe(100)
    await db.close()
  })

  it('item 5(b) OVER-CLAWBACK: 490 + 30-pack, then refund, destroys 20 held credits', async () => {
    const db = await freshDb(490)
    await db.exec(OLD_GRANT)
    await db.exec(REVERSE_REFUND)

    await grant(db, 'txn_clawback', 'pack', 30)
    expect(await balance(db)).toBe(500) // clamped: applied +10, ledgered 30

    await reverse(db, 'txn_clawback')
    expect(await balance(db)).toBe(470) // subtracted the ledgered 30
    // Started at 490, refunded, ended at 470 → 20 credits destroyed.
    await db.close()
  })

  it('REGRESSION the naive fix would ship: refund_credit destroys every credit above 500', async () => {
    const db = await freshDb(600) // reachable only once the grant cap is gone
    await db.exec(RESERVE_CREDIT)
    await db.exec(OLD_REFUND_CREDIT)

    await db.query(`SELECT public.reserve_credit($1, 1)`, [USER])
    expect(await balance(db)).toBe(599)

    await db.query(`SELECT public.refund_credit($1, 1)`, [USER]) // Gemini 503 → finally{}
    expect(await balance(db)).toBe(500) // 100 credits destroyed by ONE failed call
    await db.close()
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('MIGRATION 2026-07-09 — cap removed (runs the real migration file)', () => {
  async function migrated(startingCredits: number) {
    const db = await freshDb(startingCredits)
    await db.exec(REVERSE_REFUND) // unchanged, needed for symmetry tests
    await db.exec(RESERVE_CREDIT) // unchanged
    await db.exec(MIGRATION) // ← the actual file that will be run on prod
    return db
  }

  it('grant applies the FULL p_credits with no ceiling (490 + 30 = 520)', async () => {
    const db = await migrated(490)
    await grant(db, 'txn_a', 'pack', 30)
    expect(await balance(db)).toBe(520)
    await db.close()
  })

  it('subscriber at 500 now receives the 100 credits they paid for', async () => {
    const db = await migrated(500)
    await grant(db, 'txn_b', 'subscription_cycle', 100)
    expect(await balance(db)).toBe(600)
    await db.close()
  })

  it('SYMMETRY: granted N → reversed N, balance returns exactly to the start', async () => {
    for (const [start, credits, type] of [
      [0, 30, 'pack'],
      [3, 30, 'pack'],
      [490, 30, 'pack'],
      [500, 100, 'subscription_cycle'],
      [1234, 100, 'subscription_cycle'],
    ] as [number, number, string][]) {
      const db = await migrated(start)
      await grant(db, `txn_sym_${start}`, type, credits)
      expect(await balance(db)).toBe(start + credits)
      await reverse(db, `txn_sym_${start}`)
      expect(await balance(db)).toBe(start) // exact round-trip; item 5 cannot fire
      await db.close()
    }
  })

  it('ledger credits_granted now equals the ACTUAL applied delta', async () => {
    const db = await migrated(490)
    const before = await balance(db)
    await grant(db, 'txn_c', 'pack', 30)
    const after = await balance(db)

    const led = await db.query<{ credits_granted: number }>(
      `SELECT credits_granted FROM public.purchases WHERE paddle_transaction_id = 'txn_c'`
    )
    expect(led.rows[0].credits_granted).toBe(after - before) // 30 === 30
    await db.close()
  })

  it('refund_credit restores exactly what reserve_credit took, above 500', async () => {
    const db = await migrated(600)
    await db.query(`SELECT public.reserve_credit($1, 1)`, [USER])
    expect(await balance(db)).toBe(599)
    await db.query(`SELECT public.refund_credit($1, 1)`, [USER])
    expect(await balance(db)).toBe(600) // was 500 before this migration
    await db.close()
  })

  it('grant remains exactly-once against duplicate webhook deliveries', async () => {
    const db = await migrated(0)
    const first = await grant(db, 'txn_dup', 'pack', 30)
    const second = await grant(db, 'txn_dup', 'pack', 30)
    expect((first.rows[0] as any).ok).toBe(true)
    expect((second.rows[0] as any).ok).toBe(false)
    expect(await balance(db)).toBe(30) // granted once, not twice
    await db.close()
  })

  it('reversal remains exactly-once against duplicate refund deliveries', async () => {
    const db = await migrated(0)
    await grant(db, 'txn_rev', 'pack', 30)
    const first = await reverse(db, 'txn_rev')
    const second = await reverse(db, 'txn_rev')
    expect((first.rows[0] as any).ok).toBe(true)
    expect((second.rows[0] as any).ok).toBe(false)
    expect(await balance(db)).toBe(0) // reversed once, no double-deduct
    await db.close()
  })

  it('GREATEST(0,…) floor on reversal is PRESERVED (backlog item 6, accepted)', async () => {
    const db = await migrated(3) // 3 free signup credits
    await grant(db, 'txn_floor', 'pack', 30)
    expect(await balance(db)).toBe(33)
    await db.query(`SELECT public.reserve_credit($1, 30)`, [USER]) // consume the pack
    expect(await balance(db)).toBe(3)
    await reverse(db, 'txn_floor')
    // Floors at 0 rather than going negative. Takes the 3 free credits — this is
    // item 6, disclosed in Terms §04, deliberately NOT fixed here.
    expect(await balance(db)).toBe(0)
    await db.close()
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('SOURCE INVARIANTS — no clamp left behind, security posture intact', () => {
  it('the migration removes LEAST(500 from both functions it replaces', () => {
    expect(MIGRATION).not.toMatch(/SET credits = LEAST\(500/)
  })

  // Asserts on the STATEMENT, not on any mention: both bodies retain prose
  // comments explaining why the clamp was removed, which legitimately contain
  // the string "LEAST(500". Matching those would be a false positive.
  it('schema mirror: no `SET credits = LEAST(500` in grant_credits_for_purchase or refund_credit', () => {
    expect(extractFn(SCHEMA, 'grant_credits_for_purchase')).not.toMatch(/SET credits = LEAST\(500/)
    expect(extractFn(SCHEMA, 'refund_credit')).not.toMatch(/SET credits = LEAST\(500/)
  })

  it('reverse_credits_for_refund still floors at 0 (item 6 stays disclosed, not fixed)', () => {
    expect(extractFn(SCHEMA, 'reverse_credits_for_refund')).toMatch(/GREATEST\(0/)
  })

  it('reserve_credit is untouched: decrement-if-sufficient, no ceiling', () => {
    const fn = extractFn(SCHEMA, 'reserve_credit')
    expect(fn).toMatch(/SET credits = credits - p_cost/)
    expect(fn).toMatch(/AND credits >= p_cost/)
    expect(fn).not.toMatch(/LEAST\(/)
  })

  it('migration keeps EXECUTE locked to service_role (text-level; verify on live DB too)', () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.grant_credits_for_purchase[\s\S]*FROM PUBLIC, anon, authenticated;/
    )
    expect(MIGRATION).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.grant_credits_for_purchase[\s\S]*TO service_role;/
    )
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.refund_credit[\s\S]*TO service_role;/)
    // SECURITY DEFINER must never appear on the money path.
    expect(MIGRATION).not.toMatch(/SECURITY DEFINER/)
  })

  it('the applied 2026-07-06 migration is NOT retroactively edited (still has its clamp)', () => {
    const applied = readFileSync(
      join(ROOT, 'migrations', '2026-07-06_reserve_before_spend_rpcs.sql'),
      'utf8'
    )
    expect(applied).toMatch(/STATUS: APPLIED/)
    expect(applied).toMatch(/SET credits = LEAST\(500, credits \+ p_cost\)/)
  })
})
