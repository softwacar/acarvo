import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import {
  CHECKLIST_ITEMS,
  type DamageDetail,
  type MaintenanceDetail,
  type RentalDetail,
  type ReservationDetail,
  todayIn,
  type TransferDetail,
  type VehicleOperations,
} from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Maintenance, damage and vehicle transfers V1 (docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md): the shared vehicle allocation,
// lifecycles, km/location history, branch scope, permissions, isolation, time zones and concurrency. acarvo_test only,
// synthetic data. Nothing here creates a charge, payment, deposit deduction or insurance claim.

const TZ = 'Europe/Sarajevo'
let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip, all branches
let selma: Client // Drina Operasyon, SJJ only
let lejla: Client // Neretva Sahip
let kontrol: Client // Drina Yönetici, all branches
let sacOnly: Client // Drina Operasyon, SAC only
let jpeg: Buffer
const ids: Record<string, string> = {}
let cls: Record<string, string> = {}
const uuid = () => randomUUID()
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn(TZ)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
/** A wall time `minutes` from now in Sarajevo (minute precision). */
const nowLocal = (minutes = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + minutes * 60_000)).replace(' ', 'T')
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
const vehicle = async (plate: string) => (await one(`select id from vehicles where plate = $1`, [plate])).id as string
const maxKm = async (vehicleId: string) => Number((await one(`select max(km) as km from odometer_readings where vehicle_id = $1`, [vehicleId])).km)
const lastLocation = async (vehicleId: string) =>
  one(`select e.location_type, b.code, e.event_type from vehicle_location_events e left join branches b on b.id = e.branch_id where e.vehicle_id = $1 order by e.occurred_at desc, e.created_at desc limit 1`, [vehicleId])
const checklistAll = Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, 'ok']))
async function login(email: string) {
  const c = new Client(app)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}
async function addUser(email: string, roleName: string, branches: string[] | 'all') {
  const role = (await one(`select id from roles where name = $1`, [roleName])).id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select $2, 'Sentetik Kullanıcı', password_hash from users where email = $1 returning id`, [EMAILS.adnan, email])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, $3) returning id`, [data.companies.drina, user, branches === 'all' ? 'yes' : 'no'])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  if (branches !== 'all') for (const b of branches) await asOwner(data.companies.drina, `insert into membership_branches (company_id, membership_id, branch_id) values ($1, $2, $3)`, [data.companies.drina, m, b])
  return login(email)
}

const reservation = (vehicleId: string, from: string, to: string, over: Record<string, unknown> = {}) =>
  adnan.post('/api/reservations', { customerId: ids.mirza, vehicleClassId: cls[vehicleId], vehicleId, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: from, returnLocal: to, source: 'phone', confirm: true, ...over })
const plan = (c: Client, vehicleId: string, from: string, to: string, over: Record<string, unknown> = {}) =>
  c.post('/api/maintenance', { requestId: uuid(), vehicleId, branchId: ids.sjj, type: 'periodic', reason: 'Periyodik bakım', plannedStartLocal: from, plannedEndLocal: to, ...over })
const transfer = (c: Client, vehicleId: string, from: string, to: string, over: Record<string, unknown> = {}) =>
  c.post('/api/transfers', { requestId: uuid(), vehicleId, fromBranchId: ids.sjj, toBranchId: ids.sac, reason: 'Şube ihtiyacı', plannedDepartureLocal: from, plannedArrivalLocal: to, ...over })
const damage = (c: Client, vehicleId: string, over: Record<string, unknown> = {}) =>
  c.post('/api/damages', { requestId: uuid(), vehicleId, branchId: ids.sjj, view: 'front', description: 'Ön tamponda çizik', damageType: 'scratch', severity: 'minor', usability: 'usable', ...over })
const act = (c: Client, url: string, d: { version: number }, body: Record<string, unknown> = {}) => c.post(url, { version: d.version, requestId: uuid(), ...body })

