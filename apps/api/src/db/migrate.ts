import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { upgradePresetRoles } from './role-upgrade'
import * as schema from './schema'

/** Applies migrations as the owner role. `--test` targets the test database. */
const url = process.argv.includes('--test') ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL
if (!url) throw new Error('Owner database URL is not set. Run scripts/setup-db.ps1 first.')

const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool, { schema })
await migrate(db, { migrationsFolder: new URL('../../migrations', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
console.log('Migrations applied.')

// Data step, safe to repeat: unmodified preset roles receive permissions added to the presets.
const upgraded = await upgradePresetRoles(db)
console.log(
  upgraded.length
    ? `Preset roles upgraded: ${upgraded.map((u) => `${u.company} / ${u.role} +${u.added.join(',')}`).join('; ')}`
    : 'Preset roles already up to date; nothing changed.',
)
await pool.end()
