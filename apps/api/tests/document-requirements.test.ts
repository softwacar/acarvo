import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// M2e: country document requirements. Test seed: Drina/BA has an active "local" policy and a "foreign" draft;
// Neretva has none. Templates stay passive until an owner activates a draft made from them.

let data: DevData
let app: FastifyInstance
let adnan: Client
let selma: Client
let lejla: Client

type Status = { residenceCountry: string | null; branchesWithoutCountry: number; warningDays: number; countries: { country: string; branchCount: number; classes: { residencyClass: string; version: number; items: { acceptedTypes: string[]; state: string; daysLeft: number | null }[] }[] }[] }
type Overview = { warningDays: number; policies: { id: string; country: string; residencyClass: string; version: number; status: string; templateCode: string | null; items: { acceptedTypes: string[]; originalSeenRequired: boolean; copyRequired: boolean }[] }[]; templates: { code: string }[]; branchCountries: { country: string }[] }
const customerId = async (c: Client, name: string) => ((await c.post('/api/customers/search', { q: name, status: 'all' })).json().items as { id: string }[])[0]!.id
const status = async (c: Client, name: string) => (await c.get(`/api/customers/${await customerId(c, name)}/document-status`)).json() as Status
const overview = async () => (await adnan.get('/api/settings/customer-documents')).json() as Overview

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  selma = new Client(app)
  lejla = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
  expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('nothing applies by default', () => {
  it('a company without policies sees no requirement at all, and no branch country is assumed', async () => {
    const s = await status(lejla, 'Dino Neretvić')
    expect(s).toMatchObject({ countries: [], branchesWithoutCountry: 1 })
    expect((await lejla.get('/api/settings/customer-documents')).json()).toMatchObject({ policies: [], warningDays: 30 })
  })

  it('templates are offered but not applied; drafts never count', async () => {
    const o = await overview()
    expect(o.templates.map((t) => t.code)).toEqual(['spec_example_local', 'spec_example_foreign'])
    const s = await status(adnan, 'Lena Beispiel')
    // Only the active BA "local" policy is evaluated; the "foreign" draft is not.
    expect(s.countries).toEqual([expect.objectContaining({ country: 'BA', branchCount: 3, classes: [expect.objectContaining({ residencyClass: 'local', version: 1 })] })])
  })
})

describe('evaluation (information only)', () => {
  it('meets items with the best current document of an accepted type and reports evidence', async () => {
    const ajla = (await status(adnan, 'Ajla Testović')).countries[0]!.classes[0]!.items
    expect(ajla.map((i) => [i.acceptedTypes.join('|'), i.state, i.daysLeft])).toEqual([
      ['national_id|residence_permit', 'ok', expect.any(Number)],
      ['driving_license|international_driving_permit', 'expiring', 12],
    ])
    // Kenan holds a residence permit (not verified): it may satisfy the item, but the original was not seen.
    const kenan = (await status(adnan, 'Kenan Örnek')).countries[0]!.classes[0]!.items
    expect(kenan.map((i) => i.state)).toEqual(['unverified', 'missing'])
    const john = (await status(adnan, 'John Sample')).countries[0]!.classes[0]!.items
    expect(john.map((i) => i.state)).toEqual(['missing', 'missing'])
  })

  it('the residence country is reported as a fact; no residency class is derived from it', async () => {
    const s = await status(adnan, 'Lena Beispiel')
    expect(s.residenceCountry).toBe('DE')
    expect(Object.keys(s)).not.toContain('residencyClass')
    expect(JSON.stringify(s)).not.toMatch(/suggest/i)
  })
})

