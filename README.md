# UnicornApps — AI E-commerce Growth Architect

## Overview
UnicornApps is a production-ready, AI-powered e-commerce asset generation platform. It empowers sellers to instantly transform product photos into fully optimized, platform-specific listings for Amazon, Shopify, and social media. Using vision models, it generates high-converting SEO titles, metadata, feature bullets, multilingual content, and interactive mockups.

## Tech Stack
- Frontend: Next.js 14.2 (App Router) — Core React framework with Server Components
- Styling: Tailwind CSS & Framer Motion — Modern utility-first styling and fluid animations
- Backend/Database: Supabase — Serverless BaaS providing PostgreSQL, Auth, and Row Level Security
- AI Engine: Google Gemini 1.5 Pro/Flash Vision — Multimodal AI for dynamic image analysis and content generation
- Mobile: Capacitor 6 — Native wrapper for robust iOS and Android deployment from web code
- Payments: Lemon Squeezy — Merchant of record for subscriptions and credit-based monetization

## Project Structure
- `/src` — Core application code including frontend and API routes
  - `/src/app` — Next.js App Router containing pages, API routes, and layouts
  - `/src/components` — Reusable, atomic UI components (Radix/Tailwind)
  - `/src/lib` — Shared business logic, database clients, native bridges, and i18n
- `/android` — Generated native Android project for Capacitor
- `/node_modules` — Project dependencies

## Prerequisites
- Node.js (v18+)
- Supabase Account (for PostgreSQL database and Auth)
- Google AI Studio Account (for Gemini API key)
- Lemon Squeezy Account (for payment links and webhooks)
- Vercel Account (for serverless deployment)

## Environment Variables
| Variable Name | Description | Where to get it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public URL of the Supabase project | Supabase Dashboard > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anonymous API key for Supabase client | Supabase Dashboard > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret admin key to bypass RLS in secure server routes | Supabase Dashboard > API |
| `GEMINI_API_KEY` | API key to communicate with Google's Generative AI models | Google AI Studio |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Secret to sign and verify incoming payment webhooks | Lemon Squeezy > Webhooks |

## Local Development Setup
1. Clone the repository and navigate into the project root.
2. Run `npm install` to install all required dependencies.
3. Copy your project keys into a `.env.local` file at the root.
4. Run the Supabase schema script detailed in the Database Setup section.
5. Run `npm run dev` to start the local Next.js development server at `http://localhost:3000`.

## Deployment Guide
1. Push the local repository to GitHub.
2. In the Vercel Dashboard, select "Add New Project" and import the GitHub repository.
3. Navigate to the Environment Variables settings in Vercel and paste all variables found in your `.env.local`.
4. Deploy the project; Next.js 14 configurations are automatically detected.
5. Ensure that the deployed Vercel URL is added to the Supabase Authentication Redirect URLs settings.

## Mobile Build Guide
1. Ensure the web application builds successfully using `npm run build`.
2. Sync the web build with Capacitor architectures by running `npx cap sync`.
3. For Android: Run `npx cap open android` and build/deploy using Android Studio.
4. For iOS: Run `npx cap open ios` and build/deploy using Xcode.

## Database Setup
1. Create a new Supabase project in the Supabase Cloud dashboard.
2. Navigate to the SQL Editor and run the provided `supabase_schema.sql` file.
3. This creates the essential `profiles` and `generations` tables, establishes the Row Level Security (RLS) policies, and creates an automatic user trigger.
4. Ensure Email Auth is enabled in Supabase Authentication settings.

## Payment Integration
1. In Lemon Squeezy, navigate to Store settings and create a Webhook.
2. Set the Webhook URL to point to your live deployment: `https://your-domain.com/api/webhooks/lemonsqueezy`.
3. Generate a strong Webhook Secret and save it as `LEMON_SQUEEZY_WEBHOOK_SECRET` in Vercel.
4. Select the `order_created` event to subscribe to credit top-ups.
5. Test the integration using Lemon Squeezy's "Test Mode" to securely simulate checkouts.

## Architecture Notes
- **App Router Design Pattern**: Adopts standard Next.js 14 paradigms, keeping pure business logic (Supabase operations, AI orchestration) on the backend via Server Actions/API Routes to mask sensitive tokens.
- **Multimodal AI Strategy**: Passes base64 image data directly to Gemini APIs to skip intermediate bucket storage overhead, maximizing speed and cost-efficiency.
- **Cross-Platform Native Bridge**: Employs Capacitor to cleanly map native APIs (like Camera hardware), serving as a unified PWA and a hardware-accelerated iOS/Android app from one codebase.
- **Micro-transaction Scalability**: Leverages robust PostgreSQL triggers alongside high-availability webhook endpoints for real-time credit adjustments independent of frontend availability.
