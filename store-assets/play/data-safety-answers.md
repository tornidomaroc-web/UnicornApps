# UnicornApps - Google Play Data Safety Answers

Copy-paste pack for the Play Console Data Safety form. Verified against the
actual codebase (Supabase schema, the generate/refine API routes, the Gemini
call, and the network requests in the app). Fill the Console section by section.

Last verified against the code on 2026-10-07 (main at `30acf7d`, Android
versionCode 5 loads this same web app from https://www.unicornapps.app).
Changes since the 2026-10-03 submission: the sign-up bot check (Cloudflare
Turnstile) and the per-network sign-up cap are now described, and the privacy
policy names every provider.

## Required URLs

- **Privacy policy URL:** https://www.unicornapps.app/privacy
- **Account & data deletion URL:** https://www.unicornapps.app/delete-account

---

## What the app actually does with data (verified facts)

- Sign-in is by email and password only (Supabase Auth). The Google and Apple
  buttons are switched off in code and never render in the Android app.
- The `profiles` table stores: user id, email, credit balance, created date.
- The `generations` table stores: user id, the generated listing content, and
  `image_url` which holds the submitted product photo itself (base64). The photo
  is stored, not discarded.
- Each product photo is sent to the Google Gemini API for AI processing. When a
  user refines a result, their typed instruction and the current listing text are
  sent to the same API.
- The `usage_events` table records one row per generate or refine call: the user
  id, the time, which route ran, whether it succeeded, the model and its token
  counts. No photo and no text is stored there. On account deletion these rows
  are kept with the user id cleared, so they no longer identify anyone.
- Short-lived rate-limit counters are keyed by user id and expire with their time
  window.
- There is no analytics SDK, no crash-reporting SDK, no advertising SDK, and no
  advertising ID usage in the Android app. The website mounts Vercel Analytics,
  but only when the request does not come from the Android app.
- The Android app contains no payment flow. Pricing and billing exist only on the
  website and are deliberately absent from the Android build.
- Creating an account runs a bot check: the sign-up form loads Cloudflare
  Turnstile (`TurnstileWidget`, script from challenges.cloudflare.com), and the
  server verifies the token with Cloudflare, passing the client IP address along
  (`verifyTurnstile`, `src/lib/turnstile.ts`). Cloudflare's Turnstile privacy
  addendum (updated 2025-06-18) says the widget processes "client IP address,
  TLS Fingerprint, User-Agent Header and Sitekey" to detect bots and to improve
  Turnstile. Sign-in and password reset do not load it. Nothing from it is
  stored by the app.
- The server also keeps a per-network cap on new accounts: a SHA-256 hash of the
  client IP address goes into a counter that expires with its hour and day
  window (`checkSignupLimit`, `src/lib/signup-limit.ts`). The address itself is
  never stored.

---

## Section 1 - Data collection and security (overview)

### Does your app collect or share any of the required user data types?
**Answer:** Yes

### Is all of the user data collected by your app encrypted in transit?
**Answer:** Yes (all traffic to Supabase, Vercel, Cloudflare Turnstile, and the
Google AI API uses HTTPS/TLS)

### Which methods of account creation does your app support?
**Answer:** Username and password only. Not OAuth, not "other authentication".

### Delete account URL
**Answer:** https://www.unicornapps.app/delete-account (the canonical host; it
names the app, lists the steps, and says what is deleted and what is kept).

### Do you provide a way for users to request that their data is deleted?
**Answer:** Yes. Users delete their account in-app from the Account page, and the
public page above explains how. Deleting the account erases the sign-in details,
the email address, the credit balance, and every generation with its stored
photo. Usage counts are kept with the user id cleared, so they no longer identify
the person; the deletion page says so.

### Can users delete some or all data without deleting their account?
**Answer:** No.

---

## Section 2 - Data types

For every type below, the answer is either "Not collected" or a full block.
"Shared" uses Google's definition (transfer to another company). "Processing"
is ephemeral (used in memory only) or persistent (stored).

### Personal info - Name
**Collected:** No
**Shared:** No

### Personal info - Email address
**Collected:** Yes
**Shared:** No
**Processing:** Persistent (stored in the `profiles` table)
**Optional or required:** Required (sign-in is by email)
**Purposes:** Account management; App functionality

### Personal info - User IDs
**Collected:** Yes
**Shared:** No
**Processing:** Persistent (a Supabase account UUID identifies the user)
**Optional or required:** Required
**Purposes:** Account management; App functionality

### Personal info - Address, Phone number, Race and ethnicity, Political or religious beliefs, Sexual orientation, Other personal info
**Collected:** No
**Shared:** No

### Financial info - Payment info, Purchase history, Credit score, Other financial info
**Collected:** No
**Shared:** No
**Why:** The Android app has no payment flow, no in-app purchases, and no billing
SDK. All subscription billing happens only on the website and is intentionally
excluded from the Android build, so the app collects no financial data.

### Health and fitness - Health info, Fitness info
**Collected:** No
**Shared:** No

### Messages - Emails, SMS or MMS, Other in-app messages
**Collected:** No
**Shared:** No
**Note:** The app has no messaging feature. Generated listing text is declared
below under App activity as user-generated content, not as messages.

