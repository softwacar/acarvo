import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

let data: DevData
let app: FastifyInstance

beforeAll(async () => {
  data = await resetDatabase()
})
// A fresh app per test keeps the in-memory login rate limiter independent between tests.
beforeEach(async () => {
  app = await makeApp()
})
afterEach(async () => {
  await app.close()
})
afterAll(async () => {
  await appPool.end()
  await ownerPool.end()
})

const SESSION = '__Host-acarvo_session'

describe('database connection', () => {
  it('reports healthy', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', database: 'connected' })
  })
})

describe('login', () => {
  it('rejects a wrong password and an unknown e-mail with the same answer', async () => {
    const c = new Client(app)
    const wrong = await c.login(EMAILS.adnan, 'yanlis-parola-123')
    const unknown = await c.login('kimse@ornek.ba')
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.json()).toEqual(unknown.json())
    expect(c.jar.has(SESSION)).toBe(false)
  })

  it('sets an HttpOnly, Secure, SameSite=Lax host-only cookie', async () => {
    const c = new Client(app)
    const res = await c.login(EMAILS.lejla)
    expect(res.statusCode).toBe(200)
    const cookie = c.lastSetCookie.find((h) => h.startsWith(`${SESSION}=`))!
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/Secure/)
    expect(cookie).toMatch(/SameSite=Lax/)
    expect(cookie).toMatch(/Path=\//)
    expect(cookie).not.toMatch(/Domain=/)
  })

  it('stores only a hash of the session token', async () => {
    const c = new Client(app)
    await c.login(EMAILS.lejla)
    const token = c.jar.get(SESSION)!
    const { rows } = await asOwner(null, `select token_hash from sessions where user_id = $1 order by created_at desc limit 1`, [data.users.lejla.id])
    expect(rows[0].token_hash).not.toBe(token)
    expect(rows[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'))
  })

  it('writes the login to the company audit log', async () => {
    const c = new Client(app)
    await c.login(EMAILS.lejla)
    const { rows } = await asOwner(data.companies.neretva, `select action from audit_log where actor_user_id = $1`, [data.users.lejla.id])
    expect(rows.map((r) => r.action)).toContain('auth.login')
  })

  it('is rate limited after 5 attempts per address and e-mail', async () => {
    const c = new Client(app)
    for (let i = 0; i < 5; i++) expect((await c.login(EMAILS.selma, 'yanlis-parola-123')).statusCode).toBe(401)
    const blocked = await c.login(EMAILS.selma)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe('RATE_LIMITED')
    // Another e-mail from the same address is not blocked
    expect((await c.login(EMAILS.lejla)).statusCode).toBe(200)
  })
})

describe('CSRF and origin', () => {
  it('rejects a state-changing request without the CSRF token', async () => {
    const c = new Client(app)
    const res = await c.post('/api/auth/login', { email: EMAILS.lejla, password: 'x' })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('CSRF_INVALID')
  })

  it('rejects a forged CSRF token', async () => {
    const c = await new Client(app).prepare()
    c.csrf = 'sahte-token'
    expect((await c.login(EMAILS.lejla)).statusCode).toBe(403)
  })

  it('rejects requests from another origin', async () => {
    const c = await new Client(app, 'https://saldirgan.example').prepare()
    const res = await c.login(EMAILS.lejla)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('BAD_ORIGIN')
  })
})

describe('session lifetime', () => {
  async function loggedIn(email = EMAILS.lejla) {
    const c = new Client(app)
    expect((await c.login(email)).statusCode).toBe(200)
    return c
  }
  const lastSessionOf = async (userId: string) =>
    (await asOwner(null, `select id from sessions where user_id = $1 order by created_at desc limit 1`, [userId])).rows[0].id as string

  it('logout revokes the session on the server', async () => {
    const c = await loggedIn()
    const token = c.jar.get(SESSION)!
    expect((await c.post('/api/auth/logout')).statusCode).toBe(204)
    c.jar.set(SESSION, token) // replay the old cookie
    expect((await c.get('/api/auth/session')).statusCode).toBe(401)
  })

  it('"close all sessions" ends sessions on other devices too', async () => {
    const laptop = await loggedIn()
    const phone = await loggedIn()
    expect((await laptop.post('/api/auth/sessions/revoke-all')).statusCode).toBe(204)
    expect((await phone.get('/api/auth/session')).statusCode).toBe(401)
    expect((await laptop.get('/api/auth/session')).statusCode).toBe(401)
  })

  it('expires after 8 hours of inactivity', async () => {
    const c = await loggedIn()
    const id = await lastSessionOf(data.users.lejla.id)
    await asOwner(null, `update sessions set last_seen_at = now() - interval '9 hours' where id = $1`, [id])
    expect((await c.get('/api/auth/session')).statusCode).toBe(401)
    const { rows } = await asOwner(null, `select revoked_at from sessions where id = $1`, [id])
    expect(rows[0].revoked_at).not.toBeNull()
  })

  it('expires at the absolute limit even when active', async () => {
    const c = await loggedIn()
    const id = await lastSessionOf(data.users.lejla.id)
    await asOwner(null, `update sessions set expires_at = now() - interval '1 second' where id = $1`, [id])
    expect((await c.get('/api/auth/session')).statusCode).toBe(401)
  })

  it('a disabled user loses existing sessions and cannot log in', async () => {
    const c = await loggedIn(EMAILS.selma)
    await asOwner(null, `update users set status = 'disabled' where id = $1`, [data.users.selma.id])
    try {
      expect((await c.get('/api/auth/session')).statusCode).toBe(401)
      expect((await new Client(app).login(EMAILS.selma)).statusCode).toBe(401)
    } finally {
      await asOwner(null, `update users set status = 'active' where id = $1`, [data.users.selma.id])
    }
  })

  it('a suspended membership loses company access immediately', async () => {
    const c = await loggedIn(EMAILS.selma)
    expect((await c.get('/api/branches')).statusCode).toBe(200)
    await asOwner(data.companies.drina, `update memberships set status = 'suspended' where user_id = $1`, [data.users.selma.id])
    try {
      const res = await c.get('/api/branches')
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('NO_COMPANY_ACCESS')
      expect((await c.get('/api/auth/session')).json().company).toBeNull()
    } finally {
      await asOwner(data.companies.drina, `update memberships set status = 'active' where user_id = $1`, [data.users.selma.id])
    }
  })
})
