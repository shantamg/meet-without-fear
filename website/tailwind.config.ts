import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Meet Without Fear brand colors (dark mode first)
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        card: '#171717',
        'card-foreground': '#e5e5e5',
        border: '#262626',
        muted: '#525252',
        'muted-foreground': '#a3a3a3',
        accent: '#c2410c', // Orange accent
        'accent-foreground': '#ffffff',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
