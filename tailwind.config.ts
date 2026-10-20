import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Class strings also live in modules here (lib/dashboard-banner.ts); a
    // class only this folder names is otherwise never generated.
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // ── UnicornApps design tokens (Phase 1 foundation) ──────────────────
        // RGB triplets defined in globals.css :root, consumed with alpha support
        // (bg-surface, bg-brand/90, …). Additive and non-colliding
        // with the shadcn HSL tokens below; unused classes emit no CSS (Tailwind
        // JIT), so this block is inert until a page opts in. See docs/DESIGN-TOKENS.md.
        surface: "rgb(var(--ua-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--ua-surface-2) / <alpha-value>)",
        brand: "rgb(var(--ua-brand) / <alpha-value>)",
        gold: "rgb(var(--ua-gold) / <alpha-value>)",
        // ── Semantic tier (globals.css "Semantic tier") ─────────────────────
        // Role names whose values live in globals.css. Surfaces and lines are
        // complete colour values, so bg-panel / border-line take no /alpha
        // modifier; fg-* and focus are triplets and do. Names avoid the shadcn
        // keys (card, muted, …).
        page: "var(--ua-page)",
        panel: "var(--ua-panel)",
        row: "var(--ua-row)",
        chip: "var(--ua-chip)",
        tile: "var(--ua-tile)",
        field: "var(--ua-field)",
        line: {
          DEFAULT: "var(--ua-line)",
          soft: "var(--ua-line-soft)",
        },
        fg: {
          DEFAULT: "rgb(var(--ua-fg) / <alpha-value>)",
          body: "rgb(var(--ua-fg-body) / <alpha-value>)",
          muted: "rgb(var(--ua-fg-muted) / <alpha-value>)",
          faint: "rgb(var(--ua-fg-faint) / <alpha-value>)",
          link: "rgb(var(--ua-fg-link) / <alpha-value>)",
          "on-brand": "rgb(var(--ua-fg-on-brand) / <alpha-value>)",
          "on-light": "rgb(var(--ua-fg-on-light) / <alpha-value>)",
        },
        focus: "rgb(var(--ua-focus) / <alpha-value>)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        card: "var(--ua-radius-card)",
        row: "var(--ua-radius-row)",
        icon: "var(--ua-radius-icon)",
        input: "var(--ua-radius-input)",
        pill: "var(--ua-radius-pill)",
      },
      backgroundImage: {
        "fill-btn": "var(--ua-fill-btn)",
        "fill-btn-hover": "var(--ua-fill-btn-hover)",
        "fill-ghost": "var(--ua-fill-ghost)",
        "fill-tap": "var(--ua-fill-tap)",
        "fill-icon": "var(--ua-fill-icon)",
        "fill-credits": "var(--ua-fill-credits)",
        "fill-on-credits": "var(--ua-fill-on-credits)",
        "fill-danger": "var(--ua-fill-danger)",
        "page-image": "var(--ua-page-image)",
      },
      fontFamily: {
        head: "var(--ua-font-head)",
        body: "var(--ua-font-body)",
      },
      fontSize: {
        display: ["var(--ua-text-display)", { lineHeight: "var(--ua-leading-display)" }],
        title: ["var(--ua-text-title)", { lineHeight: "var(--ua-leading-title)" }],
        "page-title": ["var(--ua-text-page-title)", { lineHeight: "var(--ua-leading-page-title)" }],
      },
      boxShadow: {
        // Semantic shadows (globals.css): a lit top rim, a dark inner shade and
        // a tight black contact shadow. No coloured glow anywhere.
        container: "var(--ua-shadow-container)",
        tap: "var(--ua-shadow-tap)",
        icon: "var(--ua-shadow-icon)",
        btn: "var(--ua-shadow-btn)",
        ghost: "var(--ua-shadow-ghost)",
        well: "var(--ua-shadow-well)",
        credits: "var(--ua-shadow-credits)",
        mark: "var(--ua-shadow-mark)",
        "on-credits": "var(--ua-shadow-on-credits)",
        danger: "var(--ua-shadow-danger)",
      },
    },
  },
  plugins: [],
};
export default config;
