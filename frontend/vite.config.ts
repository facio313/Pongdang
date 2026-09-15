import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE_PATH ?? '/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: process.env.APP_API_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
})
