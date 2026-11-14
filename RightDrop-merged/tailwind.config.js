/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Elderly-friendly calm healthcare palette:
        // Soft sage green (primary brand & confirmation)
        sage: {
          50: '#f4f8f5',
          100: '#e5f0e8',
          200: '#cce2d2',
          300: '#a7ceb2',
          400: '#7cb58c',
          500: '#5a996c',
          600: '#457c54',
          700: '#386344',
          800: '#2f4f38',
          900: '#27412f',
        },
        // Warm off-white & sand neutrals
        sand: {
          50: '#fdfcf9',
          100: '#f7f4ee',
          200: '#eee8dc',
          300: '#ded4c1',
          400: '#c8b89e',
          500: '#b29c7d',
          600: '#9b8265',
        },
        // Muted blue for camera & verification
        mutedblue: {
          50: '#f2f7fa',
          100: '#e3eff4',
          200: '#c9dfe9',
          300: '#a0c6d7',
          400: '#6ea6c1',
          500: '#4d8ba9',
          600: '#3d6f88',
          700: '#345b6f',
          800: '#2f4c5c',
        },
        // Subtle lavender for AI Assistant
        lavender: {
          50: '#f8f7fa',
          100: '#f0ecf4',
          200: '#e2dbe9',
          300: '#cdbfd8',
          400: '#b29ec2',
          500: '#977ea9',
          600: '#7c628e',
          700: '#675176',
          800: '#554361',
        },
        // Primary alias pointing to sage for consistency
        primary: {
          50: '#f4f8f5',
          100: '#e5f0e8',
          200: '#cce2d2',
          300: '#a7ceb2',
          400: '#7cb58c',
          500: '#5a996c',
          600: '#457c54',
          700: '#386344',
          800: '#2f4f38',
          900: '#27412f',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.6875rem',
      },
    },
  },
  plugins: [],
}
