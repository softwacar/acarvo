import { z } from 'zod'
import type { ReservationMoment, ReservationPerson, ReservationRef } from './reservations'
import { AMBIGUOUS_TIME_CHOICES } from './time'

// ---------------------------------------------------------------------------
// Rentals, handover and return V1 — docs/KIRALAMA_TESLIM_IADE_PLANI.md (spec §10, §59B, §59L, §59BV, §59BX, §59CY, §83.4).
// No price, payment, deposit, invoice or contract is computed or stored: those modules do not exist yet (K1).

/** Operational lifecycle (§10.3). Loss Closed / Exception Closed (§71) are not part of V1 (K7). */
export const RENTAL_STATUSES = ['prepared', 'delivered', 'returned', 'closed', 'cancelled'] as const
export type RentalStatus = (typeof RENTAL_STATUSES)[number]

/** The five fixed fuel levels of spec §59B; no free percentage or litres. */
export const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarters', 'full'] as const
export type FuelLevel = (typeof FUEL_LEVELS)[number]
export const CLEANLINESS_LEVELS = ['clean', 'acceptable', 'dirty'] as const
export type Cleanliness = (typeof CLEANLINESS_LEVELS)[number]
export const CONDITION_LEVELS = ['good', 'minor_issues', 'needs_attention'] as const
export type VehicleCondition = (typeof CONDITION_LEVELS)[number]

/** Key custody and vehicle-bound equipment (§10.3). Every item must be answered; nothing is "ok" by default. */
export const CHECKLIST_ITEMS = ['keys', 'registration', 'spare_wheel', 'warning_triangle', 'first_aid_kit', 'lights', 'tyres', 'windscreen'] as const
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number]
export const CHECKLIST_ANSWERS = ['ok', 'issue', 'not_applicable'] as const
export type ChecklistAnswer = (typeof CHECKLIST_ANSWERS)[number]

export const PHOTO_ANGLES = ['front', 'rear', 'left', 'right', 'interior', 'other'] as const
export type PhotoAngle = (typeof PHOTO_ANGLES)[number]
/** §59B: 4 minimum, 5 maximum, per handover and per return. */
export const INSPECTION_MIN_PHOTOS = 4
export const INSPECTION_MAX_PHOTOS = 5

export const DAMAGE_VIEWS = ['front', 'rear', 'left', 'right', 'top'] as const
export type DamageView = (typeof DAMAGE_VIEWS)[number]
export const DAMAGE_CATEGORIES = ['scratch', 'dent', 'crack', 'stain', 'missing_part', 'other'] as const
export type DamageCategory = (typeof DAMAGE_CATEGORIES)[number]
export const MAX_DAMAGE_MARKS = 40

export const RENTAL_CANCEL_REASONS = ['customer_request', 'vehicle_problem', 'documents_missing', 'entry_error', 'other'] as const
export type RentalCancelReason = (typeof RENTAL_CANCEL_REASONS)[number]
/** §59BV: where an extension request came from (recorded by staff). */
export const EXTENSION_CHANNELS = ['phone', 'branch', 'email', 'corporate', 'other'] as const
export type ExtensionChannel = (typeof EXTENSION_CHANNELS)[number]

export const RENTAL_SORTS = ['pickup', 'return', 'created', 'number'] as const
export type RentalSort = (typeof RENTAL_SORTS)[number]
export const RENTAL_PAGE_SIZES = [25, 50, 100] as const
export const RENTAL_VIEWS = ['active', 'prepared', 'delivered', 'overdue', 'returned', 'closed', 'cancelled', 'all'] as const
export type RentalView = (typeof RENTAL_VIEWS)[number]
export const RENTAL_TABS = ['genel', 'kisiler', 'arac', 'fiyat', 'sozlesme', 'teslim', 'iade', 'hasar', 'gecmis'] as const
export type RentalTab = (typeof RENTAL_TABS)[number]