/** A prepared rental whose handover desk is complete (documents, inspection, 4 photos), ready to deliver. */
async function readyRental(vehicleId: string, pickup: string, ret: string) {
  let res = await adnan.post('/api/rentals', {
    customerId: ids.ajla,
    drivers: [{ customerId: ids.ajla, isPrimary: true }],
    vehicleClassId: cls[vehicleId],
    vehicleId,
    pickupBranchId: ids.sjj,
    returnBranchId: ids.sjj,
    pickupLocal: pickup,
    returnLocal: ret,
    requestId: uuid(),
  })
  expect(res.statusCode, res.body).toBe(201)
  let d = res.json() as RentalDetail
  res = await adnan.put(`/api/rentals/${d.id}/document-check`, { version: d.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })
  if (res.statusCode === 200) d = res.json()
  res = await adnan.put(`/api/rentals/${d.id}/inspections/handover`, { inspectionVersion: 0, km: (await maxKm(vehicleId)) + 10, fuel: 'full', cleanliness: 'clean', condition: 'good', checklist: checklistAll, counterpartCustomerId: ids.ajla, marks: [] })
  expect(res.statusCode, res.body).toBe(200)
  for (const angle of ['front', 'rear', 'left', 'right']) {
    res = await adnan.upload(`/api/rentals/${d.id}/inspections/handover/photos?angle=${angle}`, jpeg)
    expect(res.statusCode, res.body).toBe(201)
  }
  return res.json() as RentalDetail
}
const deliver = (c: Client, d: RentalDetail) =>
  c.post(`/api/rentals/${d.id}/deliver`, { version: d.version, inspectionVersion: d.handover!.version, requestId: uuid(), externalContractAck: true, externalPricingAck: true, externalReference: 'DIS-OPS/1' })

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (c, _e, done) => (String(c).includes('"level":50') && process.stderr.write(c), done()) }) })
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  for (const c of ['SJJ', 'SAC', 'MST']) ids[c.toLowerCase()] = (await one(`select id from branches where code = $1`, [c])).id
  for (const [k, n] of [['ajla', 'Ajla Testović'], ['mirza', 'Mirza Uzorak']]) ids[k] = (await one(`select id from customers where display_name = $1`, [n])).id
  cls = Object.fromEntries(((await asOwner(data.companies.drina, `select id, class_id from vehicles`)).rows as { id: string; class_id: string }[]).map((r) => [r.id, r.class_id]))
  kontrol = await addUser('kontrol@drina-demo.ba', 'Yönetici', 'all')
  sacOnly = await addUser('sac@drina-demo.ba', 'Operasyon', [ids.sac])
  jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 90, g: 90, b: 120 } } }).jpeg().toBuffer()
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('permissions', () => {
  it('presets: Sahip and Yönetici get every operations permission; Operasyon plans, reports, requests and moves but does not approve, review or unblock', async () => {
    const perms = async (name: string) => ((await one(`select permissions from roles where name = $1`, [name])).permissions as string[]).filter((p) => /^(maintenance|damage|transfers)\./.test(p)).sort()
    expect(await perms('Sahip')).toHaveLength(11)
    expect(await perms('Yönetici')).toHaveLength(11)
    expect(await perms('Operasyon')).toEqual(['damage.read', 'damage.report', 'maintenance.manage', 'maintenance.read', 'transfers.execute', 'transfers.read', 'transfers.request'])
  })

  it('another company sees nothing; without a permission the lists are refused', async () => {
    for (const url of ['/api/maintenance/search', '/api/damages/search', '/api/transfers/search']) {
      expect((await lejla.post(url, {})).json().total).toBe(0)
    }
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'maintenance.read') where name = 'Operasyon'`)
    try {
      expect((await selma.post('/api/maintenance/search', {})).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'maintenance.read') where name = 'Operasyon'`)
    }
  })
})

