import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { CHECKLIST_ITEMS, type RentalDetail, type RentalListResponse, todayIn, wallTimeInstant } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'
import { addDays, nextClockChange } from './test-dates'

// Rentals, handover and return V1 on the test database: synthetic customers, fleet, reservations and rentals
// (seed/test-rentals.ts): K-000001 active (T75-E-410, SAC), K-000002 overdue (O21-M-985, SAC), K-000003 prepared
// (K14-E-763, SJJ), K-000004 closed (T48-K-276, MST), K-000005 returned, not closed (E92-K-301, SAC).

const TZ = 'Europe/Sarajevo'
let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip, all branches
let selma: Client // Drina Operasyon, SJJ only
let lejla: Client // Neretva Sahip
let logs = ''
const ids: Record<string, string> = {}
let jpeg: Buffer

const uuid = () => randomUUID()
/** Wall time n company days from today ("2026-10-15T10:00"). */
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn(TZ)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
/** Wall time in Sarajevo n hours from now, rounded to the minute. */
const hoursFromNow = (h: number) => {
  const d = new Date(Date.now() + h * 3_600_000)
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d).replace(' ', 'T')
}
const search = async (c: Client, body: Record<string, unknown> = {}) => (await c.post('/api/rentals/search', body)).json() as RentalListResponse
const get = async (c: Client, id: string) => (await c.get(`/api/rentals/${id}`)).json() as RentalDetail
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
const rentalId = async (no: string, companyId = data.companies.drina) => (await one(`select id from rentals where rental_no = $1`, [no], companyId)).id as string
const checklistAll = Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, 'ok']))
async function login(email: string) {
  const c = new Client(app)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}
