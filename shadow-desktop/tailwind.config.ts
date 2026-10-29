import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
        // 注意：border / input / ring 的 CSS 变量自带 alpha
        // （暗色下是 12% 白），所以这三个**不能**用 <alpha-value> 形式 ——
        // 那会拼出 `hsl(0 0% 100% / 0.12 / 0.5)` 这种非法值，整条声明会被丢弃。
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground))",
        },
        // 主题色槽位 —— 用户可覆盖，默认中性。
        // 语义与 shadcn 的 `accent`（hover 底色）不同，别混用。
        brand: {
          DEFAULT: "hsl(var(--shadow-accent) / <alpha-value>)",
          foreground: "hsl(var(--shadow-accent-fg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "var(--shadow-radius-xl)",
        pill: "var(--shadow-radius-pill)",
      },
      // 全局统一光源方向（光源在左上，阴影一律朝右下）——
      // 两端叠在一起不打架的前提。数值来自 design-tokens.json。
      boxShadow: {
        sm: "var(--shadow-elevation-sm)",
        md: "var(--shadow-elevation-md)",
        lg: "var(--shadow-elevation-lg)",
        none: "none",
      },
      backdropBlur: {
        glass: "var(--shadow-glass-blur)",
        none: "0",
      },
      backdropSaturate: {
        glass: "var(--shadow-glass-saturation)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
};

export default config;
