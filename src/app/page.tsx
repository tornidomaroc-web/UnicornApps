"use client"

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Image as ImageIcon, Search, Database } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] relative overflow-hidden">
      {/* Background Blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] -z-10 animate-blob" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[128px] -z-10 animate-blob animation-delay-2000" />
      
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-24 md:py-32 max-w-5xl mx-auto relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-8 border border-zinc-200 dark:border-zinc-800"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          <span>Gemini-powered generation is now live</span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-5xl md:text-7xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-8 leading-tight"
        >
          AI-Powered <br className="hidden md:block" />
          <span className="text-gradient">
            Product Success
          </span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mb-12 leading-relaxed"
        >
          The ultimate B2B SaaS tool for modern e-commerce. Upload product photography and instantly
          generate SEO-optimized titles, rich descriptions, and trending social tags.
        </motion.p>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center"
        >
          <Link href="/login" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg rounded-full shadow-lg hover:shadow-primary/25 transition-all font-semibold group gap-2">
              Start Free Trial 
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link href="/features" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 text-lg rounded-full font-medium bg-white/50 backdrop-blur-sm">
              View Features
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Feature Bento Grid */}
      <section className="px-4 py-20 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
              Everything you need to list faster
            </h2>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              Purpose-built tools designed to eliminate manual data entry.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Bento Card 1 */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.01 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="md:col-span-2 bg-white dark:bg-zinc-950 rounded-3xl p-8 md:p-10 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors group"
            >
              <div>
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <ImageIcon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">AI Vision</h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-md">
                  We use Google Gemini&apos;s advanced multimodal vision capabilities to analyze your raw product images. We identify textures, materials, and distinct branding automatically.
                </p>
              </div>
            </motion.div>
 
            {/* Bento Card 2 */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.01 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white dark:bg-zinc-950 rounded-3xl p-8 md:p-10 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between hover:border-indigo-500/50 transition-colors group"
            >
               <div>
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Search className="w-6 h-6 text-indigo-500" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">SEO Magic</h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Stop guessing. Generate algorithm-friendly titles and meta descriptions that actually rank on search engines.
                </p>
              </div>
            </motion.div>
 
            {/* Bento Card 3 */}
            <motion.div 
              whileHover={{ y: -5, scale: 1.01 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="md:col-span-3 bg-white dark:bg-zinc-950 rounded-3xl p-8 md:p-10 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-8 hover:border-emerald-500/50 transition-colors group"
            >
               <div className="max-w-xl">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                  <Database className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">Export Flow</h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  Your work is never trapped. Access your full generation history securely and export everything into clean, structured CSV files for seamless uploading into Shopify or Amazon.
                </p>
              </div>
              <div className="w-full sm:w-72 h-44 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-zinc-400 font-medium overflow-hidden relative group">
                 <div className="flex flex-col items-center group-hover:scale-110 transition-transform duration-500">
                   <Database className="w-8 h-8 mb-2 text-zinc-300 dark:text-zinc-600" />
                   <span>CSV Download Ready</span>
                 </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800 py-10 px-4 text-center text-sm text-zinc-500 bg-white dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} UnicornApps. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link href="/about" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">About</Link>
            <Link href="/pricing" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Pricing</Link>
            <Link href="https://twitter.com" target="_blank" className="hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">Twitter</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
