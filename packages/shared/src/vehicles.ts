import { z } from 'zod'

// ---------------------------------------------------------------------------
// Vehicles (spec §13.2). One schema validates the web form and the API body.

export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'lpg'] as const
export const TRANSMISSIONS = ['manual', 'automatic'] as const
export const VEHICLE_STATUSES = ['active', 'out_of_service', 'sold', 'disposed'] as const
/** Statuses settable from the edit form. Sold / Disposed need the separate fleet-exit action (§59BM). */
export const EDITABLE_VEHICLE_STATUSES = ['active', 'out_of_service'] as const
export const ACQUISITION_TYPES = ['purchase', 'lease', 'long_term_rent', 'other'] as const
export const CURRENCIES = ['EUR', 'BAM', 'USD', 'TRY', 'CHF', 'GBP', 'RSD'] as const
export type FuelType = (typeof FUEL_TYPES)[number]
export type Transmission = (typeof TRANSMISSIONS)[number]
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number]

/** Plate as stored for duplicate checks: upper case, letters and digits only. */
export function normalizePlate(plate: string) {
  return plate.toLocaleUpperCase('tr').replace(/[^0-9A-ZČĆŽŠĐÇĞİÖŞÜ]/g, '')
}

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const optInt = (min: number, max: number, msg: string) =>
  z.preprocess(blank, z.coerce.number({ error: msg }).int(msg).min(min, msg).max(max, msg).optional())
const uuidField = (msg: string) => z.preprocess(blank, z.uuid(msg))
const today = () => new Date().toISOString().slice(0, 10)
const maxYear = () => new Date().getFullYear() + 1

export const vehicleInputSchema = z
  .object({
    plate: z
      .string({ error: 'Plaka girin' })
      .trim()
      .min(1, 'Plaka girin')
      .max(15, 'En fazla 15 karakter')
      .regex(/^[0-9A-Za-zČĆŽŠĐčćžšđÇĞİÖŞÜçğıöşü\s-]+$/, 'Plaka yalnız harf, rakam, boşluk ve tire içerebilir')
      .refine((v) => normalizePlate(v).length >= 2, 'Plaka en az 2 harf veya rakam içermeli'),
    vehicleCode: optText(20),
    make: z.string({ error: 'Marka girin' }).trim().min(1, 'Marka girin').max(60, 'En fazla 60 karakter'),
    model: z.string({ error: 'Model girin' }).trim().min(1, 'Model girin').max(60, 'En fazla 60 karakter'),
    trim: optText(60),
    modelYear: z.preprocess(
      blank,
      z.coerce
        .number({ error: 'Geçerli bir yıl girin' })
        .int('Geçerli bir yıl girin')
        .min(1950, 'Geçerli bir yıl girin')
        .refine((y) => y <= maxYear(), `Model yılı en fazla ${maxYear()} olabilir`)
        .optional(),
    ),
    classId: uuidField('Araç sınıfı seçin'),
    color: optText(30),
    vin: z.preprocess(
      (v) => (typeof v === 'string' ? blank(v.trim().toUpperCase()) : blank(v)),
      z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'Şasi numarası 17 karakter olmalı (I, O, Q kullanılmaz)').optional(),
    ),
    fuelType: z.preprocess(blank, z.enum(FUEL_TYPES, { error: 'Yakıt türü seçin' })),
    transmission: z.preprocess(blank, z.enum(TRANSMISSIONS, { error: 'Vites türü seçin' })),
    seats: optInt(1, 99, '1 ile 99 arasında bir sayı girin'),
    homeBranchId: uuidField('Ana şube seçin'),
    status: z.preprocess(blank, z.enum(EDITABLE_VEHICLE_STATUSES).default('active')),
    acquisitionType: z.preprocess(blank, z.enum(ACQUISITION_TYPES).optional()),
    acquisitionDate: z.preprocess(
      blank,
      z.iso
        .date('Geçerli bir tarih girin')
        .refine((d) => d <= today(), 'Edinim tarihi gelecekte olamaz')
        .optional(),
    ),
    acquisitionSeller: optText(120),
    /** Decimal amount as typed, e.g. "18500" or "18500,50". */
    acquisitionCost: z.preprocess(
      (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' ? blank(v.trim().replace(',', '.')) : blank(v)),
      z
        .string()
        .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Tutarı en fazla 2 ondalıkla girin, örneğin 18500,00')
        .optional(),
    ),
    acquisitionCurrency: z.preprocess(blank, z.enum(CURRENCIES, { error: 'Para birimi seçin' }).optional()),
    acquisitionReference: optText(60),
    notes: optText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.acquisitionCost !== undefined && !v.acquisitionCurrency) {
      ctx.addIssue({ code: 'custom', path: ['acquisitionCurrency'], message: 'Tutar için para birimi seçin' })
    }
    if (v.acquisitionCost === undefined && v.acquisitionCurrency) {
      ctx.addIssue({ code: 'custom', path: ['acquisitionCost'], message: 'Para birimi seçildiyse tutarı girin' })
    }
  })
