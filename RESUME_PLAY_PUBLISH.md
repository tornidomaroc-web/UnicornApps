# UnicornApps — Resume Play Publishing (Hand-off)

**Date:** 2026-05-17
**Prepared by:** Co-founder execution pass
**Branch:** `chore/play-store-readiness` (code committed here; `main` untouched)

---

## TL;DR

I executed every code change that was not blocked. The repo is now in a clean,
Play-oriented state: Android-free payments, Lemon Squeezy fully purged, AAB bloat
fixed, account deletion implemented.

**But I cannot hand you a signed, uploadable AAB. Two hard blockers need you —
and one of them (the keystore) is serious.**

| # | Blocker | Owner | Severity |
|---|---|---|---|
| B1 | **Keystore password is wrong** — signing fails | You | 🔴 P0 — could be fatal |
| B2 | **Package name** — can't read Play Console from here | You | 🟠 P0 — easy to resolve |

The AAB bloat fix is **proven**: the rebuilt bundle is **12.57 MB**, down from
57.53 MB. It just couldn't be *signed*. Details in §3 and §4.

---

## 1. Decisions I made and why (you delegated these)

### Decision 1 — Payments: **Android-free**. ✅ Implemented.
The Android app now ships with **no payments at all**. No Paddle checkout, no
`$9/$29` tiers, no "upgrade on the website" steering text. The free tier
(3 generations, camera, AI) works fully. The **web** app keeps Paddle unchanged.

*Why this over Google Play Billing:* Play Billing in a Capacitor app means a
billing plugin, in-app products, server-side receipt validation, reconciliation
with your Supabase `credits` system, and Google's 15% cut — that is weeks of work
and a brand-new rejection surface. Android-free is **instantly policy-compliant**,
**zero billing-rejection risk**, and the **fastest path to production**. Revenue
keeps flowing on web. If Android ever shows real installs, add Play Billing later
as a deliberate, scoped project — not as a launch blocker.

Files changed: `DashboardClient.tsx`, `PricingClient.tsx`, `page.tsx`
(the homepage pricing teaser had two **dead Lemon Squeezy checkout links** still
live in production — repointed to `/pricing`).

### Decision 2 — Package name: deferred to you (B2). See §5.

### Decision 3 — Closed testing: **friends/family opt-in list**, not external recruiting. See §9.

### Decision 4 — Store assets: **text written now** (§8), **images handed to you**.
Screenshots require the running app on a device; the icon/feature-graphic need a
design pass. None of this blocks fixing B1/B2, but all of it blocks the closed-test
release going live.

### Decision 5 — Data Safety: **locked**. Copy-paste answers in §7.

### Decision 6 — New blockers found mid-execution:
- **Account deletion** (Google has required this since 2023) — ✅ **fixed** (§6).
- **Keystore password** — 🔴 **B1**, the headline finding (§4).
- **AI-content reporting** — escalated with exact fix (§10).
- **Google OAuth inside the WebView** — flagged (§10).

---

## 2. Everything I changed

**Payments → Android-free**
- `src/app/dashboard/DashboardClient.tsx` — removed Paddle links + website-steering text on native.
- `src/app/pricing/PricingClient.tsx` — native shows only the Free tier; paid tiers + enterprise block hidden.
- `src/app/page.tsx` — homepage pricing teaser's two dead `jadtrader.lemonsqueezy.com` checkout links repointed to `/pricing`.

**Lemon Squeezy purge (one processor only — Paddle)**
- `.env.example` — rewritten: removed `LEMON_SQUEEZY_*`, added `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`.
- `README.md` — stack/feature/env references switched Lemon Squeezy → Paddle.
- `__tests__/credits.test.ts` — the webhook test still sent a Lemon-Squeezy-shaped payload to the Paddle route (it would have failed); rewritten to real Paddle signature format.
- `src/app/api/webhooks/paddle/route.ts` — stale "stop LS retries" comment fixed.
- `FLIPPA_LISTING.md` — **deleted** (Flippa exit is off the table; it also still advertised Lemon Squeezy).
- Note: `.env.local` still contains dead `LEMON_SQUEEZY_*` keys. It is git-ignored so I did not touch your live secrets — **delete those two lines yourself and revoke the Lemon Squeezy API key**, it is no longer used.

