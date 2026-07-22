'use client'

import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, LogOut, User } from "lucide-react";
import { useLang } from '@/lib/i18n/LanguageContext';
import { useEffect, useState } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { deriveNavView, reconcileNavState } from "./navbar-auth";

export default function Navbar({
  initialUser = null,
  initialCredits = 0,
}: {
  initialUser?: AuthUser | null;
  initialCredits?: number;
}) {
  const { lang, toggleLang, t } = useLang();
  // Seed from the SERVER session (passed down by the root layout). The browser
  // Supabase client cannot read the auth cookie in this deployment, so we do NOT
  // resolve auth on the client — a client read returns null and would clobber the
  // correct server seed (that was the original bug). `undefined` remains a valid
  // state (neutral placeholder, never LOGIN) purely as a defensive fallback.
  const [user, setUser] = useState<AuthUser | null | undefined>(initialUser);
  const [credits, setCredits] = useState(initialCredits);

  // Every auth transition (login/signup/logout/updatePassword) calls
  // revalidatePath('/', 'layout'), which re-renders this layout and passes a
  // fresh initialUser/initialCredits. Mirror those into local state so the
  // persisted navbar instance updates without a full page reload. reconcileNavState
  // makes "server wins" explicit and test-pinned.
  useEffect(() => {
    setUser((prev) => reconcileNavState(prev, initialUser));
  }, [initialUser]);
  useEffect(() => {
    setCredits(initialCredits);
  }, [initialCredits]);

  const view = deriveNavView(user);

  return (
    <nav className="fixed top-0 w-full z-50 pt-safe border-b border-white/5 bg-[#070710]/80 backdrop-blur-xl transition-all duration-500 hover:bg-[#070710]/95">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="font-black text-2xl tracking-tighter text-white flex items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/unicornapps-mark.svg" alt="UnicornApps" width={40} height={40} className="w-10 h-10 transition-transform duration-500 group-hover:scale-105" />
            <span className="hidden sm:block bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 group-hover:to-brand transition-all">
              UnicornApps
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-8 text-[10px] uppercase font-black tracking-[0.2em] text-[#c8cfe0]/60">
            <Link href="/" className="hover:text-brand transition-all">{t('nav.home')}</Link>
            <Link href="/features" className="hover:text-brand transition-all">{t('nav.features')}</Link>
            <Link href="/about" className="hover:text-brand transition-all">{t('nav.about')}</Link>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          {/* Language Toggle */}
          <button
            onClick={toggleLang}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-brand/50 transition-all"
          >
            {lang === 'en' ? '🇸🇦 AR' : '🇬🇧 EN'}
          </button>

          {view === 'loading' ? (
            // Session still resolving. A neutral, non-interactive placeholder that
            // asserts NEITHER state — sized near the resolved clusters to limit
            // layout shift. aria-hidden: transient, nothing for AT to announce.
            <div
              className="h-10 w-24 rounded-2xl bg-white/5 animate-pulse"
              aria-hidden="true"
            />
          ) : view === 'authed' ? (
            <div className="flex items-center gap-2 sm:gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 sm:pl-4 transition-all hover:border-brand/30">
              <div className="hidden sm:flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-brand animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#c8cfe0]">
                  {credits} <span className="text-slate-500">{t('nav.credits')}</span>
                </span>
              </div>
              <div className="hidden sm:block h-6 w-px bg-white/10 mx-1" />
              <div className="flex items-center gap-2">
                <Link href="/dashboard">
                  <Button size="sm" className="h-8 px-4 rounded-xl bg-brand hover:bg-brand/90 text-white text-[9px] font-black uppercase tracking-widest shadow-[0_0_15px_rgb(var(--ua-brand-glow)/0.3)] border-none transition-all hover:scale-105 active:scale-95">
                    {t('nav.dashboard')}
                  </Button>
                </Link>
                <Link href="/account" aria-label={t('nav.account')}>
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl text-ink-2 hover:text-brand hover:bg-brand/10 transition-all">
                    <User aria-hidden className="w-3.5 h-3.5" />
                  </Button>
                </Link>
                {/* Logout is icon-only below `sm` (the pill has no room for a second
                    label at ~360-390px without clipping under body overflow-x-hidden);
                    the icon is brighter (ink-1) than the account icon (ink-2) so the two
                    are no longer indistinguishable, and aria-label names it for AT at
                    every width. The visible word appears from `sm` up where there is
                    room. tracking is ltr:-guarded so Arabic letter-joining survives. */}
                <form action={logout}>
                  <button
                    type="submit"
                    aria-label={t('nav.logout')}
                    className="h-8 w-8 sm:w-auto sm:px-3 flex items-center justify-center gap-1.5 rounded-xl text-ink-1 hover:text-red-400 hover:bg-red-500/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 text-[9px] font-black uppercase ltr:tracking-widest"
                  >
                    <LogOut aria-hidden className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">{t('nav.logout')}</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-6">
              <Link href="/login" className="hidden sm:block text-[10px] uppercase font-black tracking-[0.2em] text-[#c8cfe0]/60 hover:text-white transition-all">
                {t('nav.login')}
              </Link>
              <Link href="/login">
                <Button size="sm" className="h-10 sm:h-11 px-4 sm:px-8 rounded-xl sm:rounded-2xl bg-brand hover:bg-brand/90 text-white text-[10px] font-black uppercase tracking-widest sm:tracking-[0.2em] shadow-[0_0_30px_rgb(var(--ua-brand-glow)/0.4)] transition-all hover:scale-105 active:scale-95 group">
                  {t('nav.getStarted')}
                  <Sparkles className="ml-2 w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
