import { COUNTRY_CODES, CUSTOMER_PAGE_SIZES, CUSTOMER_RESIDENCIES, CUSTOMER_SORTS, type CustomerResidency, type CustomerSort } from '@acarvo/shared'

/**
 * Customer list state kept in the URL: filters, sort and page only. The search text is NOT put in the URL
 * (it may be a name, phone number or e-mail address); it lives in memory for the open tab.
 */
export interface CustomerListSearch {
  residency?: CustomerResidency
  residenceCountry?: string
  status?: 'archived' | 'all'
  documents?: 'attention' | 'expired'
  branchId?: string
  sort?: CustomerSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined)
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)

export function validateCustomerSearch(s: Record<string, unknown>): CustomerListSearch {
  const page = Number(s.page)
  const pageSize = Number(s.pageSize)
  const out: CustomerListSearch = {
    residency: oneOf(CUSTOMER_RESIDENCIES, s.residency),
    residenceCountry: typeof s.residenceCountry === 'string' && COUNTRY_CODES.includes(s.residenceCountry) ? s.residenceCountry : undefined,
    status: oneOf(['archived', 'all'] as const, s.status),
    documents: oneOf(['attention', 'expired'] as const, s.documents),
    branchId: uuid(s.branchId),
    sort: oneOf(CUSTOMER_SORTS, s.sort),
    dir: oneOf(['asc', 'desc'] as const, s.dir),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    pageSize: (CUSTOMER_PAGE_SIZES as readonly number[]).includes(pageSize) && pageSize !== 25 ? pageSize : undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as CustomerListSearch
}

/** Search text and list state of the open tab, per company; cleared on reload and never stored. */
let memory: { companyId?: string; text: string; search: CustomerListSearch } = { text: '', search: {} }
export const rememberedText = (companyId?: string) => (memory.companyId === companyId ? memory.text : '')
export const rememberText = (companyId: string | undefined, text: string) => {
  memory = { ...memory, companyId, text }
}
export const rememberListSearch = (companyId: string | undefined, search: CustomerListSearch) => {
  memory = memory.companyId === companyId ? { ...memory, search } : { companyId, text: '', search }
}
export const listSearchToReturnTo = () => memory.search
