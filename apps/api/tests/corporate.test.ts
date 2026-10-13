import { Writable } from 'node:stream'
import { type CorporateDetail, type CorporateListResponse, type CorporatePeopleResponse, taxIdWarnings } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// M3: corporate accounts, their records and links to people, on the test database with synthetic data only.

let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip (Yönetici in Neretva)
let selma: Client // Drina Operasyon, branch SJJ only
let lejla: Client // Neretva Sahip
let logs = ''
const ids: Record<string, string> = {}

const search = async (c: Client, body: Record<string, unknown> = {}) => (await c.post('/api/corporate-accounts/search', body)).json() as CorporateListResponse
const account = async (c: Client, id: string) => (await c.get(`/api/corporate-accounts/${id}`)).json() as CorporateDetail
const people = async (c: Client, id: string) => (await c.get(`/api/corporate-accounts/${id}/people`)).json() as CorporatePeopleResponse
const accountId = async (legal: string, companyId = data.companies.drina) => (await asOwner(companyId, `select id from corporate_accounts where legal_name = $1`, [legal])).rows[0].id as string
const customerId = async (name: string, companyId = data.companies.drina) => (await asOwner(companyId, `select id from customers where display_name = $1`, [name])).rows[0].id as string
const auditText = async (companyId = data.companies.drina) =>
  (await asOwner(companyId, `select coalesce(string_agg(summary::text, ' '), '') s from audit_log where entity like 'corporate%'`)).rows[0].s as string

async function login(email: string, on = app) {
  const c = new Client(on)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}
let roleCounter = 0
/** A synthetic user of Drina with a custom role (custom roles are never widened by preset upgrades). */
async function userWithRole(permissions: string[]) {
  roleCounter++
  const email = `ozel${roleCounter}@drina-demo.ba`
  const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, $2, $3) returning id`, [data.companies.drina, `Özel ${roleCounter}`, permissions])).rows[0].id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select $1, 'Özel Kullanıcı', password_hash from users where email = $2 returning id`, [email, EMAILS.adnan])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  return login(email)
}

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (chunk, _e, done) => ((logs += chunk.toString()), done()) }) })
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  ids.ornek = await accountId('Örnek Lojistik d.o.o.')
  ids.primjer = await accountId('Primjer Turizam d.o.o.')
  ids.muster = await accountId('Muster Consulting GmbH')
  ids.stara = await accountId('Stara Firma d.o.o.')
  ids.neretva = await accountId('Neretva Örnek Trgovina d.o.o.', data.companies.neretva)
  ids.ajla = await customerId('Ajla Testović')
  ids.emir = await customerId('Emir Primjerović')
  ids.mirza = await customerId('Mirza Uzorak')
  ids.haris = await customerId('Haris Arhivić')
  ids.dino = await customerId('Dino Neretvić', data.companies.neretva)
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('list and search', () => {
  it('lists the company’s active accounts with primary tax id, primary contact and people counts; archived ones on request', async () => {
    const list = await search(adnan)
    expect(list.items.map((a) => a.legalName)).toEqual(['Muster Consulting GmbH', 'Örnek Lojistik d.o.o.', 'Primjer Turizam d.o.o.'])
    const ornek = list.items.find((a) => a.id === ids.ornek)!
    expect(ornek).toMatchObject({
      accountNo: 'K-00001',
      tradeName: 'Örnek Lojistik',
      country: 'BA',
      primaryTaxId: { country: 'BA', scheme: 'PDV', value: 'TEST-PDV-200501' },
      primaryContact: { kind: 'phone', value: '+387 33 000 501' },
      peopleCount: 3, // the ended link (Sara) is history, not counted
      driverCount: 2,
    })
    expect((await search(adnan, { status: 'archived' })).items.map((a) => a.legalName)).toEqual(['Stara Firma d.o.o.'])
    expect((await search(adnan, { status: 'all' })).total).toBe(4)
    expect((await search(adnan, { people: 'without_people', status: 'all' })).items.map((a) => a.legalName)).toEqual(['Stara Firma d.o.o.'])
    expect((await search(adnan, { country: 'DE' })).items.map((a) => a.accountNo)).toEqual(['K-00003'])
  })

  it('searches by number, name, trade name, tax id, registration number, e-mail and phone, inside the company only', async () => {
    const names = async (c: Client, q: string) => (await search(c, { q, status: 'all' })).items.map((a) => a.legalName)
    expect(await names(adnan, 'K-00003')).toEqual(['Muster Consulting GmbH'])
    expect(await names(adnan, 'ornek lojistik')).toEqual(['Örnek Lojistik d.o.o.'])
    expect(await names(adnan, '200502')).toEqual(['Primjer Turizam d.o.o.'])
    expect(await names(adnan, 'test-hrb 12345')).toEqual(['Muster Consulting GmbH'])
    expect(await names(adnan, 'primjer-turizam')).toEqual(['Primjer Turizam d.o.o.'])
    expect(await names(adnan, '033 000 501')).toEqual(['Örnek Lojistik d.o.o.'])
    // The same synthetic tax value exists in Neretva: each company finds only its own account.
    expect(await names(adnan, 'TEST-PDV-200501')).toEqual(['Örnek Lojistik d.o.o.'])
    expect(await names(lejla, 'TEST-PDV-200501')).toEqual(['Neretva Örnek Trgovina d.o.o.'])
    expect(await names(lejla, 'Örnek Lojistik')).toEqual([])
  })

  it('sorts and pages on the server', async () => {
    const byNo = await search(adnan, { sort: 'accountNo', dir: 'desc', status: 'all' })
    expect(byNo.items.map((a) => a.accountNo)).toEqual(['K-00004', 'K-00003', 'K-00002', 'K-00001'])
    const page2 = await search(adnan, { status: 'all', sort: 'accountNo', pageSize: 25, page: 2 })
    expect(page2).toMatchObject({ items: [], total: 4, page: 2 })
  })
})

