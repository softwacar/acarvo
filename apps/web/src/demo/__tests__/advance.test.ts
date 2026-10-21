import { describe, expect, it } from 'vitest'
import { advanceLedger, rentalFinance } from '../core/calc/finance'
import { cancellationFee } from '../core/calc/policy'
import { DemoError } from '../core/helpers'
import { applyApproval, decideApproval, requestApproval } from '../core/ops/control'
import { applyHeldAdvances, settleAdvance, voidPayment } from '../core/ops/finance'
import { cancelReservation, convertReservation, deliverRental, signContract, updateGate } from '../core/ops/rentals'
import { buildSeed } from '../core/seed'
import type { Db, Payment, Reservation } from '../core/types'

// Advance (kaparo) lifecycle: held → moved to the rental → applied once at delivery, or cancelled: the company policy computes the fee
// by itself, the rest can be refunded in whole or in part (never twice), a deviation needs an independent approval.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => { d.session.userId = id }
const err = (fn: () => unknown) => { try { fn() } catch (e) { return e instanceof DemoError ? e.message : String(e) } return null }
const errCode = (fn: () => unknown) => { try { fn() } catch (e) { return e instanceof DemoError ? e.code : String(e) } return null }

const byRef = (d: Db, ref: string): Payment => d.payments.find((p) => p.reference === ref)!
const storyAdvance = (d: Db) => byRef(d, 'POS-DEMO-KAP-0001')
const policyAdvance = (d: Db) => byRef(d, 'POS-DEMO-KAP-0004')
const resOf = (d: Db, p: Payment): Reservation => d.reservations.find((r) => r.id === p.reservationId)!

/** Refund of an advance through the formal approval: requested by the clerk, decided by a manager, applied by the owner. */
const refund = (d: Db, p: Payment, minor: number, reason = 'Müşteri talebi üzerine kısmi iade yapılıyor.') => {
  as(d, 'u-ops1')
  const ap = requestApproval(d, { type: 'refund', target: { type: 'reservation', id: p.reservationId! }, paymentId: p.id, requested: { minor, cur: p.tender.cur }, reason })
  as(d, 'u-mgr')
  decideApproval(d, ap.id, 'approve', 'Uygun')
  as(d, 'u-owner')
  applyApproval(d, ap.id)
  return ap
}

describe('advance seed data', () => {
  it('has a confirmed reservation with a realistic held advance (20 %) and the 200 EUR policy story, both verified by a second person', () => {
    const d = mkDb()
    const a = storyAdvance(d)
    const r = resOf(d, a)
    expect(r.status).toBe('confirmed')
    expect(r.vehicleId).toBeTruthy()
    expect(a.status).toBe('recorded')
    expect(a.advanceState).toBe('unapplied')
    expect(a.method).toBe('card')
    expect(a.tender.minor).toBe(Math.round(((r.price?.grossMinor ?? 0) * d.settings.payment.advanceRequiredPct) / 100))
    expect(a.verifiedBy && a.verifiedBy !== a.recordedBy).toBe(true)
    const p = policyAdvance(d)
    expect(p.tender).toEqual({ minor: 20000, cur: 'EUR' })
    expect(resOf(d, p).status).toBe('confirmed')
  })
  it('shows the other lifecycle ends: one refunded through approval after a free cancellation, one kept automatically after a no-show', () => {
    const d = mkDb()
    const refunded = d.payments.filter((p) => p.kind === 'advance' && p.advanceState === 'refunded')
    const forfeited = d.payments.filter((p) => p.kind === 'advance' && p.advanceState === 'forfeited')
    expect(refunded.length).toBe(1)
    expect(forfeited.length).toBe(1)
    expect(d.refunds.find((x) => x.paymentId === refunded[0]!.id)?.status).toBe('completed')
    expect(refunded[0]!.retainedMinor ?? 0).toBe(0) // free cancellation: no policy fee
    expect(forfeited[0]!.status).toBe('forfeited')
    expect(forfeited[0]!.policyFeeRule?.length).toBeGreaterThan(9) // the rule is written down, nobody typed a reason
    expect(forfeited[0]!.retainedMinor).toBe(forfeited[0]!.tender.minor)
  })
  it('is reseed-safe: building the seed again gives the same data, no duplicate customer or advance', () => {
    const a = mkDb()
    const b = mkDb()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(b.payments.filter((p) => p.kind === 'advance').length).toBe(4)
    expect(b.customers.filter((c) => c.name === 'Selma Hodžić-Demo').length).toBe(1)
  })
  it('an advance is neither revenue nor a deposit: no rental has it counted as collected or as a deposit', () => {
    const d = mkDb()
    const a = storyAdvance(d)
    expect(d.deposits.some((x) => x.note.includes(a.no))).toBe(false)
    expect(d.rentals.some((x) => x.id === a.rentalId)).toBe(false)
  })
})

