import { L } from '../../i18n'
import { readinessOf, vehicleHolds } from './availability'
import { rentalFinance, computeCashExpected, openSessionOf } from './finance'
import { customerDocChecks, DOC_LABEL } from './policy'
import { activeBranches, hasPerm } from '../helpers'
import { DAY, dayOf, HOUR } from '../time'
import type { Db, Id, Iso, LinkType, Rule } from '../types'

// The single source of derived warnings (spec §75 "çakışmayan görünümler"). Command Center, Risks, Dashboard,
// Notifications and Reports all read this one list; no screen creates its own alert store or its own "incident".
// Nothing here runs in the background: alerts are derived on page load and when the demo date changes.

export type Severity = 'critical' | 'warning' | 'info'
export interface Alert {
  id: string
  kind: string
  severity: Severity
  title: string
  detail: string
  at: Iso
  link: { type: LinkType; id: Id }
  branchId?: Id
  module: string
  ruleId?: Id
}

const hoursLate = (now: Iso, planned: Iso) => Math.floor((Date.parse(now) - Date.parse(planned)) / HOUR)

export function deriveAlerts(d: Db): Alert[] {
  const now = d.clock.now
  const nowMs = Date.parse(now)
  const tz = d.settings.company.tz
  const out: Alert[] = []
  const veh = (id: Id) => d.vehicles.find((v) => v.id === id)
  const cust = (id: Id) => d.customers.find((c) => c.id === id)?.name ?? '—'
  const push = (a: Alert) => out.push(a)

  // 1. overdue returns (delivered rentals past the planned return)
  for (const r of d.rentals) {
    if (r.status !== 'delivered') continue
    const h = hoursLate(now, r.plannedReturnAt)
    if (h < 0) continue
    if (h === 0 && nowMs < Date.parse(r.plannedReturnAt)) continue
    push({ id: `overdue:${r.id}`, kind: 'overdue_return', severity: h >= d.settings.alertThresholds.overdueCriticalHours ? 'critical' : 'warning', title: L(`${r.no} · iade gecikti (${veh(r.vehicleId)?.plate})`, `${r.no} · return overdue (${veh(r.vehicleId)?.plate})`), detail: L(`${cust(r.customerId)} · planlanan iade geçti (${h} saat). Araç hâlâ müşteride.`, `${cust(r.customerId)} · planned return passed (${h} h). The vehicle is still with the customer.`), at: r.plannedReturnAt, link: { type: 'rental', id: r.id }, branchId: r.returnBranchId, module: 'rentals' })
  }

  // 2. pickups in the next 24 h (and late pickups): readiness, documents, contract, deposit
  for (const r of d.rentals) {
    if (r.status !== 'prepared') continue
    const dueMs = Date.parse(r.plannedPickupAt)
    if (dueMs > nowMs + d.settings.alertThresholds.pickupLookaheadHours * HOUR) continue
    const v = veh(r.vehicleId)
    if (!v) continue
    const issues: string[] = []
    const ready = readinessOf(d, v, now)
    if (!ready.ready) issues.push(L(`araç hazır değil (${ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')})`, `vehicle not ready (${ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')})`))
    const c = cust(r.customerId)
    for (const drv of r.drivers) {
      const cu = d.customers.find((x) => x.id === drv.customerId)
      if (!cu) continue
      for (const chk of customerDocChecks(d, cu, now, r.plannedReturnAt)) if (chk.state === 'missing' || chk.state === 'expired') issues.push(`${cu.name}: ${DOC_LABEL[chk.kind] ?? chk.kind} ${chk.state === 'missing' ? 'eksik' : L('geçersiz', 'invalid')}`)
    }
    const ctr = d.contracts.find((x) => x.id === r.contract.id)
    if (!ctr || ctr.status !== 'signed') issues.push(L('sözleşme imzasız', 'contract unsigned'))
    if (r.deposit.required.minor > 0 && r.deposit.state !== 'held' && r.deposit.state !== 'waived') issues.push(L('depozito alınmadı', 'deposit not taken'))
    if (issues.length) push({ id: `pickup:${r.id}`, kind: 'pickup_blocked', severity: dueMs <= nowMs + d.settings.alertThresholds.pickupCriticalHours * HOUR ? 'critical' : 'warning', title: L(`${r.no} · teslim hazırlığı eksik (${v.plate})`, `${r.no} · handover preparation incomplete (${v.plate})`), detail: `${c} · ${issues.join(' · ')}`, at: r.plannedPickupAt, link: { type: 'rental', id: r.id }, branchId: r.pickupBranchId, module: 'rentals' })
  }

  // 3. confirmed class-only reservations close to pickup without a vehicle
  for (const r of d.reservations) {
    if (r.status !== 'confirmed') continue
    if (!r.vehicleId && Date.parse(r.pickupAt) <= nowMs + 24 * HOUR) push({ id: `novehicle:${r.id}`, kind: 'no_vehicle', severity: Date.parse(r.pickupAt) <= nowMs + 6 * HOUR ? 'critical' : 'warning', title: L(`${r.no} · araç atanmadı`, `${r.no} · no vehicle assigned`), detail: L(`${cust(r.customerId)} · yalnız sınıf rezervasyonu (${d.classes.find((c) => c.id === r.classId)?.name}); teslimden önce belirli araç atanmalı.`, `${cust(r.customerId)} · class-only reservation (${d.classes.find((c) => c.id === r.classId)?.name}); a specific vehicle must be assigned before handover.`), at: r.pickupAt, link: { type: 'reservation', id: r.id }, branchId: r.pickupBranchId, module: 'reservations' })
    // 4. conflicts: a confirmed reservation whose vehicle is blocked, in service or out of service
    if (r.vehicleId) {
      const v = veh(r.vehicleId)
      if (!v) continue
      const holds = vehicleHolds(d, v, r.pickupAt, r.returnAt, now, { reservationId: r.id }).filter((h) => h.kind === 'damage_block' || h.kind === 'maintenance' || h.kind === 'out_of_service' || h.kind === 'rental' || h.kind === 'engagement_gap')
      if (holds.length) push({ id: `conflict:${r.id}`, kind: 'conflict', severity: 'critical', title: L(`${r.no} · araç çakışması (${v.plate})`, `${r.no} · vehicle conflict (${v.plate})`), detail: L(`${cust(r.customerId)} · ${holds.map((h) => h.label).join(', ')} ile çakışıyor. Alternatif araç atayın.`, `${cust(r.customerId)} · conflicts with ${holds.map((h) => h.label).join(', ')}. Assign an alternative vehicle.`), at: r.pickupAt, link: { type: 'reservation', id: r.id }, branchId: r.pickupBranchId, module: 'reservations' })
    }
  }

  // 5. vehicle documents and service
  const warn = d.settings.docs.warnDays
  for (const doc of d.documents) {
    if (doc.ownerType !== 'vehicle' || !doc.validUntil) continue
    const left = Math.floor((Date.parse(`${doc.validUntil}T23:59:59Z`) - nowMs) / DAY)
    const v = veh(doc.ownerId)
    if (!v || v.status === 'sold') continue
    if (left < 0) push({ id: `vdoc:${doc.id}`, kind: 'doc_expired', severity: 'critical', title: L(`${v.plate} · ${DOC_LABEL[doc.kind] ?? doc.kind} süresi doldu`, `${v.plate} · ${DOC_LABEL[doc.kind] ?? doc.kind} expired`), detail: L(`${-left} gün önce doldu (${doc.validUntil}). Araç teslim hazırlığında engel sayılır.`, `Expired ${-left} day(s) ago (${doc.validUntil}). It counts as a blocker for handover readiness.`), at: `${doc.validUntil}T00:00:00.000Z`, link: { type: 'vehicle', id: v.id }, branchId: v.homeBranchId, module: 'vehicles' })
    else if (left <= warn) push({ id: `vdoc:${doc.id}`, kind: 'doc_expiring', severity: 'warning', title: L(`${v.plate} · ${DOC_LABEL[doc.kind] ?? doc.kind} ${left} gün içinde bitiyor`, `${v.plate} · ${DOC_LABEL[doc.kind] ?? doc.kind} expires in ${left} day(s)`), detail: L(`Geçerlilik: ${doc.validUntil}`, `Valid until: ${doc.validUntil}`), at: `${doc.validUntil}T00:00:00.000Z`, link: { type: 'vehicle', id: v.id }, branchId: v.homeBranchId, module: 'vehicles' })
  }
  for (const v of d.vehicles) {
    if (v.status === 'sold' || v.source === 'external') continue
    const over = v.odometerKm - v.service.lastKm - v.service.intervalKm
    if (over > 0) push({ id: `svc:${v.id}`, kind: 'service_overdue', severity: 'warning', title: L(`${v.plate} · periyodik bakım gecikti`, `${v.plate} · periodic service overdue`), detail: L(`${over.toLocaleString('tr')} km gecikmiş. Bakım planlayın.`, `${over.toLocaleString('tr')} km overdue. Plan a service.`), at: v.service.lastAt, link: { type: 'vehicle', id: v.id }, branchId: v.homeBranchId, module: 'maintenance' })
    else if (over > -d.settings.alertThresholds.serviceSoonKm) push({ id: `svc:${v.id}`, kind: 'service_soon', severity: 'info', title: L(`${v.plate} · periyodik bakım yaklaşıyor`, `${v.plate} · periodic service approaching`), detail: L(`${(-over).toLocaleString('tr')} km kaldı.`, `${(-over).toLocaleString('tr')} km left.`), at: v.service.lastAt, link: { type: 'vehicle', id: v.id }, branchId: v.homeBranchId, module: 'maintenance' })
  }

  // 6. maintenance: planned not started, in progress past its planned end
  for (const m of d.maintenance) {
    const v = veh(m.vehicleId)
    if (!v) continue
    if (m.status === 'in_progress' && Date.parse(m.plannedEnd) < nowMs) push({ id: `mnt:${m.id}`, kind: 'maintenance_overdue', severity: 'warning', title: L(`${m.no} · bakım planlanan bitişi geçti (${v.plate})`, `${m.no} · maintenance passed its planned end (${v.plate})`), detail: L('Araç serviste uygunluk dışı kalmaya devam ediyor.', 'The vehicle stays out of availability while in service.'), at: m.plannedEnd, link: { type: 'maintenance', id: m.id }, branchId: v.homeBranchId, module: 'maintenance' })
    if (m.status === 'planned' && Date.parse(m.plannedStart) < nowMs) push({ id: `mntst:${m.id}`, kind: 'maintenance_not_started', severity: 'warning', title: L(`${m.no} · planlı bakım başlamadı (${v.plate})`, `${m.no} · planned maintenance has not started (${v.plate})`), detail: L('Planlanan başlangıç geçti; servise alın veya iptal edin.', 'The planned start has passed; start the service or cancel it.'), at: m.plannedStart, link: { type: 'maintenance', id: m.id }, branchId: v.homeBranchId, module: 'maintenance' })
  }

  // 7. damage blocks and critical incidents
  for (const dm of d.damages) {
    if (!dm.blocksVehicle || dm.status === 'closed') continue
    const v = veh(dm.vehicleId)
    push({ id: `blk:${dm.id}`, kind: 'damage_block', severity: 'warning', title: L(`${dm.no} · araç hasar engelinde (${v?.plate})`, `${dm.no} · vehicle under a damage block (${v?.plate})`), detail: L(`${dm.description.slice(0, 90)} Engeli kaldırmak ikinci bir yetkili ister.`, `${dm.description.slice(0, 90)} Lifting the block needs a second authorised person.`), at: dm.createdAt, link: { type: 'damage', id: dm.id }, branchId: v?.homeBranchId, module: 'damages' })
  }
  for (const inc of d.incidents) {
    if ((inc.status === 'open' || inc.status === 'investigating') && (inc.severity === 'high' || inc.severity === 'critical')) push({ id: `inc:${inc.id}`, kind: 'incident_open', severity: inc.severity === 'critical' ? 'critical' : 'warning', title: `${inc.no} · ${inc.title}`, detail: L('Açık yüksek önemli olay. Olayı çözmek hasar/ceza kaydını otomatik kapatmaz.', 'Open high-severity incident. Resolving the incident does not automatically close the damage/fine record.'), at: inc.createdAt, link: { type: 'incident', id: inc.id }, module: 'incidents' })
  }

  // 8. approvals, tasks, plans, fines, cash
  for (const a of d.approvals) if (a.status === 'requested' || a.status === 'approved') push({ id: `apr:${a.id}`, kind: 'approval_waiting', severity: 'info', title: `${a.no} · ${a.status === 'requested' ? 'karar bekliyor' : L('onaylandı, uygulanmadı', 'approved, not applied')}`, detail: a.reason.slice(0, 110), at: a.createdAt, link: { type: 'approval', id: a.id }, module: 'approvals' })
  for (const t of d.tasks) {
    if (t.status !== 'done' && Date.parse(t.dueAt) < nowMs) push({ id: `task:${t.id}`, kind: 'task_overdue', severity: t.priority === 'urgent' ? 'critical' : 'warning', title: L(`${t.no} · görev gecikti: ${t.title}`, `${t.no} · task overdue: ${t.title}`), detail: L(`Son tarih geçti. Görevi tamamlamak bağlı kaydı değiştirmez.`, `The due date has passed. Completing the task does not change the linked record.`), at: t.dueAt, link: { type: 'task', id: t.id }, branchId: t.branchId, module: 'tasks' })
  }
  for (const p of d.paymentPlans) if (p.status !== 'completed' && Date.parse(p.dueAt) < nowMs) push({ id: `plan:${p.id}`, kind: 'plan_overdue', severity: 'warning', title: L(`Ödeme planı vadesi geçti · ${p.payerName}`, `Payment plan due date passed · ${p.payerName}`), detail: L(`${(p.amount.minor / 100).toFixed(2)} ${p.amount.cur} beklenen; plan satırı tahsilat sayılmaz.`, `${(p.amount.minor / 100).toFixed(2)} ${p.amount.cur} expected; a plan line is not a collection.`), at: p.dueAt, link: { type: 'rental', id: p.rentalId }, module: 'finance' })
  for (const f of d.fines) if (!f.authorityPaidAt && f.status !== 'closed' && Date.parse(`${f.dueDate}T23:59:59Z`) - nowMs < 5 * DAY) push({ id: `fine:${f.id}`, kind: 'fine_due', severity: Date.parse(`${f.dueDate}T23:59:59Z`) < nowMs ? 'critical' : 'warning', title: L(`${f.no} · ceza vadesi yaklaşıyor (${f.authorityRef})`, `${f.no} · fine due date approaching (${f.authorityRef})`), detail: L(`Yasal vade: ${f.dueDate}. Otoriteye ödeme ve müşteri tahsilatı ayrı işlemlerdir.`, `Legal due date: ${f.dueDate}. Paying the authority and collecting from the customer are separate actions.`), at: `${f.dueDate}T00:00:00.000Z`, link: { type: 'fine', id: f.id }, module: 'fines' })
  for (const dr of d.drawers) {
    const last = d.cashSessions.filter((s) => s.drawerId === dr.id && s.closedAt).sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))[0]
    if (last && last.varianceMinor && Math.abs(last.varianceMinor) > 0 && Date.parse(last.closedAt!) > nowMs - 3 * DAY) push({ id: `cash:${last.id}`, kind: 'cash_variance', severity: 'info', title: L(`${dr.name} · son vardiyada kasa farkı`, `${dr.name} · cash variance at the last shift`), detail: `Fark ${(last.varianceMinor / 100).toFixed(2)} ${dr.currency}`, at: last.closedAt!, link: { type: 'payment', id: last.id }, branchId: dr.branchId, module: 'cash' })
  }
  void computeCashExpected
  void openSessionOf

  // 9. returned rentals with money still open
  for (const r of d.rentals) {
    if (r.status !== 'returned' && r.status !== 'closed') continue
    if (r.financeStatus === 'closed') continue
    const f = rentalFinance(d, r.id)
    if (f.outstandingMinor > 0) push({ id: `out:${r.id}`, kind: 'outstanding', severity: 'info', title: L(`${r.no} · açık bakiye (${(f.outstandingMinor / 100).toFixed(2)} ${f.cur})`, `${r.no} · open balance (${(f.outstandingMinor / 100).toFixed(2)} ${f.cur})`), detail: L(`${cust(r.customerId)} · iade alındı, finans kapanışı bekliyor.`, `${cust(r.customerId)} · returned, awaiting financial closure.`), at: r.actualReturnAt ?? r.plannedReturnAt, link: { type: 'rental', id: r.id }, branchId: r.returnBranchId, module: 'finance' })
  }

  // 10. external vehicles: confirmed engagement close to its start but not received
  for (const e of d.engagements) {
    if (e.status === 'confirmed' && Date.parse(e.from) - nowMs < 48 * HOUR && Date.parse(e.from) - nowMs > -DAY) push({ id: `ext:${e.id}`, kind: 'external_not_received', severity: 'warning', title: L(`${e.no} · dış araç teslim alınmadı`, `${e.no} · external vehicle not received`), detail: L('Anlaşma penceresi başlıyor; araç Received + Ready olmadan teslim edilemez.', 'The engagement window is starting; the vehicle cannot be handed over without being Received + Ready.'), at: e.from, link: { type: 'engagement', id: e.id }, module: 'suppliers' })
  }

  // 11. active rules (safe catalogue): the same alert list, tagged with the rule
  for (const rule of d.rules) if (rule.status === 'active') out.push(...evaluateRule(d, rule, tz))

  return out.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.at.localeCompare(b.at))
}
const sevRank = (s: Severity) => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2)

