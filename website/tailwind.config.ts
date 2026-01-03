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
        // Meet Without Fear brand colors - Blue & Orange theme
        background: '#0f172a', // Dark navy
        foreground: '#f1f5f9',
        card: '#1e293b', // Slightly lighter navy
        'card-foreground': '#f1f5f9',
        border: '#334155',
        muted: '#475569',
        'muted-foreground': '#94a3b8',
        // Brand colors from palette
        'brand-navy': '#2d4a7c', // Deep navy blue
        'brand-blue': '#5ba4d9', // Sky blue (left bubble)
        'brand-cyan': '#5ba4d9', // Alias for compatibility
        'brand-orange': '#f5a623', // Amber orange (right bubble)
        'brand-gold': '#f5a623', // Alias for compatibility
        'brand-cream': '#f5e6d3', // Light cream accent
        accent: '#f5a623', // Primary accent is amber orange
        'accent-foreground': '#0f172a',
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #2d4a7c 0%, #5ba4d9 25%, #f5a623 75%, #f5e6d3 100%)',
        'gradient-top': 'linear-gradient(90deg, #2d4a7c 0%, #5ba4d9 30%, #f5a623 70%, #f5e6d3 100%)',
        'gradient-swoosh': 'linear-gradient(90deg, #2d4a7c 0%, #5ba4d9 40%, #f5a623 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
