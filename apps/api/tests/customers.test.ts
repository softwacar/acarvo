import { Writable } from 'node:stream'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureTestCustomers } from '../seed/test-customers'
import { upgradePresetRoles } from '../src/db/role-upgrade'
import * as schema from '../src/db/schema'
import { errorForLog } from '../src/lib/log-safety'
import { ROLE_PRESET_HISTORY, ROLE_PRESETS } from '../src/modules/auth/roles'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

let data: DevData
let app: FastifyInstance
let adnan: Client
let lejla: Client
let selma: Client

type Item = { id: string; customerNo: string; displayName: string; phone: string | null; email: string | null; status: string; residency: string; createdBranch: { code: string } | null }
const search = async (c: Client, body: Record<string, unknown> = {}) => {
  const res = await c.post('/api/customers/search', body)
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { items: Item[]; total: number; page: number; pageSize: number }
}
const byName = async (c: Client, name: string) => (await search(c, { q: name, status: 'all' })).items.find((i) => i.displayName === name)!
const detail = async (c: Client, id: string) => (await c.get(`/api/customers/${id}`)).json()
const editable = (d: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  givenName: d.givenName,
  familyName: d.familyName,
  residency: d.residency,
  nationality: d.nationality,
  residenceCountry: d.residenceCountry,
  dateOfBirth: d.dateOfBirth,
  phone: d.phoneRaw,
  email: d.email,
  addressLine1: d.addressLine1,
  addressLine2: d.addressLine2,
  city: d.city,
  postalCode: d.postalCode,
  region: d.region,
  addressCountry: d.addressCountry,
  preferredLanguage: d.preferredLanguage,
  contactPreference: d.contactPreference,
  operationalNote: d.operationalNote,
  version: d.version,
  ...over,
})
const auditFor = async (companyId: string, entityId: string) =>
  (await asOwner(companyId, `select action, summary from audit_log where entity = 'customer' and entity_id = $1 order by created_at`, [entityId])).rows as {
    action: string
    summary: Record<string, unknown>
  }[]

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  lejla = new Client(app)
  selma = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('database', () => {
  it('customer tables are company-isolated: no context sees nothing, each company only its own rows', async () => {
    const count = (companyId: string | null) =>
      asApp(companyId, async (c) => ({
        customers: (await c.query('select count(*)::int n from customers')).rows[0].n,
        sequences: (await c.query('select count(*)::int n from company_sequences')).rows[0].n,
      }))
    expect(await count(null)).toEqual({ customers: 0, sequences: 0 })
    // Three counters per company: customers, corporate accounts and reservations (test data).
    expect(await count(data.companies.drina)).toEqual({ customers: 14, sequences: 3 })
    expect(await count(data.companies.neretva)).toEqual({ customers: 3, sequences: 3 })
  })

  it('the runtime role cannot delete customers or counters', async () => {
    await expect(asApp(data.companies.drina, (c) => c.query('delete from customers'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from company_sequences'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('truncate customers'))).rejects.toThrow(/permission denied/)
  })

  it('cannot read, write or move rows of another company', async () => {
    const neretvaIds = (await asOwner(data.companies.neretva, 'select id from customers')).rows.map((r) => r.id as string)
    const seen = await asApp(data.companies.drina, async (c) => (await c.query('select id from customers where id = any($1)', [neretvaIds])).rows)
    expect(seen).toEqual([])
    const updated = await asApp(data.companies.drina, async (c) => (await c.query(`update customers set city = 'X' where id = any($1)`, [neretvaIds])).rowCount)
    expect(updated).toBe(0)
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into customers (company_id, customer_no, given_name, display_name, name_normalized, email, residency) values ($1, 'M-900001', 'X', 'X', 'x', 'x@example.test', 'local')`, [
          data.companies.neretva,
        ]),
      ),
    ).rejects.toThrow(/row-level security/)
    await expect(asApp(data.companies.drina, (c) => c.query('update customers set company_id = $1', [data.companies.neretva]))).rejects.toThrow(/row-level security|cannot change/)
  })

  it('a customer cannot point to another company branch (composite foreign key)', async () => {
    await expect(
      asOwner(
        data.companies.drina,
        `insert into customers (company_id, customer_no, given_name, display_name, name_normalized, email, residency, created_branch_id) values ($1, 'M-900002', 'X', 'X', 'x', 'x@example.test', 'local', $2)`,
        [data.companies.drina, data.neretva.branches.MOC],
      ),
    ).rejects.toThrow(/foreign key/)
  })

  it('number, company and creation facts are immutable; counters only move forward', async () => {
    await expect(asApp(data.companies.drina, (c) => c.query(`update customers set customer_no = 'M-999999' where customer_no = 'M-000001'`))).rejects.toThrow(/cannot change/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update company_sequences set next_value = 1`))).rejects.toThrow(/only move forward/)
  })

  it('stored values follow the rules: name, contact, phone format, lower-case e-mail, archive reason', async () => {
    const insert = (cols: string, vals: string) => asOwner(data.companies.drina, `insert into customers (company_id, customer_no, display_name, name_normalized, residency, ${cols}) values ($1, 'M-900003', 'X', 'x', 'local', ${vals})`, [data.companies.drina])
    await expect(insert('email', `'a@example.test'`)).rejects.toThrow(/customers_name_check/)
    await expect(insert('given_name', `'X'`)).rejects.toThrow(/customers_contact_check/)
    await expect(insert('given_name, phone_e164', `'X', '061000'`)).rejects.toThrow(/customers_phone_check/)
    await expect(insert('given_name, email', `'X', 'A@Example.test'`)).rejects.toThrow(/customers_email_check/)
    await expect(insert('given_name, email, status', `'X', 'a@example.test', 'archived'`)).rejects.toThrow(/customers_archive_check/)
  })

  it('synthetic customers are only ever loaded into acarvo_test', async () => {
    let inserted = false
    const fakeMain = {
      execute: async () => ({ rows: [{ name: 'acarvo' }] }),
      transaction: async () => {
        inserted = true
      },
    }
    await expect(ensureTestCustomers(fakeMain as never)).rejects.toThrow(/only loaded into acarvo_test/)
    expect(inserted).toBe(false)
  })
})

