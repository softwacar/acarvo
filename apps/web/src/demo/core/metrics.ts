import { BUCKET_ORDER, type Bucket, bucketNow } from './calc/availability'
import { rentalFinance } from './calc/finance'
import { DAY, dayOf, HOUR, startOfDay, addDaysYmd } from './time'
import type { Cur, Db, Id, Iso, Rental, Reservation, Vehicle } from './types'

// Shared read-only projections. Dashboard, Command Center, Calendar, Fleet Analysis and Reports all derive from these
// functions and the same Db, so one rental never shows different numbers on different screens.

export const COUNTED_VEHICLE = (d: Db, v: Vehicle) => {
  if (v.status === 'sold') return false
  if (v.source === 'external') return d.engagements.some((e) => e.externalVehicleId === v.externalVehicleId && e.status === 'received' && Date.parse(e.from) <= Date.parse(d.clock.now) && Date.parse(d.clock.now) <= Date.parse(e.to))
  return true
}

export function fleetBuckets(d: Db, branches: Id[]): { total: number; buckets: Record<Bucket, number>; vehicles: Record<Bucket, Vehicle[]> } {
  const buckets = Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0])) as Record<Bucket, number>
  const vehicles = Object.fromEntries(BUCKET_ORDER.map((b) => [b, [] as Vehicle[]])) as Record<Bucket, Vehicle[]>
  let total = 0
  for (const v of d.vehicles) {
    if (!branches.includes(v.homeBranchId) || !COUNTED_VEHICLE(d, v)) continue
    const b = bucketNow(d, v, d.clock.now)
    buckets[b]++
    vehicles[b].push(v)
    total++
  }
  return { total, buckets, vehicles }
}

const tzOfBranch = (d: Db, id: Id) => d.branches.find((b) => b.id === id)?.tz ?? d.settings.company.tz
export const isToday = (d: Db, iso: Iso, branchId: Id) => dayOf(iso, tzOfBranch(d, branchId)) === dayOf(d.clock.now, tzOfBranch(d, branchId))

export interface DayItem {
  kind: 'reservation' | 'rental'
  id: Id
  no: string
  at: Iso
  branchId: Id
  vehicleId?: Id
  customerId: Id
  classId: Id
  note: string
}

export function todayPickups(d: Db, branches: Id[]): DayItem[] {
  const out: DayItem[] = []
  for (const r of d.reservations) if (r.status === 'confirmed' && branches.includes(r.pickupBranchId) && isToday(d, r.pickupAt, r.pickupBranchId)) out.push({ kind: 'reservation', id: r.id, no: r.no, at: r.pickupAt, branchId: r.pickupBranchId, vehicleId: r.vehicleId, customerId: r.customerId, classId: r.classId, note: r.vehicleId ? 'Onaylı rezervasyon' : 'Sınıf rezervasyonu: araç atanmadı' })
  for (const r of d.rentals) if (r.status === 'prepared' && branches.includes(r.pickupBranchId) && isToday(d, r.plannedPickupAt, r.pickupBranchId)) out.push({ kind: 'rental', id: r.id, no: r.no, at: r.plannedPickupAt, branchId: r.pickupBranchId, vehicleId: r.vehicleId, customerId: r.customerId, classId: r.classId, note: 'Hazır kiralama: teslim masası' })
  return out.sort((a, b) => a.at.localeCompare(b.at))
}
export function todayReturns(d: Db, branches: Id[]): DayItem[] {
  return d.rentals
    .filter((r) => r.status === 'delivered' && branches.includes(r.returnBranchId) && isToday(d, r.plannedReturnAt, r.returnBranchId) && Date.parse(r.plannedReturnAt) >= Date.parse(d.clock.now) - 0)
    .map((r): DayItem => ({ kind: 'rental', id: r.id, no: r.no, at: r.plannedReturnAt, branchId: r.returnBranchId, vehicleId: r.vehicleId, customerId: r.customerId, classId: r.classId, note: 'İade bekleniyor' }))
    .sort((a, b) => a.at.localeCompare(b.at))
}
export const overdueReturns = (d: Db, branches: Id[]): Rental[] => d.rentals.filter((r) => r.status === 'delivered' && Date.parse(r.plannedReturnAt) < Date.parse(d.clock.now) && (branches.includes(r.returnBranchId) || branches.includes(r.pickupBranchId)))
export const activeRentals = (d: Db, branches: Id[]): Rental[] => d.rentals.filter((r) => r.status === 'delivered' && (branches.includes(r.pickupBranchId) || branches.includes(r.returnBranchId)))
export const reservationsBy = (d: Db, branches: Id[], status: Reservation['status']) => d.reservations.filter((r) => r.status === status && (branches.includes(r.pickupBranchId) || branches.includes(r.returnBranchId)))

