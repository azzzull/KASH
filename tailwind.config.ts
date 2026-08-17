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
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
