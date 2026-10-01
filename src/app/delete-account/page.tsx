import DeleteAccountClient from './DeleteAccountClient'

export const metadata = {
  title: 'Delete Your Account | UnicornApps',
  description: 'How to delete your UnicornApps account and your data.',
}

// Public, unauthenticated page. Its URL is what gets submitted in the
// Google Play Console "Data deletion" / account-deletion section, so it must
// stay at this path, readable without signing in, and true to what
// /api/account/delete does.
export default function DeleteAccountPage() {
  return <DeleteAccountClient />
}
