// Prints the sign-up health verdict and the last-24 h counts: the same answer
// the scheduled check reads (.github/workflows/signup-health.yml), with the
// detail that check keeps out of its public log.
//
//   npm run signup:health
//
// Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY from the
// environment or .env.local; prints neither. Exit 1 on alert, 2 on a failure
// of the query itself.
import { readFileSync } from 'node:fs'

const fromFile = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0 && !line.startsWith('#')) fromFile[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
} catch {
  // no .env.local: the environment must carry both values
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fromFile.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fromFile.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are needed (environment or .env.local)')
  process.exit(2)
}

const res = await fetch(`${url}/rest/v1/rpc/signup_health`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}',
})
const text = await res.text()
if (!res.ok) {
  console.error(`signup_health answered ${res.status}: ${text.slice(0, 300)}`)
  process.exit(2)
}
const health = JSON.parse(text)
console.log(health.alert ? 'ALERT' : 'healthy', health.reasons?.length ? `(${health.reasons.join(', ')})` : '')
console.log('window since', health.window_start)
console.table(health.counts)
if (health.by_outcome?.length) console.table(health.by_outcome)
else console.log('no sign-up attempts in the window')
process.exit(health.alert ? 1 : 0)
