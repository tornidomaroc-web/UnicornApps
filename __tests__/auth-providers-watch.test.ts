import { readFileSync } from 'fs'
import { join } from 'path'
import { AUTH_PROVIDERS, SOCIAL_PROVIDERS, visibleProviders } from '@/lib/auth-providers'

/**
 * Two facts about which sign-in providers exist, pinned at the source:
 *   - the code's flags: Google on, Apple off, and never inside the native app;
 *   - the scheduled health check compares Supabase's LIVE provider switches
 *     with an explicit allowlist, so a provider switched on in the dashboard
 *     is a visible one-word change in the workflow, never a silent one.
 */
const workflow = readFileSync(join(process.cwd(), '.github/workflows/signup-health.yml'), 'utf8')

describe('the provider flags', () => {
  it('Google is on, Apple is off', () => {
    expect(AUTH_PROVIDERS).toEqual({ google: true, apple: false })
    expect(SOCIAL_PROVIDERS).toEqual(['google', 'apple'])
  })

  it('the Google button exists on the web only, and only once native detection has resolved', () => {
    expect(visibleProviders(AUTH_PROVIDERS, { isNative: false, resolved: true })).toEqual(['google'])
    expect(visibleProviders(AUTH_PROVIDERS, { isNative: true, resolved: true })).toEqual([])
    expect(visibleProviders(AUTH_PROVIDERS, { isNative: false, resolved: false })).toEqual([])
  })
})

describe('the scheduled check watches the live provider switches', () => {
  it('carries an explicit allowlist, and reads the public settings endpoint with the anon key only', () => {
    expect(workflow).toMatch(/^\s*ALLOWED_AUTH_PROVIDERS:\s*email\s*$/m)
    expect(workflow).toMatch(/\/auth\/v1\/settings/)
    expect(workflow).toMatch(/\.external \| to_entries\[\] \| select\(\.value == true\)/)
    expect(workflow).not.toMatch(/SERVICE_ROLE/)
  })

  it('a difference fails the run, in both directions', () => {
    expect(workflow).toMatch(/if \[ "\$enabled" != "\$allowed" \]; then/)
    expect(workflow).toMatch(/exit 1/)
  })
})