// ------------------------------------------------------------------ rules

function cmp(op: Rule['conditions'][number]['op'], a: number, b: number) {
  return op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : op === '<=' ? a <= b : a === b
}

/** Evaluates one safe rule against the current records. Used for the live alert list and for the editor preview. */
export function evaluateRule(d: Db, rule: Rule, tz = d.settings.company.tz): Alert[] {
  const now = d.clock.now
  const nowMs = Date.parse(now)
  const out: Alert[] = []
  const sev: Severity = rule.severity === 'critical' ? 'critical' : rule.severity === 'warning' ? 'warning' : 'info'
  const family = rule.conditions[0]?.field.split('.')[0]
  const all = (vals: Record<string, number>) => {
    const res = rule.conditions.map((c) => (c.field in vals ? cmp(c.op, vals[c.field]!, Number(c.value)) : false))
    return rule.join === 'AND' ? res.every(Boolean) : res.some(Boolean)
  }
  const mk = (idPart: string, title: string, link: { type: LinkType; id: Id }, branchId?: Id): Alert => ({ id: `rule:${rule.id}:${idPart}`, kind: rule.action === 'review_flag' ? 'rule_review' : 'rule_alert', severity: sev, title: `${rule.name} · ${title}`, detail: rule.message, at: now, link, branchId, module: 'rules', ruleId: rule.id })
  if (family === 'rental') {
    for (const r of d.rentals) {
      const f = rentalFinance(d, r.id)
      const vals = { 'rental.overdueHours': r.status === 'delivered' ? Math.max(0, hoursLate(now, r.plannedReturnAt)) : 0, 'rental.outstandingMinor': f.outstandingMinor }
      if (all(vals)) out.push(mk(r.id, r.no, { type: 'rental', id: r.id }, r.pickupBranchId))
    }
  } else if (family === 'reservation') {
    for (const r of d.reservations) if (r.status === 'pending' && all({ 'reservation.pendingHours': Math.floor((nowMs - Date.parse(r.createdAt)) / HOUR) })) out.push(mk(r.id, r.no, { type: 'reservation', id: r.id }, r.pickupBranchId))
  } else if (family === 'vehicle') {
    for (const v of d.vehicles) {
      if (v.status === 'sold') continue
      const docLeft = Math.min(...d.documents.filter((x) => x.ownerType === 'vehicle' && x.ownerId === v.id && x.validUntil).map((x) => Math.floor((Date.parse(`${x.validUntil}T23:59:59Z`) - nowMs) / DAY)), 9999)
      if (all({ 'vehicle.serviceKmOver': v.odometerKm - v.service.lastKm - v.service.intervalKm, 'vehicle.docDaysLeft': docLeft })) out.push(mk(v.id, v.plate, { type: 'vehicle', id: v.id }, v.homeBranchId))
    }
  } else if (family === 'customer') {
    for (const c of d.customers) {
      const left = Math.min(...d.documents.filter((x) => x.ownerType === 'customer' && x.ownerId === c.id && x.validUntil).map((x) => Math.floor((Date.parse(`${x.validUntil}T23:59:59Z`) - nowMs) / DAY)), 9999)
      if (all({ 'customer.docDaysLeft': left })) out.push(mk(c.id, c.name, { type: 'customer', id: c.id }))
    }
  } else if (family === 'cash') {
    for (const s of d.cashSessions) if (s.closedAt && all({ 'cash.varianceMinor': Math.abs(s.varianceMinor ?? 0) })) out.push(mk(s.id, s.id, { type: 'payment', id: s.id }))
  }
  void tz
  void dayOf
  return out
}

/** Alerts the acting demo user may see: module permission and branch scope apply to the list and to every count. */
export function visibleAlerts(d: Db): Alert[] {
  const active = activeBranches(d)
  return deriveAlerts(d).filter((a) => hasPerm(d, `${a.module}:view`) && (!a.branchId || active.includes(a.branchId)))
}
