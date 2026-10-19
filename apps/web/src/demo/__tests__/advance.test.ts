import { describe, expect, it } from 'vitest'
import { rentalFinance } from '../core/calc/finance'
import { DemoError } from '../core/helpers'
import { applyApproval, decideApproval, requestApproval } from '../core/ops/control'
import { applyHeldAdvances, forfeitAdvance, recordPayment, voidPayment } from '../core/ops/finance'
import { convertReservation, deliverRental, signContract, updateGate } from '../core/ops/rentals'
import { buildSeed } from '../core/seed'
import type { Db, Payment, Reservation } from '../core/types'

// Advance (kaparo) lifecycle, spec §65: held → moved to the rental → applied once at delivery, or refunded / kept as a policy fee.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => { d.session.userId = id }
const err = (fn: () => unknown) => { try { fn() } catch (e) { return e instanceof DemoError ? e.message : String(e) } return null }

const storyReservation = (d: Db): Reservation => {
  const c = d.customers.find((x) => x.name === 'Selma Hodžić-Demo')!
  return d.reservations.find((r) => r.customerId === c.id)!
}
const advancesOf = (d: Db, r: Reservation): Payment[] => d.payments.filter((p) => p.reservationId === r.id && p.kind === 'advance')

describe('advance seed data', () => {
  it('has one fictional customer with a confirmed reservation and a realistic held advance', () => {
    const d = mkDb()
    expect(d.customers.filter((c) => c.name === 'Selma Hodžić-Demo').length).toBe(1)
    const r = storyReservation(d)
    expect(r.status).toBe('confirmed')
    expect(r.vehicleId).toBeTruthy()
    const adv = advancesOf(d, r)
    expect(adv.length).toBe(1)
    const a = adv[0]!
    expect(a.status).toBe('recorded')
    expect(a.advanceState).toBe('unapplied')
    expect(a.method).toBe('card')
    expect(a.tender.cur).toBe(r.currency)
    expect(a.tender.minor).toBe(Math.round(((r.price?.grossMinor ?? 0) * d.settings.payment.advanceRequiredPct) / 100))
    expect(a.allocations).toEqual([])
    expect(a.rentalId).toBeUndefined()
  })
  it('shows the other lifecycle ends: one refunded through four-eyes approval, one kept as a policy fee', () => {
    const d = mkDb()
    const refunded = d.payments.filter((p) => p.kind === 'advance' && p.advanceState === 'refunded')
    const forfeited = d.payments.filter((p) => p.kind === 'advance' && p.advanceState === 'forfeited')
    expect(refunded.length).toBe(1)
    expect(forfeited.length).toBe(1)
    expect(refunded[0]!.status).toBe('refunded')
    expect(d.refunds.find((x) => x.paymentId === refunded[0]!.id)?.status).toBe('completed')
    expect(forfeited[0]!.status).toBe('forfeited')
    expect(forfeited[0]!.forfeitReason?.length).toBeGreaterThan(9)
  })
  it('is reseed-safe: building the seed again gives the same data, no duplicate customer or advance', () => {
    const a = mkDb()
    const b = mkDb()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(b.payments.filter((p) => p.kind === 'advance').length).toBe(3)
    expect(b.customers.filter((c) => c.name === 'Selma Hodžić-Demo').length).toBe(1)
  })
  it('an advance is neither revenue nor a deposit: no rental has it counted as collected or as a deposit', () => {
    const d = mkDb()
    const r = storyReservation(d)
    const a = advancesOf(d, r)[0]!
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
    const r = storyReservation(d)
    const a = advancesOf(d, r)[0]!
    const rental = deliver(d, r)
    expect(a.rentalId).toBe(rental.id)
    expect(a.advanceState).toBe('transferred')
    expect(a.status).toBe('recorded')
    // Before delivery there is no charge, so nothing is applied and the advance is shown as unapplied on the rental.
    const before = rentalFinance(d, rental.id)
    expect(before.chargesMinor).toBe(0)
    expect(before.appliedMinor).toBe(0)
    expect(before.unappliedMinor).toBe(a.appliedMinor)
    // Delivery posts the one base charge and applies the advance to it.
    if (rental.deposit.required.minor > 0) as(d, 'u-mgr')
    if (rental.deposit.required.minor > 0) d.rentals.find((x) => x.id === rental.id)!.deposit.state = 'waived'
    as(d, 'u-ops1')
    deliverRental(d, rental.id, { km: d.vehicles.find((v) => v.id === rental.vehicleId)!.odometerKm, fuel: 'full', photos: 5, pins: [], note: '' })
    const after = rentalFinance(d, rental.id)
    expect(after.chargesMinor).toBeGreaterThan(0)
    expect(a.status).toBe('applied')
    expect(a.advanceState).toBe('applied')
    expect(after.appliedMinor).toBe(a.appliedMinor)
    expect(after.outstandingMinor).toBe(after.chargesMinor - a.appliedMinor)
    expect(after.unappliedMinor).toBe(0)
    // Applying again changes nothing (never applied twice).
    const snapshot = JSON.stringify(a.allocations)
    applyHeldAdvances(d, d.rentals.find((x) => x.id === rental.id)!)
    applyHeldAdvances(d, d.rentals.find((x) => x.id === rental.id)!)
    expect(JSON.stringify(a.allocations)).toBe(snapshot)
    expect(rentalFinance(d, rental.id).appliedMinor).toBe(a.appliedMinor)
    // The linked reservation still points to the same advance and rental.
    expect(d.reservations.find((x) => x.id === r.id)!.rentalId).toBe(rental.id)
  })

  it('a refunded advance is not moved to the rental and never applied', () => {
    const d = mkDb()
    const r = storyReservation(d)
    const a = advancesOf(d, r)[0]!
    as(d, 'u-ops1')
    const ap = requestApproval(d, { type: 'refund', target: { type: 'reservation', id: r.id }, paymentId: a.id, requested: a.tender, reason: 'Müşteri vazgeçti, tam iade.' })
    as(d, 'u-mgr')
    decideApproval(d, ap.id, 'approve', '')
    as(d, 'u-owner')
    applyApproval(d, ap.id)
    expect(a.status).toBe('refunded')
    expect(a.advanceState).toBe('refunded')
    as(d, 'u-mgr')
    const rental = convertReservation(d, r.id)
    expect(a.rentalId).toBeUndefined()
    expect(a.advanceState).toBe('refunded')
    expect(rentalFinance(d, rental.id).unappliedMinor).toBe(0)
    applyHeldAdvances(d, rental)
    expect(a.allocations).toEqual([])
  })
})

