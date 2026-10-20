// Checks that every next/font class the live site puts on a tag (<body>, and
// the wrapper that carries the heading font) is defined in the CSS that same
// page links, and exits 1 when one is not.
//
//   node scripts/font-class-check.cjs [base URL]   (default https://www.unicornapps.app)
//
// next/font names its classes after a hash (__className_d8ebd1,
// __variable_297f6e). The server HTML and the CSS file must come from the same
// build to agree. On 2026-10-19 a production build restored from Vercel's
// build cache served HTML with __className_f367f3 / __variable_7de87c while its
// CSS defined only the new hashes, so body and Arabic text fell back to the
// system font for every visitor until a redeploy without the cache. Tests and
// a local build cannot see this: only the deployed site can.
//
// Run by .github/workflows/post-deploy-fonts.yml after each successful
// production deployment. Retries for a bounded window (CHECK_ATTEMPTS x
// CHECK_DELAY_MS, default 10 x 30 s) because the domain may still be switching
// builds, and a page and its CSS fetched across that switch can disagree for a
// moment. Fails only if every attempt fails.

const FONT_CLASS = /^__(className|variable)_[0-9a-f]{6,}$/

/**
 * Font classes in the class attribute of any tag in the server HTML: <body>
 * carries the text face (Inter) and the Arabic variable, a wrapper <div>
 * carries the heading (Rubik) variables. Only real tag attributes count, not
 * the escaped copies in the page's script payload.
 */
function fontClassesOnPage(html) {
  const found = new Set()
  for (const tag of html.match(/<[a-z][a-z0-9-]*\b[^>]*>/gi) ?? []) {
    const cls = tag.match(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/i)
    if (!cls) continue
    for (const name of (cls[2] ?? cls[3]).split(/\s+/)) if (FONT_CLASS.test(name)) found.add(name)
  }
  return [...found].sort()
}

/** Same-origin stylesheet paths the page links. */
function stylesheetPaths(html) {
  const paths = new Set()
  for (const link of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\brel\s*=\s*["']?stylesheet\b/i.test(link)) continue
    const href = link.match(/\bhref\s*=\s*["']([^"']+)["']/i)
    if (href) paths.add(href[1])
  }
  return [...paths]
}

/** Font classes a stylesheet defines a rule for. */
function fontClassesInCss(css) {
  const found = new Set()
  for (const m of css.matchAll(/\.(__(?:className|variable)_[0-9a-f]{6,})(?![\w-])/g)) found.add(m[1])
  return found
}

/** Next.js build id embedded in the page, to report which build was checked. */
function buildIdOf(html) {
  const m = html.match(/buildId\\?"\s*:\s*\\?"([\w-]+)/)
  return m ? m[1] : null
}

/**
 * The verdict for one page. Fails when a class is undefined, and also when the
 * page shows no font class or links no CSS: then the check can no longer see
 * what it guards, and a silent pass would be worse than a false alarm.
 */
function verdict(html, cssTexts) {
  const used = fontClassesOnPage(html)
  const defined = new Set()
  for (const css of cssTexts) for (const c of fontClassesInCss(css)) defined.add(c)
  const missing = used.filter((c) => !defined.has(c))
  const problems = []
  if (used.length === 0) problems.push('no next/font class on any tag')
  if (cssTexts.length === 0) problems.push('the page links no stylesheet')
  if (missing.length) problems.push(`not defined in the linked CSS: ${missing.join(', ')}`)
  return { ok: problems.length === 0, used, missing, problems }
}

async function get(url, cookie) {
  const res = await fetch(url, { headers: cookie ? { cookie } : {}, redirect: 'follow', signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.text()
}

async function checkOnce(base, lang) {
  const html = await get(base + '/', `ua_lang=${lang}`)
  const sheets = stylesheetPaths(html).map((p) => new URL(p, base + '/'))
  const cssTexts = await Promise.all(sheets.filter((u) => u.origin === new URL(base).origin).map((u) => get(u.href)))
  return { lang, buildId: buildIdOf(html), css: sheets.map((u) => u.pathname), ...verdict(html, cssTexts) }
}

async function main() {
  const base = (process.argv[2] || 'https://www.unicornapps.app').replace(/\/$/, '')
  const attempts = Number(process.env.CHECK_ATTEMPTS || 10)
  const delayMs = Number(process.env.CHECK_DELAY_MS || 30000)
  // A pass on the build being replaced proves nothing, so after a deployment
  // the workflow waits before the first look (the build id is logged either way).
  const initialMs = Number(process.env.CHECK_INITIAL_DELAY_MS || 0)
  if (initialMs) await new Promise((r) => setTimeout(r, initialMs))
  let last
  for (let i = 1; i <= attempts; i++) {
    try {
      last = await Promise.all(['en', 'ar'].map((lang) => checkOnce(base, lang)))
    } catch (e) {
      last = [{ lang: '-', ok: false, problems: [String(e.message || e)] }]
    }
    for (const r of last) {
      console.log(`attempt ${i}/${attempts} ${r.lang}: ${r.ok ? 'ok' : 'FAIL'} build=${r.buildId ?? '?'} classes=${(r.used ?? []).join(' ')} css=${(r.css ?? []).join(' ')}${r.ok ? '' : ' | ' + r.problems.join('; ')}`)
    }
    if (last.every((r) => r.ok)) {
      console.log(`fonts: every font class on the page is defined, ${base}, build ${last[0].buildId ?? 'unknown'}`)
      return 0
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, delayMs))
  }
  console.log(`::error::font classes on ${base} are not defined in its CSS after ${attempts} attempts: ${last.flatMap((r) => r.problems).join('; ')}. Redeploy production with the build cache off.`)
  // The last attempt, for the alert job (scripts/font-alert.cjs) to post.
  if (process.env.GITHUB_OUTPUT) {
    const report = { base, attempts, results: last.map(({ lang, ok, buildId, missing, problems }) => ({ lang, ok, buildId, missing, problems })) }
    require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `report=${JSON.stringify(report)}\n`)
  }
  return 1
}

module.exports = { fontClassesOnPage, stylesheetPaths, fontClassesInCss, buildIdOf, verdict }

// Run only as a command; the unit test requires the functions above.
if (require.main === module) {
  main().then((code) => process.exit(code))
}
