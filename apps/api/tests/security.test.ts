import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetFailedLogins } from '../src/modules/auth/routes'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Regression tests for the findings of the security review (docs/GECE_CALISMA_RAPORU.md, Aşama 2).

let data: DevData
let app: FastifyInstance

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
})
afterAll(async () => {
  resetFailedLogins()
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('suspended companies', () => {
  it('a suspended company cannot be used with an existing session or switched to', async () => {
    const lejla = new Client(app)
    const adnan = new Client(app)
    expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
    expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
    expect((await lejla.get('/api/vehicles')).statusCode).toBe(200)
    await asOwner(null, `update companies set status = 'suspended' where id = $1`, [data.companies.neretva])
    try {
      const blocked = await lejla.get('/api/vehicles')
      expect(blocked.statusCode).toBe(403)
      expect(blocked.json().error.code).toBe('NO_COMPANY_ACCESS')
      const switched = await adnan.post('/api/auth/switch-company', { companyId: data.companies.neretva })
      expect(switched.statusCode).toBe(403)
      // The other, active company still works for the same user.
      expect((await adnan.get('/api/vehicles')).statusCode).toBe(200)
    } finally {
      await asOwner(null, `update companies set status = 'active' where id = $1`, [data.companies.neretva])
    }
    expect((await lejla.get('/api/vehicles')).statusCode).toBe(200)
  })
})

describe('sign-in limits behind the web proxy', () => {
  const wrong = (c: Client, email: string, ip: string) => c.post('/api/auth/login', { email, password: 'yanlis-parola' }, { 'x-forwarded-for': ip })

  it('the per address+e-mail limit uses the browser address forwarded by the local proxy', async () => {
    resetFailedLogins()
    const c = await new Client(app).prepare()
    for (let i = 0; i < 5; i++) expect((await wrong(c, 'kurban@example.com', '203.0.113.10')).statusCode).toBe(401)
    expect((await wrong(c, 'kurban@example.com', '203.0.113.10')).statusCode).toBe(429)
    // Someone else's attempts no longer lock the account for everybody.
    expect((await wrong(c, 'kurban@example.com', '198.51.100.20')).statusCode).toBe(401)
  })

  it('one address is capped across many e-mail addresses (credential stuffing)', async () => {
    resetFailedLogins()
    const c = await new Client(app).prepare()
    for (let i = 0; i < 30; i++) expect((await wrong(c, `kisi${i}@example.com`, '192.0.2.77')).statusCode).toBe(401)
    const capped = await wrong(c, 'baska@example.com', '192.0.2.77')
    expect(capped.statusCode).toBe(429)
    expect(capped.json().error.code).toBe('RATE_LIMITED')
    // A real user from another address can still sign in.
    expect((await new Client(app).login(EMAILS.selma)).statusCode).toBe(200)
  })

  it('in production a forged X-Forwarded-For is ignored unless the proxy is configured', async () => {
    resetFailedLogins()
    const prod = await makeApp({ nodeEnv: 'production' })
    try {
      const c = await new Client(prod).prepare()
      for (let i = 0; i < 5; i++) await wrong(c, 'hedef@example.com', `10.0.0.${i}`)
      expect((await wrong(c, 'hedef@example.com', '10.0.0.99')).statusCode).toBe(429)
    } finally {
      await prod.close()
    }
  })
})

describe('history rules do not depend on the displayed page', () => {
  it('a reading older than the newest 500 can be corrected and still bounds back-dated entries', async () => {
    const adnan = new Client(app)
    expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
    const id = ((await adnan.get('/api/vehicles?q=O03-J-874')).json().items as { id: string }[])[0]!.id
    await asOwner(
      data.companies.drina,
      `insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, occurred_at)
       select $1, v.id, 1000 + n * 10, 'manual', 'manual', v.created_at + make_interval(hours => n)
       from vehicles v, generate_series(0, 599) n where v.id = $2 order by n`,
      [data.companies.drina, id],
    )
    let h = (await adnan.get(`/api/vehicles/${id}/history`)).json()
    expect(h.odometer).toHaveLength(500)
    const oldest = (await asOwner(data.companies.drina, `select id from odometer_readings where vehicle_id = $1 and km = 1010`, [id])).rows[0].id as string
    expect(h.odometer.some((o: { id: string }) => o.id === oldest)).toBe(false)
    const fix = await adnan.post(`/api/vehicles/${id}/odometer/${oldest}/correct`, { action: 'replace', km: 1015, reason: 'Eski kayıt düzeltmesi', expectedVersion: h.odometerVersion, clientRequestId: randomUUID() })
    expect(fix.statusCode).toBe(201)
    h = fix.json().history
    // Between the 1st and 2nd reading (outside the page): must not go below 1015.
    const created = (await asOwner(data.companies.drina, `select created_at from vehicles where id = $1`, [id])).rows[0].created_at as Date
    const at = new Date(created.getTime() + 1.5 * 3_600_000).toISOString()
    const low = await adnan.post(`/api/vehicles/${id}/odometer`, { km: 990, occurredAt: at, note: 'Çok eski kayıt', expectedVersion: h.odometerVersion, clientRequestId: randomUUID() })
    expect(low.statusCode).toBe(422)
    expect(low.json().error).toMatchObject({ code: 'ODOMETER_OUT_OF_ORDER', details: { problem: 'below_previous', conflict: { km: 1015 } } })
  })
})

describe('upload rate limit', () => {
  it('more than 40 uploads a minute from one user are refused', async () => {
    const adnan = new Client(app)
    expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
    const id = ((await adnan.get('/api/vehicles?q=E45-M-218')).json().items as { id: string }[])[0]!.id
    const tiny = Buffer.from('not an image')
    for (let i = 0; i < 40; i++) expect((await adnan.upload(`/api/vehicles/${id}/photos`, tiny, 'x.jpg')).statusCode).not.toBe(429)
    const res = await adnan.upload(`/api/vehicles/${id}/photos`, tiny, 'x.jpg')
    expect(res.statusCode).toBe(429)
    // Another user is not affected.
    const selma = new Client(app)
    expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
    expect((await selma.upload(`/api/vehicles/${id}/photos`, tiny, 'x.jpg')).statusCode).not.toBe(429)
  })
})

describe('production configuration warnings', () => {
  it('flags development defaults only in production', async () => {
    const { productionWarnings } = await import('../src/env')
    const { env } = await import('./helpers')
    expect(productionWarnings({ ...env, NODE_ENV: 'development' })).toEqual([])
    const w = productionWarnings({ ...env, NODE_ENV: 'production', STORAGE_DIR: undefined, WEB_ORIGIN: 'http://localhost:5173', TRUST_PROXY: undefined, MALWARE_SCANNER: 'none' })
    expect(w).toHaveLength(5)
    expect(productionWarnings({ ...env, NODE_ENV: 'production', STORAGE_DIR: '/srv/acarvo/files', WEB_ORIGIN: 'https://app.acarvo.example', TRUST_PROXY: '10.0.0.5', MALWARE_SCANNER: 'clamav' })).toEqual([])
  })
})
