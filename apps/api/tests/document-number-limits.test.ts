import { Writable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DOCUMENT_NUMBER_CHECK_LIMITS } from '../src/lib/sensitive-actions'
import { appPool, asApp, asOwner, asOwnerAs, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// M2 hardening: typed document numbers are limited in the database (per user in a company, and per user across
// companies), so nobody can learn by trying many numbers which ones are on file. Counters are append-only under RLS.

let data: DevData
let app: FastifyInstance
let adnan: Client // Sahip in Drina, Yönetici in Neretva
let lejla: Client // Sahip in Neretva
let logs = ''
const users: Record<string, string> = {}
const customers: Record<string, string> = {}

const lookup = (c: Client, number: string) => c.post('/api/customers/document-lookup', { type: 'national_id', issuingCountry: 'BA', number })
const clearCounters = () => asOwner(null, 'truncate user_sensitive_actions')
/** Number checks of one user, in all companies (the counter rows are visible to their own user). */
const checks = async (userId: string) =>
  (await asOwnerAs(data.companies.drina, userId, `select count(*)::int n from user_sensitive_actions where user_id = $1 and action = 'document_number_check'`, [userId])).rows[0].n as number
const fill = (companyId: string, userId: string, n: number, ageMinutes = 0) =>
  asOwnerAs(
    companyId,
    userId,
    `insert into user_sensitive_actions (user_id, company_id, action, at) select $1, $2, 'document_number_check', now() - make_interval(mins => $3::int) from generate_series(1, $4::int)`,
    [userId, companyId, ageMinutes, n],
  )
async function login(email: string, on = app) {
  const c = new Client(on)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}
async function userWithRole(email: string, permissions: string[]) {
  const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, $2, $3) returning id`, [data.companies.drina, `Test ${email}`, permissions])).rows[0].id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select $1, 'Test Kullanıcı', password_hash from users where email = $2 returning id`, [email, EMAILS.adnan])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  return { user: user as string, client: await login(email) }
}

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (chunk, _enc, done) => ((logs += chunk.toString()), done()) }) })
  adnan = await login(EMAILS.adnan)
  lejla = await login(EMAILS.lejla)
  for (const [k, email] of Object.entries(EMAILS)) users[k] = (await asOwner(null, `select id from users where email = $1`, [email])).rows[0].id
  for (const name of ['Ajla Testović', 'Emir Primjerović', 'Kenan Örnek']) {
    customers[name] = (await asOwner(data.companies.drina, `select id from customers where display_name = $1`, [name])).rows[0].id
  }
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('typed document numbers are limited in the database', () => {
  it('limits are generous for real work and stop sweeps', () => {
    expect(DOCUMENT_NUMBER_CHECK_LIMITS).toEqual([
      { scope: 'user_company', minutes: 10, max: 30 },
      { scope: 'user_company', minutes: 60, max: 120 },
      { scope: 'user', minutes: 1440, max: 600 },
    ])
  })

  it('serial attempts in one company end in 429 with Retry-After; refused attempts count; no number in answers, history, counters or logs', async () => {
    await clearCounters()
    const emir = customers['Emir Primjerović']!
    // Refused: the number is on file for another customer (409) …
    expect((await adnan.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })).statusCode).toBe(409)
    // … and invalid fields (400): both still count.
    expect((await adnan.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'ZZZ', number: 'TEST-SERIAL-002' })).statusCode).toBe(400)
    expect((await lookup(adnan, 'TEST-SERIAL-003')).json()).toEqual({ matches: [] })
    expect(await checks(users.adnan!)).toBe(3)

    await fill(data.companies.drina, users.adnan!, 26)
    expect((await lookup(adnan, 'TEST-SERIAL-030')).statusCode).toBe(200)
    const blocked = await adnan.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-SERIAL-031' })
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe('DOCUMENT_NUMBER_LIMIT')
    const retry = Number(blocked.headers['retry-after'])
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(600)
    expect(blocked.body).not.toMatch(/TEST-SERIAL|TEST-BA/)
    const blockedLookup = await lookup(adnan, 'TEST-BA-1001')
    expect(blockedLookup.statusCode).toBe(429)
    expect(blockedLookup.body).not.toMatch(/Ajla|TEST-BA/)
    // A blocked attempt is not recorded (the wait does not grow while blocked).
    expect(await checks(users.adnan!)).toBe(30)
    // Work without a number goes on.
    expect((await adnan.post(`/api/customers/${emir}/documents`, { type: 'entry_record', issuingCountry: 'BA', entryDate: '2026-10-01' })).statusCode).toBe(201)

    const counters = (await asOwner(data.companies.drina, `select coalesce(string_agg(row_to_json(u)::text, ' '), '') s from user_sensitive_actions u`)).rows[0].s as string
    expect(counters).not.toMatch(/TEST|SERIAL|1001/)
    expect(Object.keys(JSON.parse(counters.split(' ')[0]!)).sort()).toEqual(['action', 'at', 'company_id', 'id', 'user_id'])
    const history = (await asOwner(data.companies.drina, `select coalesce(string_agg(summary::text, ' '), '') s from audit_log`)).rows[0].s as string
    expect(history).not.toMatch(/TEST-SERIAL|TEST-BA-1001/)
    expect(logs).not.toMatch(/TEST-SERIAL|TEST-BA-1001/)
    expect(logs).toContain('document number check limit reached')
  })

  it('a new session or a restarted server does not reset the limit; other users and companies count separately', async () => {
    // Continues from the previous test: Adnan is at the 10-minute limit in Drina.
    const second = await login(EMAILS.adnan)
    expect((await lookup(second, 'TEST-SERIAL-040')).json().error.code).toBe('DOCUMENT_NUMBER_LIMIT')
    const restarted = await makeApp()
    try {
      expect((await lookup(await login(EMAILS.adnan, restarted), 'TEST-SERIAL-041')).json().error.code).toBe('DOCUMENT_NUMBER_LIMIT')
    } finally {
      await restarted.close()
    }
    // Another user of the same company is not affected.
    const selma = await login(EMAILS.selma)
    expect((await selma.post(`/api/customers/${customers['Kenan Örnek']}/documents`, { type: 'passport', issuingCountry: 'TR', number: 'TEST-TR-PP-1' })).statusCode).toBe(201)
    // In the other company the per-company windows start again, and numbers never match across companies.
    expect((await adnan.post('/api/auth/switch-company', { companyId: data.companies.neretva })).statusCode).toBe(200)
    try {
      const there = await lookup(adnan, 'TEST-BA-1001')
      expect(there.statusCode).toBe(200)
      expect(there.json().matches.map((m: { displayName: string }) => m.displayName)).toEqual(['Dino Neretvić'])
    } finally {
      expect((await adnan.post('/api/auth/switch-company', { companyId: data.companies.drina })).statusCode).toBe(200)
    }
    expect((await lookup(lejla, 'TEST-BA-1001')).json().matches.map((m: { displayName: string }) => m.displayName)).toEqual(['Dino Neretvić'])
  })

  it('the daily limit counts one user across all companies', async () => {
    await clearCounters()
    // 600 checks earlier today, outside the hourly windows, split over both companies.
    await fill(data.companies.drina, users.adnan!, 300, 120)
    await fill(data.companies.neretva, users.adnan!, 300, 120)
    expect((await lookup(adnan, 'TEST-DAY-1')).json().error.code).toBe('DOCUMENT_NUMBER_LIMIT')
    expect((await adnan.post('/api/auth/switch-company', { companyId: data.companies.neretva })).statusCode).toBe(200)
    try {
      expect((await lookup(adnan, 'TEST-DAY-2')).json().error.code).toBe('DOCUMENT_NUMBER_LIMIT')
    } finally {
      await adnan.post('/api/auth/switch-company', { companyId: data.companies.drina })
    }
    // Lejla never reached any limit.
    expect((await lookup(lejla, 'TEST-DAY-3')).statusCode).toBe(200)
  })

  it('concurrent attempts cannot get past the limit', async () => {
    await clearCounters()
    await fill(data.companies.drina, users.adnan!, 25)
    const fresh = await makeApp() // fresh per-minute memory limiter: only the database limit applies
    try {
      const c = await login(EMAILS.adnan, fresh)
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => lookup(c, `TEST-PAR-${i}`)))
      const codes = results.map((r) => r.statusCode).sort()
      expect(codes.filter((s) => s === 200)).toHaveLength(5)
      expect(codes.filter((s) => s === 429)).toHaveLength(5)
      expect(await checks(users.adnan!)).toBe(30)
    } finally {
      await fresh.close()
    }
  })

  it('unauthorized number queries are refused and never counted', async () => {
    await clearCounters()
    const anonymous = await new Client(app).prepare()
    expect((await lookup(anonymous, 'TEST-ANON-1')).statusCode).toBe(401)
    // Documents but not customers: no lookup (it would reveal which customer holds a number).
    const docsOnly = await userWithRole('belgeonly@drina-demo.ba', ['customers.documents.read', 'customers.documents.manage'])
    expect((await lookup(docsOnly.client, 'TEST-NOPE-1')).statusCode).toBe(403)
    expect(await checks(docsOnly.user)).toBe(0)
    // Read only: may not add or correct documents, so typed numbers are refused before any comparison.
    const readOnly = await userWithRole('salt.okur@drina-demo.ba', ['customers.read', 'customers.documents.read'])
    const add = await readOnly.client.post(`/api/customers/${customers['Emir Primjerović']}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })
    expect(add.statusCode).toBe(403)
    expect(add.body).not.toContain('Ajla')
    expect(await checks(readOnly.user)).toBe(0)
    expect((await asOwner(data.companies.drina, `select count(*)::int n from user_sensitive_actions`)).rows[0].n).toBe(0)
  })

  it('corrections and renewals keep working; a kept number is not a typed number', async () => {
    await clearCounters()
    const ajla = customers['Ajla Testović']!
    const lic = ((await adnan.get(`/api/customers/${ajla}/documents`)).json().items as { id: string; type: string; version: number; recordState: string }[]).find(
      (d) => d.type === 'driving_license' && d.recordState === 'active',
    )!
    const corrected = await adnan.put(`/api/customers/${ajla}/documents/${lic.id}`, { issuingCountry: 'BA', validUntil: '2031-05-01', licenseCategories: 'B', version: lic.version })
    expect(corrected.statusCode).toBe(200)
    const renewed = await adnan.post(`/api/customers/${ajla}/documents/${lic.id}/renew`, { issuingCountry: 'BA', validUntil: '2036-05-01', licenseCategories: 'B', keepNumber: true, version: corrected.json().version })
    expect(renewed.statusCode).toBe(201)
    expect(await checks(users.adnan!)).toBe(0)
    const newNumber = await adnan.put(`/api/customers/${ajla}/documents/${renewed.json().id}`, {
      issuingCountry: 'BA',
      validUntil: '2036-05-01',
      licenseCategories: 'B',
      number: 'TEST-DL-3001',
      version: renewed.json().version,
    })
    expect(newNumber.statusCode).toBe(200)
    expect(await checks(users.adnan!)).toBe(1)
  })
})

describe('counters at database level (runtime role)', () => {
  /** A runtime-role transaction in a company and user context, always rolled back. */
  const as = <T>(companyId: string | null, userId: string, fn: (c: import('pg').PoolClient) => Promise<T>) =>
    asApp(companyId, async (c) => {
      await c.query(`select set_config('app.user_id', $1, true)`, [userId])
      return fn(c)
    })

  it('one user cannot read another company’s counters, write counters for someone else, or change or reset any', async () => {
    await clearCounters()
    await fill(data.companies.drina, users.adnan!, 3)
    await fill(data.companies.neretva, users.lejla!, 2)
    const count = (c: import('pg').PoolClient, userId: string) => c.query(`select count(*)::int n from user_sensitive_actions where user_id = $1`, [userId]).then((r) => r.rows[0].n as number)
    // Lejla in Neretva does not see Adnan's Drina counters; without a company only her own rows.
    expect(await as(data.companies.neretva, users.lejla!, (c) => count(c, users.adnan!))).toBe(0)
    expect(await as(null, users.lejla!, (c) => c.query('select count(*)::int n from user_sensitive_actions').then((r) => r.rows[0].n))).toBe(2)
    // Adnan sees his own rows in every company context (limits that count across companies).
    expect(await as(data.companies.neretva, users.adnan!, (c) => count(c, users.adnan!))).toBe(3)
    // Writing for another user or into another company is refused.
    await expect(as(data.companies.neretva, users.lejla!, (c) => c.query(`insert into user_sensitive_actions (user_id, company_id, action) values ($1, $2, 'document_number_check')`, [users.adnan, data.companies.neretva]))).rejects.toThrow(/row-level security/)
    await expect(as(data.companies.neretva, users.lejla!, (c) => c.query(`insert into user_sensitive_actions (user_id, company_id, action) values ($1, $2, 'document_number_check')`, [users.lejla, data.companies.drina]))).rejects.toThrow(/row-level security/)
    // Nobody can edit, delete or truncate counters through the runtime role.
    await expect(as(data.companies.drina, users.adnan!, (c) => c.query(`update user_sensitive_actions set at = now() - interval '1 day'`))).rejects.toThrow(/permission denied/)
    await expect(as(data.companies.drina, users.adnan!, (c) => c.query('delete from user_sensitive_actions'))).rejects.toThrow(/permission denied/)
    await expect(as(data.companies.drina, users.adnan!, (c) => c.query('truncate user_sensitive_actions'))).rejects.toThrow(/permission denied/)
    // Only the two known kinds of action exist.
    await expect(as(data.companies.drina, users.adnan!, (c) => c.query(`insert into user_sensitive_actions (user_id, company_id, action) values ($1, $2, 'reset')`, [users.adnan, data.companies.drina]))).rejects.toThrow(/check constraint/)
    expect(await checks(users.adnan!)).toBe(3)
  })
})
