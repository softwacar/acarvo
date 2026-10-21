import { L } from '../../i18n'
import { addDaysYmd, dayOf, startOfDay } from '../time'
import type { Branch, Db, FuelLevel, Id, Iso, LinkType, Vehicle } from '../types'

// One availability truth for the whole demo (spec §59I, §59AC): reservations, rentals, maintenance, damage blocks,
// transfers and external engagement windows all become "holds" on a vehicle. Calendar, reservation conflict checks,
// dashboard buckets and capacity read these functions; no screen has its own overlap logic.
// Availability, readiness and physical location are three different things and are never mixed here.

export type HoldKind = 'rental' | 'reservation' | 'maintenance' | 'damage_block' | 'transfer' | 'engagement_gap' | 'out_of_service'

export interface Hold {
  kind: HoldKind
  refId: Id
  refNo: string
  link: LinkType | null
  from: number
  /** null = open-ended (overdue rental, damage block). */
  to: number | null
  label: string
  detail: string
}

// Getters, so the label follows the current language at the moment it is read (module-level text would stay frozen).
export const HOLD_LABEL: Record<HoldKind, string> = {
  get rental() {
    return L('Kiralama', 'Rental')
  },
  get reservation() {
    return L('Rezervasyon', 'Reservation')
  },
  get maintenance() {
    return L('Bakım', 'Maintenance')
  },
  get damage_block() {
    return L('Hasar engeli', 'Damage block')
  },
  get transfer() {
    return L('Transfer', 'Transfer')
  },
  get engagement_gap() {
    return L('Dış araç anlaşması', 'External vehicle engagement')
  },
  get out_of_service() {
    return L('Hizmet dışı', 'Out of service')
  },
}

const overlaps = (a: { from: number; to: number | null }, from: number, to: number) => a.from < to && (a.to === null || from < a.to)

