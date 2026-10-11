import { Writable } from 'node:stream'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { customerCryptoFromEnv } from '../src/lib/customer-crypto'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, env, makeApp, ownerPool, resetDatabase } from './helpers'

// M2c: customer document records. Synthetic numbers ("TEST-…") and per-run synthetic keys only.

let data: DevData
let app: FastifyInstance
let adnan: Client
let selma: Client
let lejla: Client
const crypto = customerCryptoFromEnv(env).crypto!

type Doc = { id: string; type: string; maskedNumber: string | null; validity: { state: string; daysLeft: number | null }; version: number; recordState: string; renewsId: string | null; renewedById: string | null; verification: string; verifiedByName: string | null }
const customerId = async (c: Client, name: string) =>
  ((await c.post('/api/customers/search', { q: name, status: 'all' })).json().items as { id: string; displayName: string }[]).find((i) => i.displayName === name)!.id
const docs = async (c: Client, id: string) => (await c.get(`/api/customers/${id}/documents`)).json().items as Doc[]
const hex = (s: string) => Buffer.from(s).toString('hex')

let ajla: string
let emir: string
let dino: string

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  selma = new Client(app)
  lejla = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
  expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
  ajla = await customerId(adnan, 'Ajla Testović')
  emir = await customerId(adnan, 'Emir Primjerović')
  dino = await customerId(lejla, 'Dino Neretvić')
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('database', () => {
  it('documents and files are company-isolated', async () => {
    const count = (companyId: string | null) => asApp(companyId, async (c) => (await c.query('select count(*)::int n from customer_documents')).rows[0].n as number)
    expect(await count(null)).toBe(0)
    expect(await count(data.companies.drina)).toBe(7)
    expect(await count(data.companies.neretva)).toBe(1)
  })

  it('no document number is stored in plaintext anywhere in the table or the audit log', async () => {
    const rows = (await asOwner(data.companies.drina, `select row_to_json(d)::text as j from customer_documents d`)).rows.map((r) => r.j as string).join('\n')
    for (const n of ['TEST-BA-1001', 'TESTBA1001', 'TESTC0100001', 'TESTDL2001']) {
      expect(rows).not.toContain(n)
      expect(rows.toLowerCase()).not.toContain(hex(n))
    }
    const audit = (await asOwner(data.companies.drina, `select coalesce(string_agg(summary::text, ' '), '') as s from audit_log`)).rows[0].s as string
    expect(audit).not.toMatch(/TEST-?BA|TESTC01/)
  })

  it('the runtime role cannot delete documents or files, nor rewrite file records', async () => {
    await expect(asApp(data.companies.drina, (c) => c.query('delete from customer_documents'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from customer_files'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('update customer_document_files set side = side'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from user_sensitive_actions'))).rejects.toThrow(/permission denied/)
  })

  it('a document cannot belong to another company’s customer, move to another customer, or change after voiding', async () => {
    await expect(
      asOwner(data.companies.drina, `insert into customer_documents (id, company_id, customer_id, type, issuing_country) values (gen_random_uuid(), $1, $2, 'visa', 'BA')`, [data.companies.drina, dino]),
    ).rejects.toThrow(/foreign key/)
    const doc = (await asOwner(data.companies.drina, `select id from customer_documents where customer_id = $1 limit 1`, [ajla])).rows[0].id
    await expect(asApp(data.companies.drina, (c) => c.query('update customer_documents set customer_id = $1 where id = $2', [emir, doc]))).rejects.toThrow(/cannot change/)
  })

  it('an encrypted number copied to another document does not decrypt', async () => {
    const [a, b] = (await asOwner(data.companies.drina, `select id, number_ciphertext, number_key_id from customer_documents where number_ciphertext is not null order by id limit 2`)).rows
    expect(crypto.decrypt(data.companies.drina, 'number', a.id, a.number_ciphertext, a.number_key_id).toString()).toMatch(/^TEST/)
    expect(() => crypto.decrypt(data.companies.drina, 'number', b.id, a.number_ciphertext, a.number_key_id)).toThrow(/Decryption failed/)
    expect(() => crypto.decrypt(data.companies.neretva, 'number', a.id, a.number_ciphertext, a.number_key_id)).toThrow(/Decryption failed/)
  })
})