export type VehicleInput = z.output<typeof vehicleInputSchema>

/** Create adds the starting records; afterwards they change only through their own events. */
export const vehicleCreateSchema = z.intersection(
  vehicleInputSchema,
  z.object({
    initialOdometerKm: optInt(0, 3_000_000, '0 ile 3.000.000 arasında bir kilometre girin'),
    initialLocationBranchId: z.preprocess(blank, z.uuid('Şube seçin').optional()),
  }),
)
export type VehicleCreateInput = z.output<typeof vehicleCreateSchema>

export const vehicleUpdateSchema = z.intersection(vehicleInputSchema, z.object({ version: z.coerce.number().int().min(1) }))
export type VehicleUpdateInput = z.output<typeof vehicleUpdateSchema>

export const VEHICLE_SORTS = ['plate', 'vehicle', 'class', 'branch', 'km', 'year', 'created'] as const
export type VehicleSort = (typeof VEHICLE_SORTS)[number]
export const PAGE_SIZES = [10, 25, 50, 100] as const

export const vehicleListQuerySchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(60).optional()),
  classId: z.preprocess(blank, z.uuid().optional()),
  branchId: z.preprocess(blank, z.uuid().optional()),
  status: z.preprocess(blank, z.enum(VEHICLE_STATUSES).optional()),
  fuelType: z.preprocess(blank, z.enum(FUEL_TYPES).optional()),
  transmission: z.preprocess(blank, z.enum(TRANSMISSIONS).optional()),
  sort: z.enum(VEHICLE_SORTS).catch('plate'),
  dir: z.enum(['asc', 'desc']).catch('asc'),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(25),
})
export type VehicleListQuery = z.output<typeof vehicleListQuerySchema>

export interface OdometerSummary {
  km: number
  at: string
}
export interface LocationSummary {
  type: 'branch' | 'in_transit' | 'with_customer' | 'service_provider' | 'supplier'
  branchName: string | null
  at: string
}

export interface VehicleListItem {
  id: string
  plate: string
  vehicleCode: string | null
  make: string
  model: string
  trim: string | null
  modelYear: number | null
  className: string
  source: 'internal' | 'external'
  homeBranch: { id: string; name: string; code: string }
  fuelType: FuelType
  transmission: Transmission
  status: VehicleStatus
  odometer: OdometerSummary | null
  location: LocationSummary | null
}

export interface VehicleListResponse {
  items: VehicleListItem[]
  total: number
  page: number
  pageSize: number
}

export interface VehicleDetail {
  id: string
  plate: string
  vehicleCode: string | null
  make: string
  model: string
  trim: string | null
  modelYear: number | null
  classId: string
  className: string
  color: string | null
  vin: string | null
  fuelType: FuelType
  transmission: Transmission
  seats: number | null
  source: 'internal' | 'external'
  homeBranchId: string
  homeBranchName: string
  status: VehicleStatus
  acquisitionType: AcquisitionType | null
  acquisitionDate: string | null
  acquisitionSeller: string | null
  /** Decimal string, e.g. "18500.00". */
  acquisitionCost: string | null
  acquisitionCurrency: string | null
  acquisitionReference: string | null
  notes: string | null
  version: number
  odometer: OdometerSummary | null
  location: LocationSummary | null
  createdAt: string
  updatedAt: string
  updatedByName: string | null
}

export interface VehicleClassSummary {
  id: string
  name: string
}

export interface VehicleActivityItem {
  id: string
  action: string
  summary: Record<string, unknown> | null
  at: string
  actorName: string | null
}

export const VEHICLE_TABS = ['genel', 'musaitlik', 'kiralamalar', 'kontroller', 'bakim', 'belgeler', 'finans', 'gecmis'] as const
export type VehicleTab = (typeof VEHICLE_TABS)[number]

export const MAX_PROMO_PHOTOS = 6
export const MAX_PHOTO_MB = 10

export interface VehiclePhotoAttribution {
  author: string
  sourceUrl: string
  license: string
  licenseUrl: string
  /** What was changed from the original, as the licence asks (e.g. resized, converted). */
  changes: string
}

export interface VehiclePhoto {
  id: string
  position: number
  isPrimary: boolean
  width: number
  height: number
  sizeBytes: number
  createdAt: string
  uploadedByName: string | null
  attribution: VehiclePhotoAttribution | null
  url: string
  thumbUrl: string
}
export interface VehiclePhotoList {
  items: VehiclePhoto[]
  max: number
}