describe('company isolation', () => {
  it('another company’s account id answers 404 everywhere, also when the id is known', async () => {
    for (const res of [
      await lejla.get(`/api/corporate-accounts/${ids.ornek}`),
      await lejla.get(`/api/corporate-accounts/${ids.ornek}/people`),
      await lejla.get(`/api/corporate-accounts/${ids.ornek}/history`),
      await lejla.put(`/api/corporate-accounts/${ids.ornek}`, { legalName: 'X', country: 'BA', version: 1 }),
      await lejla.post(`/api/corporate-accounts/${ids.ornek}/archive`, { version: 1, reason: 'other' }),
      await lejla.post(`/api/corporate-accounts/${ids.ornek}/tax-ids`, { country: 'BA', scheme: 'PDV', value: 'TEST-X-1' }),
      await lejla.post(`/api/corporate-accounts/${ids.ornek}/people`, { customerId: ids.dino, roles: ['contact'] }),
    ]) {
      expect(res.statusCode).toBe(404)
      expect(res.body).not.toContain('Örnek')
    }
  })

  it('a person of another company cannot be linked (API 404, database foreign key)', async () => {
    const res = await adnan.post(`/api/corporate-accounts/${ids.ornek}/people`, { customerId: ids.dino, roles: ['contact'] })
    expect(res.statusCode).toBe(404)
    expect(res.body).not.toContain('Dino')
    await expect(
      asOwner(data.companies.drina, `insert into corporate_account_people (company_id, account_id, customer_id, roles) values ($1, $2, $3, '{contact}')`, [data.companies.drina, ids.ornek, ids.dino]),
    ).rejects.toThrow(/foreign key/)
    await expect(
      asOwner(data.companies.drina, `insert into corporate_tax_ids (company_id, account_id, country, scheme, value, value_normalized) values ($1, $2, 'BA', 'PDV', 'X1', 'X1')`, [data.companies.drina, ids.neretva]),
    ).rejects.toThrow(/foreign key/)
  })

  it('each table shows only the current company’s rows; without a company nothing', async () => {
    const tables = ['corporate_accounts', 'corporate_contact_channels', 'corporate_tax_ids', 'corporate_addresses', 'corporate_account_people']
    const counts = (companyId: string | null) => asApp(companyId, async (c) => Promise.all(tables.map(async (t) => (await c.query(`select count(*)::int n from ${t}`)).rows[0].n as number)))
    expect(await counts(null)).toEqual([0, 0, 0, 0, 0])
    expect(await counts(data.companies.drina)).toEqual([4, 5, 4, 5, 7])
    expect(await counts(data.companies.neretva)).toEqual([1, 1, 1, 1, 1])
    const moved = await asApp(data.companies.drina, async (c) => (await c.query(`update corporate_accounts set note = 'x' where id = $1`, [ids.neretva])).rowCount)
    expect(moved).toBe(0)
  })

  it('a branch-limited user finds the company’s accounts in every branch (plan §9.2)', async () => {
    expect((await search(selma)).total).toBe(3)
    expect((await selma.get(`/api/corporate-accounts/${ids.primjer}`)).statusCode).toBe(200)
  })
})

