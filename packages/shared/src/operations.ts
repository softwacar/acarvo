import { z } from 'zod'
import type { AllocationConflict, ReservationMoment, ReservationRef } from './reservations'
import { FUEL_LEVELS, type FuelLevel } from './rentals'
import { AMBIGUOUS_TIME_CHOICES } from './time'

// ---------------------------------------------------------------------------
// Maintenance, damage and vehicle transfers V1 — docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md (spec §13.3, §59N, §59R).
// Their holds join the one shared vehicle allocation truth (vehicle_busy). No cost, charge, liability, insurance claim,
// deposit deduction or invoice is created or stored here.

export const MAINTENANCE_TYPES = ['periodic', 'repair', 'tire', 'inspection', 'other'] as const
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number]
/** pending_approval does not hold the vehicle; planned, in_service and awaiting_check do. */
export const MAINTENANCE_STATUSES = ['pending_approval', 'planned', 'in_service', 'awaiting_check', 'completed', 'cancelled'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]
export const MAINTENANCE_VIEWS = ['open', 'pending_approval', 'planned', 'in_service', 'awaiting_check', 'overdue', 'completed', 'cancelled', 'all'] as const
export type MaintenanceView = (typeof MAINTENANCE_VIEWS)[number]

export const DAMAGE_FILE_VIEWS = ['front', 'rear', 'left', 'right', 'top', 'interior'] as const
export type DamageFileView = (typeof DAMAGE_FILE_VIEWS)[number]
export const DAMAGE_TYPES = ['scratch', 'dent', 'crack', 'glass', 'tire', 'mechanical', 'interior', 'missing_part', 'other'] as const
export type DamageType = (typeof DAMAGE_TYPES)[number]
export const DAMAGE_SEVERITIES = ['minor', 'moderate', 'severe'] as const
export type DamageSeverity = (typeof DAMAGE_SEVERITIES)[number]
/** not_usable starts a block: the vehicle cannot be confirmed for a reservation or handed over until it is lifted. */
export const DAMAGE_USABILITY = ['usable', 'restricted', 'not_usable'] as const
export type DamageUsability = (typeof DAMAGE_USABILITY)[number]
export const DAMAGE_REVIEW_STATUSES = ['reported', 'under_review', 'assessed', 'closed'] as const
export type DamageReviewStatus = (typeof DAMAGE_REVIEW_STATUSES)[number]
export const DAMAGE_REPAIR_STATUSES = ['not_needed', 'pending', 'in_repair', 'repaired'] as const
export type DamageRepairStatus = (typeof DAMAGE_REPAIR_STATUSES)[number]
export const DAMAGE_LIST_VIEWS = ['open', 'blocked', 'reported', 'under_review', 'assessed', 'closed', 'all'] as const
export type DamageListView = (typeof DAMAGE_LIST_VIEWS)[number]

export const TRANSFER_STATUSES = ['requested', 'approved', 'in_transit', 'completed', 'cancelled'] as const
export type TransferStatus = (typeof TRANSFER_STATUSES)[number]
/** operational: a usable vehicle moved between branches. repair: a damaged vehicle carried to a repair place (never driven). */
export const TRANSFER_PURPOSES = ['operational', 'repair'] as const
export type TransferPurpose = (typeof TRANSFER_PURPOSES)[number]
export const TRANSPORT_METHODS = ['tow_truck', 'car_carrier'] as const
export type TransportMethod = (typeof TRANSPORT_METHODS)[number]
export const TRANSFER_VIEWS = ['open', 'requested', 'approved', 'in_transit', 'late', 'incoming', 'completed', 'cancelled', 'all'] as const
export type TransferView = (typeof TRANSFER_VIEWS)[number]

