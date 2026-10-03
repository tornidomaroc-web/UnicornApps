/**
 * The before-user-created hook (`hook_require_server_signup`): an email or
 * phone sign-up at Supabase's PUBLIC endpoint is refused, so the anon key
 * cannot create accounts around the app's Turnstile check; Google, Apple and
 * other OAuth sign-ups pass. Runs the body from supabase_schema.sql in PGlite.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'

jest.setTimeout(60_000)

const ROOT = join(__dirname, '..')
// Line endings depend on the checkout (core.autocrlf); compare the SQL, not them.
const unix = (s: string) => s.split('\r\n').join('\n')
const SCHEMA = unix(readFileSync(join(ROOT, 'supabase_schema.sql'), 'utf8'))
const MIGRATION = unix(readFileSync(join(ROOT, 'migrations', '2026-10-03_add_before_user_created_hook.sql'), 'utf8'))
const fn = (sql: string) => {
  const m = sql.match(/CREATE OR REPLACE FUNCTION public\.hook_require_server_signup\b[\s\S]*?\$\$;/)
  if (!m) throw new Error('hook function not found')
  return m[0]
}

let db: PGlite
beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(fn(SCHEMA))
})

const hook = async (event: unknown) =>
  (await db.query<{ r: any }>('SELECT public.hook_require_server_signup($1::jsonb) AS r', [JSON.stringify(event)])).rows[0].r
const user = (provider: string | undefined, extra: Record<string, unknown> = {}) => ({
  metadata: { name: 'before-user-created', ip_address: '203.0.113.5' },
  user: { email: 'x@example.com', app_metadata: provider ? { provider, providers: [provider] } : {}, ...extra },
})

describe('hook_require_server_signup', () => {
  it('the migration ships the same body as the schema', () => {
    expect(fn(MIGRATION)).toBe(fn(SCHEMA))
  })

  it('only supabase_auth_admin may execute it, in both files', () => {
    for (const sql of [SCHEMA, MIGRATION]) {
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.hook_require_server_signup\(jsonb\) FROM PUBLIC, anon, authenticated;/)
      expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.hook_require_server_signup\(jsonb\) TO supabase_auth_admin;/)
    }
  })

  it('an email sign-up at the public endpoint is refused with a 403', async () => {
    const r = await hook(user('email'))
    expect(r.error.http_code).toBe(403)
    expect(typeof r.error.message).toBe('string')
  })

  it('phone, anonymous and provider-less sign-ups are refused too', async () => {
    expect((await hook(user('phone'))).error.http_code).toBe(403)
    expect((await hook(user('google', { is_anonymous: true }))).error.http_code).toBe(403)
    expect((await hook(user(undefined))).error.http_code).toBe(403)
  })

  it.each(['google', 'apple', 'github', 'azure'])('a %s sign-up passes untouched', async (p) => {
    expect(await hook(user(p))).toEqual({})
  })
})