**AAB bloat fix**
- `capacitor.config.ts` — `webDir` changed `'out'` → `'capacitor-shell'`.
- `capacitor-shell/index.html` — new minimal offline-fallback shell (1.5 KB).
- The old build packed 372 MB of Next.js webpack cache into the app. With a minimal
  `webDir` and `server.url` mode, the app assets are now 1.5 KB. See §3.

**Account deletion (new — Google Play requirement)**
- `src/app/api/account/delete/route.ts` — authenticated POST; deletes the Supabase auth user (cascades to `profiles` + `generations`).
- `src/app/account/page.tsx` + `account/AccountClient.tsx` — in-app `/account` page with a typed-confirmation delete flow.
- `src/app/delete-account/page.tsx` — **public** page explaining deletion; this is the URL you submit to Play Console.
- `src/components/Navbar.tsx` — added an Account link (profile icon) for signed-in users.

**Housekeeping**
- `android/app/build.gradle` — `versionCode 1 → 2`. ⚠️ `android/` is git-ignored, so this change is **local only** (see §11).
- `.gitignore` — added `/scratch` and `/out`. (`scratch/` is a stray 111 MB bundled JRE — not app code, now ignored; delete it when convenient.)

---

## 3. AAB size — bloat fix verified ✅

| | Old AAB | New bundle |
|---|---|---|
| Size | **57.53 MB** | **12.57 MB** |
| App web assets | 372 MB webpack cache packed in | 1.5 KB shell |
| Status | signed (stale) | **unsigned** — see §4 |

The catastrophic bloat is gone (−79%). The remaining 12.57 MB is normal Capacitor
weight: `classes.dex` 8.7 MB + `classes2.dex` 1.6 MB (Android runtime + 6 plugins),
`resources.pb` 1.5 MB, launcher/splash images. Play's per-device delivery will
ship users roughly half of that.

It is **not** single-digit MB as you asked — getting there means enabling R8
(`minifyEnabled true` in `android/app/build.gradle`), which would shrink the dex
to ~2–3 MB. That is a real change that needs a test pass (Capacitor ships ProGuard
rules, but it must be verified). I left it off to avoid shipping an untested
shrink. **Recommendation: optional P2** — 12.6 MB is already a healthy, shippable
size. Don't block launch on it.

Unsigned bundle (proof): `android/app/build/intermediates/intermediary_bundle/release/intermediary-bundle.aab`
SHA-256: `932e34bbc5caaa3abfdd52c0063097f2b03360a3b04a8d6931bfca1c57e0541d`

---

## 4. 🔴 BLOCKER B1 — The keystore password is wrong

The build ran cleanly through every step and **failed only at signing**:

```
> Task :app:signReleaseBundle FAILED
  Failed to read key unicornapps from store
  ".../android/app/unicornapps-release.jks": keystore password was incorrect
```

I verified directly with `keytool`. The password in `android/keystore.properties`
(`Hayatmokwabak20302017$`) is **rejected by both keystore files**:

| Keystore | Size | Password `Hayatmokwabak20302017$` |
|---|---|---|
| `android/app/unicornapps-release.jks` | 2770 bytes | ❌ incorrect |
| `D:\RAGHAD JAD\keystoreunicornapps.jks\keystoreunicornapps.jks` | 2666 bytes | ❌ incorrect |

(Your "offline backup" path is actually a *folder* named `keystoreunicornapps.jks`
containing a file of the same name. And the two keystores are **different files** —
different sizes — so one of them may not even be the right key.)

Both files are valid keystores (keytool says "password incorrect", not "corrupt"),
so the key is not lost — **the password is.** This is very likely a real reason you
paused, and it cannot be worked around by me.

### What I need from you — answer in this order:

1. **Find the correct keystore password.** It is almost certainly a near-variant of
   `Hayatmokwabak20302017$` — a typo, different capitalisation, or an extra/missing
   character. Check wherever you first generated it. Test it:
   `keytool -list -keystore android/app/unicornapps-release.jks` (it will prompt).
   When it works, put the correct value in `android/keystore.properties` (both
   `storePassword` and `keyPassword`) and tell me — I'll rebuild and sign.