describe('maintenance and the shared vehicle allocation', () => {
  it('a plan without conflicts holds the vehicle: an overlapping reservation is refused (API and database), a touching one is not', async () => {
    const v = await vehicle('M87-J-529')
    const res = await plan(selma, v, local(10, '08:00'), local(11, '17:00'))
    expect(res.statusCode, res.body).toBe(201)
    const m = res.json() as MaintenanceDetail
    expect(m).toMatchObject({ status: 'planned', maintenanceNo: 'B-000001', plannedStart: { local: local(10, '08:00'), timeZone: TZ }, conflicts: [] })
    const r = await reservation(v, local(11, '09:00'), local(12, '09:00'))
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [{ kind: 'maintenance', refNo: 'B-000001' }] } })
    expect((await reservation(v, local(11, '17:00'), local(12, '17:00'))).statusCode).toBe(201)
    // A pending reservation in the window, confirmed directly in the database: the trigger refuses it too.
    const p = (await reservation(v, local(10, '09:00'), local(10, '12:00'), { confirm: false })).json() as ReservationDetail
    await expect(asOwner(data.companies.drina, `update reservations set status = 'confirmed', confirmed_at = now() where id = $1`, [p.id])).rejects.toThrow(/maintenance/)
  })

  it('a plan conflicting with a confirmed reservation is refused with the reasons, or kept pending (holding nothing); approval needs the conflict gone', async () => {
    const v = await vehicle('M87-J-529')
    const r = (await reservation(v, local(20, '10:00'), local(22, '10:00'))).json() as ReservationDetail
    const refused = await plan(selma, v, local(21, '08:00'), local(21, '18:00'))
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error).toMatchObject({ code: 'MAINTENANCE_CONFLICT', details: { conflicts: [{ kind: 'reservation', refNo: r.reservationNo }] } })
    expect(refused.body).not.toMatch(/Mirza/)
    const kept = (await plan(selma, v, local(21, '08:00'), local(21, '18:00'), { keepPending: true })).json() as MaintenanceDetail
    expect(kept).toMatchObject({ status: 'pending_approval', conflicts: [{ kind: 'reservation', refNo: r.reservationNo }] })
    expect((await adnan.get(`/api/reservations/${r.id}`)).json().status).toBe('confirmed') // never cancelled
    expect((await act(selma, `/api/maintenance/${kept.id}/approve`, kept)).statusCode).toBe(403) // Operasyon cannot approve
    const stillBusy = await act(kontrol, `/api/maintenance/${kept.id}/approve`, kept)
    expect(stillBusy.json().error.code).toBe('MAINTENANCE_CONFLICT')
    expect((await adnan.post(`/api/reservations/${r.id}/cancel`, { version: r.version, reason: 'customer_request' })).statusCode).toBe(200)
    const ok = await act(kontrol, `/api/maintenance/${kept.id}/approve`, kept)
    expect(ok.statusCode, ok.body).toBe(200)
    expect(ok.json()).toMatchObject({ status: 'planned', approvedByName: 'Sentetik Kullanıcı' })
  })

  it('times are branch wall times: a skipped time is refused, a doubled time needs a choice', async () => {
    const v = await vehicle('M87-J-529')
    const skipped = await plan(adnan, v, '2027-03-28T02:30', '2027-03-28T06:00')
    expect(skipped.json().error.fields.plannedStartLocal).toMatch(/yaşanmadı/)
    const doubled = await plan(adnan, v, '2026-10-25T02:30', '2026-10-25T06:00')
    expect(doubled.json().error.code).toBe('AMBIGUOUS_TIME')
    const chosen = await plan(adnan, v, '2026-10-25T02:30', '2026-10-25T06:00', { plannedStartChoice: 'later' })
    expect(chosen.statusCode, chosen.body).toBe(201)
    expect((chosen.json() as MaintenanceDetail).plannedStart.at).toBe('2026-10-25T01:30:00.000Z')
    await act(adnan, `/api/maintenance/${chosen.json().id}/cancel`, chosen.json(), { reason: 'Test planı kaldırıldı' })
  })

  it('start → work done → check → complete: km and service-provider location go to the history atomically; completed is final; not "ready for handover"', async () => {
    const v = await vehicle('M87-J-529')
    let m = (await plan(selma, v, nowLocal(-30), local(3, '17:00'), { type: 'repair', reason: 'Fren balatası' })).json() as MaintenanceDetail
    const km0 = await maxKm(v)
    // A km below the history is refused and nothing changes (the start is one transaction).
    const low = await act(selma, `/api/maintenance/${m.id}/start`, m, { km: km0 - 100, atProvider: true, providerName: 'Oto Servis d.o.o.' })
    expect(low.json().error.code).toBe('ODOMETER_OUT_OF_ORDER')
    expect((await selma.get(`/api/maintenance/${m.id}`)).json().status).toBe('planned')
    const res = await act(selma, `/api/maintenance/${m.id}/start`, m, { km: km0 + 12, atProvider: true, providerName: 'Oto Servis d.o.o.' })
    expect(res.statusCode, res.body).toBe(200)
    m = res.json()
    expect(m).toMatchObject({ status: 'in_service', startKm: km0 + 12, atProvider: true, startedByName: 'Selma Karić' })
    expect(await lastLocation(v)).toMatchObject({ location_type: 'service_provider', event_type: 'maintenance_start' })
    expect(await one(`select km, source_type from odometer_readings where source_id = $1`, [m.id])).toMatchObject({ km: km0 + 12, source_type: 'maintenance_start' })
    // While in service: no new rental or confirmed reservation in the window.
    expect((await reservation(v, local(2, '10:00'), local(2, '12:00'))).json().error.code).toBe('VEHICLE_UNAVAILABLE')
    const rent = await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: cls[v], vehicleId: v, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(1, '10:00'), returnLocal: local(2, '10:00'), requestId: uuid() })
    expect(rent.json().error.code).toBe('VEHICLE_UNAVAILABLE')
    m = (await act(selma, `/api/maintenance/${m.id}/work-done`, m, { workDone: 'Ön balatalar değişti', parts: 'Balata seti' })).json()
    expect(m.status).toBe('awaiting_check')
    expect((await act(selma, `/api/maintenance/${m.id}/complete`, m, { km: km0 + 20, returnBranchId: ids.sjj })).statusCode).toBe(403) // Operasyon cannot complete
    expect((await act(kontrol, `/api/maintenance/${m.id}/complete`, m, { km: km0 + 20 })).json().error.fields).toHaveProperty('returnBranchId')
    expect((await act(kontrol, `/api/maintenance/${m.id}/complete`, m, { km: km0 + 5, returnBranchId: ids.sjj })).json().error.code).toBe('KM_BELOW_START')
    const done = await act(kontrol, `/api/maintenance/${m.id}/complete`, m, { km: km0 + 20, returnBranchId: ids.sjj })
    expect(done.statusCode, done.body).toBe(200)
    m = done.json()
    expect(m).toMatchObject({ status: 'completed', endKm: km0 + 20 })
    expect(m.events.map((e) => e.kind)).toEqual(['completed', 'work_done', 'started', 'created'])
    expect(await lastLocation(v)).toMatchObject({ location_type: 'branch', code: 'SJJ', event_type: 'maintenance_end' })
    // Final: neither the API nor the database changes it; nothing is deleted.
    expect((await adnan.put(`/api/maintenance/${m.id}`, { version: m.version, requestId: uuid(), notes: 'x' })).json().error.code).toBe('INVALID_TRANSITION')
    await expect(asOwner(data.companies.drina, `update maintenance_records set notes = 'x' where id = $1`, [m.id])).rejects.toThrow(/cannot change/)
    await expect(asOwner(data.companies.drina, `delete from maintenance_records where id = $1`, [m.id])).rejects.toThrow(/kept as history/)
    await expect(asOwner(data.companies.drina, `update maintenance_events set reason = 'x' where maintenance_id = $1`, [m.id])).rejects.toThrow(/kept as history/)
    // The vehicle is free again, but completion is shown at the handover desk as a reason to check readiness.
    const k = await readyRental(v, nowLocal(5), local(2, '10:00'))
    expect(k.deliveryGates.find((g) => g.code === 'vehicle_operations')).toMatchObject({ state: 'attention', detail: { maintenanceNo: m.maintenanceNo } })
    expect(k.deliveryGates.find((g) => g.code === 'availability')!.state).toBe('ok')
    await adnan.post(`/api/rentals/${k.id}/cancel`, { version: k.version, requestId: uuid(), reason: 'entry_error' })
  })

  it('taking a vehicle into service after its planned end needs a new expected end; an overdue maintenance stays open-ended', async () => {
    const v = await vehicle('M62-A-238')
    let m = (await plan(adnan, v, nowLocal(-120), nowLocal(-60))).json() as MaintenanceDetail
    const late = await act(adnan, `/api/maintenance/${m.id}/start`, m)
    expect(late.json().error.fields).toHaveProperty('expectedEndLocal')
    m = (await act(adnan, `/api/maintenance/${m.id}/start`, m, { expectedEndLocal: nowLocal(180) })).json()
    expect(m.status).toBe('in_service')
    // Now the expected end passes without completion: the hold has no end; a reservation weeks later is refused.
    await asOwner(data.companies.drina, `update maintenance_records set planned_end_at = now() - interval '1 minute' where id = $1`, [m.id])
    const r = await reservation(v, local(40, '10:00'), local(41, '10:00'), { vehicleClassId: cls[v] })
    expect(r.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [{ kind: 'maintenance', endsAt: null }] } })
    const list = (await adnan.post('/api/maintenance/search', { view: 'overdue' })).json()
    expect(list.items.map((i: { id: string }) => i.id)).toContain(m.id)
    expect(list.counts.overdue).toBeGreaterThanOrEqual(1)
  })

  it('periodic service is computed from real records and is only a reminder', async () => {
    const v = await vehicle('M87-J-529')
    let ops = (await adnan.get(`/api/vehicles/${v}/operations`)).json() as VehicleOperations
    expect(ops.serviceDue).toMatchObject({ state: 'no_schedule', last: null })
    const due = await adnan.put(`/api/vehicles/${v}/maintenance-schedule`, { version: 0, intervalKm: 15000, intervalMonths: 12 })
    expect(due.statusCode, due.body).toBe(200)
    expect(due.json().state).toBe('no_history') // the repair above is not periodic: no invented date
    ops = (await adnan.get(`/api/vehicles/${v}/operations`)).json()
    expect(ops.maintenance.length).toBeGreaterThanOrEqual(3)
    expect(ops.access).toEqual({ maintenance: true, damage: true, transfers: true })
    expect((await selma.put(`/api/vehicles/${v}/maintenance-schedule`, { version: 0, intervalKm: 500 })).json().error.code).toBe('VERSION_CONFLICT')
  })
})

