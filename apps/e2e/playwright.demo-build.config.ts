import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * The same demo browser tests, run against a finished build (vite build --mode demo) that is served by `vite preview`.
 * Because the served files are a snapshot, the source can be edited while a long run is in progress. Set DEMO_DIST to the
 * build folder (relative to apps/web) and optionally DEMO_PORT.
 */
const root = path.resolve(import.meta.dirname, '../..')
const port = Number(process.env.DEMO_PORT ?? 5184)
const dist = process.env.DEMO_DIST ?? 'dist-demo'

export default defineConfig({
  testDir: './demo-tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: `playwright-report-${path.basename(dist)}`, open: 'never' }]],
  outputDir: `test-results-${path.basename(dist)}`,
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Sarajevo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'demo', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite preview --mode demo --outDir ${dist} --port ${port} --strictPort`,
    cwd: path.join(root, 'apps/web'),
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
})
