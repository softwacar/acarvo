import {
  DAMAGE_LIST_VIEWS,
  DAMAGE_SORTS,
  type DamageListView,
  MAINTENANCE_SORTS,
  MAINTENANCE_VIEWS,
  type MaintenanceView,
  OPERATIONS_PAGE_SIZES,
  TRANSFER_SORTS,
  TRANSFER_VIEWS,
  type TransferView,
} from '@acarvo/shared'

// List state kept in the URL (view, branch, sort, page). Search text stays in memory: it may be a plate.

export interface OpsListSearch<V extends string, S extends string> {
  view?: V
  branchId?: string
  sort?: S
  dir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
const oneOf = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined)
const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined)
const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

function listValidator<V extends string, S extends string>(views: readonly V[], sorts: readonly S[], defaultView: V) {
  return (s: Record<string, unknown>): OpsListSearch<V, S> => {
    const page = Number(s.page)
    const pageSize = Number(s.pageSize)
    const view = oneOf(views, s.view)
    return clean({
      view: view === defaultView ? undefined : view,
      branchId: uuid(s.branchId),
      sort: oneOf(sorts, s.sort),
      dir: oneOf(['asc', 'desc'] as const, s.dir),
      page: Number.isInteger(page) && page > 1 ? page : undefined,
      pageSize: (OPERATIONS_PAGE_SIZES as readonly number[]).includes(pageSize) && pageSize !== 25 ? pageSize : undefined,
    })
  }
}

export type MaintenanceListSearch = OpsListSearch<MaintenanceView, (typeof MAINTENANCE_SORTS)[number]>
export type DamageListSearch = OpsListSearch<DamageListView, (typeof DAMAGE_SORTS)[number]>
export type TransferListSearch = OpsListSearch<TransferView, (typeof TRANSFER_SORTS)[number]>
export const validateMaintenanceSearch = listValidator(MAINTENANCE_VIEWS, MAINTENANCE_SORTS, 'open')
export const validateDamageSearch = listValidator(DAMAGE_LIST_VIEWS, DAMAGE_SORTS, 'open')
export const validateTransferSearch = listValidator(TRANSFER_VIEWS, TRANSFER_SORTS, 'open')

/** Create forms may be opened prefilled from a vehicle, a damage file or a rental finding. Ids only. */
export interface CreateSearch {
  arac?: string
  hasar?: string
  kiralama?: string
  isaret?: string
}
export const validateCreateSearch = (s: Record<string, unknown>): CreateSearch => clean({ arac: uuid(s.arac), hasar: uuid(s.hasar), kiralama: uuid(s.kiralama), isaret: uuid(s.isaret) })
