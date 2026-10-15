import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { type ContractDetail, type PriceListDetail, type PriceQuote, type PricingResult, type RentalDetail, todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Pricing and contracts V1 (docs/FIYATLANDIRMA_SOZLESME_PLANI.md): price lists with immutable revisions, server-side
// quotes for reservations and rentals, contract templates and contract drafts with a draft PDF. acarvo_test only,
// synthetic data. No payment, invoice, debt or signature exists anywhere.

let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip
let selma: Client // Drina Operasyon, SJJ only
let lejla: Client // Neretva Sahip
const ids: Record<string, string> = {}
const uuid = () => randomUUID()
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn('Europe/Sarajevo')}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
async function login(email: string) {
  const c = new Client(app)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}

const listBody = (over: Record<string, unknown> = {}) => ({
  name: 'Standart EUR',
  currency: 'EUR',
  branchId: null,
  validFrom: null,
  validUntil: null,
  priority: 0,
  dayMethod: 'rolling_24h',
  graceMinutes: 59,
  minDays: 1,
  taxMode: 'exclusive',
  taxRateBp: 1700,
  taxLabel: 'PDV',
  note: null,
  rates: [{ vehicleClassId: ids.orta, rate1to6: 5000, rate7to29: 4500, rate30plus: null }],
  seasons: [],
  extras: [
    { code: 'GPS', name: 'Navigasyon', kind: 'standard', mode: 'per_day', priceMinor: 500, maxQuantity: 1, taxable: true, active: true },
    { code: 'EK-SURUCU', name: 'Ek sürücü', kind: 'additional_driver', mode: 'per_rental', priceMinor: 1500, maxQuantity: 5, taxable: true, active: true },
  ],
  discounts: [{ name: 'Uzun kiralama', type: 'percent', value: 1000, minDays: 7, active: true }],
  ...over,
})

