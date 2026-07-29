// Defect B - the dashboard's error state was written and never rendered.
//
// WHAT THESE TESTS PROVE
// The three decisions that rendering it required, as pure functions: the banner's
// appearance, when the message is cleared, and whether a message is fit to be
// shown at all. Plus the end-to-end message chain for the generate path, which is
// the specific consequence in the report: a 429/503 set `error` and the user saw
// nothing.
//
// WHAT THEY DO NOT PROVE
// They do NOT render DashboardClient. The suite is `testEnvironment: 'node'` with
// no jsdom and no @testing-library, and adding one was out of scope. The
// component's own wiring is covered structurally instead, by reading its source
// (last describe) - the same approach __tests__/rtl-letter-spacing.test.ts takes
// for a rule it cannot compute a style for. A structural assertion proves the
// call exists, not that React painted it. Visual confirmation is still owed.

import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveApiError } from '../src/lib/api-error'
import {
  bannerToneClass,
  checkoutBannerTone,
  isCameraCancellation,
  isUserFacingError,
  nextDashboardError,
  toUserMessage,
  BANNER_CONTAINER_CLASS,
  CLEARING_EVENT_KINDS,
  ERROR_BANNER_TONE,
  RAISING_EVENT_KINDS,
  UserFacingError,
  type DashboardErrorEvent,
} from '../src/lib/dashboard-banner'
import type { CheckoutStatus } from '../src/lib/checkout'

// Stand-in translator: returns the key, so a test asserts WHICH key was chosen
// without coupling to copy. Mirrors LanguageContext's fallback-to-key behaviour.
const t = (key: string) => key

describe('appearance - the error banner reuses the checkout banner vocabulary', () => {
  it('an error banner is byte-identical to a failed-checkout banner', () => {
    // This is the "match the existing pattern" requirement, made mechanical.
    // If someone restyles one, this fails rather than letting them drift.
    expect(bannerToneClass(ERROR_BANNER_TONE)).toBe(
      bannerToneClass(checkoutBannerTone('failed'))
    )
    expect(bannerToneClass(ERROR_BANNER_TONE)).toBe(
      bannerToneClass(checkoutBannerTone('error'))
    )
  })

  it('every banner shares one container class', () => {
    for (const tone of ['success', 'pending', 'failure'] as const) {
      expect(bannerToneClass(tone).startsWith(BANNER_CONTAINER_CLASS + ' ')).toBe(true)
    }
  })

  it('the three tones are visually distinct', () => {
    const tones = ['success', 'pending', 'failure'] as const
    const classes = tones.map(bannerToneClass)
    expect(new Set(classes).size).toBe(tones.length)
  })

  it('the error tone is the failure tone, not the pending one', () => {
    // An error is not a waiting state. Amber would read as "still working".
    expect(ERROR_BANNER_TONE).toBe('failure')
    expect(bannerToneClass(ERROR_BANNER_TONE)).not.toBe(bannerToneClass('pending'))
  })

  it('maps every CheckoutStatus to a tone, with success_pending kept distinct', () => {
    const all: CheckoutStatus[] = ['success', 'success_pending', 'failed', 'error']
    expect(all.map(checkoutBannerTone)).toEqual(['success', 'pending', 'failure', 'failure'])
  })
})

describe('lifetime - the banner cannot outlive the interaction that raised it', () => {
  const raising: DashboardErrorEvent[] = [
    { kind: 'input-rejected', message: 'dash.filesizeError' },
    { kind: 'capture-failed', message: 'dash.cameraError' },
    { kind: 'attempt-failed', message: 'dash.aiBusy' },
  ]
  const clearing: DashboardErrorEvent[] = [{ kind: 'attempt-started' }, { kind: 'input-changed' }]

  it('every raising event surfaces its message verbatim', () => {
    for (const event of raising) {
      expect(nextDashboardError(event)).toBe((event as { message: string }).message)
    }
  })

  it('every clearing event returns null', () => {
    for (const event of clearing) {
      expect(nextDashboardError(event)).toBeNull()
    }
  })

  it('the declared kind lists cover the whole event union with no overlap', () => {
    // The guard against someone adding a sixth event kind and quietly leaving
    // the banner to persist through it.
    const declared = [...CLEARING_EVENT_KINDS, ...RAISING_EVENT_KINDS]
    expect(new Set(declared).size).toBe(declared.length)
    expect(new Set([...raising, ...clearing].map((e) => e.kind))).toEqual(new Set(declared))
  })

  it('the next state does not depend on the previous one', () => {
    // The load-bearing property. nextDashboardError takes no prior value, so
    // there is no code path on which a stale message survives an event. The
    // only way to keep a banner on screen is to emit no event at all.
    expect(nextDashboardError.length).toBe(1)
    expect(nextDashboardError({ kind: 'input-changed' })).toBeNull()
  })

  it('a rejected upload does not clear itself', () => {
    // handleFileChange returns early on an oversize file: it must NOT then fall
    // through to the input-changed clear meant for an accepted one.
    expect(
      nextDashboardError({ kind: 'input-rejected', message: 'dash.filesizeError' })
    ).toBe('dash.filesizeError')
  })
})

