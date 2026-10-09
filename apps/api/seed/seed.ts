import { hash } from '@node-rs/argon2'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as s from '../src/db/schema'
import { ARGON2_OPTIONS } from '../src/modules/auth/password'
import { loadDevData } from './dev-data'

/**
 * Loads development data into an empty database.
 * The sample login password comes from SEED_PASSWORD (asked by setup-db.ps1), never from source.
 */
const url = process.env.DATABASE_OWNER_URL
const password = process.env.SEED_PASSWORD
if (!url) throw new Error('DATABASE_OWNER_URL is not set')
if (!password || password.length < 12) throw new Error('SEED_PASSWORD must be set (at least 12 characters)')

const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool, { schema: s })

const existing = await db.select().from(s.companies)
if (existing.length) {
  console.log('Development data already present; nothing to do.')
} else {
  await loadDevData(db, await hash(password, ARGON2_OPTIONS))
  console.log('Development data loaded: 2 companies, 4 branches, 3 users.')
}
await pool.end()