export const OPERATIONS_PAGE_SIZES = [25, 50, 100] as const
export const OPERATION_PHOTO_LIMIT = 10
/** A real start, finish, departure or arrival may be recorded late, at most this far back, never in the future. */
export const OPERATION_BACKDATE_HOURS = 72
/** Periodic service is "due soon" within these limits (a reminder, never a block). */
export const SERVICE_DUE_SOON_KM = 1000
export const SERVICE_DUE_SOON_DAYS = 30

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const text = (min: number, max: number, msg: string) => z.string({ error: msg }).trim().min(min, msg).max(max, `En fazla ${max} karakter`)
const wallTime = (msg: string) => z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg))
const optWallTime = (msg: string) => z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg).optional())
const choice = z.preprocess(blank, z.enum(AMBIGUOUS_TIME_CHOICES).optional())
const version = z.number().int().min(1)
const requestId = z.uuid('İstek kimliği eksik')
const km = (msg: string) => z.preprocess(blank, z.coerce.number({ error: msg }).int('Tam sayı girin').min(0, 'Kilometre negatif olamaz').max(3_000_000, 'Kilometre çok büyük'))
const optKm = z.preprocess(blank, z.coerce.number().int('Tam sayı girin').min(0, 'Kilometre negatif olamaz').max(3_000_000, 'Kilometre çok büyük').optional())
const reason = (msg: string) => text(5, 300, msg)
const listQuery = {
  q: optText(80),
  branchId: z.preprocess(blank, z.uuid().optional()),
  vehicleId: z.preprocess(blank, z.uuid().optional()),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((n) => (OPERATIONS_PAGE_SIZES as readonly number[]).includes(n))
    .default(25),
}

// ---------------------------------------------------------------------------
// Maintenance

export const maintenanceCreateSchema = z.object({
  requestId,
  vehicleId: z.uuid('Araç seçin'),
  branchId: z.uuid('Sorumlu şubeyi seçin'),
  type: z.preprocess(blank, z.enum(MAINTENANCE_TYPES, { error: 'Bakım türünü seçin' })),
  reason: text(3, 500, 'Bakımın nedenini yazın'),
  plannedStartLocal: wallTime('Planlanan başlangıcı girin'),
  plannedStartChoice: choice,
  plannedEndLocal: wallTime('Planlanan bitişi girin'),
  plannedEndChoice: choice,
  providerName: optText(120),
  notes: optText(2000),
  damageFileId: z.preprocess(blank, z.uuid().optional()),
  /** The plan conflicts with existing commitments: keep it as "pending approval" (holds nothing) instead of refusing. */
  keepPending: z.boolean().default(false),
})
export type MaintenanceCreateInput = z.infer<typeof maintenanceCreateSchema>

export const maintenanceUpdateSchema = z.object({
  version,
  requestId,
  type: z.preprocess(blank, z.enum(MAINTENANCE_TYPES).optional()),
  reason: z.preprocess(blank, text(3, 500, 'Bakımın nedenini yazın').optional()),
  plannedStartLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  plannedStartChoice: choice,
  plannedEndLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  plannedEndChoice: choice,
  providerName: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(120, 'En fazla 120 karakter').optional()),
  notes: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(2000, 'En fazla 2000 karakter').optional()),
  workDone: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(2000, 'En fazla 2000 karakter').optional()),
  parts: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(2000, 'En fazla 2000 karakter').optional()),
})

export const maintenanceStartSchema = z.object({
  version,
  requestId,
  /** Empty = now. Otherwise the responsible branch's wall time, at most OPERATION_BACKDATE_HOURS back. */
  startedLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  startedChoice: choice,
  /** Required when the planned end has already passed: a new expected end (the hold never silently becomes open). */
  expectedEndLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  expectedEndChoice: choice,
  atProvider: z.boolean().default(false),
  providerName: optText(120),
  km: optKm,
  largeJumpReason: optText(300),
})

export const maintenanceWorkDoneSchema = z.object({
  version,
  requestId,
  doneLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  doneChoice: choice,
  workDone: text(3, 2000, 'Yapılan işleri yazın'),
  parts: optText(2000),
})

export const maintenanceCompleteSchema = z.object({
  version,
  requestId,
  completedLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  completedChoice: choice,
  km: km('Tamamlanma kilometresini girin'),
  largeJumpReason: optText(300),
  /** Required when the vehicle went to a service provider: the branch it comes back to. */
  returnBranchId: z.preprocess(blank, z.uuid().optional()),
})

export const maintenanceReasonSchema = z.object({ version, requestId, reason: reason('Gerekçe yazın (en az 5 karakter)') })
export const maintenanceApproveSchema = z.object({ version, requestId })

