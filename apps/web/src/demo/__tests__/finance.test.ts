import { describe, expect, it } from 'vitest'
import { bucketNow, capacityCell, checkVehicleAvailable, readinessOf } from '../core/calc/availability'
import { cashByCurrency, projectCorporateExposure, rentalFinance } from '../core/calc/finance'
import { convertTenderToObligation } from '../core/calc/fx'
import { addFxRate, applyApproval, decideApproval, requestApproval } from '../core/ops/control'
import { closeSession, openSession, recordPayment, verifyByAnother, voidPayment, previewPayment, postCharge } from '../core/ops/finance'
import { confirmReservation, find } from '../core/ops/rentals'
import { DemoError } from '../core/helpers'
import { parseAmount } from '../core/money'
import { buildSeed } from '../core/seed'
import type { Db } from '../core/types'

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))

/** A fresh rental with exactly 500 EUR owed: the §64.2 demonstration rental. */
function scenarioRental(d: Db) {
  d.session.userId = 'u-owner'
  const base = d.rentals.find((r) => r.status === 'delivered' && r.currency === 'EUR')!
  const c = postCharge(d, { rentalId: base.id, kind: 'other', label: 'Test kalemi', amountMinor: 50000, key: `${base.id}:scenario:500` })
  return { rental: base, before: rentalFinance(d, base.id), charge: c }
}

