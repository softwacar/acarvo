import { randomUUID } from 'node:crypto'
import { Writable } from 'node:stream'
import { CHECKLIST_ITEMS, type PricingResult, type RentalDetail, type RentalFinanceView, todayIn } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase } from './helpers'

// Finance V1 (docs/FINANS_YONETIMI_V1_PLANI.md): finance files, internal account lines from quotes, payments with
// four-eyes verification, deposits and returns, close/reopen, lists, statements, isolation. acarvo_test only,
// synthetic data. Nothing here moves money.

let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip
let selma: Client // Drina Operasyon, SJJ
let lejla: Client // Neretva Sahip
let kontrol: Client // Drina, the Yönetici preset (second person for four-eyes)
let logs = ''
let jpeg: Buffer
const ids: Record<string, string> = {}
const uuid = () => randomUUID()
const local = (days: number, time: string) => `${new Date(Date.parse(`${todayIn('Europe/Sarajevo')}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)}T${time}`
const one = async (q: string, values: unknown[] = [], companyId = data.companies.drina) => (await asOwner(companyId, q, values)).rows[0]
const checklistAll = Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i, 'ok']))
async function login(email: string) {
  const c = new Client(app)
  expect((await c.login(email)).statusCode).toBe(200)
  return c
}

/** A prepared rental with a saved quote (and optionally handed over). */
async function rentalWithQuote(plate: string, deliver: boolean, over: Record<string, unknown> = {}) {
  const vehicleId = (await one(`select id from vehicles where plate = $1`, [plate])).id
  let res = await adnan.post('/api/rentals', {
    customerId: ids.ajla,
    drivers: [{ customerId: ids.ajla, isPrimary: true }],
    vehicleClassId: ids.orta,
    vehicleId,
    pickupBranchId: ids.sjj,
    returnBranchId: ids.sjj,
    pickupLocal: local(1, '10:00'),
    returnLocal: local(3, '10:00'),
    requestId: uuid(),
    ...over,
  })
  expect(res.statusCode, res.body).toBe(201)
  let d = res.json() as RentalDetail
  const p = (await adnan.post(`/api/rentals/${d.id}/quotes/preview`, {})).json() as PricingResult
  res = await adnan.post(`/api/rentals/${d.id}/quotes`, { requestId: uuid(), expectedNetMinor: p.netMinor, expectedGrossMinor: p.grossMinor, selectedExtras: [] })
  expect(res.statusCode, res.body).toBe(201)
  if (deliver) {
    res = await adnan.put(`/api/rentals/${d.id}/document-check`, { version: d.version, drivers: [{ customerId: ids.ajla, residencyClass: 'local', decision: 'eligible' }] })
    if (res.statusCode === 200) d = res.json()
    res = await adnan.put(`/api/rentals/${d.id}/inspections/handover`, { inspectionVersion: 0, km: Number((await one('select max(km) as km from odometer_readings where vehicle_id = $1', [vehicleId])).km) + 25, fuel: 'full', cleanliness: 'clean', condition: 'good', checklist: checklistAll, counterpartCustomerId: ids.ajla, marks: [] })
    expect(res.statusCode, res.body).toBe(200)
    for (const angle of ['front', 'rear', 'left', 'right']) {
      res = await kontrol.upload(`/api/rentals/${d.id}/inspections/handover/photos?angle=${angle}`, jpeg)
      expect(res.statusCode, res.body).toBe(201)
    }
    d = res.json()
    res = await adnan.post(`/api/rentals/${d.id}/deliver`, { version: d.version, inspectionVersion: d.handover!.version, requestId: uuid(), externalContractAck: true, externalPricingAck: true, externalReference: 'DIS-FIN/1' })
    expect(res.statusCode, res.body).toBe(200)
    d = res.json()
  }
  return d
}
const fin = async (c: Client, rentalId: string) => (await c.get(`/api/rentals/${rentalId}/finance`)).json() as RentalFinanceView

let A: RentalDetail // delivered, customer responsible
let B: RentalDetail // prepared (not handed over)
let view: RentalFinanceView

beforeAll(async () => {
  data = await resetDatabase()
  app = await makeApp({ logStream: new Writable({ write: (chunk, _e, done) => ((logs += chunk.toString()), done()) }) })
  adnan = await login(EMAILS.adnan)
  selma = await login(EMAILS.selma)
  lejla = await login(EMAILS.lejla)
  ids.sjj = (await one(`select id from branches where code = 'SJJ'`)).id
  ids.sac = (await one(`select id from branches where code = 'SAC'`)).id
  ids.orta = (await one(`select id from vehicle_classes where name = 'Orta'`)).id
  ids.ajla = (await one(`select id from customers where display_name = 'Ajla Testović'`)).id
  ids.mirza = (await one(`select id from customers where display_name = 'Mirza Uzorak'`)).id
  ids.corp = (await one(`select id from corporate_accounts where legal_name = 'Örnek Lojistik d.o.o.'`)).id
  // A second Drina user with the Yönetici preset (four-eyes partner).
  const role = (await one(`select id from roles where name = 'Yönetici'`)).id
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'kontrol@drina-demo.ba', 'Kontrol Kullanıcı', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  kontrol = await login('kontrol@drina-demo.ba')
  jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 60, g: 120, b: 90 } } }).jpeg().toBuffer()
  // An active EUR list with tax, so rentals get real quotes.
  const list = (
    await adnan.post('/api/pricing/price-lists', {
      name: 'Finans EUR',
      currency: 'EUR',
      priority: 10,
      dayMethod: 'rolling_24h',
      graceMinutes: 0,
      minDays: 1,
      taxMode: 'exclusive',
      taxRateBp: 1700,
      taxLabel: 'PDV',
      rates: [{ vehicleClassId: ids.orta, rate1to6: 5000, rate7to29: 4500, rate30plus: null }],
      seasons: [],
      extras: [],
      discounts: [],
    })
  ).json()
  await adnan.post(`/api/pricing/price-lists/${list.id}/activate`, { version: 1 })
  A = await rentalWithQuote('O58-E-467', true)
  B = await rentalWithQuote('E16-T-093', false)
})
afterAll(async () => {
  await app?.close()
  await ownerPool.end()
  await appPool.end()
})

describe('permissions and separation from quotes', () => {
  it('presets: Operasyon may read, record payments and deposits and request returns only; custom roles untouched', async () => {
    const perms = async (name: string) => ((await one(`select permissions from roles where name = $1`, [name])).permissions as string[]).filter((p) => p.startsWith('finance.')).sort()
    expect(await perms('Operasyon')).toEqual(['finance.deposits.record', 'finance.payments.record', 'finance.read', 'finance.refunds.request'])
    expect(await perms('Yönetici')).toHaveLength(11)
    expect(await perms('Sahip')).toHaveLength(11)
  })

  it('a quote, a handover or a rental close never creates finance records by itself', async () => {
    const n = (await asOwner(data.companies.drina, `select (select count(*) from rental_finances) + (select count(*) from finance_charges) + (select count(*) from finance_payments) + (select count(*) from finance_deposits) as n`)).rows[0].n
    expect(Number(n)).toBe(0)
    view = await fin(adnan, A.id)
    expect(view).toMatchObject({ finance: null, totals: null, quote: { currency: 'EUR', amountMinor: 11_700, matchesPlan: true, charged: false }, can: { open: true } })
    expect(view.returnFacts).toMatchObject({ actualReturnAt: null, reviewNeeded: false })
  })
})

describe('finance file and account lines', () => {
  it('opens a file with an explicit currency and responsible party; once; replay-safe', async () => {
    const bad = await adnan.post(`/api/rentals/${A.id}/finance/open`, { currency: 'EUR', responsibleType: 'corporate', requestId: uuid() })
    expect(bad.statusCode).toBe(400)
    const requestId = uuid()
    const res = await selma.post(`/api/rentals/${A.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId })
    expect(res.statusCode, res.body).toBe(201)
    view = res.json()
    expect(view.finance).toMatchObject({ currency: 'EUR', status: 'open', responsible: { type: 'customer', name: 'Ajla Testović' } })
    expect((await selma.post(`/api/rentals/${A.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId })).statusCode).toBe(200)
    expect((await selma.post(`/api/rentals/${A.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: uuid() })).json().error.code).toBe('FINANCE_EXISTS')
    expect((await adnan.post(`/api/rentals/${B.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: uuid() })).statusCode).toBe(201)
  })

  it('a quote becomes a pending line only by an authorised person; once per quote; never above its amounts', async () => {
    const q = view.quote!
    expect((await selma.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'quote', quoteId: q.id, requestId: uuid() })).statusCode).toBe(403)
    const res = await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'quote', quoteId: q.id, requestId: uuid() })
    expect(res.statusCode, res.body).toBe(201)
    view = res.json()
    expect(view.charges[0]).toMatchObject({ kind: 'quote', status: 'pending', amountMinor: 11_700, netMinor: 10_000, taxMinor: 1700, taxStatus: 'complete', currency: 'EUR' })
    expect(view.charges[0]!.chargeNo).toMatch(/^H-\d{6}$/)
    expect(view.totals).toMatchObject({ pendingChargesMinor: 11_700, postedChargesMinor: 0, outstandingMinor: 0 })
    const again = await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'quote', quoteId: q.id, requestId: uuid() })
    expect(again.json().error.code).toBe('QUOTE_ALREADY_CHARGED')
  })

  it('four-eyes and handover: the preparer cannot post; a not-handed-over rental cannot post; the second person posts', async () => {
    const c = view.charges[0]!
    const self = await adnan.post(`/api/finance/charges/${c.id}/approve`, { version: c.version, requestId: uuid() })
    expect(self.json().error.code).toBe('FOUR_EYES')
    // Rental B is only prepared.
    const bq = (await fin(adnan, B.id)).quote!
    const bv = (await adnan.post(`/api/rentals/${B.id}/finance/charges`, { kind: 'quote', quoteId: bq.id, requestId: uuid() })).json() as RentalFinanceView
    const notDelivered = await kontrol.post(`/api/finance/charges/${bv.charges[0]!.id}/approve`, { version: 1, requestId: uuid() })
    expect(notDelivered.json().error.code).toBe('NOT_DELIVERED')
    const ok = await kontrol.post(`/api/finance/charges/${c.id}/approve`, { version: c.version, requestId: uuid() })
    expect(ok.statusCode, ok.body).toBe(200)
    view = ok.json()
    expect(view.charges[0]).toMatchObject({ status: 'posted', approved: { name: 'Kontrol Kullanıcı' } })
    expect(view.totals).toMatchObject({ postedChargesMinor: 11_700, outstandingMinor: 11_700 })
    // The database refuses it too.
    await expect(asOwner(data.companies.drina, `update finance_charges set status = 'posted', approved_by = created_by, approved_at = now() where id = $1`, [bv.charges[0]!.id])).rejects.toThrow()
  })

  it('a manual line needs a reason and an exact amount in the file currency', async () => {
    expect((await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'manual', description: 'Ek temizlik', amount: '10,005', reason: 'Araç çok kirli iade edildi', requestId: uuid() })).statusCode).toBe(400)
    const res = await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'manual', description: 'Ek temizlik', amount: '25,00', reason: 'Araç çok kirli iade edildi', requestId: uuid() })
    expect(res.statusCode, res.body).toBe(201)
    view = res.json()
    const m = view.charges.find((c) => c.kind === 'manual')!
    expect(m).toMatchObject({ amountMinor: 2500, taxStatus: 'not_configured', status: 'pending' })
    expect(view.totals!.taxIncomplete).toBe(true)
    view = (await kontrol.post(`/api/finance/charges/${m.id}/reject`, { version: m.version, requestId: uuid(), note: 'Fotoğraf yok' })).json()
    expect(view.charges.find((c) => c.id === m.id)!.status).toBe('rejected')
  })
})

describe('payments', () => {
  it('cash needs the staff statement; card numbers are refused; amounts are exact; recording is not verification', async () => {
    const base = { method: 'cash', amount: '50,00', payerType: 'customer', payerCustomerId: ids.ajla }
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { ...base, requestId: uuid() })).json().error.fields.cashAck).toBeTruthy()
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { ...base, method: 'external_pos', externalReference: '4111 1111 1111 1111', requestId: uuid() })).json().error.fields.externalReference).toContain('Kart numarası')
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { ...base, amount: '50,001', cashAck: true, requestId: uuid() })).statusCode).toBe(400)
    const requestId = uuid()
    const res = await selma.post(`/api/rentals/${A.id}/finance/payments`, { ...base, cashAck: true, requestId })
    expect(res.statusCode, res.body).toBe(201)
    view = res.json()
    const p = view.payments[0]!
    expect(p).toMatchObject({ status: 'recorded', amountMinor: 5000, currency: 'EUR', cashAck: true, payer: { type: 'customer', name: 'Ajla Testović' } })
    expect(p.paymentNo).toMatch(/^T-\d{6}$/)
    expect(view.totals).toMatchObject({ recordedPaymentsMinor: 5000, verifiedPaymentsMinor: 0, outstandingMinor: 11_700 })
    // Network retry with the same request: no second payment.
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { ...base, cashAck: true, requestId })).statusCode).toBe(200)
    expect((await fin(adnan, A.id)).payments).toHaveLength(1)
  })

  it('verification: Operasyon cannot, the recorder cannot, a second person can; double verification is refused', async () => {
    const p = view.payments[0]!
    expect((await selma.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() })).statusCode).toBe(403)
    const [a, b] = await Promise.all([
      adnan.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() }),
      kontrol.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
    view = await fin(adnan, A.id)
    expect(view.payments[0]).toMatchObject({ status: 'verified' })
    expect(view.totals).toMatchObject({ verifiedPaymentsMinor: 5000, outstandingMinor: 6700, recordedPaymentsMinor: 0 })
    expect((await kontrol.post(`/api/finance/payments/${p.id}/verify`, { version: view.payments[0]!.version, requestId: uuid() })).statusCode).toBe(409)
  })

  it('a third-party payer by name, a reused external reference refused, no overpayment (also under concurrency)', async () => {
    let res = await selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'bank_transfer', amount: '20,00', payerType: 'other', payerName: 'Üçüncü Kişi Örnek', externalReference: 'HAVALE-778', requestId: uuid() })
    expect(res.statusCode, res.body).toBe(201)
    res = await selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'bank_transfer', amount: '1,00', payerType: 'other', payerName: 'Başkası', externalReference: 'HAVALE-778', requestId: uuid() })
    expect(res.json().error.code).toBe('REFERENCE_USED')
    // Remaining 47,00: two concurrent 30,00 payments cannot both pass.
    const both = await Promise.all([0, 1].map(() => selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'other_external', amount: '30,00', payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })))
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409])
    expect(both.find((r) => r.statusCode === 409)!.json().error.code).toBe('OVERPAYMENT')
    view = await fin(adnan, A.id)
    expect(view.totals).toMatchObject({ recordedPaymentsMinor: 5000, verifiedPaymentsMinor: 5000 })
    // The payer is not someone outside the rental unless entered as a third party.
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'other_external', amount: '1,00', payerType: 'customer', payerCustomerId: ids.mirza, requestId: uuid() })).statusCode).toBe(400)
  })

  it('reject and reverse: rejected frees the reference; a verified payment is reversed only with a reason; history stays', async () => {
    const transfer = view.payments.find((p) => p.method === 'bank_transfer')!
    view = (await kontrol.post(`/api/finance/payments/${transfer.id}/reject`, { version: transfer.version, requestId: uuid(), note: 'Banka hesabında görünmüyor' })).json()
    expect(view.payments.find((p) => p.id === transfer.id)!.status).toBe('rejected')
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'bank_transfer', amount: '20,00', payerType: 'other', payerName: 'Üçüncü Kişi Örnek', externalReference: 'HAVALE-778', requestId: uuid() })).statusCode).toBe(201)
    const other = (await fin(adnan, A.id)).payments.find((p) => p.method === 'other_external' && p.status === 'recorded')!
    view = (await kontrol.post(`/api/finance/payments/${other.id}/verify`, { version: other.version, requestId: uuid() })).json()
    expect((await kontrol.post(`/api/finance/payments/${other.id}/reverse`, { version: other.version + 1, requestId: uuid() })).statusCode).toBe(400)
    view = (await kontrol.post(`/api/finance/payments/${other.id}/reverse`, { version: other.version + 1, requestId: uuid(), reason: 'Yanlış kiralamaya girildi' })).json()
    const rev = view.payments.find((p) => p.id === other.id)!
    expect(rev).toMatchObject({ status: 'reversed', reversalReason: 'Yanlış kiralamaya girildi', amountMinor: 3000 })
    expect(view.totals).toMatchObject({ verifiedPaymentsMinor: 5000, outstandingMinor: 6700 })
    expect(view.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['payment_recorded', 'payment_verify', 'payment_reverse', 'payment_reject']))
  })

  it('payments are immutable, never deleted, only in the file currency (database)', async () => {
    const p = view.payments[0]!
    await expect(asOwner(data.companies.drina, `update finance_payments set amount_minor = 1 where id = $1`, [p.id])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `delete from finance_payments where id = $1`, [p.id])).rejects.toThrow()
    await expect(asOwner(data.companies.drina, `update finance_events set kind = 'x'`)).rejects.toThrow()
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(
          `insert into finance_payments (company_id, finance_id, payment_no, method, currency, amount_minor, payer_type, payer_name, received_at, branch_id, client_request_id, created_by)
           select company_id, finance_id, 'T-999999', 'other_external', 'USD', 100, 'other', 'Test Ödeyen', now(), branch_id, gen_random_uuid(), created_by from finance_payments where id = $1`,
          [p.id],
        ),
      ),
    ).rejects.toThrow(/file currency/)
  })
})

describe('deposits and returns', () => {
  let depositId: string
  it('a deposit in its own currency: requested, reported, verified by a second person; never a payment', async () => {
    let res = await selma.post(`/api/rentals/${A.id}/finance/deposits`, { currency: 'BAM', amount: '300,00', received: false, requestId: uuid() })
    expect(res.statusCode, res.body).toBe(201)
    view = res.json()
    const d = view.deposits[0]!
    depositId = d.id
    expect(d).toMatchObject({ status: 'requested', currency: 'BAM', amountMinor: 30_000, heldMinor: 0 })
    expect(d.depositNo).toMatch(/^D-\d{6}$/)
    // A refund of a deposit that was never received is refused.
    expect((await selma.post(`/api/finance/deposits/${d.id}/refunds`, { amount: '10,00', method: 'cash', reason: 'Deneme', requestId: uuid() })).json().error.code).toBe('DEPOSIT_NOT_HELD')
    res = await selma.post(`/api/finance/deposits/${d.id}/report`, { version: d.version, requestId: uuid(), method: 'external_card_hold', externalReference: 'BLOKE-55' })
    expect(res.statusCode, res.body).toBe(200)
    const reported = (res.json() as RentalFinanceView).deposits[0]!
    expect((await selma.post(`/api/finance/deposits/${d.id}/verify`, { version: reported.version, requestId: uuid() })).statusCode).toBe(403)
    view = (await kontrol.post(`/api/finance/deposits/${d.id}/verify`, { version: reported.version, requestId: uuid() })).json()
    expect(view.deposits[0]).toMatchObject({ status: 'verified', heldMinor: 30_000 })
    expect(view.depositTotals).toEqual([{ currency: 'BAM', requestedMinor: 0, reportedMinor: 0, heldMinor: 30_000, refundOpenMinor: 0, refundedMinor: 0 }])
    // The EUR balance is untouched by a BAM deposit.
    expect(view.totals).toMatchObject({ currency: 'EUR', outstandingMinor: 6700 })
  })

  it('returns: never above the held amount, not twice concurrently, approved by another person, completed with a reference', async () => {
    expect((await selma.post(`/api/finance/deposits/${depositId}/refunds`, { amount: '300,01', method: 'bank_transfer', reason: 'İade', requestId: uuid() })).json().error.code).toBe('REFUND_EXCEEDS')
    const both = await Promise.all([0, 1].map(() => selma.post(`/api/finance/deposits/${depositId}/refunds`, { amount: '200,00', method: 'bank_transfer', reason: 'Araç hasarsız iade edildi', requestId: uuid() })))
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409])
    view = await fin(adnan, A.id)
    const r = view.deposits[0]!.refunds[0]!
    expect(r).toMatchObject({ status: 'requested', amountMinor: 20_000, currency: 'BAM' })
    expect(r.refundNo).toMatch(/^DI-\d{6}$/)
    expect((await selma.post(`/api/finance/refunds/${r.id}/approve`, { version: r.version, requestId: uuid() })).statusCode).toBe(403)
    view = (await kontrol.post(`/api/finance/refunds/${r.id}/approve`, { version: r.version, requestId: uuid() })).json()
    const approved = view.deposits[0]!.refunds[0]!
    expect((await kontrol.post(`/api/finance/refunds/${r.id}/complete`, { version: approved.version, requestId: uuid(), method: 'bank_transfer' })).statusCode).toBe(400)
    view = (await kontrol.post(`/api/finance/refunds/${r.id}/complete`, { version: approved.version, requestId: uuid(), method: 'bank_transfer', externalReference: 'IADE-101' })).json()
    expect(view.deposits[0]).toMatchObject({ heldMinor: 10_000, refundedMinor: 20_000, refundOpenMinor: 0 })
    expect(view.deposits[0]!.refunds[0]).toMatchObject({ status: 'completed', externalReference: 'IADE-101' })
  })

  it('under review nothing is returned; a completed return is reversed with a reason and the amount is held again', async () => {
    let d = view.deposits[0]!
    view = (await kontrol.post(`/api/finance/deposits/${d.id}/review`, { version: d.version, requestId: uuid(), inReview: true, reason: 'Hasar bulgusu değerlendiriliyor' })).json()
    expect((await selma.post(`/api/finance/deposits/${d.id}/refunds`, { amount: '10,00', method: 'cash', reason: 'Kalan iade', requestId: uuid() })).json().error.code).toBe('DEPOSIT_IN_REVIEW')
    d = view.deposits[0]!
    view = (await kontrol.post(`/api/finance/deposits/${d.id}/review`, { version: d.version, requestId: uuid(), inReview: false })).json()
    const done = view.deposits[0]!.refunds[0]!
    view = (await adnan.post(`/api/finance/refunds/${done.id}/reverse`, { version: done.version, requestId: uuid(), reason: 'Banka iadeyi geri çevirdi' })).json()
    expect(view.deposits[0]).toMatchObject({ heldMinor: 30_000, refundedMinor: 0 })
    expect(view.deposits[0]!.refunds[0]).toMatchObject({ status: 'reversed', reversalReason: 'Banka iadeyi geri çevirdi' })
    await expect(asOwner(data.companies.drina, `update finance_deposit_refunds set amount_minor = 1 where id = $1`, [done.id])).rejects.toThrow()
  })
})

describe('reversal of a line, close and reopen', () => {
  it('a posted line is reversed with a reason by one person and approved by another; an excess shows as overpayment', async () => {
    const c = view.charges.find((x) => x.kind === 'quote')!
    expect((await adnan.post(`/api/finance/charges/${c.id}/reversal-request`, { version: c.version, requestId: uuid() })).statusCode).toBe(400)
    view = (await adnan.post(`/api/finance/charges/${c.id}/reversal-request`, { version: c.version, requestId: uuid(), reason: 'Kiralama bedeli yanlış teklifle girildi' })).json()
    const rq = view.charges.find((x) => x.id === c.id)!
    expect(rq.status).toBe('reversal_requested')
    expect((await adnan.post(`/api/finance/charges/${c.id}/reversal-approve`, { version: rq.version, requestId: uuid() })).json().error.code).toBe('FOUR_EYES')
    view = (await kontrol.post(`/api/finance/charges/${c.id}/reversal-approve`, { version: rq.version, requestId: uuid() })).json()
    expect(view.charges.find((x) => x.id === c.id)!.status).toBe('reversed')
    expect(view.totals).toMatchObject({ postedChargesMinor: 0, outstandingMinor: 0, overpaidMinor: 5000 })
    expect(view.closeBlockers).toEqual(expect.arrayContaining(['overpaid', 'payments_pending', 'deposit_held']))
    // The reversed quote can be charged again (a new line), history keeps the old one.
    const q = view.quote!
    expect(q.charged).toBe(false)
    view = (await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'quote', quoteId: q.id, requestId: uuid() })).json()
    const again = view.charges.find((x) => x.kind === 'quote' && x.status === 'pending')!
    view = (await kontrol.post(`/api/finance/charges/${again.id}/approve`, { version: again.version, requestId: uuid() })).json()
    expect(view.charges.filter((x) => x.kind === 'quote').map((x) => x.status).sort()).toEqual(['posted', 'reversed'])
  })

  it('closes only at zero balance with nothing pending and deposits resolved; closed means read-only; reopen needs a reason', async () => {
    expect((await adnan.post(`/api/rentals/${A.id}/finance/close`, { version: view.finance!.version, requestId: uuid() })).json().error.code).toBe('CLOSE_BLOCKED')
    // Settle: verify the pending transfer, pay the rest, return the deposit.
    for (const p of view.payments.filter((x) => x.status === 'recorded')) view = (await kontrol.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() })).json()
    const rest = view.totals!.outstandingMinor
    view = (await selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'cash', cashAck: true, amount: (rest / 100).toFixed(2).replace('.', ','), payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })).json()
    const last = view.payments.find((p) => p.status === 'recorded')!
    view = (await kontrol.post(`/api/finance/payments/${last.id}/verify`, { version: last.version, requestId: uuid() })).json()
    const d = view.deposits[0]!
    view = (await selma.post(`/api/finance/deposits/${d.id}/refunds`, { amount: '300,00', method: 'cash', reason: 'Depozito iadesi', requestId: uuid() })).json()
    const r = view.deposits[0]!.refunds.find((x) => x.status === 'requested')!
    view = (await kontrol.post(`/api/finance/refunds/${r.id}/approve`, { version: r.version, requestId: uuid() })).json()
    view = (await kontrol.post(`/api/finance/refunds/${r.id}/complete`, { version: r.version + 1, requestId: uuid(), method: 'cash', cashAck: true })).json()
    expect(view.totals).toMatchObject({ outstandingMinor: 0, overpaidMinor: 0 })
    expect(view.closeBlockers).toEqual([])
    expect((await selma.post(`/api/rentals/${A.id}/finance/close`, { version: view.finance!.version, requestId: uuid() })).statusCode).toBe(403)
    view = (await adnan.post(`/api/rentals/${A.id}/finance/close`, { version: view.finance!.version, requestId: uuid() })).json()
    expect(view.finance).toMatchObject({ status: 'closed', closed: { name: 'Adnan Kovač' } })
    expect((await selma.post(`/api/rentals/${A.id}/finance/payments`, { method: 'cash', cashAck: true, amount: '1,00', payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })).json().error.code).toBe('FINANCE_CLOSED')
    expect((await adnan.post(`/api/rentals/${A.id}/finance/reopen`, { version: view.finance!.version, requestId: uuid() })).statusCode).toBe(400)
    view = (await adnan.post(`/api/rentals/${A.id}/finance/reopen`, { version: view.finance!.version, requestId: uuid(), reason: 'Sonradan gelen ceza kaydı' })).json()
    expect(view.finance).toMatchObject({ status: 'reopened', reopenReason: 'Sonradan gelen ceza kaydı' })
    // The rental's operational status never changed with finance.
    expect((await one(`select status from rentals where id = $1`, [A.id])).status).toBe('delivered')
  })
})

describe('isolation, scope and lists', () => {
  it('another company sees nothing and cannot act on known ids', async () => {
    const p = view.payments[0]!
    expect((await lejla.get(`/api/rentals/${A.id}/finance`)).statusCode).toBe(404)
    expect((await lejla.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() })).statusCode).toBe(404)
    expect((await lejla.post(`/api/finance/deposits/${view.deposits[0]!.id}/refunds`, { amount: '1,00', method: 'cash', reason: 'Deneme', requestId: uuid() })).statusCode).toBe(404)
    for (const t of ['rental_finances', 'finance_charges', 'finance_payments', 'finance_deposits', 'finance_deposit_refunds', 'finance_events']) {
      expect(await asApp(data.companies.neretva, async (c) => (await c.query(`select count(*)::int n from ${t}`)).rows[0].n), t).toBe(0)
    }
    expect((await lejla.post('/api/finance/payments/search', {})).json().items).toEqual([])
  })

  it('branch scope: Operasyon (SJJ) cannot see or act on a rental of another branch; Operasyon has no reports', async () => {
    const vehicleId = (await one(`select id from vehicles where plate = 'K71-J-904'`)).id
    const ekonomi = (await one(`select id from vehicle_classes where name = 'Ekonomi'`)).id
    const r = (await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: ekonomi, vehicleId, pickupBranchId: ids.sac, returnBranchId: ids.sac, pickupLocal: local(5, '10:00'), returnLocal: local(6, '10:00'), requestId: uuid() })).json()
    ids.sacRental = r.id
    expect((await selma.get(`/api/rentals/${r.id}/finance`)).statusCode).toBe(404)
    expect((await selma.post(`/api/rentals/${r.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: uuid() })).statusCode).toBe(404)
    expect((await selma.post('/api/finance/payments/search', {})).statusCode).toBe(403)
    expect((await selma.get('/api/finance/pending')).statusCode).toBe(403)
  })

  it('lists, pending queue and summary: per currency, never summed across currencies, from real records only', async () => {
    const list = (await adnan.post('/api/finance/payments/search', { currency: 'EUR', sort: 'amount_desc' })).json()
    expect(list.total).toBeGreaterThanOrEqual(4)
    expect(list.items[0].amountMinor).toBeGreaterThanOrEqual(list.items[1].amountMinor)
    expect(list.items.every((p: { currency: string; rental: { no: string } }) => p.currency === 'EUR' && /^K-/.test(p.rental.no))).toBe(true)
    expect((await adnan.post('/api/finance/payments/search', { status: 'reversed' })).json().items.map((p: { status: string }) => p.status)).toEqual(['reversed'])
    const pending = (await adnan.get('/api/finance/pending')).json()
    expect(pending.charges.map((c: { rental: { no: string } }) => c.rental.no)).toContain(B.rentalNo)
    const summary = (await adnan.post('/api/finance/summary', {})).json().rows as { currency: string; verifiedPaymentsMinor: number; depositsHeldMinor: number; refundsCompletedMinor: number }[]
    expect(summary.map((r) => r.currency)).toEqual(['BAM', 'EUR'])
    expect(summary.find((r) => r.currency === 'BAM')).toMatchObject({ verifiedPaymentsMinor: 0, depositsHeldMinor: 0, refundsCompletedMinor: 30_000 })
    expect(summary.find((r) => r.currency === 'EUR')!.verifiedPaymentsMinor).toBe(11_700)
    const files = (await adnan.post('/api/finance/files/search', { q: A.rentalNo })).json()
    expect(files.items[0]).toMatchObject({ rental: { no: A.rentalNo }, status: 'reopened', totals: { currency: 'EUR', outstandingMinor: 0 } })
    const events = (await adnan.post('/api/finance/events/search', { q: A.rentalNo, pageSize: 100 })).json()
    expect(events.total).toBeGreaterThan(15)
  })

  it('statements: the customer sees what she is responsible for; a corporate-responsible rental stays with the account', async () => {
    const C = await rentalWithQuote('M87-J-529', false, { corporateAccountId: ids.corp, pickupLocal: local(8, '10:00'), returnLocal: local(9, '10:00') })
    expect((await adnan.post(`/api/rentals/${C.id}/finance/open`, { currency: 'EUR', responsibleType: 'corporate', requestId: uuid() })).statusCode).toBe(201)
    const cust = (await adnan.get(`/api/customers/${ids.ajla}/finance`)).json()
    expect(cust.files.map((f: { rental: { no: string } }) => f.rental.no)).toEqual(expect.arrayContaining([A.rentalNo, C.rentalNo]))
    // Personal totals only count files where the customer is responsible.
    expect(cust.totals.find((t: { currency: string }) => t.currency === 'EUR').postedMinor).toBe(11_700)
    expect(cust.files.find((f: { rental: { no: string } }) => f.rental.no === C.rentalNo).responsible.type).toBe('corporate')
    const corp = (await adnan.get(`/api/corporate-accounts/${ids.corp}/finance`)).json()
    expect(corp.files.map((f: { rental: { no: string } }) => f.rental.no)).toEqual([C.rentalNo])
    expect((await lejla.get(`/api/customers/${ids.ajla}/finance`)).statusCode).toBe(404)
  })

})