export const MAINTENANCE_SORTS = ['planned', 'created', 'number'] as const
export const maintenanceSearchSchema = z.object({
  ...listQuery,
  view: z.enum(MAINTENANCE_VIEWS).default('open'),
  type: z.preprocess(blank, z.enum(MAINTENANCE_TYPES).optional()),
  sort: z.enum(MAINTENANCE_SORTS).default('planned'),
})
export type MaintenanceSearch = z.infer<typeof maintenanceSearchSchema>

export const maintenanceScheduleSchema = z
  .object({
    version: z.number().int().min(0),
    intervalKm: z.preprocess(blank, z.coerce.number().int('Tam sayı girin').min(500, 'En az 500 km').max(200_000, 'En fazla 200.000 km').optional()),
    intervalMonths: z.preprocess(blank, z.coerce.number().int('Tam sayı girin').min(1, 'En az 1 ay').max(60, 'En fazla 60 ay').optional()),
  })
  .refine((v) => v.intervalKm != null || v.intervalMonths != null, { message: 'Kilometre veya ay aralığından en az birini girin', path: ['intervalKm'] })

export interface OperationPhoto {
  id: string
  url: string
  thumbUrl: string
  createdAt: string
  createdByName: string | null
}

export interface OperationEvent {
  id: string
  kind: string
  fromStatus: string | null
  toStatus: string | null
  reason: string | null
  data: Record<string, unknown> | null
  at: string
  actorName: string | null
}

export interface OperationVehicle {
  id: string
  plate: string
  make: string
  model: string
  className: string
  status: string
}

export interface MaintenanceListItem {
  id: string
  maintenanceNo: string
  status: MaintenanceStatus
  type: MaintenanceType
  reason: string
  vehicle: Pick<OperationVehicle, 'id' | 'plate' | 'make' | 'model'>
  branch: ReservationRef
  plannedStart: ReservationMoment
  plannedEnd: ReservationMoment
  actualStartAt: string | null
  completedAt: string | null
  providerName: string | null
  /** Derived (never a lifecycle state): the planned end has passed and the work is not completed. */
  overdue: boolean
}

export interface MaintenanceListResponse {
  items: MaintenanceListItem[]
  total: number
  page: number
  pageSize: number
  counts: Record<'pending_approval' | 'planned' | 'in_service' | 'awaiting_check' | 'overdue', number>
}

export interface MaintenanceDetail extends MaintenanceListItem {
  timeZone: string
  workDoneAt: string | null
  startKm: number | null
  endKm: number | null
  atProvider: boolean
  workDone: string | null
  parts: string | null
  notes: string | null
  damageFile: { id: string; damageNo: string; reviewStatus: DamageReviewStatus } | null
  approvedAt: string | null
  approvedByName: string | null
  startedByName: string | null
  completedByName: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  createdByName: string | null
  version: number
  /** What holds the vehicle in the planned window now (shared allocation truth), this record excluded. */
  conflicts: AllocationConflict[]
  vehicle: OperationVehicle & { homeBranchId: string }
  photos: OperationPhoto[]
  events: OperationEvent[]
  uploadPolicy: { enabled: boolean; reason: string | null }
}

export type ServiceDueState = 'no_schedule' | 'no_history' | 'ok' | 'due_soon' | 'overdue'
export interface ServiceDue {
  state: ServiceDueState
  schedule: { intervalKm: number | null; intervalMonths: number | null; version: number } | null
  last: { maintenanceNo: string; completedAt: string; km: number } | null
  currentKm: number | null
  nextDueKm: number | null
  nextDueDate: string | null
  kmLeft: number | null
  daysLeft: number | null
}

// ---------------------------------------------------------------------------
// Damage

