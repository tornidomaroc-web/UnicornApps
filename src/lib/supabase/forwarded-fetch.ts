// Tell Supabase Auth WHO is asking, so its per-address limits count people, not
// our server.
//
// Every auth call in this app (sign-in, password reset, the session refresh in
// middleware, the OAuth/email callback exchange) is made by our server on
// Vercel. Supabase rate-limits those endpoints per IP address, so without this
// it sees a handful of Vercel addresses shared by every user: one person
// failing logins in a loop could exhaust the allowance for everyone, and normal
// traffic draws from the same pool.
//
// Supabase's answer is the `Sb-Forwarded-For` header, honoured only when the
// request is authenticated with a SECRET API key (sb_secret_…, not the legacy
// service_role) and "IP Address Forwarding" is on in Authentication → Rate
// Limits. This wrapper adds both, to AUTH requests only (`/auth/v1/`). Database
// requests (`/rest/v1/`) are left exactly as they were, on the anon key with
// the user's own JWT, so row-level security is untouched.
//
// Inert until SUPABASE_SECRET_KEY is set: no key, or no client address, and the
// default fetch is used, byte for byte today's behaviour. That makes the
// switch-on order free: code, key and dashboard setting in any order, each one
// reversible.
//
// Works in the Edge runtime (middleware) and in Node: Web APIs only.

/** Strict enough that a header value we did not get from Vercel is not forwarded. */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6 = /^[0-9a-f:]+$/i

export function isIpAddress(v: string): boolean {
  return IPV4.test(v) || (v.includes(':') && v.length <= 45 && IPV6.test(v))
}

/** The client address as Vercel reports it: x-real-ip, then the first x-forwarded-for hop. */
export function clientIpFrom(headers: Headers): string | null {
  const real = headers.get('x-real-ip')?.trim()
  const candidate = real || headers.get('x-forwarded-for')?.split(',')[0]?.trim() || ''
  return candidate && isIpAddress(candidate) ? candidate : null
}

/**
 * A fetch for supabase-js that forwards the end user's address on auth calls,
 * or `undefined` (use the default fetch) when there is nothing to forward.
 */
export function authForwardingFetch(
  ip: string | null,
  env: { url?: string; anonKey?: string; secretKey?: string } = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  }
): typeof fetch | undefined {
  const { url, anonKey, secretKey } = env
  if (!ip || !url || !secretKey || !secretKey.startsWith('sb_secret_')) return undefined
  const authPrefix = `${url.replace(/\/+$/, '')}/auth/v1/`

  return (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!target.startsWith(authPrefix)) return fetch(input, init)

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set('apikey', secretKey)
    headers.set('sb-forwarded-for', ip)
    // The anon key travelling as a bearer token says nothing about the user;
    // a secret key must not be paired with it. A user's own JWT stays.
    if (anonKey && headers.get('authorization') === `Bearer ${anonKey}`) headers.delete('authorization')
    return fetch(input, { ...init, headers })
  }
}
