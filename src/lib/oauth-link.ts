import { randomBytes } from 'crypto'
import type { User } from '@supabase/supabase-js'
import { isSocialProvider, type SocialProvider } from '@/lib/auth-providers'

/**
 * Pre-account takeover, and the one thing that closes it.
 *
 * Our email accounts are created CONFIRMED without the address ever being
 * proven (admin createUser with email_confirm, confirmation is off). Supabase
 * links a Google sign-in to an existing user with the same email, and its own
 * defence (dropping unconfirmed identities) runs only for UNconfirmed users,
 * so never for ours. An attacker can therefore register victim@gmail.com with
 * a password, wait for the owner to tap "Continue with Google", and keep a
 * working password on the owner's account.
 *
 * So the first time a social identity is seen next to an email identity, the
 * callback rotates the password to a random value the attacker never learns,
 * signs out every other session and tells the user. `link_secured` in
 * app_metadata (which the user cannot edit) makes that run once.
 */

export const LINK_SECURED_KEY = 'link_secured'

/** The social provider that was linked to a password account and is not yet secured, or null. */
export function unsecuredLinkedProvider(user: Pick<User, 'identities' | 'app_metadata'> | null | undefined): SocialProvider | null {
  if (!user) return null
  const identities = user.identities ?? []
  const hasEmail = identities.some(i => i.provider === 'email')
  if (!hasEmail) return null
  if (user.app_metadata?.[LINK_SECURED_KEY]) return null
  const social = identities.map(i => i.provider).find(isSocialProvider)
  return social ?? null
}

/** 32 random bytes as hex: nobody, including us, keeps it. */
export const randomPassword = () => randomBytes(32).toString('hex')

/** The social provider that created this user, when it was not our server. */
export function signupMethodOf(user: Pick<User, 'app_metadata'> | null | undefined): SocialProvider | 'email' {
  const p = user?.app_metadata?.provider
  return isSocialProvider(p) ? p : 'email'
}
