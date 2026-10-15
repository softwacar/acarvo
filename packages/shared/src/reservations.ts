import { z } from 'zod'
import { AMBIGUOUS_TIME_CHOICES } from './time'

// ---------------------------------------------------------------------------
// Reservations V1 — docs/REZERVASYON_YONETIMI_PLANI.md (spec §9, §59AC, §59BF, §59BQ, §59BU).
// No price is computed here: the pricing module does not exist yet (R12).

/** Lifecycle (§9.3). `converted` is set by the Rentals module only; V1 never sets it. */
export const RESERVATION_STATUSES = ['pending', 'confirmed', 'converted', 'cancelled', 'no_show'] as const
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number]
export const RESERVATION_ACTIVE_STATUSES = ['pending', 'confirmed'] as const

/** §59BQ. No fake live channel (OTA etc.); "website" is a manual attribution only. */
export const RESERVATION_SOURCES = ['direct_walk_in', 'phone', 'website', 'partner', 'corporate', 'returning_customer', 'other'] as const
export type ReservationSource = (typeof RESERVATION_SOURCES)[number]

export const RESERVATION_CANCEL_REASONS = ['customer_request', 'no_vehicle', 'duplicate', 'entry_error', 'other'] as const
export type ReservationCancelReason = (typeof RESERVATION_CANCEL_REASONS)[number]
export const RESERVATION_NO_SHOW_REASONS = ['did_not_arrive', 'unreachable', 'arrived_without_requirements', 'other'] as const
export type ReservationNoShowReason = (typeof RESERVATION_NO_SHOW_REASONS)[number]
/** R7: why the schedule, branches, class or vehicle of a confirmed reservation changed (fixed list: no free text in history). */
export const RESERVATION_CHANGE_REASONS = ['customer_request', 'operational', 'correction', 'other'] as const
export type ReservationChangeReason = (typeof RESERVATION_CHANGE_REASONS)[number]

export const RESERVATION_SORTS = ['pickup', 'created', 'number'] as const
export type ReservationSort = (typeof RESERVATION_SORTS)[number]
export const RESERVATION_PAGE_SIZES = [25, 50, 100] as const
export const RESERVATION_TABS = ['genel', 'kisiler', 'arac', 'durum', 'gecmis', 'fiyat'] as const
export type ReservationTab = (typeof RESERVATION_TABS)[number]

/** R5: a new pickup may lie at most this far in the past (clock differences, a walk-in being typed in). */
export const RESERVATION_PAST_TOLERANCE_MINUTES = 15
/** Sanity bound for one reservation (not a business rule from the spec). */
export const RESERVATION_MAX_DAYS = 366

// ---------------------------------------------------------------------------
// Schemas

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const optUuid = (msg: string) => z.preprocess(blank, z.uuid(msg).optional())
const wallTime = (msg: string) => z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg))
const choice = z.preprocess(blank, z.enum(AMBIGUOUS_TIME_CHOICES).optional())
const version = z.number().int().min(1)

/** Wall times are typed in the branch's own time zone (R4); the server resolves them. */
export const reservationPlanSchema = z.object({
  pickupBranchId: z.uuid('Alış şubesini seçin'),
  returnBranchId: z.uuid('İade şubesini seçin'),
  pickupLocal: wallTime('Alış tarih ve saatini girin'),
  returnLocal: wallTime('İade tarih ve saatini girin'),
  pickupChoice: choice,
  returnChoice: choice,
})

const driversSchema = z
  .array(z.object({ customerId: z.uuid('Sürücü seçin'), isPrimary: z.boolean().optional() }))
  .max(6, 'En fazla 6 sürücü')
  .refine((d) => new Set(d.map((x) => x.customerId)).size === d.length, 'Bir sürücü yalnız bir kez eklenebilir')
  .refine((d) => d.filter((x) => x.isPrimary).length <= 1, 'Yalnız bir ana sürücü seçilebilir')
  .optional()

