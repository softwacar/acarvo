import { describe, expect, it } from 'vitest'
import { checkVehicleAvailable } from '../core/calc/availability'
import { vehicleCost } from '../core/calc/cost'
import { rentalFinance, stageOf } from '../core/calc/finance'
import { DemoError } from '../core/helpers'
import { createExpense } from '../core/ops/control'
import { holdDeposit, reconcilePayments, recordPayment, releaseDeposit, verifyDeposit, verifyPayment } from '../core/ops/finance'
import { completeMaintenance, planMaintenance, startMaintenance } from '../core/ops/fleet'
import { approvalRisk, independenceReport } from '../core/risk'
import { buildSeed } from '../core/seed'
import type { Db } from '../core/types'

// One finance model (decision document M.1–M.7): record → verify (by somebody else) → apply; reconciliation is a separate flag; risk
// levels; honest independence; expenses with a link, and a vehicle cost that never counts one cost twice.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => {
  d.session.userId = id
}
const err = (fn: () => unknown): DemoError | null => {
  try {
    fn()
  } catch (e) {
    if (e instanceof DemoError) return e
    throw e
  }
  return null
}
const deliveredRental = (d: Db) => d.rentals.find((r) => r.status === 'delivered' && r.currency === 'EUR')!

describe('record → verify → apply', () => {
  it('a recorded payment does not reduce the balance; the recorder cannot verify; another person verifies and it is applied', () => {
    const d = mkDb()
    const r = deliveredRental(d)
    as(d, 'u-owner')
    postChargeOnce(d, r.id)
    const before = rentalFinance(d, r.id)
    as(d, 'u-ops1')
    const p = recordPayment(d, { rentalId: r.id, kind: 'payment', payer: { type: 'customer', name: 'Test' }, method: 'transfer', tenderMinor: 10000, tenderCur: 'EUR', branchId: 'b-sjj', reference: 'HAV-1' })
    expect(stageOf(p)).toBe('recorded')
    const mid = rentalFinance(d, r.id)
    expect(mid.outstandingMinor).toBe(before.outstandingMinor) // not applied yet
    expect(mid.unverifiedMinor).toBe(before.unverifiedMinor + 10000)
    expect(err(() => verifyPayment(d, p.id))?.code).toBe('FORBIDDEN') // Operations holds no verify permission
    as(d, 'u-acc')
    const done = verifyPayment(d, p.id)
    expect(stageOf(done)).toBe('applied') // verification applies it to the open charges
    expect(rentalFinance(d, r.id).outstandingMinor).toBe(before.outstandingMinor - 10000)
    expect(err(() => verifyPayment(d, p.id))?.message).toMatch(/zaten|already/)
  })
  it('the person who recorded a line cannot verify it, even with the permission', () => {
    const d = mkDb()
    const r = deliveredRental(d)
    as(d, 'u-owner')
    const p = recordPayment(d, { rentalId: r.id, kind: 'payment', payer: { type: 'customer', name: 'Test' }, method: 'transfer', tenderMinor: 5000, tenderCur: 'EUR', branchId: 'b-sjj', reference: 'HAV-2' })
    expect(err(() => verifyPayment(d, p.id))?.code).toBe('FOUR_EYES')
  })
  it('reconciliation is its own flag: it needs an applied payment and a reference, and changes no balance', () => {
    const d = mkDb()
    const applied = d.payments.find((p) => p.status === 'applied' && !p.reconciledAt)!
    as(d, 'u-acc')
    const before = JSON.stringify(rentalFinance(d, applied.rentalId!).outstandingMinor)
    expect(err(() => reconcilePayments(d, [applied.id], 'x'))?.fields.ref).toBeTruthy()
    expect(reconcilePayments(d, [applied.id], 'Kasa sayımı 19.10')).toBe(1)
    expect(applied.reconciledAt).toBeTruthy()
    expect(stageOf(applied)).toBe('applied') // the stage did not change: reconciliation is not a step of the line
    expect(JSON.stringify(rentalFinance(d, applied.rentalId!).outstandingMinor)).toBe(before)
    expect(err(() => reconcilePayments(d, [applied.id], 'Kasa sayımı 19.10'))).not.toBeNull() // nothing left to reconcile
    as(d, 'u-ops1')
    expect(err(() => reconcilePayments(d, [applied.id], 'Deneme'))?.code).toBe('FORBIDDEN')
  })
  it('an advance is verified by somebody else before it can be applied at delivery', () => {
    const d = mkDb()
    const res = d.reservations.find((r) => r.status === 'confirmed' && r.vehicleId)!
    as(d, 'u-ops1')
    const a = recordPayment(d, { reservationId: res.id, kind: 'advance', payer: { type: 'customer', name: 'Test' }, method: 'card', tenderMinor: 3000, tenderCur: res.currency, branchId: res.pickupBranchId, reference: 'POS-V' })
    expect(stageOf(a)).toBe('recorded')
    as(d, 'u-mgr')
    verifyPayment(d, a.id)
    expect(stageOf(a)).toBe('verified') // verified, still held (applied at delivery)
    expect(a.advanceState).toBe('unapplied')
  })
})

describe('deposits follow the same two-person rule', () => {
  it('an unverified deposit cannot be released or offset; after another person verifies it can', () => {
    const d = mkDb()
    const r = d.rentals.find((x) => x.status === 'prepared' && x.deposit.required.minor > 0 && x.deposit.state !== 'held')
    expect(r).toBeTruthy()
    as(d, 'u-ops1')
    const dep = holdDeposit(d, r!.id, 'card', 'Test')
    expect(dep.verifiedAt).toBeUndefined()
    as(d, 'u-owner')
    expect(err(() => releaseDeposit(d, dep.id, 'released'))?.code).toBe('NOT_VERIFIED')
    expect(err(() => verifyDeposit(d, dep.id))).toBeNull() // the owner did not record it
    expect(err(() => releaseDeposit(d, dep.id, 'released'))).toBeNull()
  })
})