describe('damage files and blocks', () => {
  it('a minor finding blocks nothing; a not-usable damage blocks confirmation and new rentals, keeps existing reservations (at risk) and never creates money records', async () => {
    const v = await vehicle('A39-T-657')
    const finance = async () => Number((await one(`select (select count(*) from finance_charges) + (select count(*) from finance_payments) + (select count(*) from finance_deposits) + (select count(*) from rental_finances) as n`)).n)
    const before = await finance()
    const minor = (await damage(selma, v)).json() as DamageDetail
    expect(minor).toMatchObject({ damageNo: 'H-000001', reviewStatus: 'reported', blocked: false, usability: 'usable' })
    const kept = (await reservation(v, local(30, '10:00'), local(31, '10:00'))).json() as ReservationDetail
    expect(kept.status).toBe('confirmed')
    expect((await damage(selma, v, { usability: 'not_usable' })).json().error.fields).toHaveProperty('blockReason')
    const blocking = (await damage(selma, v, { view: 'left', damageType: 'mechanical', severity: 'severe', usability: 'not_usable', blockReason: 'Motor arıza lambası' })).json() as DamageDetail
    expect(blocking).toMatchObject({ blocked: true, blocks: [{ startReason: 'Motor arıza lambası', endedAt: null }], atRisk: [{ kind: 'reservation', refNo: kept.reservationNo }] })
    expect((await adnan.get(`/api/reservations/${kept.id}`)).json().status).toBe('confirmed')
    expect((await reservation(v, local(35, '10:00'), local(36, '10:00'))).json().error.code).toBe('VEHICLE_UNAVAILABLE')
    const direct = await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: cls[v], vehicleId: v, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(1, '10:00'), returnLocal: local(2, '10:00'), requestId: uuid() })
    expect(direct.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [{ kind: 'damage', refNo: blocking.damageNo }] } })
    expect(await finance()).toBe(before)
    // A maintenance plan is allowed (repairs need the vehicle).
    const repair = await plan(selma, v, local(5, '08:00'), local(6, '17:00'), { type: 'repair', damageFileId: blocking.id })
    expect(repair.statusCode, repair.body).toBe(201)
    // Lifting the block: own permission and a reason; the maintenance still holds its window.
    expect((await act(selma, `/api/damages/${blocking.id}/unblock`, blocking, { reason: 'Arıza giderildi', usability: 'usable' })).statusCode).toBe(403)
    const closing = await act(kontrol, `/api/damages/${blocking.id}/review`, blocking, { reviewStatus: 'closed', note: 'Kapatma denemesi' })
    expect(closing.json().error.code).toBe('CLOSE_BLOCKED')
    const lifted = await act(kontrol, `/api/damages/${blocking.id}/unblock`, blocking, { reason: 'Arıza giderildi', usability: 'usable' })
    expect(lifted.statusCode, lifted.body).toBe(200)
    expect(lifted.json()).toMatchObject({ blocked: false, usability: 'usable', maintenance: [{ maintenanceNo: repair.json().maintenanceNo }] })
    expect((await reservation(v, local(35, '10:00'), local(36, '10:00'))).statusCode).toBe(201)
    expect((await reservation(v, local(5, '10:00'), local(5, '12:00'))).json().error.details.conflicts[0].kind).toBe('maintenance')
    // History of the block stays; the damage is never marked repaired by the maintenance.
    const d = (await adnan.get(`/api/damages/${blocking.id}`)).json() as DamageDetail
    expect(d.repairStatus).toBe('pending')
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['created', 'blocked', 'unblocked']))
    await expect(asOwner(data.companies.drina, `update damage_blocks set end_reason = 'değişti değişti' where damage_id = $1`, [blocking.id])).rejects.toThrow(/only gets its end/)
    await expect(asOwner(data.companies.drina, `delete from damage_files where id = $1`, [minor.id])).rejects.toThrow(/kept as history/)
  })

  it('a block on a prepared rental’s vehicle stops the handover (the desk names the damage); lifting it lets the handover through', async () => {
    const v = await vehicle('E16-T-093')
    const k = await readyRental(v, nowLocal(10), local(2, '10:00'))
    const b = (await damage(adnan, v, { usability: 'not_usable', blockReason: 'Ön cam kırık', damageType: 'glass', severity: 'severe' })).json() as DamageDetail
    const res = await deliver(adnan, k)
    expect(res.json().error.code).toBe('DELIVERY_BLOCKED')
    expect(res.json().error.details.gates.find((g: { code: string }) => g.code === 'availability')).toMatchObject({ state: 'blocked', detail: { refs: `Hasar engeli ${b.damageNo} (engel sürüyor)` } })
    await act(adnan, `/api/damages/${b.id}/unblock`, b, { reason: 'Cam değiştirildi', usability: 'usable' })
    const again = (await adnan.get(`/api/rentals/${k.id}`)).json() as RentalDetail
    expect(again.deliveryGates.find((g) => g.code === 'vehicle_operations')).toMatchObject({ state: 'attention', detail: { openDamages: 1 } })
    expect((await deliver(adnan, again)).statusCode).toBe(200)
  })

  it('a finding of a final return inspection becomes one damage file; the inspection mark is not changed; a second file for it is refused', async () => {
    const rentalId = (await one(`select id from rentals where rental_no = 'K-000004'`)).id
    const markBefore = await one(`select m.* from rental_damage_marks m join rental_inspections i on i.id = m.inspection_id where i.rental_id = $1 and i.kind = 'return' and m.existing_mark_id is null`, [rentalId])
    const cands = (await adnan.get(`/api/damages/candidates?rentalId=${rentalId}`)).json().items as { markId: string; newFinding: boolean; damageFile: unknown }[]
    expect(cands.filter((c) => c.newFinding)).toHaveLength(1)
    expect((await selma.get(`/api/damages/candidates?rentalId=${rentalId}`)).statusCode).toBe(404) // MST rental, SJJ user
    const v = (await one(`select vehicle_id from rentals where id = $1`, [rentalId])).vehicle_id
    const body = { vehicleId: v, branchId: ids.mst, rentalId, sourceMarkId: markBefore.id, view: 'rear', damageType: 'dent', severity: 'moderate', usability: 'restricted', description: 'İadede arka kapıda göçük' }
    const res = await damage(adnan, v, body)
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ rental: { rentalNo: 'K-000004' }, source: { inspectionKind: 'return', markId: markBefore.id, markCategory: 'dent' } })
    const dup = await damage(adnan, v, body)
    expect(dup.json().error.code).toBe('DUPLICATE_FINDING')
    await expect(asOwner(data.companies.drina, `insert into damage_files (company_id, damage_no, vehicle_id, branch_id, rental_id, inspection_id, source_mark_id, detected_at, timezone, view, description, damage_type, severity, usability)
      select company_id, 'H-999999', $2, $3, $4, inspection_id, id, now(), 'Europe/Sarajevo', 'rear', 'Kopya bulgu', 'dent', 'minor', 'usable' from rental_damage_marks where id = $1`, [markBefore.id, v, ids.mst, rentalId])).rejects.toThrow(/damage_files_source_mark_key/)
    expect(await one(`select * from rental_damage_marks where id = $1`, [markBefore.id])).toEqual(markBefore)
    expect((await adnan.get(`/api/damages/candidates?rentalId=${rentalId}`)).json().items.find((c: { markId: string }) => c.markId === markBefore.id).damageFile).toMatchObject({ damageNo: res.json().damageNo })
  })

  it('photos are cleaned, stored privately and streamed only inside the company and scope', async () => {
    const v = await vehicle('A39-T-657')
    const d = (await damage(selma, v, { description: 'Sağ ayna kırık', view: 'right' })).json() as DamageDetail
    const up = await selma.upload(`/api/damages/${d.id}/photos`, jpeg)
    expect(up.statusCode, up.body).toBe(201)
    const photo = (up.json() as DamageDetail).photos[0]!
    const img = await selma.get(photo.url)
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/webp')
    expect(img.headers['cache-control']).toMatch(/no-store/)
    expect((await lejla.get(photo.url)).statusCode).toBe(404)
    expect((await sacOnly.get(photo.url)).statusCode).toBe(404)
    expect((await one(`select f.kind, f.storage_key from files f join damage_photos p on p.file_id = f.id where p.id = $1`, [photo.id])).storage_key).toMatch(/^damages\//)
  })
})

