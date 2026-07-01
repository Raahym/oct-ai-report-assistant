import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        clinic: {
          50: "#eefbfb",
          100: "#d5f4f3",
          500: "#168f99",
          600: "#107783",
          700: "#0f6170"
        },
        cobalt: {
          500: "#2563eb",
          600: "#1d4ed8"
        }
      },
      boxShadow: {
        panel: "0 14px 35px rgba(21, 38, 66, 0.08)",
        soft: "0 6px 18px rgba(21, 38, 66, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
