import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { historyDate } from '../src/lib/dashboard-history'

/**
 * Hydration guard for dates.
 *
 * The history row used toLocaleDateString() with no arguments, so the server
 * (en-US, its own timezone) and the browser (the reader's locale and timezone)
 * produced different text, and React threw the server render away for any
 * reader not on en-US in the server's timezone. The fix renders a fixed form
 * on both sides first and the reader's form only after hydration.
 *
 * No jsdom here, so this cannot hydrate a page; the production-build browser
 * run proved that. These tests pin the two properties that made it work.
 */

// 22:52 UTC on the 26th is already the 27th in Riyadh (UTC+3) and Kiritimati
// (UTC+14): the date boundary that also broke hydration with matching formats.
const BOUNDARY = '2026-09-26T22:52:42.000Z'

describe("historyDate 'server' is the same wherever it runs", () => {
  const original = process.env.TZ
  afterAll(() => {
    process.env.TZ = original
  })

  it.each(['UTC', 'Africa/Casablanca', 'Asia/Riyadh', 'Pacific/Kiritimati', 'America/Los_Angeles'])(
    'process timezone %s',
    (tz) => {
      process.env.TZ = tz
      expect(historyDate(BOUNDARY, 'server')).toBe('9/26/2026')
    }
  )

  it('names its locale and timezone instead of reading the defaults', () => {
    expect(historyDate(BOUNDARY, 'server')).toBe(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' }).format(new Date(BOUNDARY)))
  })

  it("'local' follows the runtime, which is the point of the second pass", () => {
    process.env.TZ = 'Asia/Riyadh'
    expect(historyDate(BOUNDARY, 'local')).toBe(new Date(BOUNDARY).toLocaleDateString())
  })
})

describe('the history panel hydrates with the server form', () => {
  const panel = readFileSync(join(process.cwd(), 'src/app/dashboard/HistoryPanel.tsx'), 'utf8')

  it('starts in the server pass and switches only after mount', () => {
    expect(panel).toMatch(/useState<'server' \| 'local'>\('server'\)/)
    expect(panel).toMatch(/useEffect\(\(\) => setDatePass\('local'\), \[\]\)/)
    expect(panel).toMatch(/historyDate\(row\.created_at, datePass\)/)
  })
})

describe('no component formats a date with environment defaults during render', () => {
  // Calls that can never run on the server, each verified by reading the code:
  // the CSV export runs in a click handler, and chat timestamps exist only for
  // messages created in the browser after the results view opens.
  const CLIENT_ONLY: Array<[string, RegExp]> = [
    ['src/app/dashboard/DashboardClient.tsx', /new Date\(item\.created_at\)\.toLocaleString\(\)/],
    ['src/app/dashboard/DashboardClient.tsx', /msg\.timestamp\.toLocaleTimeString\(\[\]/],
  ]
  const hits: Array<{ file: string; line: string }> = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx$/.test(entry)) {
        const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        for (const line of code.split(/\r?\n/)) if (/\.toLocale(Date|Time)?String\(/.test(line)) hits.push({ file: p.replace(process.cwd(), '').replace(/\\/g, '/').slice(1), line: line.trim() })
      }
    }
  }
  walk(join(process.cwd(), 'src'))

  it('finds the known client-only calls (the scan is not scanning nothing)', () => {
    expect(hits.length).toBeGreaterThanOrEqual(CLIENT_ONLY.length)
  })

  it.each(hits.map((h) => [h.file, h.line]))('%s: %s', (file, line) => {
    const allowed = CLIENT_ONLY.some(([f, re]) => f === file && re.test(line))
    // Anything else must name a locale AND a timeZone, or go through historyDate.
    const explicit = /toLocale(Date|Time)?String\(\s*['"][^'"]+['"]\s*,\s*\{[^}]*timeZone/.test(line)
    expect({ file, line, ok: allowed || explicit }).toEqual({ file, line, ok: true })
  })
})