let list: PriceListDetail
let reservationId: string
let rental: RentalDetail
let logs = ''

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (chunk, _e, done) => ((logs += chunk.toString()), done()) }) })
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  ids.sjj = (await one(`select id from branches where code = 'SJJ'`)).id
  ids.sac = (await one(`select id from branches where code = 'SAC'`)).id
  ids.orta = (await one(`select id from vehicle_classes where name = 'Orta'`)).id
  ids.kompakt = (await one(`select id from vehicle_classes where name = 'Kompakt'`)).id
  ids.passat = (await one(`select id from vehicles where plate = 'E16-T-093'`)).id
  ids.ajla = (await one(`select id from customers where display_name = 'Ajla Testović'`)).id
  ids.mirza = (await one(`select id from customers where display_name = 'Mirza Uzorak'`)).id
  ids.nClass = (await one(`select id from vehicle_classes where name = 'Ekonomi'`, [], data.companies.neretva)).id
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('price lists', () => {
  it('validates the document: currency, tax rate, duplicate classes, unknown class', async () => {
    let res = await adnan.post('/api/pricing/price-lists', listBody({ currency: 'XYZ' }))
    expect(res.statusCode).toBe(400)
    expect(res.json().error.fields.currency).toBeTruthy()
    res = await adnan.post('/api/pricing/price-lists', listBody({ taxRateBp: null }))
    expect(res.json().error.fields.taxRateBp).toBe('Vergi oranını girin')
    res = await adnan.post('/api/pricing/price-lists', listBody({ rates: [listBody().rates[0], listBody().rates[0]] }))
    expect(res.statusCode).toBe(400)
    res = await adnan.post('/api/pricing/price-lists', listBody({ rates: [{ vehicleClassId: ids.nClass, rate1to6: 100, rate7to29: null, rate30plus: null }] }))
    expect(res.statusCode).toBe(400)
    expect(res.json().error.fields.rates).toBe('Araç sınıfı bulunamadı')
  })

  it('creates a draft list (revision 1), activates it; only managers may change prices', async () => {
    const res = await adnan.post('/api/pricing/price-lists', listBody())
    expect(res.statusCode, res.body).toBe(201)
    list = res.json()
    expect(list).toMatchObject({ status: 'draft', revision: 1, version: 1, currency: 'EUR', taxMode: 'exclusive', taxRateBp: 1700 })
    expect(list.rates[0]).toMatchObject({ rate1to6: 5000, rate7to29: 4500, rate30plus: null })
    expect((await selma.post('/api/pricing/price-lists', listBody())).statusCode).toBe(403)
    expect((await selma.post(`/api/pricing/price-lists/${list.id}/activate`, { version: 1 })).statusCode).toBe(403)
    expect((await selma.get(`/api/pricing/price-lists/${list.id}`)).statusCode).toBe(200)
    const act = await adnan.post(`/api/pricing/price-lists/${list.id}/activate`, { version: 1 })
    expect(act.statusCode, act.body).toBe(200)
    list = act.json()
    expect(list).toMatchObject({ status: 'active', version: 2 })
  })

  it('an empty list cannot be activated (database rule)', async () => {
    const res = await adnan.post('/api/pricing/price-lists', listBody({ name: 'Boş', rates: [] }))
    expect(res.statusCode).toBe(201)
    const act = await adnan.post(`/api/pricing/price-lists/${res.json().id}/activate`, { version: 1 })
    expect(act.statusCode).toBe(409)
    expect(act.json().error.code).toBe('RATES_REQUIRED')
    await adnan.post(`/api/pricing/price-lists/${res.json().id}/archive`, { version: 1 })
  })

  it('is invisible to another company', async () => {
    expect((await lejla.get(`/api/pricing/price-lists/${list.id}`)).statusCode).toBe(404)
    expect((await lejla.get('/api/pricing/price-lists')).json().items).toEqual([])
    const rows = await asApp(data.companies.neretva, async (c) => (await c.query('select id from price_lists')).rows)
    expect(rows).toEqual([])
  })

  it('preview computes on the server: days, tier, extras, tax, explained lines', async () => {
    const res = await adnan.post('/api/pricing/preview', {
      priceListId: list.id,
      vehicleClassId: ids.orta,
      pickupBranchId: ids.sjj,
      returnBranchId: ids.sjj,
      pickupLocal: local(30, '10:00'),
      returnLocal: local(32, '10:30'),
      selectedExtras: [{ extraId: list.extras.find((e) => e.code === 'GPS')!.id, quantity: 1 }],
      additionalDrivers: 1,
    })
    expect(res.statusCode, res.body).toBe(200)
    const r = res.json() as PricingResult
    // 2 days + 30 min is within the 59-minute grace: 2 days. 2×50 + 2×5 GPS + 15 additional driver = 125 net; 17 % tax.
    expect(r).toMatchObject({ ok: true, days: 2, tier: '1-6', currency: 'EUR', netMinor: 12500, taxMinor: 2125, grossMinor: 14625, taxStatus: 'complete' })
    expect(r.lines.map((l) => l.kind)).toEqual(['base', 'extra', 'additional_driver', 'tax'])
    expect(r.priceList).toMatchObject({ id: list.id, revision: 1 })
    expect(JSON.stringify(r)).not.toContain('engineInput')
  })

  it('saves as a new revision (version-checked); currency cannot change; history keeps every revision', async () => {
    const stale = await adnan.put(`/api/pricing/price-lists/${list.id}`, { ...listBody(), version: 1 })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('VERSION_CONFLICT')
    const cur = await adnan.put(`/api/pricing/price-lists/${list.id}`, { ...listBody({ currency: 'BAM' }), version: list.version })
    expect(cur.json().error.fields.currency).toBeTruthy()
    expect((await selma.put(`/api/pricing/price-lists/${list.id}`, { ...listBody(), version: list.version })).statusCode).toBe(403)
    const hist = await adnan.get(`/api/pricing/price-lists/${list.id}/history`)
    expect(hist.json().revisions).toHaveLength(1)
  })

  it('revisions and their rates cannot be edited afterwards (database)', async () => {
    await expect(asOwner(data.companies.drina, `update price_list_rates set rate_1_6_minor = 1 where price_list_id = $1`, [list.id])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `delete from price_list_revisions where price_list_id = $1`, [list.id])).rejects.toThrow()
    // Parts can only be added together with their revision, not later.
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into price_list_extras (company_id, price_list_id, revision, code, name, kind, mode, price_minor, max_quantity, taxable, active) values ($1, $2, 1, 'SONRA', 'Sonradan', 'standard', 'per_day', 1, 1, true, true)`, [data.companies.drina, list.id]),
      ),
    ).rejects.toThrow()
  })
})

describe('reservation quotes', () => {
  it('a reservation without any active list says "not calculated" (Neretva)', async () => {
    const nb = (await one(`select id from branches where code = 'MOC'`, [], data.companies.neretva)).id
    const dino = (await one(`select id from customers where display_name = 'Dino Neretvić'`, [], data.companies.neretva)).id
    const res = await lejla.post('/api/reservations', { customerId: dino, vehicleClassId: ids.nClass, pickupBranchId: nb, returnBranchId: nb, pickupLocal: local(20, '10:00'), returnLocal: local(22, '10:00'), source: 'phone' })
    expect(res.statusCode, res.body).toBe(201)
    const p = await lejla.post(`/api/reservations/${res.json().id}/quotes/preview`, {})
    expect(p.statusCode).toBe(200)
    expect(p.json()).toMatchObject({ ok: false, unavailable: { reason: 'no_price_list' }, priceList: null })
    const save = await lejla.post(`/api/reservations/${res.json().id}/quotes`, { requestId: uuid(), expectedNetMinor: 0, expectedGrossMinor: null, selectedExtras: [] })
    expect(save.statusCode).toBe(409)
    expect(save.json().error.code).toBe('PRICING_UNAVAILABLE')
    expect((await asOwner(data.companies.neretva, 'select count(*)::int n from price_quotes')).rows[0].n).toBe(0)
  })

  it('previews and saves a quote; idempotent; a changed price is refused with the new result', async () => {
    const res = await adnan.post('/api/reservations', { customerId: ids.mirza, vehicleClassId: ids.orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(40, '10:00'), returnLocal: local(43, '10:00'), source: 'phone' })
    expect(res.statusCode, res.body).toBe(201)
    reservationId = res.json().id
    const p = (await adnan.post(`/api/reservations/${reservationId}/quotes/preview`, {})).json() as PricingResult
    expect(p).toMatchObject({ ok: true, days: 3, netMinor: 15000, taxMinor: 2550, grossMinor: 17550 })
    const wrong = await adnan.post(`/api/reservations/${reservationId}/quotes`, { requestId: uuid(), expectedNetMinor: 14000, expectedGrossMinor: 16380, selectedExtras: [] })
    expect(wrong.statusCode).toBe(409)
    expect(wrong.json().error.code).toBe('PRICE_CHANGED')
    expect(wrong.json().error.details.result.netMinor).toBe(15000)
    const requestId = uuid()
    const body = { requestId, expectedNetMinor: 15000, expectedGrossMinor: 17550, selectedExtras: [] }
    const first = await adnan.post(`/api/reservations/${reservationId}/quotes`, body)
    expect(first.statusCode, first.body).toBe(201)
    const q = first.json() as PriceQuote
    expect(q).toMatchObject({ status: 'quoted', currency: 'EUR', days: 3, netMinor: 15000, grossMinor: 17550, priceList: { id: list.id, revision: 1 }, target: { kind: 'reservation' } })
    expect(q.quoteNo).toMatch(/^Q-\d{6}$/)
    const again = await adnan.post(`/api/reservations/${reservationId}/quotes`, body)
    expect(again.statusCode).toBe(200)
    expect(again.json().id).toBe(q.id)
    expect((await asOwner(data.companies.drina, 'select count(*)::int n from price_quotes')).rows[0].n).toBe(1)
  })

  it('a new quote supersedes the previous one; a list revision never changes saved quotes', async () => {
    // Raise the price: revision 2. The saved quote keeps revision 1 and its lines.
    const rev = await adnan.put(`/api/pricing/price-lists/${list.id}`, { ...listBody({ rates: [{ vehicleClassId: ids.orta, rate1to6: 6000, rate7to29: 5000, rate30plus: null }] }), version: list.version })
    expect(rev.statusCode, rev.body).toBe(200)
    list = rev.json()
    expect(list).toMatchObject({ revision: 2, status: 'active' })
    const items = (await adnan.get(`/api/reservations/${reservationId}/quotes`)).json().items as PriceQuote[]
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ netMinor: 15000, priceList: { revision: 1 } })
    // The user still sees the old total: the server refuses it.
    const stale = await adnan.post(`/api/reservations/${reservationId}/quotes`, { requestId: uuid(), expectedNetMinor: 15000, expectedGrossMinor: 17550, selectedExtras: [] })
    expect(stale.json().error.code).toBe('PRICE_CHANGED')
    const gps = list.extras.find((e) => e.code === 'GPS')!.id
    const next = await adnan.post(`/api/reservations/${reservationId}/quotes`, { requestId: uuid(), expectedNetMinor: 19500, expectedGrossMinor: 22815, selectedExtras: [{ extraId: gps, quantity: 1 }] })
    expect(next.statusCode, next.body).toBe(201)
    expect(next.json().priceList.revision).toBe(2)
    const all = (await adnan.get(`/api/reservations/${reservationId}/quotes`)).json().items as PriceQuote[]
    expect(all.map((x) => x.status)).toEqual(['quoted', 'superseded'])
    expect(all[1].supersededAt).toBeTruthy()
    const history = (await adnan.get(`/api/pricing/price-lists/${list.id}/history`)).json()
    expect(history.revisions.map((r: { revision: number; counts: { quotes: number } }) => [r.revision, r.counts.quotes])).toEqual([
      [2, 1],
      [1, 1],
    ])
  })

  it('a plan change makes the saved quote outdated (shown, never silently recomputed)', async () => {
    const res = await adnan.post('/api/reservations', { customerId: ids.mirza, vehicleClassId: ids.orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(60, '10:00'), returnLocal: local(62, '10:00'), source: 'phone' })
    const r = res.json()
    const p = (await adnan.post(`/api/reservations/${r.id}/quotes/preview`, {})).json() as PricingResult
    expect((await adnan.post(`/api/reservations/${r.id}/quotes`, { requestId: uuid(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor, selectedExtras: [] })).statusCode).toBe(201)
    const moved = await adnan.put(`/api/reservations/${r.id}`, {
      customerId: ids.mirza,
      vehicleClassId: ids.orta,
      pickupBranchId: ids.sjj,
      returnBranchId: ids.sjj,
      pickupLocal: local(60, '10:00'),
      returnLocal: local(63, '10:00'),
      source: 'phone',
      version: r.version,
      changeReason: 'customer_request',
    })
    expect(moved.statusCode, moved.body).toBe(200)
    const [q] = (await adnan.get(`/api/reservations/${r.id}/quotes`)).json().items as PriceQuote[]
    expect(q).toMatchObject({ status: 'quoted', matchesPlan: false, days: 2, netMinor: p.netMinor })
  })

  it('quotes are immutable and never become payments (database)', async () => {
    await expect(asOwner(data.companies.drina, `update price_quotes set net_minor = 1 where reservation_id = $1`, [reservationId])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `delete from price_quotes where reservation_id = $1`, [reservationId])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `update price_quotes set status = 'quoted', superseded_at = null where status = 'superseded'`)).rejects.toThrow()
    const cols = (await ownerPool.query(`select column_name from information_schema.columns where table_name = 'price_quotes'`)).rows.map((r) => r.column_name as string)
    expect(cols.filter((c) => /paid|payment|invoice|debt|balance|deposit/.test(c))).toEqual([])
  })

  it('a quote must match the reservation plan and class (database)', async () => {
    const q = (await one(`select * from price_quotes where reservation_id = $1 and status = 'quoted'`, [reservationId])) as Record<string, unknown>
    await expect(
      asOwner(
        data.companies.drina,
        `insert into price_quotes (company_id, quote_no, reservation_id, price_list_id, price_list_revision, currency, vehicle_class_id, pickup_at, return_at, pickup_timezone, days, tier, day_method, inputs, lines, net_minor, tax_minor, gross_minor, tax_status, engine_version, client_request_id)
         select company_id, 'Q-999999', reservation_id, price_list_id, price_list_revision, currency, $2, pickup_at, return_at, pickup_timezone, days, tier, day_method, inputs, lines, net_minor, tax_minor, gross_minor, tax_status, engine_version, gen_random_uuid() from price_quotes where id = $1`,
        [q.id, ids.kompakt],
      ),
    ).rejects.toThrow()
  })

  it('branch scope: Operasyon (SJJ) cannot quote a reservation of another branch', async () => {
    const res = await adnan.post('/api/reservations', { customerId: ids.mirza, vehicleClassId: ids.orta, pickupBranchId: ids.sac, returnBranchId: ids.sac, pickupLocal: local(50, '10:00'), returnLocal: local(52, '10:00'), source: 'phone' })
    expect(res.statusCode).toBe(201)
    expect((await selma.post(`/api/reservations/${res.json().id}/quotes/preview`, {})).statusCode).toBe(404)
    expect((await lejla.get(`/api/reservations/${reservationId}/quotes`)).statusCode).toBe(404)
  })

  it('without a configured tax the gross total is not calculated, never guessed', async () => {
    const res = await adnan.post('/api/pricing/price-lists', listBody({ name: 'Vergisiz SAC', branchId: ids.sac, priority: 5, taxMode: 'not_configured', taxRateBp: null, taxLabel: null }))
    expect(res.statusCode, res.body).toBe(201)
    const nl = res.json() as PriceListDetail
    await adnan.post(`/api/pricing/price-lists/${nl.id}/activate`, { version: 1 })
    const p = (
      await adnan.post('/api/pricing/preview', { priceListId: nl.id, vehicleClassId: ids.orta, pickupBranchId: ids.sac, returnBranchId: ids.sac, pickupLocal: local(30, '10:00'), returnLocal: local(31, '10:00'), selectedExtras: [] })
    ).json() as PricingResult
    expect(p).toMatchObject({ ok: true, netMinor: 5000, taxMinor: null, grossMinor: null, taxStatus: 'not_configured' })
  })
})

describe('integration review: decisions and concurrency', () => {
  it('F1: a price list without a chosen day method is refused; nothing is preselected', async () => {
    const { dayMethod, ...rest } = listBody()
    void dayMethod
    const res = await adnan.post('/api/pricing/price-lists', { ...rest, name: 'Yöntemsiz' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.fields.dayMethod).toBe('Gün hesabı yöntemini seçin')
    expect((await adnan.post('/api/pricing/price-lists', { ...rest, name: 'Yöntemsiz', dayMethod: 'hourly' })).statusCode).toBe(400)
  })

  it('F4: the API takes a single discount; a list of discounts is not accepted', async () => {
    const d = list.discounts[0]!.id
    const res = await adnan.post(`/api/reservations/${reservationId}/quotes/preview`, { discountId: [d, d] })
    expect(res.statusCode).toBe(400)
    // A discount below its minimum length is refused, not silently dropped.
    const short = await adnan.post(`/api/reservations/${reservationId}/quotes/preview`, { discountId: d })
    expect(short.json()).toMatchObject({ ok: false, problems: [{ code: 'discount_min_days', minDays: 7 }] })
  })

  it('concurrent edits of one price list: one revision wins, the other gets 409 with the current list', async () => {
    const cur = (await adnan.get(`/api/pricing/price-lists/${list.id}`)).json() as PriceListDetail
    const [a, b] = await Promise.all([
      adnan.put(`/api/pricing/price-lists/${list.id}`, { ...listBody({ name: 'Eşzamanlı A' }), version: cur.version }),
      adnan.put(`/api/pricing/price-lists/${list.id}`, { ...listBody({ name: 'Eşzamanlı B' }), version: cur.version }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    const loser = a.statusCode === 409 ? a : b
    expect(loser.json().error.code).toBe('VERSION_CONFLICT')
    expect(loser.json().error.details.current.revision).toBe(cur.revision + 1)
    list = (await adnan.get(`/api/pricing/price-lists/${list.id}`)).json()
  })

  it('concurrent quote saves for one reservation: both are kept as history, exactly one stays current', async () => {
    const res = await adnan.post('/api/reservations', { customerId: ids.mirza, vehicleClassId: ids.orta, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(80, '10:00'), returnLocal: local(82, '10:00'), source: 'phone' })
    const rid = res.json().id
    const p = (await adnan.post(`/api/reservations/${rid}/quotes/preview`, {})).json() as PricingResult
    const body = () => ({ requestId: uuid(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor, selectedExtras: [] })
    const results = await Promise.all([adnan.post(`/api/reservations/${rid}/quotes`, body()), adnan.post(`/api/reservations/${rid}/quotes`, body())])
    expect(results.map((r) => r.statusCode)).toEqual([201, 201])
    const items = (await adnan.get(`/api/reservations/${rid}/quotes`)).json().items as PriceQuote[]
    expect(items.map((q) => q.status).sort()).toEqual(['quoted', 'superseded'])
  })

  it('quotes never touch vehicle availability, payments or the reservation itself', async () => {
    const before = (await one('select version, status, vehicle_id from reservations where id = $1', [reservationId])) as Record<string, unknown>
    // No invoice, debt or ledger tables; finance records (Finance V1) appear only through explicit finance steps.
    const tables = (await ownerPool.query(`select table_name from information_schema.tables where table_schema = 'public' and table_name ~ '(invoice|debt|ledger)'`)).rows
    expect(tables).toEqual([])
    const p = (await adnan.post(`/api/reservations/${reservationId}/quotes/preview`, {})).json() as PricingResult
    expect((await adnan.post(`/api/reservations/${reservationId}/quotes`, { requestId: uuid(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor, selectedExtras: [] })).statusCode).toBe(201)
    expect(await one('select version, status, vehicle_id from reservations where id = $1', [reservationId])).toEqual(before)
    expect(Number((await one('select (select count(*) from rental_finances) + (select count(*) from finance_payments) + (select count(*) from finance_charges) as n')).n)).toBe(0)
  })
})

describe('contract templates', () => {
  let templateId: string
  it('only the owner manages templates; a sample starts as a clearly marked draft', async () => {
    expect((await selma.post('/api/settings/contract-templates', { name: 'Kiralama TR', language: 'tr', fromSample: true })).statusCode).toBe(403)
    const res = await adnan.post('/api/settings/contract-templates', { name: 'Kiralama TR', language: 'tr', country: 'BA', fromSample: true })
    expect(res.statusCode, res.body).toBe(201)
    const t = res.json()
    templateId = t.id
    expect(t).toMatchObject({ isSample: true, language: 'tr', country: 'BA' })
    expect(t.versions[0]).toMatchObject({ versionNo: 1, status: 'draft' })
    expect(t.versions[0].body).toContain('ÖRNEK METİN — HUKUKİ ONAY GEREKTİRİR')
  })

  it('refuses HTML, links, unknown fields and stray braces', async () => {
    const t = (await adnan.get('/api/settings/contract-templates')).json().items[0]
    const v = t.versions[0].version
    for (const body of ['<b>{{contract.no}}</b>', 'Bkz. https://example.com', '{{renter.tc_no}}', 'Merhaba {{contract.no}', '<script>alert(1)</script>']) {
      const res = await adnan.put(`/api/settings/contract-templates/${templateId}/draft`, { version: v, body })
      expect(res.statusCode, body).toBe(400)
    }
  })

  it('a template without the required fields cannot be activated (API and database)', async () => {
    let t = (await adnan.get('/api/settings/contract-templates')).json().items[0]
    let res = await adnan.put(`/api/settings/contract-templates/${templateId}/draft`, { version: t.versions[0].version, body: 'Sözleşme {{contract.no}}' })
    expect(res.statusCode, res.body).toBe(200)
    t = res.json()
    res = await adnan.post(`/api/settings/contract-templates/${templateId}/activate`, { version: t.versions[0].version })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('TEMPLATE_INCOMPLETE')
    await expect(asOwner(data.companies.drina, `update contract_template_versions set status = 'active', activated_at = now() where template_id = $1`, [templateId])).rejects.toThrow(/required field/)
  })

  it('activates a complete draft; an active version never changes; a new draft starts from it', async () => {
    let t = (await adnan.get('/api/settings/contract-templates')).json().items[0]
    const body = (await adnan.post('/api/settings/contract-templates', { name: 'Geçici', language: 'tr', fromSample: true })).json().versions[0].body as string
    let res = await adnan.put(`/api/settings/contract-templates/${templateId}/draft`, { version: t.versions[0].version, body })
    t = res.json()
    res = await adnan.post(`/api/settings/contract-templates/${templateId}/activate`, { version: t.versions[0].version })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().versions[0]).toMatchObject({ status: 'active', versionNo: 1 })
    await expect(asOwner(data.companies.drina, `update contract_template_versions set body = 'x' where template_id = $1`, [templateId])).rejects.toThrow()
    res = await adnan.post(`/api/settings/contract-templates/${templateId}/draft`, {})
    expect(res.statusCode).toBe(201)
    expect(res.json().versions.map((v: { versionNo: number; status: string }) => [v.versionNo, v.status])).toEqual([
      [2, 'draft'],
      [1, 'active'],
    ])
    expect((await adnan.post(`/api/settings/contract-templates/${templateId}/draft`, {})).statusCode).toBe(409)
  })

  it('preview uses fictional values only', async () => {
    const res = await selma.post('/api/settings/contract-templates/preview', { body: 'No {{contract.no}} — {{renter.name}} — {{vehicle.plate}}' })
    expect(res.json().text).toBe('No S-000000 — Örnek Müşteri — ORNEK 00')
  })
})

describe('contracts', () => {
  let tv: string
  let contract: ContractDetail
  it('creates a draft for a rental: snapshot without ID numbers, "not calculated" price, draft PDF', async () => {
    const tpl = (await adnan.get('/api/settings/contract-templates')).json().items.find((t: { name: string }) => t.name === 'Kiralama TR')
    tv = tpl.versions.find((v: { status: string }) => v.status === 'active').id
    const r = await adnan.post('/api/rentals', {
      customerId: ids.ajla,
      drivers: [{ customerId: ids.ajla, isPrimary: true }],
      vehicleClassId: ids.orta,
      vehicleId: ids.passat,
      pickupBranchId: ids.sjj,
      returnBranchId: ids.sjj,
      pickupLocal: local(5, '10:00'),
      returnLocal: local(7, '10:00'),
      requestId: uuid(),
    })
    expect(r.statusCode, r.body).toBe(201)
    rental = r.json()
    const ctx = (await adnan.get(`/api/rentals/${rental.id}/contracts`)).json()
    expect(ctx.items).toEqual([])
    expect(ctx.activeTemplates.map((t: { id: string }) => t.id)).toContain(tv)
    const requestId = uuid()
    const res = await adnan.post(`/api/rentals/${rental.id}/contracts`, { templateVersionId: tv, requestId })
    expect(res.statusCode, res.body).toBe(201)
    contract = res.json()
    expect(contract).toMatchObject({ status: 'draft', revision: 1, quote: null, pdf: { available: true }, canDownload: true })
    expect(contract.contractNo).toMatch(/^S-\d{6}$/)
    expect(contract.snapshot.renderedText).toContain('Fiyat hesaplanmadı')
    expect(contract.snapshot.renderedText).toContain('Ajla Testović')
    expect(contract.snapshot.renderedText).not.toContain('{{')
    const raw = JSON.stringify((await one('select content from contracts where id = $1', [contract.id])).content)
    expect(raw).not.toMatch(/document_number|documentNumber|birth|address|phone|email/i)
    expect((await adnan.post(`/api/rentals/${rental.id}/contracts`, { templateVersionId: tv, requestId })).json().id).toBe(contract.id)
    const open = await adnan.post(`/api/rentals/${rental.id}/contracts`, { templateVersionId: tv, requestId: uuid() })
    expect(open.statusCode).toBe(409)
    expect(open.json().error.code).toBe('CONTRACT_OPEN')
  })

  const events = async () => (await asOwner(data.companies.drina, `select kind from contract_events where contract_id = $1 order by at, id`, [contract.id])).rows.map((r) => r.kind as string)
  const count = async (kind: string) => (await events()).filter((k) => k === kind).length

  it('PDF security: a GET never records a view; a CSRF-checked POST records it once and grants short access', async () => {
    const before = await events()
    // Reading the contract and trying the file without a grant record nothing.
    expect((await adnan.get(`/api/contracts/${contract.id}`)).statusCode).toBe(200)
    expect((await adnan.get(`/api/contracts/${contract.id}`)).statusCode).toBe(200)
    const noGrant = await adnan.get(`/api/contracts/${contract.id}/pdf`)
    expect(noGrant.statusCode).toBe(403)
    expect(noGrant.json().error.code).toBe('ACCESS_GRANT_REQUIRED')
    expect(await events()).toEqual(before)
    // Without the CSRF token (a forged request) no grant and no record.
    const forged = new Client(app)
    forged.jar = adnan.jar
    expect((await forged.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })).statusCode).toBe(403)
    expect(await events()).toEqual(before)

    const grant = await adnan.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })
    expect(grant.statusCode, grant.body).toBe(200)
    expect(grant.json().url).toBe(`/api/contracts/${contract.id}/pdf`)
    expect(await count('viewed')).toBe(before.filter((k) => k === 'viewed').length + 1)
    const res = await adnan.get(grant.json().url)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['cache-control']).toContain('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toContain('sandbox')
    expect(res.headers['content-disposition']).toBe(`inline; filename="sozlesme-taslagi_${contract.contractNo}_s1.pdf"`)
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect(res.rawPayload.toString('latin1')).not.toContain('Ajla')
    // Reloads (the browser's PDF viewer) create no further entries.
    const afterView = await events()
    for (let i = 0; i < 3; i++) expect((await adnan.get(grant.json().url)).statusCode).toBe(200)
    expect(await events()).toEqual(afterView)
    // A view grant does not download; a cross-site request is refused.
    expect((await adnan.get(`/api/contracts/${contract.id}/pdf?indir=1`)).statusCode).toBe(403)
    expect((await adnan.request('GET', grant.json().url, undefined, { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403)

    const dl = await adnan.post(`/api/contracts/${contract.id}/access`, { mode: 'download' })
    expect(dl.json().url).toBe(`/api/contracts/${contract.id}/pdf?indir=1`)
    const file = await adnan.get(dl.json().url)
    expect(file.headers['content-disposition']).toBe(`attachment; filename="sozlesme-taslagi_${contract.contractNo}_s1.pdf"`)
    expect(await count('downloaded')).toBe(1)
    const audits = (await asOwner(data.companies.drina, `select action, summary::text s from audit_log where action like 'contract.%'`)).rows
    expect(audits.map((r) => r.action)).toEqual(expect.arrayContaining(['contract.pdf_view', 'contract.download']))
    expect(audits.map((r) => r.s as string).join(' ')).not.toMatch(/Ajla|Testović/)
  })

  it('PDF permissions: Operasyon may open but not download; another company sees nothing', async () => {
    const detail = (await selma.get(`/api/contracts/${contract.id}`)).json()
    expect(detail).toMatchObject({ canView: true, canDownload: false })
    expect((await selma.post(`/api/contracts/${contract.id}/access`, { mode: 'download' })).statusCode).toBe(403)
    const view = await selma.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })
    expect(view.statusCode).toBe(200)
    expect((await selma.get(view.json().url)).statusCode).toBe(200)
    expect((await selma.get(`/api/contracts/${contract.id}/pdf?indir=1`)).statusCode).toBe(403)
    // Another user's grant is not shared: a grant belongs to one session.
    expect((await lejla.get(view.json().url)).statusCode).toBe(404)
    expect((await lejla.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })).statusCode).toBe(404)
    expect(await count('downloaded')).toBe(1)
  })

  it('PDF grants end with the session, a permission removal or a company switch', async () => {
    // Session: sign out → the old grant is gone; the next session needs a new one.
    const other = new Client(app)
    expect((await other.login(EMAILS.adnan)).statusCode).toBe(200)
    const g = (await other.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })).json()
    expect((await other.get(g.url)).statusCode).toBe(200)
    expect((await other.post('/api/auth/logout')).statusCode).toBeLessThan(300)
    expect((await other.login(EMAILS.adnan)).statusCode).toBe(200)
    expect((await other.get(g.url)).statusCode).toBe(403)

    // Permission: removing contracts.read from Operasyon closes the file at once (checked again on every GET).
    const v = (await selma.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })).json()
    expect((await selma.get(v.url)).statusCode).toBe(200)
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'contracts.read') where name = 'Operasyon'`)
    try {
      expect((await selma.get(v.url)).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'contracts.read') where name = 'Operasyon'`)
    }

    // Company switch (adnan is also in Neretva): the Drina grant does not open anything there.
    const g2 = (await other.post(`/api/contracts/${contract.id}/access`, { mode: 'view' })).json()
    expect((await other.post('/api/auth/switch-company', { companyId: data.companies.neretva })).statusCode).toBe(200)
    expect((await other.get(g2.url)).statusCode).toBe(404)
  })

  it('another company cannot see or use it', async () => {
    expect((await lejla.get(`/api/contracts/${contract.id}`)).statusCode).toBe(404)
    expect((await lejla.get(`/api/rentals/${rental.id}/contracts`)).statusCode).toBe(404)
    const rows = await asApp(data.companies.neretva, async (c) => (await c.query('select id from contracts')).rows)
    expect(rows).toEqual([])
  })

  it('lifecycle: review, then a staff statement about the external process; never "signed"', async () => {
    let res = await adnan.post(`/api/contracts/${contract.id}/external`, { version: contract.version, requestId: uuid(), externalAck: true, externalReference: 'DIS-1' })
    expect(res.statusCode).toBe(409)
    res = await adnan.post(`/api/contracts/${contract.id}/review`, { version: contract.version, requestId: uuid() })
    expect(res.statusCode, res.body).toBe(200)
    contract = res.json()
    expect(contract.status).toBe('under_review')
    res = await adnan.post(`/api/contracts/${contract.id}/external`, { version: contract.version, requestId: uuid(), externalAck: true, externalReference: 'Ajla 1234567890123' })
    expect(res.statusCode).toBe(200) // allowed characters; staff are told not to write names
    contract = res.json()
    expect(contract).toMatchObject({ status: 'externally_processed', externalReference: 'Ajla 1234567890123' })
    expect(contract.externalAckAt).toBeTruthy()
    await expect(asOwner(data.companies.drina, `update contracts set status = 'signed' where id = $1`, [contract.id])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `update contracts set content = '{}'::jsonb where id = $1`, [contract.id])).rejects.toThrow(/cannot change/)
    await expect(asOwner(data.companies.drina, `update contracts set external_reference = 'X-2' where id = $1`, [contract.id])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `delete from contracts where id = $1`, [contract.id])).rejects.toThrow()
  })

  it('a quote saved for the rental appears in the next revision; the old one is superseded, not edited', async () => {
    const p = (await adnan.post(`/api/rentals/${rental.id}/quotes/preview`, {})).json() as PricingResult
    expect(p.ok).toBe(true)
    const q = await adnan.post(`/api/rentals/${rental.id}/quotes`, { requestId: uuid(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor, selectedExtras: [] })
    expect(q.statusCode, q.body).toBe(201)
    const res = await adnan.post(`/api/contracts/${contract.id}/revise`, { version: contract.version, templateVersionId: tv, requestId: uuid() })
    expect(res.statusCode, res.body).toBe(201)
    const next = res.json() as ContractDetail
    expect(next).toMatchObject({ contractNo: contract.contractNo, revision: 2, status: 'draft', quote: { no: q.json().quoteNo } })
    expect(next.snapshot.renderedText).toContain('Brüt toplam')
    expect(next.snapshot.renderedText).toContain('ödeme, tahsilat veya fatura değildir')
    const old = (await adnan.get(`/api/contracts/${contract.id}`)).json() as ContractDetail
    expect(old.status).toBe('superseded')
    expect(old.snapshot.renderedText).toContain('Fiyat hesaplanmadı')
    // The first revision keeps its own PDF file; files can be neither changed nor removed.
    const files = (await asOwner(data.companies.drina, 'select contract_id, sha256 from contract_files where contract_id = any($1)', [[contract.id, next.id]])).rows
    expect(files).toHaveLength(2)
    expect(files.find((x) => x.contract_id === contract.id)!.sha256).toBe(old.pdf.sha256)
    await expect(asOwner(data.companies.drina, "update contract_files set sha256 = repeat('0', 64) where contract_id = $1", [contract.id])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, 'delete from contract_files where contract_id = $1', [contract.id])).rejects.toThrow()
    const items = (await adnan.get(`/api/rentals/${rental.id}/contracts`)).json().items
    expect(items.map((i: { revision: number; status: string }) => [i.revision, i.status])).toEqual([
      [2, 'draft'],
      [1, 'superseded'],
    ])
    contract = next
  })

  it('delivery gates show the quote and contract but stay "attention": they never release a handover', async () => {
    const d = (await adnan.get(`/api/rentals/${rental.id}`)).json() as RentalDetail
    const gates = Object.fromEntries(d.deliveryGates.map((g) => [g.code, g]))
    expect(gates.pricing).toMatchObject({ state: 'attention', detail: { currency: 'EUR' } })
    expect(gates.contract).toMatchObject({ state: 'attention', detail: { contractNo: contract.contractNo, status: 'draft' } })
    expect(gates.external_terms).toBeTruthy()
  })

  it('archive needs a reason; an archived contract is final', async () => {
    expect((await adnan.post(`/api/contracts/${contract.id}/archive`, { version: contract.version, requestId: uuid() })).statusCode).toBe(400)
    const res = await adnan.post(`/api/contracts/${contract.id}/archive`, { version: contract.version, requestId: uuid(), reason: 'entry_error' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().status).toBe('archived')
    expect((await adnan.post(`/api/contracts/${contract.id}/review`, { version: res.json().version, requestId: uuid() })).statusCode).toBe(409)
    // A new contract may be drafted after archiving (new number).
    const again = await adnan.post(`/api/rentals/${rental.id}/contracts`, { templateVersionId: tv, requestId: uuid() })
    expect(again.statusCode).toBe(201)
    expect(again.json().contractNo).not.toBe(contract.contractNo)
  })
})

describe('personal data', () => {
  it('server logs of the whole run carry no customer names, contract text or reference', () => {
    expect(logs.length).toBeGreaterThan(0)
    expect(logs).not.toMatch(/Ajla|Testović|Mirza|Uzorak|Dino|ÖRNEK METİN|renderedText/)
  })
})
