/**
 * The before-user-created hook's refusal is recognised by its sentence
 * (lib/signup-hook.ts). The sentence must stay identical in the SQL that
 * answers with it, or the recognition silently stops.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isServerSignupHookRefusal, SERVER_SIGNUP_HOOK_MESSAGE } from '../src/lib/signup-hook'

const ROOT = join(__dirname, '..')

describe('SERVER_SIGNUP_HOOK_MESSAGE', () => {
  it.each(['supabase_schema.sql', join('migrations', '2026-10-03_add_before_user_created_hook.sql')])(
    'is the sentence %s answers with',
    (file) => {
      const sql = readFileSync(join(ROOT, file), 'utf8')
      const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.hook_require_server_signup\b[\s\S]*?\$\$;/)
      expect(fn).not.toBeNull()
      expect(fn![0]).toContain(`'message', '${SERVER_SIGNUP_HOOK_MESSAGE}'`)
    }
  )
})

describe('isServerSignupHookRefusal', () => {
  it('matches the hook sentence as Supabase relays it (403, code unknown)', () => {
    expect(isServerSignupHookRefusal({ message: SERVER_SIGNUP_HOOK_MESSAGE })).toBe(true)
    expect(isServerSignupHookRefusal({ message: ` ${SERVER_SIGNUP_HOOK_MESSAGE}\n` })).toBe(true)
  })

  it('matches nothing else', () => {
    expect(isServerSignupHookRefusal({ message: 'A user with this email address has already been registered' })).toBe(false)
    expect(isServerSignupHookRefusal({ message: '' })).toBe(false)
    expect(isServerSignupHookRefusal({})).toBe(false)
    expect(isServerSignupHookRefusal(null)).toBe(false)
    expect(isServerSignupHookRefusal(undefined)).toBe(false)
  })
})