describe('fitness - only copy we translated reaches the user', () => {
  it('accepts a message we produced', () => {
    const err = new UserFacingError('dash.aiBusy')
    expect(isUserFacingError(err)).toBe(true)
    expect(toUserMessage(err, t)).toBe('dash.aiBusy')
  })

  it('a dropped connection becomes translated copy, not "Failed to fetch"', () => {
    // fetch() rejects with the browser's own TypeError. Rendering `err.message`
    // would put raw English into the Arabic UI - the exact class of bug
    // lib/api-error.ts exists to prevent, previously masked by the fact that
    // nothing rendered the state at all.
    const networkFailure = new TypeError('Failed to fetch')
    expect(isUserFacingError(networkFailure)).toBe(false)
    expect(toUserMessage(networkFailure, t)).toBe('dash.requestFailed')
    expect(toUserMessage(networkFailure, t)).not.toMatch(/failed to fetch/i)
  })

  it('rejects a plain Error, a string, null and undefined', () => {
    for (const thrown of [new Error('boom'), 'boom', null, undefined, 42]) {
      expect(isUserFacingError(thrown)).toBe(false)
      expect(toUserMessage(thrown, t)).toBe('dash.requestFailed')
    }
  })

  it('is not fooled by an object that merely has a message', () => {
    expect(toUserMessage({ message: 'Internal token leaked' }, t)).toBe('dash.requestFailed')
  })
})

