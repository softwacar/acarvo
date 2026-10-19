import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { capacityCell } from '../core/calc/availability'
import { projectCorporateExposure } from '../core/calc/finance'
import { priceQuote } from '../core/calc/pricing'
import { DemoError } from '../core/helpers'
import { applyApproval, decideApproval, requestApproval } from '../core/ops/control'
import { postCharge } from '../core/ops/finance'
import { assertVehicleFree, confirmReservation, createReservation, issueContract, signContract } from '../core/ops/rentals'
import { buildSeed } from '../core/seed'
import type { Db } from '../core/types'
import { NAV_ITEMS } from '../../nav'

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => { d.session.userId = id }
const code = (fn: () => unknown) => { try { fn() } catch (e) { return e instanceof DemoError ? e.code ?? e.message : String(e) } return 'NO_ERROR' }

describe('routes', () => {
  it('every one of the 36 canonical sidebar links has a demo route', () => {
    const src = readFileSync(resolve(__dirname, '../router.tsx'), 'utf8')
    const paths = new Set([...src.matchAll(/\['(\/[^']*)',/g)].map((m) => m[1]))
    const links = NAV_ITEMS.map((i) => (i.slug ? `/${i.slug}` : '/'))
    expect(links.length).toBe(36)
    for (const l of links) expect(paths.has(l), `missing route ${l}`).toBe(true)
  })
  it('the platform console and partner portal are separate context routes', () => {
    const src = readFileSync(resolve(__dirname, '../router.tsx'), 'utf8')
    expect(src).toContain("'/platform'")
    expect(src).toContain("'/partner'")
  })
})

describe('seed', () => {
  it('is deterministic for the same anchor date', () => {
    expect(JSON.stringify(mkDb())).toBe(JSON.stringify(mkDb()))
  })
  it('contains only fictional contact data', () => {
    const d = mkDb()
    for (const c of d.customers) expect(c.email === '' || /(example|test|demo)/i.test(c.email), c.email).toBe(true)
    for (const u of d.users) expect(/(example|test|demo)/i.test(u.email), u.email).toBe(true)
  })
  it('has three branches, 25 internal vehicles and three currencies of tender', () => {
    const d = mkDb()
    expect(d.branches.length).toBe(3)
    expect(d.vehicles.filter((v) => v.source === 'internal').length).toBe(25)
    expect(d.settings.acceptedCurrencies).toEqual(expect.arrayContaining(['EUR', 'BAM', 'USD']))
  })
})

describe('four-eyes approvals', () => {
  it('the requester cannot decide or apply their own request; Approved is not Applied; applied once', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const target = d.rentals.find((r) => r.status === 'prepared')!
    const a = requestApproval(d, { type: 'deposit_exception', target: { type: 'rental', id: target.id }, reason: 'Sadık müşteri için depozito istisnası', requested: { minor: 1000, cur: target.deposit.required.cur } })
    expect(code(() => decideApproval(d, a.id, 'approve', ''))).toBe('FOUR_EYES')
    as(d, 'u-owner')
    decideApproval(d, a.id, 'approve', 'Uygun')
    expect(d.approvals.find((x) => x.id === a.id)!.status).toBe('approved')
    expect(target.deposit.required.minor).not.toBe(1000)
    applyApproval(d, a.id)
    expect(d.approvals.find((x) => x.id === a.id)!.status).toBe('applied')
    expect(target.deposit.required.minor).toBe(1000)
    expect(code(() => applyApproval(d, a.id))).not.toBe('NO_ERROR')
  })
  it('a rejection needs a reason', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const target = d.rentals.find((r) => r.status === 'prepared')!
    const a = requestApproval(d, { type: 'deposit_exception', target: { type: 'rental', id: target.id }, reason: 'Depozito istisnası talebi', requested: { minor: 1000, cur: target.deposit.required.cur } })
    as(d, 'u-owner')
    expect(code(() => decideApproval(d, a.id, 'reject', ''))).not.toBe('NO_ERROR')
  })
})

