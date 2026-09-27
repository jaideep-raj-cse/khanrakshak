/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Base surfaces
        bg: '#0B0F19',
        surface: '#0F172A',
        elevated: '#1E293B',
        border: {
          DEFAULT: '#334155',
          strong: '#475569',
        },
        text: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
        // Brand
        amber: {
          DEFAULT: '#F59E0B',
          hover: '#F59E0B',
          base: '#D97706',
          active: '#B45309',
        },
        // Risk semantics
        risk: {
          low: '#10B981',
          moderate: '#D97706',
          high: '#EA580C',
          critical: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        card: '8px',
        btn: '6px',
        input: '6px',
        modal: '8px',
      },
      boxShadow: {
        modal: '0 4px 12px rgba(0, 0, 0, 0.6)',
        hazard: '0 0 10px rgba(239, 68, 68, 0.25)',
      },
    },
  },
  plugins: [],
};
