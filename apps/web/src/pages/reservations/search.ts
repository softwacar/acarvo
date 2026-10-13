import { RESERVATION_PAGE_SIZES, RESERVATION_SORTS, RESERVATION_STATUSES, type ReservationSort, type ReservationStatus } from '@acarvo/shared'

/**
 * Reservation list state kept in the URL: filters, view, sort and page. The search text is NOT put in the URL
 * (it may be a name or a phone number); it lives in memory for the open tab.
 */
export interface ReservationListSearch {
  status?: ReservationStatus | 'all'
  from?: string
  to?: string
  branchId?: string
  vehicleClassId?: string
  assigned?: 'yes' | 'no'
  view?: 'takvim'
  sort?: ReservationSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined)
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

export function validateReservationSearch(s: Record<string, unknown>): ReservationListSearch {
  const page = Number(s.page)
  const pageSize = Number(s.pageSize)
  const out: ReservationListSearch = {
    status: oneOf([...RESERVATION_STATUSES, 'all'] as const, s.status),
    from: day(s.from),
    to: day(s.to),
    branchId: uuid(s.branchId),
    vehicleClassId: uuid(s.vehicleClassId),
    assigned: oneOf(['yes', 'no'] as const, s.assigned),
    view: oneOf(['takvim'] as const, s.view),
    sort: oneOf(RESERVATION_SORTS, s.sort),
    dir: oneOf(['asc', 'desc'] as const, s.dir),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    pageSize: (RESERVATION_PAGE_SIZES as readonly number[]).includes(pageSize) && pageSize !== 25 ? pageSize : undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as ReservationListSearch
}

let memory: { companyId?: string; text: string; search: ReservationListSearch } = { text: '', search: {} }
export const rememberedText = (companyId?: string) => (memory.companyId === companyId ? memory.text : '')
export const rememberText = (companyId: string | undefined, text: string) => {
  memory = { ...memory, companyId, text }
}
export const rememberListSearch = (companyId: string | undefined, search: ReservationListSearch) => {
  memory = memory.companyId === companyId ? { ...memory, search } : { companyId, text: '', search }
}
export const listSearchToReturnTo = () => memory.search
