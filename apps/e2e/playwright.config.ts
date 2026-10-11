import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests run against a separate API (port 3101) and web server (port 5181) wired to the acarvo_test
 * database and a throwaway storage folder. The development servers (3001/5173) and the main database are
 * never used. Each run resets acarvo_test with a fresh random password (no personal credentials).
 */
const root = path.resolve(import.meta.dirname, '../..')
// ACARVO_ENV_FILE lets a second worktree use the repository's local .env without copying it.
export const ENV_FILE = process.env.ACARVO_ENV_FILE ?? path.join(root, '.env')
const env = parseEnv(readFileSync(ENV_FILE, 'utf8'))
const testUrl = env.TEST_DATABASE_URL
const testOwnerUrl = env.TEST_DATABASE_OWNER_URL
const dbName = (url?: string) => (url ? decodeURIComponent(new URL(url).pathname.slice(1)) : '')
if (dbName(testUrl) !== 'acarvo_test' || dbName(testOwnerUrl) !== 'acarvo_test' || testUrl === env.DATABASE_URL) {
  throw new Error('Browser tests stopped: TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL must point to acarvo_test.')
}

// Synthetic customer data keys for this run only (M2), shared by the test API server and the guarded test reset.
// Never the keys of the local .env; workers inherit the same value from the main process.
const runKey = () => `k1:${randomBytes(32).toString('base64')}`
process.env.E2E_CUSTOMER_KEYS ??= JSON.stringify({ CUSTOMER_DATA_KEYS: runKey(), CUSTOMER_DATA_KEY_ACTIVE: 'k1', CUSTOMER_LOOKUP_KEYS: runKey(), CUSTOMER_LOOKUP_KEY_ACTIVE: 'k1' })
const customerKeys = JSON.parse(process.env.E2E_CUSTOMER_KEYS) as Record<string, string>

export const API_PORT = 3101
export const WEB_PORT = 5181
export const E2E_STORAGE = path.join(os.tmpdir(), 'acarvo-e2e-storage')
export const E2E_FIXTURES = path.join(os.tmpdir(), 'acarvo-e2e-fixtures')

export default defineConfig({
  testDir: './tests',
  // One shared test database: run files one after another, each test on its own vehicles.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Sarajevo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Signs each test user in once (sign-in is rate limited) and stores the session for the other tests.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'desktop', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', dependencies: ['setup'], use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: 'npx tsx src/server.ts',
      cwd: path.join(root, 'apps/api'),
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      env: {
        ...(process.env as Record<string, string>),
        NODE_ENV: 'development',
        API_PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        DATABASE_URL: testUrl!,
        DATABASE_OWNER_URL: testOwnerUrl!,
        COOKIE_SECRET: env.COOKIE_SECRET!,
        STORAGE_DIR: E2E_STORAGE,
        MALWARE_SCANNER: 'none',
        ...customerKeys,
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: path.join(root, 'apps/web'),
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: 'ignore',
      env: { ...(process.env as Record<string, string>), ACARVO_API_PROXY: `http://127.0.0.1:${API_PORT}` },
    },
  ],
})