describe('advance conversion and application', () => {
  const deliver = (d: Db, r: Reservation) => {
    as(d, 'u-mgr')
    const rental = convertReservation(d, r.id)
    d.clock.now = rental.plannedPickupAt
    const v = d.vehicles.find((x) => x.id === rental.vehicleId)!
    v.readiness = { clean: true, fuelOk: true, checkedAt: d.clock.now, checkedBy: 'u-ops1', note: '' }
    const cu = d.customers.find((c) => c.id === rental.customerId)!
    signContract(d, rental.id, cu.name, true)
    updateGate(d, rental.id, { docsChecked: true, driverOk: true })
    return rental
  }

  it('conversion moves the advance to the rental exactly once as an unapplied advance; delivery applies it once', () => {
    const d = mkDb()
    const a = storyAdvance(d)
    const r = resOf(d, a)
    const rental = deliver(d, r)
    expect(a.rentalId).toBe(rental.id)
    expect(a.advanceState).toBe('transferred')
    expect(a.status).toBe('recorded')
    const before = rentalFinance(d, rental.id)
    expect(before.chargesMinor).toBe(0)
    expect(before.appliedMinor).toBe(0)
    expect(before.unappliedMinor).toBe(a.appliedMinor)
    if (rental.deposit.required.minor > 0) d.rentals.find((x) => x.id === rental.id)!.deposit.state = 'waived'
    as(d, 'u-ops1')
    deliverRental(d, rental.id, { km: d.vehicles.find((v) => v.id === rental.vehicleId)!.odometerKm, fuel: 'full', photos: 5, pins: [], note: '' })
    const after = rentalFinance(d, rental.id)
    expect(after.chargesMinor).toBeGreaterThan(0)
    expect(a.status).toBe('applied')
    expect(a.advanceState).toBe('applied')
    expect(after.appliedMinor).toBe(a.appliedMinor)
    expect(after.outstandingMinor).toBe(after.chargesMinor - a.appliedMinor)
    const snapshot = JSON.stringify(a.allocations)
    applyHeldAdvances(d, d.rentals.find((x) => x.id === rental.id)!)
    applyHeldAdvances(d, d.rentals.find((x) => x.id === rental.id)!)
    expect(JSON.stringify(a.allocations)).toBe(snapshot)
    expect(rentalFinance(d, rental.id).appliedMinor).toBe(a.appliedMinor)
  })

  it('a refunded advance is not moved to the rental and never applied', () => {
    const d = mkDb()
    const a = storyAdvance(d)
    refund(d, a, a.tender.minor, 'Müşteri vazgeçti, tam iade.')
    expect(a.status).toBe('refunded')
    expect(a.advanceState).toBe('refunded')
    as(d, 'u-mgr')
    const rental = convertReservation(d, resOf(d, a).id)
    expect(a.rentalId).toBeUndefined()
    expect(rentalFinance(d, rental.id).unappliedMinor).toBe(0)
    applyHeldAdvances(d, rental)
    expect(a.allocations).toEqual([])
  })
})

