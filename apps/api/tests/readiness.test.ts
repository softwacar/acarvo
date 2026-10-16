import { randomUUID } from 'node:crypto'
import type { DamageDetail, DashboardResponse, ReadinessResponse, RentalDetail, RentalFinanceView, TransferDetail } from '@acarvo/shared'
import { todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, env, makeApp, ownerPool, resetDatabase } from './helpers'

// Operational readiness + dashboard V1 (docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md): dashboard scope and figures,
// readiness checks, evidence photo access grants, four-eyes release of damage blocks, FN5 corrections, repair transport
// evidence. acarvo_test only, synthetic data.

const TZ = 'Europe/Sarajevo'
let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip, all branches
let selma: Client // Drina Operasyon, SJJ
let lejla: Client // Neretva Sahip
let kontrol: Client // Drina Yönetici
let jpeg: Buffer
const ids: Record<string, string> = {}
const uuid = () => randomUUID()
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn(TZ)}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
const nowLocal = (minutes = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + minutes * 60_000)).replace(' ', 'T')
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
const vehicle = async (plate: string) => (await one(`select id from vehicles where plate = $1`, [plate])).id as string
const act = (c: Client, url: string, d: { version: number }, body: Record<string, unknown> = {}) => c.post(url, { version: d.version, requestId: uuid(), ...body })
const dash = async (c: Client, branchId?: string) => (await c.get(`/api/dashboard${branchId ? `?branchId=${branchId}` : ''}`)).json() as DashboardResponse
async function login(email: string) {
  const c = new Client(app)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}
