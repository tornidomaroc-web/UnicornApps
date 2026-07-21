export const metadata = {
  title: 'Delete Your Account | UnicornApps',
  description: 'How to delete your UnicornApps account and all associated data.',
}

// Public, unauthenticated page. Its URL is what gets submitted in the
// Google Play Console "Data deletion" / account-deletion section.
export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-[#070710] text-[#c8cfe0] pt-32 pb-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-black text-white tracking-tighter mb-6">
          Delete your account
        </h1>
        <p className="text-slate-400 mb-8">
          You can delete your UnicornApps account and all associated data at any time,
          directly from the app or the website.
        </p>

        <h2 className="text-xl font-black text-white mb-3">How to delete your account</h2>
        <ol className="list-decimal list-inside space-y-3 text-slate-300 mb-10">
          <li>Sign in to UnicornApps.</li>
          <li>
            Open the <span className="text-white font-medium">Account</span> page (tap the
            profile icon in the top navigation).
          </li>
          <li>
            Type <span className="text-white font-medium">DELETE</span> and tap{' '}
            <span className="text-white font-medium">Delete my account</span>.
          </li>
        </ol>

        <h2 className="text-xl font-black text-white mb-3">What gets deleted</h2>
        <p className="text-slate-400 mb-8">
          Deleting your account permanently removes your login credentials, your email
          address, your credit balance, and every product listing and piece of content you
          generated. This data is erased immediately and cannot be recovered. We retain no
          backups of deleted accounts.
        </p>

        <h2 className="text-xl font-black text-white mb-3">Need help?</h2>
        <p className="text-slate-400">
          If you cannot sign in, email{' '}
          <a href="mailto:support@unicornapps.app" className="text-brand underline">
            support@unicornapps.app
          </a>{' '}
          from your registered email address and we will delete your account and data
          within 30 days.
        </p>
      </div>
    </main>
  )
}