describe('permissions', () => {
  it('preset roles get the customer permissions once; edited presets and custom roles are untouched', async () => {
    const owner = drizzle(ownerPool, { schema })
    const v3 = ROLE_PRESET_HISTORY.find((h) => h.version === 3)!.presets
    await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Operasyon'`, [[...v3.Operasyon!]])
    await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Yönetici'`, [[...v3['Yönetici']!.filter((p) => p !== 'users.read')]])
    await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Kasa', $2)`, [data.companies.drina, [...v3.Operasyon!]])
    try {
      const first = await upgradePresetRoles(owner)
      // A v3 Operasyon is brought up to the current preset: the customer permissions (and from M2 the document ones).
      expect(first.filter((r) => r.company === 'Drina Rent a Car')).toEqual([
        { company: 'Drina Rent a Car', role: 'Operasyon', added: ROLE_PRESETS.Operasyon!.filter((p) => !v3.Operasyon!.includes(p)) },
      ])
      expect(first[0]!.added).toEqual(expect.arrayContaining(['customers.read', 'customers.manage']))
      expect(await upgradePresetRoles(owner)).toEqual([])
      const roles = (await asOwner(data.companies.drina, `select name, permissions from roles`)).rows as { name: string; permissions: string[] }[]
      expect(roles.find((r) => r.name === 'Operasyon')!.permissions.sort()).toEqual([...ROLE_PRESETS.Operasyon!].sort())
      expect(roles.find((r) => r.name === 'Yönetici')!.permissions).not.toContain('customers.read')
      expect(roles.find((r) => r.name === 'Kasa')!.permissions).not.toContain('customers.read')
    } finally {
      await asOwner(data.companies.drina, `delete from roles where name = 'Kasa'`)
      await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Yönetici'`, [[...ROLE_PRESETS['Yönetici']!]])
      await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Operasyon'`, [[...ROLE_PRESETS.Operasyon!]])
    }
  })

  it('read-only users can list and open but not change; without the permission nothing is reachable', async () => {
    // A synthetic extra user (same run password) with a custom read-only role.
    const user = (
      await asOwner(null, `insert into users (email, name, password_hash) select 'okuyucu@drina-demo.ba', 'Test Okuyucu', password_hash from users where email = $1 returning id`, [EMAILS.adnan])
    ).rows[0].id as string
    const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Müşteri okuma', array['customers.read']) returning id`, [data.companies.drina])).rows[0]
      .id as string
    const membership = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0]
      .id as string
    await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, membership, role])
    const reader = new Client(app)
    expect((await reader.login('okuyucu@drina-demo.ba')).statusCode).toBe(200)
    const list = await search(reader)
    expect(list.total).toBe(13)
    const ajla = list.items.find((i) => i.displayName === 'Ajla Testović')!
    expect((await reader.get(`/api/customers/${ajla.id}`)).statusCode).toBe(200)
    expect((await reader.post('/api/customers', { givenName: 'X', email: 'x@example.test', residency: 'local' })).statusCode).toBe(403)
    expect((await reader.put(`/api/customers/${ajla.id}`, { givenName: 'X', email: 'x@example.test', residency: 'local', version: 1 })).statusCode).toBe(403)
    expect((await reader.post(`/api/customers/${ajla.id}/archive`, { version: 1, reason: 'inactive' })).statusCode).toBe(403)
    expect((await reader.post('/api/customers/duplicate-check', { phone: '+38761000101' })).statusCode).toBe(403)
    // Permissions are checked on every request: removing them closes access at once.
    await asOwner(data.companies.drina, `update roles set permissions = array['vehicles.read'] where id = $1`, [role])
    expect((await reader.post('/api/customers/search', {})).statusCode).toBe(403)
    expect((await reader.get(`/api/customers/${ajla.id}`)).statusCode).toBe(403)
    expect((await reader.get(`/api/customers/${ajla.id}/history`)).statusCode).toBe(403)
  })
})