describe('permissions', () => {
  it('presets: Sahip and Yönetici may manage, Operasyon may read; custom roles are not widened', async () => {
    const roles = (await asOwner(data.companies.drina, `select name, permissions from roles where name in ('Sahip', 'Yönetici', 'Operasyon') order by name`)).rows as { name: string; permissions: string[] }[]
    const has = (n: string, p: string) => roles.find((r) => r.name === n)!.permissions.includes(p)
    expect([has('Sahip', 'corporate.manage'), has('Yönetici', 'corporate.manage'), has('Operasyon', 'corporate.manage'), has('Operasyon', 'corporate.read')]).toEqual([true, true, false, true])
  })

  it('Operasyon reads but cannot create, edit, archive or link', async () => {
    expect((await selma.post('/api/corporate-accounts', { legalName: 'Yeni Firma', country: 'BA' })).statusCode).toBe(403)
    expect((await selma.put(`/api/corporate-accounts/${ids.primjer}`, { legalName: 'X', country: 'BA', version: 1 })).statusCode).toBe(403)
    expect((await selma.post(`/api/corporate-accounts/${ids.primjer}/archive`, { version: 1, reason: 'other' })).statusCode).toBe(403)
    expect((await selma.post(`/api/corporate-accounts/${ids.primjer}/people`, { customerId: ids.mirza, roles: ['contact'] })).statusCode).toBe(403)
    expect((await selma.post(`/api/corporate-accounts/${ids.primjer}/addresses`, { kind: 'billing', line1: 'X 1', city: 'Y', country: 'BA' })).statusCode).toBe(403)
    expect((await selma.post('/api/corporate-accounts/duplicate-check', { legalName: 'Örnek Lojistik' })).statusCode).toBe(403)
  })

  it('corporate access does not open customer data: people need customers.read too (D10)', async () => {
    const corporateOnly = await userWithRole(['corporate.read', 'corporate.manage'])
    expect((await corporateOnly.get(`/api/corporate-accounts/${ids.ornek}`)).statusCode).toBe(200)
    expect((await corporateOnly.get(`/api/corporate-accounts/${ids.ornek}/people`)).statusCode).toBe(403)
    expect((await corporateOnly.post(`/api/corporate-accounts/${ids.ornek}/people`, { customerId: ids.mirza, roles: ['contact'] })).statusCode).toBe(403)
    expect((await corporateOnly.get(`/api/customers/${ids.ajla}/corporate-links`)).statusCode).toBe(403)
    const customersOnly = await userWithRole(['customers.read'])
    expect((await customersOnly.post('/api/corporate-accounts/search', {})).statusCode).toBe(403)
    expect((await customersOnly.get(`/api/customers/${ids.ajla}/corporate-links`)).statusCode).toBe(403)
    expect((await new Client(app).post('/api/corporate-accounts/search', {})).statusCode).toBe(403) // no CSRF token, no session
    const anonymous = await new Client(app).prepare()
    expect((await anonymous.post('/api/corporate-accounts/search', {})).statusCode).toBe(401)
  })
})

describe('create, numbers and duplicates', () => {
  it('creates an account with channels, an address and a tax id; numbers are per company; the history holds no values', async () => {
    const res = await adnan.post('/api/corporate-accounts', {
      legalName: 'Yeni Örnek Kiralama d.o.o.',
      tradeName: 'Yeni Örnek',
      country: 'BA',
      registrationNumber: 'TEST-REG-7001',
      channels: [
        { kind: 'phone', value: '033 000 777' },
        { kind: 'email', value: 'Ofis@Yeni-Ornek.example.test' },
        { kind: 'email', value: 'fatura@yeni-ornek.example.test', label: 'Fatura', isPrimary: true },
      ],
      address: { kind: 'billing', line1: 'Gizli Sokak 77', city: 'Sarajevo', country: 'BA' },
      taxId: { country: 'BA', scheme: 'pdv', value: 'test pdv 700 1' },
    })
    expect(res.statusCode).toBe(201)
    const a = res.json() as CorporateDetail
    expect(a.accountNo).toBe('K-00005')
    expect(a.channels.map((c) => [c.kind, c.value, c.isPrimary])).toEqual([
      ['email', 'fatura@yeni-ornek.example.test', true],
      ['email', 'ofis@yeni-ornek.example.test', false],
      ['phone', '+387 33 000 777', true],
    ])
    expect(a.taxIds).toMatchObject([{ scheme: 'PDV', value: 'test pdv 700 1', isPrimary: true, validity: 'not_checked' }])
    expect(a.addresses).toMatchObject([{ kind: 'billing', isPrimary: true }])
    ids.yeni = a.id
    const neretva = await lejla.post('/api/corporate-accounts', { legalName: 'Neretva İkinci d.o.o.', country: 'BA' })
    expect(neretva.json().accountNo).toBe('K-00002')
    const history = await auditText()
    expect(history).toContain('"accountNo": "K-00005"')
    expect(history).not.toMatch(/Gizli Sokak|700 ?1|yeni-ornek|000 ?777|TEST-REG-7001/i)
  })

  it('validates without repeating what was typed', async () => {
    const bad = await adnan.post('/api/corporate-accounts', { legalName: ' ', country: 'XX', channels: [{ kind: 'phone', value: 'abc-PRIVATE' }] })
    expect(bad.statusCode).toBe(400)
    expect(Object.keys(bad.json().error.fields)).toEqual(expect.arrayContaining(['legalName', 'country', 'channels.0.value']))
    expect(bad.body).not.toContain('PRIVATE')
    const neretvaBranch = (await asOwner(data.companies.neretva, `select id from branches limit 1`)).rows[0].id
    expect((await adnan.post('/api/corporate-accounts', { legalName: 'Şube Testi', country: 'BA', createdBranchId: neretvaBranch })).json().error.fields.createdBranchId).toBeTruthy()
  })

  it('concurrent creations get distinct, consecutive numbers', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => adnan.post('/api/corporate-accounts', { legalName: `Paralel Firma ${i}`, country: 'BA' })))
    expect(results.every((r) => r.statusCode === 201)).toBe(true)
    const numbers = results.map((r) => r.json().accountNo as string).sort()
    expect(new Set(numbers).size).toBe(8)
    expect(numbers).toEqual(Array.from({ length: 8 }, (_, i) => `K-${String(6 + i).padStart(5, '0')}`))
  })

  it('the same tax id, e-mail or phone in another account is a strong suggestion that needs a decision; a name alone never blocks', async () => {
    const taken = await adnan.post('/api/corporate-accounts', { legalName: 'Başka Turizam', country: 'BA', taxId: { country: 'BA', scheme: 'PDV', value: 'TEST PDV 200502' } })
    expect(taken.statusCode).toBe(409)
    expect(taken.json().error.code).toBe('POSSIBLE_DUPLICATE')
    expect(taken.json().error.details.matches).toEqual([expect.objectContaining({ accountNo: 'K-00002', strength: 'strong', reasons: ['tax_id'] })])
    const ok = await adnan.post('/api/corporate-accounts', { legalName: 'Başka Turizam', country: 'BA', taxId: { country: 'BA', scheme: 'PDV', value: 'TEST PDV 200502' }, duplicateAcknowledged: true })
    expect(ok.statusCode).toBe(201)
    expect(await auditText()).toContain('"acknowledgedDuplicates": ["K-00002"]')
    // Same legal name only: allowed straight away, shown as "possible" in the live check.
    expect((await adnan.post('/api/corporate-accounts', { legalName: 'primjer turizam D.O.O.', country: 'BA' })).statusCode).toBe(201)
    const check = (await adnan.post('/api/corporate-accounts/duplicate-check', { legalName: 'Primjer Turizam d.o.o.', email: 'REZERVACIJE@primjer-turizam.example.test' })).json()
    expect(check.matches.find((m: { accountNo: string }) => m.accountNo === 'K-00002')).toMatchObject({ strength: 'strong', reasons: ['email', 'name'] })
    // Never across companies.
    expect((await lejla.post('/api/corporate-accounts/duplicate-check', { email: 'rezervacije@primjer-turizam.example.test', taxValue: 'TEST-PDV-200502' })).json().matches).toEqual([])
  })
})

