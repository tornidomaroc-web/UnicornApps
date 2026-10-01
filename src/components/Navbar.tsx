'use client'

import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { Zap, LogOut, User, Menu, X } from "lucide-react";
import { useLang } from '@/lib/i18n/LanguageContext';
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { deriveNavView, reconcileNavState } from "./navbar-auth";
import { subscribeCredits } from "@/lib/credits-bus";
import { useIsNative } from "@/hooks/useIsNative";

/**
 * The site bar, in the same visual language as the dashboard, the landing
 * pages and the auth screens: sentence-case bold type, full pills, one
 * brand-filled pill for the main action and neutral outlines for the rest.
 *
 * SIZE. Every control is 44px tall, on a 64px bar. The bar is exactly as tall
 * as the offset the layout gives the page under it, so it covers nothing.
 *
 * TWO TIERS. Below 1024px the bar carries the mark, the one main action, the
 * credit count and the menu button; everything else lives in the menu, where
 * a row is 48px tall. From 1024px the menu is gone and the bar carries it all.
 *
 * WEIGHT. An opaque background, no blur, no perpetual animation, no scale
 * transforms: nothing here asks a low-end WebView to composite a layer.
 *
 * DIRECTION. Logical classes only, and no letter-spacing anywhere.
 */
const SHAPE =
  'h-11 items-center justify-center whitespace-nowrap rounded-full text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60';