describe('listing and validity', () => {
  it('shows masked numbers only and computes expiry from the company date', async () => {
    const res = await adnan.get(`/api/customers/${ajla}/documents`)
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toMatch(/TEST-?BA-?1001|TEST-?DL/)
    const body = res.json()
    expect(body).toMatchObject({ warningDays: 30, keysConfigured: true })
    const byType = Object.fromEntries((body.items as Doc[]).map((d) => [d.type, d]))
    expect(byType.national_id).toMatchObject({ maskedNumber: '••••1001', validity: { state: 'valid' }, verification: 'original_seen' })
    expect(byType.driving_license).toMatchObject({ maskedNumber: '••••2001', validity: { state: 'expiring', daysLeft: 12 } })
    const john = await docs(adnan, await customerId(adnan, 'John Sample'))
    expect(john[0]).toMatchObject({ type: 'passport', validity: { state: 'expired', daysLeft: -20 } })
    const lena = await docs(adnan, await customerId(adnan, 'Lena Beispiel'))
    expect(lena.find((d) => d.type === 'entry_record')).toMatchObject({ maskedNumber: null, validity: { state: 'no_expiry' } })
  })
})

describe('customer list document summary', () => {
  it('counts current periods that are expired or expiring and filters on them', async () => {
    const all = (await adnan.post('/api/customers/search', { pageSize: 100 })).json().items as { displayName: string; documents: { total: number; expired: number; expiring: number } }[]
    expect(all.find((i) => i.displayName === 'Ajla Testović')!.documents).toEqual({ total: 2, expired: 0, expiring: 1 })
    expect(all.find((i) => i.displayName === 'John Sample')!.documents).toEqual({ total: 1, expired: 1, expiring: 0 })
    expect(all.find((i) => i.displayName === 'Mirza Uzorak')!.documents).toEqual({ total: 0, expired: 0, expiring: 0 })
    const attention = (await adnan.post('/api/customers/search', { documents: 'attention' })).json().items.map((i: { displayName: string }) => i.displayName)
    expect(attention.sort()).toEqual(['Ajla Testović', 'John Sample'])
    expect((await adnan.post('/api/customers/search', { documents: 'expired' })).json().items.map((i: { displayName: string }) => i.displayName)).toEqual(['John Sample'])
  })
})

describe('adding and correcting documents', () => {
  it('adds a document with an encrypted number; an Operasyon user may add', async () => {
    const res = await selma.post(`/api/customers/${emir}/documents`, { type: 'passport', issuingCountry: 'ba', number: ' test-pp 77 01 ', issuedOn: '2024-01-10', validUntil: '2034-01-09', verification: 'original_seen' })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ type: 'passport', issuingCountry: 'BA', maskedNumber: '••••7701', verification: 'original_seen', verifiedByName: 'Selma Karić', version: 1 })
    expect(res.body).not.toContain('TESTPP7701')
    const stored = (await asOwner(data.companies.drina, `select number_ciphertext, number_key_id from customer_documents where id = $1`, [res.json().id])).rows[0]
    expect(crypto.decrypt(data.companies.drina, 'number', res.json().id, stored.number_ciphertext, stored.number_key_id).toString()).toBe('TESTPP7701')
  })

  it('explains invalid input per type without repeating the typed value', async () => {
    const missing = await adnan.post(`/api/customers/${emir}/documents`, { type: 'driving_license', issuingCountry: 'BA' })
    expect(missing.json().error.fields).toMatchObject({ number: expect.any(String) })
    const bad = await adnan.post(`/api/customers/${emir}/documents`, { type: 'passport', issuingCountry: 'BA', number: 'gizli*değer!', validFrom: '2030-01-01', validUntil: '2029-01-01' })
    expect(Object.keys(bad.json().error.fields).sort()).toEqual(['number', 'validUntil'])
    expect(bad.body).not.toContain('gizli')
    expect((await adnan.post(`/api/customers/${emir}/documents`, { type: 'entry_record', issuingCountry: 'BA', number: 'TEST123' })).json().error.fields).toMatchObject({ number: expect.any(String), entryDate: expect.any(String) })
    expect((await adnan.post(`/api/customers/${emir}/documents`, { type: 'other' })).json().error.fields).toMatchObject({ title: expect.any(String) })
  })

  it('a number active for another customer of the same company is refused; another company is never consulted', async () => {
    const dup = await adnan.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('DOCUMENT_NUMBER_IN_USE')
    expect(dup.json().error.details.otherCustomer).toEqual({ customerNo: 'M-000001', displayName: 'Ajla Testović' })
    expect(dup.body).not.toMatch(/TEST-?BA/)
    // The same synthetic number exists in Neretva (Dino); in Drina it only ever matches Drina's Ajla.
    expect(dup.body).not.toContain('Dino')
    // Different type or issuing country is a different document number.
    expect((await adnan.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'HR', number: 'TEST-BA-1001' })).statusCode).toBe(201)
  })

  it('corrects a period with a version check; a new number replaces the old one, an empty field keeps it', async () => {
    const lic = (await docs(adnan, ajla)).find((d) => d.type === 'driving_license')!
    const kept = await adnan.put(`/api/customers/${ajla}/documents/${lic.id}`, { issuingCountry: 'BA', validUntil: '2031-05-01', licenseCategories: 'B, BE', version: lic.version })
    expect(kept.statusCode, kept.body).toBe(200)
    expect(kept.json()).toMatchObject({ maskedNumber: '••••2001', validUntil: '2031-05-01', licenseCategories: ['B', 'BE'], version: lic.version + 1 })
    const stale = await adnan.put(`/api/customers/${ajla}/documents/${lic.id}`, { issuingCountry: 'BA', validUntil: '2032-05-01', version: lic.version })
    expect(stale.json().error.code).toBe('VERSION_CONFLICT')
    expect(stale.json().error.details.current.version).toBe(lic.version + 1)
    const replaced = await adnan.put(`/api/customers/${ajla}/documents/${lic.id}`, { issuingCountry: 'BA', validUntil: '2031-05-01', licenseCategories: 'B, BE', number: 'TEST-DL-2999', version: lic.version + 1 })
    expect(replaced.json().maskedNumber).toBe('••••2999')
    const log = (await asOwner(data.companies.drina, `select summary from audit_log where entity = 'customer_document' and entity_id = $1 order by created_at`, [lic.id])).rows.map((r) => r.summary)
    expect(log.map((s) => s.fields)).toEqual([expect.arrayContaining(['validUntil', 'licenseCategories']), ['number']])
    expect(JSON.stringify(log)).not.toMatch(/2999|2001|TEST/)
  })

  it('verification is recorded with who and when', async () => {
    const lena = await customerId(adnan, 'Lena Beispiel')
    const lic = (await docs(adnan, lena)).find((d) => d.type === 'driving_license')!
    const res = await selma.post(`/api/customers/${lena}/documents/${lic.id}/verify`, { version: lic.version, verification: 'original_seen' })
    expect(res.json()).toMatchObject({ verification: 'original_seen', verifiedByName: 'Selma Karić' })
  })
})

