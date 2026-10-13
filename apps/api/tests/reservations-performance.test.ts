import { todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Reservations performance: thousands of synthetic reservations (acarvo_test only). Every list request is one query.

const N = 6000
let data: DevData
let app: FastifyInstance
let adnan: Client
const timings: Record<string, number> = {}

beforeAll(async () => {
  data = await resetDatabase()
  const drina = data.companies.drina
  // Confirmed reservations: each active vehicle gets back-to-back two-day windows (no overlaps); the rest are pending.
  await asOwner(
    drina,
    `insert into reservations (company_id, reservation_no, status, source, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id,
       pickup_at, return_at, pickup_timezone, return_timezone, confirmed_at)
     select $1, 'R-' || lpad((1000 + g)::text, 6, '0'),
            case when g % 3 = 0 then 'confirmed' else 'pending' end, 'phone',
            (select id from customers where status = 'active' order by customer_no offset (g % 12) limit 1),
            v.class_id, case when g % 3 = 0 then v.id else null end, v.home_branch_id, v.home_branch_id,
            now() + make_interval(days => (g / 3 / 12) * 2 + 30),
            now() + make_interval(days => (g / 3 / 12) * 2 + 31), 'Europe/Sarajevo', 'Europe/Sarajevo',
            case when g % 3 = 0 then now() else null end
     from generate_series(1, ${N}) g
     join lateral (select id, class_id, home_branch_id from vehicles where status = 'active' order by plate offset ((g / 3) % 12) limit 1) v on true`,
    [drina],
  )
  await asOwner(null, 'analyze reservations')
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
})
afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('reservation timings (ms):', JSON.stringify(timings))
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

async function timed(label: string, path: string, body: Record<string, unknown>) {
  await adnan.post(path, body)
  const start = performance.now()
  const res = await adnan.post(path, body)
  timings[label] = Math.round(performance.now() - start)
  expect(res.statusCode, label).toBe(200)
  return res.json()
}

describe(`${N} reservations`, () => {
  it('list, search, date filter, availability and timeline stay fast', async () => {
    const first = await timed('first page', '/api/reservations/search', {})
    expect(first.total).toBeGreaterThan(N - 10)
    await timed('page 30 of 100', '/api/reservations/search', { pageSize: 100, page: 30 })
    await timed('customer name', '/api/reservations/search', { q: 'ajla testovic' })
    await timed('number', '/api/reservations/search', { q: 'R-003500' })
    const today = todayIn('Europe/Sarajevo')
    await timed('date range', '/api/reservations/search', { from: today, to: today })
    const cls = (await asOwner(data.companies.drina, `select id from vehicle_classes where name = 'Kompakt'`)).rows[0].id
    const sjj = (await asOwner(data.companies.drina, `select id from branches where code = 'SJJ'`)).rows[0].id
    const local = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
    await timed('availability', '/api/reservations/availability', { vehicleClassId: cls, pickupBranchId: sjj, returnBranchId: sjj, pickupLocal: `${local}T10:00`, returnLocal: `${local}T18:00` })
    await timed('timeline 14 days', '/api/reservations/timeline', { from: today, days: 14 })
    for (const [label, ms] of Object.entries(timings)) expect(ms, label).toBeLessThan(1500)
  })
})