describe('dash.aiBusy now reaches the user on the GENERATE path', () => {
  // The report's headline consequence. This walks the whole chain the component
  // walks, minus the JSX: response -> resolveApiError -> throw -> catch ->
  // toUserMessage -> nextDashboardError -> the string the banner renders.
  const walkGeneratePath = async (response: Response): Promise<string | null> => {
    try {
      if (!response.ok) throw new UserFacingError(await resolveApiError(response, t))
      return null
    } catch (err) {
      return nextDashboardError({ kind: 'attempt-failed', message: toUserMessage(err, t) })
    }
  }

  it('429 puts dash.aiBusy in the banner', async () => {
    await expect(walkGeneratePath(new Response('Too Many Requests', { status: 429 }))).resolves.toBe(
      'dash.aiBusy'
    )
  })

  it('503 puts dash.aiBusy in the banner', async () => {
    const res = new Response(JSON.stringify({ error: 'AI service is busy' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
    await expect(walkGeneratePath(res)).resolves.toBe('dash.aiBusy')
  })

  it('the aiBusy message is NOT wrapped in the dash.error template here', () => {
    // On the refine path it arrives as "Error: {aiBusy}. Please try a different
    // instruction." - advice that is wrong for a busy model. The generate path
    // shows the message as written.
    expect(nextDashboardError({ kind: 'attempt-failed', message: 'dash.aiBusy' })).toBe(
      'dash.aiBusy'
    )
  })

  it('413 puts the translated filesize message in the banner', async () => {
    const body = 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE'
    const res = new Response(body, { status: 413, headers: { 'content-type': 'text/plain' } })
    await expect(walkGeneratePath(res)).resolves.toBe('dash.filesizeError')
  })

  it('an ok response leaves the banner empty', async () => {
    await expect(walkGeneratePath(new Response('{}', { status: 200 }))).resolves.toBeNull()
  })
})

describe('camera cancellation is silent, unknown camera failures are not', () => {
  it('a Capacitor cancel is not reported as a permission denial', () => {
    // @capacitor/camera THROWS when the user backs out of the picker, through
    // the same channel as a real denial. Once the banner renders, that would
    // tell every native user who changed their mind that their camera
    // permission was denied.
    expect(isCameraCancellation({ message: 'User cancelled photos app' })).toBe(true)
    expect(isCameraCancellation(new Error('User cancelled photos app'))).toBe(true)
  })

  it('a real permission denial is still shown', () => {
    expect(isCameraCancellation(new Error('User denied access to camera'))).toBe(false)
    expect(isCameraCancellation({ message: 'Camera not available' })).toBe(false)
  })

  it('fails toward showing the error, never toward swallowing it', () => {
    // The heuristic is a message match. Anything it cannot read stays visible.
    for (const thrown of [null, undefined, 'cancel', {}, new Error('')]) {
      expect(isCameraCancellation(thrown)).toBe(false)
    }
  })
})

describe('structural - DashboardClient actually renders and routes the state', () => {
  const SOURCE = join(process.cwd(), 'src/app/dashboard/DashboardClient.tsx')
  // Comments are stripped FIRST: this change is heavily commented and those
  // comments name the very identifiers asserted on below.
  const src = readFileSync(SOURCE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  const count = (needle: string) => src.split(needle).length - 1

  it('renders the error state (the whole defect)', () => {
    expect(src).toMatch(/\{error && \(/)
    expect(src).toMatch(/\{error\}\s*<\/div>/)
  })

  it('the error banner uses the shared tone helper, not a bespoke class string', () => {
    expect(src).toMatch(/bannerToneClass\(ERROR_BANNER_TONE\)/)
    // The checkout banner must go through the same helper, or "shared" is a lie.
    expect(count('bannerToneClass(')).toBeGreaterThanOrEqual(2)
    expect(src).not.toContain("'border-red-500/30 bg-red-500/10 text-red-200'")
  })

  it('every write to the error state goes through the reducer', () => {
    // If these ever diverge, some call site is setting the banner without a
    // declared event, and the clearing rules above no longer describe reality.
    expect(count('setError(')).toBe(count('setError(nextDashboardError('))
    expect(count('setError(null)')).toBe(0)
  })

  it('no raw thrown message is rendered', () => {
    expect(src).not.toMatch(/err\.message/)
    expect(src).not.toMatch(/catch \(err: any\)/)
  })

  it('both request paths raise a UserFacingError, never a bare Error', () => {
    expect(count('throw new UserFacingError(')).toBe(2)
    expect(count('throw new Error(')).toBe(0)
  })

  it('the banner is announced to assistive tech', () => {
    expect(src).toMatch(/role="alert"/)
  })

  it('the refine path keeps its chat surface and does not also raise the banner', () => {
    // Deliberate: one failure, one report. See the comment at that catch block.
    expect(src).toMatch(/t\('dash\.error'\)\.replace\('\{error\}', toUserMessage\(err, t\)\)/)
  })
})

describe('no new user-facing copy was introduced', () => {
  it('the banner renders an already-translated string and composes none', () => {
    // Every message the banner can hold comes from t() at its write site or from
    // resolveApiError. Nothing here needs an EN/AR pair, so nothing here can be
    // an unreviewed Arabic string.
    const moduleSrc = readFileSync(join(process.cwd(), 'src/lib/dashboard-banner.ts'), 'utf8')
    const code = moduleSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // The only bare key in the module is the fallback, which already exists in
    // both dictionaries.
    const keys = code.match(/'(dash|pricing|checkout)\.[^']+'/g) || []
    expect(keys).toEqual(["'dash.requestFailed'"])
  })

  it('the new module carries no dash, bidi, zero-width or Arabic presentation form', () => {
    // Programmatic check for the copy rules, over string literals only: the
    // repo's prose comments use em dashes throughout and are not rendered.
    //
    // Scoped to the new module. DashboardClient.tsx cannot be scanned this way
    // yet: it carries a PRE-EXISTING em dash in `t('dash.generate').split(' - ')`
    // (a real em dash in the source), left over from copy that no longer
    // contains one, so the split is a no-op on both the EN and AR value today.
    // Reported, not silently fixed here.
    const FORBIDDEN = new RegExp(
      [
        '[\\u2010-\\u2015]', // hyphen, non-breaking hyphen, figure/en/em dash, horizontal bar
        '[\\u2212]', // minus sign
        '[\\u200B-\\u200F]', // zero-width space/non-joiner/joiner, LRM, RLM
        '[\\u202A-\\u202E]', // bidi embedding and override
        '[\\u2066-\\u2069]', // bidi isolates
        '[\\uFEFF]', // zero-width no-break space / BOM
        '[\\uFB50-\\uFDFF]', // Arabic presentation forms A
        '[\\uFE70-\\uFEFE]', // Arabic presentation forms B
      ].join('|')
    )
    const code = readFileSync(join(process.cwd(), 'src/lib/dashboard-banner.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const literals = code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || []
    expect(literals.length).toBeGreaterThan(0)
    for (const literal of literals) {
      expect({ literal, forbidden: FORBIDDEN.test(literal) }).toEqual({ literal, forbidden: false })
    }
  })
})