export const reservationFieldsSchema = reservationPlanSchema.extend({
  customerId: z.uuid('Müşteri seçin'),
  corporateAccountId: optUuid('Kurumsal hesap seçin'),
  bookerCustomerId: optUuid('Rezervasyonu yapan kişiyi seçin'),
  drivers: driversSchema,
  vehicleClassId: z.uuid('Araç sınıfını seçin'),
  vehicleId: optUuid('Araç seçin'),
  source: z.preprocess(blank, z.enum(RESERVATION_SOURCES, { error: 'Rezervasyon kaynağını seçin' })),
  note: optText(1000),
})
export type ReservationInput = z.infer<typeof reservationFieldsSchema>

export const reservationCreateSchema = reservationFieldsSchema.extend({
  /** Create directly as Confirmed (needs reservations.confirm and a specific vehicle, R1). */
  confirm: z.boolean().optional(),
})
export const reservationUpdateSchema = reservationFieldsSchema.extend({
  version,
  changeReason: z.preprocess(blank, z.enum(RESERVATION_CHANGE_REASONS).optional()),
})
export const reservationConfirmSchema = z.object({ version })
export const reservationCancelSchema = z.object({
  version,
  reason: z.preprocess(blank, z.enum(RESERVATION_CANCEL_REASONS, { error: 'İptal nedenini seçin' })),
  note: optText(500),
})
export const reservationNoShowSchema = z.object({
  version,
  reason: z.preprocess(blank, z.enum(RESERVATION_NO_SHOW_REASONS, { error: 'Gelmedi nedenini seçin' })),
  note: optText(500),
})

export const reservationAvailabilitySchema = reservationPlanSchema.extend({
  vehicleClassId: z.uuid('Araç sınıfını seçin'),
  excludeReservationId: optUuid('Geçersiz rezervasyon'),
})

/** List query, sent in a POST body: names and phone numbers never appear in a URL. Dates are company calendar days. */
export const reservationSearchSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100, 'Arama en fazla 100 karakter olabilir').optional()),
  status: z.preprocess(blank, z.enum([...RESERVATION_STATUSES, 'active', 'all'] as const).default('active')),
  from: z.preprocess(blank, z.iso.date().optional()),
  to: z.preprocess(blank, z.iso.date().optional()),
  branchId: optUuid('Geçersiz filtre'),
  vehicleClassId: optUuid('Geçersiz filtre'),
  vehicleId: optUuid('Geçersiz filtre'),
  customerId: optUuid('Geçersiz filtre'),
  corporateAccountId: optUuid('Geçersiz filtre'),
  assigned: z.preprocess(blank, z.enum(['yes', 'no']).optional()),
  sort: z.preprocess(blank, z.enum(RESERVATION_SORTS).default('pickup')),
  dir: z.preprocess(blank, z.enum(['asc', 'desc']).default('asc')),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (RESERVATION_PAGE_SIZES as readonly number[]).includes(n))
    .default(25),
})
export type ReservationSearch = z.infer<typeof reservationSearchSchema>

export const reservationTimelineSchema = z.object({
  from: z.iso.date('Başlangıç günü seçin'),
  days: z.coerce.number().int().min(1).max(31).default(14),
  branchId: optUuid('Geçersiz filtre'),
  vehicleClassId: optUuid('Geçersiz filtre'),
})

// ---------------------------------------------------------------------------
// API shapes

export interface ReservationMoment {
  /** ISO 8601 UTC instant. */
  at: string
  /** Wall time in the branch's time zone (YYYY-MM-DDTHH:mm). */
  local: string
  timeZone: string
}

export interface ReservationRef {
  id: string
  name: string
  code: string
}

export interface ReservationListItem {
  id: string
  reservationNo: string
  status: ReservationStatus
  source: ReservationSource
  customer: { id: string; customerNo: string; displayName: string }
  corporateAccount: { id: string; accountNo: string; legalName: string } | null
  vehicleClass: { id: string; name: string }
  vehicle: { id: string; plate: string; make: string; model: string } | null
  pickupBranch: ReservationRef
  returnBranch: ReservationRef
  pickup: ReservationMoment
  return: ReservationMoment
  createdAt: string
}

export interface ReservationListResponse {
  items: ReservationListItem[]
  total: number
  page: number
  pageSize: number
}

export interface ReservationPerson {
  id: string
  customerNo: string
  displayName: string
  status: string
  phone: string | null
  email: string | null
  residenceCountry: string | null
  /** Current document periods (M2); null without the document permission. Never a number. */
  documents: { total: number; expired: number; expiring: number } | null
}