export const damageCreateSchema = z
  .object({
    requestId,
    vehicleId: z.uuid('Araç seçin'),
    branchId: z.uuid('Tespit edilen şubeyi seçin'),
    detectedLocal: optWallTime('Geçerli bir tarih ve saat girin'),
    detectedChoice: choice,
    locationText: optText(200),
    view: z.preprocess(blank, z.enum(DAMAGE_FILE_VIEWS, { error: 'Aracın hangi tarafı olduğunu seçin' })),
    area: optText(120),
    description: text(5, 2000, 'Hasarı açıklayın (en az 5 karakter)'),
    damageType: z.preprocess(blank, z.enum(DAMAGE_TYPES, { error: 'Hasar türünü seçin' })),
    severity: z.preprocess(blank, z.enum(DAMAGE_SEVERITIES, { error: 'Ağırlığı seçin' })),
    usability: z.preprocess(blank, z.enum(DAMAGE_USABILITY, { error: 'Aracın kullanılabilirliğini seçin' })),
    /** A finding from a rental's final handover or return inspection; the mark itself is never changed. */
    rentalId: z.preprocess(blank, z.uuid().optional()),
    sourceMarkId: z.preprocess(blank, z.uuid().optional()),
    blockReason: optText(300),
  })
  .refine((v) => v.usability !== 'not_usable' || (v.blockReason?.length ?? 0) >= 5, { message: 'Aracın neden kullanılamayacağını yazın (en az 5 karakter)', path: ['blockReason'] })
  .refine((v) => !v.sourceMarkId || v.rentalId, { message: 'İşaret bir kiralamaya ait olmalı', path: ['sourceMarkId'] })
export type DamageCreateInput = z.infer<typeof damageCreateSchema>

export const damageUpdateSchema = z.object({
  version,
  requestId,
  description: z.preprocess(blank, text(5, 2000, 'Hasarı açıklayın (en az 5 karakter)').optional()),
  area: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(120, 'En fazla 120 karakter').optional()),
  locationText: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(200, 'En fazla 200 karakter').optional()),
  damageType: z.preprocess(blank, z.enum(DAMAGE_TYPES).optional()),
  severity: z.preprocess(blank, z.enum(DAMAGE_SEVERITIES).optional()),
  usability: z.preprocess(blank, z.enum(DAMAGE_USABILITY).optional()),
})

export const damageReviewSchema = z
  .object({
    version,
    requestId,
    reviewStatus: z.enum(['under_review', 'assessed', 'closed'], { error: 'İnceleme durumunu seçin' }),
    note: optText(2000),
  })
  .refine((v) => v.reviewStatus !== 'closed' || (v.note?.length ?? 0) >= 5, { message: 'Kapatma gerekçesini yazın (en az 5 karakter)', path: ['note'] })
export const damageRepairSchema = z.object({ version, requestId, repairStatus: z.enum(DAMAGE_REPAIR_STATUSES, { error: 'Onarım durumunu seçin' }) })
export const damageBlockSchema = z.object({ version, requestId, reason: reason('Engel gerekçesini yazın (en az 5 karakter)') })
export const damageUnblockSchema = z.object({
  version,
  requestId,
  reason: reason('Engeli kaldırma gerekçesini yazın (en az 5 karakter)'),
  usability: z.enum(['usable', 'restricted'], { error: 'Aracın yeni kullanılabilirliğini seçin' }),
})

export const DAMAGE_SORTS = ['detected', 'created', 'number'] as const
export const damageSearchSchema = z.object({
  ...listQuery,
  view: z.enum(DAMAGE_LIST_VIEWS).default('open'),
  severity: z.preprocess(blank, z.enum(DAMAGE_SEVERITIES).optional()),
  rentalId: z.preprocess(blank, z.uuid().optional()),
  sort: z.enum(DAMAGE_SORTS).default('detected'),
})
export type DamageSearch = z.infer<typeof damageSearchSchema>

export interface DamageBlockItem {
  id: string
  startedAt: string
  startedByName: string | null
  startReason: string
  endedAt: string | null
  endedByName: string | null
  endReason: string | null
}

export interface DamageListItem {
  id: string
  damageNo: string
  vehicle: Pick<OperationVehicle, 'id' | 'plate' | 'make' | 'model'>
  branch: ReservationRef
  detected: ReservationMoment
  view: DamageFileView
  area: string | null
  damageType: DamageType
  severity: DamageSeverity
  usability: DamageUsability
  reviewStatus: DamageReviewStatus
  repairStatus: DamageRepairStatus
  blocked: boolean
  rental: { id: string; rentalNo: string } | null
}