describe('K-13: the cancellation policy, partial refund and the 200 / 50 / 150 EUR ledger', () => {
  it('cancelling inside the policy window computes the fee by itself: 200 EUR advance, 50 EUR policy fee, 150 EUR refundable', () => {
    const d = mkDb()
    const a = policyAdvance(d)
    as(d, 'u-ops1')
    cancelReservation(d, resOf(d, a).id, 'Müşteri uçuşunu iptal etti')
    const l = advanceLedger(d, a)
    expect(l.tenderMinor).toBe(20000)
    expect(l.retainedMinor).toBe(5000)
    expect(l.refundableMinor).toBe(15000)
    expect(l.remainingMinor).toBe(15000)
    expect(l.receivableMinor).toBe(0)
    expect(l.refundedMinor).toBe(0)
    expect(a.policyFeeRule).toBeTruthy()
    expect(a.status).toBe('recorded') // 150 EUR is still held for the customer
    expect(d.events.some((e) => e.type === 'AdvancePolicyFee' && e.minor === 5000)).toBe(true)
  })
  it('a cancellation far before the pickup is free: the whole advance is refundable', () => {
    const d = mkDb()
    const a = policyAdvance(d)
    const r = resOf(d, a)
    d.clock.now = new Date(Date.parse(r.pickupAt) - 5 * 86_400_000).toISOString()
    as(d, 'u-ops1')
    cancelReservation(d, r.id, 'Plan değişti')
    const l = advanceLedger(d, a)
    expect(l.retainedMinor).toBe(0)
    expect(l.refundableMinor).toBe(20000)
    expect(cancellationFee(d, r, d.clock.now, 'cancel').kind).toBe('free')
  })
  it('a partial refund of 100 EUR leaves 50 EUR usable and explicit; the same advance cannot be refunded twice', () => {
    const d = mkDb()
    const a = policyAdvance(d)
    as(d, 'u-ops1')
    cancelReservation(d, resOf(d, a).id, 'Müşteri uçuşunu iptal etti')
    refund(d, a, 10000)
    let l = advanceLedger(d, a)
    expect(l.refundedMinor).toBe(10000)
    expect(l.remainingMinor).toBe(5000)
    expect(l.refundableMinor).toBe(5000)
    expect(a.status).toBe('recorded') // still held: 50 EUR remains
    expect(a.advanceState).toBe('unapplied')
    // asking for more than what remains is refused, and so is a second full refund
    as(d, 'u-ops1')
    expect(errCode(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: a.reservationId! }, paymentId: a.id, requested: { minor: 10000, cur: 'EUR' }, reason: 'Aynı kaparo için ikinci iade.' }))).toBe('DEMO_RULE')
    expect(err(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: a.reservationId! }, paymentId: a.id, requested: { minor: 10000, cur: 'EUR' }, reason: 'Aynı kaparo için ikinci iade.' }))).toMatch(/aşıyor|exceeds/)
    // the last 50 EUR closes the advance
    refund(d, a, 5000)
    l = advanceLedger(d, a)
    expect(l.remainingMinor).toBe(0)
    expect(a.status).toBe('refunded')
    expect(a.advanceState).toBe('refunded')
    expect(l.retainedMinor).toBe(5000) // the policy fee line stays visible
  })
  it('an open refund request counts against what is refundable (no double request for the same money)', () => {
    const d = mkDb()
    const a = policyAdvance(d)
    as(d, 'u-ops1')
    cancelReservation(d, resOf(d, a).id, 'Müşteri uçuşunu iptal etti')
    requestApproval(d, { type: 'refund', target: { type: 'reservation', id: a.reservationId! }, paymentId: a.id, requested: { minor: 12000, cur: 'EUR' }, reason: 'Kısmi iade istendi, ikinci kişi karar verecek.' })
    expect(advanceLedger(d, a).pendingRefundMinor).toBe(12000)
    expect(advanceLedger(d, a).refundableMinor).toBe(3000)
    expect(err(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: a.reservationId! }, paymentId: a.id, requested: { minor: 5000, cur: 'EUR' }, reason: 'Ek iade istenmesi deneniyor.' }))).toMatch(/açık|open|aşıyor|exceeds/)
  })
  it('a no-show keeps the advance by the no-show policy; a fee above the advance is a customer receivable, not a debt hidden in the advance', () => {
    const d = mkDb()
    const f = d.payments.find((p) => p.kind === 'advance' && p.advanceState === 'forfeited')!
    const l = advanceLedger(d, f)
    expect(l.refundableMinor).toBe(0)
    expect(l.remainingMinor).toBe(0)
    expect(l.receivableMinor).toBe((f.policyFeeMinor ?? 0) - f.tender.minor)
    expect(l.receivableMinor).toBeGreaterThan(0)
    as(d, 'u-ops1')
    expect(err(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: f.reservationId! }, paymentId: f.id, requested: f.tender, reason: 'Politika bedeli iade edilsin.' }))).toBeTruthy()
  })
  it('the standard fee needs no formal approval, but staff cannot change it; a deviation is a Financial Correction that another authorizer approves', () => {
    const d = mkDb()
    const a = policyAdvance(d)
    as(d, 'u-ops1')
    cancelReservation(d, resOf(d, a).id, 'Müşteri uçuşunu iptal etti')
    expect(d.approvals.some((x) => x.target.id === a.id)).toBe(false) // computed without an approval
    // there is no operation that takes an amount from the clerk; the fee can only change through an approved correction
    expect(err(() => settleAdvance(d, a.id))).toBeTruthy() // already computed
    as(d, 'u-ops1')
    expect(errCode(() => requestApproval(d, { type: 'financial_correction', target: { type: 'payment', id: a.id }, adjust: { paymentId: a.id, retainedMinor: 0 }, reason: 'Müşteri ilişkisi nedeniyle bedel kaldırılsın.', requested: null }))).toBe('LEVEL2_LOCKED') // a clerk cannot start a level-2 action
    as(d, 'u-mgr')
    const ap = requestApproval(d, { type: 'financial_correction', target: { type: 'payment', id: a.id }, adjust: { paymentId: a.id, retainedMinor: 0 }, reason: 'Müşteri ilişkisi nedeniyle bedel kaldırılsın.', requested: null })
    expect(ap.risk).toBe(2)
    expect(a.retainedMinor).toBe(5000) // nothing changed yet
    as(d, 'u-mgr2')
    decideApproval(d, ap.id, 'approve', 'Yönetim kararı')
    expect(a.retainedMinor).toBe(5000) // approved is not applied
    as(d, 'u-owner')
    applyApproval(d, ap.id)
    expect(a.retainedMinor).toBe(0)
    expect(advanceLedger(d, a).refundableMinor).toBe(20000)
  })
  it('the old direct reversal of an advance stays refused', () => {
    const d = mkDb()
    as(d, 'u-owner')
    expect(err(() => voidPayment(d, policyAdvance(d).id, 'Geri alma denemesi yapılıyor'))).toBeTruthy()
  })
})

