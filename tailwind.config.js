/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        // ── Pulse signal palette ─────────────────────────────────────
        ink:     { DEFAULT: '#0a0a0a', 1: '#111111', 2: '#1a1a1a', 3: '#232323' },
        magenta: { DEFAULT: '#ff1d6c', dark: '#d4185a' },
        acid:    { DEFAULT: '#d9ff36', dark: '#b3d324' },
        ice:     { DEFAULT: '#5ad7ff' },
        bone:    { DEFAULT: '#f4f4f4' },
        // ── Legacy alias (was orange) ────────────────────────────────
        brand:   { 500: '#ff1d6c', 600: '#d4185a' },
        // ── Surfaces ─────────────────────────────────────────────────
        surface: {
          DEFAULT: 'var(--surface)',
          2:       'var(--surface-2)',
          3:       'var(--surface-3)',
        },
      },
      letterSpacing: {
        tightest: '-0.04em',
        widest:   '0.22em',
      },
      borderRadius: {
        // Pulse is square — radius is for special cases only
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        full: '9999px',  // avatars + dots only
      },
    },
  },
  plugins: [],
}
