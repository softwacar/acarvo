import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

/** Applies migrations as the owner role. `--test` targets the test database. */
const url = process.argv.includes('--test') ? process.env.TEST_DATABASE_OWNER_URL : process.env.DATABASE_OWNER_URL
if (!url) throw new Error('Owner database URL is not set. Run scripts/setup-db.ps1 first.')

const pool = new pg.Pool({ connectionString: url })
await migrate(drizzle(pool), { migrationsFolder: new URL('../../migrations', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') })
await pool.end()
console.log('Migrations applied.')
