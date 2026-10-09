import { FUEL_TYPES, PAGE_SIZES, TRANSMISSIONS, VEHICLE_SORTS, VEHICLE_STATUSES, type VehicleSort } from '@acarvo/shared'

/** Vehicle list state, kept in the URL so it survives reload, back/forward and sharing. */
export interface VehicleSearch {
  q?: string
  classId?: string
  branchId?: string
  status?: (typeof VEHICLE_STATUSES)[number]
  fuelType?: (typeof FUEL_TYPES)[number]
  transmission?: (typeof TRANSMISSIONS)[number]
  sort?: VehicleSort
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined)
const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined)
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)

export function validateVehicleSearch(s: Record<string, unknown>): VehicleSearch {
  const page = Number(s.page)
  const pageSize = Number(s.pageSize)
  const out: VehicleSearch = {
    q: str(s.q),
    classId: uuid(s.classId),
    branchId: uuid(s.branchId),
    status: oneOf(VEHICLE_STATUSES, s.status),
    fuelType: oneOf(FUEL_TYPES, s.fuelType),
    transmission: oneOf(TRANSMISSIONS, s.transmission),
    sort: oneOf(VEHICLE_SORTS, s.sort),
    dir: oneOf(['asc', 'desc'] as const, s.dir),
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) && pageSize !== 25 ? pageSize : undefined,
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as VehicleSearch
}

/** Last list state, so returning from a form lands on the same page and filters. */
let lastListSearch: VehicleSearch = {}
export const rememberListSearch = (s: VehicleSearch) => {
  lastListSearch = s
}
export const listSearchToReturnTo = () => lastListSearch
