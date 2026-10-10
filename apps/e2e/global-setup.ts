import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { E2E_FIXTURES, E2E_STORAGE, ENV_FILE } from './playwright.config'

/** Fresh acarvo_test (guarded reset), a random password for this run only, empty storage and upload fixtures. */
export default async function globalSetup() {
  const password = randomBytes(12).toString('base64url')
  rmSync(E2E_STORAGE, { recursive: true, force: true })
  execFileSync('npx', ['tsx', `--env-file=${ENV_FILE}`, 'tests/e2e-reset.ts'], {
    cwd: path.resolve(import.meta.dirname, '../api'),
    env: { ...process.env, E2E_PASSWORD: password, E2E_FIXTURES },
    stdio: 'inherit',
    shell: true,
  })
  process.env.E2E_PASSWORD = password
  process.env.E2E_FIXTURES = E2E_FIXTURES
}