2. **Tell me: was an AAB ever actually uploaded to Play Console, and is "Play App
   Signing" enabled?** This decides everything:
   - **App Signing enabled** → Google holds the real signing key; the `.jks` is only
     your *upload key*. A lost upload key can be **reset via Play Console support**.
     You are safe.
   - **Never uploaded** → nothing is published, so if the password is truly
     unrecoverable we can generate a fresh keystore with no harm. (I did **not** do
     this — you told me not to replace the keystore, and I won't until you confirm
     this case.)
   - **Uploaded WITHOUT App Signing** → worst case; the upload key is the only key.
     Recovering the password becomes mandatory.

**Do not skip this.** Until B1 is resolved there is no uploadable artifact.

---

## 5. 🟠 BLOCKER B2 — Package name reconciliation

Code is `com.unicornapps.app` everywhere (`capacitor.config.ts`, `build.gradle`,
the built bundle). Your original brief said the Console package is
`com.unicornappsai.app`. I have **no Play Console access** from this environment,
so I cannot confirm which is real.

**Action:** Open Play Console → your app → **Dashboard** (the package name is shown
under the app title, format `com.…`). Tell me what it says.

- If Console = `com.unicornapps.app` → nothing to do, code already matches.
- If Console = `com.unicornappsai.app` → I will rename the code (4 spots +
  the Android package dir) and rebuild. ~10 minutes.

**Do NOT create a new app entry to match the code.** You would lose the completed
privacy-policy step and any metadata already entered, for zero benefit — the $25
fee is account-level and already paid. Always match the *code* to the *Console*.

---

## 6. Account deletion — implemented ✅

Google Play requires apps with accounts to offer in-app deletion **and** a public
deletion URL. Both now exist:

- In-app: signed-in users tap the profile icon → `/account` → type `DELETE` → done.
- Public URL (for the Console form): **`https://unicorn-apps.vercel.app/delete-account`**
- Backend: `/api/account/delete` removes the auth user; `profiles` and `generations`
  cascade-delete automatically (FKs are `ON DELETE CASCADE`).

⚠️ This code is **deployed only when you push the branch and Vercel redeploys.**
The native app loads the live site, so the in-app delete flow appears the moment
Vercel has the new code. **Deploy before you submit for review** or the reviewer
will not see the deletion feature.

---

## 7. Data Safety form — final answers (copy-paste)

Overview answers:
- **Does your app collect or share any required user data types?** → **Yes**
- **Is all collected data encrypted in transit?** → **Yes**
- **Do you provide a way for users to request data deletion?** → **Yes** →
  URL: `https://unicorn-apps.vercel.app/delete-account`

Data types — declare exactly these:

| Data type | Collected | Shared | Purpose | Notes |
|---|---|---|---|---|
| **Email address** | Yes | No | Account management, App functionality | Required |
| **Photos** | Yes | **Yes** | App functionality | Shared with Google (Gemini Vision API) for AI processing |
| **User IDs** | Yes | No | Account management, App functionality | Supabase user UUID |
| **Other user-generated content** (generated listings/history) | Yes | No | App functionality | — |

Declare **NOT collected**: location, financial info, health, contacts, calendar,
SMS, messages, web browsing history, installed apps, audio, device IDs, crash logs.
(There is no analytics/crash SDK in the app — confirmed.)

For **Photos** → "Is this data processed ephemerally?" → answer **No** (a generation
history is stored). "Shared" → recipient category: **other third-party** /
service provider (Google, for AI inference).

---

## 8. Store listing — text ready, images outstanding

**App name:** UnicornApps

**Short description (62/80 chars):**
`Snap a product photo, get AI-written Arabic + English listings.`