describe('renewal and voiding', () => {
  it('a renewal opens a new period, keeps the old one untouched and may keep the number; a period renews once', async () => {
    const id = (await docs(adnan, ajla)).find((d) => d.type === 'national_id')!
    const res = await adnan.post(`/api/customers/${ajla}/documents/${id.id}/renew`, { issuingCountry: 'BA', issuedOn: '2026-10-01', validUntil: '2036-09-30', keepNumber: true, version: id.version })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ type: 'national_id', maskedNumber: '••••1001', renewsId: id.id, validity: { state: 'valid' } })
    const old = (await docs(adnan, ajla)).find((d) => d.id === id.id)!
    expect(old).toMatchObject({ recordState: 'active', renewedById: res.json().id, version: id.version, validity: { state: 'superseded' } })
    const twice = await adnan.post(`/api/customers/${ajla}/documents/${id.id}/renew`, { issuingCountry: 'BA', validUntil: '2037-01-01', keepNumber: true, version: id.version })
    expect(twice.json().error.code).toBe('ALREADY_RENEWED')
  })

  it('voiding needs a reason, is final, and frees the number for the right customer', async () => {
    const created = (await adnan.post(`/api/customers/${emir}/documents`, { type: 'visa', issuingCountry: 'BA', number: 'TEST-VISA-55' })).json()
    expect((await adnan.post(`/api/customers/${emir}/documents/${created.id}/void`, { version: created.version })).statusCode).toBe(400)
    const voided = await adnan.post(`/api/customers/${emir}/documents/${created.id}/void`, { version: created.version, reason: 'wrong_customer' })
    expect(voided.json()).toMatchObject({ recordState: 'voided', voidedReason: 'wrong_customer', validity: { state: 'voided' } })
    expect((await adnan.put(`/api/customers/${emir}/documents/${created.id}`, { issuingCountry: 'BA', version: voided.json().version })).json().error.code).toBe('DOCUMENT_VOIDED')
    const sara = await customerId(adnan, 'Sara Probić')
    expect((await adnan.post(`/api/customers/${sara}/documents`, { type: 'visa', issuingCountry: 'BA', number: 'TEST-VISA-55' })).statusCode).toBe(201)
  })

  it('the customer history includes document events, without values', async () => {
    const items = (await adnan.get(`/api/customers/${ajla}/history`)).json().items as { action: string }[]
    expect(items.map((i) => i.action)).toEqual(expect.arrayContaining(['customer.document.update', 'customer.document.renew']))
  })
})

