"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, Sparkles, Zap, Shield, Globe } from "lucide-react";
import { motion } from "framer-motion";
import { useLang } from "@/lib/i18n/LanguageContext";

export default function PricingClient() {
  const { t } = useLang();
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const checkNative = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core')
        setIsNative(Capacitor.isNativePlatform())
      } catch {
        setIsNative(false)
      }
    }
    checkNative()
  }, []);

  const tiers = [
    {
      name: t('pricing.free'),
      price: "$0",
      period: "",
      description: t('pricing.free.desc'),
      features: [
        t('pricing.f.gen3'),
        t('pricing.f.vision.std'),
        t('pricing.f.seo.basic'),
        t('pricing.f.web'),
      ],
      cta: t('pricing.cta.free'),
      featured: false,
      href: "/login",
      icon: <Shield className="w-6 h-6 text-slate-400" />
    },
    {
      name: t('pricing.starter'),
      price: "$9",
      period: t('period.month'),
      description: t('pricing.starter.desc'),
      features: [
        t('pricing.f.gen50'),
        t('pricing.f.vision.core'),
        t('pricing.f.csv'),
        t('pricing.f.queue.std'),
        t('pricing.f.history'),
      ],
      cta: t('pricing.cta.starter'),
      featured: false,
      href: "/login",
      checkoutUrl: "https://jadtrader.lemonsqueezy.com/checkout/buy/173d1849-c625-4fe5-952e-0372e6e337de",
      icon: <Zap className="w-6 h-6 text-amber-400" />
    },
    {
      name: t('pricing.pro'),
      price: "$29",
      period: t('period.month'),
      description: t('pricing.pro.desc'),
      features: [
        t('pricing.f.gen500'),
        t('pricing.f.vision.priority'),
        t('pricing.f.csv.bulk'),
        t('pricing.f.social'),
        t('pricing.f.refine'),
        t('pricing.f.support'),
      ],
      cta: t('pricing.cta.pro'),
      featured: true,
      href: "/login",
      checkoutUrl: "https://jadtrader.lemonsqueezy.com/checkout/buy/46ed7c0f-c7ad-4b0b-90f2-11cf50168bf2",
      icon: <Sparkles className="w-6 h-6 text-violet-400" />
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 }
    }
  };

  return (
    <main className="min-h-screen bg-[#070710] text-[#c8cfe0] pt-32 pb-20 px-4 relative overflow-hidden">
      {/* 1. BACKGROUND EFFECTS */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] animate-float-orb" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-float-orb-slow" />
        <div className="absolute inset-0 opacity-[0.02]" 
             style={{ backgroundImage: `linear-gradient(#c8cfe0 1px, transparent 1px), linear-gradient(90deg, #c8cfe0 1px, transparent 1px)`, backgroundSize: '60px 60px' }} 
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="text-center mb-24"
        >
          <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-950/30 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-widest mb-6">
            {t('pricing.badge')}
          </motion.div>
          <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-8 leading-[0.9]">
            {t('pricing.title').split('<br />')[0]} <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-violet-600 to-amber-200 uppercase italic">
              {t('hero.title2')}
            </span>
          </motion.h1>
          <motion.p variants={itemVariants} className="text-xl text-slate-400 max-w-2xl mx-auto font-medium">
            {t('pricing.sub')}
          </motion.p>
        </motion.div>

        <motion.div 
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto"
        >
          {tiers.map((tier, idx) => (
            <motion.div key={tier.name} variants={itemVariants} className="h-full">
              <Card
                className={`flex flex-col h-full relative transition-all duration-500 bg-white/5 backdrop-blur-3xl border-white/10 group ${
                   tier.featured
                    ? "border-violet-500/50 shadow-[0_0_50px_-10px_rgba(124,58,237,0.3)] scale-105 z-10"
                    : "hover:border-violet-500/30 shadow-sm"
                } rounded-[2.5rem] overflow-hidden`}
              >
                {tier.featured && (
                  <div className="absolute top-0 right-0">
                    <span className="bg-violet-600 text-white text-[10px] font-black uppercase tracking-[0.2em] py-2 px-6 rounded-bl-2xl shadow-lg flex items-center gap-2">
                       {t('pricing.popular')}
                    </span>
                  </div>
                )}
                
                <CardHeader className="pt-12 px-10 pb-8 border-b border-white/5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      {tier.icon}
                    </div>
                    <CardTitle className="text-2xl font-black text-white uppercase tracking-tighter">{tier.name}</CardTitle>
                  </div>
                  <CardDescription className="text-slate-400 font-medium leading-relaxed min-h-[48px]">
                    {tier.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="px-10 py-10 flex-grow space-y-10">
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter text-white">{tier.price}</span>
                    {tier.period && (
                      <span className="text-sm text-slate-500 font-black uppercase tracking-widest">{tier.period}</span>
                    )}
                  </div>
                  
                  <ul className="space-y-5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-4 group/item">
                        <Check className="h-5 w-5 text-violet-500 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-300 font-medium text-sm group-hover/item:text-white transition-colors">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter className="px-10 pb-12 pt-4">
                  {!isNative && tier.checkoutUrl ? (
                    <a href={tier.checkoutUrl} target="_blank" rel="noopener noreferrer" className="w-full">
                      <Button
                        className={`w-full h-16 text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                          tier.featured
                            ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_30px_rgba(124,58,237,0.4)]"
                            : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                        }`}
                      >
                        {tier.cta}
                      </Button>
                    </a>
                  ) : (
                    <Link href={tier.href} className="w-full">
                      <Button
                        className={`w-full h-16 text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                          tier.featured
                            ? "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_30px_rgba(124,58,237,0.4)]"
                            : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
                        }`}
                      >
                        {tier.cta}
                      </Button>
                    </Link>
                  )}
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-32 text-center"
        >
          <div className="inline-flex flex-col md:flex-row items-center gap-8 px-12 py-8 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem]">
            <div className="flex items-center gap-4 text-left">
              <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center border border-amber-500/20">
                <Globe className="text-amber-500 w-6 h-6" />
              </div>
              <div>
                <h4 className="text-white font-bold">{t('pricing.enterprise.title')}</h4>
                <p className="text-sm text-slate-500 font-medium">{t('pricing.enterprise.sub')}</p>
              </div>
            </div>
            <div className="h-px md:h-12 w-full md:w-px bg-white/10" />
            <Link href="mailto:support@unicornapps.com">
              <Button variant="ghost" className="text-xs font-black uppercase tracking-[0.2em] text-violet-400 hover:text-violet-300 hover:bg-white/5 px-8">
                {t('pricing.enterprise.cta')} →
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>

      {/* FOOTER */}
      <footer className="mt-40 border-t border-white/5 py-12 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">
          © {new Date().getFullYear()} UnicornApps Global. Powered by Matrix.
        </p>
      </footer>
    </main>
  );
}
