# UnicornApps

> AI content engine for e-commerce sellers — product listings at scale.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Gemini Vision](https://img.shields.io/badge/Gemini-Vision-yellow)](https://deepmind.google/technologies/gemini/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android%2FiOS-blue)](https://capacitorjs.com/)

Take a product photo. Get Arabic + English listings, descriptions,  
and social captions — ready to publish in seconds.

## Features

- Camera capture → instant AI content generation
- Bilingual output: Arabic (RTL) + English
- Optimized for Gulf e-commerce (Noon, Amazon.ae, Shopify)
- Android + iOS via Capacitor
- Paddle payments — Pro tier (web only; the Android app ships free)

## Stack

`Next.js` · `Gemini Vision` · `Supabase` · `Capacitor` · `Paddle` · `Vercel`

## Live

🌐 [www.unicornapps.app](https://www.unicornapps.app)

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
