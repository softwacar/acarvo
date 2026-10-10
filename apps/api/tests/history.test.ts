import { randomUUID } from 'node:crypto'
import type { HistoryWriteResult, VehicleHistory } from '@acarvo/shared'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upgradePresetRoles } from '../src/db/role-upgrade'
import * as schema from '../src/db/schema'
import { ROLE_PRESET_HISTORY, ROLE_PRESETS } from '../src/modules/auth/roles'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

let data: DevData
let app: FastifyInstance
let adnan: Client
let selma: Client
let lejla: Client

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

// ---------------------------------------------------------------------------
// Helpers

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()
async function idOf(c: Client, plate: string) {
  const res = await c.get(`/api/vehicles?q=${encodeURIComponent(plate)}`)
  return (res.json().items as { id: string; plate: string }[]).find((v) => v.plate === plate)!.id
}
const history = async (c: Client, id: string) => (await c.get(`/api/vehicles/${id}/history`)).json() as VehicleHistory
const vehicle = async (c: Client, id: string) => (await c.get(`/api/vehicles/${id}`)).json()

async function addKm(c: Client, id: string, body: Record<string, unknown>) {
  const h = await history(adnan, id)
  return c.post(`/api/vehicles/${id}/odometer`, { expectedVersion: h.odometerVersion, clientRequestId: randomUUID(), occurredAt: ago(1), ...body })
}
async function correctKm(c: Client, id: string, readingId: string, body: Record<string, unknown>) {
  const h = await history(adnan, id)
  return c.post(`/api/vehicles/${id}/odometer/${readingId}/correct`, { expectedVersion: h.odometerVersion, clientRequestId: randomUUID(), ...body })
}
async function setLocation(c: Client, id: string, body: Record<string, unknown>) {
  const h = await history(adnan, id)
  return c.post(`/api/vehicles/${id}/location`, { expectedVersion: h.locationVersion, clientRequestId: randomUUID(), occurredAt: ago(1), reason: 'Sayımda bulundu', ...body })
}
async function correctLocation(c: Client, id: string, eventId: string, body: Record<string, unknown>) {
  const h = await history(adnan, id)
  return c.post(`/api/vehicles/${id}/location/${eventId}/correct`, { expectedVersion: h.locationVersion, clientRequestId: randomUUID(), ...body })
}
const branch = (code: string) => data.drina.branches[code]!

// ---------------------------------------------------------------------------