describe('independent approval is honest in a two-person company (the Drina case)', () => {
  const drina = (): Db => {
    const d = mkDb()
    for (const u of d.users) if (!['u-owner', 'u-ops1'].includes(u.id)) u.status = 'inactive'
    return d
  }
  it('a level-2 action is locked, while routine verification and a routine refund keep working', () => {
    const d = drina()
    const a = policyAdvance(d)
    as(d, 'u-owner')
    expect(errCode(() => requestApproval(d, { type: 'financial_correction', target: { type: 'payment', id: a.id }, adjust: { paymentId: a.id, retainedMinor: 0 }, reason: 'Bedel kaldırılsın lütfen, müşteri.', requested: null }))).toBe('LEVEL2_LOCKED')
    // a clerk's routine refund request is decided by the owner: it works
    as(d, 'u-ops1')
    cancelReservation(d, resOf(d, a).id, 'Müşteri uçuşunu iptal etti')
    const ap = requestApproval(d, { type: 'refund', target: { type: 'reservation', id: a.reservationId! }, paymentId: a.id, requested: { minor: 5000, cur: 'EUR' }, reason: 'Kısmi iade, müşteri talebi.' })
    as(d, 'u-owner')
    decideApproval(d, ap.id, 'approve', 'Uygun')
    expect(ap.status).toBe('approved')
  })
})
