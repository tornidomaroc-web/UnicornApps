'use client'

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap, LogOut, User } from "lucide-react";
import { useLang } from '@/lib/i18n/LanguageContext';
import { useEffect, useState } from "react";

export default function Navbar() {
  const { lang, toggleLang, t } = useLang();
  const [user, setUser] = useState<any>(null);
  const [credits, setCredits] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const getData = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);
      
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', authUser.id)
          .single();
        setCredits(profile?.credits || 0);
      }
    };
    getData();
  }, [supabase]);

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#070710]/80 backdrop-blur-xl transition-all duration-500 hover:bg-[#070710]/95">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link href="/" className="font-black text-2xl tracking-tighter text-white flex items-center gap-3 group">
            <div className="w-10 h-10 bg-white text-slate-950 flex items-center justify-center rounded-xl text-xl font-black group-hover:bg-violet-600 group-hover:text-white transition-all duration-500 shadow-[0_0_20px_rgba(255,255,255,0.1)] group-hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]">
              U
            </div>
            <span className="hidden sm:block bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 group-hover:to-violet-400 transition-all">
              UnicornApps
            </span>
          </Link>
          
          <div className="hidden lg:flex items-center gap-8 text-[10px] uppercase font-black tracking-[0.2em] text-[#c8cfe0]/60">
            <Link href="/" className="hover:text-violet-400 transition-all">{t('nav.home')}</Link>
            <Link href="/features" className="hover:text-violet-400 transition-all">{t('nav.features')}</Link>
            <Link href="/about" className="hover:text-violet-400 transition-all">{t('nav.about')}</Link>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          {/* Language Toggle */}
          <button 
            onClick={toggleLang} 
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white hover:border-violet-500/50 transition-all"
          >
            {lang === 'en' ? '🇸🇦 AR' : '🇬🇧 EN'}
          </button>

          {user ? (
            <div className="flex items-center gap-2 sm:gap-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-1.5 sm:pl-4 transition-all hover:border-violet-500/30">
              <div className="hidden sm:flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#c8cfe0]">
                  {credits} <span className="text-slate-500">{t('nav.credits')}</span>
                </span>
              </div>
              <div className="hidden sm:block h-6 w-px bg-white/10 mx-1" />
              <div className="flex items-center gap-2">
                <Link href="/dashboard">
                  <Button size="sm" className="h-8 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-[9px] font-black uppercase tracking-widest shadow-[0_0_15px_rgba(124,58,237,0.3)] border-none transition-all hover:scale-105 active:scale-95">
                    {t('nav.dashboard')}
                  </Button>
                </Link>
                <Link href="/account">
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-xl text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all">
                    <User className="w-3.5 h-3.5" />
                  </Button>
                </Link>
                <form action={logout}>
                  <Button variant="ghost" size="icon" type="submit" className="w-8 h-8 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 sm:gap-6">
              <Link href="/login" className="hidden sm:block text-[10px] uppercase font-black tracking-[0.2em] text-[#c8cfe0]/60 hover:text-white transition-all">
                {t('nav.login')}
              </Link>
              <Link href="/login">
                <Button size="sm" className="h-10 sm:h-11 px-4 sm:px-8 rounded-xl sm:rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest sm:tracking-[0.2em] shadow-[0_0_30px_rgba(124,58,237,0.4)] transition-all hover:scale-105 active:scale-95 group">
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