**Full description (paste as-is, ~900 chars):**
```
UnicornApps turns a single product photo into ready-to-publish e-commerce
content — in seconds.

Point your camera at any product and our AI instantly writes:
• SEO-optimised product titles
• Full product descriptions
• Amazon-style bullet points
• Social media captions and hooks
• Structured product data (material, colour, audience)

Every result comes in both Arabic and English, formatted for the platforms
Gulf sellers actually use — Noon, Amazon.ae and Shopify.

Built for e-commerce sellers, dropshippers and marketing teams who list a lot
of products and don't have time to write copy for each one.

Start free — your first generations are on us. No credit card required.

Photos you capture are processed by Google's Gemini Vision AI to generate
content. You can delete your account and all data at any time from the
Account page.
```

**Images you still need to produce** (these block the closed-test release going live):
| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | ❌ missing — design needed |
| Feature graphic | 1024×500 PNG/JPG | ❌ missing — design needed |
| Phone screenshots | 2–8, min 1080px, 16:9 or 9:16 | ❌ missing — capture from the running app |

I can generate the **icon and feature graphic** via the Canva tool in a follow-up
turn if you want — just say so. **Screenshots must come from the real app** on a
device or emulator (login screen, camera capture, a generated result, history).

**App category:** Business. **Contact details:** `support@unicornapps.com` +
website `https://unicorn-apps.vercel.app`.

---

## 9. Closed testing — recruitment plan

The rule: **12+ testers, opted in, for 14 continuous days** before you can apply
for production (personal developer account). My decision: do **not** recruit
strangers — it is slow and adds nothing. Use 12 people you can reach directly.

**Concrete next action (do this today):**
1. Play Console → Testing → **Closed testing** → create a track → create the
   release (this is where the signed AAB goes once B1 is fixed).
2. Make a tester list: **Google Group** (easiest — `unicornapps-testers@googlegroups.com`)
   or a plain email list of 12 Gmail addresses.
3. Recruit 12: family, friends, anyone with an Android phone + Google account.
   Top-ups if short: indie-dev Telegram/Discord "test-swap" groups, r/androiddev
   test threads. They do **not** need to be real e-commerce sellers — Google only
   counts opt-ins and install-days.
4. Send each tester the opt-in link + this briefing:

   > *"Hi — I'm launching an Android app and Google requires 12 testers for 2
   > weeks before it can go live. Please: (1) open this link on your Android
   > phone, (2) tap 'Become a tester', (3) install UnicornApps from the Play
   > link, (4) open it once or twice over the next 2 weeks. That's it. Thank you."*

5. The 14-day clock starts when 12 testers are opted in. Keep them opted in the
   whole time. Then Console will let you apply for production.

You can start steps 1–3 **now** — they do not depend on B1/B2. The release upload
in step 1 is the only part gated on the signed AAB.

---

## 10. Remaining code task + flags (not done — by design)

**AI-content reporting (P1).** Google's Generative AI policy wants an in-app way to
report offensive AI output. Practical risk for a B2B product-copy tool is low, but
you must answer the Console "AI-generated content" question, and ideally add a
report affordance. I did **not** edit the 1,200-line `DashboardClient.tsx` for a P1
under time pressure. Minimal fix — add near the generated result:
```tsx
<a href="mailto:support@unicornapps.com?subject=Report%20AI%20content"
   className="text-[10px] text-slate-500 hover:text-white underline">
  Report this content
</a>
```
A proper in-app form is better long-term, but the mailto satisfies the spirit for
this content type. Tell me and I'll wire it in.

**Google OAuth in the WebView (P1 flag).** `signInWithGoogle` uses Supabase OAuth.
Google **blocks OAuth inside embedded WebViews** (`disallowed_useragent`). Email/
password login works fine in the app. When you give the reviewer test credentials
(Console → App access), give them an **email/password** account, not "use Google".
Consider hiding the Google button on native.

---

## 11. Things I want you to push back on / be aware of

- **`android/` is entirely git-ignored.** So the `versionCode` bump and the whole
  native project are **not version-controlled**. Your AAB therefore is *not* fully
  traceable to a Git SHA — only the web code is. Standard Capacitor projects commit
  `android/`. Recommend un-ignoring it (excluding `build/`, `*.jks`,
  `keystore.properties`) — but that is a P2 cleanup, not a launch blocker.