const GHOST = `${SHAPE} border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white`;
const PRIMARY = `${SHAPE} bg-brand px-5 text-white shadow-glow-brand hover:bg-brand/90`;

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

  // THE MENU. Below 1024px — every phone, every tablet, the Android WebView
  // always — the bar has no room for the page links, the account entry or the
  // sign-out, so this button and panel are the way to them. The panel is part
  // of the fixed nav, so it sits under the bar and over the page; it closes on
  // navigation, on a tap on any of its links, and on Escape.
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
  const closeMenu = () => setMenuOpen(false);

  // The pricing link is WEB ONLY, hidden until native detection resolves to
  // web — the same gate every other pricing surface uses. The native app must
  // never see it, and unresolved means hidden. It lives in the menu alone: the
  // bar's own links render before detection has answered, so a pricing link
  // there would pop in and push its neighbours.
  const { isNative, resolved } = useIsNative();
  const showPricing = resolved && !isNative;

  const home = { href: '/', label: t('nav.home') };
  const features = { href: '/features', label: t('nav.features') };
  const about = { href: '/about', label: t('nav.about') };
  const barPages = [home, features, about];
  const menuPages = [
    home,
    features,
    ...(showPricing ? [{ href: '/pricing', label: t('nav.pricing') }] : []),
    about,
  ];

  const barLink = (href: string) =>
    `flex h-11 items-center rounded-full px-4 text-[15px] font-bold transition-colors ${
      pathname === href ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
    }`;
  const menuRow = (href?: string) =>
    `flex h-12 w-full items-center rounded-2xl px-4 text-base font-bold transition-colors ${
      href && pathname === href ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  // The switch is labelled with the language it switches TO, written in that
  // language, so a reader who cannot read the current one can still find it.
  const otherLang = lang === 'en' ? 'ar' : 'en';
  const otherLangName = lang === 'en' ? 'العربية' : 'English';
  // On the English surface nothing else asks for the Arabic face, so without
  // this the one Arabic word falls back to whatever the system has.
  const otherLangFont = lang === 'en' ? 'font-arabic' : '';

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-[#070710] pt-safe">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="flex h-11 min-w-[44px] shrink-0 items-center justify-center gap-3 text-xl font-bold text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/unicornapps-mark.svg" alt="UnicornApps" width={40} height={40} className="h-10 w-10" />
            <span className="hidden sm:block">UnicornApps</span>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {barPages.map((p) => (
              <li key={p.href}>
                <Link href={p.href} aria-current={pathname === p.href ? 'page' : undefined} className={barLink(p.href)}>
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Signed in, a phone bar has no room for this next to the credit
              count and the main action, so there it is a row in the menu. Signed
              out, the same holds only on the narrowest screens, under 360px. */}
          <button
            type="button"
            onClick={toggleLang}
            lang={otherLang}
            className={`${GHOST} ${otherLangFont} px-4 ${view === 'authed' ? 'hidden sm:flex' : 'hidden min-[360px]:flex'}`}
          >
            {otherLangName}
          </button>

          {view === 'loading' ? (
            // Session still resolving. A neutral, non-interactive placeholder that
            // asserts NEITHER state — sized near the resolved clusters to limit
            // layout shift. aria-hidden: transient, nothing for AT to announce.
            <div className="h-11 w-28 rounded-full bg-white/5" aria-hidden="true" />
          ) : view === 'authed' ? (
            <>
              {/* 🔴 THIS IS THE ONLY PLACE A CREDIT BALANCE RENDERS ANYWHERE IN THE APP.
                  The dashboard used to carry a header bar of its own; that bar has been
                  deleted outright, so there is no second surface to fall back on.
                  Putting ANY breakpoint gate on the NUMBER leaves a phone user with no
                  credit count at all, on every screen, and nothing else will show it to
                  them. Only the WORD beside it gives way, below 640px and only while
                  the dashboard pill is taking the room; it stays in the tree for
                  assistive technology. */}
              <div className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-3.5 text-[15px] font-bold text-white">
                <Zap aria-hidden className="h-4 w-4 shrink-0 text-brand" />
                <span>{credits}</span>
                <span className={onDashboard ? 'font-medium text-slate-400' : 'sr-only sm:not-sr-only sm:font-medium sm:text-slate-400'}>
                  {t('nav.credits')}
                </span>
              </div>
              {/* A link to the page you are already on is the cheapest thing in this
                  bar to give up, and giving it up is what pays for the full credit
                  label at 360px. Under 360px the pill itself gives way: a three-digit
                  balance needs its room, and the menu has the same link. */}
              {!onDashboard && (
                <Link href="/dashboard" className={`${PRIMARY} hidden min-[360px]:flex`}>
                  {t('nav.dashboard')}
                </Link>
              )}
              <Link href="/account" aria-label={t('nav.account')} className={`${GHOST} hidden w-11 lg:flex`}>
                <User aria-hidden className="h-5 w-5" />
              </Link>
              {/* Icon-only until 1280px, where the bar has room for the word;
                  aria-label names it at every width. */}
              <form action={logout} className="hidden lg:block">
                <button type="submit" aria-label={t('nav.logout')} className={`${GHOST} flex w-11 gap-2 xl:w-auto xl:px-4`}>
                  {/* The arrow leaves toward the end of the line in both directions. */}
                  <LogOut aria-hidden className="h-5 w-5 shrink-0 rtl:rotate-180" />
                  <span className="hidden xl:inline">{t('nav.logout')}</span>
                </button>
              </form>
            </>
          ) : (
            <>
              {/* Both lead to the same screen, so below 640px the bar keeps the
                  main action alone and sign-in is a row in the menu. */}
              <Link href="/login" className={`${SHAPE} hidden px-4 text-slate-300 hover:text-white sm:flex`}>
                {t('nav.login')}
              </Link>
              <Link href="/login" className={`${PRIMARY} flex`}>
                {t('nav.getStarted')}
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.menu')}
            className="lg:hidden flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            {menuOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        // Scrolls inside itself: on a phone held sideways the rows are taller
        // than the screen, and a fixed panel would otherwise cut them off.
        <div id="site-menu" className="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/5 bg-[#070710]">
          <nav aria-label={t('nav.menu')} className="container mx-auto max-w-7xl px-4 py-3 sm:px-6">
            <ul className="space-y-1">
              {menuPages.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} onClick={closeMenu} aria-current={pathname === p.href ? 'page' : undefined} className={menuRow(p.href)}>
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="mt-2 space-y-1 border-t border-white/5 pt-2">
              {view === 'authed' ? (
                <>
                  {!onDashboard && (
                    <li><Link href="/dashboard" onClick={closeMenu} className={menuRow('/dashboard')}>{t('nav.dashboard')}</Link></li>
                  )}
                  <li><Link href="/account" onClick={closeMenu} aria-current={pathname === '/account' ? 'page' : undefined} className={menuRow('/account')}>{t('nav.account')}</Link></li>
                  <li>
                    <form action={logout}>
                      <button type="submit" className={`${menuRow()} gap-3`}>
                        <LogOut aria-hidden className="h-5 w-5 shrink-0 text-slate-500 rtl:rotate-180" />
                        {t('nav.logout')}
                      </button>
                    </form>
                  </li>
                </>
              ) : view === 'anon' ? (
                <li><Link href="/login" onClick={closeMenu} aria-current={pathname === '/login' ? 'page' : undefined} className={menuRow('/login')}>{t('nav.login')}</Link></li>
              ) : null}
              <li>
                <button type="button" onClick={toggleLang} lang={otherLang} className={`${menuRow()} ${otherLangFont}`}>
                  {otherLangName}
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}
    </nav>
  );
}
