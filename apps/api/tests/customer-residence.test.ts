import { suggestRentalResidency } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// M2b: residence country (separate from nationality), the M1 classification kept as recorded, branch country.

let data: DevData
let app: FastifyInstance
let adnan: Client
let selma: Client
let lejla: Client

const byName = async (c: Client, name: string) =>
  ((await c.post('/api/customers/search', { q: name, status: 'all' })).json().items as { id: string; displayName: string }[]).find((i) => i.displayName === name)!
const detail = async (c: Client, id: string) => (await c.get(`/api/customers/${id}`)).json()
const body = (d: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  givenName: d.givenName,
  familyName: d.familyName,
  nationality: d.nationality,
  residenceCountry: d.residenceCountry,
  phone: d.phoneRaw,
  email: d.email,
  preferredLanguage: d.preferredLanguage,
  createdBranchId: undefined,
  version: d.version,
  ...over,
})

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

describe('residence country and the M1 classification', () => {
  it('a new customer needs no M1 classification; residence country is stored as entered and never derived', async () => {
    const res = await adnan.post('/api/customers', { givenName: 'Vera', familyName: 'İkamet Testi', phone: '+38761000301', nationality: 'BA', residenceCountry: 'hr' })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ residency: null, nationality: 'BA', residenceCountry: 'HR' })
    const other = await adnan.post('/api/customers', { givenName: 'Uyruk', familyName: 'Yalnız', phone: '+38761000302', nationality: 'DE' })
    expect(other.json()).toMatchObject({ residency: null, nationality: 'DE', residenceCountry: null })
    expect((await adnan.post('/api/customers', { givenName: 'X', phone: '+38761000303', residenceCountry: 'QQ' })).statusCode).toBe(400)
  })

  it('an update that leaves out the M1 classification keeps it; residence country and nationality stay independent', async () => {
    // Synthetic Selin Deneme: nationality TR, residence BA, M1 classification "foreign" (recorded before M2).
    const selin = await byName(adnan, 'Selin Deneme')
    const before = await detail(adnan, selin.id)
    expect(before).toMatchObject({ residency: 'foreign', nationality: 'TR', residenceCountry: 'BA' })
    const res = await adnan.put(`/api/customers/${selin.id}`, body(before, { residenceCountry: 'AT' }))
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ residency: 'foreign', nationality: 'TR', residenceCountry: 'AT' })
    // An M1 client may still set the classification explicitly.
    const m1 = await adnan.put(`/api/customers/${selin.id}`, body(res.json(), { residency: 'local' }))
    expect(m1.json()).toMatchObject({ residency: 'local', residenceCountry: 'AT' })
    const log = (await asOwner(data.companies.drina, `select summary from audit_log where entity = 'customer' and entity_id = $1 order by created_at`, [selin.id])).rows.map((r) => r.summary)
    expect(log[0].fields).toEqual(['residenceCountry'])
    expect(JSON.stringify(log[0])).not.toMatch(/"AT"|"BA"/)
    expect(log[1].values).toEqual({ residency: ['foreign', 'local'] })
  })

  it('the list can be filtered by residence country', async () => {
    const res = (await adnan.post('/api/customers/search', { residenceCountry: 'DE', status: 'all' })).json()
    expect(res.items.map((i: { displayName: string }) => i.displayName)).toEqual(['Lena Beispiel'])
    expect(res.items[0]).toMatchObject({ residenceCountry: 'DE', nationality: 'DE' })
  })
})

describe('branch country', () => {
  it('is part of the branch list and the session; nothing was filled in automatically for Neretva', async () => {
    const drina = (await adnan.get('/api/branches')).json().items as { code: string; country: string | null }[]
    expect(drina.map((b) => b.country)).toEqual(['BA', 'BA', 'BA'])
    const neretva = (await lejla.get('/api/branches')).json().items as { code: string; country: string | null }[]
    expect(neretva).toEqual([expect.objectContaining({ code: 'MOC', country: null })])
    const session = (await lejla.get('/api/auth/session')).json()
    expect(session.branches[0].country).toBeNull()
  })

  it('only the branch-manage permission sets it; each change is audited', async () => {
    const sjj = data.drina.branches.SJJ!
    expect((await selma.put(`/api/branches/${sjj}/country`, { country: 'HR' })).statusCode).toBe(403)
    expect((await adnan.put(`/api/branches/${sjj}/country`, { country: 'XX' })).statusCode).toBe(400)
    const res = await adnan.put(`/api/branches/${sjj}/country`, { country: 'hr' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().items.find((b: { code: string }) => b.code === 'SJJ').country).toBe('HR')
    const back = await adnan.put(`/api/branches/${sjj}/country`, { country: 'BA' })
    expect(back.statusCode).toBe(200)
    const log = (await asOwner(data.companies.drina, `select summary from audit_log where action = 'branch.country_set' and entity_id = $1 order by created_at`, [sjj])).rows.map((r) => r.summary)
    expect(log).toEqual([
      { code: 'SJJ', from: 'BA', to: 'HR' },
      { code: 'SJJ', from: 'HR', to: 'BA' },
    ])
  })

  it('bulk assignment shows a preview first and changes only the confirmed branches without a country', async () => {
    const preview = await lejla.post('/api/branches/country/preview', { country: 'BA' })
    expect(preview.statusCode, preview.body).toBe(200)
    expect(preview.json().branches).toEqual([expect.objectContaining({ code: 'MOC' })])
    // The preview changed nothing.
    expect((await lejla.get('/api/branches')).json().items[0].country).toBeNull()
    const ids = preview.json().branches.map((b: { id: string }) => b.id)
    expect((await lejla.post('/api/branches/country/apply', { country: 'BA', branchIds: ids })).statusCode).toBe(400)
    // A branch of another company is not in this company's list: the preview is stale, nothing changes.
    expect((await lejla.post('/api/branches/country/apply', { country: 'BA', branchIds: [...ids, data.drina.branches.SJJ], confirm: true })).json().error.code).toBe('PREVIEW_STALE')
    const applied = await lejla.post('/api/branches/country/apply', { country: 'BA', branchIds: ids, confirm: true })
    expect(applied.json()).toMatchObject({ changed: ['MOC'], skipped: [] })
    const again = await lejla.post('/api/branches/country/apply', { country: 'HR', branchIds: ids, confirm: true })
    expect(again.json()).toMatchObject({ changed: [], skipped: ['MOC'] })
    expect((await lejla.get('/api/branches')).json().items[0].country).toBe('BA')
  })

  it('another company cannot change a branch even with its id', async () => {
    expect((await lejla.put(`/api/branches/${data.drina.branches.MST}/country`, { country: 'HR' })).statusCode).toBe(404)
  })
})

describe('rental-time residency suggestion (prepared for the Rentals module)', () => {
  it('suggests only from residence country versus branch country, and gives no suggestion when either is missing', () => {
    expect(suggestRentalResidency('BA', 'BA')).toEqual({ suggestion: 'local', reason: 'residence_matches_branch' })
    expect(suggestRentalResidency('DE', 'BA')).toEqual({ suggestion: 'foreign', reason: 'residence_differs_from_branch' })
    expect(suggestRentalResidency(null, 'BA')).toEqual({ suggestion: null, reason: 'residence_country_missing' })
    expect(suggestRentalResidency('BA', null)).toEqual({ suggestion: null, reason: 'branch_country_missing' })
    // The function has no nationality input at all: nationality can never decide residency.
    expect(suggestRentalResidency.length).toBe(2)
  })
})
