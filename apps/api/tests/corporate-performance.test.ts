import type { CorporateListResponse } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// M3 performance: a growing corporate list (5,000 synthetic accounts with tax ids, channels and people) is searched and
// paged in one query per request. Synthetic data in acarvo_test only.

const N = 5000
let data: DevData
let app: FastifyInstance
let adnan: Client
const timings: Record<string, number> = {}

beforeAll(async () => {
  data = await resetDatabase()
  const drina = data.companies.drina
  await asOwner(
    drina,
    `insert into corporate_accounts (company_id, account_no, legal_name, legal_name_normalized, country, registration_number, registration_number_normalized, created_at)
     select $1, 'K-' || lpad((100 + g)::text, 5, '0'), 'Sentetik Firma ' || g || ' d.o.o.', 'sentetik firma ' || g || ' d o o',
            (array['BA','HR','RS','DE','AT'])[1 + g % 5], 'TEST-REG-' || g, 'TESTREG' || g, now() - make_interval(mins => g)
     from generate_series(1, ${N}) g`,
    [drina],
  )
  await asOwner(drina, `insert into corporate_tax_ids (company_id, account_id, country, scheme, value, value_normalized, is_primary)
    select company_id, id, country, 'VAT', 'TEST-VAT-' || substr(account_no, 3), 'TESTVAT' || substr(account_no, 3), true from corporate_accounts where legal_name like 'Sentetik%'`)
  await asOwner(drina, `insert into corporate_contact_channels (company_id, account_id, kind, value, value_normalized, is_primary)
    select company_id, id, 'email', 'info' || substr(account_no, 3) || '@sentetik.example.test', 'info' || substr(account_no, 3) || '@sentetik.example.test', true from corporate_accounts where legal_name like 'Sentetik%'`)
  await asOwner(drina, `insert into corporate_account_people (company_id, account_id, customer_id, roles)
    select a.company_id, a.id, c.id, '{authorized_driver}' from (select *, row_number() over (order by account_no) rn from corporate_accounts where legal_name like 'Sentetik%') a
    join (select id, row_number() over (order by customer_no) - 1 rn from customers where status = 'active') c on c.rn = a.rn % 12`)
  await asOwner(null, 'analyze corporate_accounts, corporate_tax_ids, corporate_contact_channels, corporate_account_people')
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
})
afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('corporate search timings (ms):', JSON.stringify(timings))
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

async function timed(label: string, body: Record<string, unknown>) {
  await adnan.post('/api/corporate-accounts/search', body) // warm-up (plan cache)
  const start = performance.now()
  const res = await adnan.post('/api/corporate-accounts/search', body)
  timings[label] = Math.round(performance.now() - start)
  expect(res.statusCode).toBe(200)
  return res.json() as CorporateListResponse
}

describe(`search and paging over ${N} accounts`, () => {
  it('first page, deep page, name, tax id, e-mail and number searches stay fast', async () => {
    const first = await timed('first page', {})
    expect(first.total).toBe(N + 3)
    expect(first.items).toHaveLength(25)
    expect(first.items.every((i) => i.peopleCount >= 0 && i.primaryTaxId !== undefined)).toBe(true)
    const deep = await timed('page 50 of 100 per page', { pageSize: 100, page: 50, sort: 'created', dir: 'desc' })
    expect(deep.items).toHaveLength(100)
    expect((await timed('name infix', { q: 'firma 4321' })).items.map((i) => i.legalName)).toEqual(['Sentetik Firma 4321 d.o.o.'])
    expect((await timed('tax id fragment', { q: 'VAT-04421' })).items.map((i) => i.accountNo)).toEqual(['K-04421'])
    expect((await timed('e-mail', { q: 'info01234@sentetik' })).items.map((i) => i.accountNo)).toEqual(['K-01234'])
    expect((await timed('account number', { q: 'K-02500' })).items.map((i) => i.accountNo)).toEqual(['K-02500'])
    expect((await timed('drivers filter + country', { people: 'with_drivers', country: 'DE' })).total).toBeGreaterThan(900)
    // Generous bound for a development machine; the measured values are written to the test log and the report.
    for (const [label, ms] of Object.entries(timings)) expect(ms, label).toBeLessThan(1500)
  })

  it('the name search index is used for exact name lookups (duplicate suggestions)', async () => {
    const plan = (
      await asOwner(data.companies.drina, `explain select id from corporate_accounts where company_id = $1 and legal_name_normalized = 'sentetik firma 77 d o o'`, [data.companies.drina])
    ).rows.map((r) => r['QUERY PLAN'] as string)
    expect(plan.join('\n')).toMatch(/corporate_accounts_company_name_idx|Index/)
  })
})