export function vehicleHolds(db: Db, v: Vehicle, from: Iso, to: Iso, now: Iso, exclude: { rentalId?: Id; reservationId?: Id } = {}): Hold[] {
  const f = Date.parse(from)
  const t = Date.parse(to)
  const n = Date.parse(now)
  const out: Hold[] = []
  if (v.status !== 'active') out.push({ kind: 'out_of_service', refId: v.id, refNo: v.plate, link: 'vehicle', from: 0, to: null, label: L('Hizmet dışı', 'Out of service'), detail: v.status === 'sold' ? L('Filodan çıkarıldı', 'Removed from the fleet') : L('Araç hizmet dışı işaretli', 'The vehicle is marked out of service') })

  for (const r of db.rentals) {
    if (r.vehicleId !== v.id || r.id === exclude.rentalId) continue
    if (r.status !== 'prepared' && r.status !== 'delivered') continue
    const start = Date.parse(r.actualPickupAt ?? r.plannedPickupAt)
    const planned = Date.parse(r.plannedReturnAt)
    // A delivered rental past its planned return keeps holding the vehicle until it is returned (open-ended).
    const end = r.status === 'delivered' && planned < n ? null : planned
    out.push({ kind: 'rental', refId: r.id, refNo: r.no, link: 'rental', from: start, to: end, label: L(`Kiralama ${r.no}`, `Rental ${r.no}`), detail: r.status === 'delivered' ? L('Araç müşteride', 'Vehicle with the customer') : L('Teslime hazırlanıyor', 'Being prepared for handover') })
  }
  for (const r of db.reservations) {
    if (r.vehicleId !== v.id || r.id === exclude.reservationId || r.status !== 'confirmed') continue
    out.push({ kind: 'reservation', refId: r.id, refNo: r.no, link: 'reservation', from: Date.parse(r.pickupAt), to: Date.parse(r.returnAt), label: L(`Rezervasyon ${r.no}`, `Reservation ${r.no}`), detail: L('Onaylı, araç atanmış', 'Confirmed, vehicle assigned') })
  }
  for (const m of db.maintenance) {
    if (m.vehicleId !== v.id) continue
    if (m.status !== 'planned' && m.status !== 'in_progress') continue
    const plannedEnd = Date.parse(m.plannedEnd)
    const end = m.status === 'in_progress' && plannedEnd < n ? null : plannedEnd
    out.push({ kind: 'maintenance', refId: m.id, refNo: m.no, link: 'maintenance', from: Date.parse(m.actualStart ?? m.plannedStart), to: end, label: L(`Bakım ${m.no}`, `Maintenance ${m.no}`), detail: m.status === 'in_progress' ? 'Serviste' : L('Planlı bakım', 'Planned maintenance') })
  }
  for (const d of db.damages) {
    if (d.vehicleId !== v.id || !d.blocksVehicle || d.status === 'closed') continue
    out.push({ kind: 'damage_block', refId: d.id, refNo: d.no, link: 'damage', from: Date.parse(d.createdAt), to: null, label: L(`Hasar engeli ${d.no}`, `Damage block ${d.no}`), detail: L('Araç hasar nedeniyle kullanılamaz', 'The vehicle cannot be used because of damage') })
  }
  for (const tr of db.transfers) {
    if (tr.vehicleId !== v.id || (tr.status !== 'requested' && tr.status !== 'in_transit')) continue
    out.push({ kind: 'transfer', refId: tr.id, refNo: tr.no, link: 'transfer', from: Date.parse(tr.departedAt ?? tr.plannedAt), to: Date.parse(tr.plannedAt) + 12 * 3_600_000, label: `Transfer ${tr.no}`, detail: tr.status === 'in_transit' ? 'Yolda' : L('Planlı', 'Planned') })
  }
  if (v.source === 'external') {
    const windows = db.engagements.filter((e) => e.externalVehicleId === v.externalVehicleId && (e.status === 'confirmed' || e.status === 'received'))
    const covered = windows.some((e) => Date.parse(e.from) <= f && t <= Date.parse(e.to))
    if (!covered) out.push({ kind: 'engagement_gap', refId: v.id, refNo: v.plate, link: 'vehicle', from: f, to: t, label: L('Dış araç anlaşma penceresi dışında', 'Outside the external engagement window'), detail: L('Bu dönem için onaylı tedarik anlaşması yok', 'There is no confirmed supply engagement for this period') })
  }
  return out.filter((h) => overlaps(h, f, t)).sort((a, b) => a.from - b.from)
}

export function checkVehicleAvailable(db: Db, v: Vehicle, from: Iso, to: Iso, now: Iso, exclude: { rentalId?: Id; reservationId?: Id } = {}) {
  const conflicts = vehicleHolds(db, v, from, to, now, exclude)
  return { ok: conflicts.length === 0, conflicts }
}

export type Bucket = 'available' | 'reserved' | 'rented' | 'maintenance' | 'transfer' | 'unavailable'
export const BUCKET_ORDER: Bucket[] = ['available', 'reserved', 'rented', 'maintenance', 'transfer', 'unavailable']

/** State of a vehicle at this moment (the dashboard's "available now"; future availability is a different question). */
export function bucketNow(db: Db, v: Vehicle, now: Iso): Bucket {
  if (v.status !== 'active') return 'unavailable'
  const n = Date.parse(now)
  const holds = vehicleHolds(db, v, now, new Date(n + 1000).toISOString(), now)
  if (!holds.length) return 'available'
  if (holds.some((h) => h.kind === 'damage_block' || h.kind === 'out_of_service')) return 'unavailable'
  if (holds.some((h) => h.kind === 'maintenance')) return 'maintenance'
  if (holds.some((h) => h.kind === 'transfer')) return 'transfer'
  if (holds.some((h) => h.kind === 'rental' && db.rentals.find((r) => r.id === h.refId)?.status === 'delivered')) return 'rented'
  return 'reserved'
}

