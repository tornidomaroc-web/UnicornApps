// Opens a GitHub issue when the post-deploy font check fails, or comments on
// the one already open, so the failure reaches a person.
//
//   node scripts/font-alert.cjs        (in the workflow's alert job only)
//
// Why an issue: GitHub sends a workflow-run notification to the user who
// triggered the run. A run started by Vercel's deployment_status event is
// triggered by vercel[bot], so a failed check notifies nobody and the red run
// sits unseen. An issue notifies the repository's watchers, and the body
// @mentions the owner, which notifies them even without watching.
//
// Reads the check's report (REPORT, JSON written by font-class-check.cjs) and
// the run link (RUN_URL). Talks to the REST API with GITHUB_TOKEN; the alert
// job is the only one granted issues: write. With ALERT_DRY_RUN=1 it still
// looks up the open issue (a read) but prints what it would post instead of
// posting it.

const MARKER = '<!-- post-deploy-fonts -->'
const LABEL = 'post-deploy-fonts'
const TITLE = 'Post-deploy font check failed: live font classes are not in the CSS'

/** The check's report, or null when it never got that far (checkout, setup). */
function parseReport(text) {
  try {
    const r = JSON.parse(text || '')
    return r && Array.isArray(r.results) ? r : null
  } catch {
    return null
  }
}

/** Text from the live page goes into a Markdown table: one line, no code fences, no cell breaks. */
const clean = (s) => String(s).replace(/[`\r\n]+/g, ' ').replace(/\|/g, '\\|').slice(0, 300)

/** What the issue or comment says. */
function alertText(report, runUrl, owner) {
  const lines = [MARKER]
  if (owner) lines.push(`@${owner}`, '')
  if (!report) {
    lines.push('The post-deploy font check failed before it produced a report (for example the checkout or the runner failed).')
  } else {
    lines.push(`The post-deploy font check failed on ${clean(report.base)} after ${report.attempts} attempts. Last attempt:`, '')
    lines.push('| Language | Result | Build id | Missing classes | Problems |', '| --- | --- | --- | --- | --- |')
    for (const r of report.results) {
      const missing = (r.missing ?? []).map((c) => '`' + clean(c) + '`').join(' ') || '-'
      const problems = (r.problems ?? []).map(clean).join('; ') || '-'
      lines.push(`| ${clean(r.lang)} | ${r.ok ? 'ok' : 'FAIL'} | ${r.buildId ? '`' + clean(r.buildId) + '`' : 'unknown'} | ${missing} | ${problems} |`)
    }
  }
  lines.push('', `Run: ${runUrl}`, '')
  lines.push('If classes are missing, redeploy production in Vercel with "Use existing Build Cache" unchecked, then run the "Post-deploy fonts" workflow by hand. Close this issue once it passes.')
  return lines.join('\n')
}

/** Comment on the open alert issue when there is one, otherwise open one. */
function alertPlan(openIssues, body) {
  const existing = openIssues.find((i) => !i.pull_request && (i.body ?? '').includes(MARKER))
  return existing
    ? { action: 'comment', issue: existing.number, path: `issues/${existing.number}/comments`, payload: { body } }
    : { action: 'create', path: 'issues', payload: { title: TITLE, body, labels: [LABEL] } }
}

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function main() {
  const report = parseReport(process.env.REPORT)
  const body = alertText(report, process.env.RUN_URL, process.env.OWNER)
  // Open issues with the marker, whoever opened them and whatever their labels.
  const open = await api('GET', 'issues?state=open&per_page=100')
  const plan = alertPlan(open, body)
  if (process.env.ALERT_DRY_RUN === '1') {
    console.log(`dry run, would ${plan.action}${plan.issue ? ' on #' + plan.issue : ''}: POST ${plan.path}`)
    console.log(JSON.stringify(plan.payload, null, 2))
    return 0
  }
  const out = await api('POST', plan.path, plan.payload)
  console.log(`${plan.action === 'create' ? 'opened' : 'commented on'} ${out.html_url}`)
  return 0
}

module.exports = { MARKER, LABEL, TITLE, parseReport, alertText, alertPlan }

// Run only as a command; the unit test requires the functions above.
if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.log(`::error::could not open the font alert issue: ${e.message}`)
      process.exit(1)
    },
  )
}