/** K8: a handover or return may be recorded late, at most this far back, never in the future. */
export const HANDOVER_BACKDATE_HOURS = 24
export const RETURN_BACKDATE_HOURS = 72
/** Sanity bound for one rental (not a business rule from the spec). */
export const RENTAL_MAX_DAYS = 366
export const RENTAL_MAX_ADDITIONAL_DRIVERS = 5
/**
 * K1: contract and pricing modules do not exist. A handover is possible only when the company's owner switched on the
 * external contract/pricing mode, and then only with two separate staff statements and an external reference.
 * The reference is a contract or transaction number: letters, digits, space . / _ - (no names or ID numbers).
 */
export const EXTERNAL_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/

export const rentalSettingsSchema = z.object({
  version: z.number().int().min(0),
  externalTermsMode: z.boolean(),
})
export interface RentalSettings {
  /** Off by default; no stored row = off. */
  externalTermsMode: boolean
  version: number
  updatedAt: string | null
  updatedByName: string | null
}

// ---------------------------------------------------------------------------
// Schemas

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const optUuid = (msg: string) => z.preprocess(blank, z.uuid(msg).optional())
const wallTime = (msg: string) => z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ error: msg }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg))
const optWallTime = (msg: string) => z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, msg).optional())
const choice = z.preprocess(blank, z.enum(AMBIGUOUS_TIME_CHOICES).optional())
const version = z.number().int().min(1)
/** One id per user action; a resent request (network retry, double click) returns the first result. */
const requestId = z.uuid('İstek kimliği eksik')

export const rentalDriversSchema = z
  .array(z.object({ customerId: z.uuid('Sürücü seçin'), isPrimary: z.boolean().optional() }))
  .min(1, 'Ana sürücüyü seçin')
  .max(RENTAL_MAX_ADDITIONAL_DRIVERS + 1, `En fazla ${RENTAL_MAX_ADDITIONAL_DRIVERS} ek sürücü eklenebilir`)
  .refine((d) => new Set(d.map((x) => x.customerId)).size === d.length, 'Bir sürücü yalnız bir kez eklenebilir')
  .refine((d) => d.filter((x) => x.isPrimary).length === 1, 'Tam bir ana sürücü seçin')

export const rentalFieldsSchema = z.object({
  customerId: z.uuid('Müşteri seçin'),
  corporateAccountId: optUuid('Kurumsal hesap seçin'),
  drivers: rentalDriversSchema,
  vehicleClassId: z.uuid('Araç sınıfını seçin'),
  vehicleId: z.uuid('Araç seçin'),
  pickupBranchId: z.uuid('Başlangıç şubesini seçin'),
  returnBranchId: z.uuid('İade şubesini seçin'),
  pickupLocal: wallTime('Alış tarih ve saatini girin'),
  returnLocal: wallTime('İade tarih ve saatini girin'),
  pickupChoice: choice,
  returnChoice: choice,
  note: optText(1000),
})
export type RentalInput = z.infer<typeof rentalFieldsSchema>

export const rentalCreateSchema = rentalFieldsSchema.extend({ requestId })
export const rentalUpdateSchema = rentalFieldsSchema.extend({ version })
/** Converts a confirmed reservation; `version` is the reservation's version as the user saw it. */
export const rentalFromReservationSchema = z.object({ version, requestId })
export const rentalCancelSchema = z.object({
  version,
  requestId,
  reason: z.preprocess(blank, z.enum(RENTAL_CANCEL_REASONS, { error: 'İptal nedenini seçin' })),
  note: optText(500),
})

export const rentalDocumentCheckSchema = z.object({
  version,
  drivers: z
    .array(
      z.object({
        customerId: z.uuid('Sürücü seçin'),
        /** K4: staff's final local/foreign classification for this rental; the system only suggests. */
        residencyClass: z.preprocess(blank, z.enum(['local', 'foreign'], { error: 'Yerli veya yabancı olduğunu seçin' })),
        decision: z.preprocess(blank, z.enum(['eligible', 'not_eligible'], { error: 'Kararı seçin' })),
        note: optText(500),
      }),
    )
    .min(1, 'En az bir sürücü için karar verin')
    .max(RENTAL_MAX_ADDITIONAL_DRIVERS + 1),
})

