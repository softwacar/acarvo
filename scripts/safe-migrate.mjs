// ACARVO guarded migration: backup → snapshot → migrate → verify, stopping at the first problem.
//
// Run from the repository root:
//   node --env-file=.env scripts/safe-migrate.mjs --test             acarvo_test (rehearsal)
//   node --env-file=.env scripts/safe-migrate.mjs --dry-run          main database: only list pending migrations
//   node --env-file=.env scripts/safe-migrate.mjs                    main database: full run (asks nothing; decide first)
//
// Steps:
//   1. List migrations in apps/api/migrations that the database has not applied yet. None → stop (nothing to do).
//   2. Verified backup with scripts/backup-db.mjs (dump row counts compared with live counts). Not verified → stop.
//   3. Snapshot: row count of every table, per company for company tables (inside that company's RLS context).
//   4. Apply migrations with the project's migrate script (also runs the idempotent preset-role upgrade).
//   5. Verify: all journal migrations applied; no table lost rows; every table that had RLS still has it enabled and
//      forced. Any failure → non-zero exit with the backup folder and restore steps.
// No secret is printed. Connection strings come only from the environment.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const pg = require('pg')
const args = new Set(process.argv.slice(2))
const test = args.has('--test')
const dryRun = args.has('--dry-run')
const ownerUrl = test ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL
if (!ownerUrl) throw new Error('Owner connection string missing (run with --env-file=.env).')
const dbName = decodeURIComponent(new URL(ownerUrl).pathname.slice(1))
if (test && dbName !== 'acarvo_test') throw new Error(`--test must point to acarvo_test, not "${dbName}".`)
const say = (m) => console.log(`[safe-migrate] ${m}`)
const fail = (m, backup) => {
  console.error(`[safe-migrate] STOPPED: ${m}`)
  if (backup) {
    console.error(`[safe-migrate] Verified backup: ${backup}`)
    console.error('[safe-migrate] Restore into an empty database (see scripts/backup-db.mjs header): schema.dump, then global.dump and each company-*.dump with --data-only --disable-triggers.')
  }
  process.exit(1)
}

const journal = JSON.parse(readFileSync(path.resolve('apps/api/migrations/meta/_journal.json'), 'utf8')).entries
async function withClient(fn) {
  const c = new pg.Client({ connectionString: ownerUrl })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

// 1. Pending migrations
const applied = await withClient(async (c) => {
  const exists = (await c.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as e`)).rows[0].e
  return exists ? Number((await c.query('select count(*) n from drizzle.__drizzle_migrations')).rows[0].n) : 0
})
const pending = journal.slice(applied).map((e) => e.tag)
say(`database "${dbName}": ${applied} applied, ${journal.length} in the project`)
if (applied > journal.length) fail('the database has more migrations than the project (wrong branch?)')
if (!pending.length) {
  say('nothing to migrate')
  process.exit(0)
}
say(`pending: ${pending.join(', ')}`)
if (dryRun) process.exit(0)

// 2. Verified backup
say('taking a verified backup …')
// A rehearsal on acarvo_test does not copy the real file storage into the backup.
const backup = spawnSync(process.execPath, ['scripts/backup-db.mjs'], { env: { ...process.env, DATABASE_OWNER_URL: ownerUrl, ...(test ? { BACKUP_SKIP_STORAGE: '1' } : {}) }, encoding: 'utf8' })
const backupDir = /Backup verified: (.+)/.exec(backup.stdout ?? '')?.[1]?.trim()
if (backup.status !== 0 || !backupDir) fail(`backup not verified\n${backup.stderr ?? ''}`)
say(`backup verified: ${backupDir}`)

// 3. Snapshot
async function snapshot() {
  return withClient(async (c) => {
    const rls = (
      await c.query(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' order by 1`)
    ).rows
    const companyTables = rls.filter((r) => r.relrowsecurity).map((r) => r.relname)
    const globalTables = rls.filter((r) => !r.relrowsecurity).map((r) => r.relname)
    const counts = {}
    for (const t of globalTables) counts[t] = Number((await c.query(`select count(*) n from public."${t}"`)).rows[0].n)
    const companies = (await c.query('select id, name from companies order by name')).rows
    for (const co of companies) {
      await c.query('begin')
      await c.query(`select set_config('app.company_id', $1, true)`, [co.id])
      for (const t of companyTables) counts[`${co.name} / ${t}`] = Number((await c.query(`select count(*) n from public."${t}"`)).rows[0].n)
      await c.query('rollback')
    }
    return { counts, rls: Object.fromEntries(rls.map((r) => [r.relname, { enabled: r.relrowsecurity, forced: r.relforcerowsecurity }])) }
  })
}
const before = await snapshot()

// 4. Migrate
say('applying migrations …')
const tsx = path.resolve('node_modules/tsx/dist/cli.mjs')
const migrate = spawnSync(process.execPath, [tsx, '--env-file=../../.env', 'src/db/migrate.ts', ...(test ? ['--test'] : [])], { cwd: path.resolve('apps/api'), encoding: 'utf8' })
process.stdout.write((migrate.stdout ?? '').split('\n').filter((l) => !/password/i.test(l)).join('\n'))
if (migrate.status !== 0) fail('migration failed (the migrator runs in one transaction; the database should be unchanged — verify before retrying)', backupDir)

// 5. Verify
const after = await snapshot()
const nowApplied = await withClient(async (c) => Number((await c.query('select count(*) n from drizzle.__drizzle_migrations')).rows[0].n))
const problems = []
if (nowApplied !== journal.length) problems.push(`applied migrations ${nowApplied} != project ${journal.length}`)
for (const [k, n] of Object.entries(before.counts)) {
  const m = after.counts[k]
  if (m === undefined) problems.push(`table disappeared: ${k}`)
  else if (m < n) problems.push(`rows lost: ${k} ${n} → ${m}`)
}
for (const [t, r] of Object.entries(before.rls)) {
  if (r.enabled && !(after.rls[t]?.enabled && after.rls[t]?.forced === r.forced)) problems.push(`RLS weakened on ${t}`)
}
for (const [t, r] of Object.entries(after.rls)) if (!(t in before.rls) && !r.enabled && t !== 'document_types') problems.push(`new table without RLS: ${t} (check it is meant to be global)`)
if (problems.length) fail(problems.join('\n'), backupDir)
const grown = Object.entries(after.counts).filter(([k, n]) => n !== before.counts[k]).map(([k, n]) => `${k}: ${before.counts[k] ?? 0} → ${n}`)
say(`verified. Changed counts (additions only): ${grown.length ? grown.join('; ') : 'none'}`)