describe('vehicle transfers', () => {
  it('request → approve → depart (in transit) → receive at the destination; location and km atomic; home branch unchanged', async () => {
    const v = await vehicle('E63-A-847')
    expect((await transfer(selma, v, local(3, '09:00'), local(3, '13:00'), { fromBranchId: ids.sac, toBranchId: ids.sjj })).statusCode).toBe(403)
    let t = (await transfer(selma, v, nowLocal(-10), nowLocal(240))).json() as TransferDetail
    expect(t).toMatchObject({ transferNo: 'T-000001', status: 'requested', fromBranch: { code: 'SJJ' }, toBranch: { code: 'SAC' }, can: { approve: false, depart: false, receive: false, cancel: true } })
    // A request holds nothing.
    const resv = (await reservation(v, nowLocal(60), nowLocal(120))).json() as ReservationDetail
    expect(resv.status).toBe('confirmed')
    const busy = await act(kontrol, `/api/transfers/${t.id}/approve`, t)
    expect(busy.json().error).toMatchObject({ code: 'TRANSFER_CONFLICT', details: { conflicts: [{ kind: 'reservation' }] } })
    expect((await adnan.post(`/api/reservations/${resv.id}/cancel`, { version: resv.version, reason: 'customer_request' })).statusCode).toBe(200)
    expect((await act(selma, `/api/transfers/${t.id}/approve`, t)).statusCode).toBe(403)
    t = (await act(kontrol, `/api/transfers/${t.id}/approve`, t)).json()
    expect(t.status).toBe('approved')
    expect((await reservation(v, nowLocal(60), nowLocal(120))).json().error.details.conflicts[0].kind).toBe('transfer')
    const km0 = await maxKm(v)
    t = (await act(selma, `/api/transfers/${t.id}/depart`, t, { km: km0 + 3, fuel: 'full' })).json()
    expect(t).toMatchObject({ status: 'in_transit', departureKm: km0 + 3, departureFuel: 'full', late: false })
    expect(await lastLocation(v)).toMatchObject({ location_type: 'in_transit', event_type: 'transfer_departure' })
    // In transit is not arrived; no rental starts meanwhile; the origin cannot receive for the destination.
    const rent = await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: cls[v], vehicleId: v, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: nowLocal(30), returnLocal: nowLocal(90), requestId: uuid() })
    expect(rent.json().error.details.conflicts[0]).toMatchObject({ kind: 'transfer', refNo: 'T-000001' })
    const fromSide = await act(selma, `/api/transfers/${t.id}/receive`, t, { km: km0 + 80, fuel: 'half' })
    expect(fromSide.json().error.code).toBe('BRANCH_FORBIDDEN')
    expect((await act(sacOnly, `/api/transfers/${t.id}/receive`, t, { km: km0 + 1, fuel: 'half' })).json().error.code).toBe('ARRIVAL_KM_BELOW_DEPARTURE')
    expect((await act(sacOnly, `/api/transfers/${t.id}/cancel`, t, { reason: 'Vazgeçildi deneme' })).json().error.code).toBe('BRANCH_FORBIDDEN')
    const got = await act(sacOnly, `/api/transfers/${t.id}/receive`, t, { km: km0 + 80, fuel: 'half', note: 'Sağlam teslim alındı' })
    expect(got.statusCode, got.body).toBe(200)
    t = got.json()
    expect(t).toMatchObject({ status: 'completed', arrivalKm: km0 + 80, receivedByName: 'Sentetik Kullanıcı' })
    expect(await lastLocation(v)).toMatchObject({ location_type: 'branch', code: 'SAC', event_type: 'transfer_arrival' })
    expect((await one(`select b.code from vehicles v join branches b on b.id = v.home_branch_id where v.id = $1`, [v])).code).toBe('SJJ')
    expect(await one(`select count(*)::int n from odometer_readings where source_id = $1`, [t.id])).toEqual({ n: 2 })
    // Completed is final; events append-only; cancel after departure impossible.
    expect((await act(adnan, `/api/transfers/${t.id}/cancel`, t, { reason: 'Çok geç iptal' })).json().error.code).toBe('INVALID_TRANSITION')
    await expect(asOwner(data.companies.drina, `update vehicle_transfers set arrival_km = arrival_km + 1 where id = $1`, [t.id])).rejects.toThrow(/cannot change/)
    await expect(asOwner(data.companies.drina, `delete from transfer_events where transfer_id = $1`, [t.id])).rejects.toThrow(/kept as history/)
    // The arrival reading cannot be below the departure in the database either.
    await expect(asOwner(data.companies.drina, `insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at) values ($1, $2, 1, 'transfer_arrival', 'transfer_arrival', $3, now())`, [data.companies.drina, v, t.id])).rejects.toThrow()
  })

  it('a transfer never silently invalidates a confirmed reservation; a reservation is not confirmed where a transfer takes the vehicle away', async () => {
    const v = await vehicle('K40-M-526') // home SJJ, currently at SAC
    const atSjj = (await reservation(v, local(15, '10:00'), local(16, '10:00'))).json() as ReservationDetail
    let t = (await transfer(adnan, v, local(8, '09:00'), local(8, '15:00'))).json() as TransferDetail
    expect(t.nextCommitmentConflict).toBe(atSjj.reservationNo)
    const refused = await act(adnan, `/api/transfers/${t.id}/approve`, t)
    expect(refused.json().error).toMatchObject({ code: 'NEXT_COMMITMENT_ELSEWHERE', details: { refNo: atSjj.reservationNo } })
    expect((await adnan.get(`/api/reservations/${atSjj.id}`)).json().status).toBe('confirmed')
    // Move the reservation to start at SAC: now the transfer fits; afterwards an SJJ reservation is refused.
    const moved = await adnan.put(`/api/reservations/${atSjj.id}`, { version: atSjj.version, customerId: ids.mirza, vehicleClassId: cls[v], vehicleId: v, pickupBranchId: ids.sac, returnBranchId: ids.sac, pickupLocal: local(15, '10:00'), returnLocal: local(16, '10:00'), source: 'phone', changeReason: 'operational' })
    expect(moved.statusCode, moved.body).toBe(200)
    t = (await act(adnan, `/api/transfers/${t.id}/approve`, t)).json()
    expect(t.status).toBe('approved')
    const sjj = await reservation(v, local(20, '10:00'), local(21, '10:00'))
    expect(sjj.json().error.code).toBe('VEHICLE_ELSEWHERE')
    expect((await reservation(v, local(20, '10:00'), local(21, '10:00'), { pickupBranchId: ids.sac, returnBranchId: ids.sac })).statusCode).toBe(201)
    t = (await act(adnan, `/api/transfers/${t.id}/cancel`, t, { reason: 'Plan değişti' })).json()
    expect(t.status).toBe('cancelled')
  })

  it('no transfer of a vehicle in an active rental or in maintenance', async () => {
    const delivered = (await one(`select vehicle_id from rentals where rental_no = 'K-000001'`)).vehicle_id // SAC, with the customer
    const t1 = (await transfer(adnan, delivered, nowLocal(0), nowLocal(300), { fromBranchId: ids.sac, toBranchId: ids.sjj })).json() as TransferDetail
    expect((await act(adnan, `/api/transfers/${t1.id}/approve`, t1)).json().error.details.conflicts[0].kind).toBe('rental')
    const v = await vehicle('M87-J-529')
    const m = (await plan(adnan, v, local(60, '08:00'), local(61, '08:00'))).json() as MaintenanceDetail
    const t2 = (await transfer(adnan, v, local(60, '12:00'), local(60, '18:00'))).json() as TransferDetail
    expect((await act(adnan, `/api/transfers/${t2.id}/approve`, t2)).json().error.details.conflicts[0]).toMatchObject({ kind: 'maintenance', refNo: m.maintenanceNo })
  })

  it('a late transfer and an overdue maintenance hold their vehicle with no end (database definition)', async () => {
    const hold = (await one(`select upper(transfer_hold('in_transit', now() - interval '3 hours', now() - interval '1 hour', now() - interval '2 hours', null)) is null as open,
      upper(maintenance_hold('in_service', now() - interval '3 hours', now() - interval '1 hour', now() - interval '2 hours', null)) is null as m_open,
      upper(transfer_hold('in_transit', now(), now() + interval '1 hour', now(), null)) is not null as on_time`))
    expect(hold).toEqual({ open: true, m_open: true, on_time: true })
  })
})

