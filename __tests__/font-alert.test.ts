/**
 * scripts/font-alert.cjs, the issue the post-deploy font check opens when it
 * fails. The report is the shape font-class-check.cjs writes, with the classes
 * recorded from the stale-cache production build of 2026-10-19.
 */
import * as alert from '../scripts/font-alert.cjs'

const RUN = 'https://github.com/o/r/actions/runs/1'
const REPORT = {
  base: 'https://www.unicornapps.app',
  attempts: 10,
  results: [
    { lang: 'en', ok: false, buildId: 'uzEAtmENzVOCWf_dBrw41', missing: ['__className_f367f3', '__variable_7de87c'], problems: ['not defined in the linked CSS: __className_f367f3, __variable_7de87c'] },
    { lang: 'ar', ok: true, buildId: 'uzEAtmENzVOCWf_dBrw41', missing: [], problems: [] },
  ],
}

describe('what the alert says', () => {
  const text = alert.alertText(REPORT, RUN, 'owner')

  it('names the failing language, its missing classes, the build id and the run', () => {
    expect(text).toContain('| en | FAIL | `uzEAtmENzVOCWf_dBrw41` | `__className_f367f3` `__variable_7de87c` |')
    expect(text).toContain('| ar | ok |')
    expect(text).toContain(`Run: ${RUN}`)
  })

  it('mentions the owner and carries the marker it is found by', () => {
    expect(text.startsWith(`${alert.MARKER}\n@owner\n`)).toBe(true)
  })

  it('still alerts when the check produced no report', () => {
    expect(alert.parseReport('')).toBeNull()
    expect(alert.parseReport('{"x":1}')).toBeNull()
    expect(alert.alertText(null, RUN, 'owner')).toContain('failed before it produced a report')
  })

  it('keeps page text from breaking out of its table cell', () => {
    const t = alert.alertText({ ...REPORT, results: [{ lang: 'en', ok: false, buildId: null, missing: [], problems: ['a`b\n| c'] }] }, RUN, '')
    expect(t).toContain('| en | FAIL | unknown | - | a b \\| c |')
    expect(t).not.toContain('@')
  })
})

describe('where the alert goes', () => {
  const body = alert.alertText(REPORT, RUN, 'owner')

  it('opens a labelled issue when none is open', () => {
    expect(alert.alertPlan([{ number: 3, body: 'something else' }], body)).toEqual({
      action: 'create',
      path: 'issues',
      payload: { title: alert.TITLE, body, labels: [alert.LABEL] },
    })
  })

  it('comments on the open alert issue instead of opening a second one', () => {
    const open = [{ number: 3, body: 'x' }, { number: 7, body: `${alert.MARKER}\nold` }]
    expect(alert.alertPlan(open, body)).toMatchObject({ action: 'comment', issue: 7, path: 'issues/7/comments', payload: { body } })
  })

  it('ignores a pull request that quotes the marker', () => {
    expect(alert.alertPlan([{ number: 9, body: alert.MARKER, pull_request: {} }], body).action).toBe('create')
  })
})
