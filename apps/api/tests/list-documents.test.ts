import { addDays, todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Document warnings in the vehicle list (spec §13.1): same rules as the Belgeler tab, permission and branch scope kept.

let data: DevData
let app: FastifyInstance
let adnan: Client
let selma: Client
const T = todayIn('Europe/Sarajevo')

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  selma = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

type Item = { id: string; plate: string; documents: { critical: number; warning: number; headline: { code: string; name: string; state: string; daysLeft: number | null } | null } | null }
const list = async (c: Client, qs = '') => (await c.get(`/api/vehicles?pageSize=100${qs}`)).json().items as Item[]
const idOf = async (plate: string) => (await list(adnan, `&q=${plate}`))[0]!.id
async function addDoc(plate: string, typeCode: string, validUntil: string | null) {
  const res = await adnan.post(`/api/vehicles/${await idOf(plate)}/documents`, { typeCode, validFrom: addDays(T, -300), validUntil, state: 'active' })
  expect(res.statusCode).toBe(201)
}

describe('document warnings in the vehicle list', () => {
  it('each row carries the same overview as the vehicle Belgeler tab', async () => {
    // A12: all three required documents, inspection expiring in 12 days.
    await addDoc('A12-K-345', 'registration', null)
    await addDoc('A12-K-345', 'inspection', addDays(T, 12))
    await addDoc('A12-K-345', 'liability_insurance', addDays(T, 200))
    const a12 = (await list(adnan, '&q=A12-K-345'))[0]!
    expect(a12.documents).toMatchObject({ critical: 0, warning: 1, headline: { code: 'inspection', name: 'Muayene', state: 'expiring', daysLeft: 12 } })
    const tab = (await adnan.get(`/api/vehicles/${a12.id}/documents`)).json()
    expect({ critical: tab.overview.critical, warning: tab.overview.warning }).toEqual({ critical: a12.documents!.critical, warning: a12.documents!.warning })
    // A vehicle without documents: Drina requires three types, so three critical.
    const e45 = (await list(adnan, '&q=E45-M-218'))[0]!
    expect(e45.documents).toMatchObject({ critical: 3, warning: 0, headline: { state: 'missing' } })
  })

  it('filters: "attention" includes warnings, "critical" only critical; other filters still apply', async () => {
    const attention = await list(adnan, '&documents=attention')
    const critical = await list(adnan, '&documents=critical')
    expect(attention.some((v) => v.plate === 'A12-K-345')).toBe(true)
    expect(critical.some((v) => v.plate === 'A12-K-345')).toBe(false)
    expect(critical.some((v) => v.plate === 'E45-M-218')).toBe(true)
    expect(critical.every((v) => v.documents!.critical > 0)).toBe(true)
    const narrowed = await list(adnan, '&documents=attention&q=A12')
    expect(narrowed.map((v) => v.plate)).toEqual(['A12-K-345'])
  })

  it('a company without required types and no documents shows no warnings', async () => {
    const lejla = new Client(app)
    expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
    const items = await list(lejla)
    expect(items.every((v) => v.documents!.critical === 0 && v.documents!.warning === 0)).toBe(true)
    expect(await list(lejla, '&documents=attention')).toEqual([])
  })

  it('branch scope is kept: a branch-limited user only gets her branch, also through the filter', async () => {
    const all = await list(adnan, '&documents=critical')
    const hers = await list(selma, '&documents=critical')
    expect(hers.length).toBeGreaterThan(0)
    expect(hers.length).toBeLessThan(all.length)
    const sjj = data.drina.branches.SJJ
    const homes = (await asOwner(data.companies.drina, `select id, home_branch_id from vehicles`)).rows as { id: string; home_branch_id: string }[]
    for (const v of hers) expect(homes.find((h) => h.id === v.id)!.home_branch_id).toBe(sjj)
  })

  it('without the document read permission: no document data and the filter is ignored', async () => {
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'vehicles.documents.read') where name = 'Operasyon'`)
    try {
      const items = await list(selma)
      expect(items.every((v) => v.documents === null)).toBe(true)
      const filtered = await list(selma, '&documents=critical')
      expect(filtered.length).toBe(items.length)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = permissions || array['vehicles.documents.read'] where name = 'Operasyon'`)
    }
  })

  it('an unknown filter value is ignored', async () => {
    const res = await adnan.get('/api/vehicles?documents=hepsi')
    expect(res.statusCode).toBe(200)
  })
})

describe('current location filter', () => {
  it('"away" finds vehicles not at their home branch; "service" those at a service provider', async () => {
    const away = await list(adnan, '&location=away')
    expect(away.some((v) => v.plate === 'K40-M-526')).toBe(true) // home SJJ, seeded at SAC
    expect(away.some((v) => v.plate === 'A12-K-345')).toBe(false)
    expect(await list(adnan, '&location=service')).toEqual([])
    const id = await idOf('E16-T-093')
    const h = (await adnan.get(`/api/vehicles/${id}/history`)).json()
    const res = await adnan.post(`/api/vehicles/${id}/location`, {
      locationType: 'service_provider',
      description: 'Test servisi',
      reason: 'Servise bırakıldı',
      occurredAt: new Date(Date.now() - 60_000).toISOString(),
      expectedVersion: h.locationVersion,
      clientRequestId: crypto.randomUUID(),
    })
    expect(res.statusCode).toBe(201)
    expect((await list(adnan, '&location=service')).map((v) => v.plate)).toEqual(['E16-T-093'])
    expect((await list(adnan, '&location=away')).some((v) => v.plate === 'E16-T-093')).toBe(true)
    // Branch scope still applies.
    const hers = await list(selma, '&location=away')
    expect(hers.every((v) => ['K40-M-526', 'E16-T-093'].includes(v.plate))).toBe(true)
  })
})