export interface DamageListResponse {
  items: DamageListItem[]
  total: number
  page: number
  pageSize: number
  counts: Record<'open' | 'blocked' | 'reported' | 'under_review', number>
}

export interface DamageDetail extends DamageListItem {
  timeZone: string
  locationText: string | null
  description: string
  assessmentNote: string | null
  source: { inspectionId: string; inspectionKind: 'handover' | 'return'; markId: string | null; markCategory: string | null } | null
  closedAt: string | null
  closeReason: string | null
  createdAt: string
  createdByName: string | null
  version: number
  vehicle: OperationVehicle & { homeBranchId: string }
  blocks: DamageBlockItem[]
  maintenance: { id: string; maintenanceNo: string; status: MaintenanceStatus }[]
  /** Confirmed reservations of the vehicle while blocked: never cancelled automatically, shown as at risk. */
  atRisk: AllocationConflict[]
  photos: OperationPhoto[]
  events: OperationEvent[]
  uploadPolicy: { enabled: boolean; reason: string | null }
}

/** A finding of a final inspection that may be opened as a damage file (one file per mark). */
export interface DamageCandidate {
  markId: string
  inspectionId: string
  inspectionKind: 'handover' | 'return'
  view: string
  category: string
  note: string | null
  newFinding: boolean
  damageFile: { id: string; damageNo: string } | null
}

// ---------------------------------------------------------------------------
// Transfers

export const transferCreateSchema = z
  .object({
    requestId,
    vehicleId: z.uuid('Araç seçin'),
    fromBranchId: z.uuid('Çıkış şubesini seçin'),
    toBranchId: z.uuid('Varış şubesini seçin'),
    reason: text(3, 500, 'Transferin nedenini yazın'),
    plannedDepartureLocal: wallTime('Planlanan çıkışı girin'),
    plannedDepartureChoice: choice,
    plannedArrivalLocal: wallTime('Planlanan varışı girin'),
    plannedArrivalChoice: choice,
    driverNote: optText(300),
    purpose: z.enum(TRANSFER_PURPOSES).default('operational'),
    /** repair only: the open damage file of the vehicle and how it is carried. */
    damageFileId: z.preprocess(blank, z.uuid().optional()),
    transportMethod: z.preprocess(blank, z.enum(TRANSPORT_METHODS, { error: 'Taşıma yöntemini seçin' }).optional()),
  })
  .refine((v) => v.fromBranchId !== v.toBranchId, { message: 'Varış şubesi çıkış şubesinden farklı olmalı', path: ['toBranchId'] })
  .refine((v) => v.purpose !== 'repair' || v.damageFileId, { message: 'Taşımanın bağlı olduğu hasar dosyasını seçin', path: ['damageFileId'] })
  .refine((v) => v.purpose !== 'repair' || v.transportMethod, { message: 'Taşıma yöntemini seçin (çekici veya taşıyıcı)', path: ['transportMethod'] })
export type TransferCreateInput = z.infer<typeof transferCreateSchema>

export const transferUpdateSchema = z.object({
  version,
  requestId,
  toBranchId: z.preprocess(blank, z.uuid().optional()),
  reason: z.preprocess(blank, text(3, 500, 'Transferin nedenini yazın').optional()),
  plannedDepartureLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  plannedDepartureChoice: choice,
  plannedArrivalLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  plannedArrivalChoice: choice,
  driverNote: z.preprocess((v) => (v === null ? '' : v), z.string().trim().max(300, 'En fazla 300 karakter').optional()),
})

const movement = {
  version,
  requestId,
  km: km('Kilometreyi girin'),
  fuel: z.preprocess(blank, z.enum(FUEL_LEVELS, { error: 'Yakıt seviyesini seçin' })),
  largeJumpReason: optText(300),
  note: optText(1000),
}
export const transferDepartSchema = z.object({
  ...movement,
  departedLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  departedChoice: choice,
  /** repair transport: staff statement that the vehicle left on the stated tow truck or carrier, not under its own power. */
  transportAck: z.boolean().default(false),
})
export const transferReceiveSchema = z.object({ ...movement, arrivedLocal: optWallTime('Geçerli bir tarih ve saat girin'), arrivedChoice: choice })
export const transferApproveSchema = z.object({ version, requestId })
export const transferCancelSchema = z.object({ version, requestId, reason: reason('İptal gerekçesini yazın (en az 5 karakter)') })

