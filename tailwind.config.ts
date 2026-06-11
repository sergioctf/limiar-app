import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand — Limiar dark + amber-orange
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",   // primary orange
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        // Dark surface — neutral black/zinc (no blue tint)
        surface: {
          900: "#0a0a0a",   // page bg — near black
          800: "#141414",   // card bg
          700: "#232323",   // elevated card / border
          600: "#3a3a3a",   // muted input bg
          500: "#6b6b6b",   // muted text
          400: "#9a9a9a",   // secondary text
          300: "#d4d4d4",   // primary text (on dark)
          200: "#e8e8e8",
          100: "#f5f5f5",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
        "gradient-dark": "linear-gradient(180deg, #141414 0%, #0a0a0a 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in-up": "slideInUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "slide-in-down": "slideInDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "scale-in": "fadeInScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "shimmer": "shimmer 2s ease-in-out infinite",
        "pulse-smooth": "pulse-smooth 2s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInDown: {
          "0%": { transform: "translateY(-20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeInScale: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "pulse-smooth": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
      },
      spacing: {
        "safe": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [
    function ({ addUtilities }: { addUtilities: Function }) {
      addUtilities({
        ".pb-safe": {
          "padding-bottom": "env(safe-area-inset-bottom)",
        },
        ".pt-safe": {
          "padding-top": "env(safe-area-inset-top)",
        },
        ".pl-safe": {
          "padding-left": "env(safe-area-inset-left)",
        },
        ".pr-safe": {
          "padding-right": "env(safe-area-inset-right)",
        },
      });
    },
  ],
};
export default config;
