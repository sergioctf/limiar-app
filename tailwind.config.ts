import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    /*
      `src/lib` também escreve classe.

      `session-colors.ts` guarda a cor de cada tipo de sessão — é de propósito
      que ela more numa lib, para a Hoje e o Treinador falarem a mesma língua.
      Só que o Tailwind nunca olhou essa pasta: as cores só funcionavam por
      coincidência, quando a mesma classe aparecia em algum componente.

      A que não aparecia era a do teste: `bg-pink-500` nunca entrou no CSS, e a
      sessão de teste ficava sem cor na agenda. Encontrado em 29/09, quando o
      teste de 3 km passou a aparecer na semana.
    */
    "./src/lib/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand — Limiar dark + amber-orange
        brand: {
          50:  "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "rgb(var(--color-brand-300) / <alpha-value>)",
          400: "rgb(var(--color-brand-400) / <alpha-value>)",
          500: "#f97316",   // primary orange
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        // Surface — semantic, not literal. 900 is always the page background and
        // 100 always the primary text; globals.css decides what those mean per
        // theme. The rgb(...) form is what keeps opacity modifiers working.
        surface: {
          900: "rgb(var(--color-surface-900) / <alpha-value>)",
          800: "rgb(var(--color-surface-800) / <alpha-value>)",
          700: "rgb(var(--color-surface-700) / <alpha-value>)",
          600: "rgb(var(--color-surface-600) / <alpha-value>)",
          500: "rgb(var(--color-surface-500) / <alpha-value>)",
          400: "rgb(var(--color-surface-400) / <alpha-value>)",
          300: "rgb(var(--color-surface-300) / <alpha-value>)",
          200: "rgb(var(--color-surface-200) / <alpha-value>)",
          100: "rgb(var(--color-surface-100) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
        "gradient-dark": "var(--gradient-surface)",
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