describe('multi-payer, multi-currency collection (spec §64.2)', () => {
  it('500 EUR: cash 100 EUR, card 200 BAM, 100 USD waits for a rate, then 80 EUR, then 220 EUR bank transfer → 0', () => {
    const d = mkDb()
    const { rental } = scenarioRental(d)
    const f0 = rentalFinance(d, rental.id)
    const owedBefore = f0.outstandingMinor
    // every line is recorded by the clerk and verified by somebody else before it reduces the balance
    const pay = (method: 'cash' | 'card' | 'transfer', minor: number, cur: string, who: string) => {
      const me = d.session.userId
      const p = recordPayment(d, { rentalId: rental.id, kind: 'payment', payer: { type: 'other', name: who }, method, tenderMinor: minor, tenderCur: cur, branchId: 'b-sjj', reference: method === 'card' ? 'POS-TEST' : '' })
      verifyByAnother(d, { payment: p })
      d.session.userId = me
      return p
    }
    d.session.userId = 'u-ops1'
    // 1 · Person A, cash 100 EUR into the EUR drawer
    const eurBefore = cashByCurrency(d, 'b-sjj').EUR!
    pay('cash', 10000, 'EUR', 'Kişi A')
    expect(rentalFinance(d, rental.id).outstandingMinor).toBe(owedBefore - 10000)
    expect(cashByCurrency(d, 'b-sjj').EUR).toBe(eurBefore + 10000)
    // 2 · Person A, card 200 BAM = 100 EUR at 1 EUR = 2 BAM; a card line never enters the cash drawer
    const bamBefore = cashByCurrency(d, 'b-sjj').BAM!
    pay('card', 20000, 'BAM', 'Kişi A')
    expect(rentalFinance(d, rental.id).outstandingMinor).toBe(owedBefore - 20000)
    expect(cashByCurrency(d, 'b-sjj').BAM).toBe(bamBefore)
    // 3 · Person B, 100 USD: no USD rate yet → nothing is stored, outstanding does not move
    const paymentsBefore = d.payments.length
    expect(() => pay('cash', 10000, 'USD', 'Kişi B')).toThrow(/Kur Bekleniyor|işletme kuru/)
    expect(d.payments.length).toBe(paymentsBefore)
    expect(rentalFinance(d, rental.id).outstandingMinor).toBe(owedBefore - 20000)
    // The admin defines 1 EUR = 1.25 USD in the single rate desk; the old payments are untouched.
    d.session.userId = 'u-owner'
    addFxRate(d, { base: 'EUR', quote: 'USD', rate: 1.25, purpose: 'tender', scope: 'company', validFrom: d.clock.now, validUntil: null, autoInverse: true, note: 'Demo senaryo kuru' })
    d.session.userId = 'u-ops1'
    const usdBefore = cashByCurrency(d, 'b-sjj').USD!
    pay('cash', 10000, 'USD', 'Kişi B')
    expect(rentalFinance(d, rental.id).outstandingMinor).toBe(owedBefore - 20000 - 8000)
    expect(cashByCurrency(d, 'b-sjj').USD).toBe(usdBefore + 10000) // USD cash goes to the USD drawer
    // 4 · Person C: the remaining amount, bank transfer; the cash drawers do not move
    const rest = rentalFinance(d, rental.id).outstandingMinor
    const cashBefore = JSON.stringify(cashByCurrency(d, 'b-sjj'))
    pay('transfer', rest, 'EUR', 'Kişi C')
    expect(rentalFinance(d, rental.id).outstandingMinor).toBe(0)
    expect(JSON.stringify(cashByCurrency(d, 'b-sjj'))).toBe(cashBefore)
    // Rate snapshots are pinned: changing the rate later does not recompute the USD line.
    const usdLine = d.payments.find((p) => p.rentalId === rental.id && p.tender.cur === 'USD')!
    expect(usdLine.appliedMinor).toBe(8000)
    expect(usdLine.rate?.rate).toBe(1.25)
  })

  it('the exact §64.2 numbers on a 500 EUR obligation', () => {
    const d = mkDb()
    expect(convertTenderToObligation(d.fxRates, { tenderMinor: 20000, tender: 'BAM', obligation: 'EUR', branchId: 'b-sjj', at: d.clock.now })).toMatchObject({ ok: true, appliedMinor: 10000 })
    expect(convertTenderToObligation(d.fxRates, { tenderMinor: 10000, tender: 'USD', obligation: 'EUR', branchId: 'b-sjj', at: d.clock.now })).toMatchObject({ ok: false, code: 'AWAITING_RATE' })
    d.session.userId = 'u-owner'
    addFxRate(d, { base: 'EUR', quote: 'USD', rate: 1.25, purpose: 'tender', scope: 'company', validFrom: d.clock.now, validUntil: null, autoInverse: true, note: 'Demo senaryo kuru' })
    expect(convertTenderToObligation(d.fxRates, { tenderMinor: 10000, tender: 'USD', obligation: 'EUR', branchId: 'b-sjj', at: d.clock.now })).toMatchObject({ ok: true, appliedMinor: 8000 })
  })

  it('an inverse rate without "automatic inverse" is not used; a branch rate wins over the company rate; conflicting equal rates are an error', () => {
    const d = mkDb()
    d.session.userId = 'u-owner'
    addFxRate(d, { base: 'EUR', quote: 'USD', rate: 1.25, purpose: 'tender', scope: 'company', validFrom: d.clock.now, validUntil: null, autoInverse: false, note: 'Ters kur kapalı' })
    expect(previewPayment(d, { tenderMinor: 10000, tenderCur: 'USD', branchId: 'b-sjj', obligationCur: 'EUR' })).toMatchObject({ ok: false })
    expect(() => addFxRate(d, { base: 'EUR', quote: 'USD', rate: 1.3, purpose: 'tender', scope: 'company', validFrom: d.clock.now, validUntil: null, autoInverse: true, note: 'Çakışan kur' })).toThrow(/zaten var/)
    addFxRate(d, { base: 'USD', quote: 'EUR', rate: 0.78, purpose: 'tender', scope: 'b-sjj', validFrom: d.clock.now, validUntil: null, autoInverse: false, note: 'Şube kuru' })
    expect(previewPayment(d, { tenderMinor: 10000, tenderCur: 'USD', branchId: 'b-sjj', obligationCur: 'EUR' })).toMatchObject({ ok: true, appliedMinor: 7800 })
    expect(() => addFxRate(d, { base: 'EUR', quote: 'USD', rate: -1, purpose: 'tender', scope: 'company', validFrom: d.clock.now, validUntil: null, autoInverse: true, note: 'Negatif' })).toThrow(DemoError)
  })

  it('cash needs an open drawer of that currency; a voided cash payment leaves the drawer again and re-opens the balance', () => {
    const d = mkDb()
    const { rental } = scenarioRental(d)
    d.session.userId = 'u-ops1'
    // MST EUR drawer is closed: cash EUR at MST is refused.
    expect(() => recordPayment(d, { rentalId: rental.id, kind: 'payment', payer: { type: 'other', name: 'X' }, method: 'cash', tenderMinor: 1000, tenderCur: 'EUR', branchId: 'b-mst' })).toThrow(/kapalı/)
    const before = rentalFinance(d, rental.id).outstandingMinor
    const p = recordPayment(d, { rentalId: rental.id, kind: 'payment', payer: { type: 'other', name: 'X' }, method: 'cash', tenderMinor: 5000, tenderCur: 'EUR', branchId: 'b-sjj' })
    const cash = cashByCurrency(d, 'b-sjj').EUR!
    // a reversal is a level-2 action: a direct void is refused; it happens only through an approved and applied Financial Correction
    d.session.userId = 'u-owner'
    expect(() => voidPayment(d, p.id, 'Hatalı giriş')).toThrow(/yüksek riskli|high-risk/)
    d.session.userId = 'u-mgr'
    const corr = requestApproval(d, { type: 'financial_correction', target: { type: 'payment', id: p.id }, reason: 'Hatalı giriş: yanlış kiralama', requested: null })
    expect(corr.risk).toBe(2)
    d.session.userId = 'u-mgr2'
    decideApproval(d, corr.id, 'approve', 'Evrak kontrol edildi')
    d.session.userId = 'u-owner'
    applyApproval(d, corr.id)
    expect(rentalFinance(d, rental.id).outstandingMinor).toBe(before)
    expect(cashByCurrency(d, 'b-sjj').EUR).toBe(cash - 5000)
    expect(() => voidPayment(d, p.id, 'Tekrar')).toThrow(/yüksek riskli|high-risk/)
  })

  it('a shift close compares expected and counted cash per currency; a difference over the limit needs a reason', () => {
    const d = mkDb()
    d.session.userId = 'u-owner'
    openSession(d, 'dr-mst-EUR', 20000)
    expect(() => closeSession(d, 'dr-mst-EUR', 15000, '', 'u-mgr')).toThrow(/Gerekçe|gerekçe/)
    closeSession(d, 'dr-mst-EUR', 19800, '', 'u-mgr')
    const s = d.cashSessions.find((x) => x.drawerId === 'dr-mst-EUR' && x.closedAt)!
    expect(s).toMatchObject({ expectedMinor: 20000, countedMinor: 19800, varianceMinor: -200 })
  })

  it('posting the same charge key twice creates one charge', () => {
    const d = mkDb()
    d.session.userId = 'u-owner'
    const r = d.rentals.find((x) => x.status === 'delivered')!
    const a = postCharge(d, { rentalId: r.id, kind: 'other', label: 'x', amountMinor: 1000, key: `${r.id}:dup` })
    const b = postCharge(d, { rentalId: r.id, kind: 'other', label: 'x', amountMinor: 1000, key: `${r.id}:dup` })
    expect(a.id).toBe(b.id)
    expect(d.charges.filter((c) => c.key === `${r.id}:dup`)).toHaveLength(1)
  })
})

