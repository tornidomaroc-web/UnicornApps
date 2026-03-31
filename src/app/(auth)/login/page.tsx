"use client"

import { useState } from 'react'
import { login, signup, signInWithGoogle } from './actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070710] px-4 py-12 relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px]" />
      </div>

      <Card className="w-full max-w-md bg-white/5 backdrop-blur-3xl border-white/10 shadow-[0_0_50px_-20px_rgba(139,92,246,0.3)] overflow-hidden relative z-10">
        <CardHeader className="space-y-2 pb-8">
          <CardTitle className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
            Sign In
          </CardTitle>
          <CardDescription className="text-slate-400 font-medium tracking-tight">
            Enter the Matrix to access your AI assets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500 mb-1.5 block">Email Identity</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="identity@matrix.com"
                required
                className="bg-black/40 border-white/10 text-white placeholder:text-slate-700 focus:border-violet-500/50 focus:ring-violet-500/20 transition-all h-12"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="password" className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-500">Security Key</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="bg-black/40 border-white/10 text-white placeholder:text-slate-700 focus:border-violet-500/50 focus:ring-violet-500/20 transition-all h-12 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-violet-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            {searchParams.error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {searchParams.error}
              </div>
            )}
            {searchParams.message && (
              <div className="rounded-md bg-zinc-100 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {searchParams.message}
              </div>
            )}
            <Button 
              type="submit" 
              className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all active:scale-[0.98]" 
              formAction={login}
            >
              Authorize Access
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="w-full h-12 border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase tracking-[0.2em] transition-all"
              formAction={signup}
            >
              Initialize Profile
            </Button>
          </form>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
              <span className="bg-slate-950 px-4 text-slate-600">
                Direct Sync Integration
              </span>
            </div>
          </div>

          <form action={signInWithGoogle}>
            <Button 
              variant="outline" 
              type="submit" 
              className="w-full h-12 border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase tracking-[0.2em]"
            >
              <svg
                className="mr-3 h-4 w-4"
                aria-hidden="true"
                focusable="false"
                data-prefix="fab"
                data-icon="google"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
              >
                <path
                  fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                ></path>
              </svg>
              Google Cloud Auth
            </Button>
          </form>
        </CardContent>
        <CardFooter className="pb-8">
          <p className="px-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-600 leading-relaxed">
            Secure Encryption Active. By authorizing, you accept our{" "}
            <a href="#" className="underline underline-offset-4 hover:text-white transition-colors">
              Protocol
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4 hover:text-white transition-colors">
              Vault Policy
            </a>
            .
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