// ------------------------------------------------------------------ money (always per currency)

export function addTo(rec: Record<Cur, number>, cur: Cur, n: number) {
  rec[cur] = (rec[cur] ?? 0) + n
}

export interface FinanceSummary {
  charged: Record<Cur, number>
  collected: Record<Cur, number>
  outstanding: Record<Cur, number>
  depositsHeld: Record<Cur, number>
  unapplied: Record<Cur, number>
}

export function financeSummary(d: Db, branches: Id[], from?: Iso, to?: Iso): FinanceSummary {
  const s: FinanceSummary = { charged: {}, collected: {}, outstanding: {}, depositsHeld: {}, unapplied: {} }
  const inRange = (iso?: string) => !iso || ((!from || iso >= from) && (!to || iso < to))
  for (const r of d.rentals) {
    if (!branches.includes(r.pickupBranchId)) continue
    for (const c of d.charges) if (c.rentalId === r.id && c.status === 'posted' && inRange(c.postedAt)) addTo(s.charged, c.cur, c.amountMinor)
    for (const p of d.payments) if (p.rentalId === r.id && p.status === 'applied' && inRange(p.recordedAt)) addTo(s.collected, p.obligationCur, p.allocations.reduce((a, x) => a + x.minor, 0))
    const f = rentalFinance(d, r.id)
    if (r.status !== 'cancelled') addTo(s.outstanding, f.cur, f.outstandingMinor)
    addTo(s.unapplied, f.cur, f.unappliedMinor)
  }
  // Deposits are held money, not revenue and not part of "collected".
  for (const dep of d.deposits) {
    const r = d.rentals.find((x) => x.id === dep.rentalId)
    if (r && branches.includes(r.pickupBranchId) && dep.state === 'held') addTo(s.depositsHeld, dep.amount.cur, dep.amount.minor)
  }
  return s
}

// ------------------------------------------------------------------ utilisation

const overlapMs = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

export interface Utilisation {
  vehicleId: Id
  windowHours: number
  rentedHours: number
  maintenanceHours: number
  blockedHours: number
  idleHours: number
  rate: number
  km: number
  rentals: number
}

/** Utilisation of one vehicle in a window, from real rental, maintenance and damage-block records. */
export function utilisation(d: Db, v: Vehicle, from: Iso, to: Iso): Utilisation {
  const f = Date.parse(from)
  const t = Date.parse(to)
  const now = Date.parse(d.clock.now)
  let rented = 0
  let km = 0
  let n = 0
  for (const r of d.rentals) {
    if (r.vehicleId !== v.id || !r.actualPickupAt) continue
    const end = Date.parse(r.actualReturnAt ?? d.clock.now)
    const o = overlapMs(Date.parse(r.actualPickupAt), end, f, Math.min(t, Math.max(now, f)))
    if (o > 0) {
      rented += o
      n++
      if (r.handover && r.ret) km += Math.max(0, r.ret.km - r.handover.km)
    }
  }
  let maint = 0
  for (const m of d.maintenance) {
    if (m.vehicleId !== v.id || m.status === 'cancelled' || m.status === 'planned') continue
    maint += overlapMs(Date.parse(m.actualStart ?? m.plannedStart), Date.parse(m.actualEnd ?? d.clock.now), f, Math.min(t, Math.max(now, f)))
  }
  let blocked = 0
  for (const dm of d.damages) if (dm.vehicleId === v.id && dm.blocksVehicle) blocked += overlapMs(Date.parse(dm.createdAt), now, f, Math.min(t, Math.max(now, f)))
  const windowMs = Math.max(0, Math.min(t, Math.max(now, f)) - f)
  const windowHours = windowMs / HOUR
  const idle = Math.max(0, windowMs - rented - maint - blocked)
  return { vehicleId: v.id, windowHours, rentedHours: rented / HOUR, maintenanceHours: maint / HOUR, blockedHours: blocked / HOUR, idleHours: idle / HOUR, rate: windowMs ? rented / windowMs : 0, km, rentals: n }
}

export const rangeOfDays = (d: Db, days: number, branchTz?: string) => {
  const tz = branchTz ?? d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  return { from: startOfDay(addDaysYmd(today, -days + 1), tz), to: startOfDay(addDaysYmd(today, 1), tz), days }
}
export const DAY_MS = DAY
