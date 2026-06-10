import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf8",
          100: "#d4f5ea",
          200: "#a8ebd4",
          300: "#7dd9bd",
          400: "#5fd4ad",
          500: "#4ec9a0",
          600: "#3db88f",
          700: "#2d9a75",
          800: "#1a3d32",
          900: "#132a22",
          950: "#0d1510",
        },
        surface: {
          DEFAULT: "var(--surface)",
          hover: "var(--surface-hover)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        card: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};

export default config;
