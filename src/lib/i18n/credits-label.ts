// The word that follows a credit balance, agreeing with the number.
//
// English has two forms. Arabic has six (CLDR plural categories), and the
// noun changes with the digit shown next to it: 1 رصيد, 2 رصيدان, 3 to 10
// أرصدة, 11 to 99 رصيدًا, and the singular again for 0 and for round
// hundreds and their +1/+2 (100 رصيد, 102 رصيد, 103 أرصدة). The digit stays
// on screen in every case: the pill it lives in hides the word on narrow
// phones, so the number can never be inside the word.
//
// Pure: no React, no translation lookup, so it runs in the node test suite.

import type { Lang } from './initial-lang'

const AR: Record<Intl.LDMLPluralRule, string> = {
  zero: 'رصيد',
  one: 'رصيد',
  two: 'رصيدان',
  few: 'أرصدة',
  many: 'رصيدًا',
  other: 'رصيد',
}

const arRules = new Intl.PluralRules('ar')

export function creditsWord(credits: number, lang: Lang): string {
  const n = Number.isFinite(credits) ? Math.max(0, Math.trunc(credits)) : 0
  if (lang === 'ar') return AR[arRules.select(n)]
  return n === 1 ? 'Credit' : 'Credits'
}
