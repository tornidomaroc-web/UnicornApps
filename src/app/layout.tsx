import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import type { User } from "@supabase/supabase-js";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";
import { createClient } from "@/lib/supabase/server";
import { isNativeRequest } from "@/lib/native-request";

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

  // WEB ONLY — never mount analytics in the Android WebView. See the <Analytics />
  // comment below for why this gate exists at all. Reuses the EXISTING
  // isNativeRequest() helper (the same one gating /pricing and /dashboard)
  // rather than adding a second native check: two subtly-different detections of
  // the same fact is precisely the asymmetry that produced backlog item 39.
  // Costs nothing — this layout already reads cookies, so it is already dynamic.
  const isNative = isNativeRequest();

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
            <main className="flex-1 mt-16 pt-safe pb-safe">{children}</main>
          </div>
        </Providers>
        {/*
          Vercel Web Analytics — PAGE VIEWS ONLY, WEB ONLY.

          WHY IT IS GATED TO WEB (this is the load-bearing part — do not remove
          the gate):
          The Android app is a Capacitor WebView of THIS SAME web layer, so a
          merge here reaches every production Play user instantly — no app
          release, no store review, no staged rollout in between. Mounting
          analytics unconditionally would therefore begin collecting page views,
          city-level geolocation and device info INSIDE a live, listed Android
          app, which plausibly requires declaring "App activity > App
          interactions" on the Play Data Safety form. The gate makes that
          question moot at zero cost: no native traffic, so no new declaration,
          and no window in which the live listing is out of step with its own
          form. Advertising ID stays No either way — this uses no ad ID and no
          cookies. Second, smaller reason: the funnel worth reading is the
          public web UI, so Android WebView traffic would be noise in it.

          WHAT IT CAN AND CANNOT TELL YOU:
          ANALYTICS MEASURES *WHERE*, NEVER *WHY*. Page paths can show that a
          visitor never reached /login; they cannot say why, and no page-view
          count can confirm or refute a qualitative judgement about how the site
          looks. Treat a small count as an ABSENCE of evidence, not as evidence
          of a defect — below a certain volume the data cannot show a problem in
          either direction. This was originally added to capture a before/after
          around a design change; that comparison was never captured and cannot
          be reconstructed from this data afterwards. Do not cite it as one.

          DEPENDS ON A DASHBOARD TOGGLE: Vercel > unicorn-apps > Analytics.
          This component collects nothing while that is off, and the toggle
          moves with no deploy — so the presence of this tag is not evidence
          about whether data is being collected today, in either direction.

          HOBBY LIMITS, deliberately accepted: 50,000 events/month (collection
          PAUSES at the cap; a Hobby team cannot purchase overage, so this can
          NEVER produce a bill), CUSTOM EVENTS UNAVAILABLE (page paths only — we
          can see whether a visitor ever reaches /login, not what they clicked),
          and a 1-MONTH REPORTING WINDOW.
          ^ THAT WINDOW IS ROLLING, AND IT IS THE CATCH: anything older than a
          month is gone from the dashboard for good, and nothing warns you
          first. If a period matters, export it before it ages out.
        */}
        {!isNative && <Analytics />}
      </body>
    </html>
  );
}
