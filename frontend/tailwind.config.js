/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0e8ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e1b4b',
        },
        prisma: {
          teal: '#0d9488',
          cyan: '#06b6d4',
          indigo: '#4f46e5',
          violet: '#7c3aed',
        }
      }
    },
  },
  plugins: [],
}
