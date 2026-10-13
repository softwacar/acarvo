import { randomUUID } from 'node:crypto'
import { CHECKLIST_ITEMS, type RentalDetail, type ReservationDetail, todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Rentals V1 integration review (product decisions K1, K2, K3): the company's external contract/pricing mode, the
// handover gates enforced by the database, and the overdue-rental warning. acarvo_test only, synthetic data.

let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip (external mode on in the test seed)
let selma: Client // Drina Operasyon, SJJ only
let lejla: Client // Neretva Sahip (mode off, the default)
let jpeg: Buffer
const ids: Record<string, string> = {}
const uuid = () => randomUUID()
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn('Europe/Sarajevo')}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
const checklistAll = Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, 'ok']))
async function login(email: string) {
  const c = new Client(app)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}

/** A prepared rental with every handover requirement except the handover itself. */
async function ready(c: Client, body: Record<string, unknown>, km: number, driver: string) {
  let res = await c.post('/api/rentals', { drivers: [{ customerId: driver, isPrimary: true }], customerId: driver, requestId: uuid(), ...body })
  expect(res.statusCode, res.body).toBe(201)
  let d = res.json() as RentalDetail
  res = await c.put(`/api/rentals/${d.id}/document-check`, { version: d.version, drivers: [{ customerId: driver, residencyClass: 'local', decision: 'eligible' }] })
  if (res.statusCode === 200) d = res.json()
  res = await c.put(`/api/rentals/${d.id}/inspections/handover`, { inspectionVersion: 0, km, fuel: 'full', cleanliness: 'clean', condition: 'good', checklist: checklistAll, counterpartCustomerId: driver, marks: [] })
  expect(res.statusCode, res.body).toBe(200)
  for (const angle of ['front', 'rear', 'left', 'right']) {
    res = await c.upload(`/api/rentals/${d.id}/inspections/handover/photos?angle=${angle}`, jpeg)
    expect(res.statusCode, res.body).toBe(201)
  }
  return res.json() as RentalDetail
}
const deliver = (c: Client, d: RentalDetail, extra: Record<string, unknown> = {}) =>
  c.post(`/api/rentals/${d.id}/deliver`, { version: d.version, inspectionVersion: d.handover!.version, requestId: uuid(), externalContractAck: true, externalPricingAck: true, externalReference: 'DIS-2026/7', ...extra })

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  ids.sjj = (await one(`select id from branches where code = 'SJJ'`)).id
  ids.sac = (await one(`select id from branches where code = 'SAC'`)).id
  ids.orta = (await one(`select id from vehicle_classes where name = 'Orta'`)).id
  ids.kompakt = (await one(`select id from vehicle_classes where name = 'Kompakt'`)).id
  ids.passat = (await one(`select id from vehicles where plate = 'E16-T-093'`)).id
  ids.o21 = (await one(`select id from vehicles where plate = 'O21-M-985'`)).id
  ids.ajla = (await one(`select id from customers where display_name = 'Ajla Testović'`)).id
  ids.mirza = (await one(`select id from customers where display_name = 'Mirza Uzorak'`)).id
  ids.moc = (await one(`select id from branches where code = 'MOC'`, [], data.companies.neretva)).id
  ids.dino = (await one(`select id from customers where display_name = 'Dino Neretvić'`, [], data.companies.neretva)).id
  ids.nClass = (await one(`select id from vehicle_classes where name = 'Ekonomi'`, [], data.companies.neretva)).id
  ids.nCar = (await one(`select id from vehicles where plate = 'O47-K-332'`, [], data.companies.neretva)).id
  jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 90, g: 90, b: 150 } } }).jpeg().toBuffer()
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('K1: external contract and pricing mode', () => {
  it('is off by default; with it off no handover can be completed, and the screen says why', async () => {
    const s = (await lejla.get('/api/settings/rentals')).json()
    expect(s).toEqual({ externalTermsMode: false, version: 0, updatedAt: null, updatedByName: null })
    // Neretva: give MOC a country for this test only (never guessed in real data), then prepare everything else.
    await asOwner(data.companies.neretva, `update branches set country = 'BA' where code = 'MOC'`)
    try {
      const d = await ready(lejla, { vehicleClassId: ids.nClass, vehicleId: ids.nCar, pickupBranchId: ids.moc, returnBranchId: ids.moc, pickupLocal: local(1, '10:00'), returnLocal: local(2, '10:00') }, 41_000, ids.dino)
      expect(d.externalTermsMode).toBe(false)
      expect(d.deliveryGates.find((g) => g.code === 'external_terms')?.state).toBe('blocked')
      const res = await deliver(lejla, d)
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('DELIVERY_BLOCKED')
      expect(res.json().error.details.gates.filter((g: { state: string }) => g.state === 'blocked').map((g: { code: string }) => g.code)).toEqual(['external_terms'])
      expect((await one(`select status from rentals where id = $1`, [d.id], data.companies.neretva)).status).toBe('prepared')
    } finally {
      await asOwner(data.companies.neretva, `update branches set country = null where code = 'MOC'`)
    }
  })

  it('only the owner switches it; custom and Operasyon roles cannot; companies never see each other; the change is audited', async () => {
    expect((await selma.put('/api/settings/rentals', { version: 1, externalTermsMode: false })).statusCode).toBe(403)
    const operasyon = (await one(`select permissions from roles where name = 'Operasyon'`)).permissions as string[]
    expect(operasyon).not.toContain('settings.rentals.manage')
    expect((await one(`select permissions from roles where name = 'Sahip'`)).permissions).toContain('settings.rentals.manage')
    expect((await one(`select permissions from roles where name = 'Yönetici'`)).permissions).not.toContain('settings.rentals.manage')
    const on = await lejla.put('/api/settings/rentals', { version: 0, externalTermsMode: true })
    expect(on.statusCode, on.body).toBe(200)
    expect(on.json()).toMatchObject({ externalTermsMode: true, version: 1, updatedByName: expect.any(String) })
    expect((await lejla.put('/api/settings/rentals', { version: 0, externalTermsMode: false })).statusCode).toBe(409)
    expect((await adnan.get('/api/settings/rentals')).json()).toMatchObject({ externalTermsMode: true })
    expect(await asApp(data.companies.neretva, async (c) => (await c.query('select count(*)::int n from company_rental_settings')).rows[0].n)).toBe(1)
    expect(await asApp(null, async (c) => (await c.query('select count(*)::int n from company_rental_settings')).rows[0].n)).toBe(0)
    await expect(asApp(data.companies.neretva, (c) => c.query('delete from company_rental_settings'))).rejects.toThrow(/permission denied/)
    const a = await one(`select summary::text s from audit_log where action = 'settings.rental_mode_update'`, [], data.companies.neretva)
    expect(JSON.parse(a.s)).toEqual({ externalTermsMode: [false, true] })
    expect((await lejla.put('/api/settings/rentals', { version: 1, externalTermsMode: false })).json()).toMatchObject({ externalTermsMode: false, version: 2 })
  })

  it('with the mode on, both statements and an external reference are required and stored as statements, not proof', async () => {
    const d = await ready(adnan, { vehicleClassId: ids.orta, vehicleId: ids.passat, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(1, '10:00'), returnLocal: local(3, '10:00') }, 55_800, ids.ajla)
    const none = await deliver(adnan, d, { externalContractAck: false, externalPricingAck: false, externalReference: undefined })
    expect(none.statusCode).toBe(400)
    expect(Object.keys(none.json().error.fields).sort()).toEqual(['externalContractAck', 'externalPricingAck', 'externalReference'])
    expect((await deliver(adnan, d, { externalReference: 'x' })).statusCode).toBe(400)
    const ok = await deliver(adnan, d, { externalReference: 'SZL-2026/118' })
    expect(ok.statusCode, ok.body).toBe(200)
    const r = ok.json() as RentalDetail
    expect(r.externalTerms).toMatchObject({ reference: 'SZL-2026/118', byName: expect.any(String) })
    const audit = (await one(`select summary::text s from audit_log where action = 'rental.deliver' and entity_id = $1`, [d.id])).s as string
    expect(JSON.parse(audit)).toMatchObject({ externalContractAck: true, externalPricingAck: true, externalReferenceRecorded: true })
    expect(audit).not.toContain('SZL-2026/118')
    expect(JSON.stringify(r)).not.toMatch(/imzalandı|ödeme alındı|fiyat kesinleşti|signed|paid/i)
  })
})

