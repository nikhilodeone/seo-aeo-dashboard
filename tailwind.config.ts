import type { Config } from "tailwindcss";

const v = (name: string) => `var(--${name})`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plane: v("plane"),
        surface: v("surface"),
        line: v("line"),
        ink: v("ink"),
        ink2: v("ink-2"),
        ink3: v("ink-3"),
        accent: v("accent"),
        "accent-soft": v("accent-soft"),
        rail: v("rail"),
        good: v("good"),
        "good-ink": v("good-ink"),
        warn: v("warn"),
        serious: v("serious"),
        crit: v("crit"),
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk Variable"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.2rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
      },
    },
  },
  plugins: [],
};
export default config;