/** Vehicles of the demo fleet that count as inventory now (sold vehicles are out of the picture). */
export const fleetVehicles = (db: Db) => db.vehicles.filter((v) => v.status !== 'sold')

// --------------------------------------------------------------------------- capacity (branch × class × day)

export interface CapacityCell {
  branchId: Id
  classId: Id
  day: string
  total: number
  blocked: number
  allocated: number
  classOnly: number
  available: number
}

/**
 * Capacity of a branch and class on a day. Confirmed class-only demand reduces availability without pointing at a
 * vehicle; Pending reservations do not count; an external vehicle counts only inside a confirmed engagement window.
 */
export function capacityCell(db: Db, branch: Branch, classId: Id, day: string): CapacityCell {
  const from = startOfDay(day, branch.tz)
  const to = startOfDay(addDaysYmd(day, 1), branch.tz)
  const now = db.clock.now
  let total = 0
  let blocked = 0
  let allocated = 0
  for (const v of db.vehicles) {
    if (v.homeBranchId !== branch.id || v.classId !== classId || v.status === 'sold') continue
    if (v.source === 'external') {
      const win = db.engagements.some((e) => e.externalVehicleId === v.externalVehicleId && (e.status === 'confirmed' || e.status === 'received') && Date.parse(e.from) < Date.parse(to) && Date.parse(from) < Date.parse(e.to))
      if (!win) continue
    }
    total++
    const holds = vehicleHolds(db, { ...v, source: 'internal' }, from, to, now)
    if (v.status !== 'active' || holds.some((h) => h.kind === 'maintenance' || h.kind === 'damage_block' || h.kind === 'transfer' || h.kind === 'out_of_service')) blocked++
    else if (holds.some((h) => h.kind === 'rental' || h.kind === 'reservation')) allocated++
  }
  const classOnly = db.reservations.filter((r) => r.status === 'confirmed' && !r.vehicleId && r.classId === classId && r.pickupBranchId === branch.id && Date.parse(r.pickupAt) < Date.parse(to) && Date.parse(from) < Date.parse(r.returnAt)).length
  return { branchId: branch.id, classId, day, total, blocked, allocated, classOnly, available: total - blocked - allocated - classOnly }
}

// --------------------------------------------------------------------------- readiness (separate from availability)

export interface ReadinessItem {
  key: string
  label: string
  ok: boolean
  /** A blocker stops delivery; a warning only informs. */
  severity: 'blocker' | 'warning'
  detail: string
  link?: { type: LinkType; id: Id }
}

const FUEL_RANK: Record<FuelLevel, number> = { empty: 0, quarter: 1, half: 2, three_quarters: 3, full: 4 }
export const fuelRank = (f: FuelLevel) => FUEL_RANK[f]