describe('risk levels and honest independence', () => {
  it('levels follow the decision document: a correction is level 2; a refund is level 1 below the threshold and 2 above it', () => {
    const d = mkDb()
    expect(approvalRisk(d, 'financial_correction', null)).toBe(2)
    expect(approvalRisk(d, 'refund', { minor: 1000, cur: 'EUR' })).toBe(1)
    expect(approvalRisk(d, 'refund', { minor: d.settings.thresholds.refundAbove.EUR!, cur: 'EUR' })).toBe(2)
    expect(approvalRisk(d, 'high_discount', null)).toBe(1)
  })
  it('with one Owner and one clerk: verification and routine refund work, every level-2 action is locked, nothing is hidden', () => {
    const d = mkDb()
    for (const u of d.users) if (!['u-owner', 'u-ops1'].includes(u.id)) u.status = 'inactive'
    const rows = independenceReport(d)
    const state = (id: string) => rows.find((r) => r.id === id)!.state
    expect(state('verify-payment')).toBe('other') // works when the clerk records and the owner verifies
    expect(state('refund-routine')).toBe('ok')
    for (const id of ['correction', 'policy-deviation', 'deposit-critical', 'damage-unblock']) expect(state(id), id).toBe('locked')
  })
  it('with the demo staff every level-2 action is available (two authorizers exist)', () => {
    const d = mkDb()
    for (const r of independenceReport(d)) expect(r.state, r.id).not.toBe('locked')
  })
})

function postChargeOnce(d: Db, rentalId: string) {
  const r = d.rentals.find((x) => x.id === rentalId)!
  const fin = rentalFinance(d, rentalId)
  if (fin.outstandingMinor >= 20000) return
  d.charges.push({ id: `chx-${rentalId}`, no: 'H-TEST', rentalId, kind: 'other', label: 'Test', amountMinor: 20000, cur: r.currency, taxMinor: 0, status: 'posted', key: `test:${rentalId}`, postedAt: d.clock.now })
}

describe('expenses and the vehicle cost', () => {
  it('a manual expense cannot use a category that belongs to a source record (it would be counted twice)', () => {
    const d = mkDb()
    as(d, 'u-acc')
    const e = err(() => createExpense(d, { category: 'Bakım ve servis', vendor: 'Servis', branchId: 'b-sjj', date: '2026-10-19', amount: { minor: 5000, cur: 'EUR' }, note: '', post: true }))
    expect(e?.fields.category).toBeTruthy()
  })
  it('a vehicle expense needs a vehicle; branch and general expenses are not spread over vehicles', () => {
    const d = mkDb()
    as(d, 'u-acc')
    expect(err(() => createExpense(d, { category: 'Yakıt', vendor: 'X', branchId: 'b-sjj', date: '2026-10-19', amount: { minor: 1000, cur: 'EUR' }, note: '', post: true, link: 'vehicle' }))?.fields.vehicle).toBeTruthy()
    const v = d.vehicles[0]!
    const before = vehicleCost(d, v.id).byCur
    createExpense(d, { category: 'Yakıt', vendor: 'X', branchId: v.homeBranchId, date: '2026-10-19', amount: { minor: 1000, cur: 'EUR' }, note: '', post: true, link: 'branch' })
    createExpense(d, { category: 'Kira ve işletme', vendor: 'Y', branchId: v.homeBranchId, date: '2026-10-19', amount: { minor: 9000, cur: 'EUR' }, note: '', post: true, link: 'general' })
    expect(vehicleCost(d, v.id).byCur).toEqual(before)
    createExpense(d, { category: 'Yakıt', vendor: 'Z', branchId: v.homeBranchId, date: '2026-10-19', amount: { minor: 2500, cur: 'EUR' }, note: '', post: true, vehicleId: v.id })
    expect(vehicleCost(d, v.id).byCur.EUR!.expenses).toBe((before.EUR?.expenses ?? 0) + 2500)
    expect(d.expenses.at(-1)!.link).toBe('vehicle')
  })
  it('a completed maintenance cost is counted once, even though a source expense mirrors it', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const start = new Date(Date.parse(d.clock.now) + 40 * 86_400_000).toISOString()
    const end = new Date(Date.parse(start) + 4 * 3_600_000).toISOString()
    const v = d.vehicles.find((x) => x.status === 'active' && x.source === 'internal' && checkVehicleAvailable(d, x, start, end, d.clock.now, {}).ok)!
    const m = planMaintenance(d, { vehicleId: v.id, type: 'periodic', plannedStart: start, plannedEnd: end, reason: 'Test bakımı' })
    d.clock.now = start
    startMaintenance(d, m.id)
    const before = vehicleCost(d, v.id).byCur.EUR?.total ?? 0
    completeMaintenance(d, m.id, { cost: { minor: 12000, cur: 'EUR' }, km: v.odometerKm })
    const mirror = d.expenses.find((e) => e.sourceType === 'maintenance' && e.sourceId === m.id)!
    expect(mirror.link).toBe('source')
    expect(mirror.vehicleId).toBe(v.id)
    const after = vehicleCost(d, v.id)
    expect(after.byCur.EUR!.total).toBe(before + 12000) // once, not 24 000
    expect(after.lines.filter((l) => l.no === m.no || l.no === mirror.no).length).toBe(1)
  })
})
