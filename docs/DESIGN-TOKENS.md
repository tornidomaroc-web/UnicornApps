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

> **Clay Night (2026-10-19): the `brand-glow` and `ink-*` rows below are RETIRED** — removed from
> `globals.css` and `tailwind.config.ts` (`ink-4` failed contrast at 2.65:1). Call sites use the semantic tier
> further down; the table is kept as the record of the palette it replaced.

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

### The brand-glow convention — RETIRED (Clay Night skin, 2026-10-19)

There is no coloured glow anywhere any more, on the primary button or elsewhere. `shadow-glow-brand` and
`--ua-brand-glow` are gone. Depth comes from the semantic shadows below: a lit top rim, a dark shade inside the
bottom edge and a tight black contact shadow under the element.

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

## Semantic tier — Clay Night

The palette above holds raw values; the semantic tier names **roles**, and call sites use those. The role
names arrived with today's values first (zero visible change), then took the Clay Night values in one
reskin. `__tests__/design-tokens.test.ts` pins every value, so any change is a visible edit to that table.

| Role | Tailwind | Value |
|---|---|---|
| page background + wash | `bg-page`, `bg-page-image` | `#070710` + an indigo and a faint gold radial (on `<body>`) |
| section card (not tappable) | `bg-panel` + `shadow-container` | `#14142b` |
| static tile inside a card | `bg-tile` + `border-line` | white 3% with a 6% hairline |
| tappable row | `bg-row bg-fill-tap shadow-tap` | `#1c1c3d` under a `#26264f → #12122a` gradient |
| chip / label / icon tile fill | `bg-chip` | `#22224a` |
| input well | `bg-field shadow-well` | `#0e0e22`, inset shade only |
| hairlines | `border-line`, `border-line-soft` | white 6% / 4% |
| headings | `text-fg` | `#f4f2ff` |
| body copy | `text-fg-body` | `#c9c6e6` |
| secondary copy | `text-fg-muted` | `#a09cc4` |
| eyebrows, dates, captions | `text-fg-faint` | `#9490ba` |
| brand text and links | `text-fg-link` | `#a9a4ff` |
| text on a brand fill | `text-fg-on-brand` | white |
| focus outline | `ring-focus` / global `:focus-visible` | 3px `#a9a4ff`, offset 3px |
| fills | `bg-fill-{btn,btn-hover,ghost,tap,icon,credits}` | vertical gradients; the button hover is darker, never lighter |
| radii | `rounded-{card,row,icon,input,pill}` | 28 / 24 / 20 / 18 / full |
| shadows | `shadow-{container,tap,icon,btn,ghost,well,credits,mark}` | see `globals.css`; black outside, coloured only inside |
| heading face | `:where(h1,h2,h3)`, `font-head` | Rubik 700 (Latin + Arabic subsets, self-hosted by next/font) |

**Contrast (AA, 4.5:1), computed by `__tests__/design-contrast.test.ts`.** Every text token clears 4.5:1 on
every surface it may sit on, gradients checked at their lighter stop. The three failures the old greys had
are gone: eyebrows were 4.03:1 on a card (now `#9490ba`, ≥ 4.7:1), slate-600 was 2.65:1 (retired), brand text
was 4.27:1 on the page (now `#a9a4ff`, ≥ 6.4:1). White on the button is 4.7:1 at its lightest stop, which is
why the top stop must never get lighter, and why on-brand text stays white (`#f4f2ff` there is 4.25:1).
Faint text must not go on a ghost button (4.1:1).

**Shared recipes** (`src/app/dashboard/surface.ts`): `SURFACE` (card, soft depth), `BLOCK` (the same card
kept flat, for generated results), `TILE` (static, hairline), `ROW` (tappable clay), `EYEBROW` (no
uppercase, no letter-spacing). Primary button = `bg-brand bg-fill-btn shadow-btn hover:bg-fill-btn-hover
press text-fg-on-brand`; ghost = `bg-chip bg-fill-ghost shadow-ghost text-fg-link press`.

**Rules of the tier**
- **Two value forms.** Foreground and focus are RGB triplets (`text-fg/60` works). Surfaces, lines, fills,
  radii and shadows are complete values, so `bg-panel/50` **emits nothing, silently**.
- **"No shadow" is `0 0 #0000`, never `none`** (`none` inside Tailwind's composed shadow list voids it).
- **No coloured glow, no horizontal offset** (tests enforce both): light comes from above, so nothing mirrors.
- **Clay only on what you tap** (buttons, rows, icon tiles, quick actions, the credits card). Containers get
  the soft container shadow; result blocks get none; chips and labels get a hairline at most.
- **Every gradient sits on a flat background colour**, which is what lite mode shows.
- **The heading stack is declared on `[dir]`, not `:root`**: next/font defines `--font-rubik*` on the language
  wrapper, and a custom property resolves where it is declared.
- **Names avoid the shadcn keys** and each other (a colour sharing a name with a shadow, size or image key
  collides); **every custom key is also registered in `cn()`** (`src/lib/utils.ts`). Tests enforce both.
- **Press feedback is the `press` utility** (transform only, honours reduced motion). Never animate box-shadow.

**Lite mode** (`src/lib/lite-mode.ts`). On a low-memory device the shadows lose their blur and the gradients
and wash are dropped, with the same layout. Trigger: `navigator.deviceMemory <= 2`; where that API is missing
(**it is missing in Android WebView**, so in the app), an Android device with ≤ 4 cores. Applied before first
paint through `document.adoptedStyleSheets` (no element, no attribute, no hydration effect).
`localStorage.ua_lite = '1' | '0'` forces it for testing.

**Not tokens, on purpose.** The Amazon and Shopify listing mock-ups and the Google and Apple buttons reproduce
someone else's UI. Functional emerald, amber and red banners keep their tones.

**Outside CSS, so a token change does not reach them:** Paddle checkout `theme: 'dark'`, Turnstile
`theme: 'dark'`, `public/manifest.json` `#070710`, and the Capacitor splash / status bar `#000000` (native,
needs an app release).

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