describe('advance refund, policy fee and guards', () => {
  it('a refund must be the full amount and needs a second person; a second open request is blocked', () => {
    const d = mkDb()
    const r = storyReservation(d)
    const a = advancesOf(d, r)[0]!
    as(d, 'u-ops1')
    expect(err(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: r.id }, paymentId: a.id, requested: { minor: a.tender.minor - 100, cur: a.tender.cur }, reason: 'Kısmi iade denemesi yapılıyor.' }))).toMatch(/tamamı|full/i)
    const ap = requestApproval(d, { type: 'refund', target: { type: 'reservation', id: r.id }, paymentId: a.id, requested: a.tender, reason: 'Müşteri vazgeçti, tam iade.' })
    expect(err(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: r.id }, paymentId: a.id, requested: a.tender, reason: 'Aynı kaparo için ikinci talep.' }))).toBeTruthy()
    expect(err(() => decideApproval(d, ap.id, 'approve', ''))).toBeTruthy() // the requester cannot decide
    expect(a.status).toBe('recorded') // nothing moved yet
    as(d, 'u-mgr')
    decideApproval(d, ap.id, 'approve', '')
    expect(a.status).toBe('recorded') // approved is not applied
    as(d, 'u-owner')
    applyApproval(d, ap.id)
    expect(a.status).toBe('refunded')
    expect(err(() => applyApproval(d, ap.id))).toBeTruthy() // applied once
    expect(err(() => voidPayment(d, a.id, 'Geri alma denemesi yapılıyor'))).toBeTruthy()
  })
  it('a policy fee needs a cancelled or no-show reservation, a visible reason, and cannot be refunded afterwards', () => {
    const d = mkDb()
    const r = storyReservation(d)
    const a = advancesOf(d, r)[0]!
    as(d, 'u-mgr')
    expect(err(() => forfeitAdvance(d, a.id, 'Politika bedeli olarak tutulsun lütfen'))).toMatch(/iptal|cancel/i) // reservation still open
    const cancelled = d.reservations.find((x) => x.status === 'cancelled' && advancesOf(d, x).some((p) => p.advanceState === 'unapplied'))
    expect(cancelled).toBeUndefined() // the seed already settled its cancelled advances
    const f = d.payments.find((p) => p.advanceState === 'forfeited')!
    expect(err(() => forfeitAdvance(d, f.id, 'İkinci kez politika bedeli yazılıyor'))).toBeTruthy()
    expect(err(() => voidPayment(d, f.id, 'Geri alma denemesi yapılıyor'))).toBeTruthy()
    as(d, 'u-ops1')
    expect(err(() => requestApproval(d, { type: 'refund', target: { type: 'reservation', id: f.reservationId! }, paymentId: f.id, requested: f.tender, reason: 'Politika bedeli iade edilsin.' }))).toBeTruthy()
  })
  it('a cancelled reservation with a held advance can keep it only with a reason of at least 10 characters', () => {
    const d = mkDb()
    const r = storyReservation(d)
    const a = advancesOf(d, r)[0]!
    as(d, 'u-mgr')
    d.reservations.find((x) => x.id === r.id)!.status = 'cancelled'
    expect(err(() => forfeitAdvance(d, a.id, 'kısa'))).toBeTruthy()
    forfeitAdvance(d, a.id, 'Ücretsiz iptal süresi geçmişti.')
    expect(a.status).toBe('forfeited')
    expect(a.advanceState).toBe('forfeited')
    // Never applied to a charge afterwards
    expect(a.allocations).toEqual([])
  })
  it('a second advance on the same reservation is its own line', () => {
    const d = mkDb()
    const r = storyReservation(d)
    as(d, 'u-mgr')
    const n = advancesOf(d, r).length
    recordPayment(d, { reservationId: r.id, kind: 'advance', payer: { type: 'customer', name: 'Selma' }, method: 'card', tenderMinor: 1000, tenderCur: r.currency, branchId: r.pickupBranchId, reference: 'POS-TEST' })
    expect(advancesOf(d, r).length).toBe(n + 1)
  })
})
