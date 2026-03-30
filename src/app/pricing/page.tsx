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
import { Check } from "lucide-react";

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
    <div className="container mx-auto py-24 px-4 md:px-6 lg:px-8 max-w-7xl">
      <div className="text-center mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6 font-sans">
          Simple Pricing for Scaling Stores
        </h1>
        <p className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto font-light">
          Start for free, upgrade when you need more power.
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col relative transition-all duration-300 hover:-translate-y-1 bg-white dark:bg-zinc-950/50 ${tier.featured
                ? "border-primary border-2 shadow-xl shadow-primary/20 scale-100 lg:scale-105 z-10"
                : "border-zinc-200 dark:border-zinc-800 shadow-sm"
              }`}
          >
            {tier.featured && (
              <div className="absolute -top-4 left-0 right-0 flex justify-center">
                <span className="bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full shadow-sm">
                  Most Popular
                </span>
              </div>
            )}
            <CardHeader className={`${tier.featured ? 'pt-8' : ''}`}>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{tier.name}</CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 min-h-[48px] text-sm md:text-base mt-2">
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
                  <li key={feature} className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-full p-1 ${tier.featured ? 'bg-primary/10 dark:bg-primary/20' : 'bg-emerald-500/10 dark:bg-emerald-500/20'}`}>
                      <Check className={`h-4 w-4 ${tier.featured ? 'text-primary' : 'text-emerald-600 dark:text-emerald-400'}`} />
                    </div>
                    <span className="text-zinc-600 dark:text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="pt-8">
              <Link href={tier.href} className="w-full">
                <Button
                  className={`w-full h-14 text-lg font-semibold rounded-xl shadow-sm transition-all ${tier.featured
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-md"
                      : "bg-zinc-100 hover:bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-50"
                    }`}
                >
                  {tier.cta}
                </Button>
              </Link>
            </CardFooter>
          </Card>
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