describe('access', () => {
  it('another company cannot read or change the documents, even with their ids', async () => {
    const id = (await docs(adnan, ajla))[0]!.id
    expect((await lejla.get(`/api/customers/${ajla}/documents`)).statusCode).toBe(404)
    expect((await lejla.put(`/api/customers/${ajla}/documents/${id}`, { issuingCountry: 'BA', version: 1 })).statusCode).toBe(404)
    expect((await lejla.put(`/api/customers/${dino}/documents/${id}`, { issuingCountry: 'BA', version: 1 })).statusCode).toBe(404)
    expect((await lejla.get(`/api/customers/${dino}/documents/${id}/history`)).statusCode).toBe(404)
  })

  it('exact lookup finds only the holder in the user’s own company', async () => {
    const drina = await adnan.post('/api/customers/document-lookup', { type: 'national_id', issuingCountry: 'BA', number: 'test ba 1001' })
    expect(drina.json().matches).toEqual([expect.objectContaining({ displayName: 'Ajla Testović' })])
    const neretva = await lejla.post('/api/customers/document-lookup', { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })
    expect(neretva.json().matches).toEqual([expect.objectContaining({ displayName: 'Dino Neretvić' })])
    expect(drina.body + neretva.body).not.toMatch(/TEST-?BA/)
  })

  it('without the document permission nothing is visible; archived customers’ documents cannot change', async () => {
    const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Yalnız müşteri', array['customers.read']) returning id`, [data.companies.drina])).rows[0].id
    const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'belgesiz@drina-demo.ba', 'Belgesiz Test', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
    const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
    await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
    const reader = new Client(app)
    expect((await reader.login('belgesiz@drina-demo.ba')).statusCode).toBe(200)
    expect((await reader.get(`/api/customers/${ajla}/documents`)).statusCode).toBe(403)
    expect((await reader.post('/api/customers/document-lookup', { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })).statusCode).toBe(403)
    const haris = await customerId(adnan, 'Haris Arhivić')
    expect((await adnan.post(`/api/customers/${haris}/documents`, { type: 'visa', issuingCountry: 'BA' })).json().error.code).toBe('CUSTOMER_ARCHIVED')
  })

  it('without configured keys numbers are refused (nothing is stored in plaintext); records without numbers still work', async () => {
    const closed = await makeApp({ envOverride: { CUSTOMER_DATA_KEYS: undefined, CUSTOMER_DATA_KEY_ACTIVE: undefined, CUSTOMER_LOOKUP_KEYS: undefined, CUSTOMER_LOOKUP_KEY_ACTIVE: undefined } })
    try {
      const c = new Client(closed)
      expect((await c.login(EMAILS.adnan)).statusCode).toBe(200)
      const list = (await c.get(`/api/customers/${ajla}/documents`)).json()
      expect(list.keysConfigured).toBe(false)
      expect(list.items.length).toBeGreaterThan(0)
      const refused = await c.post(`/api/customers/${emir}/documents`, { type: 'passport', issuingCountry: 'BA', number: 'TEST-NOKEY-1' })
      expect(refused.statusCode).toBe(503)
      expect(refused.json().error.code).toBe('CUSTOMER_KEYS_MISSING')
      expect((await c.post(`/api/customers/${emir}/documents`, { type: 'entry_record', issuingCountry: 'BA', entryDate: '2026-10-01' })).statusCode).toBe(201)
      expect((await asOwner(data.companies.drina, `select count(*)::int n from customer_documents where number_hint = 'EY1'`)).rows[0].n).toBe(0)
    } finally {
      await closed.close()
    }
  })

  it('document numbers never reach the logs', async () => {
    const lines: string[] = []
    const logged = await makeApp({ logStream: new Writable({ write: (chunk, _e, done) => (lines.push(String(chunk)), done()) }) })
    try {
      const c = new Client(logged)
      expect((await c.login(EMAILS.adnan)).statusCode).toBe(200)
      await c.post(`/api/customers/${emir}/documents`, { type: 'passport', issuingCountry: 'AT', number: 'GIZLI-LOG-7788' })
      await c.post(`/api/customers/${emir}/documents`, { type: 'passport', issuingCountry: 'AT', number: 'GIZLI-LOG-7788' })
      await c.post('/api/customers/document-lookup', { type: 'passport', issuingCountry: 'AT', number: 'GIZLI-LOG-7788' })
    } finally {
      await logged.close()
    }
    expect(lines.join('')).toContain('incoming request')
    expect(lines.join('')).not.toMatch(/GIZLI|LOG7788|7788/)
  })
})
