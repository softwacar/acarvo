import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import type { Writable } from 'node:stream'
import { hash } from '@node-rs/argon2'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { loadDevData } from '../seed/dev-data'
import { ensureDevDocumentSettings } from '../seed/dev-documents'
import { ensureDevFleet } from '../seed/dev-fleet'
import { ensureTestCorporateAccounts } from '../seed/test-corporate'
import { ensureTestReservations } from '../seed/test-reservations'
import { ensureTestCustomerDocuments, ensureTestCustomers, ensureTestDocumentPolicies } from '../seed/test-customers'
import { buildApp } from '../src/app'
import type { MalwareScanner } from '../src/lib/malware'
import { createDatabase } from '../src/db/client'
import * as schema from '../src/db/schema'
import { loadEnv } from '../src/env'
import { ARGON2_OPTIONS } from '../src/modules/auth/password'
import { customerCryptoFromEnv, generateTestKeyEnv } from '../src/lib/customer-crypto'
import { assertConnectedToTestDatabase, assertSeparateDatabases } from './db-guard'

const base = loadEnv()
if (!base.TEST_DATABASE_URL || !base.TEST_DATABASE_OWNER_URL) {
  throw new Error('TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL missing. Run scripts/setup-db.ps1.')
}
// Stop at import time if the test connections point to the application database.
assertSeparateDatabases(base.TEST_DATABASE_URL, base.DATABASE_URL, 'TEST_DATABASE_URL')
assertSeparateDatabases(base.TEST_DATABASE_OWNER_URL, base.DATABASE_OWNER_URL, 'TEST_DATABASE_OWNER_URL')

/** Uploaded test files go to a throwaway folder, never to the development storage. */
export const TEST_STORAGE = path.join(os.tmpdir(), 'acarvo-test-storage')
export const env = {
  ...base,
  NODE_ENV: 'test' as const,
  DATABASE_URL: base.TEST_DATABASE_URL,
  DATABASE_OWNER_URL: base.TEST_DATABASE_OWNER_URL,
  STORAGE_DIR: TEST_STORAGE,
  // Synthetic keys for this run only (M2): never the keys of the local .env, never written anywhere. Browser test runs
  // hand their run keys over in E2E_CUSTOMER_KEYS so the seeded documents and the test API server use the same keys.
  ...(process.env.E2E_CUSTOMER_KEYS ? (JSON.parse(process.env.E2E_CUSTOMER_KEYS) as ReturnType<typeof generateTestKeyEnv>) : generateTestKeyEnv()),
}

/** Random per run; never stored anywhere. Browser tests pass their own run password in E2E_PASSWORD. */
export const PASSWORD = process.env.E2E_PASSWORD || randomBytes(12).toString('base64url')
let passwordHash: string | undefined

export const ownerPool = new pg.Pool({ connectionString: env.DATABASE_OWNER_URL, max: 2 })
const ownerDb = drizzle(ownerPool, { schema })
/** Raw connection as the restricted runtime role, for database-level checks. */
export const appPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 })

const currentDatabase = (pool: pg.Pool) => async () => (await pool.query<{ name: string }>('select current_database() as name')).rows[0]!.name
let verified: Promise<void> | undefined

/**
 * Confirms on the live connections that they are in acarvo_test. Every helper that
 * reads or writes data awaits this first; a failure is remembered and stops all later calls.
 */
export function ensureTestDatabase() {
  verified ??= assertConnectedToTestDatabase([
    { label: 'owner', currentDatabase: currentDatabase(ownerPool) },
    { label: 'application', currentDatabase: currentDatabase(appPool) },
  ])
  return verified
}

export type DevData = Awaited<ReturnType<typeof loadDevData>>

export async function resetDatabase(): Promise<DevData> {
  await ensureTestDatabase()
  passwordHash ??= await hash(PASSWORD, ARGON2_OPTIONS)
  await ownerDb.execute(
    sql`truncate reservation_status_events, reservation_drivers, reservations, corporate_account_people, corporate_addresses, corporate_tax_ids, corporate_contact_channels, corporate_accounts, document_requirement_items, document_requirement_policies, customer_document_settings, customer_document_files, customer_files, customer_documents, user_sensitive_actions, customers, company_sequences, vehicle_document_files, document_files, vehicle_documents, company_document_type_settings, vehicle_promo_photos, files, vehicle_location_corrections, odometer_corrections, vehicle_location_events, odometer_readings, vehicles, vehicle_classes, audit_log, membership_branches, membership_roles, memberships, roles, branches, sessions, users, companies restart identity cascade`,
  )
  const data = await loadDevData(ownerDb, passwordHash)
  await ensureDevFleet(ownerDb)
  await ensureDevDocumentSettings(ownerDb, 'test')
  await ensureTestCustomers(ownerDb)
  await ensureTestCustomerDocuments(ownerDb, customerCryptoFromEnv(env).crypto!)
  await ensureTestDocumentPolicies(ownerDb)
  await ensureTestCorporateAccounts(ownerDb)
  await ensureTestReservations(ownerDb)
  return data
}