const auditCount = async (action: string, entityId: string) => Number((await one(`select count(*)::int n from audit_log where action = $1 and entity_id = $2`, [action, entityId])).n)

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  for (const c of ['SJJ', 'SAC', 'MST']) ids[c.toLowerCase()] = (await one(`select id from branches where code = $1`, [c])).id
  for (const [k, n] of [['ajla', 'Ajla Testović'], ['mirza', 'Mirza Uzorak']]) ids[k] = (await one(`select id from customers where display_name = $1`, [n])).id
  const role = (await one(`select id from roles where name = 'Yönetici'`)).id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'kontrol@drina-demo.ba', 'Kontrol Kullanıcı', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  kontrol = await login('kontrol@drina-demo.ba')
  jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 80, g: 110, b: 140 } } }).jpeg().toBuffer()
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('dashboard', () => {
  it('figures come from real records; a vehicle is counted once, in the state that binds it now (shared allocation)', async () => {
    const d = await dash(adnan)
    const vehicles = Number((await one(`select count(*)::int n from vehicles where status in ('active', 'out_of_service')`)).n)
    expect(d.fleet!.total).toBe(vehicles)
    expect(Object.values(d.fleet!.buckets).reduce((a, b) => a + b, 0)).toBe(vehicles)
    // K-000001 delivered and K-000002 delivered and overdue: both rented; J27 out of service: unavailable.
    expect(d.fleet!.buckets.rented).toBe(2)
    expect(d.counts.activeRentals).toBe(2)
    expect(d.counts.overdueReturns).toBe(1)
    expect(d.overdue.find((i) => i.kind === 'rental')).toMatchObject({ no: 'K-000002', overdueMinutes: expect.any(Number) })
    expect(d.fleet!.buckets.unavailable).toBeGreaterThanOrEqual(1)
    // A blocking damage moves its vehicle to "unavailable" at once.
    const v = await vehicle('E63-A-847')
    const before = d.fleet!.buckets.unavailable
    await adnan.post('/api/damages', { requestId: uuid(), vehicleId: v, branchId: ids.sjj, view: 'front', description: 'Ön cam kırık', damageType: 'glass', severity: 'severe', usability: 'not_usable', blockReason: 'Görüş yok' })
    const after = await dash(adnan)
    expect(after.fleet!.buckets.unavailable).toBe(before + 1)
    expect(after.counts.blockedVehicles).toBe(1)
    expect(after.attention.find((i) => i.kind === 'damage')).toMatchObject({ plate: 'E63-A-847', customer: null })
  })

  it('never disagrees with the reservation availability: "available now" on the dashboard = available in the next minutes', async () => {
    const d = await dash(adnan)
    const orta = (await one(`select id from vehicle_classes where name = 'Orta'`)).id
    const avail = (await adnan.post('/api/reservations/availability', { vehicleClassId: orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: nowLocal(1), returnLocal: nowLocal(3) })).json()
    const rows = (await asOwner(data.companies.drina, `select v.id, v.status, coalesce((select array_agg(b.kind || ':' || b.status) from vehicle_busy(v.company_id, v.id, now(), now() + interval '1 second', null, null) b), '{}') as holds from vehicles v where v.class_id = $1`, [orta])).rows
    const { bucketOf } = await import('../src/modules/dashboard/routes')
    for (const v of avail.vehicles as { id: string; available: boolean }[]) {
      const r = rows.find((x: { id: string }) => x.id === v.id)
      expect(bucketOf(r.status, r.holds) === 'available', v.id).toBe(v.available)
    }
    expect(d.fleet!.buckets.available).toBeGreaterThan(0)
  })

  it('branch scope: an SJJ user sees SJJ only and cannot ask for another branch; another company sees only its own', async () => {
    const s = await dash(selma)
    const sjjVehicles = Number((await one(`select count(*)::int n from vehicles where status in ('active', 'out_of_service') and home_branch_id = $1`, [ids.sjj])).n)
    expect(s.fleet!.total).toBe(sjjVehicles)
    expect(s.scope).toMatchObject({ allBranches: false, branches: [{ code: 'SJJ' }] })
    expect((await selma.get(`/api/dashboard?branchId=${ids.sac}`)).statusCode).toBe(403)
    const one1 = await dash(adnan, ids.sjj)
    expect(one1.fleet!.total).toBe(sjjVehicles)
    // The figures narrow to the chosen branch; the list to choose from stays the user's whole scope.
    expect(one1.branches.map((b) => b.code)).toEqual(['SJJ'])
    expect(one1.scope.branches.length).toBeGreaterThan(1)
    // An all-branches owner asking for another company's branch is refused (not answered with empty figures).
    const moc = (await one(`select id from branches where code = 'MOC'`, [], data.companies.neretva)).id as string
    expect((await adnan.get(`/api/dashboard?branchId=${moc}`)).statusCode).toBe(403)
    expect((await lejla.get(`/api/dashboard?branchId=${ids.sjj}`)).statusCode).toBe(403)
    const l = await dash(lejla)
    expect(l.fleet!.total).toBe(4)
    expect(l.scope.branches.map((b) => b.code)).toEqual(['MOC'])
    expect(JSON.stringify(l)).not.toMatch(/A12-K-345|E63-A-847|T75-E-410|Drina/)
  })

  it('finance only with the finance reports permission, never leaked as hidden numbers; currencies are never summed', async () => {
    const s = await selma.get('/api/dashboard')
    expect(s.json().finance).toBeNull()
    expect(s.json().sections.finance).toBe(false)
    expect(s.body).not.toMatch(/Minor/)
    // Deposits in two currencies on two rentals.
    for (const [no, currency] of [['K-000003', 'EUR'], ['K-000001', 'BAM']] as const) {
      const rid = (await one(`select id from rentals where rental_no = $1`, [no])).id
      expect((await adnan.post(`/api/rentals/${rid}/finance/open`, { currency, responsibleType: 'customer', requestId: uuid() })).statusCode).toBe(201)
      const dep = await adnan.post(`/api/rentals/${rid}/finance/deposits`, { currency, amount: '100,00', received: true, method: 'cash', cashAck: true, requestId: uuid() })
      expect(dep.statusCode, dep.body).toBe(201)
    }
    const d = await dash(adnan)
    expect(d.finance!.rows.map((r) => r.currency)).toEqual(['BAM', 'EUR'])
    for (const r of d.finance!.rows) expect(r.depositsReportedMinor).toBe(10_000)
    expect(d.finance!.pending.deposits).toBe(2)
    expect(JSON.stringify(d.finance)).not.toMatch(/total|sum/i)
  })
})

