/**
 * The free-credit claim gate, run from supabase_schema.sql in PGlite:
 *   - an account our server made (provider 'email') is born with 3 credits,
 *     claimed; any other provider is born with 0, unclaimed;
 *   - a 0-credit account cannot reserve a credit, so it cannot reach Gemini;
 *   - claim_free_credits pays once, and only once, and refuses an unknown row;
 *   - the ledger accepts the new outcomes and the method column, and the
 *     health check classifies them as designed.
 * PGlite does not model Supabase grants, so those are asserted on the text and
 * confirmed live with the migration's VERIFY block.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'

jest.setTimeout(60_000)

const ROOT = join(__dirname, '..')
const unix = (s: string) => s.split('\r\n').join('\n')
const SCHEMA = unix(readFileSync(join(ROOT, 'supabase_schema.sql'), 'utf8'))
const MIGRATION = unix(readFileSync(join(ROOT, 'migrations', '2026-10-10_add_free_credit_claim.sql'), 'utf8'))

const fn = (sql: string, name: string) => {
  const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`))
  if (!m) throw new Error(`function ${name} not found`)
  return m[0]
}
const TABLE = (sql: string, name: string) => {
  const m = sql.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))
  if (!m) throw new Error(`table ${name} not found`)
  return m[0]
}
const outcomesIn = (sql: string) => {
  const m = sql.replace(/--[^\n]*/g, '').match(/CHECK \(outcome IN \(([\s\S]*?)\)\)/)
  if (!m) throw new Error('outcome CHECK not found')
  return Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map(x => x[1]).sort()
}

const U = {
  email: '11111111-1111-4111-8111-111111111111',
  google: '22222222-2222-4222-8222-222222222222',
  bare: '33333333-3333-4333-8333-333333333333',
  nobody: '44444444-4444-4444-8444-444444444444',
}

let db: PGlite
beforeEach(async () => {
  db = await PGlite.create()
  // The trigger fires on auth.users; a stub with the columns the function reads.
  await db.exec('CREATE SCHEMA auth')
  await db.exec('CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_app_meta_data jsonb)')
  await db.exec(TABLE(SCHEMA, 'profiles'))
  await db.exec(fn(SCHEMA, 'handle_new_user'))
  await db.exec('CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()')
  await db.exec(fn(SCHEMA, 'claim_free_credits'))
  await db.exec(fn(SCHEMA, 'reserve_credit'))
  await db.query('INSERT INTO auth.users VALUES ($1, $2, $3)', [U.email, 'a@example.com', { provider: 'email', providers: ['email'] }])
  await db.query('INSERT INTO auth.users VALUES ($1, $2, $3)', [U.google, 'b@example.com', { provider: 'google', providers: ['google'] }])
  await db.query('INSERT INTO auth.users VALUES ($1, $2, $3)', [U.bare, 'c@example.com', {}])
})

const profile = async (id: string) =>
  (await db.query<{ credits: number; claimed: boolean }>(
    'SELECT credits, free_credits_claimed_at IS NOT NULL AS claimed FROM profiles WHERE id = $1', [id]
  )).rows[0]
const claim = async (id: string) =>
  (await db.query<{ r: string }>('SELECT public.claim_free_credits($1) AS r', [id])).rows[0].r
const reserve = async (id: string) =>
  (await db.query<{ r: boolean }>('SELECT public.reserve_credit($1, 1) AS r', [id])).rows[0].r

describe('the files agree', () => {
  it('the migration ships the same functions as the schema, and the same outcome list', () => {
    for (const name of ['handle_new_user', 'claim_free_credits', 'signup_health']) {
      expect(fn(MIGRATION, name)).toBe(fn(SCHEMA, name))
    }
    expect(outcomesIn(MIGRATION)).toEqual(outcomesIn(TABLE(SCHEMA, 'signup_outcomes')))
    expect(outcomesIn(TABLE(SCHEMA, 'signup_outcomes'))).toEqual(expect.arrayContaining(['claimed', 'claim_failed', 'linked']))
  })

  it('claim_free_credits is service_role only, in both files', () => {
    for (const sql of [SCHEMA, MIGRATION]) {
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.claim_free_credits\(uuid\) FROM PUBLIC, anon, authenticated;/)
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_free_credits\(uuid\) TO service_role;/)
    }
  })

  it('the migration backfills every existing account as claimed before anything else', () => {
    const backfill = MIGRATION.indexOf('SET free_credits_claimed_at = created_at')
    expect(backfill).toBeGreaterThan(0)
    expect(backfill).toBeLessThan(MIGRATION.indexOf('CREATE OR REPLACE FUNCTION public.handle_new_user'))
  })
})