describe('isolation through the API', () => {
  it('each company has its own customers and its own numbering', async () => {
    const drina = await search(adnan, { status: 'all' })
    const neretva = await search(lejla, { status: 'all' })
    expect(drina.total).toBe(14)
    expect(neretva.total).toBe(3)
    expect(drina.items.map((i) => i.customerNo)).toContain('M-000001')
    expect(neretva.items.map((i) => i.customerNo)).toContain('M-000001')
    expect(neretva.items.map((i) => i.displayName)).not.toContain('Ajla Testović')
  })

  it('a Neretva user cannot reach a Drina customer even with its id', async () => {
    const ajla = await byName(adnan, 'Ajla Testović')
    expect((await lejla.get(`/api/customers/${ajla.id}`)).statusCode).toBe(404)
    expect((await lejla.get(`/api/customers/${ajla.id}/history`)).statusCode).toBe(404)
    expect((await lejla.put(`/api/customers/${ajla.id}`, { givenName: 'X', email: 'x@example.test', residency: 'local', version: 1 })).statusCode).toBe(404)
    expect((await lejla.post(`/api/customers/${ajla.id}/archive`, { version: 1, reason: 'inactive' })).statusCode).toBe(404)
    expect((await lejla.post(`/api/customers/${ajla.id}/restore`, { version: 1 })).statusCode).toBe(404)
    // Searching by the Drina customer's phone, name or e-mail finds nothing in Neretva.
    expect((await search(lejla, { q: '61000101', status: 'all' })).total).toBe(0)
    expect((await search(lejla, { q: 'testovic', status: 'all' })).total).toBe(0)
    // Duplicate suggestions never cross companies.
    const dup = await lejla.post('/api/customers/duplicate-check', { phone: '+38761000101', email: 'ajla.testovic@example.test' })
    expect(dup.json().matches).toEqual([])
    // Nor does the strong duplicate rule: Neretva can save the same phone without any warning about Drina.
    const created = await lejla.post('/api/customers', { givenName: 'Neretva', familyName: 'Ayrı Kişi', phone: '+38761000101', residency: 'local' })
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json().customerNo).toBe('M-000004')
  })

  it('an unknown or malformed id is simply not found', async () => {
    expect((await adnan.get('/api/customers/not-a-uuid')).statusCode).toBe(404)
    expect((await adnan.get('/api/customers/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
  })

  it('a branch-limited user finds customers of every branch of the company and opens records in their own branch', async () => {
    const all = await search(selma)
    expect(all.total).toBe(13)
    expect(new Set(all.items.map((i) => i.createdBranch?.code))).toEqual(new Set(['SJJ', 'SAC', 'MST']))
    const mostar = all.items.find((i) => i.createdBranch?.code === 'MST')!
    expect((await selma.get(`/api/customers/${mostar.id}`)).statusCode).toBe(200)
    const created = await selma.post('/api/customers', { givenName: 'Selma', familyName: 'Kayıt Testi', phone: '+38761555001', residency: 'local' })
    expect(created.statusCode, created.body).toBe(201)
    expect(created.json().createdBranch.code).toBe('SJJ')
    const elsewhere = await selma.post('/api/customers', { givenName: 'Başka', familyName: 'Şube', phone: '+38761555002', residency: 'local', createdBranchId: data.drina.branches.SAC })
    expect(elsewhere.statusCode).toBe(403)
    const otherCompany = await adnan.post('/api/customers', { givenName: 'Yanlış', familyName: 'Şube', phone: '+38761555003', residency: 'local', createdBranchId: data.neretva.branches.MOC })
    expect(otherCompany.statusCode).toBe(400)
  })
})

describe('creating customers', () => {
  it('stores normalised contact data and a company-scoped number; the audit entry holds no personal values', async () => {
    const res = await adnan.post('/api/customers', {
      givenName: '  Lara ',
      familyName: 'Yenikayıt',
      phone: '061 555 010',
      email: 'Lara.Yenikayit@Example.test',
      residency: 'foreign',
      nationality: 'hr',
      dateOfBirth: '1994-06-01',
      city: 'Zagreb',
      addressCountry: 'HR',
      preferredLanguage: 'hr',
      createdBranchId: data.drina.branches.MST,
    })
    expect(res.statusCode, res.body).toBe(201)
    const c = res.json()
    expect(c).toMatchObject({
      givenName: 'Lara',
      displayName: 'Lara Yenikayıt',
      phone: '+387 61 555 010',
      phoneRaw: '061 555 010',
      email: 'lara.yenikayit@example.test',
      residency: 'foreign',
      nationality: 'HR',
      dateOfBirth: '1994-06-01',
      status: 'active',
      version: 1,
      createdBranch: { code: 'MST' },
      createdByName: 'Adnan Kovač',
    })
    expect(c.customerNo).toMatch(/^M-0000\d{2}$/)
    const log = await auditFor(data.companies.drina, c.id)
    expect(log).toHaveLength(1)
    expect(log[0]!.action).toBe('customer.create')
    expect(log[0]!.summary).toEqual({ customerNo: c.customerNo, residency: 'foreign', createdBranchId: data.drina.branches.MST })
    const text = JSON.stringify(log)
    // Whole values only: random ids in the entry may contain any digit sequence.
    for (const personal of ['Lara', 'Yenikay', '61555010', '555 010', 'example.test', '1994-06-01', 'Zagreb']) expect(text).not.toContain(personal)
  })

  it('supports people with a single name', async () => {
    const given = await adnan.post('/api/customers', { givenName: 'Mononim', phone: '+38761555020', residency: 'foreign' })
    const family = await adnan.post('/api/customers', { familyName: 'Soyadlı', phone: '+38761555021', residency: 'local' })
    expect(given.statusCode, given.body).toBe(201)
    expect(family.statusCode, family.body).toBe(201)
    expect(given.json().displayName).toBe('Mononim')
    expect(family.json().displayName).toBe('Soyadlı')
  })

  it('explains missing or invalid fields without repeating what was typed', async () => {
    const none = await adnan.post('/api/customers', {})
    expect(none.statusCode).toBe(400)
    expect(none.json().error.fields).toMatchObject({ givenName: expect.any(String), phone: expect.any(String) })
    // M2 decision K-1: the M1 Yerli/Yabancı classification is no longer required for new customers.
    expect(none.json().error.fields.residency).toBeUndefined()
    const bad = await adnan.post('/api/customers', { givenName: 'Geçersiz', email: 'gizli-deger-XYZ@', phone: 'abc-PRIVATE-123', residency: 'local', nationality: 'QQ', dateOfBirth: '2999-01-01' })
    expect(bad.statusCode).toBe(400)
    expect(Object.keys(bad.json().error.fields).sort()).toEqual(['dateOfBirth', 'email', 'nationality'])
    expect(bad.body).not.toContain('gizli-deger')
    expect(bad.body).not.toContain('XYZ')
    const phone = await adnan.post('/api/customers', { givenName: 'Geçersiz', phone: 'abc-PRIVATE-123', residency: 'local' })
    expect(phone.statusCode).toBe(400)
    expect(phone.json().error.fields.phone).toMatch(/ülke koduyla/i)
    expect(phone.body).not.toContain('PRIVATE')
  })

  it('numbers stay unique and consecutive when many customers are created at the same moment', async () => {
    const before = (await asOwner(data.companies.drina, `select next_value from company_sequences where kind = 'customer'`)).rows[0].next_value as string
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => adnan.post('/api/customers', { givenName: 'Eşzamanlı', familyName: `Test ${i + 1}`, phone: `+3876177${String(i).padStart(4, '0')}`, residency: 'local' })),
    )
    expect(results.map((r) => r.statusCode)).toEqual(Array(20).fill(201))
    const numbers = results.map((r) => Number(r.json().customerNo.slice(2))).sort((a, b) => a - b)
    expect(new Set(numbers).size).toBe(20)
    expect(numbers[0]).toBe(Number(before))
    expect(numbers[19]! - numbers[0]!).toBe(19)
  })

  it('lists, sorts and pages on the server', async () => {
    const page1 = await search(adnan, { sort: 'customerNo', dir: 'desc' })
    expect(page1.total).toBeGreaterThan(25)
    expect(page1.items).toHaveLength(25)
    const nos = page1.items.map((i) => i.customerNo)
    expect([...nos].sort().reverse()).toEqual(nos)
    const page2 = await search(adnan, { sort: 'customerNo', dir: 'desc', page: 2 })
    expect(page2.items.length).toBe(page1.total - 25)
    expect(page2.items.some((i) => nos.includes(i.customerNo))).toBe(false)
    const beyond = await search(adnan, { page: 99 })
    expect(beyond.items).toEqual([])
    expect(beyond.total).toBe(page1.total)
    const foreign = await search(adnan, { residency: 'foreign', pageSize: 100 })
    expect(foreign.items.every((i) => i.residency === 'foreign')).toBe(true)
    const mostar = await search(adnan, { branchId: data.drina.branches.MST, pageSize: 100 })
    expect(mostar.items.every((i) => i.createdBranch?.code === 'MST')).toBe(true)
    expect((await adnan.post('/api/customers/search', { pageSize: 7 })).statusCode).toBe(400)
  })

  it('searches by name without accents, by number, by phone in national form and by e-mail', async () => {
    expect((await search(adnan, { q: 'testovic' })).items.map((i) => i.displayName)).toEqual(['Ajla Testović'])
    expect((await search(adnan, { q: 'AJLA TESTOVIĆ' })).items.map((i) => i.displayName)).toEqual(['Ajla Testović'])
    expect((await search(adnan, { q: 'M-000003' })).items.map((i) => i.displayName)).toEqual(['Lena Beispiel'])
    expect((await search(adnan, { q: '061 000 101' })).items.map((i) => i.displayName)).toEqual(['Ajla Testović'])
    expect((await search(adnan, { q: 'sara.probic@' })).items.map((i) => i.displayName)).toEqual(['Sara Probić'])
    expect((await search(adnan, { q: '%' })).total).toBe(0)
  })

  it('the list is not readable through a URL: there is no GET list or search endpoint', async () => {
    expect((await adnan.get('/api/customers?q=061000101')).statusCode).toBe(404)
    expect((await adnan.get('/api/customers/search?q=testovic')).statusCode).toBe(404)
  })
})