describe('odometer readings', () => {
  it('records a reading: current km, history entry, difference and audit', async () => {
    const id = await idOf(adnan, 'A12-K-345')
    const res = await addKm(adnan, id, { km: 48_900, note: 'Haftalık sayım' })
    expect(res.statusCode).toBe(201)
    const body = res.json() as HistoryWriteResult
    expect(body).toMatchObject({ becameCurrent: true, duplicate: false })
    const entry = body.history.odometer.find((o) => o.id === body.id)!
    expect(entry).toMatchObject({ km: 48_900, eventType: 'manual', sourceType: 'manual', recordedByName: 'Adnan Kovač', effective: true, deltaKm: 690, late: false, note: 'Haftalık sayım' })
    expect((await vehicle(adnan, id)).odometer.km).toBe(48_900)
    const list = await adnan.get(`/api/vehicles?q=A12-K-345`)
    expect(list.json().items[0].odometer.km).toBe(48_900)
    const log = await asOwner(data.companies.drina, `select summary from audit_log where action = 'vehicle.odometer.record' and entity_id = $1`, [id])
    expect(log.rows[0].summary).toMatchObject({ km: 48_900, previousKm: 48_210, becameCurrent: true })
  })

  it('never accepts a lower value than the previous reading', async () => {
    const id = await idOf(adnan, 'A12-K-345')
    const res = await addKm(adnan, id, { km: 48_000 })
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toMatchObject({ code: 'ODOMETER_OUT_OF_ORDER', details: { problem: 'below_previous', conflict: { km: 48_900 } } })
    expect(res.json().error.message).toContain('48.900 km')
    expect((await vehicle(adnan, id)).odometer.km).toBe(48_900)
  })

  it('a back-dated reading needs a note after 48 hours, fits between neighbours and does not become current', async () => {
    const id = await idOf(adnan, 'A12-K-345')
    const noNote = await addKm(adnan, id, { km: 48_500, occurredAt: ago(24 * 50) })
    expect(noNote.statusCode).toBe(422)
    expect(noNote.json().error).toMatchObject({ code: 'NOTE_REQUIRED', fields: { note: expect.any(String) } })
    const ok = await addKm(adnan, id, { km: 48_500, occurredAt: ago(24 * 50), note: 'Servis fişinden geç girildi' })
    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toMatchObject({ becameCurrent: false })
    expect(ok.json().history.odometer.find((o: { id: string }) => o.id === ok.json().id)).toMatchObject({ late: true })
    expect((await vehicle(adnan, id)).odometer.km).toBe(48_900)
    // Higher than a later reading: refused, so the past order cannot break.
    const above = await addKm(adnan, id, { km: 49_500, occurredAt: ago(24 * 40), note: 'Geç giriş denemesi' })
    expect(above.statusCode).toBe(422)
    expect(above.json().error.details).toMatchObject({ problem: 'above_next', conflict: { km: 48_900 } })
  })

  it('refuses the future and times before the vehicle was registered', async () => {
    const id = await idOf(adnan, 'A12-K-345')
    const future = await addKm(adnan, id, { km: 49_000, occurredAt: new Date(Date.now() + 3_600_000).toISOString() })
    expect(future.statusCode).toBe(422)
    expect(future.json().error.code).toBe('INVALID_TIME')
    const before = await addKm(adnan, id, { km: 40_000, occurredAt: '2026-06-01T08:00:00.000Z', note: 'Eski kayıt' })
    expect(before.statusCode).toBe(422)
    expect(before.json().error.code).toBe('INVALID_TIME')
  })

  it('a large increase needs a reason, enforced by the API (over 20.000 km or 1.500 km per day)', async () => {
    const id = await idOf(adnan, 'E45-M-218')
    const bare = await addKm(adnan, id, { km: 45_000 })
    expect(bare.statusCode).toBe(422)
    expect(bare.json().error).toMatchObject({ code: 'LARGE_JUMP_REASON_REQUIRED', details: { deltaKm: 23_460 }, fields: { largeJumpReason: expect.any(String) } })
    const ok = await addKm(adnan, id, { km: 45_000, largeJumpReason: 'Uzun dönem kiralamadan döndü' })
    expect(ok.statusCode).toBe(201)
    expect(ok.json().history.odometer[0]).toMatchObject({ km: 45_000, jumpReason: 'Uzun dönem kiralamadan döndü' })
    // 1.600 km within the same day: over the daily average.
    const daily = await addKm(adnan, id, { km: 46_600, occurredAt: ago(0.5) })
    expect(daily.statusCode).toBe(422)
    expect(daily.json().error.details).toMatchObject({ deltaKm: 1_600, perDay: 1_600 })
    expect((await addKm(adnan, id, { km: 45_400, occurredAt: ago(0.5) })).statusCode).toBe(201)
  })

  it('two users at the same moment: one wins, the other is told the history changed', async () => {
    const id = await idOf(adnan, 'O58-E-467')
    const h = await history(adnan, id)
    const send = (c: Client, km: number) => c.post(`/api/vehicles/${id}/odometer`, { km, occurredAt: ago(1), expectedVersion: h.odometerVersion, clientRequestId: randomUUID() })
    const results = await Promise.all([send(adnan, 15_500), send(selma, 15_600)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409])
    const lost = results.find((r) => r.statusCode === 409)!
    expect(lost.json().error.code).toBe('HISTORY_CHANGED')
    expect(lost.json().error.details.history.odometer).toHaveLength(2)
    expect((await history(adnan, id)).odometer).toHaveLength(2)
  })

  it('a repeated submit does not create a second record', async () => {
    const id = await idOf(adnan, 'O58-E-467')
    const h = await history(adnan, id)
    const body = { km: 15_800, occurredAt: ago(0.5), expectedVersion: h.odometerVersion, clientRequestId: randomUUID() }
    const first = await adnan.post(`/api/vehicles/${id}/odometer`, body)
    const again = await adnan.post(`/api/vehicles/${id}/odometer`, body)
    expect(first.statusCode).toBe(201)
    expect(again.statusCode).toBe(200)
    expect(again.json()).toMatchObject({ id: first.json().id, duplicate: true })
    expect((await history(adnan, id)).odometer.filter((o) => o.km === 15_800)).toHaveLength(1)
  })

  it('needs the record permission; branch, company and session are checked', async () => {
    const own = await idOf(adnan, 'A12-K-345')
    const otherBranch = await idOf(adnan, 'K71-J-904')
    expect((await addKm(selma, otherBranch, { km: 40_000 })).statusCode).toBe(404)
    expect((await selma.get(`/api/vehicles/${otherBranch}/history`)).statusCode).toBe(404)
    expect((await addKm(lejla, own, { km: 50_000 })).statusCode).toBe(404)
    expect((await lejla.get(`/api/vehicles/${own}/history`)).statusCode).toBe(404)
    const anon = await new Client(app).prepare()
    expect((await anon.post(`/api/vehicles/${own}/odometer`, { km: 1 })).statusCode).toBe(401)
    const noCsrf = new Client(app)
    noCsrf.jar = new Map(adnan.jar)
    expect((await noCsrf.post(`/api/vehicles/${own}/odometer`, { km: 1 })).statusCode).toBe(403)
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'vehicles.odometer.record') where name = 'Sahip'`)
    try {
      expect((await addKm(adnan, own, { km: 49_100 })).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = permissions || array['vehicles.odometer.record'] where name = 'Sahip'`)
    }
  })
})