describe('who is born with credits', () => {
  it('an account our server made has 3 credits and is claimed', async () => {
    expect(await profile(U.email)).toEqual({ credits: 3, claimed: true })
  })

  it('a Google account has 0 credits and is unclaimed', async () => {
    expect(await profile(U.google)).toEqual({ credits: 0, claimed: false })
  })

  it('an account with no provider at all is treated like Google, not like email', async () => {
    expect(await profile(U.bare)).toEqual({ credits: 0, claimed: false })
  })

  it('a 0-credit account cannot reserve a credit, so it never reaches Gemini', async () => {
    expect(await reserve(U.google)).toBe(false)
    expect(await profile(U.google)).toEqual({ credits: 0, claimed: false })
    expect(await reserve(U.email)).toBe(true)
  })
})

describe('claim_free_credits', () => {
  it('pays 3 credits once, then refuses', async () => {
    expect(await claim(U.google)).toBe('claimed')
    expect(await profile(U.google)).toEqual({ credits: 3, claimed: true })
    expect(await claim(U.google)).toBe('already_claimed')
    expect(await profile(U.google)).toEqual({ credits: 3, claimed: true })
    expect(await reserve(U.google)).toBe(true)
  })

  it('refuses an account that was born claimed (an email account cannot double up)', async () => {
    expect(await claim(U.email)).toBe('already_claimed')
    expect(await profile(U.email)).toEqual({ credits: 3, claimed: true })
  })

  it('names a missing profile instead of paying into nothing', async () => {
    expect(await claim(U.nobody)).toBe('no_profile')
  })

  it('two claims racing on one row pay once', async () => {
    const [a, b] = await Promise.all([claim(U.google), claim(U.google)])
    expect([a, b].sort()).toEqual(['already_claimed', 'claimed'])
    expect(await profile(U.google)).toEqual({ credits: 3, claimed: true })
  })
})

describe('the ledger and the health check with the new codes', () => {
  beforeEach(async () => {
    await db.exec(TABLE(SCHEMA, 'signup_outcomes'))
    await db.exec(fn(SCHEMA, 'signup_health'))
  })
  const insert = (outcome: string, detail: string | null, method = 'google', minutesAgo = 10) =>
    db.query(
      `INSERT INTO signup_outcomes (created_at, outcome, detail, method, turnstile_checked) VALUES (now() - ($1 || ' minutes')::interval, $2, $3, $4, true)`,
      [String(minutesAgo), outcome, detail, method]
    )
  const health = async () => (await db.query<{ h: any }>('SELECT public.signup_health(now()) AS h')).rows[0].h

  it('accepts the new outcomes and methods, refuses anything else', async () => {
    await insert('claimed', null)
    await insert('claim_failed', 'already_claimed')
    await insert('linked', null)
    await insert('created', null, 'email')
    await expect(insert('claimed', null, 'facebook')).rejects.toThrow()
    await expect(insert('granted', null)).rejects.toThrow()
    const rows = await db.query<{ method: string }>("SELECT method FROM signup_outcomes WHERE outcome = 'created'")
    expect(rows.rows[0].method).toBe('email')
  })

  it("a claim counts as a sign-up; a double submit and a link never alert; a failed grant is OUR failure", async () => {
    await insert('claimed', null)
    await insert('claim_failed', 'already_claimed')
    await insert('linked', null)
    let h = await health()
    expect(h.alert).toBe(false)
    expect(h.counts).toMatchObject({ attempts: 3, created: 1, user_errors: 2, system_failures: 0 })

    await insert('claim_failed', 'no_profile')
    h = await health()
    expect(h.alert).toBe(true)
    expect(h.reasons).toContain('system_failure_started')
    expect(h.counts.system_failures).toBe(1)
  })
})