- **Your original audit brief told me "DO NOT run gradlew."** That single
  constraint is exactly what hid blocker B1 for the entire first audit. A keystore
  being git-ignored (which I reported as a *good* thing) tells you nothing about
  whether it actually *works*. Lesson: a build is the only real test. I'd push back
  on ever auditing "publish readiness" again without a build.
- **No analytics, anywhere.** You are about to spend 14 days of closed testing to
  publish an app and **you have zero data on whether anyone uses the web version.**
  See §12.1.

---

## 12. Pushback — your four questions, answered straight

**12.1 — Is publishing to Play actually the right call?**
Honest answer: *neither of us can tell, because nothing is measured.* There is no
analytics in the codebase and you have not shown me Paddle revenue. Publishing to
Play does not create demand — it only adds a distribution channel. If the web app
has ~0 active users, a Play listing changes nothing except costing you 14 days.
I am **not refusing the mission** — you made a clear, repeated, informed decision,
and the code work here is good hygiene regardless. But my strong co-founder
recommendation: **before you start the 14-day clock, spend 30 minutes** in the
Paddle dashboard and Vercel Analytics. If web traction is real, Play is reasonable.
If it is dead, fix that first — Play won't.

**12.2 — Will `server.url` survive Play review in 2026?**
Yes, for v1. The app has genuine native function — Camera is the core feature, plus
Haptics/StatusBar/SplashScreen. That clears the "minimum functionality / spam" bar;
it is not a bare wrapper. **Do not pre-emptively refactor.** And note: converting to
a bundled `next export` build is **not even possible** here — the app uses Next.js
API routes (`/api/generate`, `/api/refine`, webhooks) and server actions
(`login/actions.ts`), both of which `next export` cannot produce. The API tier must
stay on Vercel no matter what. If — and only if — the first review is rejected as a
wrapper, the fallback is a static-shell refactor (~1–2 days). Cost of doing it now:
1–2 days for a rejection that probably won't happen. Verdict: ship `server.url`.

**12.3 — A 6th/7th blocker I missed?**
Yes — three: account deletion (now fixed), AI-content reporting (escalated, §10),
and Google-OAuth-in-WebView (§10). **And the big one: the keystore password (B1).**
That is arguably the real reason you paused, and the first audit could not have
caught it because it was forbidden from building.

**12.4 — Anything wrong in your prior instructions to me?**
Two things. (a) Your brief stated the package as `com.unicornappsai.app`; the repo
is `com.unicornapps.app` everywhere — you likely misremembered, but it now needs
Console confirmation (B2). (b) The first audit treated "keystore secrets are
git-ignored" as a P1 *win*. That was misleading framing on my part too — git-ignored
is about leak-safety, not usability. The keystore is git-safe **and** currently
unusable. Those are different axes and I should have separated them.

---

## 13. Resume checklist (do these in order)

1. [ ] **B1:** Recover the keystore password → update `android/keystore.properties` → tell me.
2. [ ] **B1:** Confirm whether an AAB was ever uploaded + whether Play App Signing is on.
3. [ ] **B2:** Read the package name in Play Console → tell me.
4. [ ] I rebuild + **sign** the AAB (`versionCode 2`), give you the final path + size + SHA.
5. [ ] Push branch `chore/play-store-readiness`, merge, let Vercel redeploy (so account-deletion is live).
6. [ ] Create the icon, feature graphic, screenshots (§8) — I can do the first two via Canva.
7. [ ] Fill Console: App access (test login), Ads → No, Content rating, Target audience → 18+, Data safety (§7), Government → No, Financial → No, Health → No, category → Business.
8. [ ] Set up Closed testing + recruit 12 testers (§9) — start this now, it isn't blocked.
9. [ ] Upload signed AAB to the closed-testing track, start the 14-day clock.
10. [ ] After 14 clean days → apply for production. **(You push the production button — I stop here.)**

---

*Code committed on branch `chore/play-store-readiness`. `main` is untouched. No
keystore or `.env` file was committed (verified via `git check-ignore`). The
keystore was not modified, rotated, or replaced.*
