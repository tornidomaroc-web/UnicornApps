import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { authForwardingFetch, clientIpFrom, forwardingStatus, logForwardingStatusOnce } from './forwarded-fetch'

export function createClient() {
  const cookieStore = cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('SERVER ERROR: Supabase environment variables are missing (URL or ANON_KEY).')
    return null
  }

  try {
    return createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        // Auth calls carry the user's address (see forwarded-fetch.ts); inert
        // until SUPABASE_SECRET_KEY is set.
        ...forwardingOption(),
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing user sessions.
            }
          },
        },
      }
    )
  } catch (error) {
    console.error('SERVER ERROR initializing Supabase Client:', error)
    return null
  }
}

function forwardingOption(): { global?: { fetch: typeof fetch } } {
  let ip: string | null = null
  try {
    ip = clientIpFrom(headers())
  } catch {
    // Outside a request (build time): nothing to forward.
  }
  logForwardingStatusOnce('server', forwardingStatus(ip))
  const f = authForwardingFetch(ip)
  return f ? { global: { fetch: f } } : {}
}
