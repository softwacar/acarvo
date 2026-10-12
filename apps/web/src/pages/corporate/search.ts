import { CORPORATE_PAGE_SIZES, CORPORATE_SORTS, COUNTRY_CODES, type CorporateSort } from '@acarvo/shared'

/**
 * Corporate list state kept in the URL: filters, sort and page only. The search text is NOT put in the URL (it may be
 * a tax id, an e-mail address or a phone number); it lives in memory for the open tab.
 */
export interface CorporateListSearch {
  country?: string
  status?: 'archived' | 'all'
  people?: 'with_drivers' | 'without_people'
  sort?: CorporateSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined)

export function validateCorporateSearch(s: Record<string, unknown>): CorporateListSearch {
  const page = Number(s.page)
  const pageSize = Number(s.pageSize)
  const out: CorporateListSearch = {
    country: typeof s.country === 'string' && COUNTRY_CODES.includes(s.country) ? s.country : undefined,
    status: oneOf(['archived', 'all'] as const, s.status),
    people: oneOf(['with_drivers', 'without_people'] as const, s.people),
    sort: oneOf(CORPORATE_SORTS, s.sort),
    dir: oneOf(['asc', 'desc'] as const, s.dir),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    pageSize: (CORPORATE_PAGE_SIZES as readonly number[]).includes(pageSize) && pageSize !== 25 ? pageSize : undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as CorporateListSearch
}

/** Search text and list state of the open tab, per company; cleared on reload and never stored. */
let memory: { companyId?: string; text: string; search: CorporateListSearch } = { text: '', search: {} }
export const rememberedText = (companyId?: string) => (memory.companyId === companyId ? memory.text : '')
export const rememberText = (companyId: string | undefined, text: string) => {
  memory = { ...memory, companyId, text }
}
export const rememberListSearch = (companyId: string | undefined, search: CorporateListSearch) => {
  memory = memory.companyId === companyId ? { ...memory, search } : { companyId, text: '', search }
}
export const listSearchToReturnTo = () => memory.search
