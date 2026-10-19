import { L } from '../i18n'
import { hasPerm, scopeBranches } from './helpers'
import type { Db, Id, LinkType } from './types'

// Global search (spec §45): records the acting demo user may see, within their branch scope. A record outside the
// scope never appears here, also not as a count.

export interface SearchHit {
  type: LinkType
  id: Id
  title: string
  sub: string
  group: string
}

export function searchAll(d: Db, query: string, limit = 24): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const scope = scopeBranches(d)
  const out: SearchHit[] = []
  const has = (m: string) => hasPerm(d, `${m}:view`)
  const inScope = (...ids: (Id | undefined)[]) => ids.some((i) => i && scope.includes(i))
  const m = (...vals: (string | undefined)[]) => vals.some((v) => v && v.toLowerCase().includes(q))
  if (has('vehicles')) for (const v of d.vehicles) if (inScope(v.homeBranchId) && m(v.plate, v.make, v.model, v.vin)) out.push({ type: 'vehicle', id: v.id, title: v.plate, sub: `${v.make} ${v.model}`, group: L('Araçlar', 'Vehicles') })
  if (has('customers')) for (const c of d.customers) if (!c.archived && m(c.name, c.no, c.phone, c.email)) out.push({ type: 'customer', id: c.id, title: c.name, sub: `${c.no} · ${c.country}`, group: L('Müşteriler', 'Customers') })
  if (has('rentals')) for (const r of d.rentals) if (inScope(r.pickupBranchId, r.returnBranchId) && m(r.no, d.vehicles.find((v) => v.id === r.vehicleId)?.plate, d.customers.find((c) => c.id === r.customerId)?.name)) out.push({ type: 'rental', id: r.id, title: r.no, sub: `${d.customers.find((c) => c.id === r.customerId)?.name} · ${d.vehicles.find((v) => v.id === r.vehicleId)?.plate}`, group: L('Kiralamalar', 'Rentals') })
  if (has('reservations')) for (const r of d.reservations) if (inScope(r.pickupBranchId, r.returnBranchId) && m(r.no, d.customers.find((c) => c.id === r.customerId)?.name)) out.push({ type: 'reservation', id: r.id, title: r.no, sub: d.customers.find((c) => c.id === r.customerId)?.name ?? '', group: L('Rezervasyonlar', 'Reservations') })
  if (has('corporate')) for (const c of d.corporates) if (m(c.name, c.no, c.taxId)) out.push({ type: 'corporate', id: c.id, title: c.name, sub: c.no, group: 'Kurumsal hesaplar' })
  if (has('fines')) for (const f of d.fines) if (m(f.no, f.authorityRef)) out.push({ type: 'fine', id: f.id, title: f.no, sub: f.authorityRef, group: 'Cezalar' })
  if (has('damages')) for (const x of d.damages) if (m(x.no, d.vehicles.find((v) => v.id === x.vehicleId)?.plate)) out.push({ type: 'damage', id: x.id, title: x.no, sub: x.description.slice(0, 50), group: 'Hasarlar' })
  if (has('maintenance')) for (const x of d.maintenance) if (m(x.no, d.vehicles.find((v) => v.id === x.vehicleId)?.plate)) out.push({ type: 'maintenance', id: x.id, title: x.no, sub: x.reason.slice(0, 50), group: L('Bakım', 'Maintenance') })
  if (has('tasks')) for (const t of d.tasks) if (m(t.no, t.title)) out.push({ type: 'task', id: t.id, title: t.title, sub: t.no, group: L('Görevler', 'Tasks') })
  if (has('leads')) for (const l of d.leads) if (m(l.no, l.name)) out.push({ type: 'lead', id: l.id, title: l.name, sub: l.no, group: 'Talepler' })
  if (has('approvals')) for (const a of d.approvals) if (m(a.no)) out.push({ type: 'approval', id: a.id, title: a.no, sub: a.reason.slice(0, 50), group: 'Onaylar' })
  return out.slice(0, limit)
}
