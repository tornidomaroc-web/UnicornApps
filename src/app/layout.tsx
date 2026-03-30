import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UnicornApps - AI E-commerce Content Generator",
  description: "Convert your product images into SEO-optimized marketing content using AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen flex-col relative">
          <Navbar />
          <main className="flex-1 mt-16">{children}</main>
        </div>
      </body>
    </html>
  );
}
