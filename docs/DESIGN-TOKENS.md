# UnicornApps — Design Tokens (public-UI redesign)

> **Status (corrected 2026-07-17):** Phase 1 foundation, **partially adopted**. The earlier
> wording here — *"applied to no existing page yet"* — became **FALSE** on 2026-07-09 when the
> legal redesign shipped, and was never updated. **Actual adoption today:**
> - **`src/components/legal/LegalDoc.tsx` — FULL** (~20 token classes: `bg-surface`, `text-brand`,
>   `text-ink-*`, `bg-surface-2/40`, …). It renders `/privacy`, `/terms`, `/refund`, so the tokens
>   are **live in production on three pages** via PRs #26/#27.
> - **`src/components/Navbar.tsx` — PARTIAL:** `text-ink-2` / `text-ink-1` only, sitting **alongside
>   raw `violet-400/500`** — a half-migrated component.
> - **`src/app/globals.css` — `body` only** (`background`/`color`).
> - **Every other page — ZERO.**
> 🔴 **CONSEQUENCE — TWO BRAND PURPLES ARE LIVE IN PRODUCTION.** `LegalDoc` applies
> `brand` = **`#635BFF`**; every other public page still uses **`#7c3aed` / `#a855f7` / `#8b5cf6`**.
> **`#635BFF` shipped in the foundation PR BEFORE the Phase 1 identity question ("keep Royal
> Obsidian, or change direction") was ever answered** — the answer shipped before the question.
> **Do not treat `#635BFF` as decided.** Per-page migration onto these tokens is a later phase.
> This file is the living reference for those phases.

## Mechanism

- **Source of truth:** CSS custom properties in `src/app/globals.css` `:root`, stored as
  **space-separated RGB channel triplets** (e.g. `--ua-brand: 99 91 255;`).
- **Consumption:** mapped in `tailwind.config.ts` `theme.extend.colors` as
  `rgb(var(--ua-x) / <alpha-value>)`, which yields ergonomic utilities **with alpha
  support** — `bg-surface`, `text-brand`, `border-ink-0/10`, `bg-brand/20`, etc.
- **Namespacing:** CSS vars are prefixed `--ua-*` so they never collide with the legacy
  brand vars (`--obsidian`, `--violet`, `--gold`, …) or the shadcn HSL tokens
  (`--background`, `--primary`, …), both of which are left **exactly as-is** this phase.
  The Tailwind class names are the clean short forms (`surface`, `brand`, `ink-0`, …).
- **Inert until used:** Tailwind JIT emits a utility's CSS only when the class appears in
  scanned source, so defining these tokens adds **no CSS and no visual change** until a
  page opts in.
- **Why RGB (not HSL like the shadcn tokens):** RGB triplets are pixel-exact to the brand
  hex (`#635BFF` → `99 91 255`); HSL would force rounding on the brand color. The existing
  shadcn tokens stay HSL and untouched.

## Token map

| Tailwind class | CSS var | RGB | Hex | Eventually replaces |
|---|---|---|---|---|
| `surface` | `--ua-surface` | `7 7 16` | `#070710` | every `bg-[#070710]`; already wired on `body` |
| `surface-2` | `--ua-surface-2` | `13 13 26` | `#0d0d1a` | `bg-[#0d0d1a]` raised panels |
| `brand` | `--ua-brand` | `99 91 255` | `#635BFF` | **(per-page)** the multiple on-page violets — `violet-600`, `#7c3aed`, `#a855f7`, `#8b5cf6`, `rgba(124,58,237,…)`, **and decorative `indigo-*`/`amber-*` icon hues** (see decorative-vs-functional note below) |
| `brand-glow` | `--ua-brand-glow` | `99 91 255` | `#635BFF` | the scattered glow COLOR inside button shadows — every `rgba(124,58,237,α)`. **Color only; geometry stays per-element** (see the glow convention below) |
| `ink-0` | `--ua-ink-0` | `255 255 255` | `#ffffff` | `text-white`; white-based overlays/borders via `/alpha` |
| `ink-1` | `--ua-ink-1` | `200 207 224` | `#c8cfe0` | `text-[#c8cfe0]`; already wired on `body` text |
| `ink-2` | `--ua-ink-2` | `148 163 184` | `#94a3b8` | `text-slate-400` |
| `ink-3` | `--ua-ink-3` | `100 116 139` | `#64748b` | `text-slate-500` |
| `ink-4` | `--ua-ink-4` | `71 85 105` | `#475569` | `text-slate-600` |
| `gold` | `--ua-gold` | `232 200 122` | `#e8c87a` | **(per-page)** rare amber accents — note on-page amber is `#fbbf24`/`#f59e0b`, which **differs**; reconcile per-page |

**Values match the current live UI on purpose.** The `ink-*` scale aliases the greys
actually on screen today (Tailwind `slate-*` + `#c8cfe0`) so that per-page migration is
*visually invisible*. A bespoke cool-grey ramp derived from the base is a deliberate
design change deferred to a phase where visible change is sanctioned.

### The brand-glow convention (added with the landing consolidation, PR 1)

Buttons carry a violet glow as `shadow-[0_0_40px_-5px_rgba(124,58,237,0.5)]`. The scattered
thing is the **color** (`124,58,237`), not the geometry — blur/spread/alpha differ per element
and encode a deliberate hierarchy (a primary CTA glows harder than an inline one). So we
tokenize **only the color**, via `--ua-brand-glow`, and keep geometry inline:

- **Canonical button glow** (`0 0 40px -5px / 0.5`) → the `shadow-glow-brand` utility
  (`tailwind.config.ts` `boxShadow`).
- **Bespoke glows** (any other blur/spread/alpha) → inline
  `shadow-[<geometry> rgb(var(--ua-brand-glow)/<alpha>)]`.

One color source (`--ua-brand-glow`), retunable in one edit; geometry stays where it belongs.
A single fixed `shadow-glow-brand` for *all* glows was rejected — it would flatten the intensity
hierarchy into one silent value. `--ua-brand-glow` is aliased to `--ua-brand` today but kept
separate so glows can later shift to a lighter tint without touching every shadow.

### Decorative vs functional color (the governing rule for consolidation)

Consolidation collapses **decorative** hues onto `brand` and **preserves functional/semantic**
color:

- **Decorative → `brand`:** all `violet-*`, `indigo-*`, and the decorative `amber-*` icon/eyebrow
  hues (e.g. the landing feature-card icon sparkles). A one-accent site reads more confident than
  a three-hue mini-rainbow.
- **Functional → keep:** `emerald-*` where it signals the pricing **"recommended"** tier
  (`PricingClient.tsx` — UI meaning, not decoration), and `destructive`/red for destructive
  actions. These are *signals*, not brand accents.
- **Watch the ambiguity per page:** the landing Monitor-icon emerald was *decorative* (a card
  sparkle) and collapsed to `brand`; the pricing recommended-tier emerald is *functional* and
  stays. Same hue, opposite decision — decided by role, not by color.
- **Gold / `--ua-gold` stays reserved and unwired.** A warm secondary accent is a separate,
  deliberate future decision — **not** smuggled in via the decorative-amber collapse above.

### Applied (updated 2026-07-17)
- `body { background-color: rgb(var(--ua-surface)); color: rgb(var(--ua-ink-1)); }` —
  pixel-identical to the previous `#070710` / `#c8cfe0`; proves the pipeline end-to-end.
- **`LegalDoc.tsx` — full token adoption** (shipped PRs #26/#27, live on `/privacy`, `/terms`,
  `/refund`). This is where `brand` = `#635BFF` **first went live**, ahead of the Phase 1 call.
- **`page.tsx` (landing) — full brand-accent adoption** (PR 1 of the consolidation): all ~45
  on-page violets + decorative amber/emerald → `brand`; glows → `shadow-glow-brand` /
  `--ua-brand-glow`. **First page where `#635BFF` replaces the marketing violets — a VISIBLE
  recolor, gated on the operator's eye. Legacy `--violet*` :root vars deliberately left alive
  (other pages still use them until their own PR).** Surfaces/greys NOT migrated here (that is the
  separate item-17 concern).
- **`Navbar.tsx` — partial** (`text-ink-1`, `text-ink-2`; still mixes raw `violet-*`).
- ⚠️ **The original note here — *"Nothing else… applying `brand` would be a visible recolor"* — is
  now HALF-TRUE:** it is still true for the marketing pages (every on-page violet differs from
  `#635BFF`, so migrating them IS a visible recolor and a Phase-1-gated decision), but it is
  **false as a claim that `brand` is wired to nothing** — `LegalDoc` wired it, and those pages
  visibly recolored to `#635BFF` already.

## Semantic tier (added 2026-10-19, zero visible change)

The tokens above are a **palette** (values with ordinal names: `ink-0` … `ink-4`). The semantic
tier names **roles** on top of it, so the redesign retunes values in `globals.css` and never
hunts call sites. Every value below is **today's rendering**; `__tests__/design-tokens.test.ts`
pins each one, so a value can only change as a visible, reviewed edit to that table.

| Role | CSS var | Tailwind | Today |
|---|---|---|---|
| page background | `--ua-page` (+ `--ua-page-image`) | `bg-page`, `bg-page-image` | `#070710`, no image |
| section card (not tappable) | `--ua-panel` | `bg-panel` | white 3% |
| row / option inside a card | `--ua-row` | `bg-row` | white 5% |
| input field fill | `--ua-field` | `bg-field` | black 40% |
| hairline / fainter hairline | `--ua-line`, `--ua-line-soft` | `border-line`, `border-line-soft` | white 10% / 5% |
| headings | `--ua-fg` | `text-fg` | `ink-0` white |
| body copy | `--ua-fg-body` | `text-fg-body` | `ink-1` `#c8cfe0` |
| secondary copy | `--ua-fg-muted` | `text-fg-muted` | `ink-2` slate-400 |
| eyebrows, dates, captions | `--ua-fg-faint` | `text-fg-faint` | `ink-3` slate-500 (fails AA today, deliberately unchanged here) |
| brand text and links | `--ua-fg-link` | `text-fg-link` | `#635BFF` (fails AA on the page today, unchanged) |
| text on a brand fill | `--ua-fg-on-brand` | `text-fg-on-brand` | white |
| focus ring | `--ua-focus` | `ring-focus` | `#635BFF` |
| fills per tappable kind | `--ua-fill-{btn,ghost,tap,icon,credits}` | `bg-fill-*` | none |
| radii | `--ua-radius-{card,row,icon,input,pill}` | `rounded-{card,row,icon,input,pill}` | 24px, 16px, 16px, 16px, full |
| shadows | `--ua-shadow-{container,tap,icon,btn,ghost,well,credits,mark}` | `shadow-*` | none, except `btn` = `shadow-glow-brand` |
| font roles | `--ua-font-head`, `--ua-font-body` | `font-head`, `font-body` | inherit |
| type steps | `--ua-text-{display,title,page-title}` | `text-display`, `text-title`, `text-page-title` | 32→52px, 28→32px, 24→30px at `sm` |

**Rules of the tier**
- **Two value forms.** Foreground and focus are RGB triplets, so `text-fg/60` works. Surfaces,
  lines, fills, radii and shadows are **complete values** (several are translucent today), so
  `bg-panel/50` **emits nothing, silently**: compose alpha into the token, not the call site.
- **"No shadow" is `0 0 #0000`, never `none`.** Tailwind composes `box-shadow` as a list with the
  ring shadows; `none` inside a list voids the whole declaration and takes any ring with it.
- **Names avoid the shadcn keys** (`card`, `muted`, `accent`, …), which `components/ui` still
  uses, and a colour may not share a name with a shadow, size or image key (`shadow-<colour>`
  and `text-<colour>` would collide). The test enforces both.
- **`cn()` is taught the custom keys** (`src/lib/utils.ts`). Out of the box tailwind-merge reads
  an unknown `text-<name>` as a colour, so `cn("text-display text-fg")` dropped the size.
- **Wired today:** `body`, the `.model-html` colours, and the dashboard's shared
  `SURFACE` / `TILE` / `EYEBROW` (which the auth, account, status and marketing screens also
  compose). Everything else still uses raw utilities and moves screen by screen with the reskin.

**Not tokens, on purpose.** The Amazon and Shopify listing mock-ups and the Google sign-in button
reproduce someone else's UI and keep their own colours. Functional emerald (recommended tier) and
destructive red stay as they are.

**Outside CSS, so a token change does not reach them:** Paddle checkout `theme: 'dark'`
(`src/lib/checkout.ts`), Turnstile `theme: 'dark'`, `public/manifest.json` `#070710`, and the
Capacitor splash / status bar `#000000` (`capacitor.config.ts`; native, needs an app release).

## Typography

- **Latin:** Inter, via `next/font` in `layout.tsx` (unchanged).
- **Arabic:** `IBM_Plex_Sans_Arabic` now loaded via `next/font/google` —
  `subsets: ['arabic','latin']`, `weight: ['400','500','600','700']`,
  `variable: '--font-ibm-arabic'`, `display: 'swap'`, `preload: false`. Its `.variable`
  is on `<body>`; `.font-arabic` (toggled by `LanguageContext` when `lang==='ar'`) now
  resolves to `var(--font-ibm-arabic)` instead of a never-loaded literal.
  **This is the one intended visible change** (Arabic → real face).
- **Weight ceiling:** this family has no 900, so Arabic `font-black` clamps to 700. The
  Latin heavy-weight look can't be matched 1:1 in Arabic — expected, not a defect.

## Deferred — per-page migration sequence (later phases)

Each item is its own branch → PR → Vercel preview → merge; the app stays transitional
between items. **Lowest-risk first:**

1. **Violet consolidation → `brand`.** Order: **legal (privacy / terms / refund)** →
   **about** → **features** → **pricing** → **landing** (most Framer-Motion-heavy, last).
2. **Grey consolidation → `ink-*`** (`slate-*`, `#c8cfe0`, white overlays), per page.
3. **Surface consolidation** (`bg-[#070710]` → `bg-surface`) + componentize the duplicated
   orb/grid background effect (currently re-declared in about / features / pricing).
4. **De-gradient headlines** (remove `from-violet-…-to-amber-…` text gradients). No
   gradient token is being introduced.
5. **Typographic calming** (reduce `font-black`/`uppercase`/wide tracking), per page.
6. **Cross-cutting fixes**, each its own item: themed `not-found.tsx` (404 is currently
   default/unstyled), **language persistence** (currently resets to EN every load), `dir`
   on `<html>` (currently only on a wrapper div), footer unification.

## Separate cleanup — needs explicit approval, NOT bundled

- Delete dead `src/components/layout/Header.tsx` (never imported).
- Retire the legacy brand `:root` vars (`--obsidian`, `--violet`, `--gold`, `--silver`, …)
  once `surface`/`brand`/`ink`/`gold` supersede them, and collapse the two conflicting
  obsidian definitions (`#070710` vs the shadcn `--background: 222.2 84% 4.9%` ≈ `#080b12`).