describe('duplicate decisions are traceable (product decision of 13.10.2026)', () => {
  it('a tax id or contact shared with another account is saved only after an explicit decision, recorded in the history without the value', async () => {
    const without = await adnan.post(`/api/corporate-accounts/${ids.yeni}/tax-ids`, { country: 'BA', scheme: 'PDV', value: 'TEST-PDV-200502' })
    expect(without.json().error.code).toBe('POSSIBLE_DUPLICATE')
    expect(without.json().error.details.matches).toEqual(expect.arrayContaining([expect.objectContaining({ accountNo: 'K-00002', strength: 'strong', reasons: ['tax_id'] })]))
    expect((await adnan.post(`/api/corporate-accounts/${ids.yeni}/tax-ids`, { country: 'BA', scheme: 'PDV', value: 'TEST-PDV-200502', duplicateAcknowledged: true })).statusCode).toBe(201)
    expect((await adnan.post(`/api/corporate-accounts/${ids.yeni}/channels`, { kind: 'phone', value: '+387 33 000 501', duplicateAcknowledged: true })).statusCode).toBe(201)
    const entries = (
      await asOwner(data.companies.drina, `select action, summary from audit_log where action in ('corporate.tax_id.add', 'corporate.channel.add') and entity_id is not null and summary->>'accountId' = $1 order by created_at`, [ids.yeni])
    ).rows as { action: string; summary: Record<string, unknown> }[]
    expect(entries.map((e) => [e.action, e.summary.acknowledgedDuplicates])).toEqual([
      ['corporate.tax_id.add', expect.arrayContaining(['K-00002'])],
      ['corporate.channel.add', ['K-00001']],
    ])
    expect(JSON.stringify(entries)).not.toMatch(/TEST-PDV|000 ?501|\+387/)
    // Changing a value to one used elsewhere needs the decision too, and it is recorded.
    const a = await account(adnan, ids.yeni)
    const own = a.taxIds.find((t) => t.value === 'test pdv 700 1')!
    const upd = await adnan.put(`/api/corporate-accounts/${ids.yeni}/tax-ids/${own.id}`, { country: 'BA', scheme: 'JIB', value: 'TEST-JIB-4200501', version: own.version })
    expect(upd.json().error.code).toBe('POSSIBLE_DUPLICATE')
    expect((await adnan.put(`/api/corporate-accounts/${ids.yeni}/tax-ids/${own.id}`, { country: 'BA', scheme: 'JIB', value: 'TEST-JIB-4200501', version: own.version, duplicateAcknowledged: true })).statusCode).toBe(200)
    const last = (await asOwner(data.companies.drina, `select summary from audit_log where action = 'corporate.tax_id.update' order by created_at desc limit 1`)).rows[0].summary
    expect(last.acknowledgedDuplicates).toEqual(['K-00001'])
    // Another company's same value is never compared: no decision is asked in Neretva.
    expect((await lejla.post(`/api/corporate-accounts/${ids.neretva}/tax-ids`, { country: 'BA', scheme: 'JIB', value: 'TEST-JIB-4200501' })).statusCode).toBe(201)
    // Nothing was merged: both accounts still exist with their own records.
    expect((await account(adnan, ids.primjer)).taxIds.map((t) => t.value)).toContain('TEST-PDV-200502')
  })
})