export const damageMarkSchema = z.object({
  id: optUuid('Geçersiz işaret'),
  view: z.enum(DAMAGE_VIEWS),
  x: z.number().int().min(0).max(1000),
  y: z.number().int().min(0).max(1000),
  category: z.preprocess(blank, z.enum(DAMAGE_CATEGORIES, { error: 'Hasar türünü seçin' })),
  note: optText(300),
  photoId: optUuid('Geçersiz fotoğraf'),
  existingMarkId: optUuid('Geçersiz işaret'),
})
export type DamageMarkInput = z.infer<typeof damageMarkSchema>

/** Saving an open inspection. `inspectionVersion` 0 creates it. km and fuel of a return are set by the return itself. */
export const inspectionDraftSchema = z.object({
  inspectionVersion: z.number().int().min(0),
  km: z.preprocess(blank, z.coerce.number({ error: 'Kilometreyi sayı olarak girin' }).int('Tam sayı girin').min(0, 'Kilometre negatif olamaz').max(3_000_000, 'Kilometre çok büyük').optional()),
  fuel: z.preprocess(blank, z.enum(FUEL_LEVELS).optional()),
  cleanliness: z.preprocess(blank, z.enum(CLEANLINESS_LEVELS).optional()),
  condition: z.preprocess(blank, z.enum(CONDITION_LEVELS).optional()),
  checklist: z.partialRecord(z.enum(CHECKLIST_ITEMS), z.enum(CHECKLIST_ANSWERS)).default({}),
  notes: optText(2000),
  counterpartCustomerId: optUuid('Sürücü seçin'),
  marks: z.array(damageMarkSchema).max(MAX_DAMAGE_MARKS, `En fazla ${MAX_DAMAGE_MARKS} işaret`).default([]),
})
export type InspectionDraftInput = z.infer<typeof inspectionDraftSchema>

export const rentalDeliverSchema = z.object({
  version,
  inspectionVersion: version,
  requestId,
  /** Empty = now. Otherwise the pickup branch's wall time, at most HANDOVER_BACKDATE_HOURS back (K8). */
  deliveredLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  deliveredChoice: choice,
  largeJumpReason: optText(300),
  /** K1 statement 1: the contract was made and the transaction completed in the external process. */
  externalContractAck: z.boolean().optional(),
  /** K1 statement 2: the price was set outside ACARVO and handled with the parties in the external process. */
  externalPricingAck: z.boolean().optional(),
  externalReference: z.preprocess(
    blank,
    z
      .string()
      .trim()
      .min(3, 'Dış sözleşme veya işlem referansı en az 3 karakter')
      .max(40, 'En fazla 40 karakter')
      .regex(EXTERNAL_REFERENCE_PATTERN, 'Yalnız harf, rakam, boşluk ve . / _ - kullanın (ad veya kimlik numarası yazmayın)')
      .optional(),
  ),
})

export const rentalExtendSchema = z.object({
  version,
  requestId,
  returnLocal: wallTime('Yeni iade tarih ve saatini girin'),
  returnChoice: choice,
  returnBranchId: z.uuid('İade şubesini seçin'),
  channel: z.preprocess(blank, z.enum(EXTENSION_CHANNELS, { error: 'Talebin nereden geldiğini seçin' })),
})

export const rentalReturnSchema = z.object({
  version,
  requestId,
  returnBranchId: z.uuid('İade şubesini seçin'),
  /** Empty = now. Otherwise the return branch's wall time, at most RETURN_BACKDATE_HOURS back (K8). */
  returnedLocal: optWallTime('Geçerli bir tarih ve saat girin'),
  returnedChoice: choice,
  km: z.preprocess(blank, z.coerce.number({ error: 'İade kilometresini girin' }).int('Tam sayı girin').min(0, 'Kilometre negatif olamaz').max(3_000_000, 'Kilometre çok büyük')),
  fuel: z.preprocess(blank, z.enum(FUEL_LEVELS, { error: 'Yakıt seviyesini seçin' })),
  counterpartCustomerId: optUuid('Sürücü seçin'),
  largeJumpReason: optText(300),
})

