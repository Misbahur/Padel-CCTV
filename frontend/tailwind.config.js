/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        padel: {
          dark: '#07121E',
          surface: '#0E2135',
          card: '#142C44',
          border: '#1E3E5F',
          volt: '#D4FF00', // Electric lime
          voltHover: '#BCE600',
          cyan: '#00D8F6',
          ball: '#E2F700',
        }
      },
      fontFamily: {
        score: ['"Barlow Condensed"', 'sans-serif'],
        ui: ['Barlow', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      }
    },
  },
  plugins: [],
}