describe('edit, archive and restore', () => {
  it('version conflicts answer 409 with the current record; only company facts keep old and new values', async () => {
    const a = await account(adnan, ids.primjer)
    const ok = await adnan.put(`/api/corporate-accounts/${ids.primjer}`, { legalName: 'Primjer Turizam d.o.o.', country: 'HR', note: 'Gizli not', version: a.version })
    expect(ok.statusCode).toBe(200)
    const stale = await adnan.put(`/api/corporate-accounts/${ids.primjer}`, { legalName: 'Başka Ad', country: 'BA', version: a.version })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error).toMatchObject({ code: 'VERSION_CONFLICT', details: { current: { country: 'HR', version: a.version + 1 } } })
    const entry = (await asOwner(data.companies.drina, `select summary from audit_log where action = 'corporate.update' order by created_at desc limit 1`)).rows[0].summary
    expect(entry).toMatchObject({ fields: ['country', 'note'], values: { country: ['BA', 'HR'] } })
    expect(JSON.stringify(entry)).not.toContain('Gizli')
  })

  it('archiving needs a reason, keeps people and their customer records, and blocks edits until restored with a reason', async () => {
    const before = await account(adnan, ids.primjer)
    expect((await adnan.post(`/api/corporate-accounts/${ids.primjer}/archive`, { version: before.version })).statusCode).toBe(400)
    const archived = await adnan.post(`/api/corporate-accounts/${ids.primjer}/archive`, { version: before.version, reason: 'inactive' })
    expect(archived.json()).toMatchObject({ status: 'archived', archivedReason: 'inactive', archivedByName: 'Adnan Kovač', peopleCount: 2 })
    expect((await adnan.get(`/api/customers/${ids.ajla}`)).json().status).toBe('active')
    const v = archived.json().version
    expect((await adnan.put(`/api/corporate-accounts/${ids.primjer}`, { legalName: 'X', country: 'BA', version: v })).json().error.code).toBe('ACCOUNT_ARCHIVED')
    expect((await adnan.post(`/api/corporate-accounts/${ids.primjer}/addresses`, { kind: 'billing', line1: 'X 1', city: 'Y', country: 'BA' })).json().error.code).toBe('ACCOUNT_ARCHIVED')
    expect((await adnan.post(`/api/corporate-accounts/${ids.primjer}/people`, { customerId: ids.mirza, roles: ['contact'] })).json().error.code).toBe('ACCOUNT_ARCHIVED')
    expect((await adnan.post(`/api/corporate-accounts/${ids.primjer}/restore`, { version: v })).statusCode).toBe(400)
    const restored = await adnan.post(`/api/corporate-accounts/${ids.primjer}/restore`, { version: v, reason: 'archived_by_mistake' })
    expect(restored.json()).toMatchObject({ status: 'active', archivedReason: null })
    const actions = (await asOwner(data.companies.drina, `select action, summary->>'reason' as reason from audit_log where entity_id = $1 and action in ('corporate.archive', 'corporate.restore') order by created_at`, [ids.primjer])).rows
    expect(actions).toEqual([
      { action: 'corporate.archive', reason: 'inactive' },
      { action: 'corporate.restore', reason: 'archived_by_mistake' },
    ])
  })
})

