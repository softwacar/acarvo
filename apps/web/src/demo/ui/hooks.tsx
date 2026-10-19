import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { visibleAlerts } from '../core/calc/alerts'
import { toast } from './dialogs'
import { activeBranches, commit, DemoError, hasPerm, meOf, scopeBranches, useDb } from '../core/store'
import { fmtDate, fmtDateTime, fmtTime } from '../core/time'
import type { Db, Id, LinkType } from '../core/types'

export { useDb }

export const useMe = () => meOf(useDb())
export const useTz = () => useDb().settings.company.tz
export function useCan() {
  const d = useDb()
  return useCallback((perm: string) => hasPerm(d, perm), [d])
}
/** Branches the user may see, and the ones shown right now (header filter). */
export function useBranchScope() {
  const d = useDb()
  return useMemo(() => ({ scope: scopeBranches(d), active: activeBranches(d), all: d.session.branchId === 'all' }), [d])
}
export const inBranches = (active: Id[], ...ids: (Id | undefined)[]) => ids.some((i) => i && active.includes(i))

/** Time formatting in a branch zone (or the company zone). */
export function useFmt() {
  const d = useDb()
  const tz = d.settings.company.tz
  return useMemo(() => {
    const zone = (branchId?: Id) => d.branches.find((b) => b.id === branchId)?.tz ?? tz
    return {
      dt: (iso: string, branchId?: Id) => fmtDateTime(iso, zone(branchId)),
      date: (iso: string, branchId?: Id) => fmtDate(iso, zone(branchId)),
      time: (iso: string, branchId?: Id) => fmtTime(iso, zone(branchId)),
      zone,
    }
  }, [d, tz])
}

export type ActionResult = { ok: true } | { ok: false; error: string; fields: Record<string, string> }

/**
 * Runs a demo action on the shared state. Success shows a toast that says "demo"; a rule violation comes back as an
 * explained error (never a silent success).
 */
export function runAction<T = void>(fn: (d: Db) => T, message?: string): { ok: true; value: T } | { ok: false; error: string; fields: Record<string, string> } {
  try {
    const value = commit(fn)
    if (message) toast(message)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof DemoError) return { ok: false, error: e.message, fields: e.fields }
    throw e
  }
}

// ---------------------------------------------------------------- URL state (filters and tabs survive back/forward)

type SearchBag = Record<string, string>

export function useUrlState(key: string, initial = ''): [string, (v: string) => void] {
  const navigate = useNavigate()
  const search = useRouterState({ select: (s) => s.location.search as SearchBag })
  // The router parses numeric-looking values (?gecikme=1) into numbers; the screens work with strings.
  const raw = search[key]
  const value = typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' ? String(raw) : initial
  const set = useCallback(
    (v: string) => {
      void navigate({ to: '.', search: ((prev: SearchBag) => {
        const next = { ...prev }
        if (v === initial || v === '') delete next[key]
        else next[key] = v
        return next
      }) as never, replace: true, resetScroll: false })
    },
    [navigate, key, initial],
  )
  return [value, set]
}

// ---------------------------------------------------------------- links between records

export const ENTITY_PATH: Record<LinkType, string> = {
  vehicle: '/araclar',
  rental: '/kiralamalar',
  reservation: '/rezervasyonlar',
  customer: '/musteriler',
  corporate: '/kurumsal-hesaplar',
  maintenance: '/bakim-servis',
  damage: '/hasar-kayitlari',
  incident: '/olay-merkezi',
  fine: '/ceza-modulu',
  payment: '/finans',
  approval: '/onay-merkezi',
  task: '/gorevler',
  contract: '/sozlesmeler',
  lead: '/talep-merkezi',
  quote: '/talep-merkezi',
  partner: '/partnerler',
  supplier: '/arac-tedarikcileri',
  engagement: '/arac-tedarikcileri',
  expense: '/masraflar',
  document: '/belge-merkezi',
  transfer: '/araclar',
}
/** Detail pages exist for these record types; the others open their list filtered to the record. */
const HAS_DETAIL = new Set<LinkType>(['vehicle', 'rental', 'reservation', 'customer', 'corporate'])

export function entityHref(type: LinkType, id: Id): string {
  const base = ENTITY_PATH[type]
  return HAS_DETAIL.has(type) ? `${base}/${id}` : `${base}?kayit=${id}`
}

/** Derived alerts for the acting user (one list for Command Center, Risks, Dashboard and the notification bell). */
export function useAlerts() {
  const d = useDb()
  return useMemo(() => visibleAlerts(d), [d])
}
