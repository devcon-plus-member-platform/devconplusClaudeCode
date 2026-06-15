/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out',
      },
      colors: {
        // Themeable primary — driven by CSS custom properties set per program theme
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          dark:    'rgb(var(--color-primary-dark) / <alpha-value>)',
        },
        // Legacy alias — kept for explicit non-themed blue usage
        blue: {
          DEFAULT: '#1152D4',
          dark: '#0D42AA',
          light: '#6099F4',
        },
        navy: '#1E2A56',
        gold: '#F8C630',
        amber: '#D97706',
        promoted: '#F97316',
        green: '#21C45D',
        red: '#EF4444',
        slate: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          700: '#334155',
          900: '#0F172A',
        },
      },
      fontFamily: {
        sans: ['"Proxima Nova"', 'system-ui', 'sans-serif'],
        proxima: ['"Proxima Nova"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '20px',
        '2xl': '24px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.07)',
        blue: '0 4px 24px rgba(17,82,212,0.12)',
        primary: 'var(--shadow-primary)',
      },
      // ── Material Design 3 Type Scale ────────────────────────────────────
      // Additive tokens only — existing classes are unchanged.
      // Usage: text-md3-body-md, text-md3-title-lg, etc.
      // Each tuple: [fontSize, { lineHeight, letterSpacing }]
      fontSize: {
        'md3-display-lg':  ['3.5625rem',  { lineHeight: '4rem',    letterSpacing: '-0.015625rem' }],
        'md3-display-md':  ['2.8125rem',  { lineHeight: '3.25rem', letterSpacing: '0' }],
        'md3-display-sm':  ['2.25rem',    { lineHeight: '2.75rem', letterSpacing: '0' }],
        'md3-headline-lg': ['2rem',       { lineHeight: '2.5rem',  letterSpacing: '0' }],
        'md3-headline-md': ['1.75rem',    { lineHeight: '2.25rem', letterSpacing: '0' }],
        'md3-headline-sm': ['1.5rem',     { lineHeight: '2rem',    letterSpacing: '0' }],
        'md3-title-lg':    ['1.375rem',   { lineHeight: '1.75rem', letterSpacing: '0' }],
        'md3-title-md':    ['1rem',       { lineHeight: '1.5rem',  letterSpacing: '0.009375rem' }],
        'md3-title-sm':    ['0.875rem',   { lineHeight: '1.25rem', letterSpacing: '0.00625rem' }],
        'md3-body-lg':     ['1rem',       { lineHeight: '1.5rem',  letterSpacing: '0.03125rem' }],
        'md3-body-md':     ['0.875rem',   { lineHeight: '1.25rem', letterSpacing: '0.015625rem' }],
        'md3-body-sm':     ['0.75rem',    { lineHeight: '1rem',    letterSpacing: '0.025rem' }],
        'md3-label-lg':    ['0.875rem',   { lineHeight: '1.25rem', letterSpacing: '0.00625rem' }],
        'md3-label-md':    ['0.75rem',    { lineHeight: '1rem',    letterSpacing: '0.03125rem' }],
        'md3-label-sm':    ['0.6875rem',  { lineHeight: '1rem',    letterSpacing: '0.03125rem' }],
      },
    },
  },
  plugins: [],
}