/** Runs SQL as the owner inside a company context (RLS is forced for the owner too). */
export async function asOwner(companyId: string | null, text: string, values: unknown[] = []) {
  await ensureTestDatabase()
  const c = await ownerPool.connect()
  try {
    await c.query('begin')
    if (companyId) await c.query(`select set_config('app.company_id', $1, true)`, [companyId])
    const r = await c.query(text, values)
    await c.query('commit')
    return r
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    c.release()
  }
}

/**
 * Like asOwner, in a company and user context: tables whose RLS also checks the user (user_sensitive_actions) accept
 * owner inserts only for that user.
 */
export async function asOwnerAs(companyId: string, userId: string, text: string, values: unknown[] = []) {
  await ensureTestDatabase()
  const c = await ownerPool.connect()
  try {
    await c.query('begin')
    await c.query(`select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`, [companyId, userId])
    const r = await c.query(text, values)
    await c.query('commit')
    return r
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    c.release()
  }
}

/** Runs `fn` as acarvo_app with the given company context, always rolled back. */
export async function asApp<T>(companyId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  await ensureTestDatabase()
  const c = await appPool.connect()
  try {
    await c.query('begin')
    if (companyId) await c.query(`select set_config('app.company_id', $1, true)`, [companyId])
    return await fn(c)
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

export async function makeApp(opts: { scanner?: MalwareScanner; nodeEnv?: 'production' | 'test'; documentAccessTtlMs?: number; logStream?: Writable; envOverride?: Partial<typeof env> } = {}) {
  // The app connects with env.DATABASE_URL, the same connection string as appPool.
  await ensureTestDatabase()
  const database = createDatabase(env.DATABASE_URL)
  const app = await buildApp({ env: { ...env, ...opts.envOverride, NODE_ENV: opts.nodeEnv ?? env.NODE_ENV }, database, logger: false, scanner: opts.scanner, documentAccessTtlMs: opts.documentAccessTtlMs, logStream: opts.logStream })
  app.addHook('onClose', () => database.close())
  return app
}

/** A browser-like client: keeps cookies, sends Origin and the CSRF header. */
export class Client {
  jar = new Map<string, string>()
  csrf?: string
  lastSetCookie: string[] = []

  constructor(
    private app: FastifyInstance,
    private origin = env.WEB_ORIGIN,
  ) {}

  async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      payload: method === 'GET' ? undefined : (body ?? {}),
      headers: { origin: this.origin, ...(method !== 'GET' && this.csrf ? { 'x-csrf-token': this.csrf } : {}), ...headers },
      cookies: Object.fromEntries(this.jar),
    })
    const raw = res.headers['set-cookie']
    this.lastSetCookie = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
    for (const c of res.cookies as { name: string; value: string }[]) {
      if (c.value) this.jar.set(c.name, c.value)
      else this.jar.delete(c.name)
    }
    return res
  }

  get = (url: string) => this.request('GET', url)
  post = (url: string, body?: unknown, headers?: Record<string, string>) => this.request('POST', url, body, headers)
  put = (url: string, body?: unknown) => this.request('PUT', url, body)
  del = (url: string) => this.request('DELETE', url)

  /** multipart/form-data with one file, as a browser sends it. */
  upload(url: string, file: Buffer, filename = 'foto.jpg', type = 'image/jpeg') {
    const boundary = `----acarvo${randomBytes(8).toString('hex')}`
    const crlf = String.fromCharCode(13, 10)
    const head = Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}Content-Type: ${type}${crlf}${crlf}`)
    const payload = Buffer.concat([head, file, Buffer.from(`${crlf}--${boundary}--${crlf}`)])
    return this.request('POST', url, payload, { 'content-type': `multipart/form-data; boundary=${boundary}` })
  }

  async prepare() {
    this.csrf = (await this.get('/api/auth/csrf')).json().token
    return this
  }

  async login(email: string, password = PASSWORD) {
    if (!this.csrf) await this.prepare()
    return this.post('/api/auth/login', { email, password })
  }
}

export const EMAILS = {
  adnan: 'adnan.kovac@drina-demo.ba',
  selma: 'selma.karic@drina-demo.ba',
  lejla: 'lejla.begic@neretva-demo.ba',
}