describe('database-level handover gates (cannot be bypassed by a direct change)', () => {
  const set = `status = 'delivered', delivered_at = now(), delivered_by = (select user_id from memberships limit 1),
    external_terms_ack_at = now(), external_terms_ack_by = (select user_id from memberships limit 1),
    external_pricing_ack_at = now(), external_pricing_ack_by = (select user_id from memberships limit 1), external_reference = 'DIS-1'`
  it('a rental without a current eligible document decision cannot be handed over', async () => {
    const k3 = (await one(`select id from rentals where rental_no = 'K-000003'`)).id
    await expect(asApp(data.companies.drina, (c) => c.query(`update rentals set ${set} where id = $1`, [k3]))).rejects.toMatchObject({ constraint: 'rentals_document_decision' })
  })
  it('without both statements and a reference, or with the mode off, the database refuses the handover', async () => {
    const k3 = (await one(`select id from rentals where rental_no = 'K-000003'`)).id
    await expect(asApp(data.companies.drina, (c) => c.query(`update rentals set status = 'delivered', delivered_at = now(), delivered_by = (select user_id from memberships limit 1) where id = $1`, [k3]))).rejects.toMatchObject({
      constraint: 'rentals_external_terms_statement',
    })
    await asOwner(data.companies.drina, `update company_rental_settings set external_terms_mode = false`)
    try {
      await expect(asApp(data.companies.drina, (c) => c.query(`update rentals set ${set} where id = $1`, [k3]))).rejects.toMatchObject({ constraint: 'rentals_external_terms_mode' })
    } finally {
      await asOwner(data.companies.drina, `update company_rental_settings set external_terms_mode = true`)
    }
    await expect(asApp(data.companies.drina, (c) => c.query(`update rentals set external_reference = 'DIS-2' where id = $1`, [k3]))).rejects.toMatchObject({ constraint: 'rentals_external_terms_statement' })
  })
  it('a branch without a country blocks the handover in the database (K3); nothing is guessed', async () => {
    const k3 = (await one(`select id from rentals where rental_no = 'K-000003'`)).id
    await asOwner(data.companies.drina, `update branches set country = null where code = 'SJJ'`)
    try {
      await expect(asApp(data.companies.drina, (c) => c.query(`update rentals set ${set} where id = $1`, [k3]))).rejects.toMatchObject({ constraint: 'rentals_branch_country' })
    } finally {
      await asOwner(data.companies.drina, `update branches set country = 'BA' where code = 'SJJ'`)
    }
  })
  it('checklist answers are limited to the known items and values; a final inspection must be complete', async () => {
    const k3 = (await one(`select id from rentals where rental_no = 'K-000003'`)).id
    const r = (await adnan.put(`/api/rentals/${k3}/inspections/handover`, { inspectionVersion: 0, checklist: { keys: 'ok' }, marks: [] })).json() as RentalDetail
    await expect(asApp(data.companies.drina, (c) => c.query(`update rental_inspections set checklist = '{"keys":"maybe"}' where id = $1`, [r.handover!.id]))).rejects.toMatchObject({ constraint: 'rental_inspections_checklist' })
    await expect(asApp(data.companies.drina, (c) => c.query(`update rental_inspections set checklist = '{"teleport":"ok"}' where id = $1`, [r.handover!.id]))).rejects.toMatchObject({ constraint: 'rental_inspections_checklist' })
  })
})

