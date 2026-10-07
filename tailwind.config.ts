import type { Config } from "tailwindcss";

// Theme tokens are CSS variables (see src/app/globals.css) holding bare RGB
// channels, so Tailwind's opacity modifiers work: `bg-surface/60`.
function token(name: string) {
  return `rgb(var(--${name}) / <alpha-value>)`;
}

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "sans-serif"],
      },
      colors: {
        // Semantic surfaces/text — use these instead of raw zinc/white.
        base: token("base"), // page background
        surface: token("surface"), // cards, panels, modals
        "surface-muted": token("surface-muted"), // hover/secondary fill
        "surface-strong": token("surface-strong"), // pills, tracks
        // Borders are translucent HUD cyan — the holographic line-work.
        line: "rgb(92 225 255 / 0.13)", // hairline borders/dividers
        "line-strong": "rgb(92 225 255 / 0.26)", // input borders
        ink: token("ink"), // primary text
        "ink-soft": token("ink-soft"), // secondary text
        "ink-muted": token("ink-muted"), // meta text
        "ink-faint": token("ink-faint"), // disabled/placeholder
        glow: token("glow"), // HUD cyan for live/status signals
        // "JARVIS HUD" theme: accent = holographic cyan (the system color —
        // links, highlights, focus, primary actions). Amber/red = alerts only.
        accent: {
          50: "#e8fcff",
          100: "#c9f6ff",
          200: "#9aeeff",
          300: "#6ee6ff",
          400: "#3fd8f5",
          500: "#1bbfe0",
          600: "#0e97b8",
          700: "#0b7390",
        },
        // Alert red (Rejected, errors) — Stark HUD warning color.
        suit: {
          400: "#ff6b6b",
          500: "#f04848",
          600: "#c93636",
          700: "#9c2a2a",
        },
      },
      boxShadow: {
        card: "0 0 0 1px rgb(92 225 255 / 0.02) inset, 0 8px 22px -16px rgb(0 0 0 / 0.9)",
        "card-hover":
          "0 0 0 1px rgb(92 225 255 / 0.35), 0 0 18px -6px rgb(92 225 255 / 0.35)",
        // Holographic glow for primary buttons — kept soft for long sessions.
        glow: "0 0 16px -4px rgb(92 225 255 / 0.5)",
      },
      backgroundImage: {
        // Deep cyan hologram fill (monograms, New badge, active tab).
        "accent-gradient": "linear-gradient(135deg, #0b7390 0%, #0e97b8 50%, #1bbfe0 100%)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