describe('tax ids, addresses and channels', () => {
  it('several tax ids in different countries and schemes; hints never decide; one primary; removal promotes another', async () => {
    let a = (await adnan.post(`/api/corporate-accounts/${ids.muster}/tax-ids`, { country: 'AT', scheme: 'UID', value: 'TEST-ATU-99' })).json() as CorporateDetail
    a = (await adnan.post(`/api/corporate-accounts/${ids.muster}/tax-ids`, { country: 'DE', scheme: 'VAT', value: 'ATU123456', note: 'Örnek uyarı' })).json()
    expect(a.taxIds.map((t) => [t.country, t.scheme, t.isPrimary])).toEqual([
      ['DE', 'VAT', true],
      ['AT', 'UID', false],
      ['DE', 'VAT', false],
    ])
    expect(a.taxIds.find((t) => t.value === 'ATU123456')!.warnings).toEqual(['prefix_mismatch'])
    // Separators are normalised away, so they are not "unusual"; the hints are listed, never a verdict.
    expect(a.taxIds.find((t) => t.value === 'TEST-ATU-99')!.warnings).toEqual([])
    expect([taxIdWarnings('BA', 'PDV', 'AB#12345'), taxIdWarnings('BA', 'JIB', '12-3'), taxIdWarnings('GR', 'VAT', 'EL123456789'), taxIdWarnings('DE', 'VAT', 'DE 123 456 789')]).toEqual([
      ['unusual_characters'],
      ['short'],
      [],
      [],
    ])
    const dup = await adnan.post(`/api/corporate-accounts/${ids.muster}/tax-ids`, { country: 'DE', scheme: 'VAT', value: 'de test 123456' })
    expect(dup.json().error.code).toBe('TAX_ID_EXISTS')
    const at = a.taxIds.find((t) => t.scheme === 'UID')!
    a = (await adnan.put(`/api/corporate-accounts/${ids.muster}/tax-ids/${at.id}`, { country: 'AT', scheme: 'UID', value: 'TEST-ATU-99', validity: 'checked_by_staff', isPrimary: true, version: at.version })).json()
    expect(a.taxIds.filter((t) => t.isPrimary).map((t) => t.scheme)).toEqual(['UID'])
    const primary = a.taxIds.find((t) => t.isPrimary)!
    a = (await adnan.post(`/api/corporate-accounts/${ids.muster}/tax-ids/${primary.id}/remove`, { version: primary.version + 0 })).json()
    expect(a.taxIds.map((t) => t.value)).toEqual(['DETEST123456', 'ATU123456'])
    expect(a.taxIds[0]!.isPrimary).toBe(true)
    // A removed record is final, in the API and in the database.
    expect((await adnan.put(`/api/corporate-accounts/${ids.muster}/tax-ids/${primary.id}`, { country: 'AT', scheme: 'UID', value: 'X', version: primary.version + 1 })).statusCode).toBe(404)
    await expect(asOwner(data.companies.drina, `update corporate_tax_ids set note = 'x' where id = $1`, [primary.id])).rejects.toThrow(/removed corporate record/)
  })

  it('stale versions of a record answer 409', async () => {
    const a = await account(adnan, ids.muster)
    const t = a.taxIds[0]!
    expect((await adnan.put(`/api/corporate-accounts/${ids.muster}/tax-ids/${t.id}`, { country: 'DE', scheme: 'VAT', value: 'DETEST123456', note: 'n', version: t.version + 5 })).json().error.code).toBe('VERSION_CONFLICT')
  })

  it('addresses: several per kind, one primary per kind, explicit switch, promotion on removal, kind change', async () => {
    let a = await account(adnan, ids.ornek)
    expect(a.addresses.map((x) => [x.kind, x.city, x.isPrimary])).toEqual([
      ['registered', 'Sarajevo', true],
      ['billing', 'Sarajevo', true],
      ['billing', 'Mostar', false],
    ])
    const mostar = a.addresses.find((x) => x.city === 'Mostar')!
    a = (await adnan.put(`/api/corporate-accounts/${ids.ornek}/addresses/${mostar.id}`, { ...mostar, label: 'Mostar ofisi', isPrimary: true, version: mostar.version })).json()
    expect(a.addresses.filter((x) => x.kind === 'billing').map((x) => [x.city, x.isPrimary])).toEqual([
      ['Mostar', true],
      ['Sarajevo', false],
    ])
    const primary = a.addresses.find((x) => x.city === 'Mostar')!
    const removed = (await adnan.post(`/api/corporate-accounts/${ids.ornek}/addresses/${primary.id}/remove`, { version: primary.version })).json()
    expect(removed.promotedAddressId).toBeTruthy()
    expect(removed.addresses.filter((x: { kind: string }) => x.kind === 'billing')).toMatchObject([{ city: 'Sarajevo', isPrimary: true }])
    a = (await adnan.post(`/api/corporate-accounts/${ids.ornek}/addresses`, { kind: 'postal', line1: 'Pošta 3', city: 'Tuzla', country: 'BA' })).json()
    expect(a.addresses.find((x) => x.kind === 'postal')!.isPrimary).toBe(true)
    // Moving the registered address to "postal" keeps one primary per kind.
    const reg = a.addresses.find((x) => x.kind === 'registered')!
    a = (await adnan.put(`/api/corporate-accounts/${ids.ornek}/addresses/${reg.id}`, { ...reg, kind: 'postal', version: reg.version })).json()
    expect(a.addresses.filter((x) => x.kind === 'postal').map((x) => x.isPrimary).sort()).toEqual([false, true])
    expect(a.addresses.some((x) => x.kind === 'registered')).toBe(false)
    // The database refuses a second primary of a kind.
    await expect(
      asOwner(data.companies.drina, `insert into corporate_addresses (company_id, account_id, kind, line1, city, country, is_primary) values ($1, $2, 'postal', 'X', 'Y', 'BA', true)`, [data.companies.drina, ids.ornek]),
    ).rejects.toThrow(/corporate_addresses_primary_key/)
  })

  it('channels: several of a kind, one primary each; a phone without country code takes the company’s', async () => {
    let a = (await adnan.post(`/api/corporate-accounts/${ids.ornek}/channels`, { kind: 'phone', value: '061 000 999', label: 'Filo' })).json() as CorporateDetail
    const phones = a.channels.filter((c) => c.kind === 'phone')
    expect(phones.map((c) => [c.value, c.isPrimary])).toEqual([
      ['+387 33 000 501', true],
      ['+387 61 000 999', false],
    ])
    const filo = phones[1]!
    a = (await adnan.put(`/api/corporate-accounts/${ids.ornek}/channels/${filo.id}`, { kind: 'phone', value: '061 000 999', label: 'Filo', isPrimary: true, version: filo.version })).json()
    expect(a.channels.filter((c) => c.kind === 'phone' && c.isPrimary).map((c) => c.label)).toEqual(['Filo'])
    // Another account's e-mail needs a decision.
    const shared = await adnan.post(`/api/corporate-accounts/${ids.ornek}/channels`, { kind: 'email', value: 'rezervacije@primjer-turizam.example.test' })
    expect(shared.json().error.code).toBe('POSSIBLE_DUPLICATE')
  })
})