describe('duplicate suggestions', () => {
  it('same phone or e-mail is a strong suggestion with a masked summary; the user decides', async () => {
    const check = await adnan.post('/api/customers/duplicate-check', { phone: '061 000 101' })
    expect(check.statusCode).toBe(200)
    const [m] = check.json().matches
    expect(m).toMatchObject({ customerNo: 'M-000001', displayName: 'Ajla Testović', strength: 'strong', reasons: ['phone'], status: 'active' })
    expect(m.maskedPhone).toContain('•')
    expect(m.maskedPhone).not.toContain('000 1')
    expect(m.maskedEmail).toBe('aj••••@example.test')
    expect(check.body).not.toContain('61000101')

    const email = (await adnan.post('/api/customers/duplicate-check', { email: 'AJLA.TESTOVIC@example.test' })).json().matches
    expect(email.map((x: { reasons: string[] }) => x.reasons)).toEqual([['email']])

    const blocked = await adnan.post('/api/customers', { givenName: 'Ajla', familyName: 'Başka', phone: '+387 61 000 101', residency: 'local' })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error.code).toBe('POSSIBLE_DUPLICATE')
    expect(blocked.json().error.details.matches[0].customerNo).toBe('M-000001')
    const created = await adnan.post('/api/customers', { givenName: 'Ajla', familyName: 'Başka', phone: '+387 61 000 101', residency: 'local', duplicateAcknowledged: true })
    expect(created.statusCode, created.body).toBe(201)
    const log = await auditFor(data.companies.drina, created.json().id)
    expect(log[0]!.summary.acknowledgedDuplicates).toEqual(['M-000001'])
  })

  it('same name and date of birth is only a possible match; a name alone never matches; archived records are shown as archived', async () => {
    const possible = (await adnan.post('/api/customers/duplicate-check', { givenName: 'tarik', familyName: 'TESTIC', dateOfBirth: '1979-01-08' })).json().matches
    expect(possible).toEqual([expect.objectContaining({ customerNo: 'M-000010', strength: 'possible', reasons: ['name_dob'] })])
    expect((await adnan.post('/api/customers/duplicate-check', { givenName: 'Tarik', familyName: 'Testić' })).json().matches).toEqual([])
    expect((await adnan.post('/api/customers/duplicate-check', { givenName: 'Tarik', familyName: 'Testić', dateOfBirth: '1980-01-08' })).json().matches).toEqual([])
    const archived = (await adnan.post('/api/customers/duplicate-check', { phone: '+38761000113' })).json().matches
    expect(archived).toEqual([expect.objectContaining({ displayName: 'Haris Arhivić', status: 'archived' })])
  })

  it('does not suggest the record being edited', async () => {
    const ajla = await byName(adnan, 'Ajla Testović')
    const res = (await adnan.post('/api/customers/duplicate-check', { email: 'ajla.testovic@example.test', excludeId: ajla.id })).json().matches
    expect(res).toEqual([])
  })
})

