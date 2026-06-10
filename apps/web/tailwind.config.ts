import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ecfdf5",
          100: "#d4f5e8",
          200: "#a8e8d0",
          300: "#6fd4b0",
          400: "#3bc493",
          500: "#0a9b6e",
          600: "#088a62",
          700: "#067a56",
          800: "#055f44",
          900: "#044a36",
          950: "#022e22",
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
        soft: "var(--shadow-sm)",
      },
    },
  },
  plugins: [],
};

export default config;