describe('people and drivers', () => {
  it('one person, one record: Ajla is linked to two accounts with different roles', async () => {
    const links = (await adnan.get(`/api/customers/${ids.ajla}/corporate-links`)).json().items
    expect(links.map((l: { account: { accountNo: string }; roles: string[] }) => [l.account.accountNo, l.roles])).toEqual([
      ['K-00001', ['representative', 'authorized_driver']],
      ['K-00002', ['booker']],
    ])
    expect((await asOwner(data.companies.drina, `select count(*)::int n from customers where display_name = 'Ajla Testović'`)).rows[0].n).toBe(1)
  })

  it('links a person with several roles, refuses a second active link, updates roles with history, ends the link without touching the customer', async () => {
    const mirzaBefore = (await adnan.get(`/api/customers/${ids.mirza}`)).json()
    const link = await adnan.post(`/api/corporate-accounts/${ids.ornek}/people`, { customerId: ids.mirza, roles: ['contact', 'booker'], jobTitle: 'Satın alma', validFrom: '2026-01-01' })
    expect(link.statusCode).toBe(201)
    const again = await adnan.post(`/api/corporate-accounts/${ids.ornek}/people`, { customerId: ids.mirza, roles: ['other'] })
    expect(again.json().error.code).toBe('ALREADY_LINKED')
    let row = (await people(adnan, ids.ornek)).items.find((p) => p.customer.id === ids.mirza)!
    expect(row).toMatchObject({ roles: ['contact', 'booker'], jobTitle: 'Satın alma', validFrom: '2026-01-01', active: true })
    const upd = await adnan.put(`/api/corporate-accounts/${ids.ornek}/people/${row.id}`, { roles: ['booker', 'authorized_driver'], jobTitle: 'Satın alma', validFrom: '2026-01-01', version: row.version })
    expect(upd.statusCode).toBe(200)
    expect((await adnan.put(`/api/corporate-accounts/${ids.ornek}/people/${row.id}`, { roles: ['other'], version: row.version })).json().error.code).toBe('VERSION_CONFLICT')
    const entry = (await asOwner(data.companies.drina, `select summary from audit_log where action = 'corporate.person.update' order by created_at desc limit 1`)).rows[0].summary
    expect(entry).toMatchObject({ customerNo: mirzaBefore.customerNo, fields: ['roles'], roles: [['booker', 'contact'], ['authorized_driver', 'booker']] })
    row = (await people(adnan, ids.ornek)).items.find((p) => p.customer.id === ids.mirza)!
    expect((await adnan.post(`/api/corporate-accounts/${ids.ornek}/people/${row.id}/end`, { version: row.version })).statusCode).toBe(400)
    expect((await adnan.post(`/api/corporate-accounts/${ids.ornek}/people/${row.id}/end`, { version: row.version, reason: 'left_company' })).statusCode).toBe(200)
    const after = (await people(adnan, ids.ornek)).items.filter((p) => p.customer.id === ids.mirza)
    expect(after).toMatchObject([{ active: false, endedReason: 'left_company', endedByName: 'Adnan Kovač' }])
    const mirzaAfter = (await adnan.get(`/api/customers/${ids.mirza}`)).json()
    expect({ status: mirzaAfter.status, version: mirzaAfter.version }).toEqual({ status: 'active', version: mirzaBefore.version })
    // An ended link is history: no changes in the API or the database; linking again opens a new link.
    expect((await adnan.put(`/api/corporate-accounts/${ids.ornek}/people/${row.id}`, { roles: ['other'], version: row.version + 1 })).json().error.code).toBe('LINK_ENDED')
    await expect(asOwner(data.companies.drina, `update corporate_account_people set note = 'x' where id = $1`, [row.id])).rejects.toThrow(/ended corporate link/)
    expect((await adnan.post(`/api/corporate-accounts/${ids.ornek}/people`, { customerId: ids.mirza, roles: ['contact'] })).statusCode).toBe(201)
    expect((await people(adnan, ids.ornek)).items.filter((p) => p.customer.id === ids.mirza).map((p) => p.active)).toEqual([true, false])
    // The person's history shows the link events to users who may read corporate accounts.
    const history = (await adnan.get(`/api/customers/${ids.mirza}/history`)).json().items.map((i: { action: string }) => i.action)
    expect(history).toEqual(expect.arrayContaining(['corporate.person.link', 'corporate.person.update', 'corporate.person.end']))
    const customersOnly = await userWithRole(['customers.read'])
    expect((await customersOnly.get(`/api/customers/${ids.mirza}/history`)).json().items.map((i: { action: string }) => i.action)).not.toContain('corporate.person.link')
  })

  it('concurrent links of the same person end in one link', async () => {
    const results = await Promise.all([1, 2, 3].map(() => adnan.post(`/api/corporate-accounts/${ids.muster}/people`, { customerId: ids.emir, roles: ['contact'] })))
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409])
  })

  it('validates roles and periods; archived customers cannot be linked', async () => {
    const bad = async (body: Record<string, unknown>) => (await adnan.post(`/api/corporate-accounts/${ids.muster}/people`, { customerId: ids.mirza, ...body })).json().error
    expect((await bad({ roles: [] })).fields.roles).toBeTruthy()
    expect((await bad({ roles: ['admin'] })).code).toBe('VALIDATION')
    expect((await bad({ roles: ['contact', 'contact'] })).fields.roles).toBeTruthy()
    expect((await bad({ roles: ['contact'], validFrom: '2026-05-01', validUntil: '2026-04-01' })).fields.validUntil).toBeTruthy()
    expect((await bad({ roles: ['contact'], customerId: ids.haris })).code).toBe('CUSTOMER_ARCHIVED')
  })

  it('driver licence summaries only with the customer document permission; never a number (M2 stays in force)', async () => {
    const full = await people(adnan, ids.ornek)
    expect(full.licenceShown).toBe(true)
    const drivers = Object.fromEntries(full.items.filter((p) => p.active && p.roles.includes('authorized_driver')).map((p) => [p.customer.displayName, p.licence?.state]))
    expect(drivers).toMatchObject({ 'Ajla Testović': 'expiring', 'Emir Primjerović': 'missing' })
    expect(full.items.find((p) => p.customer.displayName === 'Lena Beispiel')!.licence).toBeNull() // not a driver of this account
    expect((await people(adnan, ids.muster)).items.find((p) => p.customer.displayName === 'Lena Beispiel')!.licence).toMatchObject({ state: 'valid' })
    const body = JSON.stringify(full)
    expect(body).not.toMatch(/TEST-DL|TESTDL|number|•/)
    // Corporate and customer read, but no document permission: names yes, licence data no; documents stay closed.
    const noDocs = await userWithRole(['corporate.read', 'corporate.manage', 'customers.read'])
    const limited = await people(noDocs, ids.ornek)
    expect(limited.licenceShown).toBe(false)
    expect(limited.items.every((p) => p.licence === null)).toBe(true)
    expect((await noDocs.get(`/api/customers/${ids.ajla}/documents`)).statusCode).toBe(403)
    // Linking someone as a driver grants nothing either.
    const link = await noDocs.post(`/api/corporate-accounts/${ids.muster}/people`, { customerId: ids.ajla, roles: ['authorized_driver'] })
    expect(link.statusCode).toBe(201)
    expect((await noDocs.get(`/api/customers/${ids.ajla}/documents`)).statusCode).toBe(403)
  })
})

