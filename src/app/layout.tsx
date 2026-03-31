import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: 'UnicornApps — AI Product Content Engine',
    template: '%s | UnicornApps'
  },
  description: 'Transform product images into Amazon titles, Shopify descriptions, and viral social content in 3 seconds. Powered by Gemini 3.1 Vision.',
  keywords: ['AI product description', 'Amazon SEO', 'Shopify description generator', 'product content AI', 'ecommerce automation'],
  openGraph: {
    title: 'UnicornApps — AI Product Content Engine',
    description: 'Upload any product photo. Get Amazon, Shopify & social content instantly.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UnicornApps — AI Product Content Engine',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LanguageProvider>
          <div className="flex min-h-screen flex-col relative">
            <div className="matrix-glow-shell" />
            <Navbar />
            <main className="flex-1 mt-16">{children}</main>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
