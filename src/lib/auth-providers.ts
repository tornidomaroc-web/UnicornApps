/**
 * Which social sign-in buttons exist. Google is ON, Apple is OFF.
 *
 * A button is turned on only after its provider is configured and proven end
 * to end in Supabase and the provider's console; turning one on before that
 * ships a button that fails for every user who taps it. Google's switch-on
 * order: the free-credit claim migration first (a Google account is born with
 * 0 credits and claims them on /welcome), then the provider in Supabase, then
 * this flag.
 *
 * Neither ever renders in the native app: Google refuses OAuth inside an
 * embedded WebView (403 disallowed_useragent), and the app gets its own native
 * sign-in path in a later release. `visibleProviders` enforces that on the
 * client and `signInWithProvider` refuses it on the server.
 */
export const SOCIAL_PROVIDERS = ['google', 'apple'] as const
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

export const AUTH_PROVIDERS: Readonly<Record<SocialProvider, boolean>> = {
  google: true,
  apple: false,
}

export const isSocialProvider = (v: unknown): v is SocialProvider =>
  typeof v === 'string' && (SOCIAL_PROVIDERS as readonly string[]).includes(v)

/**
 * The buttons to draw. Empty until native detection has RESOLVED to "web":
 * `useIsNative` starts unresolved, and unresolved means hidden, so the app
 * never shows a button for a frame before it learns it is native.
 */
export function visibleProviders(
  flags: Readonly<Record<SocialProvider, boolean>>,
  native: { isNative: boolean; resolved: boolean }
): SocialProvider[] {
  if (!native.resolved || native.isNative) return []
  return SOCIAL_PROVIDERS.filter((p) => flags[p])
}
