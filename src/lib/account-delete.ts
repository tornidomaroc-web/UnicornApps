/**
 * The two decisions the account screen makes about deleting an account, as
 * pure functions: has the user really typed the confirmation word, and which
 * translated sentence does a failed request get. Pure and React-free, so both
 * are unit-tested in node.
 */

/**
 * The word the user types before the delete button unlocks, one per language.
 *
 * WHY A WORD PER LANGUAGE. The old screen asked every user for the Latin word
 * DELETE. An Arabic reader had to switch keyboards to type a word that means
 * nothing to them, which makes the step an obstacle and not a confirmation.
 * The Arabic screen asks for the Arabic word instead.
 *
 * WHY THIS ARABIC WORD. Three letters with one spelling: no hamza, no alef
 * variants, no taa marbuta, nothing two keyboards write differently.
 */
export const CONFIRM_WORD = { en: 'DELETE', ar: 'حذف' } as const

// Arabic short vowels and the tatweel stretch, plus the zero-width and
// direction marks a keyboard or a paste can leave behind. None of them changes
// which word was typed.
const IGNORED = /[ً-ٰٟـ​-‏‪-‮⁦-⁩﻿]/g

const normalise = (s: string) => s.normalize('NFKC').replace(IGNORED, '').trim().toUpperCase()

/**
 * True when the field holds the confirmation word. EITHER word is accepted on
 * EITHER screen: a phone with only a Latin keyboard must not be a dead end on
 * the Arabic screen, and typing the other language's word is no less
 * deliberate. Case, surrounding spaces and Arabic vowel marks are ignored;
 * anything else, including a longer sentence that contains the word, is not a
 * match.
 */
export function isDeleteConfirmed(input: string): boolean {
  const typed = normalise(input)
  return typed === normalise(CONFIRM_WORD.en) || typed === normalise(CONFIRM_WORD.ar)
}

export type DeleteErrorKey = 'account.err.session' | 'account.err.subscription' | 'account.err.failed'

/**
 * The translated sentence for a failed delete request, chosen from the STATUS
 * alone. The response body is never read: whatever a server or a proxy wrote
 * there is not a reviewed, translated string.
 *
 * 409 is the route's SUBSCRIPTION_CANCEL_FAILED: the subscription could not be
 * canceled, so the account was deliberately kept. Neither a proxy nor the
 * platform answers 409, so the status alone is enough to tell it apart.
 */
export function deleteErrorKey(status: number): DeleteErrorKey {
  if (status === 401) return 'account.err.session'
  if (status === 409) return 'account.err.subscription'
  return 'account.err.failed'
}

/**
 * Set by the account screen once a delete has succeeded and read once by the
 * public deletion page, which then says so. sessionStorage and not a URL
 * parameter, so a link cannot make the page tell someone their account is gone.
 */
export const DELETED_FLAG = 'ua_account_deleted'
