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
        ink:     { DEFAULT: '#0d0d0f', 1: '#151517', 2: '#202024', 3: '#29292f' },
        magenta: { DEFAULT: '#e84d85', dark: '#c23b6b' },
        acid:    { DEFAULT: '#b8d957', dark: '#8faa3f' },
        ice:     { DEFAULT: '#6bbfdf' },
        bone:    { DEFAULT: '#f1ede8' },
        // ── Legacy alias (was orange) ────────────────────────────────
        brand:   { 500: '#e84d85', 600: '#c23b6b' },
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