describe('operational readiness', () => {
  it('only the owner sees it; checks reflect real settings; no key material; nothing is changed', async () => {
    expect((await kontrol.get('/api/readiness')).statusCode).toBe(403)
    expect((await selma.get('/api/readiness')).statusCode).toBe(403)
    const before = JSON.stringify((await asOwner(data.companies.drina, `select (select json_agg(b order by code) from branches b) b, (select json_agg(s) from company_rental_settings s) s, (select json_agg(r.permissions order by name) from roles r) r`)).rows)
    const res = await adnan.get('/api/readiness')
    expect(res.statusCode).toBe(200)
    const r = res.json() as ReadinessResponse
    const check = (k: string) => r.checks.find((c) => c.key === k)!
    const noCountry = Number((await one(`select count(*)::int n from branches where status = 'active' and country is null`)).n)
    expect(check('branch_countries').state).toBe(noCountry ? 'missing' : 'ready')
    expect(check('customer_keys').state).toBe('configured')
    expect(check('malware_scanner').state).toBe('not_verified') // no scanner in tests, not production
    expect(check('contract_legal').state).toBe('not_verified')
    expect(check('rental_mode').state).toBe('configured') // the Drina test seed has the external mode on
    expect(check('finance_verify')).toMatchObject({ state: 'ready', detail: expect.stringMatching(/^2 kişi/) })
    for (const value of [env.CUSTOMER_DATA_KEYS, env.CUSTOMER_LOOKUP_KEYS].flatMap((v) => (v ?? '').split(/[,:]/)).filter((x) => x.length > 8)) expect(res.body).not.toContain(value)
    expect(res.body).not.toMatch(/fingerprint|parmak izi/i)
    const after = JSON.stringify((await asOwner(data.companies.drina, `select (select json_agg(b order by code) from branches b) b, (select json_agg(s) from company_rental_settings s) s, (select json_agg(r.permissions order by name) from roles r) r`)).rows)
    expect(after).toBe(before)
    // Only one person with a four-eyes permission: missing, and the rule is not relaxed.
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'damage.unblock') where name = 'Yönetici'`)
    try {
      expect(((await adnan.get('/api/readiness')).json() as ReadinessResponse).checks.find((c) => c.key === 'damage_release')).toMatchObject({ state: 'missing', detail: expect.stringMatching(/^1 kişi/) })
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'damage.unblock') where name = 'Yönetici'`)
    }
    // Another company's owner sees its own company only.
    const l = (await lejla.get('/api/readiness')).json() as ReadinessResponse
    expect(l.checks.find((c) => c.key === 'rental_mode')!.state).toBe('decision_required')
  })
})

describe('evidence photo access grants', () => {
  it('POST grants (company, permission, scope), records once; GET needs the grant and records nothing; logout and permission removal end access', async () => {
    const v = await vehicle('M87-J-529')
    const d = (await adnan.post('/api/damages', { requestId: uuid(), vehicleId: v, branchId: ids.sjj, view: 'left', description: 'Sol kapı çizik', damageType: 'scratch', severity: 'minor', usability: 'usable' })).json() as DamageDetail
    const upRes = await adnan.upload(`/api/damages/${d.id}/photos`, jpeg)
    expect(upRes.statusCode, upRes.body).toBe(201)
    const up = upRes.json() as DamageDetail
    const url = up.photos[0]!.url
    expect(url).not.toMatch(/token|key|sig|\.jpg|foto/i)
    expect((await selma.get(url)).json().error.code).toBe('PHOTO_ACCESS_REQUIRED')
    expect(await auditCount('photo.access_granted', d.id)).toBe(0)
    const g = await selma.post('/api/photo-access', { kind: 'damage', id: d.id })
    expect(g.json()).toMatchObject({ photos: 1, reused: false })
    expect(await auditCount('photo.access_granted', d.id)).toBe(1)
    expect((await selma.post('/api/photo-access', { kind: 'damage', id: d.id })).json().reused).toBe(true)
    for (let i = 0; i < 3; i++) expect((await selma.get(url)).statusCode).toBe(200)
    expect(await auditCount('photo.access_granted', d.id)).toBe(1) // GETs never write history
    const summary = (await one(`select summary::text s from audit_log where action = 'photo.access_granted' and entity_id = $1`, [d.id])).s as string
    expect(summary).toMatch(/recordNo/)
    expect(summary).not.toMatch(/Ajla|Mirza|storage|\.webp/)
    // Another session of the same user has no grant; another company and an out-of-scope user cannot ask.
    const second = await login(EMAILS.selma)
    expect((await second.get(url)).statusCode).toBe(403)
    expect((await lejla.post('/api/photo-access', { kind: 'damage', id: d.id })).statusCode).toBe(404)
    expect((await lejla.get(url)).statusCode).toBe(404)
    // Permission removed: the grant no longer opens the photo.
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'damage.read') where name = 'Operasyon'`)
    try {
      expect((await selma.get(url)).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'damage.read') where name = 'Operasyon'`)
    }
    // Logout revokes the session's grants.
    expect((await selma.get(url)).statusCode).toBe(200)
    await selma.post('/api/auth/logout')
    selma = await login(EMAILS.selma)
    expect((await selma.get(url)).statusCode).toBe(403)
  })
})