let roleNo = 0
async function userWithRole(permissions: string[], branches?: string[]) {
  roleNo++
  const email = `kiralama${roleNo}@drina-demo.ba`
  const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, $2, $3) returning id`, [data.companies.drina, `Kir ${roleNo}`, permissions])).rows[0].id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select $1, 'Kir Kullanıcı', password_hash from users where email = $2 returning id`, [email, EMAILS.adnan])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, $3) returning id`, [data.companies.drina, user, branches ? 'no' : 'yes'])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  for (const code of branches ?? []) {
    await asOwner(data.companies.drina, `insert into membership_branches (company_id, membership_id, branch_id) select $1, $2, id from branches where code = $3`, [data.companies.drina, m, code])
  }
  return login(email)
}

const direct = (over: Record<string, unknown> = {}) => ({
  customerId: ids.ajla,
  drivers: [{ customerId: ids.ajla, isPrimary: true }],
  vehicleClassId: ids.orta,
  vehicleId: ids.passat,
  pickupBranchId: ids.sjj,
  returnBranchId: ids.sjj,
  pickupLocal: local(1, '10:00'),
  returnLocal: local(3, '10:00'),
  requestId: uuid(),
  ...over,
})
async function create(c: Client, over: Record<string, unknown> = {}) {
  const res = await c.post('/api/rentals', direct(over))
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as RentalDetail
}
/** Document decision, a complete handover record and 4 photos: everything the handover needs except the action. */
async function readyForHandover(c: Client, r: RentalDetail, km: number, residencyClass: 'local' | 'foreign' = 'local') {
  let res = await c.put(`/api/rentals/${r.id}/document-check`, { version: r.version, drivers: r.drivers.map((x) => ({ customerId: x.id, residencyClass, decision: 'eligible' })) })
  expect(res.statusCode, res.body).toBe(200)
  let d = res.json() as RentalDetail
  res = await c.put(`/api/rentals/${r.id}/inspections/handover`, {
    inspectionVersion: d.handover?.version ?? 0,
    km,
    fuel: 'full',
    cleanliness: 'clean',
    condition: 'good',
    checklist: checklistAll,
    counterpartCustomerId: d.drivers[0]!.id,
    marks: [{ view: 'left', x: 400, y: 500, category: 'scratch', note: 'Sol arka kapıda çizik' }],
  })
  expect(res.statusCode, res.body).toBe(200)
  for (const angle of ['front', 'rear', 'left', 'right']) {
    res = await c.upload(`/api/rentals/${r.id}/inspections/handover/photos?angle=${angle}`, jpeg)
    expect(res.statusCode, res.body).toBe(201)
  }
  d = res.json()
  return d
}
const deliver = (c: Client, d: RentalDetail, extra: Record<string, unknown> = {}) =>
  c.post(`/api/rentals/${d.id}/deliver`, { version: d.version, inspectionVersion: d.handover!.version, requestId: uuid(), externalContractAck: true, externalPricingAck: true, externalReference: 'DIS-2026/0042', ...extra })
async function delivered(c: Client, over: Record<string, unknown>, km: number) {
  const d = await readyForHandover(c, await create(c, { pickupLocal: hoursFromNow(1), returnLocal: local(2, '10:00'), ...over }), km)
  const res = await deliver(c, d)
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as RentalDetail
}
const returnIt = (c: Client, d: RentalDetail, extra: Record<string, unknown> = {}) =>
  c.post(`/api/rentals/${d.id}/return`, { version: d.version, requestId: uuid(), returnBranchId: ids.sjj, km: (d.handover?.km ?? 0) + 250, fuel: 'half', ...extra })

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (chunk, _e, done) => ((logs += chunk.toString()), done()) }) })
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  for (const [k, code] of [['sjj', 'SJJ'], ['sac', 'SAC'], ['mst', 'MST']]) ids[k] = (await one(`select id from branches where code = $1`, [code])).id
  ids.moc = (await one(`select id from branches where code = 'MOC'`, [], data.companies.neretva)).id
  for (const [k, n] of [['orta', 'Orta'], ['kompakt', 'Kompakt'], ['ekonomi', 'Ekonomi'], ['suv', 'SUV'], ['minivan', 'Minivan']]) ids[k] = (await one(`select id from vehicle_classes where name = $1`, [n])).id
  for (const [k, p] of [
    ['passat', 'E16-T-093'],
    ['corolla', 'O58-E-467'],
    ['bmw', 'M87-J-529'],
    ['octavia', 'A12-K-345'],
    ['vito', 'A39-T-657'],
    ['duster', 'M33-T-120'],
    ['tucson', 'T09-A-781'],
    ['p3008', 'E63-A-847'],
    ['yaris', 'J58-O-142'],
    ['i20', 'A05-J-418'],
    ['peugeot208', 'A84-O-352'],
    ['tipo', 'J27-K-615'],
    ['t75', 'T75-E-410'],
    ['o21', 'O21-M-985'],
    ['t48', 'T48-K-276'],
    ['e92', 'E92-K-301'],
    ['k14', 'K14-E-763'],
    ['kodiaq', 'K40-M-526'],
    ['sandero', 'O03-J-874'],
  ])
    ids[k] = (await one(`select id from vehicles where plate = $1`, [p])).id
  for (const [k, n] of [['ajla', 'Ajla Testović'], ['emir', 'Emir Primjerović'], ['lena', 'Lena Beispiel'], ['mirza', 'Mirza Uzorak'], ['tarik', 'Tarik Testić'], ['kenan', 'Kenan Örnek']]) {
    ids[k] = (await one(`select id from customers where display_name = $1`, [n])).id
  }
  ids.dino = (await one(`select id from customers where display_name = 'Dino Neretvić'`, [], data.companies.neretva)).id
  ids.neretvaSuv = (await one(`select id from vehicles where plate = 'M21-O-650'`, [], data.companies.neretva)).id
  // A camera-like JPEG with metadata (a GPS-ish comment) that must not survive the upload.
  jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 60, g: 90, b: 160 } } })
    .withExif({ IFD0: { Copyright: 'TEST GPS 43.85N 18.41E', ImageDescription: 'camera serial 123' } })
    .jpeg({ quality: 80 })
    .toBuffer()
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('list, search and isolation', () => {
  it('lists active rentals with tab counts; overdue and returned views; search by number, plate and name in the body', async () => {
    const list = await search(adnan)
    expect(list.items.map((r) => r.rentalNo).sort()).toEqual(['K-000001', 'K-000002', 'K-000003'])
    expect(list.counts).toMatchObject({ active: 3, prepared: 1, delivered: 2, overdue: 1, returned: 1 })
    const overdue = await search(adnan, { view: 'overdue' })
    expect(overdue.items.map((r) => r.rentalNo)).toEqual(['K-000002'])
    expect(overdue.items[0]!.overdueMinutes).toBeGreaterThan(200)
    expect((await search(adnan, { view: 'returned' })).items.map((r) => r.rentalNo)).toEqual(['K-000005'])
    expect((await search(adnan, { view: 'all', q: 'T48-K' })).items.map((r) => r.rentalNo)).toEqual(['K-000004'])
    expect((await search(adnan, { view: 'all', q: 'Testić' })).items.map((r) => r.rentalNo)).toEqual(['K-000002'])
    expect((await search(adnan, { view: 'all', q: 'k-000005' })).items.map((r) => r.rentalNo)).toEqual(['K-000005'])
    expect((await search(adnan, { view: 'all', vehicleId: ids.e92 })).total).toBe(1)
    expect((await search(adnan, { view: 'all', customerId: ids.emir })).items.map((r) => r.rentalNo)).toEqual(['K-000001'])
    // Searched text never reaches the server log.
    expect(logs).not.toContain('Testić')
  })

  it('company isolation: another company sees only its own rentals; ids of the other company are unknown', async () => {
    const theirs = await search(lejla, { view: 'all' })
    expect(theirs.items.map((r) => r.rentalNo)).toEqual(['K-000001'])
    expect(theirs.items[0]!.vehicle.plate).toBe('J66-E-193')
    const drina = await rentalId('K-000001')
    expect((await lejla.get(`/api/rentals/${drina}`)).statusCode).toBe(404)
    expect((await lejla.get(`/api/rentals/${drina}/photos/${randomUUID()}`)).statusCode).toBe(404)
    expect((await lejla.post(`/api/rentals/${drina}/cancel`, { version: 1, requestId: uuid(), reason: 'other' })).statusCode).toBe(404)
  })

  it('branch scope: a user limited to SJJ sees SJJ rentals only; others look unknown', async () => {
    const hers = await search(selma, { view: 'all' })
    expect(hers.items.every((r) => [r.pickupBranch.code, r.returnBranch.code, r.actualReturnBranch?.code].includes('SJJ'))).toBe(true)
    expect(hers.items.map((r) => r.rentalNo)).toContain('K-000003')
    expect((await selma.get(`/api/rentals/${await rentalId('K-000001')}`)).statusCode).toBe(404)
  })

  it('database: forced RLS, no context sees nothing, no deletes, events and document decisions are append-only', async () => {
    expect(await asApp(null, async (c) => (await c.query('select count(*)::int n from rentals')).rows[0].n)).toBe(0)
    expect(await asApp(data.companies.neretva, async (c) => (await c.query('select count(*)::int n from rentals')).rows[0].n)).toBe(1)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from rentals'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query('delete from rental_inspection_photos'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update rental_events set kind = 'closed'`))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update rental_document_checks set decision = 'eligible'`))).rejects.toThrow(/permission denied/)
  })
})

describe('create, convert and the shared vehicle allocation', () => {
  it('direct rental: prepared with one primary driver; a resent request returns the same rental; history has numbers, no names', async () => {
    const body = direct({ vehicleId: ids.corolla, note: 'Gizli not: müşteri geç gelecek' })
    const first = await adnan.post('/api/rentals', body)
    expect(first.statusCode, first.body).toBe(201)
    const r = first.json() as RentalDetail
    expect(r).toMatchObject({ status: 'prepared', origin: 'direct', reservation: null, vehicle: { plate: 'O58-E-467' } })
    expect(r.rentalNo).toMatch(/^K-\d{6}$/)
    expect(r.drivers).toEqual([expect.objectContaining({ id: ids.ajla, isPrimary: true })])
    const again = await adnan.post('/api/rentals', body)
    expect(again.statusCode).toBe(200)
    expect(again.json().id).toBe(r.id)
    expect((await one(`select count(*)::int n from rentals where vehicle_id = $1`, [ids.corolla])).n).toBe(1)
    const a = await one(`select summary::text s from audit_log where entity = 'rental' and entity_id = $1 and action = 'rental.create'`, [r.id])
    expect(a.s).toContain(r.rentalNo)
    expect(a.s).not.toMatch(/Ajla|Testović|Gizli|ajla\.testovic|\+387/)
    // Exactly one primary driver.
    const none = await adnan.post('/api/rentals', direct({ vehicleId: ids.bmw, drivers: [{ customerId: ids.ajla }] }))
    expect(none.statusCode).toBe(400)
  })

  it('a rental and a confirmed reservation can never hold the same vehicle at the same time, in either order', async () => {
    // R-000001 holds A12-K-345 for days 2..5.
    const clash = await adnan.post('/api/rentals', direct({ vehicleId: ids.octavia, pickupLocal: local(4, '10:00'), returnLocal: local(6, '10:00') }))
    expect(clash.statusCode).toBe(409)
    expect(clash.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [expect.objectContaining({ kind: 'reservation', refNo: 'R-000001' })] } })
    // Touching periods are fine: [5d 10:00 ...)
    const after = await create(adnan, { vehicleId: ids.octavia, pickupLocal: local(5, '10:00'), returnLocal: local(7, '10:00') })
    // The other way round: a reservation cannot be confirmed over the prepared rental.
    const res = await adnan.post('/api/reservations', {
      customerId: ids.mirza,
      vehicleClassId: ids.orta,
      vehicleId: ids.octavia,
      pickupBranchId: ids.sjj,
      returnBranchId: ids.sjj,
      pickupLocal: local(6, '09:00'),
      returnLocal: local(8, '09:00'),
      source: 'phone',
      confirm: true,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('VEHICLE_UNAVAILABLE')
    expect(res.json().error.details.conflicts).toEqual([expect.objectContaining({ kind: 'rental', refNo: after.rentalNo })])
    // The reservation screen's availability tells the same story (one shared definition).
    const avail = (
      await adnan.post('/api/reservations/availability', { vehicleClassId: ids.orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(6, '09:00'), returnLocal: local(8, '09:00') })
    ).json()
    expect(avail.vehicles.find((v: { plate: string }) => v.plate === 'A12-K-345')).toMatchObject({ available: false, conflicts: [expect.objectContaining({ kind: 'rental' })] })
    expect(avail.notChecked).not.toContain('rentals')
    // Directly in the database too, as the application role.
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(
          `insert into reservations (company_id, reservation_no, status, source, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id, pickup_at, return_at, pickup_timezone, return_timezone, confirmed_at)
           values ($1, 'R-999001', 'confirmed', 'phone', $2, $3, $4, $5, $5, $6::timestamptz, $7::timestamptz, 'Europe/Sarajevo', 'Europe/Sarajevo', now())`,
          [data.companies.drina, ids.mirza, ids.orta, ids.octavia, ids.sjj, wallTimeInstant(local(6, '09:00'), TZ), wallTimeInstant(local(8, '09:00'), TZ)],
        ),
      ),
    ).rejects.toMatchObject({ constraint: 'reservations_vehicle_rented' })
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(
          `insert into rentals (company_id, rental_no, origin, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id, planned_pickup_at, planned_return_at, pickup_timezone, return_timezone)
           select $1, 'K-999001', 'direct', $2, $3, $4, $5, $5, pickup_at + interval '1 hour', return_at, 'Europe/Sarajevo', 'Europe/Sarajevo' from reservations where reservation_no = 'R-000001'`,
          [data.companies.drina, ids.mirza, ids.orta, ids.octavia, ids.sjj],
        ),
      ),
    ).rejects.toMatchObject({ constraint: 'rentals_vehicle_reserved' })
  })

  it('three people creating rentals for the same vehicle and time at once: exactly one succeeds', async () => {
    const results = await Promise.all([0, 1, 2].map(() => adnan.post('/api/rentals', direct({ vehicleId: ids.vito, vehicleClassId: ids.minivan, pickupLocal: local(10, '10:00'), returnLocal: local(12, '10:00') }))))
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409])
  })

  it('ids of another company, unknown or archived parties are refused and nothing is created', async () => {
    const before = (await one(`select count(*)::int n from rentals`)).n
    expect((await adnan.post('/api/rentals', direct({ customerId: ids.dino, drivers: [{ customerId: ids.dino, isPrimary: true }] }))).statusCode).toBe(404)
    expect((await adnan.post('/api/rentals', direct({ drivers: [{ customerId: ids.dino, isPrimary: true }] }))).statusCode).toBe(404)
    expect((await adnan.post('/api/rentals', direct({ vehicleId: ids.neretvaSuv }))).statusCode).toBe(400)
    expect((await adnan.post('/api/rentals', direct({ vehicleId: ids.tipo, vehicleClassId: ids.kompakt }))).statusCode).toBe(409) // out of service
    expect((await one(`select count(*)::int n from rentals`)).n).toBe(before)
  })

  it('a confirmed reservation becomes a prepared rental atomically; data, drivers and history are kept; it converts once', async () => {
    const resId = (await one(`select id from reservations where reservation_no = 'R-000003'`)).id as string
    const before = (await adnan.get(`/api/reservations/${resId}`)).json()
    const requestId = uuid()
    const res = await adnan.post(`/api/rentals/from-reservation/${resId}`, { version: before.version, requestId })
    expect(res.statusCode, res.body).toBe(201)
    const r = res.json() as RentalDetail
    expect(r).toMatchObject({ origin: 'reservation', reservation: { reservationNo: 'R-000003' }, vehicle: { plate: 'E45-M-218' }, plannedPickup: { at: before.pickup.at }, plannedReturn: { at: before.return.at } })
    expect(r.corporateAccount?.legalName).toBe('Örnek Lojistik d.o.o.')
    expect(r.drivers.map((d) => d.id).sort()).toEqual(before.drivers.map((d: { id: string }) => d.id).sort())
    const after = (await adnan.get(`/api/reservations/${resId}`)).json()
    expect(after).toMatchObject({ status: 'converted', pickup: before.pickup, return: before.return, vehicle: { plate: 'E45-M-218' } })
    expect(after.statusEvents.at(-1)).toMatchObject({ fromStatus: 'confirmed', toStatus: 'converted' })
    // Resent: the same rental. A second conversion: refused. The reservation can no longer change.
    expect((await adnan.post(`/api/rentals/from-reservation/${resId}`, { version: before.version, requestId })).json().id).toBe(r.id)
    const second = await adnan.post(`/api/rentals/from-reservation/${resId}`, { version: after.version, requestId: uuid() })
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('ALREADY_CONVERTED')
    expect((await adnan.post(`/api/reservations/${resId}/cancel`, { version: after.version, reason: 'other' })).statusCode).toBe(409)
    // Pending (class-only) reservations are confirmed first.
    const pending = (await one(`select id, version from reservations where reservation_no = 'R-000002'`))
    const p = await adnan.post(`/api/rentals/from-reservation/${pending.id}`, { version: pending.version, requestId: uuid() })
    expect(p.statusCode).toBe(409)
    expect(p.json().error.code).toBe('RESERVATION_NOT_CONFIRMED')
  })

  it('two people converting the same reservation at once: one rental, never two', async () => {
    const r = await one(`select id, version from reservations where reservation_no = 'R-000001'`)
    const results = await Promise.all([0, 1, 2].map(() => adnan.post(`/api/rentals/from-reservation/${r.id}`, { version: r.version, requestId: uuid() })))
    expect(results.map((x) => x.statusCode).sort()).toEqual([201, 409, 409])
    expect((await one(`select count(*)::int n from rentals where reservation_id = $1`, [r.id])).n).toBe(1)
  })
})

describe('documents (K3, K4)', () => {
  it('the decision follows the active rule of the pickup branch country; missing documents block "eligible"; no rule is not "no documents needed"', async () => {
    // Mirza (local, no documents on file) under the BA local rule.
    const r = await create(adnan, { customerId: ids.mirza, drivers: [{ customerId: ids.mirza, isPrimary: true }], vehicleId: ids.bmw })
    expect(r.documentContext).toMatchObject({ referenceCountry: 'BA', policies: { local: { version: 1 }, foreign: null } })
    const refused = await adnan.put(`/api/rentals/${r.id}/document-check`, { version: r.version, drivers: [{ customerId: ids.mirza, residencyClass: 'local', decision: 'eligible' }] })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error.fields).toHaveProperty('drivers.0.decision')
    // As foreign there is no active rule: staff may decide, recorded as a staff check under an undefined rule.
    const ok = await adnan.put(`/api/rentals/${r.id}/document-check`, { version: r.version, drivers: [{ customerId: ids.mirza, residencyClass: 'foreign', decision: 'eligible', note: 'Pasaport gördüm' }] })
    expect(ok.statusCode, ok.body).toBe(200)
    const d = ok.json() as RentalDetail
    expect(d.documentChecks).toEqual([expect.objectContaining({ ruleStatus: 'no_policy', policyVersion: null, decision: 'eligible', referenceCountry: 'BA', residencyClass: 'foreign' })])
    expect(d.deliveryGates.find((g) => g.code === 'documents')).toMatchObject({ state: 'attention', detail: { staffOnly: 1 } })
    // A plan change makes the decision stale.
    const moved = await adnan.put(`/api/rentals/${r.id}`, { ...direct({ customerId: ids.mirza, drivers: [{ customerId: ids.mirza, isPrimary: true }], vehicleId: ids.bmw }), returnLocal: local(4, '10:00'), version: d.version })
    expect(moved.statusCode, moved.body).toBe(200)
    expect((moved.json() as RentalDetail).deliveryGates.find((g) => g.code === 'documents')).toMatchObject({ state: 'blocked', detail: { missing: 1 } })
    // A document expiring inside the period does not count (Ajla's licence ends in 12 days).
    const long = await create(adnan, { vehicleId: ids.p3008, vehicleClassId: ids.suv, pickupLocal: local(10, '10:00'), returnLocal: local(16, '10:00') })
    expect(long.documentContext!.drivers[0]).toMatchObject({ suggestedResidency: 'local', expiringInPeriod: ['driving_license'] })
    const exp = await adnan.put(`/api/rentals/${long.id}/document-check`, { version: long.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })
    expect(exp.statusCode).toBe(400)
  })

  it('a branch without a country blocks the decision and the handover (no guessed country)', async () => {
    await asOwner(data.companies.drina, `update branches set country = null where code = 'MST'`)
    try {
      const r = await create(adnan, { vehicleId: ids.duster, vehicleClassId: ids.suv, pickupBranchId: ids.mst, returnBranchId: ids.mst })
      expect(r.deliveryGates.find((g) => g.code === 'branch_country')?.state).toBe('blocked')
      const res = await adnan.put(`/api/rentals/${r.id}/document-check`, { version: r.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('BRANCH_COUNTRY_MISSING')
    } finally {
      await asOwner(data.companies.drina, `update branches set country = 'BA' where code = 'MST'`)
    }
  })

  it('document metadata only with the document permission; never numbers; the decision needs that permission', async () => {
    const reader = await userWithRole(['rentals.read', 'rentals.manage', 'customers.read'])
    const k3 = await rentalId('K-000003')
    const d = await get(reader, k3)
    expect(d.documentContext).toBeNull()
    expect(d.customer.documents).toBeNull()
    expect((await reader.put(`/api/rentals/${k3}/document-check`, { version: d.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })).statusCode).toBe(403)
    const full = await adnan.get(`/api/rentals/${k3}`)
    expect(full.body).not.toMatch(/TEST-BA-1001|TEST-DL-2001|numberHint|ciphertext/)
  })
})

describe('handover', () => {
  it('the handover desk lists what blocks; nothing is ticked by default; the server refuses an incomplete handover', async () => {
    const r = await create(adnan, { vehicleId: ids.i20, vehicleClassId: ids.ekonomi, pickupBranchId: ids.mst, returnBranchId: ids.mst })
    const blocked = Object.fromEntries(r.deliveryGates.map((g) => [g.code, g.state]))
    expect(blocked).toMatchObject({ drivers: 'ok', documents: 'blocked', handover_record: 'blocked', photos: 'blocked', availability: 'ok', pricing: 'attention', contract: 'attention', external_terms: 'attention' })
    const draft = await adnan.put(`/api/rentals/${r.id}/inspections/handover`, { inspectionVersion: 0, km: 10_000, fuel: 'full', checklist: { keys: 'ok' }, marks: [] })
    expect(draft.statusCode).toBe(200)
    const d = draft.json() as RentalDetail
    expect(d.handover).toMatchObject({ state: 'draft', checklist: { keys: 'ok' }, cleanliness: null })
    const res = await deliver(adnan, d)
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DELIVERY_BLOCKED')
    expect(res.json().error.details.gates.filter((g: { state: string }) => g.state === 'blocked').map((g: { code: string }) => g.code).sort()).toEqual(['documents', 'handover_record', 'photos'])
    // A second draft from an old screen is refused.
    expect((await adnan.put(`/api/rentals/${r.id}/inspections/handover`, { inspectionVersion: 0, checklist: {}, marks: [] })).statusCode).toBe(409)
  })

  it('photos: content-checked, re-encoded without metadata, at most 5, private and never cached; wrong files refused', async () => {
    const r = await create(adnan, { vehicleId: ids.i20, vehicleClassId: ids.ekonomi, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: local(5, '10:00'), returnLocal: local(7, '10:00') })
    expect((await adnan.upload(`/api/rentals/${r.id}/inspections/handover/photos?angle=front`, Buffer.from('%PDF-1.4 not an image'), 'x.jpg')).statusCode).toBe(415)
    expect((await adnan.upload(`/api/rentals/${r.id}/inspections/handover/photos?angle=sideways`, jpeg)).statusCode).toBe(400)
    let d!: RentalDetail
    for (const angle of ['front', 'rear', 'left', 'right', 'interior']) d = (await adnan.upload(`/api/rentals/${r.id}/inspections/handover/photos?angle=${angle}`, jpeg)).json()
    expect(d.handover!.photos).toHaveLength(5)
    const sixth = await adnan.upload(`/api/rentals/${r.id}/inspections/handover/photos?angle=other`, jpeg)
    expect(sixth.statusCode).toBe(409)
    const photo = d.handover!.photos[0]!
    // Evidence photos need a photo access grant first (one per record and session; the GET records nothing).
    expect((await adnan.get(photo.url)).json().error.code).toBe('PHOTO_ACCESS_REQUIRED')
    expect((await adnan.post('/api/photo-access', { kind: 'rental', id: r.id })).statusCode).toBe(200)
    const img = await adnan.get(photo.url)
    expect(img.statusCode).toBe(200)
    expect(img.headers['content-type']).toBe('image/webp')
    expect(img.headers['cache-control']).toContain('no-store')
    const meta = await sharp(img.rawPayload).metadata()
    expect(meta.exif).toBeUndefined()
    expect(img.rawPayload.toString('latin1')).not.toContain('TEST GPS')
    const key = (await one(`select f.storage_key from files f join rental_inspection_photos p on p.file_id = f.id where p.id = $1`, [photo.id])).storage_key as string
    expect(key.startsWith(`rentals/${data.companies.drina}/`)).toBe(true)
    expect((await lejla.get(photo.url)).statusCode).toBe(404)
    // Removal on an open inspection is a mark; the record stays.
    const removed = await adnan.del(`/api/rentals/${r.id}/inspections/handover/photos/${photo.id}`)
    expect(removed.statusCode).toBe(200)
    expect((removed.json() as RentalDetail).handover!.photos).toHaveLength(4)
    expect((await one(`select removed_at from rental_inspection_photos where id = $1`, [photo.id])).removed_at).not.toBeNull()
  })

  it('handover: km, fuel, photos, odometer and location in one transaction; resent request is not a second handover; stale screens are refused', async () => {
    const r = await create(adnan, { vehicleId: ids.passat })
    const before = (await one(`select count(*)::int n from odometer_readings where vehicle_id = $1`, [ids.passat])).n
    const d = await readyForHandover(adnan, r, 55_800)
    const noAck = await deliver(adnan, d, { externalPricingAck: false, externalReference: '' })
    expect(noAck.statusCode).toBe(400)
    expect(Object.keys(noAck.json().error.fields).sort()).toEqual(['externalPricingAck', 'externalReference'])
    expect((await deliver(adnan, d, { externalReference: 'Ajla <script>' })).statusCode).toBe(400)
    const requestId = uuid()
    const [a, b] = await Promise.all([deliver(adnan, d, { requestId }), deliver(adnan, d, { requestId })])
    expect([a.statusCode, b.statusCode]).toEqual([200, 200])
    const done = a.json() as RentalDetail
    expect(done).toMatchObject({ status: 'delivered', handover: { state: 'final', km: 55_800, fuel: 'full' }, externalTerms: { reference: 'DIS-2026/0042', contractAckAt: expect.any(String), pricingAckAt: expect.any(String) }, deliveryGates: [] })
    expect(done.delivered).not.toBeNull()
    expect((await one(`select count(*)::int n from odometer_readings where vehicle_id = $1`, [ids.passat])).n).toBe(before + 1)
    const reading = await one(`select r.km, r.event_type, r.source_id from odometer_readings r where r.vehicle_id = $1 and r.event_type = 'rental_handover'`, [ids.passat])
    expect(reading).toMatchObject({ km: 55_800, event_type: 'rental_handover', source_id: done.handover!.id })
    const loc = await one(`select location_type, description from vehicle_location_events where vehicle_id = $1 order by occurred_at desc, created_at desc limit 1`, [ids.passat])
    expect(loc).toEqual({ location_type: 'with_customer', description: done.rentalNo })
    expect((await one(`select count(*)::int n from rental_events where rental_id = $1 and kind = 'delivered'`, [r.id])).n).toBe(1)
    // A different request from the old screen: version conflict.
    const stale = await deliver(adnan, d)
    expect(stale.statusCode).toBe(409)
    // After the handover: drivers, documents and the evidence are frozen.
    expect((await adnan.put(`/api/rentals/${r.id}`, { ...direct({ vehicleId: ids.passat }), version: done.version })).statusCode).toBe(409)
    expect((await adnan.upload(`/api/rentals/${r.id}/inspections/handover/photos?angle=other`, jpeg)).statusCode).toBe(409)
    await expect(asApp(data.companies.drina, (c) => c.query(`update rental_inspections set km = 1 where id = $1`, [done.handover!.id]))).rejects.toMatchObject({ constraint: 'rental_inspections_final' })
    await expect(asApp(data.companies.drina, (c) => c.query(`update rentals set vehicle_id = $2 where id = $1`, [r.id, ids.corolla]))).rejects.toMatchObject({ constraint: 'rentals_delivered_immutable' })
    // A rental-sourced reading cannot be corrected through the manual history (it belongs to the rental).
    const hist = (await adnan.get(`/api/vehicles/${ids.passat}/history`)).json()
    const handoverReading = hist.odometer.find((x: { sourceType: string }) => x.sourceType === 'rental_handover')
    expect(handoverReading).toBeDefined()
    const corr = await adnan.post(`/api/vehicles/${ids.passat}/odometer/${handoverReading.id}/correct`, { action: 'void', reason: 'Yanlış girildi', expectedVersion: hist.odometerVersion, clientRequestId: uuid() })
    expect(corr.statusCode).toBe(409)
    expect(corr.json().error.code).toBe('SOURCE_OWNED')
  })

  it('km may not go below the vehicle history; a large jump needs a reason', async () => {
    const r = await create(adnan, { vehicleId: ids.peugeot208, vehicleClassId: ids.ekonomi, pickupBranchId: ids.mst, returnBranchId: ids.mst })
    const low = await readyForHandover(adnan, r, 100)
    const res = await deliver(adnan, low)
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('ODOMETER_OUT_OF_ORDER')
    const fixed = (await adnan.put(`/api/rentals/${r.id}/inspections/handover`, { inspectionVersion: low.handover!.version, km: 120_000, fuel: 'half', cleanliness: 'clean', condition: 'good', checklist: checklistAll, counterpartCustomerId: ids.ajla, marks: [] })).json() as RentalDetail
    const jump = await deliver(adnan, fixed)
    expect(jump.statusCode).toBe(422)
    expect(jump.json().error.code).toBe('LARGE_JUMP_REASON_REQUIRED')
    expect((await deliver(adnan, fixed, { largeJumpReason: 'Gösterge değişti, servis kaydı var' })).statusCode).toBe(200)
  })

  it('two people handing over the same rental at once: one handover, one odometer reading', async () => {
    const r = await create(adnan, { vehicleId: ids.tucson, vehicleClassId: ids.suv, pickupBranchId: ids.sac, returnBranchId: ids.sac })
    const d = await readyForHandover(adnan, r, 41_300)
    const results = await Promise.all([deliver(adnan, d), deliver(adnan, d), deliver(adnan, d)])
    expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409, 409])
    expect((await one(`select count(*)::int n from odometer_readings where vehicle_id = $1 and event_type = 'rental_handover'`, [ids.tucson])).n).toBe(1)
  })

  it('early handover is checked for the extra time; a returned-but-unchecked vehicle cannot go out again', async () => {
    // Prepared rental from day 3; a confirmed reservation on the same vehicle holds days 1..2 → handing over now collides.
    const r = await create(adnan, { vehicleId: ids.yaris, vehicleClassId: ids.ekonomi, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: local(3, '10:00'), returnLocal: local(5, '10:00') })
    const res = await adnan.post('/api/reservations', {
      customerId: ids.mirza,
      vehicleClassId: ids.ekonomi,
      vehicleId: ids.yaris,
      pickupBranchId: ids.mst,
      returnBranchId: ids.mst,
      pickupLocal: local(1, '09:00'),
      returnLocal: local(2, '09:00'),
      source: 'phone',
      confirm: true,
    })
    expect(res.statusCode, res.body).toBe(201)
    const d = await readyForHandover(adnan, r, 9_900)
    expect(d.deliveryGates.find((g) => g.code === 'availability')).toMatchObject({ state: 'blocked', detail: { refs: res.json().reservationNo } })
    expect((await deliver(adnan, d)).statusCode).toBe(409)
    // K-000005 (E92-K-301) is returned but its return check is not finished.
    const next = await create(adnan, { vehicleId: ids.e92, vehicleClassId: ids.ekonomi, pickupBranchId: ids.sac, returnBranchId: ids.sac })
    expect(next.deliveryGates.find((g) => g.code === 'previous_return_open')).toMatchObject({ state: 'blocked', detail: { rentalNo: 'K-000005' } })
  })

  it('only a prepared rental is cancelled (with a reason); the vehicle is free again', async () => {
    const r = await create(adnan, { vehicleId: ids.duster, vehicleClassId: ids.suv, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: local(30, '10:00'), returnLocal: local(31, '10:00') })
    expect((await adnan.post(`/api/rentals/${r.id}/cancel`, { version: r.version, requestId: uuid() })).statusCode).toBe(400)
    const c = await adnan.post(`/api/rentals/${r.id}/cancel`, { version: r.version, requestId: uuid(), reason: 'customer_request' })
    expect(c.statusCode).toBe(200)
    expect(c.json()).toMatchObject({ status: 'cancelled', cancelReason: 'customer_request' })
    await create(adnan, { vehicleId: ids.duster, vehicleClassId: ids.suv, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: local(30, '10:00'), returnLocal: local(31, '10:00') })
    const active = await get(adnan, await rentalId('K-000001'))
    const refused = await adnan.post(`/api/rentals/${active.id}/cancel`, { version: active.version, requestId: uuid(), reason: 'other' })
    expect(refused.statusCode).toBe(409)
  })
})

describe('active rental, extension and overdue', () => {
  it('an extension is re-checked against reservations and rentals; a conflicting one is not applied; price stays not calculated', async () => {
    const k1 = await get(adnan, await rentalId('K-000001'))
    expect(k1).toMatchObject({ status: 'delivered', overdueMinutes: null, handover: { state: 'final', km: 12_500 } })
    // A confirmed reservation on T75-E-410 from day 5.
    const rsv = await adnan.post('/api/reservations', {
      customerId: ids.mirza,
      vehicleClassId: ids.suv,
      vehicleId: ids.t75,
      pickupBranchId: ids.sac,
      returnBranchId: ids.sac,
      pickupLocal: local(5, '10:00'),
      returnLocal: local(6, '10:00'),
      source: 'phone',
      confirm: true,
    })
    expect(rsv.statusCode, rsv.body).toBe(201)
    const into = await adnan.post(`/api/rentals/${k1.id}/extend`, { version: k1.version, requestId: uuid(), returnLocal: local(5, '12:00'), returnBranchId: ids.sac, channel: 'phone' })
    expect(into.statusCode).toBe(409)
    expect(into.json().error.details.conflicts).toEqual([expect.objectContaining({ kind: 'reservation', refNo: rsv.json().reservationNo })])
    expect((await get(adnan, k1.id)).plannedReturn.at).toBe(k1.plannedReturn.at)
    const ok = await adnan.post(`/api/rentals/${k1.id}/extend`, { version: k1.version, requestId: uuid(), returnLocal: local(4, '18:00'), returnBranchId: ids.sjj, channel: 'phone' })
    expect(ok.statusCode, ok.body).toBe(200)
    const e = ok.json() as RentalDetail
    expect(e.plannedReturn.local).toBe(local(4, '18:00'))
    expect(e.returnBranch.code).toBe('SJJ')
    expect(e.events.at(-1)).toMatchObject({ kind: 'extended', data: expect.objectContaining({ pricing: 'not_calculated', channel: 'phone' }) })
  })

  it('an overdue rental keeps its vehicle until it is really back: no new reservation or rental can take it', async () => {
    const k2 = await get(adnan, await rentalId('K-000002'))
    expect(k2.overdueMinutes).toBeGreaterThan(200)
    const r = await adnan.post('/api/reservations', {
      customerId: ids.mirza,
      vehicleClassId: ids.kompakt,
      vehicleId: ids.o21,
      pickupBranchId: ids.sac,
      returnBranchId: ids.sac,
      pickupLocal: local(20, '10:00'),
      returnLocal: local(21, '10:00'),
      source: 'phone',
      confirm: true,
    })
    expect(r.statusCode).toBe(409)
    expect(r.json().error.details.conflicts).toEqual([expect.objectContaining({ kind: 'rental', refNo: 'K-000002', endsAt: null })])
    const k = await adnan.post('/api/rentals', direct({ vehicleId: ids.o21, vehicleClassId: ids.kompakt, pickupBranchId: ids.sac, returnBranchId: ids.sac, pickupLocal: local(20, '10:00'), returnLocal: local(21, '10:00') }))
    expect(k.statusCode).toBe(409)
    // The reservation timeline shows the rental running on (open end).
    const tl = (await adnan.post('/api/reservations/timeline', { from: todayIn(TZ), days: 7 })).json()
    expect(tl.rentalBars.find((b: { rentalNo: string }) => b.rentalNo === 'K-000002')).toMatchObject({ status: 'delivered', endsAt: null })
  })
})

describe('return and close', () => {
  it('return: km not below handover, not in the future, real branch and time; the vehicle is at that branch but its home branch does not change', async () => {
    const d = await delivered(adnan, { vehicleId: ids.kodiaq, vehicleClassId: ids.suv }, 19_000)
    const below = await returnIt(adnan, d, { km: d.handover!.km! - 1 })
    expect(below.statusCode).toBe(422)
    expect(below.json().error.code).toBe('RETURN_KM_BELOW_HANDOVER')
    expect((await returnIt(adnan, d, { returnedLocal: hoursFromNow(5) })).statusCode).toBe(400)
    expect((await returnIt(adnan, d, { returnedLocal: hoursFromNow(-100) })).statusCode).toBe(400)
    const res = await returnIt(adnan, d, { returnBranchId: ids.mst, km: d.handover!.km! + 320, fuel: 'quarter' })
    expect(res.statusCode, res.body).toBe(200)
    const r = res.json() as RentalDetail
    expect(r).toMatchObject({ status: 'returned', actualReturnBranch: { code: 'MST' }, return: { km: d.handover!.km! + 320, fuel: 'quarter', state: 'draft' } })
    expect(r.closeGates.map((g) => [g.code, g.state])).toEqual([
      ['return_record', 'blocked'],
      ['photos', 'blocked'],
      ['findings', 'ok'],
    ])
    expect(r.vehicle.homeBranch.code).toBe('SJJ')
    const loc = await one(`select location_type, b.code from vehicle_location_events e join branches b on b.id = e.branch_id where e.vehicle_id = $1 order by e.occurred_at desc, e.created_at desc limit 1`, [r.vehicle.id])
    expect(loc).toEqual({ location_type: 'branch', code: 'MST' })
    expect(r.events.at(-1)).toMatchObject({ kind: 'returned', data: expect.objectContaining({ usedKm: 320 }) })
    // Resent with a new id from the old screen: refused; nothing doubled.
    expect((await returnIt(adnan, d)).statusCode).toBe(409)
    expect((await one(`select count(*)::int n from odometer_readings where vehicle_id = $1 and event_type = 'rental_return'`, [r.vehicle.id])).n).toBe(1)
  })

  it('close: 4–5 photos and a full check are required; new damage is a finding to acknowledge, not a charge', async () => {
    const d = await delivered(adnan, { vehicleId: ids.vito, vehicleClassId: ids.minivan }, 88_700)
    let r = (await returnIt(adnan, d)).json() as RentalDetail
    const notYet = await adnan.post(`/api/rentals/${r.id}/close`, { version: r.version, inspectionVersion: r.return!.version, requestId: uuid() })
    expect(notYet.statusCode).toBe(409)
    expect(notYet.json().error.code).toBe('CLOSE_BLOCKED')
    const handoverMark = d.handover!.marks[0]!
    r = (
      await adnan.put(`/api/rentals/${r.id}/inspections/return`, {
        inspectionVersion: r.return!.version,
        cleanliness: 'dirty',
        condition: 'minor_issues',
        checklist: { ...checklistAll, warning_triangle: 'issue' },
        notes: 'Arka tamponda yeni göçük',
        marks: [
          { view: handoverMark.view, x: handoverMark.x, y: handoverMark.y, category: 'scratch', existingMarkId: handoverMark.id },
          { view: 'rear', x: 650, y: 500, category: 'dent', note: 'Yeni göçük' },
        ],
      })
    ).json()
    for (const angle of ['front', 'rear', 'left', 'right']) r = (await adnan.upload(`/api/rentals/${r.id}/inspections/return/photos?angle=${angle}`, jpeg)).json()
    expect(r.closeGates.find((g) => g.code === 'findings')).toMatchObject({ state: 'attention', detail: { count: 1 } })
    const noAck = await adnan.post(`/api/rentals/${r.id}/close`, { version: r.version, inspectionVersion: r.return!.version, requestId: uuid() })
    expect(noAck.statusCode).toBe(400)
    const requestId = uuid()
    const closed = await adnan.post(`/api/rentals/${r.id}/close`, { version: r.version, inspectionVersion: r.return!.version, requestId, findingsAcknowledged: true })
    expect(closed.statusCode, closed.body).toBe(200)
    const c = closed.json() as RentalDetail
    expect(c).toMatchObject({ status: 'closed', return: { state: 'final', findingsAcknowledgedAt: expect.any(String) }, closeGates: [] })
    expect((await adnan.post(`/api/rentals/${r.id}/close`, { version: r.version, inspectionVersion: r.return!.version, requestId, findingsAcknowledged: true })).statusCode).toBe(200)
    // Before/after: handover marks stay, return marks are a separate set.
    expect(c.handover!.marks).toHaveLength(1)
    expect(c.return!.marks.filter((m) => !m.existingMarkId)).toHaveLength(1)
    // A later rental of the same vehicle sees these return marks as the existing damage reference.
    const next = await create(adnan, { vehicleId: ids.vito, vehicleClassId: ids.minivan, pickupLocal: local(60, '10:00'), returnLocal: local(61, '10:00') })
    expect(next.previousReturnMarks).toHaveLength(2)
    // Closing creates nothing financial (Finance V1 records are only made by explicit finance steps): no charge,
    // payment or deposit row, no invoice or damage case table, and the audit says nothing about money.
    expect((await one(`select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name ~ '(invoice|damage_case)'`, [])).n).toBe(0)
    expect((await one(`select (select count(*) from rental_finances where rental_id = $1) + (select count(*) from finance_charges) + (select count(*) from finance_payments) as n`, [c.id])).n).toBe('0')
    expect(JSON.stringify(c.events)).not.toMatch(/paid|ödendi|charge/i)
  })

  it('two people returning the same rental at once: one return, one reading', async () => {
    // Another staff member (uploads are rate limited per user: 40 photos a minute).
    const staff = await userWithRole(['rentals.read', 'rentals.manage', 'rentals.handover', 'customers.read', 'customers.documents.read'])
    const d = await delivered(staff, { vehicleId: ids.sandero, vehicleClassId: ids.ekonomi, pickupBranchId: ids.mst, returnBranchId: ids.mst }, 5_000)
    const results = await Promise.all([returnIt(staff, d), returnIt(adnan, d), returnIt(staff, d)])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409])
    expect((await one(`select count(*)::int n from odometer_readings where vehicle_id = $1 and event_type = 'rental_return'`, [ids.sandero])).n).toBe(1)
  })

  it('a branch-limited user returns only at their own branch', async () => {
    const staff = await userWithRole(['rentals.read', 'rentals.manage', 'rentals.handover', 'customers.read', 'customers.documents.read'])
    const d = await delivered(staff, { vehicleId: ids.p3008, vehicleClassId: ids.suv }, 70_400)
    const res = await returnIt(selma, d, { returnBranchId: ids.mst })
    expect(res.statusCode).toBe(403)
    expect((await returnIt(selma, d, { returnBranchId: ids.sjj })).statusCode).toBe(200)
  })
})

describe('time zones', () => {
  it('a time that never happened is refused; a doubled time needs a choice and is stored as chosen', async () => {
    // The next real clock changes of the company zone, far enough ahead (90+ days) not to meet any rental the other tests place near today.
    const spring = nextClockChange(TZ, addDays(todayIn(TZ), 90), 'spring')
    const autumn = nextClockChange(TZ, addDays(todayIn(TZ), 90), 'autumn')
    const skipped = await adnan.post('/api/rentals', direct({ vehicleId: ids.duster, vehicleClassId: ids.suv, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: `${addDays(spring.day, -1)}T10:00`, returnLocal: `${spring.day}T02:30` }))
    expect(skipped.statusCode).toBe(400)
    expect(skipped.json().error.fields.returnLocal).toMatch(/yaşanmadı/)
    const body = direct({ vehicleId: ids.duster, vehicleClassId: ids.suv, pickupBranchId: ids.mst, returnBranchId: ids.mst, pickupLocal: `${addDays(autumn.day, -1)}T10:00`, returnLocal: `${autumn.day}T02:30` })
    const doubled = await adnan.post('/api/rentals', body)
    expect(doubled.statusCode).toBe(400)
    expect(doubled.json().error.code).toBe('AMBIGUOUS_TIME')
    const later = await adnan.post('/api/rentals', { ...body, returnChoice: 'later' })
    expect(later.statusCode, later.body).toBe(201)
    // 02:30 happens twice; "later" is the one after the clocks went back (01:30 UTC), "earlier" would be 00:30 UTC
    expect(later.json().plannedReturn).toMatchObject({ at: `${autumn.day}T01:30:00.000Z`, local: `${autumn.day}T02:30`, timeZone: 'Europe/Sarajevo' })
  })
})

describe('permissions and history', () => {
  it('read-only users cannot create, hand over or return; custom roles get no rental permission by themselves', async () => {
    const reader = await userWithRole(['rentals.read'])
    expect((await reader.post('/api/rentals', direct({ vehicleId: ids.i20, vehicleClassId: ids.ekonomi }))).statusCode).toBe(403)
    const k1 = await get(reader, await rentalId('K-000001'))
    expect((await reader.post(`/api/rentals/${k1.id}/return`, { version: k1.version, requestId: uuid(), returnBranchId: ids.sac, km: 20_000, fuel: 'full' })).statusCode).toBe(403)
    const custom = await one(`select permissions from roles where name = 'Kir 1'`)
    expect(custom.permissions).not.toContain('rentals.handover')
    const manager = (await one(`select permissions from roles where name = 'Operasyon'`)).permissions as string[]
    expect(manager).toEqual(expect.arrayContaining(['rentals.read', 'rentals.manage', 'rentals.handover']))
    expect(manager).not.toContain('customers.documents.view')
    expect(manager).not.toContain('customers.identity.reveal')
  })

  it('history: who, when, which rental; no names, contacts, document numbers or notes', async () => {
    const rows = (await asOwner(data.companies.drina, `select action, summary::text s from audit_log where entity = 'rental'`)).rows as { action: string; s: string }[]
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(['rental.create', 'rental.update', 'rental.cancel', 'rental.document_check', 'rental.photo.add', 'rental.photo.remove', 'rental.deliver', 'rental.extend', 'rental.return', 'rental.close', 'photo.access_granted']))
    for (const r of rows) {
      expect(r.s).not.toMatch(/Ajla|Mirza|Testović|Uzorak|Beispiel|@example|\+387|TEST-BA|Gizli|göçük|Pasaport gördüm|çizik/i)
    }
    const k1 = await rentalId('K-000001')
    const hist = (await adnan.get(`/api/rentals/${k1}/history`)).json()
    expect(hist.items[0]).toMatchObject({ action: 'rental.extend', actorName: expect.any(String) })
  })
})
