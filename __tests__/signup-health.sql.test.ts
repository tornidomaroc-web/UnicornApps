/**
 * The sign-up outcome ledger and `signup_health`, run from supabase_schema.sql
 * in PGlite. What the alert rule must and must not do:
 *   - user errors, in any number, never alert;
 *   - a system failure alerts on the runs right after it starts, then goes
 *     quiet, with a reminder on the 6-hourly run while it continues;
 *   - repeated fail-open (Cloudflare unreachable) alerts;
 *   - the table cannot hold an address or a sentence.
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
const MIGRATION = unix(readFileSync(join(ROOT, 'migrations', '2026-10-04_add_signup_outcomes.sql'), 'utf8'))

const extract = (sql: string, re: RegExp) => {
  const m = sql.match(re)
  if (!m) throw new Error(`not found: ${re}`)
  return m[0]
}
const TABLE = (sql: string) => extract(sql, /CREATE TABLE public\.signup_outcomes \([\s\S]*?\n\);/)
const FN = (sql: string) => extract(sql, /CREATE OR REPLACE FUNCTION public\.signup_health\(p_now[\s\S]*?\$\$;/)
const VERDICT = (sql: string) => extract(sql, /CREATE OR REPLACE FUNCTION public\.signup_health_verdict\b[\s\S]*?\$\$;/)
// Every GRANT / REVOKE / ALTER TABLE line that names the ledger or its functions.
const GRANTS = (sql: string) =>
  sql
    .split('\n')
    .filter(l => /^(GRANT|REVOKE|ALTER TABLE)\b.*signup_(outcomes|health)/.test(l))
    .join('\n')

// A quiet hour (02:xx UTC is not a reminder slot) and a reminder slot (06:xx).
const QUIET = '2026-10-04T02:40:00Z'
const SLOT = '2026-10-04T06:10:00Z'
const minus = (iso: string, minutes: number) => new Date(Date.parse(iso) - minutes * 60_000).toISOString()

let db: PGlite
beforeEach(async () => {
  db = await PGlite.create()
  await db.exec(TABLE(SCHEMA))
  await db.exec(FN(SCHEMA))
  await db.exec(VERDICT(SCHEMA))
})

type Row = { at: string; outcome: string; detail?: string | null; unchecked?: boolean }
const insert = async (rows: Row[]) => {
  for (const r of rows)
    await db.query(
      'INSERT INTO signup_outcomes (created_at, outcome, detail, turnstile_checked) VALUES ($1, $2, $3, $4)',
      [r.at, r.outcome, r.detail ?? null, r.unchecked ? false : r.outcome === 'created' ? true : null]
    )
}
const health = async (now: string) =>
  (await db.query<{ h: any }>('SELECT public.signup_health($1::timestamptz) AS h', [now])).rows[0].h

describe('the files agree', () => {
  it('the migration ships the same table, functions and grants as the schema', () => {
    expect(TABLE(MIGRATION)).toBe(TABLE(SCHEMA))
    expect(FN(MIGRATION)).toBe(FN(SCHEMA))
    expect(VERDICT(MIGRATION)).toBe(VERDICT(SCHEMA))
    expect(GRANTS(MIGRATION)).toBe(GRANTS(SCHEMA))
  })

  it('the exact privilege text: clients hold nothing; the counts are service_role only; anon gets one boolean', () => {
    expect(GRANTS(SCHEMA)).toBe(
      [
        'ALTER TABLE public.signup_outcomes ENABLE ROW LEVEL SECURITY;',
        'REVOKE ALL ON TABLE public.signup_outcomes FROM PUBLIC, anon, authenticated;',
        'GRANT INSERT, SELECT, DELETE ON TABLE public.signup_outcomes TO service_role;',
        'REVOKE ALL ON FUNCTION public.signup_health(timestamptz) FROM PUBLIC, anon, authenticated;',
        'GRANT EXECUTE ON FUNCTION public.signup_health(timestamptz) TO service_role;',
        'REVOKE ALL ON FUNCTION public.signup_health_verdict(timestamptz) FROM PUBLIC, authenticated;',
        'GRANT EXECUTE ON FUNCTION public.signup_health_verdict(timestamptz) TO anon, service_role;',
      ].join('\n')
    )
    for (const fn of [FN(SCHEMA), VERDICT(SCHEMA)]) {
      expect(fn).toMatch(/\nSTABLE\n/)
      expect(fn).toMatch(/\nSECURITY DEFINER\n/)
      expect(fn).toMatch(/SET search_path = public/)
    }
  })
})

describe('what each role can actually do (roles created as Supabase defines them)', () => {
  // Supabase's roles: anon and authenticated are plain; service_role has
  // BYPASSRLS. The grants are run verbatim from the schema, then each role is
  // assumed with SET ROLE. PGlite is real PostgreSQL, so a refusal here is the
  // same refusal production gives.
  const as = async (role: string, sql: string) => {
    await db.exec(`SET ROLE ${role}`)
    try {
      return await db.query(sql)
    } finally {
      await db.exec('RESET ROLE')
    }
  }
  beforeEach(async () => {
    await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS')
    await db.exec('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role')
    // Supabase's default privileges hand ALL on new tables and EXECUTE on new
    // functions to these roles; reproduced so the REVOKEs are tested against it.
    await db.exec('GRANT ALL ON TABLE public.signup_outcomes TO anon, authenticated, service_role')
    await db.exec('GRANT EXECUTE ON FUNCTION public.signup_health(timestamptz), public.signup_health_verdict(timestamptz) TO anon, authenticated, service_role')
    await db.exec(GRANTS(SCHEMA).split('\n').filter(l => !l.startsWith('ALTER TABLE')).join('\n'))
    await insert([{ at: minus(QUIET, 10), outcome: 'hook_refused_server' }])
  })

  it.each(['anon', 'authenticated'])('%s can neither read nor write the ledger', async (role) => {
    await expect(as(role, 'SELECT count(*) FROM public.signup_outcomes')).rejects.toThrow(/permission denied/)
    await expect(as(role, "INSERT INTO public.signup_outcomes (outcome) VALUES ('created')")).rejects.toThrow(/permission denied/)
    await expect(as(role, 'DELETE FROM public.signup_outcomes')).rejects.toThrow(/permission denied/)
  })

  it.each(['anon', 'authenticated'])('%s cannot read the counts', async (role) => {
    await expect(as(role, 'SELECT public.signup_health()')).rejects.toThrow(/permission denied/)
  })

  it('anon can read the one boolean, and it is computed over rows anon cannot see', async () => {
    const r = await as('anon', `SELECT public.signup_health_verdict('${QUIET}'::timestamptz) AS v`)
    expect(r.rows[0]).toEqual({ v: true })
  })

  it('authenticated cannot read even the boolean', async () => {
    await expect(as('authenticated', 'SELECT public.signup_health_verdict()')).rejects.toThrow(/permission denied/)
  })

  it('service_role writes, reads, deletes and gets the counts', async () => {
    await as('service_role', "INSERT INTO public.signup_outcomes (outcome) VALUES ('created')")
    const n = await as('service_role', 'SELECT count(*)::int AS n FROM public.signup_outcomes')
    expect(n.rows[0]).toEqual({ n: 2 })
    await as('service_role', "DELETE FROM public.signup_outcomes WHERE outcome = 'created'")
    const h = await as('service_role', `SELECT public.signup_health('${QUIET}'::timestamptz) AS h`)
    expect((h.rows[0] as any).h.counts.system_failures).toBe(1)
  })
})

describe('the table cannot identify a person', () => {
  it('refuses an address, a sentence, an unknown outcome', async () => {
    await expect(insert([{ at: QUIET, outcome: 'create_failed', detail: 'x@example.com' }])).rejects.toThrow(/check/i)
    await expect(insert([{ at: QUIET, outcome: 'create_failed', detail: 'A user with this email exists' }])).rejects.toThrow(/check/i)
    await expect(insert([{ at: QUIET, outcome: 'something_else' }])).rejects.toThrow(/check/i)
    await expect(insert([{ at: QUIET, outcome: 'create_failed', detail: 'a'.repeat(121) }])).rejects.toThrow(/check/i)
  })

  it('accepts the codes the writer sends', async () => {
    await insert([
      { at: QUIET, outcome: 'captcha_rejected', detail: 'invalid-input-response,timeout-or-duplicate' },
      { at: QUIET, outcome: 'create_failed', detail: 'email_exists' },
      { at: QUIET, outcome: 'signup_limited', detail: 'hour' },
      { at: QUIET, outcome: 'created' },
    ])
    expect((await health(QUIET)).counts.attempts).toBe(4)
  })
})

describe('signup_health', () => {
  it('an empty ledger is healthy', async () => {
    const h = await health(QUIET)
    expect(h.alert).toBe(false)
    expect(h.reasons).toEqual([])
    expect(h.counts).toEqual({ attempts: 0, created: 0, user_errors: 0, system_failures: 0, turnstile_unchecked: 0 })
    expect(h.by_outcome).toEqual([])
  })

  it('user errors never alert, however many', async () => {
    const rows: Row[] = []
    for (let i = 0; i < 40; i++) rows.push({ at: minus(QUIET, i * 20), outcome: 'captcha_no_token' })
    for (let i = 0; i < 10; i++) rows.push({ at: minus(QUIET, i * 30), outcome: 'captcha_rejected', detail: 'invalid-input-response' })
    rows.push({ at: minus(QUIET, 5), outcome: 'captcha_rejected', detail: 'timeout-or-duplicate' })
    rows.push({ at: minus(QUIET, 5), outcome: 'create_failed', detail: 'email_exists' })
    rows.push({ at: minus(QUIET, 6), outcome: 'create_failed', detail: 'user_already_exists' })
    rows.push({ at: minus(QUIET, 7), outcome: 'create_failed', detail: 'weak_password' })
    rows.push({ at: minus(QUIET, 8), outcome: 'create_failed', detail: 'validation_failed' })
    rows.push({ at: minus(QUIET, 9), outcome: 'signup_limited', detail: 'day' })
    rows.push({ at: minus(QUIET, 10), outcome: 'created' })
    await insert(rows)
    const h = await health(QUIET)
    expect(h.alert).toBe(false)
    expect(h.counts.system_failures).toBe(0)
    expect(h.counts.user_errors).toBe(56)
    expect(h.counts.created).toBe(1)
    expect(h.by_outcome[0]).toEqual({ outcome: 'captcha_no_token', detail: null, n: 40 })
  })

  it.each([
    ['hook_refused_server', null],
    ['no_turnstile_secret', null],
    ['no_supabase_client', null],
    ['signin_failed', 'invalid_credentials'],
    ['create_failed', 'over_request_rate_limit'],
    ['create_failed', 'unexpected_failure'],
    ['create_failed', null],
    ['captcha_rejected', 'invalid-input-secret'],
    ['captcha_rejected', 'missing-input-secret'],
    ['captcha_rejected', 'invalid-input-response,bad-request'],
  ])('one %s (%s) is a system failure and alerts right after it starts', async (outcome, detail) => {
    await insert([{ at: minus(QUIET, 10), outcome, detail }])
    const h = await health(QUIET)
    expect(h.counts.system_failures).toBe(1)
    expect(h.alert).toBe(true)
    expect(h.reasons).toEqual(['system_failure_started'])
  })

  it('the onset alert fires on the runs within 65 min, then goes quiet', async () => {
    await insert([{ at: minus(QUIET, 10), outcome: 'hook_refused_server' }])
    expect((await health(minus(QUIET, -20))).alert).toBe(true) // 30 min after
    expect((await health(minus(QUIET, -50))).alert).toBe(true) // 60 min after
    expect((await health(minus(QUIET, -80))).alert).toBe(false) // 90 min after: a quiet hour, no reminder
  })

  it('a reminder on the 6-hourly run while the failure is within 6 h, none once it is older', async () => {
    await insert([{ at: minus(SLOT, 3 * 60), outcome: 'no_turnstile_secret' }])
    const h = await health(SLOT)
    expect(h.alert).toBe(true)
    expect(h.reasons).toEqual(['system_failure_continues'])
    await db.exec('DELETE FROM signup_outcomes')
    await insert([{ at: minus(SLOT, 7 * 60), outcome: 'no_turnstile_secret' }])
    expect((await health(SLOT)).alert).toBe(false)
  })

  it('a failure that never stops: two onset alerts, then only the 6-hourly reminders', async () => {
    const rows: Row[] = []
    for (let m = 5; m < 24 * 60; m += 30) rows.push({ at: minus(SLOT, m), outcome: 'create_failed', detail: 'unexpected_failure' })
    await insert(rows)
    expect((await health(minus(SLOT, 60))).alert).toBe(false) // 05:10, a quiet hour: earlier failures exist
    const h = await health(SLOT)
    expect(h.reasons).toEqual(['system_failure_continues'])
  })

  it('a failure older than 24 h is outside the window', async () => {
    await insert([{ at: minus(QUIET, 25 * 60), outcome: 'hook_refused_server' }])
    const h = await health(QUIET)
    expect(h.counts.attempts).toBe(0)
    expect(h.alert).toBe(false)
  })

  it('fail-open: two unchecked attempts do not alert, three with one recent do, three old ones do not', async () => {
    await insert([
      { at: minus(QUIET, 10), outcome: 'created', unchecked: true },
      { at: minus(QUIET, 200), outcome: 'created', unchecked: true },
    ])
    expect((await health(QUIET)).alert).toBe(false)
    await insert([{ at: minus(QUIET, 400), outcome: 'signup_limited', detail: 'hour', unchecked: true }])
    const h = await health(QUIET)
    expect(h.alert).toBe(true)
    expect(h.reasons).toEqual(['turnstile_unchecked_repeatedly'])
    expect(h.counts.turnstile_unchecked).toBe(3)
    expect((await health(minus(QUIET, -120))).alert).toBe(false) // two hours on, none recent
  })

  it('a checked, created sign-up counts as created, not as unchecked', async () => {
    await insert([{ at: minus(QUIET, 1), outcome: 'created' }])
    const h = await health(QUIET)
    expect(h.counts).toMatchObject({ created: 1, turnstile_unchecked: 0, system_failures: 0 })
  })
})
