'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function AccountClient({ email }: { email: string }) {
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete account')
      }
      window.location.href = '/login'
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#070710] text-[#c8cfe0] pt-32 pb-20 px-4">
      <div className="max-w-xl mx-auto">
        <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Account</h1>
        <p className="text-slate-400 mb-10">
          Signed in as <span className="text-white font-medium">{email}</span>
        </p>

        <div className="bg-white/5 border border-red-500/30 rounded-2xl p-8">
          <h2 className="text-xl font-black text-white mb-2">Delete account</h2>
          <p className="text-sm text-slate-400 mb-6">
            This permanently deletes your account, your credit balance, and every piece of
            content you generated. It cannot be undone, and we keep no copies.
          </p>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Type DELETE to confirm
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white mb-4 outline-none focus:border-red-500/50"
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect="off"
          />
          {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
          <Button
            onClick={handleDelete}
            disabled={confirm !== 'DELETE' || loading}
            className="w-full h-12 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Deleting…' : 'Delete my account'}
          </Button>
        </div>
      </div>
    </main>
  )
}