describe('K2: overdue rental', () => {
  it('a reservation on a vehicle held by an overdue rental says so (own company only); a pending one is not a promise', async () => {
    const res = await adnan.post('/api/reservations', { customerId: ids.mirza, vehicleClassId: ids.kompakt, vehicleId: ids.o21, pickupBranchId: ids.sac, returnBranchId: ids.sac, pickupLocal: local(9, '10:00'), returnLocal: local(10, '10:00'), source: 'phone' })
    expect(res.statusCode, res.body).toBe(201)
    const r = res.json() as ReservationDetail
    expect(r.status).toBe('pending')
    expect(r.warnings).toContainEqual({ code: 'vehicle_held_by_overdue_rental', subject: 'K-000002' })
    const confirm = await adnan.post(`/api/reservations/${r.id}/confirm`, { version: r.version })
    expect(confirm.statusCode).toBe(409)
    expect(confirm.json().error.details.conflicts).toEqual([expect.objectContaining({ kind: 'rental', refNo: 'K-000002', endsAt: null })])
    // After the real return the vehicle is free again for that period.
    const k2 = (await adnan.get(`/api/rentals/${(await one(`select id from rentals where rental_no = 'K-000002'`)).id}`)).json() as RentalDetail
    const ret = await adnan.post(`/api/rentals/${k2.id}/return`, { version: k2.version, requestId: uuid(), returnBranchId: ids.sac, km: 14_700, fuel: 'half' })
    expect(ret.statusCode, ret.body).toBe(200)
    const after = (await adnan.get(`/api/reservations/${r.id}`)).json() as ReservationDetail
    expect(after.warnings.map((w) => w.code)).not.toContain('vehicle_held_by_overdue_rental')
    expect((await adnan.post(`/api/reservations/${r.id}/confirm`, { version: after.version })).statusCode).toBe(200)
  })
})