describe('editing, conflicts and archiving', () => {
  it('saves changes with a new version; the audit entry names the changed fields but copies no personal values', async () => {
    const ajla = await byName(adnan, 'Ajla Testović')
    const d = await detail(adnan, ajla.id)
    const res = await adnan.put(`/api/customers/${ajla.id}`, editable(d, { city: 'Tuzla Örnek', phone: '+387 61 000 191', residency: 'foreign', preferredLanguage: 'en' }))
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ city: 'Tuzla Örnek', phone: '+387 61 000 191', version: d.version + 1, updatedByName: 'Adnan Kovač' })
    const log = (await auditFor(data.companies.drina, ajla.id)).find((l) => l.action === 'customer.update')!
    expect((log.summary.fields as string[]).sort()).toEqual(['city', 'phone', 'preferredLanguage', 'residency'])
    expect(log.summary.values).toEqual({ residency: ['local', 'foreign'], preferredLanguage: ['bs', 'en'] })
    expect(JSON.stringify(log)).not.toMatch(/Tuzla|000 191|61000191|Sarajevo/)
    // Saving the same values again changes nothing and writes nothing.
    const same = await adnan.put(`/api/customers/${ajla.id}`, editable(res.json()))
    expect(same.json().version).toBe(d.version + 1)
    expect((await auditFor(data.companies.drina, ajla.id)).filter((l) => l.action === 'customer.update')).toHaveLength(1)
  })

  it('a save based on an old version is refused with the current record', async () => {
    const emir = await byName(adnan, 'Emir Primjerović')
    const d = await detail(adnan, emir.id)
    expect((await adnan.put(`/api/customers/${emir.id}`, editable(d, { city: 'Birinci' }))).statusCode).toBe(200)
    const stale = await selma.put(`/api/customers/${emir.id}`, editable(d, { city: 'İkinci' }))
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('VERSION_CONFLICT')
    expect(stale.json().error.details.current).toMatchObject({ city: 'Birinci', version: d.version + 1, updatedByName: 'Adnan Kovač' })
  })

  it('of two simultaneous saves from the same version exactly one wins', async () => {
    const lena = await byName(adnan, 'Lena Beispiel')
    const d = await detail(adnan, lena.id)
    const [a, b] = await Promise.all([adnan.put(`/api/customers/${lena.id}`, editable(d, { city: 'Köln' })), selma.put(`/api/customers/${lena.id}`, editable(d, { city: 'Bonn' }))])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    expect((await detail(adnan, lena.id)).version).toBe(d.version + 1)
  })

  it('changing the phone to another customer’s number asks for a decision first', async () => {
    const sara = await byName(adnan, 'Sara Probić')
    const d = await detail(adnan, sara.id)
    const res = await adnan.put(`/api/customers/${sara.id}`, editable(d, { phone: '+38761000104' }))
    expect(res.statusCode).toBe(409)
    expect(res.json().error.details.matches[0].displayName).toBe('Mirza Uzorak')
    const ok = await adnan.put(`/api/customers/${sara.id}`, editable(d, { phone: '+38761000104', duplicateAcknowledged: true }))
    expect(ok.statusCode, ok.body).toBe(200)
  })

  it('archives and restores without deleting anything; archived records cannot be edited', async () => {
    const mirza = await byName(adnan, 'Mirza Uzorak')
    const d = await detail(adnan, mirza.id)
    expect((await adnan.post(`/api/customers/${mirza.id}/archive`, { version: d.version })).statusCode).toBe(400)
    expect((await adnan.post(`/api/customers/${mirza.id}/archive`, { version: d.version - 1 || 99, reason: 'inactive' })).statusCode).toBe(409)
    const archived = await adnan.post(`/api/customers/${mirza.id}/archive`, { version: d.version, reason: 'inactive' })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json()).toMatchObject({ status: 'archived', archivedReason: 'inactive', archivedByName: 'Adnan Kovač', version: d.version + 1 })
    expect((await search(adnan, { q: 'Uzorak' })).total).toBe(0)
    expect((await search(adnan, { q: 'Uzorak', status: 'archived' })).items.map((i) => i.displayName)).toEqual(['Mirza Uzorak'])
    expect((await adnan.put(`/api/customers/${mirza.id}`, editable(archived.json(), { city: 'X' }))).json().error.code).toBe('CUSTOMER_ARCHIVED')
    expect((await adnan.post(`/api/customers/${mirza.id}/archive`, { version: d.version + 1, reason: 'inactive' })).json().error.code).toBe('ALREADY_ARCHIVED')
    const restored = await selma.post(`/api/customers/${mirza.id}/restore`, { version: d.version + 1 })
    expect(restored.statusCode, restored.body).toBe(200)
    expect(restored.json()).toMatchObject({ status: 'active', archivedAt: null, archivedReason: null, version: d.version + 2 })
    expect((await adnan.post(`/api/customers/${mirza.id}/restore`, { version: d.version + 2 })).json().error.code).toBe('NOT_ARCHIVED')
    expect((await asOwner(data.companies.drina, 'select count(*)::int n from customers where id = $1', [mirza.id])).rows[0].n).toBe(1)
    const log = await auditFor(data.companies.drina, mirza.id)
    expect(log.map((l) => l.action)).toEqual(['customer.archive', 'customer.restore'])
    expect(log[0]!.summary).toMatchObject({ reason: 'inactive' })
  })

  it('the record history lists what happened, newest first, for any user who can read customers', async () => {
    const ajla = await byName(adnan, 'Ajla Testović')
    const res = await selma.get(`/api/customers/${ajla.id}/history`)
    expect(res.statusCode).toBe(200)
    const items = res.json().items as { action: string; actorName: string }[]
    expect(items.map((i) => i.action)).toEqual(['customer.update'])
    expect(items[0]!.actorName).toBe('Adnan Kovač')
    const created = (await search(adnan, { q: 'Yenikayıt' })).items[0]!
    expect((await adnan.get(`/api/customers/${created.id}/history`)).json().items.map((i: { action: string }) => i.action)).toEqual(['customer.create'])
  })
})

