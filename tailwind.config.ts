import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
        // (bg-surface, text-brand, border-ink-0/10, …). Additive and non-colliding
        // with the shadcn HSL tokens below; unused classes emit no CSS (Tailwind
        // JIT), so this block is inert until a page opts in. See docs/DESIGN-TOKENS.md.
        surface: "rgb(var(--ua-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--ua-surface-2) / <alpha-value>)",
        brand: "rgb(var(--ua-brand) / <alpha-value>)",
        ink: {
          0: "rgb(var(--ua-ink-0) / <alpha-value>)",
          1: "rgb(var(--ua-ink-1) / <alpha-value>)",
          2: "rgb(var(--ua-ink-2) / <alpha-value>)",
          3: "rgb(var(--ua-ink-3) / <alpha-value>)",
          4: "rgb(var(--ua-ink-4) / <alpha-value>)",
        },
        gold: "rgb(var(--ua-gold) / <alpha-value>)",
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
      },
    },
  },
  plugins: [],
};
export default config;
