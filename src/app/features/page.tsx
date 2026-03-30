import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles, BarChart3, History } from "lucide-react";
import Link from "next/link";

export default function FeaturesPage() {
  const features = [
    {
      title: "AI Image Analysis",
      description:
        "Upload any product photo and our system, powered by Google Gemini, instantly understands context, materials, and identifying features to extract perfect metadata.",
      icon: <Sparkles className="w-8 h-8 text-primary mb-4" />,
    },
    {
      title: "SEO Optimization",
      description:
        "We don't just describe your product; we optimize it. Get high-converting SEO titles, precise meta descriptions, and trending social media tags generated instantly.",
      icon: <BarChart3 className="w-8 h-8 text-primary mb-4" />,
    },
    {
      title: "Bulk Export & History",
      description:
        "Your workflow, secured and accessible. View your 10 most recent generations visually, copy them in one click, or export everything to a clean CSV file.",
      icon: <History className="w-8 h-8 text-primary mb-4" />,
    },
  ];

  return (
    <div className="container mx-auto py-20 px-4 md:px-0 max-w-6xl">
      {/* Hero Section */}
      <div className="text-center mb-20">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 mb-6 leading-tight">
          Scaling E-commerce with <span className="text-primary">AI</span>
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto leading-relaxed">
          UnicornApps transforms your raw product photography into conversion-ready 
          marketing assets in seconds. Save hours of manual data entry and start 
          ranking faster.
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid md:grid-cols-3 gap-8 mb-20">
        {features.map((feature, index) => (
          <Card 
            key={index} 
            className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:shadow-lg transition-all duration-300"
          >
            <CardHeader>
              {feature.icon}
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                {feature.title}
              </CardTitle>
              <CardDescription className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {feature.description}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* CTA Section */}
      <div className="text-center bg-zinc-50 dark:bg-zinc-900 py-16 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mb-4">
          Ready to automate your product listings?
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-xl mx-auto">
          Join modern entrepreneurs who use UnicornApps to scale their storefronts 
          faster. Get three free credits when you sign up today.
        </p>
        <Link href="/login">
          <Button size="lg" className="h-14 px-8 text-lg font-semibold shadow-md active:scale-95 transition-transform">
            Get Started Now
          </Button>
        </Link>
      </div>
    </div>
  );
}
