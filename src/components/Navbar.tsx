'use client'

import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, LogOut, User, Menu, X } from "lucide-react";
import { useLang } from '@/lib/i18n/LanguageContext';
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { deriveNavView, reconcileNavState } from "./navbar-auth";
import { subscribeCredits } from "@/lib/credits-bus";
import { useIsNative } from "@/hooks/useIsNative";

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
  // A purchase moves this number WITHOUT a server re-render: the post-purchase
  // poll (hooks/useCreditGrantPoll.ts) reads /api/credits and publishes the
  // balance on lib/credits-bus.ts. Re-rendering the server tree instead was
  // what remounted the page mid-purchase and lost the banner (2026-09-26).
  useEffect(() => subscribeCredits(setCredits), []);

  const view = deriveNavView(user);
  const pathname = usePathname();
  // Exact match only: /dashboard is the sole route this bar links to, and a
  // startsWith would also swallow any future /dashboard/* child that still wants
  // the link back to the root.
  const onDashboard = pathname === '/dashboard';

  // THE MENU. The page links were `hidden lg:flex`, so below 1024px — every
  // phone, every tablet, the Android WebView always — there was no way to
  // reach /features or /about from the bar at all. This button and panel are
  // that way. The panel is part of the fixed nav, so it sits under the bar and
  // over the page; it closes on navigation and on Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The pricing link is WEB ONLY, hidden until native detection resolves to
  // web — the same gate every other pricing surface uses. The native app must
  // never see it, and unresolved means hidden.
  const { isNative, resolved } = useIsNative();
  const showPricing = resolved && !isNative;

  const pages: { href: string; label: string }[] = [
    { href: '/', label: t('nav.home') },
    { href: '/features', label: t('nav.features') },
    ...(showPricing ? [{ href: '/pricing', label: t('nav.pricing') }] : []),
    { href: '/about', label: t('nav.about') },
  ];
  const menuLink = (href: string) =>
    `flex h-12 items-center rounded-2xl px-4 text-base font-bold transition-colors ${
      pathname === href ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <nav className="fixed top-0 w-full z-50 pt-safe border-b border-white/5 bg-[#070710]/95">
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
            <div className="flex items-center gap-2 sm:gap-4 bg-white/5 border border-white/10 rounded-2xl p-1.5 sm:ps-4 transition-all hover:border-brand/30">
              {/* 🔴 THIS IS THE ONLY PLACE A CREDIT BALANCE RENDERS ANYWHERE IN THE APP.
                  The dashboard used to carry a header bar of its own; that bar has been
                  deleted outright, so there is no second surface to fall back on. This
                  element was `hidden sm:flex`, i.e. it never rendered below 640px — every
                  phone width. Putting ANY breakpoint gate back on it leaves a phone user
                  with no credit count at all, on every screen, and nothing else will show
                  it to them. 12px, not 10px — 10 is not a step on this scale. */}
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-brand animate-pulse" />
                <span className="text-xs font-black uppercase tracking-widest text-[#c8cfe0]">
                  {credits} <span className="text-slate-500">{t('nav.credits')}</span>
                </span>
              </div>
              <div className="hidden sm:block h-6 w-px bg-white/10 mx-1" />
              <div className="flex items-center gap-2">
                {/* A link to the page you are already on is the cheapest thing in this
                    bar to give up, and giving it up is what pays for the credit count
                    above at 411px. It is also the only element on the dashboard that
                    rendered text below 12px. */}
                {!onDashboard && (
                <Link href="/dashboard">
                  <Button size="sm" className="h-8 px-4 rounded-xl bg-brand hover:bg-brand/90 text-white text-[9px] font-black uppercase tracking-widest shadow-[0_0_15px_rgb(var(--ua-brand-glow)/0.3)] border-none transition-all hover:scale-105 active:scale-95">
                    {t('nav.dashboard')}
                  </Button>
                </Link>
                )}
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
                  <Sparkles className="ms-2 w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                </Button>
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.menu')}
            className="lg:hidden flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white"
          >
            {menuOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="site-menu" className="lg:hidden border-t border-white/5 bg-[#070710]">
          <nav aria-label={t('nav.menu')} className="container mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <ul className="space-y-1">
              {pages.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} aria-current={pathname === p.href ? 'page' : undefined} className={menuLink(p.href)}>
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-2 space-y-1 border-t border-white/5 pt-2">
              {view === 'authed' ? (
                <>
                  {!onDashboard && (
                    <li><Link href="/dashboard" className={menuLink('/dashboard')}>{t('nav.dashboard')}</Link></li>
                  )}
                  <li><Link href="/account" aria-current={pathname === '/account' ? 'page' : undefined} className={menuLink('/account')}>{t('nav.account')}</Link></li>
                </>
              ) : view === 'anon' ? (
                <li><Link href="/login" aria-current={pathname === '/login' ? 'page' : undefined} className={menuLink('/login')}>{t('nav.login')}</Link></li>
              ) : null}
            </ul>
          </nav>
        </div>
      )}
    </nav>
  );
}
