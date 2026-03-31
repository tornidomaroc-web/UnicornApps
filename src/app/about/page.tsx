import { Button } from "@/components/ui/button";
import { ArrowRight, Settings, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "About — Built for Global Commerce",
};

export default function AboutPage() {
  return (
    <div className="container mx-auto py-20 px-4 max-w-4xl text-zinc-900 dark:text-zinc-50">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-extrabold tracking-tight mb-6">
          About UnicornApps
        </h1>
        <p className="text-xl md:text-2xl font-light text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Our mission is to simplify product management for modern entrepreneurs.
        </p>
      </div>

      <div className="prose prose-zinc dark:prose-invert max-w-none mb-16 space-y-8">
        <p className="text-lg leading-relaxed">
          We believe that small businesses shouldn&apos;t have to spend thousands of
          dollars on specialized copywriters just to list their inventory online.
          UnicornApps was built to bridge the gap between incredible physical
          products and digital conversions.
        </p>
        <p className="text-lg leading-relaxed">
          By combining advanced generative models with structured e-commerce data
          formats, we enable merchants to take a raw snapshot of a product and
          instantly receive the exact SEO title, meta descriptions, and hashtags
          needed to sell it. Let us handle the marketing metadata so you can get
          back to building your brand.
        </p>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 md:p-12 mb-16 shadow-sm">
        <h2 className="text-3xl font-bold mb-8 text-center flex justify-center items-center gap-2">
          <Settings className="text-primary w-8 h-8" />
          The Tech Stack
        </h2>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-amber-500 bg-amber-100 dark:bg-amber-900/30 p-1.5 rounded-lg" />
              <h3 className="text-xl font-semibold">Google Gemini Vision</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              We leverage Google&apos;s flagship multimodal AI to process images with
              extraordinary accuracy. Gemini literally &quot;sees&quot; the textures,
              branding, and specific materials of your products.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-8 h-8 text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 p-1.5 rounded-lg" />
              <h3 className="text-xl font-semibold">Supabase Security</h3>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Your data privacy is our priority. We use Supabase to provide enterprise-grade
              Row Level Security. Your generations, API limits, and payment histories
              are strictly isolated to your user ID.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
        <Link href="/features">
          <Button variant="outline" size="lg" className="w-full sm:w-auto h-12 px-8 text-base">
            See All Features
          </Button>
        </Link>
        <Link href="/login">
          <Button size="lg" className="w-full sm:w-auto h-12 px-8 text-base shadow-md group">
            Start Free Trial
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