export type ReservationWarningCode =
  | 'class_only_cannot_confirm'
  | 'vehicle_not_active'
  | 'driver_not_authorized_for_account'
  | 'booker_not_linked_to_account'
  | 'no_driver'
  | 'pickup_passed'
  | 'vehicle_at_other_branch'
  | 'customer_archived'
  | 'vehicle_held_by_overdue_rental'

export interface ReservationWarning {
  code: ReservationWarningCode
  /** Who or what it concerns (customer number, plate), never a name or a contact. */
  subject?: string
}

export interface ReservationStatusEvent {
  id: string
  fromStatus: ReservationStatus | null
  toStatus: ReservationStatus
  reason: string | null
  note: string | null
  actorName: string | null
  at: string
}

export interface ReservationDetail extends Omit<ReservationListItem, 'customer'> {
  customer: ReservationPerson
  booker: ReservationPerson | null
  drivers: (ReservationPerson & { isPrimary: boolean })[]
  vehicle: { id: string; plate: string; make: string; model: string; status: string; homeBranch: ReservationRef } | null
  note: string | null
  confirmedAt: string | null
  confirmedByName: string | null
  cancelReason: ReservationCancelReason | null
  cancelNote: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  noShowReason: ReservationNoShowReason | null
  noShowNote: string | null
  noShowAt: string | null
  noShowByName: string | null
  statusEvents: ReservationStatusEvent[]
  warnings: ReservationWarning[]
  durationMinutes: number
  version: number
  createdByName: string | null
  updatedAt: string
  updatedByName: string | null
}

/**
 * Something holding a vehicle (one definition for every module, database function vehicle_busy): a confirmed
 * reservation, a rental, a maintenance record, a damage block or a transfer. An open end (null) = running late and not
 * finished yet (K2), or a damage block not lifted yet.
 */
export interface AllocationConflict {
  kind: 'reservation' | 'rental' | 'maintenance' | 'damage' | 'transfer'
  refNo: string
  startsAt: string
  endsAt: string | null
}

export interface AvailabilityVehicle {
  id: string
  plate: string
  make: string
  model: string
  status: string
  homeBranch: ReservationRef
  available: boolean
  atOtherBranch: boolean
  /** Confirmed reservations and rentals of this vehicle overlapping the period: numbers and times only, no customer data. */
  conflicts: AllocationConflict[]
}

export interface AvailabilityResponse {
  pickup: ReservationMoment
  return: ReservationMoment
  vehicles: AvailabilityVehicle[]
  /** R1: information only, never a capacity guarantee. */
  classSummary: { activeVehicles: number; overlappingConfirmed: number; estimateOnly: true }
  /** Domains ACARVO cannot check yet (R2). */
  notChecked: ('maintenance' | 'transfer' | 'external_sourcing' | 'vehicle_location')[]
}

export interface TimelineResponse {
  from: string
  days: number
  timeZone: string
  /** Instants of the window's first and last company midnight: bars are placed against these, never the browser's zone. */
  windowStart: string
  windowEnd: string
  vehicles: { id: string; plate: string; make: string; model: string; className: string; status: string }[]
  bars: { id: string; reservationNo: string; vehicleId: string; status: ReservationStatus; pickupAt: string; returnAt: string }[]
  /** Rentals holding a vehicle in the window; endsAt null = handed over, overdue and not back yet (K2). */
  rentalBars: { id: string; rentalNo: string; vehicleId: string; status: 'prepared' | 'delivered' | 'returned' | 'closed'; startsAt: string; endsAt: string | null }[]
  /** Maintenance, damage blocks and transfers holding a vehicle in the window (same rule as vehicle_busy). */
  holdBars: { kind: 'maintenance' | 'damage' | 'transfer'; id: string; refNo: string; vehicleId: string; status: string; startsAt: string; endsAt: string | null }[]
  unassigned: number
}

export interface ReservationActivityItem {
  id: string
  action: string
  summary: Record<string, unknown> | null
  at: string
  actorName: string | null
}

export interface ReservationBranch {
  id: string
  name: string
  code: string
  timeZone: string
  /** The user may start (and change) reservations at this branch. */
  inScope: boolean
}
