import { L } from '../i18n'
import { type Alert, type Severity, visibleAlerts } from './calc/alerts'
import { hasPerm, meOf } from './helpers'
import { canClaim, canSeeTask, isMyTask, isOpenTask } from './ops/tasks'
import type { Db, Id, Iso, LinkType } from './types'

// "İşlerim" (My Work) is a projection, not a store (decision document D.2 / K-9). Every row points at its own source:
// a task opens in Tasks, an approval in the Approval Center, an alert on the vehicle / rental / reservation it is about.
// The Home counter reads the same function, so the number on Home and the list on My Work cannot drift apart, and
// nothing the person may not see is counted.

export type InboxKind = 'task' | 'approval' | 'alert'
export type InboxReason = 'assigned' | 'pool' | 'decide' | 'apply' | 'waiting' | 'critical'

export interface InboxItem {
  key: string
  kind: InboxKind
  reason: InboxReason
  title: string
  detail: string
  at: Iso
  severity: Severity
  overdue: boolean
  link: { type: LinkType; id: Id }
  no?: string
}

export interface Inbox {
  /** "Bana düşenler": my tasks, tasks I can claim, approvals waiting for me, critical alerts. */
  mine: InboxItem[]
  /** "Uyarılar": every derived alert the person may see. */
  alerts: Alert[]
  counts: { mine: number; tasks: number; pool: number; approvals: number; critical: number; alerts: number; overdueTasks: number }
}

export const REASON_LABEL: Record<InboxReason, () => string> = {
  assigned: () => L('Bana atandı', 'Assigned to me'),
  pool: () => L('Üstlenebilirsiniz', 'You can claim it'),
  decide: () => L('Kararınız bekleniyor', 'Awaiting your decision'),
  apply: () => L('Uygulamanız bekleniyor', 'Awaiting your apply'),
  waiting: () => L('Başkasının kararını bekliyor', 'Waiting for someone else'),
  critical: () => L('Müdahale gerektiriyor', 'Needs action'),
}

const sevRank = (s: Severity) => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2)

export function inboxOf(d: Db): Inbox {
  const me = meOf(d)
  const nowMs = Date.parse(d.clock.now)
  const mine: InboxItem[] = []

  for (const t of d.tasks) {
    if (!isOpenTask(t) || !canSeeTask(d, t, me)) continue
    const assigned = isMyTask(t, me.id)
    const pool = !assigned && canClaim(d, t, me)
    if (!assigned && !pool) continue
    const overdue = Date.parse(t.dueAt) < nowMs
    mine.push({ key: `task:${t.id}`, kind: 'task', reason: assigned ? 'assigned' : 'pool', title: t.title, detail: assigned ? L(`${t.no} · ${t.priority === 'urgent' ? 'acil' : t.priority === 'high' ? 'yüksek öncelik' : 'normal öncelik'}`, `${t.no} · ${t.priority} priority`) : L(`${t.no} · açık havuz`, `${t.no} · open pool`), at: t.dueAt, severity: overdue ? (t.priority === 'urgent' ? 'critical' : 'warning') : t.priority === 'urgent' ? 'warning' : 'info', overdue, link: { type: 'task', id: t.id }, no: t.no })
  }

  if (hasPerm(d, 'approvals:view')) {
    for (const a of d.approvals) {
      const open = a.status === 'requested' || a.status === 'approved'
      if (!open) continue
      const mineRequest = a.requesterId === me.id
      let reason: InboxReason | null = null
      if (a.status === 'requested' && !mineRequest && hasPerm(d, 'approvals:decide')) reason = 'decide'
      else if (a.status === 'approved' && !mineRequest && hasPerm(d, 'approvals:apply')) reason = 'apply'
      else if (mineRequest) reason = 'waiting'
      if (!reason) continue
      mine.push({ key: `approval:${a.id}`, kind: 'approval', reason, title: `${a.no} · ${a.reason.slice(0, 80)}`, detail: reason === 'decide' ? L('Karar bekliyor', 'Awaiting a decision') : reason === 'apply' ? L('Onaylandı, uygulanmadı', 'Approved, not applied') : L('Talebiniz başkasının kararını bekliyor', 'Your request is waiting for someone else'), at: a.createdAt, severity: reason === 'waiting' ? 'info' : 'warning', overdue: false, link: { type: 'approval', id: a.id }, no: a.no })
    }
  }

  const alerts = visibleAlerts(d)
  // Alerts that only repeat a task or an approval are already represented by their own row above.
  for (const a of alerts) {
    if (a.severity !== 'critical' || a.kind === 'task_overdue' || a.kind === 'approval_waiting') continue
    mine.push({ key: `alert:${a.id}`, kind: 'alert', reason: 'critical', title: a.title, detail: a.detail, at: a.at, severity: 'critical', overdue: false, link: a.link })
  }

  mine.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.at.localeCompare(b.at))
  const count = (k: InboxKind) => mine.filter((i) => i.kind === k).length
  return {
    mine,
    alerts,
    counts: {
      mine: mine.length,
      tasks: mine.filter((i) => i.kind === 'task' && i.reason === 'assigned').length,
      pool: mine.filter((i) => i.kind === 'task' && i.reason === 'pool').length,
      approvals: count('approval'),
      critical: alerts.filter((a) => a.severity === 'critical').length,
      alerts: alerts.length,
      overdueTasks: mine.filter((i) => i.kind === 'task' && i.overdue).length,
    },
  }
}
