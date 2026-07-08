'use client'

import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { useEffect } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { initializeApp } from "@/lib/capacitor";

const inter = Inter({ subsets: ["latin"] });

// Arabic face for the bilingual UI. Previously .font-arabic pointed at
// 'IBM Plex Sans Arabic' which was never loaded (Arabic fell back to system
// sans). Loaded here and exposed as a CSS var that .font-arabic consumes.
// preload:false — English (default) visitors don't fetch the Arabic webfont;
// it loads only when the AR toggle applies .font-arabic. Note: this family has
// no 900, so Arabic font-black clamps to 700.
const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-arabic",
  display: "swap",
  preload: false,
});

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
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.className} ${ibmPlexArabic.variable}`}>
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