describe('isolation and scope', () => {
  it('records of one company are invisible to another, also by id; cross-company links are refused by the database', async () => {
    const m = (await adnan.post('/api/maintenance/search', { view: 'all' })).json().items[0]
    const d = (await adnan.post('/api/damages/search', { view: 'all' })).json().items[0]
    const t = (await adnan.post('/api/transfers/search', { view: 'all' })).json().items[0]
    for (const url of [`/api/maintenance/${m.id}`, `/api/damages/${d.id}`, `/api/transfers/${t.id}`]) expect((await lejla.get(url)).statusCode).toBe(404)
    const counts = await asApp(null, async (c) => (await c.query(`select (select count(*) from maintenance_records) + (select count(*) from damage_files) + (select count(*) from vehicle_transfers) as n`)).rows[0].n)
    expect(Number(counts)).toBe(0)
    const neretvaBranch = (await one(`select id from branches where code = 'MOC'`, [], data.companies.neretva)).id
    await expect(asOwner(data.companies.drina, `update vehicle_transfers set to_branch_id = $1 where id = $2`, [neretvaBranch, t.id])).rejects.toThrow()
  })

  it('branch scope: an SAC-only user does not see SJJ maintenance or damage of SJJ vehicles and cannot plan at SJJ', async () => {
    const list = (await sacOnly.post('/api/maintenance/search', { view: 'all' })).json()
    expect(list.items.every((i: { branch: { code: string } }) => i.branch.code === 'SAC')).toBe(true)
    const v = await vehicle('M87-J-529')
    expect((await plan(sacOnly, v, local(70, '08:00'), local(70, '12:00'))).statusCode).toBe(404)
    const sacVehicle = await vehicle('T09-A-781')
    expect((await plan(sacOnly, sacVehicle, local(70, '08:00'), local(70, '12:00'))).statusCode).toBe(403) // SJJ as responsible branch
    expect((await plan(sacOnly, sacVehicle, local(70, '08:00'), local(70, '12:00'), { branchId: ids.sac })).statusCode).toBe(201)
  })

  it('a resent request returns the first result; a stale screen gets a version conflict', async () => {
    const v = await vehicle('T09-A-781')
    const body = { requestId: uuid(), vehicleId: v, branchId: ids.sac, type: 'inspection', reason: 'Muayene', plannedStartLocal: local(80, '08:00'), plannedEndLocal: local(80, '10:00') }
    const [a, b] = [await adnan.post('/api/maintenance', body), await adnan.post('/api/maintenance', body)]
    expect([a.statusCode, b.statusCode]).toEqual([201, 200])
    expect(a.json().id).toBe(b.json().id)
    const m = a.json() as MaintenanceDetail
    expect((await adnan.put(`/api/maintenance/${m.id}`, { version: m.version + 1, requestId: uuid(), notes: 'eski ekran' })).json().error.code).toBe('VERSION_CONFLICT')
  })
})

