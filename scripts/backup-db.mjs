// ACARVO main database backup (development).
//
// Run from the repository root:  node --env-file=.env scripts/backup-db.mjs
//
// The owner role is subject to FORCE ROW LEVEL SECURITY, so a plain pg_dump cannot read company
// rows. The backup is therefore taken in parts, all with --enable-row-security:
//   schema.dump            schema only (all tables, policies, functions, grants)
//   global.dump            data of tables without RLS (users, companies, sessions, migrations, ...)
//   company-<id>.dump      data of company tables, read inside that company's context
//   storage/               copy of the private file storage
// After writing, every table's row count in the dump is compared with the live database.
// The password is passed through PGPASSWORD, never on a command line.
//
// Restore (into an empty database, as a role allowed to write all tables):
//   pg_restore -d <db> schema.dump
//   pg_restore -d <db> --data-only --disable-triggers global.dump
//   pg_restore -d <db> --data-only --disable-triggers company-<id>.dump   (each company)
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const pg = require('pg')

const BIN = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin'
const url = new URL(process.env.DATABASE_OWNER_URL ?? '')
if (!url.hostname) throw new Error('DATABASE_OWNER_URL is not set (run with --env-file=.env)')
const conn = { host: url.hostname, port: url.port || '5432', user: decodeURIComponent(url.username), db: url.pathname.slice(1) }
const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
const root = path.resolve('backups', stamp)
mkdirSync(root, { recursive: true })

function dump(file, args, extraEnv = {}) {
  const r = spawnSync(path.join(BIN, 'pg_dump.exe'), ['-h', conn.host, '-p', conn.port, '-U', conn.user, '-d', conn.db, '-Fc', '-f', path.join(root, file), ...args], {
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`pg_dump ${file} failed: ${r.stderr}`)
}

/** Row counts per table inside a custom-format dump, read from its COPY blocks. */
function dumpCounts(file) {
  const r = spawnSync(path.join(BIN, 'pg_restore.exe'), ['-f', '-', path.join(root, file)], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 })
  if (r.status !== 0) throw new Error(`pg_restore ${file} failed: ${r.stderr}`)
  const counts = {}
  let table = null
  for (const raw of r.stdout.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const m = line.match(/^COPY (?:public|drizzle)\.(\S+) /)
    if (m) {
      table = m[1].replace(/"/g, '')
      counts[table] = 0
    } else if (table && line === '\\.') table = null
    else if (table) counts[table]++
  }
  return counts
}

const client = new pg.Client({ connectionString: process.env.DATABASE_OWNER_URL })
await client.connect()
const rlsTables = (
  await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1`)
).rows.map((r) => r.relname)
const allTables = (await client.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename)
const globalTables = allTables.filter((t) => !rlsTables.includes(t))
const companies = (await client.query('select id, name from companies order by name')).rows

dump('schema.dump', ['--schema-only'])
dump('global.dump', ['--data-only', '--enable-row-security', ...globalTables.flatMap((t) => ['-t', `public.${t}`]), '-n', 'drizzle'])
for (const c of companies) {
  dump(`company-${c.id}.dump`, ['--data-only', '--enable-row-security', ...rlsTables.flatMap((t) => ['-t', `public.${t}`])], { PGOPTIONS: `-c app.company_id=${c.id}` })
}

// Verify: dump row counts must equal live counts.
const problems = []
const report = { stamp, companies: companies.map((c) => c.name), global: {}, perCompany: {} }
const g = dumpCounts('global.dump')
for (const t of globalTables) {
  const live = Number((await client.query(`select count(*) n from public.${t}`)).rows[0].n)
  report.global[t] = live
  if ((g[t] ?? 0) !== live) problems.push(`global ${t}: dump ${g[t] ?? 0} != live ${live}`)
}
for (const c of companies) {
  const d = dumpCounts(`company-${c.id}.dump`)
  report.perCompany[c.name] = {}
  await client.query('begin')
  await client.query(`select set_config('app.company_id', $1, true)`, [c.id])
  for (const t of rlsTables) {
    const live = Number((await client.query(`select count(*) n from public.${t}`)).rows[0].n)
    report.perCompany[c.name][t] = live
    if ((d[t] ?? 0) !== live) problems.push(`${c.name} ${t}: dump ${d[t] ?? 0} != live ${live}`)
  }
  await client.query('rollback')
}
await client.end()

const storage = path.resolve('storage')
if (existsSync(storage) && !process.env.BACKUP_SKIP_STORAGE) cpSync(storage, path.join(root, 'storage'), { recursive: true })

// Customer data keys are NOT part of this backup (M2 plan §4.4). The report names their fingerprints so it is clear
// which separately kept key file opens the encrypted customer numbers and files in this backup. No key value is written.
const ringFingerprints = (spec) =>
  (spec ?? '')
    .split(',')
    .filter(Boolean)
    .map((p) => ({ id: p.split(':')[0], fingerprint: createHash('sha256').update('acarvo-key-fingerprint|').update(Buffer.from(p.split(':')[1] ?? '', 'base64')).digest('hex').slice(0, 8) }))
report.customerKeys = process.env.CUSTOMER_DATA_KEYS
  ? { note: 'Keys are not in this backup; keep the key file separately.', data: ringFingerprints(process.env.CUSTOMER_DATA_KEYS), lookup: ringFingerprints(process.env.CUSTOMER_LOOKUP_KEYS) }
  : { note: 'No customer data keys configured in this environment.' }

writeFileSync(path.join(root, 'report.json'), JSON.stringify({ ...report, verified: problems.length === 0, problems }, null, 2))
if (problems.length) {
  console.error('BACKUP NOT VERIFIED:\n' + problems.join('\n'))
  process.exit(1)
}
console.log(`Backup verified: ${root}`)
console.log(`Customer data keys are not included in this backup: ${report.customerKeys.data ? report.customerKeys.data.map((k) => `${k.id} ${k.fingerprint}`).join(', ') + ' (keep the key file separately)' : 'none configured'}`)
console.log(JSON.stringify(report, null, 1))