describe('money parsing', () => {
  it('parses typed amounts into minor units', () => {
    expect(parseAmount('1.234,50', 'EUR')).toBe(123450)
    expect(parseAmount('1,234.50', 'EUR')).toBe(123450)
    expect(parseAmount('100', 'EUR')).toBe(10000)
    expect(parseAmount('12,5', 'EUR')).toBe(1250)
    expect(parseAmount('1.234.567', 'EUR')).toBe(123456700)
    expect(parseAmount('12,345', 'EUR')).toBeNull()
    expect(parseAmount('abc', 'EUR')).toBeNull()
    expect(parseAmount('1000', 'JPY')).toBe(1000)
  })
})

describe('one availability truth', () => {
  it('buckets, holds and capacity agree with each other', () => {
    const d = mkDb()
    const buckets: Record<string, number> = {}
    for (const v of d.vehicles) {
      const b = bucketNow(d, v, d.clock.now)
      buckets[b] = (buckets[b] ?? 0) + 1
    }
    expect(Object.values(buckets).reduce((a, b) => a + b, 0)).toBe(d.vehicles.length)
    expect(buckets.rented).toBeGreaterThanOrEqual(8)
    expect(buckets.maintenance).toBe(1) // v17 in service
    expect(buckets.unavailable).toBeGreaterThanOrEqual(1) // v16 damage block
    // The overdue delivered rental still holds its vehicle (open-ended) even though its planned return passed.
    const overdue = d.rentals.find((r) => r.status === 'delivered' && Date.parse(r.plannedReturnAt) < Date.parse(d.clock.now))!
    const v = find.vehicle(d, overdue.vehicleId)!
    expect(bucketNow(d, v, d.clock.now)).toBe('rented')
    expect(checkVehicleAvailable(d, v, d.clock.now, new Date(Date.parse(d.clock.now) + 3_600_000).toISOString(), d.clock.now).ok).toBe(false)
  })

  it('a vehicle can be available and still not ready; maintenance completion does not make it ready', () => {
    const d = mkDb()
    const v2 = d.vehicles.find((v) => v.plate === 'S11-K-102')!
    expect(bucketNow(d, v2, d.clock.now)).toBe('available')
    const r = readinessOf(d, v2, d.clock.now)
    expect(r.ready).toBe(false) // returned yesterday: not cleaned, fuel half
  })

  it('V1: pending class requests hold nothing; a class-only confirmation is refused outside the V1.5 concept preview', () => {
    const d = mkDb()
    const day = d.clock.now.slice(0, 10)
    const branch = d.branches.find((b) => b.id === 'b-mst')!
    const before = capacityCell(d, branch, 'cl-eco', day)
    // the seeded Mostar class request is pending: it does not reduce capacity
    expect(d.reservations.some((r) => r.status === 'pending' && !r.vehicleId && r.pickupBranchId === 'b-mst')).toBe(true)
    expect(before.classOnly).toBe(0)
    expect(before.available).toBe(before.total - before.blocked - before.allocated - before.classOnly)
    const pending = d.reservations.find((r) => r.status === 'pending' && !r.vehicleId)!
    d.session.userId = 'u-mgr'
    expect(() => confirmReservation(d, pending.id)).toThrow(/belirli bir araç|specific vehicle/)
    // the concept preview keeps the V1.5 class-capacity behaviour available for inspection
    d.session.preview = true
    expect(() => confirmReservation(d, pending.id)).not.toThrow(/belirli bir araç/)
  })
})

describe('corporate exposure is per currency and never double counts', () => {
  it('a delivered corporate rental counts once, as receivable; no limit is not unlimited', () => {
    const d = mkDb()
    const rows = projectCorporateExposure(d, 'co1')
    const eur = rows.find((r) => r.cur === 'EUR')!
    expect(eur.limitMinor).toBe(2000000)
    expect(eur.postedReceivableMinor).toBeGreaterThan(0)
    expect(eur.exposureMinor).toBe(eur.committedMinor + eur.postedReceivableMinor)
    const una = projectCorporateExposure(d, 'co3')
    expect(una.find((r) => r.cur === 'BAM')?.limitMinor ?? null).toBeNull()
  })
})
