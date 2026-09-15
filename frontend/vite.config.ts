import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.APP_BASE_PATH ?? '/'

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      [`${base}api`]: { rewrite: path => base === '/' ? path : path.slice(base.length - 1), target: process.env.APP_API_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
})
