import { randomBytes } from 'node:crypto'
import { hash } from '@node-rs/argon2'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { loadDevData } from '../seed/dev-data'
import { buildApp } from '../src/app'
import { createDatabase } from '../src/db/client'
import * as schema from '../src/db/schema'
import { loadEnv } from '../src/env'
import { ARGON2_OPTIONS } from '../src/modules/auth/password'

const base = loadEnv()
if (!base.TEST_DATABASE_URL || !base.TEST_DATABASE_OWNER_URL) {
  throw new Error('TEST_DATABASE_URL / TEST_DATABASE_OWNER_URL missing. Run scripts/setup-db.ps1.')
}
export const env = { ...base, NODE_ENV: 'test' as const, DATABASE_URL: base.TEST_DATABASE_URL, DATABASE_OWNER_URL: base.TEST_DATABASE_OWNER_URL }

/** Random per run; never stored anywhere. */
export const PASSWORD = randomBytes(12).toString('base64url')
let passwordHash: string | undefined

export const ownerPool = new pg.Pool({ connectionString: env.DATABASE_OWNER_URL, max: 2 })
const ownerDb = drizzle(ownerPool, { schema })
/** Raw connection as the restricted runtime role, for database-level checks. */
export const appPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 })

export type DevData = Awaited<ReturnType<typeof loadDevData>>

export async function resetDatabase(): Promise<DevData> {
  passwordHash ??= await hash(PASSWORD, ARGON2_OPTIONS)
  await ownerDb.execute(
    sql`truncate audit_log, membership_branches, membership_roles, memberships, roles, branches, sessions, users, companies restart identity cascade`,
  )
  return loadDevData(ownerDb, passwordHash)
}

/** Runs SQL as the owner inside a company context (RLS is forced for the owner too). */
export async function asOwner(companyId: string | null, text: string, values: unknown[] = []) {
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

/** Runs `fn` as acarvo_app with the given company context, always rolled back. */
export async function asApp<T>(companyId: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
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

export async function makeApp() {
  const database = createDatabase(env.DATABASE_URL)
  const app = await buildApp({ env, database, logger: false })
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

  async request(method: 'GET' | 'POST', url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({
      method,
      url,
      payload: method === 'POST' ? (body ?? {}) : undefined,
      headers: { origin: this.origin, ...(method === 'POST' && this.csrf ? { 'x-csrf-token': this.csrf } : {}), ...headers },
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
