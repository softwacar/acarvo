// Customer data keys: check and re-encrypt (M2 plan §4.3–4.5). Prints ids, fingerprints and counts only.
//
//   npm run keys:check --workspace @acarvo/api                      keys in .env: format, ring, round trip
//   npm run keys:check --workspace @acarvo/api -- --db              + read-only: values per key id and how many decrypt
//   npm run keys:reencrypt --workspace @acarvo/api -- --dry-run     what would be re-encrypted with the active keys
//   npm run keys:reencrypt --workspace @acarvo/api                  verified backup first, then re-encrypt in batches
//
// --test targets acarvo_test instead of the main database.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { customerCryptoFromEnv } from '../lib/customer-crypto'
import { rotateCustomerData, verifyCustomerData } from '../lib/customer-key-rotation'
import { createStorage } from '../lib/storage'
import * as schema from './schema'

const [command, ...flags] = process.argv.slice(2)
const has = (f: string) => flags.includes(`--${f}`)
const say = (m: string) => console.log(`[customer-keys] ${m}`)
const stop = (m: string): never => {
  console.error(`[customer-keys] STOPPED: ${m}`)
  process.exit(1)
}

const { crypto, problem } = customerCryptoFromEnv(process.env)
if (!crypto) stop(problem ?? 'keys missing')
const fp = crypto!.fingerprints()
say(`data keys:   ${fp.data.map((k) => `${k.id}${k.active ? ' (active)' : ''} ${k.fingerprint}`).join(', ')}`)
say(`lookup keys: ${fp.lookup.map((k) => `${k.id}${k.active ? ' (active)' : ''} ${k.fingerprint}`).join(', ')}`)
const probe = crypto!.encrypt('00000000-0000-4000-8000-000000000000', 'number', '00000000-0000-4000-8000-000000000001', Buffer.from('ACARVO-CHECK'))
if (crypto!.decrypt('00000000-0000-4000-8000-000000000000', 'number', '00000000-0000-4000-8000-000000000001', probe.ciphertext, probe.keyId).toString() !== 'ACARVO-CHECK') stop('round trip failed')
say('round trip in memory: ok')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const url = has('test') ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL
const storage = createStorage(process.env.STORAGE_DIR ?? path.join(repoRoot, 'storage'))

async function withDb<T>(fn: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>) {
  if (!url) stop('owner database URL missing (run with the project .env)')
  const pool = new pg.Pool({ connectionString: url, max: 2 })
  try {
    return await fn(drizzle(pool, { schema }))
  } finally {
    await pool.end()
  }
}

if (command === 'check') {
  if (has('db')) {
    const rows = await withDb((db) => verifyCustomerData(db, crypto!, storage))
    for (const r of rows) say(`${r.company}: numbers ${JSON.stringify(r.numbersByKey)} (failures ${r.numberFailures}), files ${JSON.stringify(r.filesByKey)} (failures ${r.fileFailures})`)
    if (rows.some((r) => r.numberFailures || r.fileFailures)) stop('some values do not decrypt with these keys')
    say('every stored value decrypts with these keys')
  }
} else if (command === 'reencrypt') {
  if (!has('test') && !has('dry-run')) {
    say('taking a verified backup first …')
    const backup = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/backup-db.mjs')], { cwd: repoRoot, env: process.env, encoding: 'utf8' })
    if (backup.status !== 0 || !/Backup verified: (.+)/.test(backup.stdout ?? '')) stop('backup not verified; nothing was re-encrypted')
    say(`backup verified: ${/Backup verified: (.+)/.exec(backup.stdout)![1]!.trim()}`)
  }
  const rows = await withDb((db) => rotateCustomerData(db, crypto!, storage, { dryRun: has('dry-run') }))
  for (const r of rows) say(`${r.company}: numbers ${r.numbersDone}/${r.numbersPending}, files ${r.filesDone + r.filesRecovered}/${r.filesPending}${r.filesRecovered ? ` (recovered ${r.filesRecovered})` : ''}${has('dry-run') ? ' (dry run, nothing changed)' : ''}`)
} else {
  console.log('usage: customer-keys.ts check [--db] [--test] | reencrypt [--dry-run] [--test]')
}
