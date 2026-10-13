import { Writable } from 'node:stream'
import { type AvailabilityResponse, type ReservationDetail, type ReservationListResponse, todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Reservations V1 on the test database: synthetic customers, fleet and reservations (seed/test-reservations.ts).

const TZ = 'Europe/Sarajevo'
let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip
let selma: Client // Drina Operasyon, SJJ only
let lejla: Client // Neretva Sahip
let logs = ''
const ids: Record<string, string> = {}

/** Wall time n company days from today ("2026-10-15T10:00"). */
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn(TZ)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
const search = async (c: Client, body: Record<string, unknown> = {}) => (await c.post('/api/reservations/search', body)).json() as ReservationListResponse
const get = async (c: Client, id: string) => (await c.get(`/api/reservations/${id}`)).json() as ReservationDetail
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
const resId = async (no: string, companyId = data.companies.drina) => (await one(`select id from reservations where reservation_no = $1`, [no], companyId)).id as string
async function login(email: string, on = app) {
  const c = new Client(on)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}
let roleNo = 0
async function userWithRole(permissions: string[], branches?: string[]) {
  roleNo++
  const email = `rezervasyon${roleNo}@drina-demo.ba`
  const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, $2, $3) returning id`, [data.companies.drina, `Rez ${roleNo}`, permissions])).rows[0].id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select $1, 'Rez Kullanıcı', password_hash from users where email = $2 returning id`, [email, EMAILS.adnan])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, $3) returning id`, [data.companies.drina, user, branches ? 'no' : 'yes'])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  for (const code of branches ?? []) {
    await asOwner(data.companies.drina, `insert into membership_branches (company_id, membership_id, branch_id) select $1, $2, id from branches where code = $3`, [data.companies.drina, m, code])
  }
  return login(email)
}

const base = () => ({
  customerId: ids.mirza,
  vehicleClassId: ids.orta,
  pickupBranchId: ids.sjj,
  returnBranchId: ids.sjj,
  pickupLocal: local(20, '10:00'),
  returnLocal: local(22, '10:00'),
  source: 'phone',
})

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (chunk, _e, done) => ((logs += chunk.toString()), done()) }) })
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  for (const [k, code] of [['sjj', 'SJJ'], ['sac', 'SAC'], ['mst', 'MST']]) ids[k] = (await one(`select id from branches where code = $1`, [code])).id
  ids.moc = (await one(`select id from branches where code = 'MOC'`, [], data.companies.neretva)).id
  for (const [k, n] of [['orta', 'Orta'], ['kompakt', 'Kompakt'], ['ekonomi', 'Ekonomi']]) ids[k] = (await one(`select id from vehicle_classes where name = $1`, [n])).id
  for (const [k, p] of [['octavia', 'A12-K-345'], ['golf', 'E45-M-218'], ['tipo', 'J27-K-615'], ['clio', 'K71-J-904']]) ids[k] = (await one(`select id from vehicles where plate = $1`, [p])).id
  for (const [k, n] of [['ajla', 'Ajla Testović'], ['emir', 'Emir Primjerović'], ['lena', 'Lena Beispiel'], ['mirza', 'Mirza Uzorak'], ['haris', 'Haris Arhivić'], ['nina', 'Nina Probna'], ['tarik', 'Tarik Testić']]) {
    ids[k] = (await one(`select id from customers where display_name = $1`, [n])).id
  }
  ids.dino = (await one(`select id from customers where display_name = 'Dino Neretvić'`, [], data.companies.neretva)).id
  ids.neretvaSuv = (await one(`select id from vehicles where plate = 'M21-O-650'`, [], data.companies.neretva)).id
  ids.ornek = (await one(`select id from corporate_accounts where legal_name = 'Örnek Lojistik d.o.o.'`)).id
  ids.stara = (await one(`select id from corporate_accounts where legal_name = 'Stara Firma d.o.o.'`)).id
  for (const no of ['R-000001', 'R-000002', 'R-000003', 'R-000004', 'R-000005']) ids[no] = await resId(no)
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('list, search and isolation', () => {
  it('lists active reservations by pickup; filters by status, vehicle, assignment, account, text and dates', async () => {
    const list = await search(adnan)
    expect(list.items.map((r) => r.reservationNo)).toEqual(['R-000005', 'R-000003', 'R-000001', 'R-000002'])
    expect(list.items.find((r) => r.reservationNo === 'R-000003')).toMatchObject({
      status: 'confirmed',
      customer: { displayName: 'Lena Beispiel' },
      corporateAccount: { accountNo: 'K-00001' },
      vehicle: { plate: 'E45-M-218' },
      pickupBranch: { code: 'SJJ' },
      pickup: { timeZone: TZ, local: local(1, '08:30') },
    })
    expect((await search(adnan, { status: 'all' })).total).toBe(5)
    expect((await search(adnan, { status: 'cancelled' })).items.map((r) => r.reservationNo)).toEqual(['R-000004'])
    expect((await search(adnan, { assigned: 'no' })).items.map((r) => r.reservationNo)).toEqual(['R-000002'])
    expect((await search(adnan, { vehicleId: ids.octavia })).items.map((r) => r.reservationNo)).toEqual(['R-000001'])
    expect((await search(adnan, { corporateAccountId: ids.ornek })).items.map((r) => r.reservationNo)).toEqual(['R-000003'])
    expect((await search(adnan, { q: 'R-000002' })).items.map((r) => r.reservationNo)).toEqual(['R-000002'])
    expect((await search(adnan, { q: 'lena beispiel' })).items.map((r) => r.reservationNo)).toEqual(['R-000003'])
    expect((await search(adnan, { q: 'a12k' })).items.map((r) => r.reservationNo)).toEqual(['R-000001'])
    expect((await search(adnan, { customerId: ids.emir })).items.map((r) => r.reservationNo).sort()).toEqual(['R-000002', 'R-000003']) // as driver too
    // Overlap with company days: day 6 to 7 contains only R-000003 among active ones.
    expect((await search(adnan, { from: local(6, '00:00').slice(0, 10), to: local(7, '00:00').slice(0, 10) })).items.map((r) => r.reservationNo)).toEqual(['R-000003'])
  })

  it('a branch-limited user sees reservations starting or ending in their branch only (R10)', async () => {
    expect((await search(selma, { status: 'all' })).items.map((r) => r.reservationNo).sort()).toEqual(['R-000001', 'R-000003', 'R-000004'])
    expect((await selma.get(`/api/reservations/${ids['R-000002']}`)).statusCode).toBe(404)
    expect((await selma.post('/api/reservations', { ...base(), pickupBranchId: ids.sac, returnBranchId: ids.sjj })).statusCode).toBe(403)
    expect((await selma.post('/api/reservations', { ...base(), returnBranchId: ids.mst })).statusCode).toBe(201)
  })

  it('branch list for the form: every active company branch with its zone; scope marked per user', async () => {
    const all = (await selma.get('/api/reservations/branches')).json().items as { code: string; timeZone: string; inScope: boolean }[]
    expect(all.map((b) => [b.code, b.inScope])).toEqual(expect.arrayContaining([['SJJ', true], ['SAC', false], ['MST', false]]))
    expect(all.every((b) => b.timeZone === TZ)).toBe(true)
    expect(all.map((b) => b.code)).not.toContain('MOC')
  })

  it('another company sees nothing, also with a known id; the database refuses cross-company links', async () => {
    expect((await search(lejla, { status: 'all' })).items.map((r) => r.customer.displayName)).toEqual(['Dino Neretvić'])
    for (const res of [
      await lejla.get(`/api/reservations/${ids['R-000001']}`),
      await lejla.get(`/api/reservations/${ids['R-000001']}/history`),
      await lejla.put(`/api/reservations/${ids['R-000001']}`, { ...base(), version: 1 }),
      await lejla.post(`/api/reservations/${ids['R-000001']}/cancel`, { version: 1, reason: 'other' }),
      await lejla.post(`/api/reservations/${ids['R-000002']}/confirm`, { version: 1 }),
    ]) {
      expect(res.statusCode).toBe(404)
      expect(res.body).not.toMatch(/Ajla|Emir|A12-K/)
    }
    expect((await adnan.post('/api/reservations', { ...base(), customerId: ids.dino })).statusCode).toBe(404)
    expect((await adnan.post('/api/reservations', { ...base(), vehicleId: ids.neretvaSuv })).statusCode).toBe(400)
    await expect(asOwner(data.companies.drina, `update reservations set customer_id = $1 where id = $2`, [ids.dino, ids['R-000002']])).rejects.toThrow(/foreign key/)
    // The class guard (the vehicle is invisible in this company) or the foreign key refuses it; nothing changes.
    await expect(asOwner(data.companies.drina, `update reservations set vehicle_id = $1 where id = $2`, [ids.neretvaSuv, ids['R-000002']])).rejects.toThrow(/foreign key|not of the reservation class/)
    expect((await one(`select vehicle_id from reservations where id = $1`, [ids['R-000002']])).vehicle_id).toBeNull()
    const counts = (companyId: string | null) =>
      asApp(companyId, async (c) => Promise.all(['reservations', 'reservation_drivers', 'reservation_status_events'].map(async (t) => (await c.query(`select count(*)::int n from ${t}`)).rows[0].n as number)))
    expect(await counts(null)).toEqual([0, 0, 0])
    expect((await counts(data.companies.neretva))[0]).toBe(1)
  })
})

describe('create, times and validation', () => {
  it('creates a pending class-only reservation with drivers; numbers are per company and consecutive under concurrency', async () => {
    const res = await adnan.post('/api/reservations', { ...base(), vehicleClassId: ids.kompakt, drivers: [{ customerId: ids.mirza, isPrimary: true }, { customerId: ids.nina }], note: 'Gizli not 555-1234' })
    expect(res.statusCode).toBe(201)
    const r = res.json() as ReservationDetail
    expect(r).toMatchObject({ status: 'pending', vehicle: null, vehicleClass: { name: 'Kompakt' }, pickup: { local: local(20, '10:00'), timeZone: TZ } })
    expect(r.reservationNo).toMatch(/^R-0000\d\d$/)
    expect(r.drivers.map((d) => [d.displayName, d.isPrimary])).toEqual([
      ['Mirza Uzorak', true],
      ['Nina Probna', false],
    ])
    expect(r.warnings.map((w) => w.code)).toContain('class_only_cannot_confirm')
    expect(r.statusEvents.map((e) => [e.fromStatus, e.toStatus])).toEqual([[null, 'pending']])
    ids.pendingKompakt = r.id
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => adnan.post('/api/reservations', { ...base(), vehicleClassId: ids.ekonomi, pickupLocal: local(40 + i, '10:00'), returnLocal: local(41 + i, '10:00') })))
    const numbers = results.map((x) => x.json().reservationNo as string).sort()
    expect(new Set(numbers).size).toBe(6)
    expect(Number(numbers[5]!.slice(2)) - Number(numbers[0]!.slice(2))).toBe(5)
    expect((await lejla.post('/api/reservations', { customerId: ids.dino, vehicleClassId: (await one(`select id from vehicle_classes where name = 'SUV'`, [], data.companies.neretva)).id, pickupBranchId: ids.moc, returnBranchId: ids.moc, pickupLocal: local(30, '10:00'), returnLocal: local(31, '10:00'), source: 'phone' })).json().reservationNo).toBe('R-000002')
  })

  it('refuses past pickups, return before pickup, a vehicle of another class, archived customers and archived accounts', async () => {
    const err = async (body: Record<string, unknown>) => (await adnan.post('/api/reservations', { ...base(), ...body })).json().error
    expect((await err({ pickupLocal: local(-1, '10:00') })).fields.pickupLocal).toBe('Alış zamanı geçmişte olamaz')
    expect((await err({ returnLocal: local(20, '09:00') })).fields.returnLocal).toBe('İade, alıştan sonra olmalı')
    expect((await err({ vehicleId: ids.golf })).fields.vehicleId).toMatch(/sınıftan değil/)
    expect((await err({ customerId: ids.haris })).code).toBe('CUSTOMER_ARCHIVED')
    expect((await err({ corporateAccountId: ids.stara })).code).toBe('ACCOUNT_ARCHIVED')
    expect((await err({ source: 'booking_com' })).code).toBe('VALIDATION')
    expect((await err({ confirm: true })).code).toBe('VEHICLE_REQUIRED')
  })

  it('daylight saving: a time that never happened is refused, a doubled one needs a choice and is stored exactly', async () => {
    const skipped = await adnan.post('/api/reservations', { ...base(), pickupLocal: '2027-03-28T02:30', returnLocal: '2027-03-29T10:00' })
    expect(skipped.json().error.fields.pickupLocal).toMatch(/yaşanmadı/)
    const doubled = await adnan.post('/api/reservations', { ...base(), pickupLocal: '2026-10-25T02:30', returnLocal: '2026-10-26T10:00' })
    expect(doubled.json().error).toMatchObject({ code: 'AMBIGUOUS_TIME', fields: { pickupChoice: expect.any(String) }, details: { earlier: { offsetMinutes: 120 }, later: { offsetMinutes: 60 } } })
    const later = await adnan.post('/api/reservations', { ...base(), pickupLocal: '2026-10-25T02:30', pickupChoice: 'later', returnLocal: '2026-10-26T10:00' })
    expect(later.statusCode).toBe(201)
    expect(later.json().pickup).toMatchObject({ at: '2026-10-25T01:30:00.000Z', local: '2026-10-25T02:30' })
    // Real elapsed time: with the later 02:30 the stay is 31 h 30 min, with the earlier one 32 h 30 min.
    expect(later.json().durationMinutes).toBe(31 * 60 + 30)
    const earlier = await adnan.post('/api/reservations', { ...base(), pickupLocal: '2026-10-25T02:30', pickupChoice: 'earlier', returnLocal: '2026-10-26T10:00' })
    expect(earlier.json().pickup.at).toBe('2026-10-25T00:30:00.000Z')
    expect(earlier.json().durationMinutes).toBe(32 * 60 + 30)
  })

  it('pickup and return are read in their own branch time zones; the zone is kept with the reservation (R4)', async () => {
    await asOwner(data.companies.drina, `update branches set timezone = 'Europe/Istanbul' where code = 'MST'`)
    try {
      const r = (await adnan.post('/api/reservations', { ...base(), returnBranchId: ids.mst, pickupLocal: local(25, '10:00'), returnLocal: local(26, '12:00') })).json() as ReservationDetail
      expect(r.return).toMatchObject({ timeZone: 'Europe/Istanbul', local: local(26, '12:00') })
      expect(new Date(r.return.at).getUTCHours()).toBe(9) // 12:00 at UTC+3
      expect(r.pickup.timeZone).toBe(TZ)
    } finally {
      await asOwner(data.companies.drina, `update branches set timezone = $1 where code = 'MST'`, [TZ])
    }
  })
})

describe('vehicle availability and double booking', () => {
  it('a confirmed reservation holds its vehicle for [pickup, return): overlaps are refused, touching periods are not, pending never blocks', async () => {
    const r1 = await get(adnan, ids['R-000001'])
    const overlap = await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(4, '09:00'), returnLocal: local(6, '09:00'), confirm: true })
    expect(overlap.statusCode).toBe(409)
    expect(overlap.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [{ kind: 'reservation', refNo: 'R-000001', startsAt: r1.pickup.at, endsAt: r1.return.at }] } })
    expect(overlap.body).not.toMatch(/Ajla/)
    // Ends exactly when R-000001 starts, and starts exactly when it ends: both allowed.
    expect((await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(1, '10:00'), returnLocal: local(2, '10:00'), confirm: true })).statusCode).toBe(201)
    expect((await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(5, '10:00'), returnLocal: local(6, '10:00'), confirm: true })).statusCode).toBe(201)
    // One minute of overlap is refused.
    expect((await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(5, '09:59'), returnLocal: local(5, '10:00'), confirm: true })).statusCode).toBe(409)
    // A pending reservation may name the same vehicle (tentative); confirming it is refused and it stays pending.
    const pending = (await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(3, '10:00'), returnLocal: local(4, '10:00') })).json() as ReservationDetail
    expect(pending.status).toBe('pending')
    const confirm = await adnan.post(`/api/reservations/${pending.id}/confirm`, { version: pending.version })
    expect(confirm.json().error.code).toBe('VEHICLE_UNAVAILABLE')
    expect((await get(adnan, pending.id)).status).toBe('pending')
  })

  it('two people confirming the same vehicle at the same moment: exactly one succeeds (database guard)', async () => {
    const make = async () => (await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(50, '10:00'), returnLocal: local(52, '10:00') })).json() as ReservationDetail
    const [a, b, c] = [await make(), await make(), await make()]
    const second = await login(EMAILS.adnan)
    const results = await Promise.all([adnan.post(`/api/reservations/${a.id}/confirm`, { version: a.version }), second.post(`/api/reservations/${b.id}/confirm`, { version: b.version }), selma.post(`/api/reservations/${c.id}/confirm`, { version: c.version })])
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409])
    // Directly in the database the trigger refuses it as well.
    await expect(asOwner(data.companies.drina, `update reservations set status = 'confirmed', confirmed_at = now() where id = $1`, [results[0]!.statusCode === 200 ? b.id : a.id])).rejects.toThrow(/already reserved/)
  })

  it('an out-of-service vehicle can be a pending preference but not confirmed', async () => {
    const r = (await adnan.post('/api/reservations', { ...base(), vehicleClassId: ids.kompakt, vehicleId: ids.tipo })).json() as ReservationDetail
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['vehicle_not_active', 'vehicle_at_other_branch']))
    expect((await adnan.post(`/api/reservations/${r.id}/confirm`, { version: r.version })).json().error.code).toBe('VEHICLE_NOT_ACTIVE')
  })

  it('availability lists the class with conflicts as numbers and times only, marks what cannot be checked yet, and is not a capacity guarantee', async () => {
    const res = (await adnan.post('/api/reservations/availability', { vehicleClassId: ids.orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(3, '10:00'), returnLocal: local(4, '10:00') })).json() as AvailabilityResponse
    const octavia = res.vehicles.find((v) => v.plate === 'A12-K-345')!
    expect(octavia).toMatchObject({ available: false, conflicts: [expect.objectContaining({ kind: 'reservation', refNo: 'R-000001' })] })
    expect(res.vehicles.filter((v) => v.available).length).toBeGreaterThan(0)
    expect(res.classSummary.estimateOnly).toBe(true)
    expect(res.notChecked).toEqual(['maintenance', 'transfer', 'external_sourcing', 'vehicle_location'])
    expect(JSON.stringify(res)).not.toMatch(/Ajla|Testović|customer/i)
    // The reservation being edited does not conflict with itself.
    const own = (await adnan.post('/api/reservations/availability', { vehicleClassId: ids.orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(3, '10:00'), returnLocal: local(4, '10:00'), excludeReservationId: ids['R-000001'] })).json() as AvailabilityResponse
    expect(own.vehicles.find((v) => v.plate === 'A12-K-345')!.available).toBe(true)
  })

  it('timeline shows the vehicles with confirmed and pending bars and counts unassigned ones', async () => {
    const t = (await adnan.post('/api/reservations/timeline', { from: todayIn(TZ), days: 14 })).json()
    expect(t.timeZone).toBe(TZ)
    expect(t.bars.find((b: { reservationNo: string }) => b.reservationNo === 'R-000001')).toMatchObject({ status: 'confirmed', vehicleId: ids.octavia })
    expect(t.unassigned).toBeGreaterThanOrEqual(1)
  })
})

describe('edit, lifecycle and history', () => {
  it('edits with versions; a confirmed reservation needs a reason to move and is re-checked; it cannot lose its vehicle; the history keeps old and new values without names or notes', async () => {
    const r = await get(adnan, ids['R-000003'])
    const body = {
      customerId: ids.lena,
      corporateAccountId: ids.ornek,
      bookerCustomerId: ids.ajla,
      drivers: r.drivers.map((d) => ({ customerId: d.id, isPrimary: d.isPrimary })),
      vehicleClassId: ids.kompakt,
      vehicleId: ids.golf,
      pickupBranchId: ids.sjj,
      returnBranchId: ids.sjj,
      pickupLocal: r.pickup.local,
      returnLocal: local(9, '08:30'),
      source: 'corporate',
      version: r.version,
    }
    expect((await adnan.put(`/api/reservations/${r.id}`, body)).json().error.fields.changeReason).toBeTruthy()
    const moved = await adnan.put(`/api/reservations/${r.id}`, { ...body, changeReason: 'customer_request', note: 'Gizli müşteri notu' })
    expect(moved.statusCode).toBe(200)
    expect((await adnan.put(`/api/reservations/${r.id}`, { ...body, changeReason: 'other' })).json().error.code).toBe('VERSION_CONFLICT')
    expect((await adnan.put(`/api/reservations/${r.id}`, { ...body, vehicleId: undefined, version: r.version + 1, changeReason: 'other' })).json().error.code).toBe('VEHICLE_REQUIRED')
    const entry = (await one(`select summary from audit_log where action = 'reservation.update' and entity_id = $1 order by created_at desc limit 1`, [r.id])).summary
    expect(entry).toMatchObject({ reservationNo: 'R-000003', changeReason: 'customer_request', noteChanged: true, changes: { returnAt: [r.return.at, expect.any(String)] } })
    expect(JSON.stringify(entry)).not.toMatch(/Gizli|Lena|Beispiel|\+49/)
    // Moving into another confirmed reservation of the same vehicle is refused.
    const golfOther = (await adnan.post('/api/reservations', { ...base(), vehicleClassId: ids.kompakt, vehicleId: ids.golf, pickupLocal: local(10, '08:30'), returnLocal: local(11, '08:30'), confirm: true })).json() as ReservationDetail
    const into = await adnan.put(`/api/reservations/${r.id}`, { ...body, returnLocal: local(10, '12:00'), version: r.version + 1, changeReason: 'operational' })
    expect(into.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [expect.objectContaining({ refNo: golfOther.reservationNo })] } })
  })

  it('cancel and no-show: reasons, only allowed transitions, released capacity, final states (also in the database)', async () => {
    const pending = await get(adnan, ids['R-000002'])
    expect((await adnan.post(`/api/reservations/${pending.id}/cancel`, { version: pending.version })).statusCode).toBe(400)
    expect((await adnan.post(`/api/reservations/${pending.id}/no-show`, { version: pending.version, reason: 'did_not_arrive' })).json().error.code).toBe('INVALID_TRANSITION')
    const cancelled = (await adnan.post(`/api/reservations/${pending.id}/cancel`, { version: pending.version, reason: 'customer_request', note: 'Müşteri aradı' })).json() as ReservationDetail
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'customer_request', cancelNote: 'Müşteri aradı', cancelledByName: 'Adnan Kovač' })
    expect((await adnan.post(`/api/reservations/${pending.id}/confirm`, { version: cancelled.version })).json().error.code).toBe('INVALID_TRANSITION')
    expect((await adnan.put(`/api/reservations/${pending.id}`, { ...base(), version: cancelled.version })).json().error.code).toBe('RESERVATION_CLOSED')
    await expect(asOwner(data.companies.drina, `update reservations set status = 'pending', cancel_reason = null, cancelled_at = null where id = $1`, [pending.id])).rejects.toThrow(/cannot change/)
    // Cancelling a confirmed reservation releases its vehicle.
    const r1 = await get(adnan, ids['R-000001'])
    expect((await adnan.post(`/api/reservations/${r1.id}/cancel`, { version: r1.version, reason: 'no_vehicle' })).statusCode).toBe(200)
    expect((await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: r1.pickup.local, returnLocal: r1.return.local, confirm: true })).statusCode).toBe(201)
    // No-show only after the pickup time.
    const future = await get(adnan, ids['R-000003'])
    expect((await adnan.post(`/api/reservations/${future.id}/no-show`, { version: future.version, reason: 'did_not_arrive' })).json().error.code).toBe('PICKUP_NOT_PASSED')
    const past = await get(adnan, ids['R-000005'])
    const noShow = (await adnan.post(`/api/reservations/${past.id}/no-show`, { version: past.version, reason: 'unreachable', note: 'Telefon kapalı' })).json() as ReservationDetail
    expect(noShow).toMatchObject({ status: 'no_show', noShowReason: 'unreachable' })
    expect(noShow.statusEvents.map((e) => e.toStatus)).toEqual(['confirmed', 'no_show'])
    const history = (await adnan.get(`/api/reservations/${past.id}/history`)).json().items.map((i: { action: string }) => i.action)
    expect(history).toContain('reservation.no_show')
  })

  it('corporate context: drivers that are not authorised drivers of the account are a warning, never a block (R11)', async () => {
    const r = await get(adnan, ids['R-000003'])
    expect(r.warnings.filter((w) => w.code === 'driver_not_authorized_for_account').map((w) => w.subject)).toEqual(['M-000003'])
    expect(r.warnings.map((w) => w.code)).not.toContain('booker_not_linked_to_account')
  })
})

describe('permissions, related lists and leaks', () => {
  it('read, manage and confirm are separate; revoking a permission takes effect on the next request; contact data needs customers.read', async () => {
    const reader = await userWithRole(['reservations.read'])
    expect((await reader.post('/api/reservations/search', {})).statusCode).toBe(200)
    expect((await reader.post('/api/reservations', base())).statusCode).toBe(403)
    const d = await get(reader, ids['R-000003'])
    expect(d.customer).toMatchObject({ displayName: 'Lena Beispiel', phone: null, email: null, documents: null })
    expect(d.corporateAccount).toBeNull()
    const manager = await userWithRole(['reservations.read', 'reservations.manage', 'customers.read'])
    expect((await manager.post('/api/reservations', { ...base(), vehicleClassId: ids.kompakt, vehicleId: ids.golf, confirm: true, pickupLocal: local(70, '10:00'), returnLocal: local(71, '10:00') })).statusCode).toBe(403)
    const p = (await manager.post('/api/reservations', { ...base(), pickupLocal: local(70, '10:00'), returnLocal: local(71, '10:00') })).json() as ReservationDetail
    expect((await manager.post(`/api/reservations/${p.id}/confirm`, { version: p.version })).statusCode).toBe(403)
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'reservations.read') where name = 'Operasyon'`)
    try {
      expect((await selma.post('/api/reservations/search', {})).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'reservations.read') where name = 'Operasyon'`)
    }
    expect((await selma.post('/api/reservations/search', {})).statusCode).toBe(200)
  })

  it('customer, corporate account and vehicle 360° lists', async () => {
    const forCustomer = (await adnan.get(`/api/customers/${ids.emir}/reservations`)).json().items.map((r: { reservationNo: string }) => r.reservationNo)
    expect(forCustomer).toEqual(expect.arrayContaining(['R-000002', 'R-000003']))
    expect((await adnan.get(`/api/corporate-accounts/${ids.ornek}/reservations`)).json().items.map((r: { reservationNo: string }) => r.reservationNo)).toEqual(['R-000003'])
    expect((await adnan.get(`/api/vehicles/${ids.golf}/reservations`)).json().items.map((r: { reservationNo: string }) => r.reservationNo)).toContain('R-000003')
    expect((await lejla.get(`/api/customers/${ids.emir}/reservations`)).json().items).toEqual([])
  })

  it('no names, contacts or notes in the history or the server log', async () => {
    const history = (await asOwner(data.companies.drina, `select coalesce(string_agg(summary::text, ' '), '') s from audit_log where entity = 'reservation'`)).rows[0].s as string
    expect(history).toContain('R-0000')
    expect(history).not.toMatch(/Gizli|555-1234|Ajla|Mirza|Lena|Testović|@example|\+387/)
    expect(logs).not.toMatch(/Gizli|555-1234|lena beispiel/i)
  })

  it('the runtime role cannot delete reservations, drivers or status events, nor edit status events', async () => {
    for (const t of ['reservations', 'reservation_drivers', 'reservation_status_events']) {
      await expect(asApp(data.companies.drina, (c) => c.query(`delete from ${t}`))).rejects.toThrow(/permission denied/)
    }
    await expect(asApp(data.companies.drina, (c) => c.query(`update reservation_status_events set note = 'x'`))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.drina, (c) => c.query(`update reservations set reservation_no = 'R-999999' where id = $1`, [ids['R-000003']]))).rejects.toThrow(/cannot change/)
  })
})

describe('final security review (integration)', () => {
  it('ids of another company for the account, the booker or a driver are unknown here; nothing is created', async () => {
    const before = (await one(`select count(*)::int n from reservations`)).n
    const neretvaAccount = (await one(`select id from corporate_accounts limit 1`, [], data.companies.neretva)).id
    expect((await adnan.post('/api/reservations', { ...base(), corporateAccountId: neretvaAccount })).statusCode).toBe(404)
    expect((await adnan.post('/api/reservations', { ...base(), bookerCustomerId: ids.dino })).statusCode).toBe(404)
    expect((await adnan.post('/api/reservations', { ...base(), drivers: [{ customerId: ids.dino, isPrimary: true }] })).statusCode).toBe(404)
    expect((await one(`select count(*)::int n from reservations`)).n).toBe(before)
  })

  it('the database itself keeps [pickup, return): touching periods pass, one minute of overlap does not, pending never holds', async () => {
    const vehicle = (await one(`select id, class_id from vehicles where plate = 'E16-T-093'`)) as { id: string; class_id: string }
    const insert = (no: string, status: string, from: string, to: string) =>
      asOwner(
        data.companies.drina,
        `insert into reservations (company_id, reservation_no, status, source, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id, pickup_at, return_at, pickup_timezone, return_timezone, confirmed_at)
         values ($1, $2, $3, 'phone', $4, $5, $6, $7, $7, $8, $9, 'Europe/Sarajevo', 'Europe/Sarajevo', case when $3 = 'confirmed' then now() else null end)`,
        [data.companies.drina, no, status, ids.mirza, vehicle.class_id, vehicle.id, ids.sjj, from, to],
      )
    await insert('R-900001', 'confirmed', '2027-06-01T08:00:00Z', '2027-06-03T08:00:00Z')
    await insert('R-900002', 'confirmed', '2027-06-03T08:00:00Z', '2027-06-04T08:00:00Z') // starts when the first ends
    await insert('R-900003', 'confirmed', '2027-05-30T08:00:00Z', '2027-06-01T08:00:00Z') // ends when the first starts
    await expect(insert('R-900004', 'confirmed', '2027-06-02T07:59:00Z', '2027-06-02T09:00:00Z')).rejects.toThrow(/already reserved/)
    await expect(insert('R-900005', 'confirmed', '2027-06-03T07:59:00Z', '2027-06-03T08:01:00Z')).rejects.toThrow(/already reserved/)
    await insert('R-900006', 'pending', '2027-06-02T00:00:00Z', '2027-06-02T12:00:00Z') // pending: no hold
    // A pending row cannot be turned into an overlapping confirmed one by a direct update either.
    await expect(asOwner(data.companies.drina, `update reservations set status = 'confirmed', confirmed_at = now() where reservation_no = 'R-900006'`)).rejects.toThrow(/already reserved/)
  })

  it('changing the vehicle of a confirmed reservation is checked the same way, and the old vehicle is released', async () => {
    const r = (await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: local(80, '10:00'), returnLocal: local(82, '10:00'), confirm: true })).json() as ReservationDetail
    const other = (await one(`select id from vehicles where plate = 'M87-J-529'`)).id as string
    const blocker = (await adnan.post('/api/reservations', { ...base(), vehicleId: other, pickupLocal: local(81, '10:00'), returnLocal: local(81, '18:00'), confirm: true })).json() as ReservationDetail
    const body = { ...base(), customerId: ids.mirza, vehicleClassId: ids.orta, pickupLocal: r.pickup.local, returnLocal: r.return.local, version: r.version, changeReason: 'operational' }
    const into = await adnan.put(`/api/reservations/${r.id}`, { ...body, vehicleId: other })
    expect(into.json().error).toMatchObject({ code: 'VEHICLE_UNAVAILABLE', details: { conflicts: [expect.objectContaining({ refNo: blocker.reservationNo })] } })
    const free = (await one(`select id from vehicles where plate = 'O58-E-467'`)).id as string
    expect((await adnan.put(`/api/reservations/${r.id}`, { ...body, vehicleId: free })).statusCode).toBe(200)
    // The Octavia is free again for that period.
    expect((await adnan.post('/api/reservations', { ...base(), vehicleId: ids.octavia, pickupLocal: r.pickup.local, returnLocal: r.return.local, confirm: true })).statusCode).toBe(201)
  })

  it('a status in the request body is ignored: only the confirm, cancel and no-show endpoints change status', async () => {
    const p = (await adnan.post('/api/reservations', { ...base(), status: 'confirmed', vehicleId: undefined, pickupLocal: local(90, '10:00'), returnLocal: local(91, '10:00') })).json() as ReservationDetail
    expect(p.status).toBe('pending')
    const edited = (await adnan.put(`/api/reservations/${p.id}`, { ...base(), status: 'confirmed', pickupLocal: p.pickup.local, returnLocal: p.return.local, version: p.version, note: 'x' })).json() as ReservationDetail
    expect(edited.status).toBe('pending')
  })
})
