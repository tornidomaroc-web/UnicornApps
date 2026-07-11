import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import type { User } from "@supabase/supabase-js";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";
import { createClient } from "@/lib/supabase/server";

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

// Read the auth session on the SERVER and seed the navbar with it. The browser
// Supabase client cannot see the auth cookie in this deployment, so a client
// getSession() returns null and the navbar rendered a signed-out state for a
// signed-in user (item 30 root cause). getSession() (cookie decode, no network)
// is sufficient here because the navbar is DISPLAY-ONLY: every protected route
// and the money path are independently gated server-side (middleware.ts uses the
// validated getUser()), and the credits read below is validated by RLS. The
// try/catch is load-bearing: any Supabase/env failure must degrade to today's
// behavior (page still renders, navbar shows signed-out) rather than throwing
// out of the root layout and white-screening every route for live Android
// WebView users.
async function getNavSeed(): Promise<{ user: User | null; credits: number }> {
  try {
    const supabase = createClient();
    if (!supabase) return { user: null, credits: 0 };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) return { user: null, credits: 0 };

    // Own-row read under the profiles SELECT RLS policy (auth.uid() = id). This
    // is the anon server client, NOT the service role — so PostgREST validates
    // the session's JWT signature: a real session returns the true balance, a
    // forged cookie (which getSession does not cryptographically verify) returns
    // no row -> 0. That is what keeps the getSession seed safe from spoofing.
    const { data } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .single();

    return { user, credits: data?.credits ?? 0 };
  } catch {
    return { user: null, credits: 0 };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, credits } = await getNavSeed();

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
        <Providers>
          <div className="flex min-h-screen flex-col relative">
            <div className="matrix-glow-shell" />
            <Navbar initialUser={user} initialCredits={credits} />
            <main className="flex-1 mt-16">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