describe('integration review: decisions FN1–FN7 and security', () => {
  it('an unpriced file (no posted line) is never closed as settled at zero', async () => {
    const vehicleId = (await one(`select id from vehicles where plate = 'A12-K-345'`)).id
    const r = (await adnan.post('/api/rentals', { customerId: ids.ajla, drivers: [{ customerId: ids.ajla, isPrimary: true }], vehicleClassId: ids.orta, vehicleId, pickupBranchId: ids.sjj, returnBranchId: ids.sjj, pickupLocal: local(30, '10:00'), returnLocal: local(31, '10:00'), requestId: uuid() })).json()
    const v = (await adnan.post(`/api/rentals/${r.id}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: uuid() })).json() as RentalFinanceView
    expect(v.totals).toMatchObject({ outstandingMinor: 0, overpaidMinor: 0 })
    expect(v.closeBlockers).toEqual(['no_posted_charges'])
    const res = await adnan.post(`/api/rentals/${r.id}/finance/close`, { version: v.finance!.version, requestId: uuid() })
    expect(res.json().error.code).toBe('CLOSE_BLOCKED')
    await expect(asOwner(data.companies.drina, `update rental_finances set status = 'closed', closed_at = now() where id = $1`, [v.finance!.id])).rejects.toThrow(/without a posted line/)
  })

  it('FN1: a payment is reversed only by someone other than its recorder; a deposit return only by someone other than its reporter', async () => {
    let v = await fin(adnan, A.id)
    v = (await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'manual', description: 'Ek temizlik', amount: '10,00', reason: 'Gözden geçirme testi', requestId: uuid() })).json()
    const ch = v.charges.find((c) => c.status === 'pending')!
    v = (await kontrol.post(`/api/finance/charges/${ch.id}/approve`, { version: ch.version, requestId: uuid() })).json()
    v = (await adnan.post(`/api/rentals/${A.id}/finance/payments`, { method: 'cash', cashAck: true, amount: '10,00', payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })).json()
    const p = v.payments.find((x) => x.status === 'recorded')!
    v = (await kontrol.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() })).json()
    const self = await adnan.post(`/api/finance/payments/${p.id}/reverse`, { version: p.version + 1, requestId: uuid(), reason: 'Kendi kaydımı geri alıyorum' })
    expect(self.json().error.code).toBe('FOUR_EYES')
    await expect(asOwner(data.companies.drina, `update finance_payments set status = 'reversed', reversal_reason = 'x x x', reversed_at = now(), reversed_by = created_by where id = $1`, [p.id])).rejects.toThrow()
    expect((await kontrol.post(`/api/finance/payments/${p.id}/reverse`, { version: p.version + 1, requestId: uuid(), reason: 'İkinci yetkili düzeltmesi' })).statusCode).toBe(200)
    // Close the file again (settled) for the next tests.
    v = await fin(adnan, A.id)
    const again = v.charges.find((c) => c.id === ch.id)!
    v = (await adnan.post(`/api/finance/charges/${again.id}/reversal-request`, { version: again.version, requestId: uuid(), reason: 'Test kalemi geri alınıyor' })).json()
    v = (await kontrol.post(`/api/finance/charges/${again.id}/reversal-approve`, { version: again.version + 1, requestId: uuid() })).json()
    expect(v.closeBlockers).toEqual([])
  })

  it('a permission removed while working stops the next step at once (checked on every request)', async () => {
    let v = (await adnan.post(`/api/rentals/${A.id}/finance/payments`, { method: 'other_external', amount: '0,01', payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })).json() as RentalFinanceView
    if ((v as unknown as { error?: unknown }).error) {
      // The file is fully paid: add a small line first.
      v = (await adnan.post(`/api/rentals/${A.id}/finance/charges`, { kind: 'manual', description: 'Yetki testi', amount: '0,01', reason: 'Yetki testi kalemi', requestId: uuid() })).json()
      v = (await adnan.post(`/api/rentals/${A.id}/finance/payments`, { method: 'other_external', amount: '0,01', payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })).json()
    }
    const p = v.payments.find((x) => x.status === 'recorded')!
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'finance.payments.verify') where name = 'Yönetici'`)
    try {
      expect((await kontrol.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() })).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'finance.payments.verify') where name = 'Yönetici'`)
    }
    expect((await kontrol.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() })).statusCode).toBe(200)
  })

  it('branch scope on every finance mutation: a SJJ-only approver cannot act on a SAC rental', async () => {
    // A synthetic user with the Yönetici permissions, limited to SJJ.
    const perms = (await one(`select permissions from roles where name = 'Yönetici'`)).permissions
    const role = (await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Finans SJJ', $2) returning id`, [data.companies.drina, perms])).rows[0].id
    const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'sjjfinans@drina-demo.ba', 'SJJ Finans', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
    const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'no') returning id`, [data.companies.drina, user])).rows[0].id
    await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
    await asOwner(data.companies.drina, `insert into membership_branches (company_id, membership_id, branch_id) values ($1, $2, $3)`, [data.companies.drina, m, ids.sjj])
    const sjj = await login('sjjfinans@drina-demo.ba')
    // The SAC rental: file, a pending line, a recorded payment, a reported and verified deposit with a return.
    const rid = ids.sacRental
    let v = (await adnan.post(`/api/rentals/${rid}/finance/open`, { currency: 'EUR', responsibleType: 'customer', requestId: uuid() })).json() as RentalFinanceView
    v = (await adnan.post(`/api/rentals/${rid}/finance/charges`, { kind: 'manual', description: 'Kapsam testi', amount: '50,00', reason: 'Şube kapsamı testi', requestId: uuid() })).json()
    v = (await adnan.post(`/api/rentals/${rid}/finance/payments`, { method: 'cash', cashAck: true, amount: '20,00', payerType: 'customer', payerCustomerId: ids.ajla, requestId: uuid() })).json()
    v = (await adnan.post(`/api/rentals/${rid}/finance/deposits`, { currency: 'EUR', amount: '100,00', received: true, method: 'cash', cashAck: true, requestId: uuid() })).json()
    const d0 = v.deposits[0]!
    v = (await kontrol.post(`/api/finance/deposits/${d0.id}/verify`, { version: d0.version, requestId: uuid() })).json()
    v = (await adnan.post(`/api/finance/deposits/${d0.id}/refunds`, { amount: '10,00', method: 'cash', reason: 'Kapsam testi iadesi', requestId: uuid() })).json()
    const [c, p, d, r] = [v.charges[0]!, v.payments[0]!, v.deposits[0]!, v.deposits[0]!.refunds[0]!]
    const attempts = [
      sjj.get(`/api/rentals/${rid}/finance`),
      sjj.post(`/api/finance/charges/${c.id}/approve`, { version: c.version, requestId: uuid() }),
      sjj.post(`/api/finance/payments/${p.id}/verify`, { version: p.version, requestId: uuid() }),
      sjj.post(`/api/finance/payments/${p.id}/reverse`, { version: p.version, requestId: uuid(), reason: 'Kapsam dışı deneme' }),
      sjj.post(`/api/finance/deposits/${d.id}/review`, { version: d.version, requestId: uuid(), inReview: true, reason: 'Kapsam dışı deneme' }),
      sjj.post(`/api/finance/deposits/${d.id}/refunds`, { amount: '1,00', method: 'cash', reason: 'Kapsam dışı deneme', requestId: uuid() }),
      sjj.post(`/api/finance/refunds/${r.id}/approve`, { version: r.version, requestId: uuid() }),
      sjj.post(`/api/rentals/${rid}/finance/close`, { version: v.finance!.version, requestId: uuid() }),
      sjj.post(`/api/rentals/${rid}/finance/reopen`, { version: v.finance!.version, requestId: uuid(), reason: 'Kapsam dışı deneme' }),
      sjj.post(`/api/rentals/${rid}/finance/charges`, { kind: 'manual', description: 'Kapsam dışı', amount: '1,00', reason: 'Kapsam dışı deneme', requestId: uuid() }),
    ]
    for (const res of await Promise.all(attempts)) expect([403, 404], res.body).toContain(res.statusCode)
    // Nothing changed.
    const after = await fin(adnan, rid)
    expect(after.charges[0]!.status).toBe('pending')
    expect(after.payments[0]!.status).toBe('recorded')
    expect(after.deposits[0]!.refunds[0]!.status).toBe('requested')
    expect(after.finance!.status).toBe('open')
  })

  it('FN5: the responsible party of a file cannot be changed or moved (database); FN6: no automatic extra charges', async () => {
    const v = await fin(adnan, A.id)
    await expect(asOwner(data.companies.drina, `update rental_finances set responsible_type = 'corporate', responsible_customer_id = null, responsible_corporate_id = $2 where id = $1`, [v.finance!.id, ids.corp])).rejects.toThrow(/identity/)
    await expect(asOwner(data.companies.drina, `update finance_payments set finance_id = (select id from rental_finances where id <> $1 limit 1) where finance_id = $1`, [v.finance!.id])).rejects.toThrow()
    // Only lines made by people exist: no late, mileage, fuel or damage line was ever created by the system.
    const kinds = (await asOwner(data.companies.drina, `select distinct kind, created_by is not null as by_person from finance_charges`)).rows
    expect(kinds.every((k) => k.by_person)).toBe(true)
    expect(kinds.map((k) => k.kind).sort()).toEqual(['manual', 'quote'])
  })
})

describe('personal data', () => {
  it('no personal or card data in history, audit log or server logs', async () => {
    const events = JSON.stringify((await asOwner(data.companies.drina, `select data from finance_events`)).rows)
    const audits = JSON.stringify((await asOwner(data.companies.drina, `select summary from audit_log where action like 'finance.%'`)).rows)
    for (const text of [events, audits, logs]) {
      expect(text).not.toMatch(/Üçüncü Kişi|Ajla|Testović|4111 1111|Hasar bulgusu değerlendiriliyor|Yanlış kiralamaya/)
    }
  })
})
