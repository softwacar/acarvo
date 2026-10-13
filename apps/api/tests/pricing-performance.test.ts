import { randomUUID } from 'node:crypto'
import { todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Pricing and contracts performance (acarvo_test only, synthetic data): many price lists and revisions, a list with
// 100 seasons and 50 extras, a 90-day quote, and a rental with many contract revisions. Requests stay well under budget.

let data: DevData
let app: FastifyInstance
let adnan: Client
const timings: Record<string, number> = {}
const ids: Record<string, string> = {}
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn('Europe/Sarajevo')}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`

async function timed(label: string, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, status = 200) {
  const start = performance.now()
  const res = await adnan.request(method, path, body)
  timings[label] = Math.round(performance.now() - start)
  expect(res.statusCode, label).toBe(status)
  return res.headers['content-type']?.toString().startsWith('application/json') ? res.json() : null
}

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  const one = async (q: string) => (await asOwner(data.companies.drina, q)).rows[0]
  ids.orta = (await one(`select id from vehicle_classes where name = 'Orta'`)).id
  ids.sjj = (await one(`select id from branches where code = 'SJJ'`)).id
  ids.ajla = (await one(`select id from customers where display_name = 'Ajla Testović'`)).id
  ids.passat = (await one(`select id from vehicles where plate = 'E16-T-093'`)).id
})
afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log('pricing timings (ms):', JSON.stringify(timings))
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

const base = () => ({
  currency: 'EUR',
  priority: 0,
  dayMethod: 'calendar_day',
  graceMinutes: 0,
  minDays: 1,
  taxMode: 'exclusive',
  taxRateBp: 1700,
  rates: [{ vehicleClassId: ids.orta, rate1to6: 5000, rate7to29: 4500, rate30plus: 4000 }],
  seasons: [] as unknown[],
  extras: [] as unknown[],
  discounts: [] as unknown[],
})

describe('pricing at volume', () => {
  it('200 lists, a heavy list with 20 revisions, preview and quote of 90 days, contracts with 30 revisions', async () => {
    for (let i = 0; i < 200; i++) expect((await adnan.post('/api/pricing/price-lists', { ...base(), name: `Liste ${i}` })).statusCode).toBe(201)
    const seasons = Array.from({ length: 100 }, (_, i) => ({ name: `Sezon ${i}`, startDate: local(i * 3, '00:00').slice(0, 10), endDate: local(i * 3 + 2, '00:00').slice(0, 10), percentBp: (i % 5) * 500, priority: i, active: true }))
    const extras = Array.from({ length: 50 }, (_, i) => ({ code: `EK${i}`, name: `Ek ${i}`, kind: 'standard', mode: i % 2 ? 'per_day' : 'per_rental', priceMinor: 100 + i, maxQuantity: 3, taxable: true, active: true }))
    let heavy = (await adnan.post('/api/pricing/price-lists', { ...base(), name: 'Ağır liste', priority: 10, seasons, extras })).json()
    heavy = (await adnan.post(`/api/pricing/price-lists/${heavy.id}/activate`, { version: 1 })).json()
    for (let r = 2; r <= 20; r++) heavy = (await adnan.put(`/api/pricing/price-lists/${heavy.id}`, { ...base(), name: 'Ağır liste', priority: 10, seasons, extras, version: heavy.version })).json()
    expect(heavy.revision).toBe(20)

    await timed('list 201 price lists', 'GET', '/api/pricing/price-lists')
    await timed('heavy list detail', 'GET', `/api/pricing/price-lists/${heavy.id}`)
    await timed('heavy list history (20 revisions)', 'GET', `/api/pricing/price-lists/${heavy.id}/history`)
    const selectedExtras = heavy.extras.slice(0, 20).map((x: { id: string }) => ({ extraId: x.id, quantity: 2 }))
    const preview = await timed('preview 90 days, 100 seasons, 20 extras', 'POST', '/api/pricing/preview', {
      priceListId: heavy.id,
      vehicleClassId: ids.orta,
      pickupBranchId: ids.sjj,
      returnBranchId: ids.sjj,
      pickupLocal: local(10, '10:00'),
      returnLocal: local(100, '10:00'),
      selectedExtras,
    })
    expect(preview.ok).toBe(true)

    const rental = (
      await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: ids.orta, vehicleId: ids.passat, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(10, '10:00'), returnLocal: local(100, '10:00'), requestId: randomUUID() })
    ).json()
    const p = await timed('rental quote preview', 'POST', `/api/rentals/${rental.id}/quotes/preview`, { selectedExtras })
    await timed('rental quote save', 'POST', `/api/rentals/${rental.id}/quotes`, { selectedExtras, requestId: randomUUID(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor }, 201)

    const t = (await adnan.post('/api/settings/contract-templates', { name: 'Perf', language: 'tr', fromSample: true })).json()
    const tv = (await adnan.post(`/api/settings/contract-templates/${t.id}/activate`, { version: t.versions[0].version })).json().versions[0].id
    let c = await timed('contract draft with PDF', 'POST', `/api/rentals/${rental.id}/contracts`, { templateVersionId: tv, requestId: randomUUID() }, 201)
    for (let i = 0; i < 29; i++) c = (await adnan.post(`/api/contracts/${c.id}/revise`, { version: c.version, templateVersionId: tv, requestId: randomUUID() })).json()
    expect(c.revision).toBe(30)
    await timed('rental contracts (30 revisions)', 'GET', `/api/rentals/${rental.id}/contracts`)
    await timed('contract detail', 'GET', `/api/contracts/${c.id}`)
    const grant = await timed('contract PDF access (POST)', 'POST', `/api/contracts/${c.id}/access`, { mode: 'download' })
    await timed('contract PDF', 'GET', grant.url)
    await timed('rental detail with gates', 'GET', `/api/rentals/${rental.id}`)

    for (const [label, ms] of Object.entries(timings)) expect(ms, label).toBeLessThan(label.includes('PDF') || label.includes('draft') ? 1500 : 600)
  }, 240_000)
})