describe('odometer corrections', () => {
  let id: string
  let wrongId: string
  let firstFixId: string

  it('replace: the wrong reading stays, crossed out with a reason; the right value takes its time', async () => {
    id = await idOf(adnan, 'M62-A-238')
    const added = await addKm(adnan, id, { km: 29_900, occurredAt: ago(3) })
    wrongId = added.json().id
    const res = await correctKm(adnan, id, wrongId, { action: 'replace', km: 29_300, reason: 'Gösterge yanlış okundu' })
    expect(res.statusCode).toBe(201)
    const h = res.json().history as VehicleHistory
    const wrong = h.odometer.find((o) => o.id === wrongId)!
    expect(wrong).toMatchObject({ km: 29_900, effective: false, correction: { action: 'replace', reason: 'Gösterge yanlış okundu', byName: 'Adnan Kovač' } })
    const fix = h.odometer.find((o) => o.id === wrong.correction!.replacementId)!
    expect(fix).toMatchObject({ km: 29_300, eventType: 'correction', effective: true, occurredAt: wrong.occurredAt, corrects: { id: wrongId, km: 29_900 } })
    firstFixId = fix.id
    expect((await vehicle(adnan, id)).odometer.km).toBe(29_300)
    const log = await asOwner(data.companies.drina, `select summary from audit_log where action = 'vehicle.odometer.correct' and entity_id = $1`, [id])
    expect(log.rows[0].summary).toMatchObject({ action: 'replace', oldKm: 29_900, newKm: 29_300, reason: 'Gösterge yanlış okundu' })
  })

  it('a corrected value can be corrected again; the chain keeps every step', async () => {
    const res = await correctKm(adnan, id, firstFixId, { action: 'replace', km: 29_350, reason: 'Fiş tekrar kontrol edildi' })
    expect(res.statusCode).toBe(201)
    const h = res.json().history as VehicleHistory
    expect(h.odometer.map((o) => [o.km, o.effective])).toEqual(expect.arrayContaining([[29_900, false], [29_300, false], [29_350, true], [29_115, true]]))
    const second = h.odometer.find((o) => o.km === 29_350)!
    expect(second.corrects).toMatchObject({ id: firstFixId, km: 29_300 })
    expect((await vehicle(adnan, id)).odometer.km).toBe(29_350)
  })

  it('the same record cannot be corrected twice; a new value must fit its neighbours', async () => {
    const twice = await correctKm(adnan, id, wrongId, { action: 'void', reason: 'İkinci düzeltme denemesi' })
    expect(twice.statusCode).toBe(409)
    expect(twice.json().error.code).toBe('ALREADY_CORRECTED')
    const initial = (await history(adnan, id)).odometer.find((o) => o.eventType === 'initial')!
    const tooHigh = await correctKm(adnan, id, initial.id, { action: 'replace', km: 30_000, reason: 'Başlangıç yanlış girilmiş' })
    expect(tooHigh.statusCode).toBe(422)
    expect(tooHigh.json().error.details.problem).toBe('above_next')
  })

  it('void: the reading leaves the current value; history keeps it', async () => {
    const latest = (await history(adnan, id)).odometer.find((o) => o.km === 29_350)!
    const res = await correctKm(adnan, id, latest.id, { action: 'void', reason: 'Yanlış araca girilmiş' })
    expect(res.statusCode).toBe(201)
    expect((await vehicle(adnan, id)).odometer.km).toBe(29_115)
    expect((await history(adnan, id)).odometer).toHaveLength(4)
    expect((await addKm(adnan, id, { km: 29_200 })).statusCode).toBe(201)
  })

  it('needs the correction permission and a reason', async () => {
    const latest = (await history(adnan, id)).odometer[0]!
    expect((await correctKm(selma, id, latest.id, { action: 'void', reason: 'Operasyon denemesi' })).statusCode).toBe(403)
    const short = await correctKm(adnan, id, latest.id, { action: 'void', reason: 'x' })
    expect(short.statusCode).toBe(400)
    expect(short.json().error.fields.reason).toBeTruthy()
  })
})