export const rentalCloseSchema = z.object({
  version,
  inspectionVersion: version,
  requestId,
  findingsAcknowledged: z.boolean().optional(),
})

export const rentalAvailabilitySchema = z.object({
  vehicleClassId: z.uuid('Araç sınıfını seçin'),
  pickupBranchId: z.uuid('Başlangıç şubesini seçin'),
  returnBranchId: z.uuid('İade şubesini seçin'),
  pickupLocal: wallTime('Alış tarih ve saatini girin'),
  returnLocal: wallTime('İade tarih ve saatini girin'),
  pickupChoice: choice,
  returnChoice: choice,
  excludeRentalId: optUuid('Geçersiz kiralama'),
})

/** List query, sent in a POST body: names, plates and phone numbers never appear in a URL. Dates are company days. */
export const rentalSearchSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100, 'Arama en fazla 100 karakter olabilir').optional()),
  view: z.preprocess(blank, z.enum(RENTAL_VIEWS).default('active')),
  from: z.preprocess(blank, z.iso.date().optional()),
  to: z.preprocess(blank, z.iso.date().optional()),
  branchId: optUuid('Geçersiz filtre'),
  vehicleId: optUuid('Geçersiz filtre'),
  customerId: optUuid('Geçersiz filtre'),
  corporateAccountId: optUuid('Geçersiz filtre'),
  sort: z.preprocess(blank, z.enum(RENTAL_SORTS).default('pickup')),
  dir: z.preprocess(blank, z.enum(['asc', 'desc']).default('asc')),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (RENTAL_PAGE_SIZES as readonly number[]).includes(n))
    .default(25),
})
export type RentalSearch = z.infer<typeof rentalSearchSchema>

// ---------------------------------------------------------------------------
// API shapes

export interface RentalListItem {
  id: string
  rentalNo: string
  status: RentalStatus
  origin: 'reservation' | 'direct'
  reservation: { id: string; reservationNo: string } | null
  customer: { id: string; customerNo: string; displayName: string }
  corporateAccount: { id: string; accountNo: string; legalName: string } | null
  vehicleClass: { id: string; name: string }
  vehicle: { id: string; plate: string; make: string; model: string }
  pickupBranch: ReservationRef
  returnBranch: ReservationRef
  actualReturnBranch: ReservationRef | null
  plannedPickup: ReservationMoment
  plannedReturn: ReservationMoment
  delivered: ReservationMoment | null
  returned: ReservationMoment | null
  /** Delivered and the planned return has passed: minutes overdue now. Null otherwise. */
  overdueMinutes: number | null
  createdAt: string
}

export interface RentalListResponse {
  items: RentalListItem[]
  total: number
  page: number
  pageSize: number
  /** Counts for the view tabs, in the user's scope. */
  counts: Record<'active' | 'prepared' | 'delivered' | 'overdue' | 'returned', number>
}

export interface RentalPhoto {
  id: string
  angle: PhotoAngle
  url: string
  thumbUrl: string
  width: number
  height: number
  createdAt: string
  createdByName: string | null
}

export interface RentalDamageMark {
  id: string
  view: DamageView
  x: number
  y: number
  category: DamageCategory
  note: string | null
  photoId: string | null
  existingMarkId: string | null
}

export interface RentalInspection {
  id: string
  kind: 'handover' | 'return'
  state: 'draft' | 'final'
  km: number | null
  fuel: FuelLevel | null
  cleanliness: Cleanliness | null
  condition: VehicleCondition | null
  checklist: Partial<Record<ChecklistItem, ChecklistAnswer>>
  notes: string | null
  counterpart: { id: string; customerNo: string; displayName: string } | null
  occurred: ReservationMoment | null
  branch: ReservationRef | null
  performedByName: string | null
  photos: RentalPhoto[]
  marks: RentalDamageMark[]
  findingsAcknowledgedAt: string | null
  finalizedAt: string | null
  version: number
}

