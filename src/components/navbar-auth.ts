import type { User as AuthUser } from '@supabase/supabase-js'

// The navbar's auth state is DISPLAY-ONLY (the server is the source of truth for
// every protected route and the money path). This module isolates the one piece
// of load-bearing logic — which cluster to render for a resolved state — as a
// pure function so it is unit-testable under the node (no-jsdom) jest env.
//
//   undefined = not yet resolved -> render a neutral placeholder, NEVER LOGIN.
//   null      = confirmed signed-out.
//   User      = signed-in.
//
// Rendering LOGIN for the `undefined` case is exactly the bug this branch fixes,
// so it is pinned here and covered by __tests__/navbar-auth.test.ts.
export type NavAuthState = AuthUser | null | undefined
export type NavView = 'loading' | 'authed' | 'anon'

export function deriveNavView(state: NavAuthState): NavView {
  if (state === undefined) return 'loading'
  return state ? 'authed' : 'anon'
}

// Server-wins reconciliation: a fresh server seed REPLACES the previous state
// (no merge). Kept explicit and tested so a later refactor cannot quietly turn
// the reconcile into a "keep the old value if truthy" merge, which would bring
// back the stale-navbar class of bug the server seed was introduced to kill.
export function reconcileNavState(
  _prev: NavAuthState,
  next: NavAuthState,
): NavAuthState {
  return next
}
