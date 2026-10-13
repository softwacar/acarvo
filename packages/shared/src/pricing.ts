import { z } from 'zod'
import { isCurrency, MAX_PRICE_MINOR } from './money'
import type { EngineProblem, EngineResult, QuoteLine } from './pricing-engine'
import { AMBIGUOUS_TIME_CHOICES } from './time'

// ---------------------------------------------------------------------------
// Pricing V1 — docs/FIYATLANDIRMA_SOZLESME_PLANI.md. A price list is edited as one document (rates, seasons, extras,
// discounts, tax) with a version; every save raises its revision. Quotes pin the revision and keep their lines.

export const PRICE_LIST_STATUSES = ['draft', 'active', 'archived'] as const
export type PriceListStatus = (typeof PRICE_LIST_STATUSES)[number]
export const DAY_METHODS = ['rolling_24h', 'calendar_day'] as const
export const TAX_MODES = ['not_configured', 'exclusive', 'inclusive'] as const
export const QUOTE_STATUSES = ['quoted', 'superseded'] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]
export const MAX_GRACE_MINUTES = 180

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
const money = z.number({ error: 'Tutar girin' }).int('Geçersiz tutar').min(0, 'Tutar negatif olamaz').max(MAX_PRICE_MINOR, 'Tutar çok büyük')
const optMoney = z.preprocess((v) => (v === '' ? null : v), money.nullable())
const optUuid = z.preprocess(blank, z.uuid().optional())
const day = z.iso.date('Tarih seçin')
const name = (max: number, msg: string) => z.string({ error: msg }).trim().min(1, msg).max(max, `En fazla ${max} karakter`)

export const rateSchema = z.object({
  id: optUuid,
  vehicleClassId: z.uuid('Araç sınıfı seçin'),
  rate1to6: money,
  rate7to29: optMoney,
  rate30plus: optMoney,
})
export const seasonSchema = z
  .object({
    id: optUuid,
    name: name(80, 'Sezon adını girin'),
    startDate: day,
    endDate: day,
    vehicleClassId: z.preprocess(blank, z.uuid().nullable().optional()),
    percentBp: z.number().int().min(-9_000, 'En fazla %90 indirim').max(50_000, 'En fazla %500 artış'),
    priority: z.number().int().min(0).max(1000),
    active: z.boolean(),
  })
  .refine((s) => s.endDate >= s.startDate, { message: 'Bitiş başlangıçtan önce olamaz', path: ['endDate'] })
export const extraSchema = z.object({
  id: optUuid,
  code: z.string().trim().regex(/^[A-Z0-9_-]{2,20}$/, 'Kod: 2–20 büyük harf, rakam, - veya _'),
  name: name(80, 'Ek hizmet adını girin'),
  kind: z.enum(['standard', 'additional_driver']),
  mode: z.enum(['per_day', 'per_rental']),
  priceMinor: money,
  maxQuantity: z.number().int().min(1).max(20),
  taxable: z.boolean(),
  active: z.boolean(),
})
export const discountSchema = z
  .object({
    id: optUuid,
    name: name(80, 'İndirim adını girin'),
    type: z.enum(['percent', 'fixed']),
    value: z.number().int().min(1, 'Değer girin'),
    minDays: z.number().int().min(1).max(366),
    active: z.boolean(),
  })
  .refine((d) => d.type !== 'percent' || d.value <= 10_000, { message: 'Yüzde en fazla %100', path: ['value'] })
  .refine((d) => d.type !== 'fixed' || d.value <= MAX_PRICE_MINOR, { message: 'Tutar çok büyük', path: ['value'] })

export const priceListSchema = z
  .object({
    name: name(80, 'Fiyat listesi adını girin'),
    currency: z.string().trim().toUpperCase().refine(isCurrency, 'Geçerli bir ISO 4217 para birimi seçin'),
    branchId: z.preprocess(blank, z.uuid().nullable().optional()),
    validFrom: z.preprocess(blank, day.nullable().optional()),
    validUntil: z.preprocess(blank, day.nullable().optional()),
    priority: z.number().int().min(0).max(1000),
    dayMethod: z.enum(DAY_METHODS, { error: 'Gün hesabı yöntemini seçin' }),
    graceMinutes: z.number().int().min(0).max(MAX_GRACE_MINUTES),
    minDays: z.number().int().min(1).max(30),
    taxMode: z.enum(TAX_MODES),
    taxRateBp: z.preprocess((v) => (v === '' ? null : v), z.number().int().min(1, 'Oran girin').max(10_000).nullable()),
    taxLabel: z.preprocess(blank, z.string().trim().max(40).nullable().optional()),
    note: z.preprocess(blank, z.string().trim().max(500).nullable().optional()),
    rates: z.array(rateSchema).max(100),
    seasons: z.array(seasonSchema).max(100),
    extras: z.array(extraSchema).max(50),
    discounts: z.array(discountSchema).max(30),
  })
  .refine((p) => !p.validFrom || !p.validUntil || p.validUntil >= p.validFrom, { message: 'Bitiş başlangıçtan önce olamaz', path: ['validUntil'] })
  .refine((p) => p.taxMode === 'not_configured' || p.taxRateBp != null, { message: 'Vergi oranını girin', path: ['taxRateBp'] })
  .refine((p) => new Set(p.rates.map((r) => r.vehicleClassId)).size === p.rates.length, { message: 'Bir araç sınıfı yalnız bir kez fiyatlandırılabilir', path: ['rates'] })
  .refine((p) => new Set(p.extras.map((e) => e.code)).size === p.extras.length, { message: 'Ek hizmet kodları tekil olmalı', path: ['extras'] })
