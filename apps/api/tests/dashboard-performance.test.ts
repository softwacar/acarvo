import type { DashboardResponse } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Dashboard performance (acarvo_test only, synthetic data): 3,000 pending reservations, 3,000 maintenance records
// (1,500 planned holds), 3,000 damage files with 1,000 open blocks and 3,000 transfer requests. The dashboard and the
// readiness view are a fixed number of set-based queries, so they stay fast whatever the volume.

const N = 3000
let data: DevData
let app: FastifyInstance
let adnan: Client
const timings: Record<string, number> = {}

beforeAll(async () => {
  data = await resetDatabase()
  const drina = data.companies.drina
  const q = (text: string, values: unknown[] = []) => asOwner(drina, text, values)
  const user = (await asOwner(null, `select id from users where email = $1`, [EMAILS.adnan])).rows[0].id
  const free = `(select id, home_branch_id, class_id from vehicles x where status = 'active' and not exists (select 1 from rentals k where k.vehicle_id = x.id and k.status in ('prepared', 'delivered')) order by plate offset (g % 15) limit 1)`
  await q(
    `insert into reservations (company_id, reservation_no, status, source, customer_id, vehicle_class_id, pickup_branch_id, return_branch_id, pickup_at, return_at, pickup_timezone, return_timezone, created_by)
     select $1, 'R-' || lpad((5000 + g)::text, 6, '0'), 'pending', 'phone', (select id from customers where status = 'active' order by customer_no offset (g % 10) limit 1),
            v.class_id, v.home_branch_id, v.home_branch_id, now() + make_interval(hours => g), now() + make_interval(hours => g + 30), 'Europe/Sarajevo', 'Europe/Sarajevo', $2
     from generate_series(1, ${N}) g join lateral ${free} v on true`,
    [drina, user],
  )
  await q(
    `insert into maintenance_records (company_id, maintenance_no, vehicle_id, branch_id, type, reason, status, planned_start_at, planned_end_at, timezone, created_by)
     select $1, 'B-' || lpad(g::text, 6, '0'), v.id, v.home_branch_id, 'periodic', 'Sentetik ' || g, case when g % 2 = 0 then 'planned' else 'pending_approval' end,
            now() + make_interval(days => 1000 + (g / 15) * 3), now() + make_interval(days => 1000 + (g / 15) * 3, hours => 8), 'Europe/Sarajevo', $2
     from generate_series(1, ${N}) g join lateral ${free} v on true`,
    [drina, user],
  )
  await q(
    `insert into damage_files (company_id, damage_no, vehicle_id, branch_id, detected_at, timezone, view, description, damage_type, severity, usability, created_by)
     select $1, 'H-' || lpad(g::text, 6, '0'), v.id, v.home_branch_id, now() - make_interval(hours => g), 'Europe/Sarajevo', 'front', 'Sentetik bulgu ' || g, 'scratch', 'minor', 'usable', $2
     from generate_series(1, ${N}) g join lateral ${free} v on true`,
    [drina, user],
  )
  await q(`insert into damage_blocks (company_id, damage_id, vehicle_id, started_at, started_by, start_reason) select company_id, id, vehicle_id, now(), $1, 'Sentetik engel' from damage_files where substr(damage_no, 3)::int % 3 = 0`, [user])
  await q(
    `insert into vehicle_transfers (company_id, transfer_no, vehicle_id, from_branch_id, to_branch_id, reason, planned_departure_at, planned_arrival_at, from_timezone, to_timezone, created_by)
     select $1, 'T-' || lpad(g::text, 6, '0'), v.id, v.home_branch_id, (select id from branches where id <> v.home_branch_id order by code limit 1), 'Sentetik ' || g,
            now() + make_interval(days => 2000 + g), now() + make_interval(days => 2000 + g, hours => 5), 'Europe/Sarajevo', 'Europe/Sarajevo', $2
     from generate_series(1, ${N}) g join lateral ${free} v on true`,
    [drina, user],
  )
  await asOwner(null, 'analyze reservations, maintenance_records, damage_files, damage_blocks, vehicle_transfers')
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
}, 600_000)
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

async function timed<T>(label: string, fn: () => Promise<T>) {
  const t = performance.now()
  const out = await fn()
  timings[label] = Math.round(performance.now() - t)
  return out
}

describe(`dashboard with ${N} records of each kind`, () => {
  it('stays fast and its counts match the database', async () => {
    await adnan.get('/api/dashboard') // warm-up (first query plans)
    const res = await timed('dashboard (tüm şirket)', () => adnan.get('/api/dashboard'))
    expect(res.statusCode).toBe(200)
    const d = res.json() as DashboardResponse
    expect(d.counts.pendingReservations).toBe(N + Number((await asOwner(data.companies.drina, `select count(*)::int n from reservations where status = 'pending' and reservation_no < 'R-005001'`)).rows[0].n))
    expect(d.counts.maintenancePendingApproval).toBe(N / 2)
    expect(d.counts.releasesPending).toBe(0)
    expect(d.counts.blockedVehicles).toBe(5) // every third file, on vehicles g % 15 → 5 distinct vehicles
    expect(d.attention.length).toBeLessThanOrEqual(36)
    const sjj = (await asOwner(data.companies.drina, `select id from branches where code = 'SJJ'`)).rows[0].id
    expect((await timed('dashboard (tek şube)', () => adnan.get(`/api/dashboard?branchId=${sjj}`))).statusCode).toBe(200)
    expect((await timed('hazırlık', () => adnan.get('/api/readiness'))).statusCode).toBe(200)
    console.log('[dashboard performance]', JSON.stringify(timings))
    for (const [k, ms] of Object.entries(timings)) expect(ms, k).toBeLessThan(2500)
  })
})
