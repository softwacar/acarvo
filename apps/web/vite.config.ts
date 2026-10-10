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
    // xfwd passes the browser's address to the API (trusted there as a loopback proxy). The target can be
    // pointed at a separate API, e.g. the browser-test server on the test database.
    proxy: { '/api': { target: process.env.ACARVO_API_PROXY ?? 'http://127.0.0.1:3001', xfwd: true } },
  },
})
