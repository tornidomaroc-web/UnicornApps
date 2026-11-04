# UnicornApps

> Product copy from one photo, in Arabic or English.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Gemini Vision](https://img.shields.io/badge/Gemini-Vision-yellow)](https://deepmind.google/technologies/gemini/)

Upload one product photo and get ready-to-paste product copy: a title,
description, bullet points, Shopify HTML and social captions, in Arabic or
English (one language per request).

## Features

- Generate copy from a product photo, then refine it
- Arabic (RTL) or English output, and an Arabic/English interface
- Shopify HTML and Amazon-style bullet points
- Credits, with Paddle billing
- Account deletion; signup abuse guards (Turnstile, rate limits)
- Android app via Capacitor (a wrapper around the website)

## Stack

`Next.js` · `TypeScript` · `Gemini` · `Supabase` · `Capacitor (Android)` · `Paddle` · `Vercel`

## Where to get it

- Web: [www.unicornapps.app](https://www.unicornapps.app)
- Android: [Google Play](https://play.google.com/store/apps/details?id=com.unicornappsai.app&hl=en)

## Run locally

```bash
npm install && npm run dev

# Mobile (Android)
npx cap sync android
npx cap open android
```

```env
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PADDLE_WEBHOOK_SECRET=
```

## Built by

[AboJad](https://github.com/tornidomaroc-web) — Full Stack AI Engineer, Marrakesh 🇲🇦
