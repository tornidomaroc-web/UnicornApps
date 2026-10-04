/**
 * The sign-up outcome ledger (lib/signup-ledger.ts): records a code, never a
 * person, and never blocks a sign-up.
 */
const mockInsert = jest.fn()
const mockAbortSignal = jest.fn()
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => {
        mockInsert(table, row)
        return { abortSignal: (s: AbortSignal) => mockAbortSignal(s) }
      },
    }),
  }),
}))

import { detailCode, joinCodes, recordSignupOutcome, SIGNUP_OUTCOMES } from '../src/lib/signup-ledger'
import { readFileSync } from 'fs'
import { join } from 'path'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
  mockInsert.mockReset()
  mockAbortSignal.mockReset().mockResolvedValue({ error: null })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('detailCode keeps machine codes and drops everything else', () => {
  it.each([
    ['email_exists', 'email_exists'],
    [' Email_Exists ', 'email_exists'],
    ['invalid-input-response,timeout-or-duplicate', 'invalid-input-response,timeout-or-duplicate'],
    ['hour', 'hour'],
    ['x@example.com', null],
    ['A user with this email address has already been registered', null],
    ['', null],
    [undefined, null],
    [42, null],
    ['a'.repeat(121), null],
  ])('%p -> %p', (raw, expected) => {
    expect(detailCode(raw)).toBe(expected)
  })

  it('joinCodes keeps the good codes and drops a bad one', () => {
    expect(joinCodes(['invalid-input-response', 'timeout-or-duplicate'])).toBe('invalid-input-response,timeout-or-duplicate')
    expect(joinCodes(['invalid-input-response', 'x@y.z', 7])).toBe('invalid-input-response')
    expect(joinCodes([])).toBeNull()
    expect(joinCodes(['has space'])).toBeNull()
  })
})

describe('recordSignupOutcome', () => {
  it('writes the row with the code filtered and the flags as given', async () => {
    expect(
      await recordSignupOutcome({ outcome: 'create_failed', detail: 'Email_Exists', turnstileChecked: true, limitChecked: false })
    ).toBe(true)
    expect(mockInsert).toHaveBeenCalledWith('signup_outcomes', {
      outcome: 'create_failed',
      detail: 'email_exists',
      turnstile_checked: true,
      limit_checked: false,
    })
    expect(mockAbortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
  })

  it('a flag that was never reached is null, and a message never reaches the wire', async () => {
    await recordSignupOutcome({ outcome: 'captcha_no_token', detail: 'the user typed nothing' })
    expect(mockInsert).toHaveBeenCalledWith('signup_outcomes', {
      outcome: 'captcha_no_token',
      detail: null,
      turnstile_checked: null,
      limit_checked: null,
    })
  })

  it('fails open: a database error, a throw, missing credentials', async () => {
    mockAbortSignal.mockResolvedValueOnce({ error: { message: 'relation does not exist' } })
    expect(await recordSignupOutcome({ outcome: 'created' })).toBe(false)
    mockAbortSignal.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await recordSignupOutcome({ outcome: 'created' })).toBe(false)
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(await recordSignupOutcome({ outcome: 'created' })).toBe(false)
    expect(mockInsert).toHaveBeenCalledTimes(2)
  })

  it('a hanging database is abandoned after the timeout', async () => {
    mockAbortSignal.mockImplementationOnce(
      (s: AbortSignal) => new Promise((_r, reject) => s.addEventListener('abort', () => reject(new Error('aborted'))))
    )
    expect(await recordSignupOutcome({ outcome: 'created' }, 20)).toBe(false)
    expect((console.error as jest.Mock).mock.calls.some(c => c.join(' ').includes('timeout'))).toBe(true)
  })
})

describe('the outcome list is the same in TypeScript and in the schema', () => {
  it('every code the writer can send is one the table accepts, and the other way round', () => {
    // Comments stripped first: the column's own notes quote 'hour' | 'day'.
    const schema = readFileSync(join(__dirname, '..', 'supabase_schema.sql'), 'utf8').replace(/--[^\n]*/g, '')
    // Anchored to this table: usage_events has an `outcome` column with its own list.
    const table = schema.match(/CREATE TABLE public\.signup_outcomes \([\s\S]*?\n\);/)
    expect(table).not.toBeNull()
    const block = table![0].match(/outcome\s+TEXT\s+NOT NULL CHECK \(outcome IN \(([\s\S]*?)\)\)/)
    expect(block).not.toBeNull()
    const inSql = Array.from(block![1].matchAll(/'([a-z_]+)'/g)).map(m => m[1]).sort()
    expect(inSql).toEqual([...SIGNUP_OUTCOMES].sort())
  })
})