describe('concurrency: the shared vehicle lock serializes every module', () => {
  it('reservation confirmation ↔ maintenance plan for the same window: exactly one holds the vehicle', async () => {
    const v = await vehicle('J58-O-142')
    const p = (await reservation(v, local(90, '10:00'), local(91, '10:00'), { confirm: false, pickupBranchId: ids.mst, returnBranchId: ids.mst })).json() as ReservationDetail
    const [r, m] = await Promise.all([adnan.post(`/api/reservations/${p.id}/confirm`, { version: p.version }), plan(kontrol, v, local(90, '12:00'), local(90, '16:00'), { branchId: ids.mst })])
    // Either the confirmation (200) or the plan (201) wins; the other is refused.
    expect([r.statusCode, m.statusCode].filter((c) => c === 409)).toHaveLength(1)
    expect([r.statusCode, m.statusCode].some((c) => c === 200 || c === 201)).toBe(true)
  })

  it('transfer approval ↔ reservation confirmation: exactly one', async () => {
    const v = await vehicle('A05-J-418')
    const p = (await reservation(v, local(92, '10:00'), local(93, '10:00'), { confirm: false, pickupBranchId: ids.mst, returnBranchId: ids.mst })).json() as ReservationDetail
    const t = (await transfer(adnan, v, local(92, '08:00'), local(92, '12:00'), { fromBranchId: ids.mst, toBranchId: ids.sjj })).json() as TransferDetail
    const results = await Promise.all([adnan.post(`/api/reservations/${p.id}/confirm`, { version: p.version }), act(kontrol, `/api/transfers/${t.id}/approve`, t)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
  })

  it('handover ↔ damage block: the block is always recorded; a handover after it is refused, never both unaware of each other', async () => {
    const v = await vehicle('O58-E-467')
    const k = await readyRental(v, nowLocal(5), local(2, '10:00'))
    const [del, blk] = await Promise.all([deliver(adnan, k), damage(kontrol, v, { usability: 'not_usable', blockReason: 'Lastik patladı', damageType: 'tire' })])
    expect(blk.statusCode).toBe(201)
    const startedAt = Date.parse((blk.json() as DamageDetail).blocks[0]!.startedAt)
    if (del.statusCode === 200) expect(Date.parse((del.json() as RentalDetail).delivered!.at)).toBeLessThanOrEqual(startedAt)
    else expect(del.json().error.code).toBe('DELIVERY_BLOCKED')
  })

  it('transfer departure ↔ rental handover of the same vehicle: exactly one', async () => {
    const v = await vehicle('M33-T-120') // MST
    const k = await (async () => {
      const r = await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: cls[v], vehicleId: v, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: nowLocal(10), returnLocal: local(2, '10:00'), requestId: uuid() })
      expect(r.statusCode, r.body).toBe(201)
      let d = r.json() as RentalDetail
      const doc = await adnan.put(`/api/rentals/${d.id}/document-check`, { version: d.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })
      if (doc.statusCode === 200) d = doc.json()
      await adnan.put(`/api/rentals/${d.id}/inspections/handover`, { inspectionVersion: 0, km: (await maxKm(v)) + 10, fuel: 'full', cleanliness: 'clean', condition: 'good', checklist: checklistAll, counterpartCustomerId: ids.ajla, marks: [] })
      let res
      for (const angle of ['front', 'rear', 'left', 'right']) res = await adnan.upload(`/api/rentals/${d.id}/inspections/handover/photos?angle=${angle}`, jpeg)
      return res!.json() as RentalDetail
    })()
    let t = (await transfer(adnan, v, local(4, '09:00'), local(4, '15:00'), { fromBranchId: ids.mst, toBranchId: ids.sjj })).json() as TransferDetail
    // Planned after the rental's return: approved. Leaving early (now) would overlap the rental.
    t = (await act(adnan, `/api/transfers/${t.id}/approve`, t)).json()
    expect(t.status).toBe('approved')
    const km = (await maxKm(v)) + 20
    const [del, dep] = await Promise.all([deliver(adnan, k), act(kontrol, `/api/transfers/${t.id}/depart`, t, { km, fuel: 'full' })])
    expect([del.statusCode, dep.statusCode].sort()).toEqual([200, 409])
  })

  it('maintenance start ↔ handover: exactly one', async () => {
    const v = await vehicle('A84-O-352') // MST
    const r = await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: cls[v], vehicleId: v, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: nowLocal(10), returnLocal: local(1, '10:00'), requestId: uuid() })
    let d = r.json() as RentalDetail
    const doc = await adnan.put(`/api/rentals/${d.id}/document-check`, { version: d.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })
    if (doc.statusCode === 200) d = doc.json()
    await adnan.put(`/api/rentals/${d.id}/inspections/handover`, { inspectionVersion: 0, km: (await maxKm(v)) + 10, fuel: 'full', cleanliness: 'clean', condition: 'good', checklist: checklistAll, counterpartCustomerId: ids.ajla, marks: [] })
    for (const angle of ['front', 'rear', 'left', 'right']) d = (await adnan.upload(`/api/rentals/${d.id}/inspections/handover/photos?angle=${angle}`, jpeg)).json()
    const m = (await plan(adnan, v, local(5, '08:00'), local(6, '08:00'), { branchId: ids.mst })).json() as MaintenanceDetail
    const [del, start] = await Promise.all([deliver(adnan, d), act(kontrol, `/api/maintenance/${m.id}/start`, m, { expectedEndLocal: local(6, '08:00') })])
    expect([del.statusCode, start.statusCode].sort()).toEqual([200, 409])
  })

  it('two receipts of the same transfer: one completes it, the other is refused; one arrival in the history', async () => {
    const car = await vehicle('O03-J-874') // MST, no records yet
    let t = (await transfer(adnan, car, nowLocal(-5), nowLocal(300), { fromBranchId: ids.mst, toBranchId: ids.sac })).json() as TransferDetail
    t = (await act(adnan, `/api/transfers/${t.id}/approve`, t)).json()
    const km = (await maxKm(car)) || 0
    t = (await act(adnan, `/api/transfers/${t.id}/depart`, t, { km: km + 1, fuel: 'full' })).json()
    expect(t.status, JSON.stringify(t)).toBe('in_transit')
    const second = await login('sac@drina-demo.ba')
    const res = await Promise.all([act(sacOnly, `/api/transfers/${t.id}/receive`, t, { km: km + 50, fuel: 'half' }), act(second, `/api/transfers/${t.id}/receive`, t, { km: km + 51, fuel: 'half' })])
    expect(res.map((r) => r.statusCode).sort()).toEqual([200, 409])
    expect(await one(`select count(*)::int n from vehicle_location_events where source_id = $1 and event_type = 'transfer_arrival'`, [t.id])).toEqual({ n: 1 })
  })
})