describe('four-eyes release of a damage block', () => {
  it('request → a second person approves or rejects; the requester only cancels; the database refuses a lift without approval', async () => {
    const v = await vehicle('O58-E-467')
    let d = (await adnan.post('/api/damages', { requestId: uuid(), vehicleId: v, branchId: ids.sjj, view: 'front', description: 'Motor uyarı lambası', damageType: 'mechanical', severity: 'severe', usability: 'not_usable', blockReason: 'Motor arızası' })).json() as DamageDetail
    await expect(asOwner(data.companies.drina, `update damage_blocks set ended_at = now(), ended_by = started_by, end_reason = 'Doğrudan kaldırma' where damage_id = $1`, [d.id])).rejects.toThrow(/second person/)
    expect((await act(selma, `/api/damages/${d.id}/unblock-request`, d, { reason: 'Kontrol edildi', usability: 'usable' })).statusCode).toBe(403) // Operasyon
    d = (await act(adnan, `/api/damages/${d.id}/unblock-request`, d, { reason: 'Servis kontrol etti', usability: 'restricted' })).json()
    expect(d).toMatchObject({ blocked: true, releaseRequests: [{ status: 'requested', usability: 'restricted', requestedByName: 'Adnan Kovač' }] })
    expect((await act(adnan, `/api/damages/${d.id}/unblock-request`, d, { reason: 'İkinci talep', usability: 'usable' })).json().error.code).toBe('RELEASE_PENDING')
    let r = d.releaseRequests[0]!
    expect((await act(kontrol, `/api/damages/release-requests/${r.id}/reject`, r)).json().error.fields).toHaveProperty('note')
    d = (await act(kontrol, `/api/damages/release-requests/${r.id}/reject`, r, { note: 'Servis raporu eksik' })).json()
    expect(d).toMatchObject({ blocked: true, releaseRequests: [{ status: 'rejected', decisionNote: 'Servis raporu eksik', decidedByName: 'Kontrol Kullanıcı' }] })
    d = (await act(adnan, `/api/damages/${d.id}/unblock-request`, d, { reason: 'Rapor eklendi', usability: 'usable' })).json()
    r = d.releaseRequests.find((x) => x.status === 'requested')!
    expect((await act(kontrol, `/api/damages/release-requests/${r.id}/cancel`, r)).json().error.code).toBe('FOUR_EYES')
    d = (await act(adnan, `/api/damages/release-requests/${r.id}/cancel`, r)).json()
    expect(d.releaseRequests[0]!.status).toBe('cancelled')
    d = (await act(kontrol, `/api/damages/${d.id}/unblock-request`, d, { reason: 'Son kontrol tamam', usability: 'usable' })).json()
    r = d.releaseRequests.find((x) => x.status === 'requested')!
    d = (await act(adnan, `/api/damages/release-requests/${r.id}/approve`, r)).json()
    expect(d).toMatchObject({ blocked: false, usability: 'usable', blocks: [{ endReason: 'Son kontrol tamam', endedByName: 'Adnan Kovač' }] })
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['release_requested', 'release_rejected', 'release_cancelled', 'unblocked']))
    await expect(asOwner(data.companies.drina, `update damage_block_release_requests set status = 'requested' where id = $1`, [r.id])).rejects.toThrow(/cannot change/)
    await expect(asOwner(data.companies.drina, `delete from damage_block_release_requests where id = $1`, [r.id])).rejects.toThrow(/kept as history/)
  })
})

