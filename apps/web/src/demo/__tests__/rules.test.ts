import { describe, expect, it } from 'vitest'
import { calculateRentalDuration } from '../core/calc/pricing'
import { deriveAlerts } from '../core/calc/alerts'
import { DemoError, hasPerm } from '../core/helpers'
import { setClock } from '../core/ops/control'
import { claimTask } from '../core/ops/tasks'
import { buildSeed } from '../core/seed'
import { addDaysYmd, dayOf, DAY, HOUR, zonedIso } from '../core/time'
import type { Db } from '../core/types'

const TZ = 'Europe/Sarajevo'
const mkDb = (): Db => buildSeed(new Date('2026-10-20T08:00:00Z'))
const as = (d: Db, id: string) => { d.session.userId = id }
const fails = (fn: () => unknown) => { try { fn() } catch (e) { return e instanceof DemoError } return false }

describe('role simulation (demo UI behaviour, not server security)', () => {
  it('Owner may do everything; Manager has no settings, users or roles management', () => {
    const d = mkDb()
    as(d, 'u-owner')
    for (const p of ['settings:manage', 'settings:fx', 'users:manage', 'finance:apply', 'reports:finance']) expect(hasPerm(d, p), p).toBe(true)
    const mgr = d.users.find((u) => u.roleId === 'role-manager')!
    for (const p of ['settings:manage', 'settings:fx', 'users:manage', 'roles:manage']) expect(hasPerm(d, p, mgr), p).toBe(false)
    for (const p of ['finance:apply', 'approvals:decide', 'reports:finance']) expect(hasPerm(d, p, mgr), p).toBe(true)
  })
  it('Operations has no finance reports, approval decisions or settings; Accounting cannot hand over or edit vehicles', () => {
    const d = mkDb()
    const ops = d.users.find((u) => u.id === 'u-ops1')!
    for (const p of ['reports:finance', 'approvals:decide', 'settings:manage', 'finance:apply']) expect(hasPerm(d, p, ops), p).toBe(false)
    expect(hasPerm(d, 'rentals:handover', ops)).toBe(true)
    const acc = d.users.find((u) => u.roleId === 'role-accountant')!
    for (const p of ['rentals:handover', 'vehicles:manage', 'maintenance:manage']) expect(hasPerm(d, p, acc), p).toBe(false)
    for (const p of ['finance:record', 'finance:apply', 'cash:manage', 'reports:finance']) expect(hasPerm(d, p, acc), p).toBe(true)
  })
  it('a per-user deny beats the role, a per-user grant adds to it', () => {
    const d = mkDb()
    const ops = d.users.find((u) => u.id === 'u-ops1')!
    ops.grant.push('reports:finance')
    expect(hasPerm(d, 'reports:finance', ops)).toBe(true)
    ops.deny.push('rentals:handover')
    expect(hasPerm(d, 'rentals:handover', ops)).toBe(false)
  })
  it('branch scope: a front-desk user cannot claim a task that belongs to another branch', () => {
    const d = mkDb()
    const foreign = d.tasks.find((t) => t.branchId === 'b-mst' && t.status !== 'done')
    if (!foreign) return // the seed has no open Mostar task for this anchor
    foreign.pool = true
    foreign.ownerId = undefined
    as(d, 'u-ops1')
    expect(fails(() => claimTask(d, foreign.id))).toBe(true)
    expect(foreign.ownerId).toBeUndefined()
  })
  it('contact details are masked for the roles listed in the privacy setting, never for the owner', () => {
    const d = mkDb()
    expect(d.settings.privacy.maskIdentityRoles).toEqual(expect.arrayContaining(['role-ops', 'role-accountant']))
    expect(d.settings.privacy.maskIdentityRoles).not.toContain('role-owner')
  })
})

describe('dates, time zones and the demo clock', () => {
  it('local wall time survives the autumn DST change: 10:00 is 08:00Z before it and 09:00Z after it', () => {
    expect(zonedIso('2026-10-24', '10:00', TZ)).toBe('2026-10-24T08:00:00.000Z')
    expect(zonedIso('2026-10-25', '10:00', TZ)).toBe('2026-10-25T09:00:00.000Z')
    expect(zonedIso('2027-03-28', '10:00', TZ)).toBe('2027-03-28T08:00:00.000Z') // spring: back to UTC+2
  })
  it('a calendar day is counted in the pickup zone, also across a DST change and around midnight', () => {
    const d = mkDb()
    const dur = d.settings.duration
    expect(calculateRentalDuration(zonedIso('2026-10-24', '10:00', TZ), zonedIso('2026-10-26', '10:00', TZ), TZ, dur)).toBe(2)
    expect(dayOf('2026-10-24T22:30:00Z', TZ)).toBe('2026-10-25')
    expect(dayOf('2026-10-24T21:30:00Z', TZ)).toBe('2026-10-24')
    expect(calculateRentalDuration(zonedIso('2026-10-24', '09:00', TZ), zonedIso('2026-10-24', '18:00', TZ), TZ, dur)).toBe(1) // same-day return is one day
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysYmd('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('moving the demo clock forward recalculates overdue alerts and moving it back removes them', () => {
    const d = mkDb()
    as(d, 'u-owner')
    const overdue = () => deriveAlerts(d).filter((a) => a.kind === 'overdue_return').length
    const base = overdue()
    setClock(d, new Date(Date.parse(d.clock.now) + 3 * DAY).toISOString())
    expect(overdue()).toBeGreaterThanOrEqual(base)
    setClock(d, new Date(Date.parse(d.clock.now) - 20 * DAY).toISOString())
    expect(overdue()).toBeLessThanOrEqual(base)
    // an overdue alert exists only for a delivered rental past its planned return
    const rentals = d.rentals.filter((r) => r.status === 'delivered')
    setClock(d, new Date(Math.max(...rentals.map((r) => Date.parse(r.plannedReturnAt))) + HOUR).toISOString())
    expect(overdue()).toBe(rentals.length)
  })
})
