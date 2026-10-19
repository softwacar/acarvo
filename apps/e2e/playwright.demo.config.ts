import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests for the interactive demo prototype. Separate from the real-application tests:
 * no .env, no database, no API server. The demo is served by its own Vite instance on port 5183;
 * the tests assert that the page never asks for the API.
 */
const root = path.resolve(import.meta.dirname, '../..')
export const DEMO_PORT = 5183

export default defineConfig({
  testDir: './demo-tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-demo', open: 'never' }]],
  outputDir: 'test-results-demo',
  use: {
    baseURL: `http://localhost:${DEMO_PORT}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Sarajevo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'demo', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx vite --mode demo --port ${DEMO_PORT} --strictPort`,
    cwd: path.join(root, 'apps/web'),
    url: `http://localhost:${DEMO_PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
})