export const TRANSFER_SORTS = ['departure', 'arrival', 'created', 'number'] as const
export const transferSearchSchema = z.object({
  ...listQuery,
  view: z.enum(TRANSFER_VIEWS).default('open'),
  sort: z.enum(TRANSFER_SORTS).default('departure'),
})
export type TransferSearch = z.infer<typeof transferSearchSchema>

export interface TransferListItem {
  id: string
  transferNo: string
  status: TransferStatus
  vehicle: Pick<OperationVehicle, 'id' | 'plate' | 'make' | 'model'>
  fromBranch: ReservationRef
  toBranch: ReservationRef
  plannedDeparture: ReservationMoment
  plannedArrival: ReservationMoment
  departedAt: string | null
  arrivedAt: string | null
  /** Derived: in transit and the planned arrival has passed. Not "arrived". */
  late: boolean
  purpose: TransferPurpose
}

export interface TransferListResponse {
  items: TransferListItem[]
  total: number
  page: number
  pageSize: number
  counts: Record<'requested' | 'approved' | 'in_transit' | 'late' | 'incoming', number>
}

export interface TransferDetail extends TransferListItem {
  reason: string
  driverNote: string | null
  transportMethod: TransportMethod | null
  transportAckAt: string | null
  damageFile: { id: string; damageNo: string; blocked: boolean } | null
  departureKm: number | null
  arrivalKm: number | null
  departureFuel: FuelLevel | null
  arrivalFuel: FuelLevel | null
  departureNote: string | null
  arrivalNote: string | null
  requestedByName: string | null
  approvedAt: string | null
  approvedByName: string | null
  departedByName: string | null
  receivedByName: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  version: number
  vehicle: OperationVehicle & { homeBranchId: string }
  /** What holds the vehicle in the planned window now (this transfer excluded). */
  conflicts: AllocationConflict[]
  /** The next confirmed reservation or prepared rental starting at another branch than the destination (plan §1.3). */
  nextCommitmentConflict: string | null
  currentLocation: { type: string; branchId: string | null; branchCode: string | null; description: string | null; at: string } | null
  /** Which steps this user may take here (permission and branch scope; the server checks again). */
  can: { approve: boolean; depart: boolean; receive: boolean; cancel: boolean; edit: boolean }
  events: OperationEvent[]
}

// ---------------------------------------------------------------------------
// Vehicle 360°: holds and operations of one vehicle

export interface VehicleOperations {
  /** Everything holding the vehicle from now on (shared allocation truth). */
  holdsNow: AllocationConflict[]
  /** Holds active at this moment, with reasons. */
  blockedNow: AllocationConflict[]
  maintenance: MaintenanceListItem[]
  damages: DamageListItem[]
  transfers: TransferListItem[]
  serviceDue: ServiceDue | null
  /** Confirmed reservations at risk because a damage block is open. */
  atRisk: AllocationConflict[]
  /** Which parts this user may see (each needs its own read permission). */
  access: { maintenance: boolean; damage: boolean; transfers: boolean }
}

/** "Bakım B-000012", "Hasar engeli H-000003" ... for messages and lists (no personal data). */
export const ALLOCATION_KIND_LABELS: Record<AllocationConflict['kind'], string> = {
  reservation: 'Rezervasyon',
  rental: 'Kiralama',
  maintenance: 'Bakım',
  damage: 'Hasar engeli',
  transfer: 'Transfer',
}
const OPEN_END: Record<AllocationConflict['kind'], string> = {
  reservation: '',
  rental: ' (iade gecikti)',
  maintenance: ' (bakım sürüyor, bitişi gecikti)',
  damage: ' (engel sürüyor)',
  transfer: ' (varış gecikti)',
}
export const allocationConflictText = (c: AllocationConflict) => `${ALLOCATION_KIND_LABELS[c.kind]} ${c.refNo}${c.endsAt ? '' : OPEN_END[c.kind]}`
