'use client'

import { Inter } from "next/font/google";
import { useEffect } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { initializeApp } from "@/lib/capacitor";

const inter = Inter({ subsets: ["latin"] });

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    initializeApp();
  }, []);

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
