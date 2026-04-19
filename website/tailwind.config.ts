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
        // Meet Without Fear brand colors - warm dark theme
        background: '#0b1220', // Deeper warm-navy (was #0f172a)
        'background-elevated': '#121a2b',
        foreground: '#f5ede0', // Cream-ish primary text (warmer than pure slate)
        card: '#141c2d', // Slightly warmer card
        'card-foreground': '#f5ede0',
        border: '#283044',
        muted: '#475569',
        'muted-foreground': '#9aa4b8',
        // Brand colors from palette
        'brand-navy': '#2d4a7c', // Deep navy blue
        'brand-blue': '#5ba4d9', // Sky blue (left bubble)
        'brand-cyan': '#5ba4d9', // Alias for compatibility
        'brand-orange': '#f5a623', // Amber orange (right bubble)
        'brand-gold': '#f5a623', // Alias for compatibility
        'brand-cream': '#f5e6d3', // Light cream accent
        accent: '#f5a623',
        'accent-foreground': '#0b1220',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-display)', 'Calistoga', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #2d4a7c 0%, #5ba4d9 25%, #f5a623 75%, #f5e6d3 100%)',
        'gradient-top': 'linear-gradient(90deg, #2d4a7c 0%, #5ba4d9 30%, #f5a623 70%, #f5e6d3 100%)',
        'gradient-swoosh': 'linear-gradient(90deg, #2d4a7c 0%, #5ba4d9 40%, #f5a623 100%)',
      },
      keyframes: {
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '50%': { transform: 'translate3d(-2%, 2%, 0) scale(1.08)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translate3d(0, 8px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
      },
      animation: {
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'fade-up': 'fade-up 600ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
