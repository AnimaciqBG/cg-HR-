/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FDF8ED',
          100: '#FAF0D4',
          200: '#F5E0A8',
          300: '#EFCF7D',
          400: '#E4C072',
          500: '#D9B061',
          600: '#C49A4A',
          700: '#A47D38',
          800: '#8A6D3B',
          900: '#5C4A28',
          950: '#3B2F19',
        },
        quantum: {
          black: '#020202',
          gold: '#D9B061',
          bronze: '#8A6D3B',
          zinc: '#71717a',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '3rem',
      },
      backdropBlur: {
        '3xl': '64px',
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.7' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      boxShadow: {
        'gold': '0 0 20px rgba(217, 176, 97, 0.15)',
        'gold-lg': '0 0 40px rgba(217, 176, 97, 0.2)',
        'gold-glow': '0 0 60px rgba(217, 176, 97, 0.25)',
        'inner-gold': 'inset 0 1px 0 rgba(217, 176, 97, 0.1)',
      },
    },
  },
  plugins: [],
};
