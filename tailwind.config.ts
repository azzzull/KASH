import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Mulish", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        kash: {
          emerald: "#10B981",
          emerald50: "#ECFDF5",
          emerald100: "#D1FAE5",
          emeraldDark: "#059669",
          emeraldPressed: "#047857",
          heroDark: "#064E3B",
          heroLight: "#059669",
          gold: "#FBBF24",
          selected: "#ECFDF5",
          income: "#10B981",
          expense: "#E50914",
          transfer: "#4F7DF3",
          savings: "#F5B82E",
          investment: "#8B5CF6",
          debt: "#F28C45",
          receivable: "#22B8A7",
        },
        surface: "#FAFBFC",
        slate: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CFD7E0",
          600: "#91A3BB",
          700: "#475569",
          900: "#0F172A",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.08)",
        card: "0 1px 3px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.03)",
        hero: "0 8px 32px rgba(6, 78, 59, 0.25), 0 2px 8px rgba(6, 78, 59, 0.1)",
        "card-hover": "0 2px 6px rgba(15, 23, 42, 0.06), 0 8px 20px rgba(15, 23, 42, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