describe('owner settings', () => {
  it('only the settings permission may read or change requirements', async () => {
    expect((await selma.get('/api/settings/customer-documents')).statusCode).toBe(403)
    expect((await selma.post('/api/settings/document-requirements/drafts', { country: 'BA', residencyClass: 'local' })).statusCode).toBe(403)
  })

  it('a draft from the passive template becomes active only with explicit confirmation and replaces nothing else', async () => {
    const draft = (await overview()).policies.find((p) => p.residencyClass === 'foreign' && p.status === 'draft')!
    // The seeded foreign draft exists; a second draft for the same country and class is refused.
    expect((await adnan.post('/api/settings/document-requirements/drafts', { country: 'BA', residencyClass: 'foreign' })).json().error.code).toBe('DRAFT_EXISTS')
    await adnan.post(`/api/settings/document-requirements/${draft.id}/retire`)
    const created = await adnan.post('/api/settings/document-requirements/drafts', { country: 'BA', residencyClass: 'foreign', templateCode: 'spec_example_foreign' })
    expect(created.statusCode, created.body).toBe(201)
    const fromTemplate = (created.json() as Overview).policies.find((p) => p.residencyClass === 'foreign' && p.status === 'draft')!
    expect(fromTemplate).toMatchObject({ version: 2, templateCode: 'spec_example_foreign' })
    expect(fromTemplate.items.map((i) => i.acceptedTypes)).toEqual([['passport'], ['entry_record'], ['driving_license', 'international_driving_permit']])
    expect((await status(adnan, 'Lena Beispiel')).countries[0]!.classes.map((c) => c.residencyClass)).toEqual(['local'])

    expect((await adnan.post(`/api/settings/document-requirements/${fromTemplate.id}/activate`, {})).statusCode).toBe(400)
    const activated = await adnan.post(`/api/settings/document-requirements/${fromTemplate.id}/activate`, { confirm: true })
    expect(activated.statusCode, activated.body).toBe(200)
    const lena = (await status(adnan, 'Lena Beispiel')).countries[0]!.classes
    expect(lena.map((c) => c.residencyClass)).toEqual(['local', 'foreign'])
    // The template asks for the licence original to be seen; Lena's licence is not verified yet.
    expect(lena[1]!.items.map((i) => i.state)).toEqual(['ok', 'ok', 'unverified'])
    const john = (await status(adnan, 'John Sample')).countries[0]!.classes[1]!.items
    expect(john.map((i) => i.state)).toEqual(['expired', 'missing', 'missing'])
  })

  it('an activated version never changes, neither through the API nor in the database; a change is a new version', async () => {
    const active = (await overview()).policies.find((p) => p.residencyClass === 'local' && p.status === 'active')!
    expect((await adnan.put(`/api/settings/document-requirements/${active.id}/items`, { items: [{ acceptedTypes: ['passport'] }] })).json().error.code).toBe('POLICY_NOT_DRAFT')
    await expect(asApp(data.companies.drina, (c) => c.query(`update document_requirement_items set copy_required = true where policy_id = $1`, [active.id]))).rejects.toThrow(/draft/)
    await expect(asApp(data.companies.drina, (c) => c.query(`delete from document_requirement_items where policy_id = $1`, [active.id]))).rejects.toThrow(/draft/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update document_requirement_policies set status = 'draft' where id = $1`, [active.id]))).rejects.toThrow(/status change/)

    // New version: copy, require a kept copy (file) for the identity item, activate.
    const copied = (await adnan.post('/api/settings/document-requirements/drafts', { country: 'BA', residencyClass: 'local', copyFromPolicyId: active.id })).json() as Overview
    const draft = copied.policies.find((p) => p.residencyClass === 'local' && p.status === 'draft')!
    expect(draft.version).toBe(2)
    const items = draft.items.map((i, n) => (n === 0 ? { ...i, copyRequired: true } : i))
    expect((await adnan.put(`/api/settings/document-requirements/${draft.id}/items`, { items })).statusCode).toBe(200)
    expect((await adnan.put(`/api/settings/document-requirements/${draft.id}/items`, { items: [{ acceptedTypes: ['bogus'] }] })).statusCode).toBe(400)
    expect((await adnan.post(`/api/settings/document-requirements/${draft.id}/activate`, { confirm: true })).statusCode).toBe(200)
    const after = await overview()
    expect(after.policies.filter((p) => p.residencyClass === 'local').map((p) => [p.version, p.status])).toEqual([
      [2, 'active'],
      [1, 'retired'],
    ])
    // Ajla's identity card has no file yet: the kept-copy setting reports it, separate from the seen original.
    expect((await status(adnan, 'Ajla Testović')).countries[0]!.classes[0]!.items[0]!.state).toBe('copy_missing')
  })

  it('retiring the active version leaves that country and class without a requirement', async () => {
    const active = (await overview()).policies.find((p) => p.residencyClass === 'foreign' && p.status === 'active')!
    expect((await adnan.post(`/api/settings/document-requirements/${active.id}/retire`)).statusCode).toBe(200)
    expect((await status(adnan, 'Lena Beispiel')).countries[0]!.classes.map((c) => c.residencyClass)).toEqual(['local'])
    const log = (await asOwner(data.companies.drina, `select action from audit_log where entity = 'document_requirement_policy' order by created_at`)).rows.map((r) => r.action)
    expect(log).toEqual(expect.arrayContaining(['settings.requirement_policy.draft', 'settings.requirement_policy.activate', 'settings.requirement_policy.retire', 'settings.requirement_policy.discard']))
  })

  it('the warning window is a company setting (default 30 days) and drives "expiring"', async () => {
    const ajla = await customerId(adnan, 'Ajla Testović')
    expect((await adnan.put('/api/settings/customer-documents', { warningDays: 0 })).statusCode).toBe(400)
    expect((await adnan.put('/api/settings/customer-documents', { warningDays: 10 })).json().warningDays).toBe(10)
    const docs = (await adnan.get(`/api/customers/${ajla}/documents`)).json()
    expect(docs.warningDays).toBe(10)
    expect(docs.items.find((d: { type: string }) => d.type === 'driving_license').validity.state).toBe('valid')
    await adnan.put('/api/settings/customer-documents', { warningDays: 30 })
    expect((await adnan.get(`/api/customers/${ajla}/documents`)).json().items.find((d: { type: string }) => d.type === 'driving_license').validity.state).toBe('expiring')
  })
})

describe('isolation', () => {
  it('policies and settings are per company', async () => {
    const drinaPolicy = (await overview()).policies[0]!
    expect((await lejla.post(`/api/settings/document-requirements/${drinaPolicy.id}/activate`, { confirm: true })).statusCode).toBe(404)
    expect((await lejla.post(`/api/settings/document-requirements/${drinaPolicy.id}/retire`)).statusCode).toBe(404)
    expect((await lejla.get('/api/settings/customer-documents')).json().policies).toEqual([])
    expect(await asApp(null, async (c) => (await c.query('select count(*)::int n from document_requirement_policies')).rows[0].n)).toBe(0)
  })
})
