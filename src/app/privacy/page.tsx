import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '@/components/legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Privacy Policy | UnicornApps',
  description: 'Official privacy documentation and data protection policies for UnicornApps.',
}

// Content is a list of i18n key references; LegalDoc resolves them via t() so the
// page renders fully in EN or AR (see LanguageContext privacy.* keys). Update the
// version / last-updated strings via the privacy.version / privacy.updated keys.
const SECTIONS: LegalSection[] = [
  { id: '01', titleKey: 'privacy.s1.title', bodyKey: 'privacy.s1.body' },
  { id: '02', titleKey: 'privacy.s2.title', bodyKey: 'privacy.s2.body' },
  { id: '03', titleKey: 'privacy.s3.title', bodyKey: 'privacy.s3.body' },
  { id: '04', titleKey: 'privacy.s4.title', bodyKey: 'privacy.s4.body' },
  { id: '05', titleKey: 'privacy.s5.title', bodyKey: 'privacy.s5.body' },
  { id: '06', titleKey: 'privacy.s6.title', bodyKey: 'privacy.s6.body' },
  { id: '07', titleKey: 'privacy.s7.title', bodyKey: 'privacy.s7.body' },
  { id: '08', titleKey: 'privacy.s8.title', bodyKey: 'privacy.s8.body' },
  { id: '09', titleKey: 'privacy.s9.title', bodyKey: 'privacy.s9.body' },
]

export default function PrivacyPage() {
  return (
    <LegalDoc
      backHref="/"
      backLabelKey="legal.back"
      eyebrowKey="legal.eyebrow"
      titleKey="privacy.title"
      versionKey="privacy.version"
      updatedKey="privacy.updated"
      sections={SECTIONS}
      governingKey="legal.governing"
      contact={{
        headingKey: 'legal.contact.heading',
        subKey: 'legal.contact.sub',
        ctaKey: 'legal.contact.cta',
        email: 'support@unicornapps.app',
      }}
    />
  )
}
