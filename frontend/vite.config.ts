import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/v1': {
        target: 'http://127.0.0.1:8009',
        changeOrigin: true,
      },
      '/health-check': {
        target: 'http://127.0.0.1:8009',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/health-check/, '/'),
      },
    },
  },
})