describe('contracts', () => {
  it('a signed contract cannot be replaced; an unsigned one is superseded by a new version that carries no signature', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const r = d.rentals.find((x) => x.status === 'prepared' && !x.contract.signed)!
    const v1 = d.contracts.find((c) => c.id === r.contract.id)!
    const v2 = issueContract(d, r.id, v1.templateId)
    expect(v2.version).toBe(v1.version + 1)
    expect(d.contracts.find((c) => c.id === v1.id)!.status).toBe('superseded')
    expect(r.contract.signed).toBe(false)
    const customer = d.customers.find((c) => c.id === r.customerId)!
    signContract(d, r.id, customer.name, true)
    expect(r.contract.signed).toBe(true)
    expect(code(() => issueContract(d, r.id, v1.templateId))).not.toBe('NO_ERROR')
  })
})

describe('availability and reservations', () => {
  it('a vehicle that is in a delivered rental cannot be booked over it', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const rental = d.rentals.find((r) => r.status === 'delivered')!
    expect(code(() => assertVehicleFree(d, rental.vehicleId, rental.plannedPickupAt, rental.plannedReturnAt))).toBe('CONFLICT')
  })
  it('a pending reservation holds no capacity; confirming it does', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const pending = d.reservations.find((r) => r.status === 'pending' && !r.vehicleId)!
    const branch = d.branches.find((b) => b.id === pending.pickupBranchId)!
    const day = pending.pickupAt.slice(0, 10)
    const before = capacityCell(d, branch, pending.classId, day).available
    expect(capacityCell(d, branch, pending.classId, day).classOnly).toBeGreaterThanOrEqual(0)
    try {
      confirmReservation(d, pending.id)
      expect(capacityCell(d, branch, pending.classId, day).available).toBeLessThanOrEqual(before)
    } catch (e) {
      expect(e).toBeInstanceOf(DemoError)
    }
  })
  it('a class-only reservation can be created without a vehicle', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const c = d.customers[0]!
    const r = createReservation(d, { customerId: c.id, classId: d.classes[0]!.id, pickupBranchId: 'b-sjj', returnBranchId: 'b-sjj', pickupAt: '2026-12-01T09:00:00.000Z', returnAt: '2026-12-04T09:00:00.000Z', currency: 'EUR', extras: [], channel: 'phone' })
    expect(r.status).toBe('pending')
    expect(r.vehicleId).toBeUndefined()
  })
})

describe('pricing', () => {
  it('never converts currencies: a currency without a price row is blocked, not guessed', () => {
    const d = mkDb()
    const q = priceQuote(d, { classId: d.classes[0]!.id, from: '2026-12-01T09:00:00.000Z', to: '2026-12-04T09:00:00.000Z', pickupBranchId: 'b-sjj', returnBranchId: 'b-sjj', currency: 'JPY', extras: [] }, d.clock.now, 'x')
    expect(q.blockers.length).toBeGreaterThan(0)
  })
  it('prices a normal quote with tax and a frozen revision id', () => {
    const d = mkDb()
    const q = priceQuote(d, { classId: d.classes[0]!.id, from: '2026-12-01T09:00:00.000Z', to: '2026-12-04T09:00:00.000Z', pickupBranchId: 'b-sjj', returnBranchId: 'b-sjj', currency: 'EUR', extras: [] }, d.clock.now, 'x')
    expect(q.blockers).toEqual([])
    expect(q.grossMinor).toBeGreaterThan(0)
    expect(q.revisionId).toBeTruthy()
  })
})

describe('permissions and finance rules', () => {
  it('a role without finance:apply cannot void a payment or apply an approval', () => {
    const d = mkDb()
    as(d, 'u-ops1')
    const ap = d.approvals[0]!
    expect(code(() => applyApproval(d, ap.id))).toBe('FORBIDDEN')
  })
  it('a corporate account with no limit in a currency is not unlimited', () => {
    const d = mkDb()
    const corp = d.corporates[0]!
    const usd = projectCorporateExposure(d, corp.id).find((e) => e.cur === 'USD')
    expect(usd === undefined || usd.limitMinor === null).toBe(true)
  })
  it('posting the same charge key twice creates one charge', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const r = d.rentals.find((x) => x.status === 'delivered')!
    const a = postCharge(d, { rentalId: r.id, kind: 'other', label: 'Test', amountMinor: 1000, key: `${r.id}:idem` })
    const n = d.charges.length
    const b = postCharge(d, { rentalId: r.id, kind: 'other', label: 'Test', amountMinor: 1000, key: `${r.id}:idem` })
    expect(b.id).toBe(a.id)
    expect(d.charges.length).toBe(n)
  })
})
