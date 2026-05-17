# UnicornApps - Google Play Data Safety Answers

Copy-paste pack for the Play Console Data Safety form. Verified against the
actual codebase (Supabase schema, the generate/refine API routes, the Gemini
call, and the network requests in the app). Fill the Console section by section.

## Required URLs

- **Privacy policy URL:** https://unicorn-apps.vercel.app/privacy
- **Account & data deletion URL:** https://unicorn-apps.vercel.app/delete-account

---

## What the app actually does with data (verified facts)

- Sign-in is by email and password (Supabase Auth). Google sign-in is also offered.
- The `profiles` table stores: user id, email, credit balance, created date.
- The `generations` table stores: user id, the generated listing content, and
  `image_url` which holds the submitted product photo itself (base64). The photo
  is stored, not discarded.
- Each product photo is sent to the Google Gemini API for AI processing.
- There is no analytics SDK, no crash-reporting SDK, no advertising SDK, and no
  advertising ID usage anywhere in the app.
- The Android app contains no payment flow. Pricing and billing exist only on the
  website and are deliberately absent from the Android build.

---

## Section 1 - Data collection and security (overview)

### Does your app collect or share any of the required user data types?
**Answer:** Yes

### Is all of the user data collected by your app encrypted in transit?
**Answer:** Yes (all traffic to Supabase, Vercel, and the Google AI API uses HTTPS/TLS)

### Do you provide a way for users to request that their data is deleted?
**Answer:** Yes. Users delete their account and all associated data in-app from the
Account page. A public instructions page is also provided at
https://unicorn-apps.vercel.app/delete-account

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
**Shared:** No
**Processing:** Persistent (generated titles, descriptions, captions, and history
are stored in the `generations` table)
**Optional or required:** Required
**Purposes:** App functionality

### App activity - App interactions, In-app search history, Installed apps, Other actions
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

---

## Section 3 - Summary of everything declared as collected

| Data type | Collected | Shared | Processing | Required | Purpose |
|---|---|---|---|---|---|
| Email address | Yes | No | Persistent | Required | Account management, App functionality |
| User IDs | Yes | No | Persistent | Required | Account management, App functionality |
| Photos | Yes | Yes (Google AI API) | Persistent | Required | App functionality |
| Other user-generated content | Yes | No | Persistent | Required | App functionality |

Everything not in this table is declared "Not collected".

---

## Section 4 - Notes for related Console questions (outside the Data Safety form)

- **Ads:** The app shows no ads. Declare "No, my app does not contain ads".
- **AI-generated content:** The app generates content with AI. Answer the
  generative-AI question honestly and confirm there is a way for users to flag
  content. Adding an in-app report link is still recommended (see
  RESUME_PLAY_PUBLISH.md section 10).
- **Account creation:** The app supports account creation, which is why the
  account deletion URL above is required.