export type PriceListInput = z.infer<typeof priceListSchema>
export const priceListSaveSchema = priceListSchema.and(z.object({ version: z.number().int().min(1) }))

/** What a quote is computed from; the period comes from the reservation / rental itself. */
export const quoteOptionsSchema = z.object({
  priceListId: optUuid,
  selectedExtras: z.array(z.object({ extraId: z.uuid(), quantity: z.number().int().min(1).max(20) })).max(30).default([]),
  discountId: optUuid,
})
export const quoteCreateSchema = quoteOptionsSchema.extend({
  requestId: z.uuid(),
  /** The total the user saw (spec §9.2): if the server's result differs, 409 PRICE_CHANGED with the new result. */
  expectedNetMinor: z.number().int(),
  expectedGrossMinor: z.number().int().nullable(),
})
/** Free preview on the pricing screen: any class, branch and period. */
export const pricingPreviewSchema = quoteOptionsSchema.extend({
  priceListId: z.uuid('Fiyat listesi seçin'),
  vehicleClassId: z.uuid('Araç sınıfı seçin'),
  pickupBranchId: z.uuid('Şube seçin'),
  pickupLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Alış zamanı girin'),
  returnLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'İade zamanı girin'),
  returnBranchId: z.uuid('Şube seçin'),
  pickupChoice: z.preprocess(blank, z.enum(AMBIGUOUS_TIME_CHOICES).optional()),
  returnChoice: z.preprocess(blank, z.enum(AMBIGUOUS_TIME_CHOICES).optional()),
  additionalDrivers: z.number().int().min(0).max(5).default(0),
})

// ---------------------------------------------------------------------------
// API shapes

export interface PriceListSummary {
  id: string
  name: string
  currency: string
  status: PriceListStatus
  branch: { id: string; name: string; code: string } | null
  validFrom: string | null
  validUntil: string | null
  priority: number
  taxMode: (typeof TAX_MODES)[number]
  revision: number
  rateCount: number
  updatedAt: string
  updatedByName: string | null
}
export interface PriceListDetail extends Omit<PriceListSummary, 'rateCount'> {
  dayMethod: (typeof DAY_METHODS)[number]
  graceMinutes: number
  minDays: number
  taxRateBp: number | null
  taxLabel: string | null
  note: string | null
  rates: { id: string; vehicleClassId: string; vehicleClassName: string; rate1to6: number; rate7to29: number | null; rate30plus: number | null }[]
  seasons: { id: string; name: string; startDate: string; endDate: string; vehicleClassId: string | null; percentBp: number; priority: number; active: boolean }[]
  extras: { id: string; code: string; name: string; kind: 'standard' | 'additional_driver'; mode: 'per_day' | 'per_rental'; priceMinor: number; maxQuantity: number; taxable: boolean; active: boolean }[]
  discounts: { id: string; name: string; type: 'percent' | 'fixed'; value: number; minDays: number; active: boolean }[]
  version: number
  createdByName: string | null
  createdAt: string
  /** Quotes that pinned this list (they keep their own snapshot whatever changes here). */
  quoteCount: number
}

export interface PricingResult extends EngineResult {
  priceList: { id: string; name: string; revision: number } | null
  /** Why no price could be computed (no active list for the branch/currency, problems of the engine). */
  unavailable: null | { reason: 'no_price_list' | 'ambiguous_price_list' | 'engine'; problems?: EngineProblem[] }
}

export interface PriceQuote {
  id: string
  quoteNo: string
  status: QuoteStatus
  target: { kind: 'reservation' | 'rental'; id: string; no: string }
  currency: string
  priceList: { id: string; name: string; revision: number }
  pickupAt: string
  returnAt: string
  days: number
  tier: string
  dayMethod: string
  lines: QuoteLine[]
  netMinor: number
  taxMinor: number | null
  grossMinor: number | null
  taxStatus: 'complete' | 'not_configured'
  engineVersion: string
  calculatedAt: string
  createdByName: string | null
  supersededAt: string | null
  /** False when the reservation / rental plan or class changed after the quote: it is then shown as outdated. */
  matchesPlan: boolean
}
