import { todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Rentals performance: thousands of synthetic rentals (acarvo_test only, synthetic customers and fleet).
// Every list request is one query plus one for the tab counts; the detail is a fixed number of queries.

const N = 5000
let data: DevData
let app: FastifyInstance
let adnan: Client
const timings: Record<string, number> = {}

beforeAll(async () => {
  data = await resetDatabase()
  const drina = data.companies.drina
  // Prepared rentals: each active vehicle gets back-to-back two-day windows far ahead (no overlaps, every guard runs).
  await asOwner(
    drina,
    `insert into rentals (company_id, rental_no, origin, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id,
       planned_pickup_at, planned_return_at, pickup_timezone, return_timezone)
     select $1, 'K-' || lpad((1000 + g)::text, 6, '0'), 'direct',
            (select id from customers where status = 'active' order by customer_no offset (g % 12) limit 1),
            v.class_id, v.id, v.home_branch_id, v.home_branch_id,
            now() + make_interval(days => (g / 12) * 2 + 400), now() + make_interval(days => (g / 12) * 2 + 401), 'Europe/Sarajevo', 'Europe/Sarajevo'
     from generate_series(1, ${N}) g
     join lateral (select id, class_id, home_branch_id from vehicles where status = 'active' and plate not in ('T75-E-410', 'O21-M-985', 'E92-K-301')
                   order by plate offset (g % 12) limit 1) v on true`,
    [drina],
  )
  // A third of them cancelled (lifecycle guard: prepared -> cancelled with a reason).
  await asOwner(drina, `update rentals set status = 'cancelled', cancel_reason = 'customer_request', cancelled_at = now() where rental_no >= 'K-001000' and (substr(rental_no, 3)::int % 3) = 0`)
  await asOwner(null, 'analyze rentals')
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
})
afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('rental timings (ms):', JSON.stringify(timings))
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

async function timed(label: string, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  await adnan.request(method, path, body)
  const start = performance.now()
  const res = await adnan.request(method, path, body)
  timings[label] = Math.round(performance.now() - start)
  expect(res.statusCode, label).toBe(200)
  return res.json()
}

describe(`${N} rentals`, () => {
  it('list views, search, filters, detail, availability and timeline stay fast', async () => {
    const first = await timed('active, first page', 'POST', '/api/rentals/search', {})
    expect(first.total).toBeGreaterThan(N / 2)
    await timed('all, page 30 of 100', 'POST', '/api/rentals/search', { view: 'all', pageSize: 100, page: 30 })
    await timed('overdue', 'POST', '/api/rentals/search', { view: 'overdue' })
    await timed('customer name', 'POST', '/api/rentals/search', { view: 'all', q: 'ajla testovic' })
    await timed('number', 'POST', '/api/rentals/search', { view: 'all', q: 'K-003500' })
    await timed('plate', 'POST', '/api/rentals/search', { view: 'all', q: 'A12-K' })
    const today = todayIn('Europe/Sarajevo')
    await timed('date range', 'POST', '/api/rentals/search', { view: 'all', from: today, to: today })
    const id = (await asOwner(data.companies.drina, `select id from rentals where rental_no = 'K-002000'`)).rows[0].id
    await timed('detail', 'GET', `/api/rentals/${id}`)
    const k1 = (await asOwner(data.companies.drina, `select id from rentals where rental_no = 'K-000001'`)).rows[0].id
    await timed('detail with photos', 'GET', `/api/rentals/${k1}`)
    const cls = (await asOwner(data.companies.drina, `select id from vehicle_classes where name = 'Orta'`)).rows[0].id
    const sjj = (await asOwner(data.companies.drina, `select id from branches where code = 'SJJ'`)).rows[0].id
    const day = new Date(Date.now() + 600 * 86_400_000).toISOString().slice(0, 10)
    await timed('availability', 'POST', '/api/rentals/availability', { vehicleClassId: cls, pickupBranchId: sjj, returnBranchId: sjj, pickupLocal: `${day}T10:00`, returnLocal: `${day}T18:00` })
    await timed('timeline 14 days', 'POST', '/api/reservations/timeline', { from: today, days: 14 })
    for (const [label, ms] of Object.entries(timings)) expect(ms, label).toBeLessThan(1500)
  })
})