export type RentalGateState = 'ok' | 'blocked' | 'attention'
export type RentalGateCode =
  | 'drivers'
  | 'branch_country'
  | 'documents'
  | 'vehicle_active'
  | 'availability'
  | 'previous_return_open'
  | 'vehicle_location'
  | 'handover_record'
  | 'photos'
  | 'external_terms'
  | 'return_record'
  | 'findings'
  | 'pricing'
  | 'contract'

export interface RentalGate {
  code: RentalGateCode
  state: RentalGateState
  /** Numbers, plates, rental or reservation numbers and counts only. */
  detail?: Record<string, string | number | null>
}

export interface RentalDocumentCheck {
  customerId: string
  driverRole: 'primary' | 'additional'
  residencyClass: 'local' | 'foreign'
  referenceCountry: string | null
  ruleStatus: 'policy_applied' | 'no_policy' | 'branch_country_missing'
  policyVersion: number | null
  requiredItems: { acceptedTypes: string[] }[]
  documentCount: number
  decision: 'eligible' | 'not_eligible'
  note: string | null
  checkedByName: string | null
  checkedAt: string
}

/** What staff sees before deciding (current state, never a final verdict; K3, K4). */
export interface RentalDocumentContext {
  referenceCountry: string | null
  policies: Record<'local' | 'foreign', { version: number; items: { acceptedTypes: string[] }[] } | null>
  /**
   * Per driver: the suggestion (residence country vs reference country; never nationality; null when either is unknown)
   * and the document types valid for the whole rental period / ending within it (metadata only, never numbers).
   */
  drivers: { customerId: string; suggestedResidency: 'local' | 'foreign' | null; validTypes: string[]; expiringInPeriod: string[] }[]
}

export interface RentalEvent {
  id: string
  kind: string
  fromStatus: RentalStatus | null
  toStatus: RentalStatus
  reason: string | null
  data: Record<string, unknown> | null
  actorName: string | null
  at: string
}

export interface RentalDetail extends Omit<RentalListItem, 'customer' | 'vehicle'> {
  customer: ReservationPerson
  drivers: (ReservationPerson & { isPrimary: boolean })[]
  vehicle: { id: string; plate: string; make: string; model: string; status: string; homeBranch: ReservationRef; currentKm: number | null }
  note: string | null
  deliveredByName: string | null
  /** K1 statements recorded with the handover (staff statements, not proof of a signed contract or payment). */
  externalTerms: { contractAckAt: string; pricingAckAt: string; reference: string; byName: string | null } | null
  /** The company's current mode (K1); off unless the owner switched it on. */
  externalTermsMode: boolean
  returnedByName: string | null
  closedAt: string | null
  closedByName: string | null
  cancelReason: RentalCancelReason | null
  cancelNote: string | null
  cancelledAt: string | null
  cancelledByName: string | null
  documentChecks: RentalDocumentCheck[]
  documentContext: RentalDocumentContext | null
  handover: RentalInspection | null
  return: RentalInspection | null
  /** The vehicle's last final return inspection before this rental (reference for existing damage). */
  previousReturnMarks: RentalDamageMark[]
  deliveryGates: RentalGate[]
  closeGates: RentalGate[]
  /** Confirmed reservations of the vehicle that an overdue or extended rental may affect (numbers and times only). */
  affectedReservations: { reservationNo: string; pickupAt: string; returnAt: string }[]
  events: RentalEvent[]
  uploadPolicy: { enabled: boolean; reason: string | null }
  version: number
  createdByName: string | null
  updatedAt: string
  updatedByName: string | null
}

export interface RentalActivityItem {
  id: string
  action: string
  summary: Record<string, unknown> | null
  at: string
  actorName: string | null
}
