import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Maintenance, damage and transfer performance (acarvo_test only, synthetic data): 3,000 maintenance records (1,500
// planned holds, every one checked by the shared allocation guard on insert), 3,000 damage files with 1,000 ended
// block periods and 3,000 transfers. Lists, the vehicle view and the shared availability stay fast and correct.

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
  // Planned holds far in the future, one window per vehicle and row (no two overlap), and pending plans (no hold).
  await q(
    `insert into maintenance_records (company_id, maintenance_no, vehicle_id, branch_id, type, reason, status, planned_start_at, planned_end_at, timezone, created_by)
     select $1, 'B-' || lpad(g::text, 6, '0'), v.id, v.home_branch_id, (array['periodic','repair','tire','inspection'])[1 + g % 4], 'Sentetik bakım ' || g,
            case when g % 2 = 0 then 'planned' else 'pending_approval' end,
            now() + make_interval(days => 1000 + (g / 15) * 3), now() + make_interval(days => 1000 + (g / 15) * 3, hours => 8), 'Europe/Sarajevo', $2
     from generate_series(1, ${N}) g
     join lateral (select id, home_branch_id from vehicles x where status = 'active' and not exists (select 1 from rentals k where k.vehicle_id = x.id and k.status in ('prepared', 'delivered')) order by plate offset (g % 15) limit 1) v on true`,
    [drina, user],
  )
  await q(
    `insert into damage_files (company_id, damage_no, vehicle_id, branch_id, detected_at, timezone, view, description, damage_type, severity, usability, created_by)
     select $1, 'H-' || lpad(g::text, 6, '0'), v.id, v.home_branch_id, now() - make_interval(hours => g), 'Europe/Sarajevo', 'front', 'Sentetik bulgu ' || g,
            (array['scratch','dent','glass','tire'])[1 + g % 4], (array['minor','moderate','severe'])[1 + g % 3], 'usable', $2
     from generate_series(1, ${N}) g
     join lateral (select id, home_branch_id from vehicles x where status = 'active' and not exists (select 1 from rentals k where k.vehicle_id = x.id and k.status in ('prepared', 'delivered')) order by plate offset (g % 15) limit 1) v on true`,
    [drina, user],
  )
  await q(
    `insert into damage_blocks (company_id, damage_id, vehicle_id, started_at, started_by, start_reason)
     select company_id, id, vehicle_id, detected_at, $1, 'Sentetik engel' from damage_files where substr(damage_no, 3)::int % 3 = 0`,
    [user],
  )
  await q(`update damage_blocks set ended_at = started_at + interval '30 minutes', ended_by = $1, end_reason = 'Sentetik kaldırma'`, [user])
  await q(
    `insert into vehicle_transfers (company_id, transfer_no, vehicle_id, from_branch_id, to_branch_id, reason, planned_departure_at, planned_arrival_at, from_timezone, to_timezone, created_by)
     select $1, 'T-' || lpad(g::text, 6, '0'), v.id, v.home_branch_id, (select id from branches where id <> v.home_branch_id order by code limit 1), 'Sentetik transfer ' || g,
            now() + make_interval(days => 2000 + g), now() + make_interval(days => 2000 + g, hours => 5), 'Europe/Sarajevo', 'Europe/Sarajevo', $2
     from generate_series(1, ${N}) g
     join lateral (select id, home_branch_id from vehicles x where status = 'active' and not exists (select 1 from rentals k where k.vehicle_id = x.id and k.status in ('prepared', 'delivered')) order by plate offset (g % 15) limit 1) v on true`,
    [drina, user],
  )
  await asOwner(null, 'analyze maintenance_records, damage_files, damage_blocks, vehicle_transfers')
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

describe(`${N} records of each kind`, () => {
  it('lists, counts, the vehicle view and the shared availability stay fast and correct', async () => {
    const m = await timed('bakım listesi (tümü)', () => adnan.post('/api/maintenance/search', { view: 'all', pageSize: 100 }))
    expect(m.json().total).toBe(N)
    expect(m.json().counts).toMatchObject({ planned: N / 2, pending_approval: N / 2 })
    const plate = (await asOwner(data.companies.drina, `select plate from vehicles x where status = 'active' and not exists (select 1 from rentals k where k.vehicle_id = x.id and k.status in ('prepared', 'delivered')) order by plate limit 1`)).rows[0].plate as string
    expect((await timed('bakım arama (plaka)', () => adnan.post('/api/maintenance/search', { view: 'all', q: plate }))).json().total).toBeGreaterThan(0)
    const d = await timed('hasar listesi (tümü)', () => adnan.post('/api/damages/search', { view: 'all', pageSize: 100 }))
    expect(d.json().total).toBe(N)
    expect(d.json().counts.blocked).toBe(0)
    const t = await timed('transfer listesi (açık)', () => adnan.post('/api/transfers/search', { view: 'open', pageSize: 100 }))
    expect(t.json().total).toBe(N)
    const vehicleId = (await asOwner(data.companies.drina, `select id from vehicles where plate = $1`, [plate])).rows[0].id as string
    const ops = await timed('araç operasyon görünümü', () => adnan.get(`/api/vehicles/${vehicleId}/operations`))
    expect(ops.statusCode).toBe(200)
    const busy = await timed('vehicle_busy (tüm gelecek)', () => asOwner(data.companies.drina, `select count(*)::int n from vehicle_busy($1, $2, now(), null, null, null)`, [data.companies.drina, vehicleId]))
    expect(busy.rows[0].n).toBe(N / 30)
    const timeline = await timed('takvim (31 gün, bakım blokları)', () => adnan.post('/api/reservations/timeline', { from: new Date(Date.now() + 1000 * 86_400_000).toISOString().slice(0, 10), days: 31 }))
    expect(timeline.statusCode).toBe(200)
    expect(timeline.json().holdBars.length).toBeGreaterThan(0)
    console.log('[operations performance]', JSON.stringify(timings))
    for (const [k, ms] of Object.entries(timings)) expect(ms, k).toBeLessThan(2500)
  })
})
