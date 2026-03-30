"use client"

import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function PricingPage() {
  const tiers = [
    {
      name: "Free Trial",
      price: "$0",
      period: "",
      description: "Perfect for testing the AI capabilities.",
      features: [
        "3 AI Generations",
        "Basic History",
      ],
      cta: "Start Free",
      featured: false,
      href: "/login",
    },
    {
      name: "Starter Plan",
      price: "$9",
      period: "/month",
      description: "Ideal for small shops and independent sellers.",
      features: [
        "50 AI Generations",
        "Standard Support",
        "CSV Export",
        "Full History",
      ],
      cta: "Get Starter",
      featured: false,
      href: "/login",
    },
    {
      name: "Pro Plan",
      price: "$29",
      period: "/month",
      description: "Best for growing e-commerce brands.",
      features: [
        "500 AI Generations",
        "Priority AI Processing",
        "Bulk Export",
        "24/7 Support",
      ],
      cta: "Get Pro",
      featured: true,
      href: "/login",
    },
  ];

  return (
    <div className="container mx-auto py-24 px-4 md:px-6 lg:px-8 max-w-7xl relative overflow-hidden">
      {/* Background Blobs for Atmosphere */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] -z-10" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-center mb-20"
      >
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6 font-sans">
          Simple Pricing for <span className="text-gradient">Scaling Stores</span>
        </h1>
        <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto font-light">
          Start for free, upgrade when you need more power.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {tiers.map((tier, idx) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
          >
            <Card
              className={`flex flex-col h-full relative transition-all duration-500 hover:shadow-2xl bg-white dark:bg-zinc-950/50 group ${tier.featured
                  ? "border-primary border-2 shadow-xl shadow-primary/20 scale-100 lg:scale-105 z-10"
                  : "border-zinc-200 dark:border-zinc-800 shadow-sm"
                }`}
            >
              {tier.featured && (
                <div className="absolute -top-4 left-0 right-0 flex justify-center">
                  <span className="bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full shadow-sm flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader className={`${tier.featured ? 'pt-8' : ''}`}>
                <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{tier.name}</CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 min-h-[48px] text-sm md:text-base mt-2 group-hover:text-zinc-900 dark:group-hover:text-zinc-300 transition-colors">
                  {tier.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <div className="mb-8 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">{tier.price}</span>
                  {tier.period && (
                    <span className="text-lg text-zinc-500 dark:text-zinc-400 font-medium">{tier.period}</span>
                  )}
                </div>
                <ul className="space-y-4">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 group/item">
                      <div className={`mt-0.5 rounded-full p-1 group-hover/item:scale-110 transition-transform ${tier.featured ? 'bg-primary/10 dark:bg-primary/20' : 'bg-emerald-500/10 dark:bg-emerald-500/20'}`}>
                        <Check className={`h-4 w-4 ${tier.featured ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'}`} />
                      </div>
                      <span className="text-zinc-600 dark:text-zinc-300 group-hover/item:text-zinc-900 dark:group-hover/item:text-zinc-100 transition-colors">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="pt-8">
                <Link href={tier.href} className="w-full">
                  <Button
                    className={`w-full h-14 text-lg font-semibold rounded-xl shadow-sm transition-all group-hover:scale-[1.02] active:scale-[0.98] ${tier.featured
                        ? "bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-primary/25"
                        : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-50"
                      }`}
                  >
                    {tier.cta}
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
        <p>
          Need a custom plan?{" "}
          <a href="mailto:support@unicornapps.com" className="font-medium underline hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">
            Contact our sales team
          </a>
        </p>
      </div>
    </div>
  );
}