describe('FN5: correcting the responsible party', () => {
  async function rentalWithFile(plate: string) {
    const v = await vehicle(plate)
    const cls = (await one(`select class_id from vehicles where id = $1`, [v])).class_id
    let k = (await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: cls, vehicleId: v, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(40, '10:00'), returnLocal: local(41, '10:00'), requestId: uuid() })).json() as RentalDetail
    expect((await adnan.post(`/api/rentals/${k.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: uuid() })).statusCode).toBe(201)
    // The rental's customer is corrected afterwards; the finance file still names the old person.
    const upd = await adnan.put(`/api/rentals/${k.id}`, { version: k.version, customerId: ids.mirza, drivers: [{ customerId: ids.mirza, isPrimary: true }], vehicleClassId: cls, vehicleId: v, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(40, '10:00'), returnLocal: local(41, '10:00') })
    expect(upd.statusCode, upd.body).toBe(200)
    k = upd.json()
    return k
  }

  it('a file without movements: requested by one, applied by another finance authority; history kept; the database checks the same', async () => {
    const k = await rentalWithFile('M62-A-238')
    let f = (await adnan.get(`/api/rentals/${k.id}/finance`)).json() as RentalFinanceView
    expect(f.finance!.responsible).toMatchObject({ type: 'customer', name: 'Ajla Testović' })
    expect(f.correction).toEqual({ possible: true, blocker: null })
    await expect(asOwner(data.companies.drina, `update rental_finances set responsible_customer_id = $2 where id = $1`, [f.finance!.id, ids.mirza])).rejects.toThrow(/identity cannot change/)
    expect((await selma.post(`/api/rentals/${k.id}/finance/responsible-corrections`, { toType: 'customer', reason: 'Yanlış kişi', requestId: uuid() })).statusCode).toBe(403)
    f = (await adnan.post(`/api/rentals/${k.id}/finance/responsible-corrections`, { toType: 'customer', reason: 'Kiralama müşterisi düzeltildi', requestId: uuid() })).json()
    expect(f.responsibleCorrections[0]).toMatchObject({ status: 'requested', from: { name: 'Ajla Testović' }, to: { name: 'Mirza Uzorak' } })
    const c = f.responsibleCorrections[0]!
    expect((await act(adnan, `/api/finance/responsible-corrections/${c.id}/approve`, c)).json().error.code).toBe('FOUR_EYES')
    f = (await act(kontrol, `/api/finance/responsible-corrections/${c.id}/approve`, c)).json()
    expect(f.finance!.responsible).toMatchObject({ type: 'customer', name: 'Mirza Uzorak' })
    expect(f.responsibleCorrections[0]).toMatchObject({ status: 'applied', decidedByName: 'Kontrol Kullanıcı', from: { name: 'Ajla Testović' } })
    expect(f.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['responsible_correction_requested', 'responsible_corrected']))
    await expect(asOwner(data.companies.drina, `update finance_responsible_corrections set status = 'requested' where id = $1`, [c.id])).rejects.toThrow(/cannot change/)
  })

  it('a file with financial movements is never corrected in place (API and database); a pending request is stopped by a later movement', async () => {
    const k = await rentalWithFile('A84-O-352')
    let f = (await adnan.post(`/api/rentals/${k.id}/finance/responsible-corrections`, { toType: 'customer', reason: 'Yanlış kişi seçildi', requestId: uuid() })).json() as RentalFinanceView
    const c = f.responsibleCorrections[0]!
    expect((await adnan.post(`/api/rentals/${k.id}/finance/deposits`, { currency: 'EUR', amount: '50,00', received: true, method: 'cash', cashAck: true, requestId: uuid() })).statusCode).toBe(201)
    const late = await act(kontrol, `/api/finance/responsible-corrections/${c.id}/approve`, c)
    expect(late.json().error.code).toBe('FINANCE_CORRECTION_REVIEW')
    f = (await adnan.get(`/api/rentals/${k.id}/finance`)).json()
    expect(f.finance!.responsible.name).toBe('Ajla Testović')
    expect(f.correction).toEqual({ possible: false, blocker: 'has_movement' })
    await act(adnan, `/api/finance/responsible-corrections/${c.id}/cancel`, c)
    expect((await adnan.post(`/api/rentals/${k.id}/finance/responsible-corrections`, { toType: 'customer', reason: 'Yeniden deneme', requestId: uuid() })).json().error.code).toBe('FINANCE_CORRECTION_REVIEW')
    await expect(
      asOwner(data.companies.drina, `insert into finance_responsible_corrections (company_id, finance_id, from_type, from_customer_id, to_type, to_customer_id, reason, requested_by) select company_id, id, 'customer', responsible_customer_id, 'customer', $2, 'Doğrudan deneme', created_by from rental_finances where id = $1`, [f.finance!.id, ids.mirza]),
    ).rejects.toThrow(/financial movements/)
    // Deposits keep their file and payer: nothing moved.
    expect(Number((await one(`select count(*)::int n from finance_deposits where finance_id = $1`, [f.finance!.id])).n)).toBe(1)
  })
})

describe('repair transport evidence', () => {
  it('carrier and reference are required and kept; photos only on an open repair transport; staff-entered, not carrier-verified', async () => {
    const v = await vehicle('J27-K-615')
    const d = (await adnan.post('/api/damages', { requestId: uuid(), vehicleId: v, branchId: ids.sac, view: 'front', description: 'Motor çalışmıyor', damageType: 'mechanical', severity: 'severe', usability: 'not_usable', blockReason: 'Çalışmıyor' })).json() as DamageDetail
    const base = { requestId: uuid(), vehicleId: v, fromBranchId: ids.sac, toBranchId: ids.mst, reason: 'Onarım', plannedDepartureLocal: nowLocal(10), plannedArrivalLocal: nowLocal(200), purpose: 'repair', damageFileId: d.id, transportMethod: 'tow_truck' }
    const missing = await adnan.post('/api/transfers', base)
    expect(missing.json().error.fields).toMatchObject({ carrierName: expect.any(String), transportReference: expect.any(String) })
    await expect(
      asOwner(data.companies.drina, `insert into vehicle_transfers (company_id, transfer_no, vehicle_id, from_branch_id, to_branch_id, reason, planned_departure_at, planned_arrival_at, from_timezone, to_timezone, purpose, damage_file_id, transport_method)
        values ($1, 'T-999999', $2, $3, $4, 'Doğrudan', now(), now() + interval '2 hours', 'Europe/Sarajevo', 'Europe/Sarajevo', 'repair', $5, 'tow_truck')`, [data.companies.drina, v, ids.sac, ids.mst, d.id]),
    ).rejects.toThrow(/carrier/)
    const t = (await adnan.post('/api/transfers', { ...base, requestId: uuid(), carrierName: 'Sentetik Çekici d.o.o.', transportReference: 'CK-2026/101' })).json() as TransferDetail
    expect(t).toMatchObject({ carrierName: 'Sentetik Çekici d.o.o.', transportReference: 'CK-2026/101', photos: [] })
    const up = await adnan.upload(`/api/transfers/${t.id}/photos`, jpeg)
    expect(up.statusCode, up.body).toBe(201)
    expect((up.json() as TransferDetail).photos).toHaveLength(1)
    expect((await adnan.post('/api/photo-access', { kind: 'transfer', id: t.id })).statusCode).toBe(200)
    expect((await adnan.get((up.json() as TransferDetail).photos[0]!.url)).statusCode).toBe(200)
    await expect(asOwner(data.companies.drina, `update vehicle_transfers set carrier_name = 'Başka' where id = $1`, [t.id])).rejects.toThrow(/cannot change/)
    // A normal transfer has no evidence photos.
    const normal = (await adnan.post('/api/transfers', { requestId: uuid(), vehicleId: await vehicle('T09-A-781'), fromBranchId: ids.sac, toBranchId: ids.mst, reason: 'Normal', plannedDepartureLocal: local(50, '09:00'), plannedArrivalLocal: local(50, '12:00') })).json() as TransferDetail
    expect((await adnan.upload(`/api/transfers/${normal.id}/photos`, jpeg)).json().error.code).toBe('RECORD_CLOSED')
  })
})
