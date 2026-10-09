import { hash } from '@node-rs/argon2'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as s from '../src/db/schema'
import { ARGON2_OPTIONS } from '../src/modules/auth/password'
import { loadDevData } from './dev-data'
import { ensureDevDocumentSettings } from './dev-documents'
import { ensureDevFleet } from './dev-fleet'

/**
 * Loads development data. Only ever inserts: companies and users when the database is empty,
 * then vehicle classes and a fleet for each company that has none yet.
 * The sample login password comes from SEED_PASSWORD (asked by setup-db.ps1), never from source.
 */
const url = process.env.DATABASE_OWNER_URL
if (!url) throw new Error('DATABASE_OWNER_URL is not set')

const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool, { schema: s })

const existing = await db.select({ id: s.companies.id }).from(s.companies).limit(1)
if (existing.length) {
  console.log('Companies and users already present; leaving them unchanged.')
} else {
  const password = process.env.SEED_PASSWORD
  if (!password || password.length < 12) throw new Error('SEED_PASSWORD must be set (at least 12 characters)')
  await loadDevData(db, await hash(password, ARGON2_OPTIONS))
  console.log('Development data loaded: 2 companies, 4 branches, 3 users.')
}
const fleet = await ensureDevFleet(db)
console.log(fleet.length ? `Added: ${fleet.join('; ')}.` : 'Vehicle classes and fleets already present; nothing added.')
const docSettings = await ensureDevDocumentSettings(db)
console.log(docSettings.length ? `Required document types (development example): ${docSettings.join('; ')}.` : 'Document type settings already present; nothing added.')
await pool.end()