describe('personal data in logs', () => {
  it('request logs carry no query strings, bodies or personal values', async () => {
    const lines: string[] = []
    const stream = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk))
        done()
      },
    })
    const logged = await makeApp({ logStream: stream })
    try {
      const c = new Client(logged)
      expect((await c.login(EMAILS.adnan)).statusCode).toBe(200)
      await c.post('/api/customers/search', { q: 'Gizlitest Özelsoyad' })
      await c.post('/api/customers/duplicate-check', { phone: '+38761999777', email: 'gizli.kisi@example.test' })
      const created = await c.post('/api/customers', { givenName: 'Gizlitest', familyName: 'Özelsoyad', phone: '+38761999777', email: 'gizli.kisi@example.test', residency: 'local' })
      expect(created.statusCode).toBe(201)
      await c.post('/api/customers', { givenName: 'Gizlitest', email: 'gizli.hatali@', residency: 'local' })
      await c.get(`/api/customers/${created.json().id}?not=gizli.sorgu@example.test`)
    } finally {
      await logged.close()
    }
    const text = lines.join('')
    expect(text).toContain('incoming request')
    for (const value of ['Gizlitest', 'Özelsoyad', '61999777', '999 777', 'gizli.kisi', 'gizli.hatali', 'gizli.sorgu', EMAILS.adnan]) expect(text).not.toContain(value)
  })

  it('logged database errors drop the failed query, its parameters and the PostgreSQL detail', () => {
    const cause = Object.assign(new Error('duplicate key value violates unique constraint "customers_company_no_key"'), {
      severity: 'ERROR',
      code: '23505',
      constraint: 'customers_company_no_key',
      table: 'customers',
      detail: 'Key (company_id, customer_no)=(…, M-000001) already exists.',
    })
    const err = Object.assign(new Error('Failed query: insert into "customers" ... \nparams: Gizlitest,+38761999777,gizli.kisi@example.test'), { cause })
    const out = JSON.stringify(errorForLog(err))
    expect(out).toContain('23505')
    expect(out).toContain('customers_company_no_key')
    for (const value of ['Gizlitest', '61999777', 'gizli.kisi', 'Key (', 'params']) expect(out).not.toContain(value)
  })
})

describe('rate limits', () => {
  it('duplicate suggestions are capped per user', async () => {
    const codes: number[] = []
    for (let i = 0; i < 62; i++) codes.push((await selma.post('/api/customers/duplicate-check', { phone: `+3876100${String(i).padStart(4, '0')}` })).statusCode)
    expect(codes.slice(0, 55).every((c) => c === 200)).toBe(true)
    expect(codes.at(-1)).toBe(429)
  })
})
