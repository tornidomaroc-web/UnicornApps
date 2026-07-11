/**
 * SQL-level tests for the rate limiter RPC (backlog item 21, PR 1).
 *
 * Runs the ACTUAL `check_rate_limits` body — read verbatim from
 * supabase_schema.sql on disk — against real PostgreSQL (PGlite: Postgres in
 * WASM, in-process, no server/Docker). The window arithmetic under test is the
 * arithmetic that ships.
 *
 * HONEST LIMITS. PGlite is upstream Postgres, not Supabase — it does NOT model
 * RLS, the service_role BYPASSRLS behaviour, or PostgREST exposure. The service-
 * role-only EXECUTE grant is asserted at the TEXT level below and must still be
 * confirmed on the live DB via the VERIFY block in
 * migrations/2026-07-11_add_rate_limiter.sql. These tests verify SEMANTICS.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'

jest.setTimeout(60_000)

const ROOT = join(__dirname, '..')
const SCHEMA = readFileSync(join(ROOT, 'supabase_schema.sql'), 'utf8')
const MIGRATION = readFileSync(
  join(ROOT, 'migrations', '2026-07-11_add_rate_limiter.sql'),
  'utf8'
)

/** Extract one `CREATE OR REPLACE FUNCTION public.<name>(...) ... $$;` block. */
function extractFn(sql: string, name: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`)
  const m = sql.match(re)
  if (!m) throw new Error(`Could not extract function ${name}`)
  return m[0]
}

const CHECK_FN = extractFn(SCHEMA, 'check_rate_limits')

const UA = '11111111-1111-1111-1111-111111111111'
const UB = '22222222-2222-2222-2222-222222222222'

const TABLE = `
  CREATE TABLE public.rate_limits (
    bucket_key   TEXT    PRIMARY KEY,
    window_start BIGINT  NOT NULL,
    count        INTEGER NOT NULL
  );
`

async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(TABLE)
  await db.exec(CHECK_FN)
  return db
}

/** Call check_rate_limits and return the scope string. */
async function call(
  db: PGlite,
  userId: string,
  limits: { urpm: number; urpd: number; grpm: number; grpd: number }
): Promise<string> {
  const r = await db.query<{ scope: string }>(
    `SELECT public.check_rate_limits($1,$2,$3,$4,$5) AS scope`,
    [userId, limits.urpm, limits.urpd, limits.grpm, limits.grpd]
  )
  return r.rows[0].scope
}

// Generous defaults; individual tests tighten the one dimension they exercise so
// the others never interfere.
const HIGH = { urpm: 1000, urpd: 1000, grpm: 1000, grpd: 1000 }

describe('check_rate_limits — per-user RPM', () => {
  it('allows up to the limit, then blocks with the exact scope', async () => {
    const db = await freshDb()
    const limits = { ...HIGH, urpm: 3 }
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UA, limits)).toBe('user_rpm') // 4th blocked
    expect(await call(db, UA, limits)).toBe('user_rpm') // stays blocked
  })
})

describe('check_rate_limits — global RPM', () => {
  it('blocks with global_rpm even when each user is under their per-user cap', async () => {
    const db = await freshDb()
    // user cap high, global cap 2: two different users, third call (either user)
    // trips the shared global minute window.
    const limits = { ...HIGH, grpm: 2 }
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UB, limits)).toBe('allowed')
    expect(await call(db, UB, limits)).toBe('global_rpm') // global window full
    expect(await call(db, UA, limits)).toBe('global_rpm') // other user also blocked
  })
})

describe('check_rate_limits — global vs per-user independence (other direction)', () => {
  it('one user hits user_rpm while global still has room; the other user proceeds', async () => {
    const db = await freshDb()
    const limits = { ...HIGH, urpm: 1, grpm: 10 }
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UA, limits)).toBe('user_rpm') // UA exhausted their per-user cap
    expect(await call(db, UB, limits)).toBe('allowed') // UB unaffected; global has room
  })
})

describe('check_rate_limits — window reset', () => {
  it('resets when the stored minute window has rolled over', async () => {
    const db = await freshDb()
    const limits = { ...HIGH, urpm: 1 }
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UA, limits)).toBe('user_rpm') // blocked in the current window

    // Simulate the minute rolling over by aging every stored window back one
    // window (RPM window = 60s -> subtract 1 from the window index). The next
    // call must see effective count 0 and be allowed again.
    await db.exec(`UPDATE public.rate_limits SET window_start = window_start - 1`)
    expect(await call(db, UA, limits)).toBe('allowed')
  })
})

describe('check_rate_limits — no phantom increment on block', () => {
  it('a request blocked on one window increments NO bucket', async () => {
    const db = await freshDb()
    // Global minute cap is the binding one (1). First call fills it; second call
    // is blocked by global — and must NOT have incremented the per-user buckets.
    const limits = { ...HIGH, grpm: 1 }
    expect(await call(db, UA, limits)).toBe('allowed')
    expect(await call(db, UB, limits)).toBe('global_rpm')

    // UB's per-user minute bucket must still be at effective 0 (created at 0 by
    // the pre-insert, never incremented) — so with a fresh global window UB is
    // allowed immediately, proving the blocked call consumed no user budget.
    const r = await db.query<{ count: number }>(
      `SELECT count FROM public.rate_limits WHERE bucket_key = $1`,
      [`u:${UB}:m`]
    )
    expect(r.rows[0].count).toBe(0)
  })
})

describe('check_rate_limits — misconfig fails open', () => {
  it("returns 'allowed' when any limit is non-positive", async () => {
    const db = await freshDb()
    expect(await call(db, UA, { urpm: 0, urpd: 100, grpm: 8, grpd: 1200 })).toBe('allowed')
    expect(await call(db, UA, { urpm: 4, urpd: 100, grpm: -1, grpd: 1200 })).toBe('allowed')
    // And it does not record anything when it short-circuits on misconfig.
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.rate_limits`)
    expect(r.rows[0].n).toBe(0)
  })
})

describe('check_rate_limits — security posture (text-level, per HONEST LIMITS)', () => {
  it('locks EXECUTE to service_role and revokes PUBLIC/anon/authenticated in both files', () => {
    for (const sql of [SCHEMA, MIGRATION]) {
      expect(sql).toMatch(
        /REVOKE ALL ON FUNCTION public\.check_rate_limits\([^)]*\) FROM PUBLIC, anon, authenticated;/
      )
      expect(sql).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.check_rate_limits\([^)]*\) TO service_role;/
      )
    }
  })

  it('schema and migration carry the same function body (line endings normalized)', () => {
    // The repo has mixed CRLF/LF across files, which is an editor/git artifact,
    // not a semantic difference — normalize before comparing the SQL content.
    const norm = (s: string) => s.replace(/\r\n/g, '\n')
    expect(norm(extractFn(MIGRATION, 'check_rate_limits'))).toBe(norm(CHECK_FN))
  })
})