describe('database level and leaks', () => {
  it('the runtime role cannot delete corporate records; identity columns cannot change', async () => {
    for (const t of ['corporate_accounts', 'corporate_contact_channels', 'corporate_tax_ids', 'corporate_addresses', 'corporate_account_people']) {
      await expect(asApp(data.companies.drina, (c) => c.query(`delete from ${t}`))).rejects.toThrow(/permission denied/)
    }
    await expect(asApp(data.companies.drina, (c) => c.query(`update corporate_accounts set account_no = 'K-99999' where id = $1`, [ids.ornek]))).rejects.toThrow(/cannot change/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update corporate_addresses set account_id = $1 where account_id = $2`, [ids.muster, ids.ornek]))).rejects.toThrow(/cannot change/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update corporate_account_people set customer_id = $1 where account_id = $2`, [ids.mirza, ids.primjer]))).rejects.toThrow(/cannot change/)
  })

  it('no tax id, address, phone or e-mail value in the history or the server log', async () => {
    await search(adnan, { q: 'TEST-PDV-200501' })
    const history = await auditText()
    expect(history).not.toMatch(/TEST-PDV|TEST-JIB|DETEST|ATU123|Örnek Caddesi|Fatura Sokak|Pošta 3|@|\+387|000 ?999/)
    expect(logs).not.toMatch(/TEST-PDV|Fatura Sokak|primjer-turizam|061 000 999/)
  })
})
