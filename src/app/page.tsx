"use client"

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  Zap, 
  Layout, 
  Monitor, 
  FileDown, 
  MessagesSquare, 
  BadgeCheck,
  Globe,
  Play
} from "lucide-react";
import { motion, Variants } from "framer-motion";
import { useLang } from "@/lib/i18n/LanguageContext";
import { useIsNative } from "@/hooks/useIsNative";

export default function Home() {
  const { t } = useLang();

  // Default-hidden: only treat as web (and show pricing) once Capacitor confirms.
  const { isNative, resolved } = useIsNative();
  const showPricing = resolved && !isNative;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5, ease: "easeOut" as const }
    }
  };
  return (
    <main className="bg-[#070710] text-[#c8cfe0] selection:bg-violet-500/30 selection:text-white">
      {/* BACKGROUND EFFECTS remains same */}
      {/* 1. HERO SECTION */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-20 px-4 z-10 overflow-hidden">
        {/*
          initial={false} — render the hero at its FINAL (visible) state on the
          server, instead of shipping it hidden and fading in on mount. This is
          the ONLY motion.div on the page driven by `animate` (fires on mount);
          every section below uses `whileInView` (scroll-triggered), which
          correctly stays hidden-until-scrolled and is deliberately untouched.

          WHY: the hidden variant is opacity:0, so `initial="hidden"` serialised
          the hero — headline, sub, CTAs — into the SSR HTML at opacity:0. On a
          slow device the first paint was a black rectangle with only the navbar
          until JS downloaded, hydrated and animated. Visitors are in 177
          countries on cheap Android; this was their first impression.

          TRADEOFF, stated plainly: the hero's fade-in-on-load is GONE — you
          cannot fade in from an already-visible state, so removing the blank
          paint necessarily removes the entrance animation. That is intended and
          is NOT a design decision (content, layout, type and colour are
          untouched, and every below-the-fold scroll animation still runs).
        */}
        <motion.div
          initial={false}
          animate="visible"
          variants={containerVariants}
          className="w-full max-w-6xl mx-auto text-center"
        >
          {/* Brand lockup */}
          <motion.div variants={itemVariants} className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/unicornapps-lockup-white.svg" alt="UnicornApps" className="h-12 sm:h-16 w-auto mx-auto" />
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={itemVariants} className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-8">
            <span className="text-white">{t('hero.title1')}</span><br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-violet-600 to-amber-200">
              {t('hero.title2')}
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p variants={itemVariants} className="text-lg sm:text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-12 font-medium leading-relaxed">
            {t('hero.sub')}
          </motion.p>

          {/* CTAs */}
          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 mb-16">
            <Link href="/login">
              <Button size="lg" className="h-14 sm:h-16 px-5 sm:px-10 text-sm sm:text-lg font-black uppercase tracking-wide sm:tracking-widest rounded-2xl bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_40px_-5px_rgba(124,58,237,0.5)] transition-all hover:scale-105 active:scale-95 group">
                {t('hero.cta1')}
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <a href="https://youtu.be/sdQH-03jsCg?si=3jbRTboLZkp7XJce" target="_blank" rel="noopener noreferrer">
              <Button
                variant="ghost"
                size="lg"
                className="h-14 sm:h-16 px-5 sm:px-10 text-sm sm:text-lg font-black uppercase tracking-wide sm:tracking-widest rounded-2xl text-white hover:bg-white/5 border border-white/10 group"
              >
                <Play className="mr-2 w-5 h-5 fill-white" />
                {t('hero.cta2')}
              </Button>
            </a>
          </motion.div>

          {/* Trust Badges */}
          <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            <div className="flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-violet-500" /> {t('hero.trust1')}</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-500" /> {t('hero.trust2')}</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-violet-500" /> {t('hero.trust3')}</div>
          </motion.div>
        </motion.div>
      </section>

      {/* 2. SOCIAL PROOF BAR */}
      <section className="relative z-10 bg-black/40 border-y border-white/5 py-10 overflow-hidden">
        <div className="flex flex-col items-center gap-6">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">{t('trusted.by')}</p>
          <div className="flex w-full overflow-hidden">
            <div className="flex animate-marquee whitespace-nowrap min-w-full items-center gap-20 px-10">
              {[
                "Amazon", "Shopify", "TikTok Shop", "Instagram", "Etsy", "eBay", 
                "Walmart", "Pinterest", "WooCommerce", "Alibaba"
              ].map((logo) => (
                <span key={logo} className="text-2xl font-black tracking-tighter text-slate-600 hover:text-violet-400 transition-colors cursor-default">
                  {logo}
                </span>
              ))}
              {/* Duplicate for infinite effect */}
              {[
                "Amazon", "Shopify", "TikTok Shop", "Instagram", "Etsy", "eBay", 
                "Walmart", "Pinterest", "WooCommerce", "Alibaba"
              ].map((logo) => (
                <span key={`${logo}-dup`} className="text-2xl font-black tracking-tighter text-slate-600 hover:text-violet-400 transition-colors cursor-default">
                  {logo}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. HOW IT WORKS */}
      <section className="relative z-10 py-32 px-4 max-w-7xl mx-auto">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
          className="text-center mb-20"
        >
          <motion.p variants={itemVariants} className="text-violet-500 font-black uppercase tracking-[0.3em] text-xs mb-4">{t('how.tag')}</motion.p>
          <motion.h2 variants={itemVariants} className="text-4xl md:text-6xl font-black text-white tracking-tighter">
            {t('how.title')}
          </motion.h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            { step: "01", title: t('how.step1.title'), desc: t('how.step1.desc') },
            { step: "02", title: t('how.step2.title'), desc: t('how.step2.desc') },
            { step: "03", title: t('how.step3.title'), desc: t('how.step3.desc') }
          ].map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="group relative"
            >
              <div className="absolute inset-0 bg-violet-600/5 rounded-3xl blur-xl group-hover:bg-violet-600/10 transition-all" />
              <div className="relative bg-white/5 backdrop-blur-3xl border border-white/10 p-10 rounded-3xl h-full hover:border-violet-500/50 transition-all duration-500 hover:-translate-y-2 font-sans">
                <span className="text-6xl font-black text-violet-500/20 group-hover:text-violet-500/40 transition-colors leading-none block mb-6">{item.step}</span>
                <h3 className="text-2xl font-bold text-white mb-4">{item.title}</h3>
                <p className="text-slate-400 font-medium leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 4. FEATURES BENTO GRID */}
      <section className="relative z-10 py-32 px-4 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <p className="text-amber-400 font-black uppercase tracking-[0.3em] text-xs mb-4">{t('features.tag')}</p>
          <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter">{t('features.title')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 grid-rows-2 gap-6">
          {/* Card 1: AI Vision */}
          <motion.div 
            whileHover={{ scale: 0.98 }}
            className="md:col-span-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-[2.5rem] p-10 flex flex-col justify-between overflow-hidden group relative"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/20 rounded-full blur-[80px] -mr-32 -mt-32" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-violet-600/20 rounded-xl flex items-center justify-center mb-6 border border-violet-500/20">
                <Sparkles className="text-violet-400 w-6 h-6" />
              </div>
              <h3 className="text-3xl font-black text-white mb-4">{t('features.vision.title')}</h3>
              <p className="text-slate-400 text-lg font-medium max-w-md">{t('features.vision.desc')}</p>
            </div>
            <div className="mt-8 flex gap-3 flex-wrap">
              {["Material Detection", "Color Logic", "Audience Scoring"].map(tag => (
                <span key={tag} className="px-4 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-300">{tag}</span>
              ))}
            </div>
          </motion.div>

          {/* Card 2: SEO Engine */}
          <motion.div 
            whileHover={{ scale: 0.98 }}
            className="md:col-span-2 bg-[#0d0d1a] border border-violet-500/20 rounded-[2.5rem] p-10 flex flex-col justify-between group"
          >
             <div>
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-6 border border-amber-500/20">
                <Globe className="text-amber-400 w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">{t('features.seo.title')}</h3>
              <p className="text-slate-400 font-medium">{t('features.seo.desc')}</p>
            </div>
          </motion.div>

          {/* Card 3: Live Mockups */}
          <motion.div 
            whileHover={{ scale: 0.98 }}
            className="md:col-span-2 bg-black/40 border border-white/5 rounded-[2.5rem] p-10 flex flex-col justify-between group"
          >
             <div>
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-6 border border-emerald-500/20">
                <Monitor className="text-emerald-400 w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">{t('features.mockups.title')}</h3>
              <p className="text-slate-400 font-medium">{t('features.mockups.desc')}</p>
            </div>
          </motion.div>

          {/* Card 4: AI Refine Chat */}
          <motion.div 
            whileHover={{ scale: 0.98 }}
            className="md:col-span-2 bg-gradient-to-br from-violet-950/20 to-transparent border border-violet-500/10 rounded-[2.5rem] p-10 flex flex-col justify-between group"
          >
             <div>
              <div className="w-12 h-12 bg-violet-600/20 rounded-xl flex items-center justify-center mb-6 border border-violet-500/20">
                <MessagesSquare className="text-violet-400 w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">{t('features.console.title')}</h3>
              <p className="text-slate-400 font-medium">{t('features.console.desc')}</p>
            </div>
          </motion.div>

          {/* Card 5: CSV Export */}
          <motion.div 
            whileHover={{ scale: 0.98 }}
            className="md:col-span-2 bg-black/20 border border-white/10 rounded-[2.5rem] p-10 flex flex-col justify-between group"
          >
            <div>
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center mb-6 border border-white/10">
                <FileDown className="text-white w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">{t('features.csv.title')}</h3>
              <p className="text-slate-400 font-medium">{t('features.csv.desc')}</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 5. PRICING TEASER */}
      {showPricing && (
        <section className="relative z-10 py-32 bg-white/[0.02] border-y border-white/5 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-black text-white mb-12 tracking-tighter">{t('pricing.teaser.title')}</h2>
            <div className="grid sm:grid-cols-2 gap-8 text-left">
              <div className="bg-[#0d0d1a] border border-white/10 p-8 rounded-[2rem] hover:border-violet-500/30 transition-all group">
                <h3 className="text-xl font-black text-white mb-2 uppercase tracking-widest">{t('pricing.pack.name')}</h3>
                <div className="text-4xl font-black text-white mb-6">{t('pricing.pack.price')} <span className="text-sm font-medium text-slate-500 uppercase">{t('pricing.pack.period')}</span></div>
                <ul className="space-y-4 mb-8 text-sm font-medium">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-500" /> {t('pricing.f.credits30')}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-500" /> {t('pricing.f.allai')}</li>
                </ul>
                <a href="/pricing" className="block">
                  <Button className="w-full h-12 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-[10px]">{t('pricing.teaser.cta')}</Button>
                </a>
              </div>
              <div className="bg-[#0d0d1a] border border-violet-500/50 p-8 rounded-[2rem] shadow-[0_0_40px_-10px_rgba(124,58,237,0.3)] group relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-violet-600 text-white text-[8px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-bl-xl shadow-lg">{t('pricing.popular')}</div>
                <h3 className="text-xl font-black text-white mb-2 uppercase tracking-widest">{t('pricing.sub.name')}</h3>
                <div className="text-4xl font-black text-white mb-6">{t('pricing.sub.price')} <span className="text-sm font-medium text-slate-500 uppercase">{t('pricing.sub.period')}</span></div>
                <ul className="space-y-4 mb-8 text-sm font-medium">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-500" /> {t('pricing.f.credits100')}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-400" /> {t('pricing.f.adfree')}</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-400" /> {t('pricing.f.allai')}</li>
                </ul>
                <a href="/pricing" className="block">
                  <Button className="w-full h-12 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(124,58,237,0.5)]">{t('pricing.teaser.cta')}</Button>
                </a>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 6. FINAL CTA SECTION */}
      <section className="relative z-10 py-40 px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-violet-600/10 blur-[150px] rounded-full scale-50" />
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           whileInView={{ opacity: 1, scale: 1 }}
           viewport={{ once: true }}
           className="relative z-10 max-w-4xl mx-auto"
        >
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-white tracking-tighter mb-8 italic uppercase leading-[0.8]">
            {t('cta.title')}
          </h2>
          <p className="text-xl md:text-2xl text-slate-400 mb-12 font-medium">
            {t('cta.sub')}
          </p>
          <Link href="/login">
            <Button size="lg" className="h-14 sm:h-20 px-8 sm:px-16 text-base sm:text-xl font-black uppercase tracking-widest rounded-2xl sm:rounded-3xl bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_50px_-5px_rgba(124,58,237,0.6)] transition-all hover:scale-105 active:scale-95 group">
              {t('cta.btn')}
              <ArrowRight className="ml-4 w-6 h-6 group-hover:translate-x-2 transition-transform" />
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* 7. FOOTER */}
      <footer className="relative z-10 bg-black/80 border-t border-white/5 pt-24 pb-12 px-4 backdrop-blur-3xl">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12 mb-20">
          <div className="md:col-span-2">
            <Link href="/" className="font-black text-3xl tracking-tighter text-white flex items-center gap-3 mb-6">
              <span className="bg-white text-slate-950 w-8 h-8 flex items-center justify-center rounded-xl text-lg font-black">U</span>
              UnicornApps
            </Link>
            <p className="text-slate-500 font-medium max-w-sm leading-relaxed">
              {t('footer.desc')}
            </p>
          </div>
          <div>
            <h4 className="text-white font-black uppercase tracking-widest text-[10px] mb-8">{t('footer.nav')}</h4>
            <ul className="space-y-4 text-sm font-medium text-slate-500">
              <li><Link href="/" className="hover:text-violet-400 transition-colors">{t('nav.home')}</Link></li>
              <li><Link href="/features" className="hover:text-violet-400 transition-colors">{t('nav.features')}</Link></li>
              {showPricing && <li><Link href="/pricing" className="hover:text-violet-400 transition-colors">{t('nav.pricing')}</Link></li>}
              <li><Link href="/about" className="hover:text-violet-400 transition-colors">{t('nav.about')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-black uppercase tracking-widest text-[10px] mb-8">{t('footer.connect')}</h4>
            <div className="flex gap-4">
               {["Twitter", "LinkedIn", "Instagram", "Youtube"].map(s => (
                 <a key={s} href="#" className="w-10 h-10 border border-white/10 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all text-slate-500 hover:text-white font-black text-[10px] uppercase">{s[0]}</a>
               ))}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto pt-12 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
          <p>© {new Date().getFullYear()} UnicornApps Global. {t('footer.rights')}.</p>
          <div className="flex gap-8">
            <Link href="/privacy" className="hover:text-white transition-colors">{t('footer.privacy')}</Link>
            <Link href="/terms" className="hover:text-white transition-colors">{t('footer.terms')}</Link>
            <Link href="/refund" className="hover:text-white transition-colors">Refund Policy</Link>
          </div>
        </div>
      </footer>

    </main>
  );
}
