// Supabase's before-user-created hook (`hook_require_server_signup`,
// migrations/2026-10-03_add_before_user_created_hook.sql) refuses email
// sign-ups at the PUBLIC endpoint so that accounts are made only by our server.
// It does not run for the admin API today. Should that ever change, every
// sign-up would fail with the hook's own sentence, which maps to no Supabase
// code: `error_code` comes back as `unknown`. So the sentence itself, which is
// ours, is what identifies that case, and the sign-up action records it as
// `hook_refused_server` instead of letting it drown in `unknown`.

/** The exact message the hook answers with. A test keeps it equal to the SQL. */
export const SERVER_SIGNUP_HOOK_MESSAGE = 'Sign up in the UnicornApps app or website.'

/** True when an auth error is that hook refusing the caller. */
export function isServerSignupHookRefusal(error: { message?: string | null } | null | undefined): boolean {
  return (error?.message ?? '').trim() === SERVER_SIGNUP_HOOK_MESSAGE
}
