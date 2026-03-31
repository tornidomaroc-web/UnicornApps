import { Button } from "@/components/ui/button";
import { ArrowRight, Settings, ShieldCheck, Zap, Heart, Users, Globe } from "lucide-react";
import Link from "next/link";
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "About — Built for Global Commerce",
  description: "Learn how UnicornApps is accelerating global e-commerce with advanced AI Vision technology.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#070710] text-[#c8cfe0] pt-32 pb-24 px-4 relative overflow-hidden">
      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] animate-float-orb" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] animate-float-orb-slow" />
        <div className="absolute inset-0 opacity-[0.03]" 
             style={{ backgroundImage: `linear-gradient(#c8cfe0 1px, transparent 1px), linear-gradient(90deg, #c8cfe0 1px, transparent 1px)`, backgroundSize: '60px 60px' }} 
        />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* HERO */}
        <div className="text-center mb-24">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-950/30 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-widest mb-6 backdrop-blur-md">
            The Unicorn Story
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-8 leading-[0.9]">
            Built for <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-violet-600 to-amber-200 italic uppercase">Global Commerce</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
            Our mission is to simplify product management for modern entrepreneurs using the power of Matrix-class AI.
          </p>
        </div>

        {/* MISSION SECTION */}
        <div className="relative mb-24 group">
          <div className="absolute inset-0 bg-violet-600/5 rounded-[2.5rem] blur-2xl group-hover:bg-violet-600/10 transition-all" />
          <div className="relative bg-white/5 backdrop-blur-3xl border border-white/10 p-12 md:p-16 rounded-[2.5rem] space-y-8">
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-4">
              <Heart className="text-violet-500 w-8 h-8" />
              The Mission
            </h2>
            <div className="space-y-6 text-lg text-slate-300 font-medium leading-relaxed">
              <p>
                We believe that small businesses shouldn&apos;t have to spend thousands of
                dollars on specialized copywriters just to list their inventory online.
                UnicornApps was built to bridge the gap between incredible physical
                products and digital conversions.
              </p>
              <p>
                By combining advanced generative models with structured e-commerce data
                formats, we enable merchants to take a raw snapshot of a product and
                instantly receive the exact SEO title, meta descriptions, and hashtags
                needed to sell it globally.
              </p>
            </div>
          </div>
        </div>

        {/* TECH STACK SECTION */}
        <div className="grid md:grid-cols-2 gap-8 mb-24">
          <div className="bg-black/40 border border-white/10 rounded-[2.5rem] p-10 hover:border-violet-500/30 transition-all group">
            <div className="w-14 h-14 bg-violet-600/10 rounded-2xl flex items-center justify-center border border-violet-500/20 mb-8 group-hover:scale-110 transition-transform">
              <Zap className="text-violet-400 w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Gemini 3.1 Vision</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              We leverage Google’s flagship multimodal AI to process images with
              extraordinary accuracy. Our engine literally &quot;sees&quot; the textures,
              branding, and specific materials of your products.
            </p>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-[2.5rem] p-10 hover:border-amber-500/30 transition-all group">
            <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 mb-8 group-hover:scale-110 transition-transform">
              <ShieldCheck className="text-amber-400 w-8 h-8" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-4">Supabase Security</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              Your data privacy is our priority. We use Supabase to provide enterprise-grade
              Row Level Security. Your generations and payment histories
              are strictly isolated to your user ID.
            </p>
          </div>
        </div>

        {/* TEAM / STORY */}
        <div className="text-center mb-24 space-y-12">
           <div className="space-y-4">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Small Team. Big Matrix.</h2>
              <p className="text-slate-400 font-medium">Built by e-commerce veterans for the next generation of global sellers.</p>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
              {[
                { label: 'Global Offices', value: '2' },
                { label: 'Products Decoded', value: '1.2k+' },
                { label: 'Uptime Protocol', value: '99.9%' }
              ].map(stat => (
                <div key={stat.label} className="bg-white/5 border border-white/5 py-8 rounded-3xl">
                   <div className="text-3xl font-black text-white tracking-widest">{stat.value}</div>
                   <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mt-2">{stat.label}</div>
                </div>
              ))}
           </div>
        </div>

        {/* CTA */}
        <div className="relative text-center">
          <div className="absolute inset-0 bg-violet-600/10 blur-[120px] rounded-full scale-50" />
          <div className="relative z-10 bg-white/5 border border-white/10 p-16 rounded-[3rem] space-y-8 backdrop-blur-2xl">
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase leading-none">Ready to start <br /> your story?</h2>
            <p className="text-slate-400 font-medium max-w-sm mx-auto">Join the merchants accelerating their workflow with UnicornApps.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
              <Link href="/login">
                <Button size="lg" className="h-16 px-12 text-xs font-black uppercase tracking-widest rounded-2xl bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_30px_rgba(124,58,237,0.4)] transition-all hover:scale-105 active:scale-95 group">
                  Get Started Now
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}
