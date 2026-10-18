import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * A service-role client for the auth admin API (createUser, updateUserById)
 * and the RPCs locked to service_role. Server only: the key is never
 * NEXT_PUBLIC_. Null, with a log line, when the credentials are missing, so a
 * caller can answer config_error instead of throwing.
 */
export function createAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('[auth] Supabase service credentials missing')
    return null
  }
  return createAdminClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}
