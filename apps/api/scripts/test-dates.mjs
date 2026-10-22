// Runs the date-sensitive API test files on several simulated days (tests/setup-clock.ts), then once on the real day.
// The test clock moves only the JavaScript clock; PostgreSQL's now() stays real and the seed refuses readings "in the future",
// so only about one day BEFORE now can be simulated; further back, views that SQL computes with now() (overdue rentals, odometer
// ordering) no longer agree with the shifted JavaScript clock and fail for that reason, not because of a date bug (51 h back showed this).
// Everything else (year ends, month ends, leap days, other zones, every clock-change week of four years) is covered without a
// database by tests/date-robustness.test.ts.
//
// Usage (from apps/api, test database only): node scripts/test-dates.mjs
import { spawnSync } from 'node:child_process'

const FILES = ['tests/finance.test.ts', 'tests/rentals.test.ts', 'tests/reservations.test.ts', 'tests/pricing-contracts.test.ts', 'tests/rentals-integration.test.ts', 'tests/dst.test.ts', 'tests/date-robustness.test.ts']
const HOURS = [3, 27] // 3 h and 27 h before now: a few hours back, and across a midnight (the previous calendar day)
let failed = 0
for (const h of [0, ...HOURS]) {
  const now = h === 0 ? undefined : new Date(Date.now() - h * 3_600_000).toISOString()
  console.log(`\n=== ${now ? `simulated now ${now} (${h} h earlier)` : 'real clock'}`)
  const r = spawnSync('npx', ['vitest', 'run', ...FILES], { stdio: 'inherit', shell: true, env: { ...process.env, ...(now ? { ACARVO_TEST_NOW: now } : {}) } })
  if (r.status !== 0) failed++
}
console.log(failed ? `\n${failed} run(s) failed` : '\nAll runs passed')
process.exit(failed ? 1 : 0)
