// The limiter's FALLBACK defaults — what a MISCONFIGURATION degrades to.
//
// The old defaults (8 RPM / 1200 RPD) were the pre-quota guesses, ~60x over the
// real 20 RPD ceiling. Because envInt() falls back SILENTLY, a single missing or
// typo'd Vercel var restored the full pre-limiter blowout with no error and no
// log line. The env vars were the only thing standing between us and the ceiling.
//
// These tests pin the safety property: a MISSING or INVALID var must yield a
// safe-under-ceiling default, never a permissive one.
//
// Ceiling: 5 RPM / 20 RPD for the whole app (shared free-tier key). One request
// costs at most MAX_MODEL_ATTEMPTS (=2) generateContent calls, so the invariant
// the defaults must satisfy is `limit * 2 <= ceiling`.
//
// They are asserted through the PUBLIC checkRateLimit() rather than by exporting
// envInt, so the test also catches a default wired to the WRONG RPC parameter
// (e.g. rpm/rpd transposed) — which a direct envInt test would miss entirely.

const rpc = jest.fn()

jest.mock('../src/lib/credits', () => ({
  createServiceClient: () => ({ rpc }),
}))

const ENV_VARS = [
  'RATE_LIMIT_USER_RPM',
  'RATE_LIMIT_USER_RPD',
  'RATE_LIMIT_GLOBAL_RPM',
  'RATE_LIMIT_GLOBAL_RPD',
] as const

// The real ceiling, and the amplification the limits must be sized against.
const CEILING_RPM = 5
const CEILING_RPD = 20
const MAX_CALLS_PER_REQUEST = 2

/** Fresh module (module-scope warn-dedup state is per-process) + clean env. */
async function loadFresh() {
  jest.resetModules()
  rpc.mockReset()
  rpc.mockResolvedValue({ data: 'allowed', error: null })
  for (const v of ENV_VARS) delete process.env[v]
  return (await import('../src/lib/rate-limit')).checkRateLimit
}

const paramsOfLastCall = () => rpc.mock.calls.at(-1)![1]

describe('rate-limit fallback defaults', () => {
  const originalEnv = { ...process.env }
  let warn: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    process.env = { ...originalEnv }
  })

  it('uses SAFE defaults when every env var is missing', async () => {
    const checkRateLimit = await loadFresh()
    await checkRateLimit('user-1')

    expect(paramsOfLastCall()).toMatchObject({
      p_user_rpm: 1,
      p_user_rpd: 5,
      p_global_rpm: 1,
      p_global_rpd: 6,
    })
  })

  it('NEVER falls back to the old pre-limiter blowout values', async () => {
    const checkRateLimit = await loadFresh()
    await checkRateLimit('user-1')

    const p = paramsOfLastCall()
    // The exact values that made this a bug. If any reappears, this fails.
    expect(p.p_global_rpm).not.toBe(8)
    expect(p.p_global_rpd).not.toBe(1200)
    expect(p.p_user_rpm).not.toBe(4)
    expect(p.p_user_rpd).not.toBe(100)
  })

  it('the defaults sit under the real ceiling WITH amplification accounted for', async () => {
    const checkRateLimit = await loadFresh()
    await checkRateLimit('user-1')

    const p = paramsOfLastCall()
    // This is the property that actually matters — not the literal numbers.
    expect(p.p_global_rpm * MAX_CALLS_PER_REQUEST).toBeLessThanOrEqual(CEILING_RPM)
    expect(p.p_global_rpd * MAX_CALLS_PER_REQUEST).toBeLessThanOrEqual(CEILING_RPD)
    // A per-user limit above the global one is meaningless.
    expect(p.p_user_rpm).toBeLessThanOrEqual(p.p_global_rpm)
    expect(p.p_user_rpd).toBeLessThanOrEqual(p.p_global_rpd)
  })

  it('a non-numeric or non-positive value falls back to the safe default, not the raw value', async () => {
    const checkRateLimit = await loadFresh()
    process.env.RATE_LIMIT_GLOBAL_RPM = 'eight' // typo'd
    process.env.RATE_LIMIT_GLOBAL_RPD = '0' // disabled-by-accident
    await checkRateLimit('user-1')

    expect(paramsOfLastCall()).toMatchObject({ p_global_rpm: 1, p_global_rpd: 6 })
  })

  it('a valid env var still overrides the default (tuning without a rebuild)', async () => {
    const checkRateLimit = await loadFresh()
    process.env.RATE_LIMIT_GLOBAL_RPM = '2'
    process.env.RATE_LIMIT_GLOBAL_RPD = '9'
    await checkRateLimit('user-1')

    expect(paramsOfLastCall()).toMatchObject({ p_global_rpm: 2, p_global_rpd: 9 })
  })

  it('WARNS when a var is missing — the only signal, since defaults now equal the live config', async () => {
    const checkRateLimit = await loadFresh()
    await checkRateLimit('user-1')

    // Defaults mirror the live Vercel values, so a missing var changes NO
    // behaviour. Without this log a misconfiguration is completely invisible.
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n')
    for (const v of ENV_VARS) expect(logged).toContain(v)
    expect(logged).toMatch(/not set/)
  })

  it('warns once per variable, not once per request (warm lambdas are reused)', async () => {
    const checkRateLimit = await loadFresh()
    await checkRateLimit('user-1')
    const afterFirst = warn.mock.calls.length

    await checkRateLimit('user-2')
    await checkRateLimit('user-3')

    expect(afterFirst).toBe(ENV_VARS.length)
    expect(warn.mock.calls.length).toBe(afterFirst)
  })

  it('does not warn when the var is set and valid', async () => {
    const checkRateLimit = await loadFresh()
    for (const v of ENV_VARS) process.env[v] = '1'
    await checkRateLimit('user-1')

    expect(warn).not.toHaveBeenCalled()
  })
})
