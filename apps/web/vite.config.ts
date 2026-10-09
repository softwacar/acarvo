import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API is proxied under /api so the browser sees one origin: cookies stay
// host-only and SameSite, and no CORS is needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:3001' } },
  },
})
