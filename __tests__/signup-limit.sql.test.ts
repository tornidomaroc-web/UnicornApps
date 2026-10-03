/**
 * SQL-level tests for the per-network sign-up cap, `check_signup_limit`.
 *
 * Runs the function body read verbatim from supabase_schema.sql against real
 * PostgreSQL (PGlite). Like rate-limit.sql.test.ts, PGlite does not model
 * Supabase grants, so the service-role-only EXECUTE is asserted on the text and
 * must still be confirmed live with the migration's VERIFY block.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'

jest.setTimeout(60_000)

const ROOT = join(__dirname, '..')
const SCHEMA = readFileSync(join(ROOT, 'supabase_schema.sql'), 'utf8')
const MIGRATION = readFileSync(join(ROOT, 'migrations', '2026-10-03_add_signup_limit.sql'), 'utf8')

function extractFn(sql: string, name: string): string {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`))
  if (!m) throw new Error(`Could not extract function ${name}`)
  return m[0]
}

const FN = extractFn(SCHEMA, 'check_signup_limit')

async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(`CREATE TABLE public.rate_limits (
    bucket_key TEXT PRIMARY KEY, window_start BIGINT NOT NULL, count INTEGER NOT NULL)`)
  await db.exec(FN)
  return db
}

async function call(db: PGlite, network: string, perHour: number, perDay: number): Promise<string> {
  const r = await db.query<{ v: string }>('SELECT public.check_signup_limit($1, $2, $3) AS v', [network, perHour, perDay])
  return r.rows[0].v
}

describe('check_signup_limit', () => {
  it('the migration ships the same body as the schema', () => {
    expect(extractFn(MIGRATION, 'check_signup_limit')).toBe(FN)
  })

  it('EXECUTE is revoked from clients and granted to service_role only, in both files', () => {
    for (const sql of [SCHEMA, MIGRATION]) {
      expect(sql).toMatch(
        /REVOKE ALL ON FUNCTION public\.check_signup_limit\(text, integer, integer\) FROM PUBLIC, anon, authenticated;/
      )
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.check_signup_limit\(text, integer, integer\) TO service_role;/)
    }
  })

  it('admits up to the hourly cap, then reports the hour', async () => {
    const db = await freshDb()
    for (let i = 0; i < 3; i++) expect(await call(db, 'net-a', 3, 10)).toBe('allowed')
    expect(await call(db, 'net-a', 3, 10)).toBe('hour')
  })

  it('the day is checked first and wins when both are full', async () => {
    const db = await freshDb()
    for (let i = 0; i < 2; i++) expect(await call(db, 'net-a', 2, 2)).toBe('allowed')
    expect(await call(db, 'net-a', 2, 2)).toBe('day')
  })

  it('a refused attempt spends nothing', async () => {
    const db = await freshDb()
    await call(db, 'net-a', 1, 10)
    expect(await call(db, 'net-a', 1, 10)).toBe('hour')
    const r = await db.query<{ bucket_key: string; count: number }>(
      "SELECT bucket_key, count FROM rate_limits WHERE bucket_key LIKE 's:net-a:%' ORDER BY bucket_key"
    )
    expect(r.rows).toEqual([
      { bucket_key: 's:net-a:d', count: 1 },
      { bucket_key: 's:net-a:h', count: 1 },
    ])
  })

  it('networks are counted separately', async () => {
    const db = await freshDb()
    expect(await call(db, 'net-a', 1, 1)).toBe('allowed')
    expect(await call(db, 'net-a', 1, 1)).toBe('day')
    expect(await call(db, 'net-b', 1, 1)).toBe('allowed')
  })

  it('fails open on a non-positive limit or an empty key', async () => {
    const db = await freshDb()
    expect(await call(db, 'net-a', 0, 10)).toBe('allowed')
    expect(await call(db, 'net-a', 5, -1)).toBe('allowed')
    expect(await call(db, '', 1, 1)).toBe('allowed')
    const r = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rate_limits')
    expect(r.rows[0].n).toBe(0)
  })

  it('never shares a bucket with the generation limiter', async () => {
    const db = await freshDb()
    await call(db, 'net-a', 5, 10)
    const r = await db.query<{ bucket_key: string }>('SELECT bucket_key FROM rate_limits')
    for (const { bucket_key } of r.rows) expect(bucket_key.startsWith('s:')).toBe(true)
  })
})
