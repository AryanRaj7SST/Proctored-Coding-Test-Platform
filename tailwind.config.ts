import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0d12',
          900: '#0f131a',
          850: '#141922',
          800: '#1a2029',
          700: '#232b36',
          600: '#2f3947',
          500: '#3d4959',
        },
        brand: {
          50: '#eef4ff',
          100: '#dbe6ff',
          300: '#8fb2ff',
          500: '#3b7dff',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        ok: '#2ea36b',
        warn: '#d99a20',
        bad: '#e05252',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { 'fade-in': 'fade-in .18s ease-out', shimmer: 'shimmer 1.4s infinite' },
    },
  },
  plugins: [],
};
export default config;
