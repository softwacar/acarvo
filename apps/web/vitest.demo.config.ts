import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Unit tests of the browser-only demo core (calculators, operations, seed). No server, no database, no network.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: { include: ['src/demo/**/*.test.ts'], environment: 'node' },
})
