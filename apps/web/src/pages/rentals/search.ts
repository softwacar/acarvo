import { RENTAL_PAGE_SIZES, RENTAL_SORTS, RENTAL_VIEWS, type RentalSort, type RentalView } from '@acarvo/shared'

/**
 * Rental list state kept in the URL: view, filters, sort and page. The search text is NOT put in the URL (it may be
 * a name, a plate or a phone number); it lives in memory for the open tab.
 */
export interface RentalListSearch {
  view?: RentalView
  from?: string
  to?: string
  branchId?: string
  sort?: RentalSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined)
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

export function validateRentalSearch(s: Record<string, unknown>): RentalListSearch {
  const page = Number(s.page)
  const pageSize = Number(s.pageSize)
  const out: RentalListSearch = {
    view: oneOf(RENTAL_VIEWS, s.view),
    from: day(s.from),
    to: day(s.to),
    branchId: uuid(s.branchId),
    sort: oneOf(RENTAL_SORTS, s.sort),
    dir: oneOf(['asc', 'desc'] as const, s.dir),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    pageSize: (RENTAL_PAGE_SIZES as readonly number[]).includes(pageSize) && pageSize !== 25 ? pageSize : undefined,
  }
  if (out.view === 'active') delete out.view
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as RentalListSearch
}

let memory: { companyId?: string; text: string; search: RentalListSearch } = { text: '', search: {} }
export const rememberedText = (companyId?: string) => (memory.companyId === companyId ? memory.text : '')
export const rememberText = (companyId: string | undefined, text: string) => {
  memory = { ...memory, companyId, text }
}
export const rememberListSearch = (companyId: string | undefined, search: RentalListSearch) => {
  memory = memory.companyId === companyId ? { ...memory, search } : { companyId, text: '', search }
}
export const listSearchToReturnTo = () => memory.search
