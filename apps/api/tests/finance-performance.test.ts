import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Finance performance (acarvo_test only, synthetic data): 3,000 rentals with finance files, 3,000 lines, 9,000
// payments, 3,000 deposits and 1,500 returns, in two currencies. Every database rule runs on these inserts.

const N = 3000
let data: DevData
let app: FastifyInstance
let adnan: Client
const timings: Record<string, number> = {}

beforeAll(async () => {
  data = await resetDatabase()
  const drina = data.companies.drina
  const q = (text: string, values: unknown[] = []) => asOwner(drina, text, values)
  const users = (await asOwner(null, `select id from users order by email`)).rows.map((r) => r.id as string)
  const [u1, u2] = [users[0], users[1]]
  await q(
    `insert into rentals (company_id, rental_no, origin, customer_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id,
       planned_pickup_at, planned_return_at, pickup_timezone, return_timezone)
     select $1, 'K-' || lpad((5000 + g)::text, 6, '0'), 'direct',
            (select id from customers where status = 'active' order by customer_no offset (g % 12) limit 1),
            v.class_id, v.id, v.home_branch_id, v.home_branch_id,
            now() + make_interval(days => (g / 12) * 2 + 400), now() + make_interval(days => (g / 12) * 2 + 401), 'Europe/Sarajevo', 'Europe/Sarajevo'
     from generate_series(1, ${N}) g
     join lateral (select id, class_id, home_branch_id from vehicles where status = 'active' order by plate offset (g % 12) limit 1) v on true`,
    [drina],
  )
  await q(
    `insert into rental_finances (company_id, rental_id, currency, responsible_type, responsible_customer_id, created_by)
     select company_id, id, case when (substr(rental_no, 3)::int % 2) = 0 then 'EUR' else 'BAM' end, 'customer', customer_id, $1 from rentals where rental_no >= 'K-005001'`,
    [u1],
  )
  await q(
    `insert into finance_charges (company_id, finance_id, charge_no, kind, description, currency, amount_minor, net_minor, tax_status, reason, client_request_id, created_by)
     select company_id, id, 'H-' || lpad(row_number() over (order by id)::text, 6, '0'), 'manual', 'Sentetik kalem', currency, 30000, 30000, 'not_configured', 'Performans ölçümü', gen_random_uuid(), $1 from rental_finances`,
    [u1],
  )
  await q(
    `insert into finance_payments (company_id, finance_id, payment_no, method, currency, amount_minor, payer_type, payer_customer_id, received_at, branch_id, cash_ack, client_request_id, created_by)
     select f.company_id, f.id, 'T-' || lpad((row_number() over (order by f.id, s))::text, 6, '0'), 'cash', f.currency, 10000, 'customer', f.responsible_customer_id, now() - make_interval(hours => s),
            k.pickup_branch_id, true, gen_random_uuid(), $1
     from rental_finances f join rentals k on k.company_id = f.company_id and k.id = f.rental_id cross join generate_series(1, 3) s`,
    [u1],
  )
  await q(`update finance_payments set status = 'verified', verified_at = now(), verified_by = $1, version = 2 where (substr(payment_no, 3)::int % 3) <> 0`, [u2])
  await q(
    `insert into finance_deposits (company_id, finance_id, deposit_no, currency, amount_minor, method, cash_ack, branch_id, status, reported_at, reported_by, client_request_id, created_by)
     select f.company_id, f.id, 'D-' || lpad(row_number() over (order by f.id)::text, 6, '0'), 'EUR', 20000, 'cash', true, k.pickup_branch_id, 'reported', now(), $1, gen_random_uuid(), $1
     from rental_finances f join rentals k on k.company_id = f.company_id and k.id = f.rental_id`,
    [u1],
  )
  await q(`update finance_deposits set status = 'verified', verified_at = now(), verified_by = $1, version = 2`, [u2])
  await q(
    `insert into finance_deposit_refunds (company_id, deposit_id, refund_no, currency, amount_minor, method, reason, client_request_id, created_by)
     select company_id, id, 'DI-' || lpad(row_number() over (order by id)::text, 6, '0'), currency, 5000, 'cash', 'Kısmi iade', gen_random_uuid(), $1 from finance_deposits where (substr(deposit_no, 3)::int % 2) = 0`,
    [u1],
  )
  await q(`insert into finance_events (company_id, finance_id, entity_type, entity_id, kind, to_status, amount_minor, currency, actor_user_id) select company_id, finance_id, 'payment', id, 'payment_recorded', 'recorded', amount_minor, currency, created_by from finance_payments`)
  await asOwner(null, 'analyze rentals, rental_finances, finance_charges, finance_payments, finance_deposits, finance_deposit_refunds, finance_events')
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
}, 240_000)
afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('finance timings (ms):', JSON.stringify(timings))
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

async function timed(label: string, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  await adnan.request(method, path, body)
  const start = performance.now()
  const res = await adnan.request(method, path, body)
  timings[label] = Math.round(performance.now() - start)
  expect(res.statusCode, `${label}: ${res.body}`).toBe(200)
  return res.json()
}

describe(`${N} finance files`, () => {
  it('lists, pending queue, summary, files, events, rental view and customer statement stay fast and correct', async () => {
    const first = await timed('payments, first page', 'POST', '/api/finance/payments/search', {})
    expect(first.total).toBe(N * 3)
    await timed('payments, page 100, EUR, by amount', 'POST', '/api/finance/payments/search', { currency: 'EUR', sort: 'amount_desc', page: 100 })
    await timed('payments, search by rental no', 'POST', '/api/finance/payments/search', { q: 'K-005777' })
    await timed('deposits, first page', 'POST', '/api/finance/deposits/search', {})
    await timed('refunds, first page', 'POST', '/api/finance/refunds/search', {})
    const pending = await timed('pending queue', 'GET', '/api/finance/pending')
    expect(pending.payments.length).toBe(200)
    const summary = await timed('summary per currency', 'POST', '/api/finance/summary', {})
    expect(summary.rows.map((r: { currency: string }) => r.currency)).toEqual(['BAM', 'EUR'])
    const eur = summary.rows.find((r: { currency: string }) => r.currency === 'EUR')
    // Verified payments: 2 of 3 per file; per currency half of the files (amounts never mixed).
    expect(eur.depositsHeldMinor).toBe(N * 20000)
    await timed('files, first page', 'POST', '/api/finance/files/search', {})
    await timed('events, first page', 'POST', '/api/finance/events/search', {})
    const rental = (await asOwner(data.companies.drina, `select id, customer_id from rentals where rental_no = 'K-005777'`)).rows[0]
    const view = await timed('rental finance view', 'GET', `/api/rentals/${rental.id}/finance`)
    expect(view.payments).toHaveLength(3)
    await timed('customer statement (250 files)', 'GET', `/api/customers/${rental.customer_id}/finance`)
    for (const [label, ms] of Object.entries(timings)) expect(ms, label).toBeLessThan(3000)
  }, 240_000)
})
