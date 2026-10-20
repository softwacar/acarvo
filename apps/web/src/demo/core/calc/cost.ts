import type { Cur, Db, Id, Iso } from '../types'

// What a vehicle costs the company, from defined data only (decision document K-17 / M.7).
//   • maintenance cost  – completed maintenance records of the vehicle (the repair of a damage is its maintenance record);
//   • vehicle expenses  – posted expenses linked to the vehicle that are NOT the mirror of a maintenance record.
// The expense row created when maintenance is completed is a locked mirror (sourceType 'maintenance') of the maintenance cost, so
// it is never counted a second time. Damage repair is the maintenance record linked to the damage; a damage estimate is only an
// estimate and is shown apart, never added to the total. Branch-wide and general expenses are not spread over vehicles.

export interface CostLine {
  kind: 'maintenance' | 'damage_repair' | 'expense'
  id: Id
  no: string
  label: string
  at: string
  minor: number
  cur: Cur
}
export interface VehicleCost {
  vehicleId: Id
  lines: CostLine[]
  /** Per currency: maintenance, damage repair, expenses and their total. */
  byCur: Record<Cur, { maintenance: number; damageRepair: number; expenses: number; total: number }>
  /** Open damage estimates that no repair record covers yet. Not part of any total. */
  estimates: { id: Id; no: string; minor: number; cur: Cur }[]
}

export function vehicleCost(d: Db, vehicleId: Id, from?: Iso, to?: Iso): VehicleCost {
  const inRange = (iso: string) => (!from || iso >= from) && (!to || iso < to)
  const lines: CostLine[] = []
  for (const m of d.maintenance) {
    if (m.vehicleId !== vehicleId || m.status !== 'completed' || !m.cost || m.cost.minor <= 0) continue
    const at = m.actualEnd ?? m.plannedEnd
    if (!inRange(at)) continue
    lines.push({ kind: m.damageId ? 'damage_repair' : 'maintenance', id: m.id, no: m.no, label: m.reason, at, minor: m.cost.minor, cur: m.cost.cur })
  }
  for (const e of d.expenses) {
    if (e.status !== 'posted' || e.vehicleId !== vehicleId) continue
    if (e.sourceType === 'maintenance') continue // the mirror of a maintenance cost: counted once, from the maintenance record
    if (!inRange(`${e.date}T00:00:00.000Z`)) continue
    lines.push({ kind: 'expense', id: e.id, no: e.no, label: e.vendor, at: e.date, minor: e.amount.minor, cur: e.amount.cur })
  }
  const byCur: VehicleCost['byCur'] = {}
  for (const l of lines) {
    const row = (byCur[l.cur] ??= { maintenance: 0, damageRepair: 0, expenses: 0, total: 0 })
    if (l.kind === 'maintenance') row.maintenance += l.minor
    else if (l.kind === 'damage_repair') row.damageRepair += l.minor
    else row.expenses += l.minor
    row.total += l.minor
  }
  const estimates = d.damages
    .filter((x) => x.vehicleId === vehicleId && x.status !== 'closed' && x.estimate && !d.maintenance.some((m) => m.damageId === x.id && m.status === 'completed' && m.cost))
    .map((x) => ({ id: x.id, no: x.no, minor: x.estimate!.minor, cur: x.estimate!.cur }))
  return { vehicleId, lines: lines.sort((a, b) => b.at.localeCompare(a.at)), byCur, estimates }
}

/** The one reason a manual expense may not be entered: its category belongs to a source record (maintenance cost, authority fines). */
export const SOURCE_CATEGORIES = ['Bakım ve servis', 'Ceza (otorite ödemesi)']
