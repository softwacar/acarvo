import { defineConfig } from 'vitest/config'

// Connection strings come from the local .env written by scripts/setup-db.ps1.
try {
  // ACARVO_ENV_FILE lets a second worktree use the repository's local .env without copying it.
  process.loadEnvFile(process.env.ACARVO_ENV_FILE ?? new URL('../../.env', import.meta.url))
} catch {
  // tests/helpers.ts reports the missing configuration
}

export default defineConfig({
  test: {
    // All files share one test database.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
