import { Button } from "@/components/ui/button";
import { Sparkles, BarChart3, History, Shield, Zap, Globe, Layout, Monitor, FileDown, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Features — AI-Powered Product Engine",
  description: "Explore the advanced AI capabilities of UnicornApps, from visual analysis to global SEO optimization.",
};

export default function FeaturesPage() {
  const featureGroups = [
    {
      title: "Visual Intelligence",
      icon: <Sparkles className="w-8 h-8 text-violet-400" />,
      features: [
        { name: "Gemini 3.1 Vision", desc: "Our multimodal engine identifies materials, textures, and branding with 99.8% precision." },
        { name: "Color Extraction", desc: "Automatically matches dominant and accent hex codes for precise listing metadata." },
        { name: "Asymmetric Hotspots", desc: "Interactive identification of product features mapped directly onto your photography." }
      ]
    },
    {
      title: "Conversion Engine",
      icon: <Zap className="w-8 h-8 text-amber-400" />,
      features: [
        { name: "A9 SEO Optimization", desc: "Content structuralized specifically for Amazon’s ranking algorithms and A+ content styles." },
        { name: "Social Viral Hooks", desc: "Generates high-engagement hooks for TikTok Shop, Reels, and Pinterest." },
        { name: "Global Meta Logic", desc: "Abstract SEO titles and descriptions that rank across all search indices." }
      ]
    },
    {
      title: "Merchant Workflow",
      icon: <Layout className="w-8 h-8 text-indigo-400" />,
      features: [
        { name: "Stealth Refine Console", desc: "Chat directly with the AI to refine tone, shorten copy, or target specific audiences." },
        { name: "Bulk CSV Exports", desc: "Batch export generations for mass uploads to Shopify, WooCommerce, or eBay." },
        { name: "Matrix Archives", desc: "Secure visual history of every generation with instant copy-to-clipboard functionality." }
      ]
    }
  ];

  return (
    <main className="min-h-screen bg-[#070710] text-[#c8cfe0] pt-32 pb-24 px-4 relative overflow-hidden">
      {/* BACKGROUND EFFECTS */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] animate-float-orb" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-float-orb-slow" />
        <div className="absolute inset-0 opacity-[0.02]" 
             style={{ backgroundImage: `linear-gradient(#c8cfe0 1px, transparent 1px), linear-gradient(90deg, #c8cfe0 1px, transparent 1px)`, backgroundSize: '60px 60px' }} 
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* HERO */}
        <div className="text-center mb-24">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-violet-950/30 border border-violet-500/30 text-violet-300 text-[10px] font-black uppercase tracking-widest mb-6 backdrop-blur-md">
            Product Capabilities
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-8 leading-[0.9]">
            Every Tool a <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-violet-600 to-amber-200 italic uppercase">Global Seller</span>
            <br /> Needs
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto font-medium">
            From visual decoding to bulk fulfillment, UnicornApps accelerates your e-commerce production speed by up to 10x.
          </p>
        </div>

        {/* FEATURES GRID */}
        <div className="space-y-24">
           {featureGroups.map((group, groupIdx) => (
             <div key={group.title} className="space-y-12">
                <div className="flex items-center gap-4 border-l-4 border-violet-600 pl-6">
                   <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
                      {group.icon}
                   </div>
                   <h2 className="text-3xl font-black text-white uppercase tracking-tighter">{group.title}</h2>
                </div>
                
                <div className="grid md:grid-cols-3 gap-8">
                   {group.features.map((feature, idx) => (
                     <div key={feature.name} className="bg-white/[0.03] border border-white/5 p-10 rounded-[2.5rem] hover:border-violet-500/30 transition-all hover:bg-white/[0.05] group">
                        <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4 group-hover:text-violet-400 transition-colors">{feature.name}</h3>
                        <p className="text-slate-400 font-medium leading-relaxed">{feature.desc}</p>
                     </div>
                   ))}
                </div>
             </div>
           ))}
        </div>

        {/* FINAL CTA */}
        <div className="mt-40 text-center relative py-20 px-8 rounded-[4rem] bg-gradient-to-t from-violet-600/20 via-black to-black border-t border-violet-500/30">
          <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-8 italic leading-none">
            Scale Your Engine <br /> Today
          </h2>
          <p className="text-slate-400 font-medium max-w-sm mx-auto mb-12">
            Start your free trial today and experience the future of product asset production.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link href="/login">
              <Button size="lg" className="h-16 px-12 text-xs font-black uppercase tracking-widest rounded-2xl bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_30px_rgba(124,58,237,0.4)]">
                Get Started
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="lg" className="h-16 px-12 text-xs font-black uppercase tracking-widest rounded-2xl text-white hover:bg-white/5 border border-white/10">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