### Photos and videos - Photos
**Collected:** Yes
**Shared:** Yes
**Processing:** Persistent (the submitted photo is stored in `generations.image_url`)
**Optional or required:** Required (a photo is the core input of the app)
**Purposes:** App functionality
**Shared with / why:** Each product photo is transmitted to Google (Gemini API)
to generate the listing content.
**Note on the "Shared" answer:** Play's definition lets transfers to a service
provider that processes data on the developer's behalf be declared as not shared.
Google's AI API arguably fits that exception. This pack declares "Shared: Yes"
deliberately, as the safer and more transparent choice, since user photos do
leave the app and reach another company. Keep it as Yes unless you have a
specific reason to change it.

### Photos and videos - Videos
**Collected:** No
**Shared:** No

### Audio files - Voice or sound recordings, Music files, Other audio files
**Collected:** No
**Shared:** No

### Files and docs
**Collected:** No
**Shared:** No
**Note:** Picking an existing image from the gallery is covered under Photos
above. The app does not access documents or other files.

### Calendar - Calendar events
**Collected:** No
**Shared:** No

### Contacts
**Collected:** No
**Shared:** No

### App activity - Other user-generated content
**Collected:** Yes
**Shared:** Yes
**Processing:** Persistent (generated titles, descriptions, captions, and history
are stored in the `generations` table)
**Optional or required:** Required
**Purposes:** App functionality
**Shared with / why:** A refine instruction the user types, with the current
listing text, is sent to Google (Gemini API) to rewrite the listing. Declared
"Shared: Yes" for the same reason as Photos below.

### App activity - App interactions
**Collected:** Yes
**Shared:** No
**Processing:** Persistent (one `usage_events` row per generate or refine call:
time, route, outcome, model, token counts, linked to the user id until the
account is deleted)
**Optional or required:** Required
**Purposes:** Analytics (measuring how much the AI feature is used and what it
costs); App functionality

### App activity - In-app search history, Installed apps, Other actions
**Collected:** No
**Shared:** No

### Web browsing - Web browsing history
**Collected:** No
**Shared:** No

### App info and performance - Crash logs, Diagnostics, Other app performance data
**Collected:** No
**Shared:** No
**Why:** There is no crash-reporting or performance-monitoring SDK in the app.

### Device or other IDs - Device or other IDs
**Collected:** No
**Shared:** No
**Why:** No advertising ID and no device identifiers are collected. Authentication
uses a session token tied to the account, not a device ID, and there is no
analytics or ads SDK that would collect one.
**Note on the sign-up bot check:** Cloudflare Turnstile reads the client IP
address, a TLS fingerprint and the User-Agent header during sign-up (Cloudflare's
own privacy addendum). None of these is in Play's list for this type ("an IMEI
number, MAC address, Widevine Device ID, Firebase installation ID, or
advertising identifier"), Play files an IP address under "Approximate location"
only when location is inferred from it, which neither the app nor the check
does, and Cloudflare processes the signals on the app's behalf as a service
provider. So no data type is added for it; Cloudflare is named as a service
provider in Section 3 and in the privacy policy. If a reviewer asks, the honest
answers are: purpose "Fraud prevention, security, and compliance"; required (an
account cannot be created without passing the check); processed ephemerally by
the app (nothing from the check is stored; the sign-up cap stores only a hash of
the address, which expires with its window).

---

## Section 3 - Summary of everything declared as collected

| Data type | Collected | Shared | Processing | Required | Purpose |
|---|---|---|---|---|---|
| Email address | Yes | No | Persistent | Required | Account management, App functionality |
| User IDs | Yes | No | Persistent | Required | Account management, App functionality |
| Photos | Yes | Yes (Google AI API) | Persistent | Required | App functionality |
| Other user-generated content | Yes | Yes (Google AI API) | Persistent | Required | App functionality |
| App interactions | Yes | No | Persistent | Required | Analytics, App functionality |

Everything not in this table is declared "Not collected". In particular,
"Device or other IDs" is NOT collected: the account UUID is a user ID and is
declared above under Personal info - User IDs.

Service providers that process data on the app's behalf, and are therefore not
declared as "shared": Supabase (database and authentication), Vercel (hosting),
Cloudflare Turnstile (the sign-up bot check, see the note under "Device or other
IDs"), and Resend, which delivers the account emails (password resets; sign-up
confirmation is off). Resend receives the recipient's email address and the
message content for that purpose only. Its Data Processing Addendum (updated
2025-12-31) states "Company is a processor" and, for the data: "At a minimum,
this includes metadata, email address and message content." Resend is set as
the custom SMTP provider in the Supabase project (Authentication > SMTP
Settings; not readable from this repo), sending as noreply@unicornapps.app.
If that setting ever changes, this paragraph and the privacy policy's section
04 change with it.

---

## Section 4 - Notes for related Console questions (outside the Data Safety form)

- **Ads:** The app shows no ads. Declare "No, my app does not contain ads".
- **AI-generated content:** The app generates content with AI. Answer the
  generative-AI question honestly and confirm there is a way for users to flag
  content. Adding an in-app report link is still recommended (see
  RESUME_PLAY_PUBLISH.md section 10).
- **Account creation:** The app supports account creation (email and password),
  which is why the account deletion URL above is required.
- **Payments:** None of Paddle, its scripts, or any price is reachable from the
  Android app, so nothing about payments belongs in this form.
