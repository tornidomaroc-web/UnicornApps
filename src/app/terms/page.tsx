import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '@/components/legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Terms of Service | UnicornApps',
  description: 'Official terms and conditions governing the use of UnicornApps services.',
}

// Content is a list of i18n key references; LegalDoc resolves them via t() so the
// page renders fully in EN or AR (see LanguageContext terms.* keys). Update the
// version / effective-date strings via the terms.version / terms.updated keys.
const SECTIONS: LegalSection[] = [
  { id: '01', titleKey: 'terms.s1.title', bodyKey: 'terms.s1.body' },
  { id: '02', titleKey: 'terms.s2.title', bodyKey: 'terms.s2.body' },
  { id: '03', titleKey: 'terms.s3.title', bodyKey: 'terms.s3.body' },
  { id: '04', titleKey: 'terms.s4.title', bodyKey: 'terms.s4.body' },
  { id: '05', titleKey: 'terms.s5.title', bodyKey: 'terms.s5.body' },
  { id: '06', titleKey: 'terms.s6.title', bodyKey: 'terms.s6.body' },
  { id: '07', titleKey: 'terms.s7.title', bodyKey: 'terms.s7.body' },
  { id: '08', titleKey: 'terms.s8.title', bodyKey: 'terms.s8.body' },
  { id: '09', titleKey: 'terms.s9.title', bodyKey: 'terms.s9.body' },
]

export default function TermsPage() {
  return (
    <LegalDoc
      backHref="/"
      backLabelKey="legal.back"
      eyebrowKey="legal.eyebrow"
      titleKey="terms.title"
      versionKey="terms.version"
      updatedKey="terms.updated"
      sections={SECTIONS}
      governingKey="legal.governing"
      contact={{
        // Terms-specific: this block carries the acceptance acknowledgment, so it
        // does not reuse the generic legal.contact.heading / legal.contact.sub.
        headingKey: 'terms.contact.heading',
        subKey: 'terms.contact.sub',
        ctaKey: 'legal.contact.cta',
        email: 'support@unicornapps.app',
      }}
    />
  )
}