describe('physical location', () => {
  it('a company-wide user can record any company branch; the home branch does not change', async () => {
    const id = await idOf(adnan, 'K40-M-526')
    const before = await vehicle(adnan, id)
    const res = await setLocation(adnan, id, { locationType: 'branch', branchId: branch('MST') })
    expect(res.statusCode).toBe(201)
    const h = res.json().history as VehicleHistory
    const entry = h.locations.find((l) => l.id === res.json().id)!
    expect(entry).toMatchObject({ type: 'branch', branchName: 'Mostar', eventType: 'manual', reason: 'Sayımda bulundu', previous: { branchName: 'Sarajevo Centar' } })
    const after = await vehicle(adnan, id)
    expect(after.location).toMatchObject({ type: 'branch', branchName: 'Mostar' })
    expect(after.homeBranchId).toBe(before.homeBranchId)
    expect(after.version).toBe(before.version)
    const log = await asOwner(data.companies.drina, `select summary from audit_log where action = 'vehicle.location.record' and entity_id = $1`, [id])
    expect(log.rows[0].summary).toMatchObject({ from: { branchName: 'Sarajevo Centar' }, to: { branchName: 'Mostar' } })
  })

  it('a branch-limited user can only choose their own branches', async () => {
    const id = await idOf(selma, 'A12-K-345')
    const count = (await history(adnan, id)).locations.length
    const denied = await setLocation(selma, id, { locationType: 'branch', branchId: branch('MST') })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().error.code).toBe('BRANCH_FORBIDDEN')
    expect((await history(adnan, id)).locations).toHaveLength(count)
    const service = await setLocation(selma, id, { locationType: 'service_provider', description: 'Auto Servis Ilidža' })
    expect(service.statusCode).toBe(201)
    const back = await setLocation(selma, id, { locationType: 'branch', branchId: branch('SJJ'), occurredAt: ago(0.5) })
    expect(back.statusCode).toBe(201)
    expect((await vehicle(adnan, id)).location).toMatchObject({ branchName: 'Sarajevo Aerodrom' })
    expect((await setLocation(selma, await idOf(adnan, 'K71-J-904'), { locationType: 'branch', branchId: branch('SJJ') })).statusCode).toBe(404)
  })

  it('in transit, with customer and at supplier cannot be entered by hand (API and database)', async () => {
    const id = await idOf(adnan, 'E16-T-093')
    for (const locationType of ['in_transit', 'with_customer', 'supplier']) {
      expect((await setLocation(adnan, id, { locationType })).statusCode).toBe(400)
    }
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into vehicle_location_events (company_id, vehicle_id, location_type, event_type, source_type, occurred_at) values ($1, $2, 'with_customer', 'manual', 'manual', now())`, [
          data.companies.drina,
          id,
        ]),
      ),
    ).rejects.toThrow(/branch or a service provider/)
    const noName = await setLocation(adnan, id, { locationType: 'service_provider' })
    expect(noName.statusCode).toBe(400)
  })

  it('a back-dated location is kept in history but does not replace a newer one; same place is refused', async () => {
    const id = await idOf(adnan, 'E16-T-093')
    expect((await setLocation(adnan, id, { locationType: 'branch', branchId: branch('SAC') })).statusCode).toBe(201)
    const old = await setLocation(adnan, id, { locationType: 'service_provider', description: 'Lastik Servisi', occurredAt: ago(24 * 5) })
    expect(old.statusCode).toBe(201)
    expect(old.json().becameCurrent).toBe(false)
    expect((await vehicle(adnan, id)).location).toMatchObject({ branchName: 'Sarajevo Centar' })
    const same = await setLocation(adnan, id, { locationType: 'branch', branchId: branch('SAC'), occurredAt: ago(0.5) })
    expect(same.statusCode).toBe(422)
    expect(same.json().error.code).toBe('SAME_LOCATION')
  })

  it('another company’s branch cannot be chosen', async () => {
    const id = await idOf(adnan, 'E16-T-093')
    const res = await setLocation(adnan, id, { locationType: 'branch', branchId: data.neretva.branches.MOC })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.fields.branchId).toBeTruthy()
  })

  it('corrections: replace and void with a reason; branch-limited correctors stay within their branches', async () => {
    const id = await idOf(adnan, 'K40-M-526')
    const wrong = (await history(adnan, id)).locations.find((l) => l.branchName === 'Mostar')!
    const fix = await correctLocation(adnan, id, wrong.id, { action: 'replace', locationType: 'branch', branchId: branch('SJJ'), reason: 'Yanlış şube seçilmiş' })
    expect(fix.statusCode).toBe(201)
    const h = fix.json().history as VehicleHistory
    expect(h.locations.find((l) => l.id === wrong.id)).toMatchObject({ effective: false, correction: { action: 'replace', reason: 'Yanlış şube seçilmiş' } })
    const replacement = h.locations.find((l) => l.corrects?.id === wrong.id)!
    expect(replacement).toMatchObject({ branchName: 'Sarajevo Aerodrom', eventType: 'correction', occurredAt: wrong.occurredAt })
    expect((await vehicle(adnan, id)).location).toMatchObject({ branchName: 'Sarajevo Aerodrom' })
    expect((await correctLocation(adnan, id, wrong.id, { action: 'void', reason: 'İkinci deneme' })).statusCode).toBe(409)
    // Selma gets the correction permission for this check; a Mostar record is outside her branches.
    await asOwner(data.companies.drina, `update roles set permissions = permissions || array['vehicles.history.correct'] where name = 'Operasyon'`)
    try {
      const a12 = await idOf(adnan, 'A12-K-345')
      expect((await setLocation(adnan, a12, { locationType: 'branch', branchId: branch('MST'), occurredAt: ago(0.2) })).statusCode).toBe(201)
      const mostar = (await history(adnan, a12)).locations.find((l) => l.branchName === 'Mostar')!
      expect((await correctLocation(selma, a12, mostar.id, { action: 'void', reason: 'Selma denemesi' })).statusCode).toBe(403)
      const voided = await correctLocation(adnan, a12, mostar.id, { action: 'void', reason: 'Araç Mostar’a gitmedi' })
      expect(voided.statusCode).toBe(201)
      expect((await vehicle(adnan, a12)).location).toMatchObject({ branchName: 'Sarajevo Aerodrom' })
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'vehicles.history.correct') where name = 'Operasyon'`)
    }
  })
})