export function readinessOf(db: Db, v: Vehicle, now: Iso): { ready: boolean; blockers: number; items: ReadinessItem[] } {
  const items: ReadinessItem[] = []
  const nowMs = Date.parse(now)
  items.push({ key: 'clean', label: L('Temizlik / hazırlık', 'Cleaning / preparation'), ok: v.readiness.clean, severity: 'blocker', detail: v.readiness.clean ? L('Araç temiz ve hazırlandı', 'The vehicle is clean and prepared') : L('Temizlik ve hazırlık kontrolü yapılmadı', 'The cleaning and preparation check was not done') })
  items.push({ key: 'fuel', label: L('Yakıt seviyesi', 'Fuel level'), ok: fuelRank(v.fuel) >= 2, severity: 'blocker', detail: fuelRank(v.fuel) >= 2 ? L('Yakıt yeterli', 'Fuel is sufficient') : L('Yakıt yarıdan az: teslimden önce ikmal edin', 'Fuel is below half: refuel before handover') })
  const dmg = db.damages.find((d) => d.vehicleId === v.id && d.blocksVehicle && d.status !== 'closed')
  items.push({ key: 'damage', label: L('Açık hasar engeli', 'Open damage block'), ok: !dmg, severity: 'blocker', detail: dmg ? L(`${dmg.no} nedeniyle araç kullanılamaz`, `The vehicle cannot be used because of ${dmg.no}`) : L('Engel yok', 'No block'), link: dmg ? { type: 'damage', id: dmg.id } : undefined })
  const inService = db.maintenance.find((m) => m.vehicleId === v.id && m.status === 'in_progress')
  items.push({ key: 'maintenance', label: 'Serviste mi?', ok: !inService, severity: 'blocker', detail: inService ? `${inService.no} devam ediyor` : L('Serviste değil', 'Not in service'), link: inService ? { type: 'maintenance', id: inService.id } : undefined })
  const docs = db.documents.filter((d) => d.ownerType === 'vehicle' && d.ownerId === v.id && d.validUntil)
  const expired = docs.filter((d) => Date.parse(`${d.validUntil}T23:59:59Z`) < nowMs)
  items.push({ key: 'docs', label: L('Araç belgeleri (ruhsat, sigorta, muayene)', 'Vehicle documents (registration, insurance, inspection)'), ok: expired.length === 0, severity: 'blocker', detail: expired.length ? L(`Süresi dolmuş: ${expired.map((d) => d.kind).join(', ')}`, `Expired: ${expired.map((d) => d.kind).join(', ')}`) : L('Belgeler geçerli', 'Documents are valid') })
  const kmSince = v.odometerKm - v.service.lastKm
  const overdue = kmSince > v.service.intervalKm
  items.push({ key: 'service', label: L('Periyodik bakım', 'Periodic service'), ok: !overdue, severity: 'warning', detail: overdue ? L(`${(kmSince - v.service.intervalKm).toLocaleString('tr')} km gecikmiş`, `${(kmSince - v.service.intervalKm).toLocaleString('tr')} km overdue`) : L(`${(v.service.intervalKm - kmSince).toLocaleString('tr')} km sonra`, `in ${(v.service.intervalKm - kmSince).toLocaleString('tr')} km`) })
  const month = Number(dayOf(now, 'UTC').slice(5, 7))
  const winterWrong = v.tire.type === 'winter' && month >= 5 && month <= 9
  const summerWrong = v.tire.type === 'summer' && (month === 12 || month <= 2)
  items.push({ key: 'tire', label: 'Lastik / sezon', ok: !winterWrong && !summerWrong && v.tire.treadMm >= 3, severity: 'warning', detail: v.tire.treadMm < 3 ? L(`Diş derinliği ${v.tire.treadMm} mm`, `Tread depth ${v.tire.treadMm} mm`) : winterWrong || summerWrong ? L('Sezona uygun lastik değil', 'Tyres are not suitable for the season') : 'Uygun' })
  items.push({ key: 'keys', label: 'Anahtar', ok: v.keys.count > 0, severity: 'blocker', detail: v.keys.count > 0 ? `${v.keys.count} adet · ${v.keys.holder}` : L('Anahtar kaydı yok', 'No key record') })
  if (v.source === 'external') {
    const eng = db.engagements.find((e) => e.externalVehicleId === v.externalVehicleId && (e.status === 'received' || e.status === 'confirmed') && Date.parse(e.from) <= nowMs && nowMs <= Date.parse(e.to))
    items.push({ key: 'external', label: L('Dış araç teslim alındı mı?', 'External vehicle received?'), ok: eng?.status === 'received', severity: 'blocker', detail: eng ? (eng.status === 'received' ? L('Tedarikçiden teslim alındı', 'Received from the supplier') : L('Anlaşma onaylı ama araç fiziksel olarak teslim alınmadı', 'The engagement is confirmed but the vehicle was not physically received')) : L('Geçerli anlaşma penceresi yok', 'No valid engagement window') })
  }
  const blockers = items.filter((i) => !i.ok && i.severity === 'blocker').length
  return { ready: blockers === 0, blockers, items }
}
