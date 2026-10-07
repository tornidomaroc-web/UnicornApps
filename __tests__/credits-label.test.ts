import { creditsWord } from '@/lib/i18n/credits-label'

// The navbar pill reads "<digit> <word>". The word has to agree with the digit
// in both languages; "1 Credits" and "3 رصيد" are the bugs this pins.

describe('creditsWord, English', () => {
  it.each([
    [0, 'Credits'],
    [1, 'Credit'],
    [2, 'Credits'],
    [3, 'Credits'],
    [30, 'Credits'],
    [100, 'Credits'],
  ])('%i → %s', (n, word) => {
    expect(creditsWord(n, 'en')).toBe(word)
  })
})

describe('creditsWord, Arabic number agreement', () => {
  it.each([
    [0, 'رصيد'],
    [1, 'رصيد'],
    [2, 'رصيدان'],
    [3, 'أرصدة'],
    [10, 'أرصدة'],
    [11, 'رصيدًا'],
    [30, 'رصيدًا'],
    [99, 'رصيدًا'],
    [100, 'رصيد'],
    [101, 'رصيد'],
    [102, 'رصيد'],
    [103, 'أرصدة'],
    [111, 'رصيدًا'],
    [200, 'رصيد'],
    [1000, 'رصيد'],
  ])('%i → %s', (n, word) => {
    expect(creditsWord(n, 'ar')).toBe(word)
  })

  it('never puts the digit inside the word', () => {
    for (const n of [0, 1, 2, 3, 11, 100]) {
      expect(creditsWord(n, 'ar')).not.toMatch(/\d/)
      expect(creditsWord(n, 'en')).not.toMatch(/\d/)
    }
  })

  it('treats a negative or broken balance as zero', () => {
    expect(creditsWord(-5, 'ar')).toBe('رصيد')
    expect(creditsWord(Number.NaN, 'en')).toBe('Credits')
    expect(creditsWord(2.9, 'ar')).toBe('رصيدان')
  })
})
