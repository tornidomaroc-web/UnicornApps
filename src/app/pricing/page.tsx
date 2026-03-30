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
      name: "Starter",
      price: "$9",
      description: "Perfect for small shops starting out.",
      features: [
        "100 image generations / mo",
        "Standard AI model",
        "Basic email support",
        "7-day history",
      ],
      cta: "Get Started",
      featured: false,
      href: "https://jadtrader.lemonsqueezy.com/checkout/buy/173d1849-c625-4fe5-952e-0372e6e337de",
    },
    {
      name: "Pro",
      price: "$29",
      description: "Best for growing e-commerce brands.",
      features: [
        "500 image generations / mo",
        "Premium AI model (Fastest)",
        "Priority 24/7 support",
        "Unlimited history",
        "Bulk export options",
      ],
      cta: "Go Pro",
      featured: true,
      href: "https://jadtrader.lemonsqueezy.com/checkout/buy/46ed7c0f-c7ad-4b0b-90f2-11cf50168bf2",
    },
  ];

  return (
    <div className="container py-20 px-4 md:px-0">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that fits your growth. Generate SEO-optimized product
          descriptions in seconds.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col relative overflow-hidden transition-all duration-300 hover:shadow-xl ${
              tier.featured ? "border-primary shadow-lg scale-105" : ""
            }`}
          >
            {tier.featured && (
              <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-sm font-medium rounded-bl-lg">
                Popular
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-2xl font-bold">{tier.name}</CardTitle>
              <CardDescription className="text-muted-foreground min-h-[40px]">
                {tier.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
              <div className="mb-6">
                <span className="text-4xl font-bold">{tier.price}</span>
                <span className="text-muted-foreground ml-1">/month</span>
              </div>
              <ul className="space-y-4">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Link
                href={tier.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button
                  className={`w-full h-12 text-lg font-semibold ${
                    tier.featured
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                  }`}
                >
                  {tier.cta}
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-20 text-center text-sm text-muted-foreground">
        <p>
          Need a custom plan?{" "}
          <a href="mailto:support@uniconapps.com" className="underline hover:text-foreground">
            Contact our sales team
          </a>
        </p>
      </div>
    </div>
  );
}