describe('database guards', () => {
  it('histories and corrections are append-only for the application role', async () => {
    for (const table of ['odometer_corrections', 'vehicle_location_corrections', 'odometer_readings', 'vehicle_location_events']) {
      await expect(asApp(data.companies.drina, (c) => c.query(`update ${table} set created_at = now()`))).rejects.toThrow(/permission denied/)
      await expect(asApp(data.companies.drina, (c) => c.query(`delete from ${table}`))).rejects.toThrow(/permission denied/)
    }
  })

  it('a direct insert cannot break the order, use the future or point a correction at another vehicle', async () => {
    const a12 = await idOf(adnan, 'A12-K-345')
    const e45 = await idOf(adnan, 'E45-M-218')
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, occurred_at) values ($1, $2, 1, 'manual', 'manual', now())`, [data.companies.drina, a12]),
      ),
    ).rejects.toThrow(/chronological order/)
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, occurred_at) values ($1, $2, 900000, 'manual', 'manual', now() + interval '1 day')`, [
          data.companies.drina,
          a12,
        ]),
      ),
    ).rejects.toThrow(/future/)
    const reading = (await history(adnan, a12)).odometer[0]!
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into odometer_corrections (company_id, vehicle_id, reading_id, action, reason) values ($1, $2, $3, 'void', 'başka araç')`, [data.companies.drina, e45, reading.id]),
      ),
    ).rejects.toThrow(/same vehicle/)
  })

  it('existing preset roles get the new permissions once; Operasyon does not get corrections; custom roles are untouched', async () => {
    const owner = drizzle(ownerPool, { schema })
    const v2 = ROLE_PRESET_HISTORY.find((h) => h.version === 2)!.presets
    await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Operasyon'`, [[...v2.Operasyon!]])
    await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Sayım', $2)`, [data.companies.drina, [...v2.Operasyon!]])
    try {
      const first = await upgradePresetRoles(owner)
      expect(first.filter((r) => r.company === 'Drina Rent a Car')).toEqual([{ company: 'Drina Rent a Car', role: 'Operasyon', added: ['vehicles.odometer.record', 'vehicles.location.record'] }])
      expect(await upgradePresetRoles(owner)).toEqual([])
      const roles = (await asOwner(data.companies.drina, `select name, permissions from roles`)).rows as { name: string; permissions: string[] }[]
      expect(roles.find((r) => r.name === 'Operasyon')!.permissions.sort()).toEqual([...ROLE_PRESETS.Operasyon!].sort())
      expect(roles.find((r) => r.name === 'Operasyon')!.permissions).not.toContain('vehicles.history.correct')
      expect(roles.find((r) => r.name === 'Sayım')!.permissions.sort()).toEqual([...v2.Operasyon!].sort())
    } finally {
      await asOwner(data.companies.drina, `delete from roles where name = 'Sayım'`)
      await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Operasyon'`, [[...ROLE_PRESETS.Operasyon!]])
    }
  })
})
