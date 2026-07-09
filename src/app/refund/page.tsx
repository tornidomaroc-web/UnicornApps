import type { Metadata } from 'next'
import LegalDoc, { type LegalSection } from '@/components/legal/LegalDoc'

export const metadata: Metadata = {
  title: 'Refund Policy | UnicornApps',
  description: 'Official refund and cancellation policy for UnicornApps services.',
}

// Content is a list of i18n key references; LegalDoc resolves them via t() so the
// page renders fully in EN or AR (see LanguageContext refund.* keys). Update the
// version / effective-date strings via the refund.version / refund.updated keys.
const SECTIONS: LegalSection[] = [
  { id: '01', titleKey: 'refund.s1.title', bodyKey: 'refund.s1.body' },
  { id: '02', titleKey: 'refund.s2.title', bodyKey: 'refund.s2.body' },
  { id: '03', titleKey: 'refund.s3.title', bodyKey: 'refund.s3.body' },
  { id: '04', titleKey: 'refund.s4.title', bodyKey: 'refund.s4.body' },
]

export default function RefundPage() {
  return (
    <LegalDoc
      backHref="/"
      backLabelKey="legal.back"
      eyebrowKey="legal.eyebrow"
      titleKey="refund.title"
      versionKey="refund.version"
      updatedKey="refund.updated"
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
