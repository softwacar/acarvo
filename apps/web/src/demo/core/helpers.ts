import {loc, B } from '../i18n'
import type { Db, DemoEvent, HistoryEntry, Id, LinkType } from './types'

// Pure helpers over a Db draft. They have no React, storage or store imports so the seed, the domain operations and
// the actions can all share them without import cycles.

export class DemoError extends Error {
  constructor(
    message: string,
    readonly code = 'DEMO_RULE',
    readonly fields: Record<string, string> = {},
  ) {
    super(loc(message))
    this.fields = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, loc(v)]))
  }
}
export const fail = (message: string, fields: Record<string, string> = {}, code = 'DEMO_RULE'): never => {
  throw new DemoError(message, code, fields)
}

export const nowOf = (d: Db) => d.clock.now
export const meOf = (d: Db) => d.users.find((u) => u.id === d.session.userId) ?? d.users[0]!
export const roleOf = (d: Db) => d.roles.find((r) => r.id === meOf(d).roleId)!

/** Effective permission: role grants, plus the person's own grants, minus their denies. */
export function hasPerm(d: Db, perm: string, user = meOf(d)): boolean {
  if (user.deny.includes(perm)) return false
  if (user.grant.includes(perm)) return true
  const role = d.roles.find((r) => r.id === user.roleId)
  return !!role && (role.perms.includes('*') || role.perms.includes(perm))
}
/** Throws a readable error when the acting demo user lacks a permission (demo UX simulation, not server security). */
export function need(d: Db, perm: string, what = B('Bu işlem', 'This action')): void {
  if (!hasPerm(d, perm)) fail(B(`${what} için yetkiniz yok (${perm}). Demo rolünü değiştirerek deneyebilirsiniz.`, `You do not have permission for ${what} (${perm}). Try switching the demo role.`), {}, 'FORBIDDEN')
}

/** Branches the acting user may see. Empty branchIds means all branches. */
export function scopeBranches(d: Db, user = meOf(d)): Id[] {
  return user.branchIds.length ? user.branchIds : d.branches.map((b) => b.id)
}
/** The branches shown right now: the header filter inside the user's scope. */
export function activeBranches(d: Db): Id[] {
  const scope = scopeBranches(d)
  return d.session.branchId === 'all' ? scope : scope.filter((b) => b === d.session.branchId)
}

export function nextId(d: Db, prefix: string): Id {
  d.counters[prefix] = (d.counters[prefix] ?? 0) + 1
  return `${prefix}${d.counters[prefix]}`
}
/** Human number such as R-000123. */
export function nextNo(d: Db, series: string, width = 6): string {
  const key = `no:${series}`
  d.counters[key] = (d.counters[key] ?? 0) + 1
  return `${series}-${String(d.counters[key]).padStart(width, '0')}`
}

export function logEvent(d: Db, e: Omit<DemoEvent, 'id' | 'at' | 'actorId' | 'actorName'> & { actorId?: Id | 'system'; at?: string }): void {
  const me = meOf(d)
  const system = e.actorId === 'system'
  const { at, actorId, ...rest } = e
  void actorId
  d.events.push({ ...rest, id: nextId(d, 'ev'), at: at ?? nowOf(d), actorId: system ? 'system' : me.id, actorName: system ? 'Sistem' : me.name })
}
export function addHistory(d: Db, list: HistoryEntry[], action: string, detail: string, by: Id | 'system' = meOf(d).id): void {
  list.push({ id: nextId(d, 'h'), at: nowOf(d), by, action, detail })
}
export function notify(d: Db, userId: Id | undefined, text: string, link?: { type: LinkType; id: Id }, kind = 'info'): void {
  d.notifications.push({ id: nextId(d, 'n'), at: nowOf(d), userId, kind, text, link, read: false })
}

export const userName = (d: Db, id: Id | 'system' | undefined) => (id === 'system' ? 'Sistem' : (d.users.find((u) => u.id === id)?.name ?? '—'))
export const branchOf = (d: Db, id: Id | undefined) => d.branches.find((b) => b.id === id)
export const tzOf = (d: Db, branchId?: Id) => branchOf(d, branchId)?.tz ?? d.settings.company.tz

/** The view permission that opens the record a link points to. A person without it must not learn what the record says. */
const LINK_PERM: Partial<Record<LinkType, string>> = {
  vehicle: 'vehicles:view',
  rental: 'rentals:view',
  reservation: 'reservations:view',
  customer: 'customers:view',
  corporate: 'corporate:view',
  maintenance: 'maintenance:view',
  damage: 'damages:view',
  incident: 'incidents:view',
  fine: 'fines:view',
  payment: 'finance:view',
  approval: 'approvals:view',
  contract: 'contracts:view',
  lead: 'leads:view',
  quote: 'leads:view',
  partner: 'partners:view',
  supplier: 'suppliers:view',
  expense: 'expenses:view',
  document: 'documents:view',
}
/** True when the acting person may open the linked record (or the notification has no link). */
export function canViewLink(d: Db, link?: { type: LinkType; id: Id } | null): boolean {
  if (!link) return true
  const perm = LINK_PERM[link.type]
  return !perm || hasPerm(d, perm)
}
