import { headers } from 'next/headers'

/**
 * Token appended to the native WebView's User-Agent (see `appendUserAgent` in
 * capacitor.config.ts). Server code uses it to detect requests coming from the
 * Capacitor Android app so it can strip all pricing / external-checkout UI
 * (Google Play disallows routing users to external payment for digital goods).
 */
export const NATIVE_UA_TOKEN = 'UnicornAppsAndroid'

/**
 * True when the current request originates from the native Android app.
 * Server-only — relies on next/headers. Calling it opts the route into dynamic
 * rendering, which is exactly what we want: pricing must be decided per-request,
 * never statically prerendered.
 */
export function isNativeRequest(): boolean {
  try {
    const ua = headers().get('user-agent') || ''
    return ua.includes(NATIVE_UA_TOKEN)
  } catch {
    return false
  }
}
