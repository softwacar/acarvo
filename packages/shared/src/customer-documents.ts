import { z } from 'zod'
import { COUNTRY_CODES } from './customers'
import { daysBetween } from './documents'

// ---------------------------------------------------------------------------
// Customer documents (M2): identity card, passport, driving licence and related records of a person.
// A separate record type from vehicle documents. Numbers are written once and then only ever shown masked;
// the full value is encrypted at rest and opened only through the audited reveal action.

export const CUSTOMER_DOCUMENT_TYPES = [
  'national_id',
  'passport',
  'driving_license',
  'international_driving_permit',
  'residence_permit',
  'visa',
  'entry_record',
  'other',
] as const
export type CustomerDocumentType = (typeof CUSTOMER_DOCUMENT_TYPES)[number]

/**
 * What each type records. These describe the shape of the record only; whether a type is REQUIRED anywhere is
 * decided by the company's country policies (§5 of the M2 plan), never here.
 */
export const CUSTOMER_DOCUMENT_TYPE_INFO: Record<CustomerDocumentType, { number: 'required' | 'optional' | 'none'; licence?: true; entryDate?: true; title?: true }> = {
  national_id: { number: 'required' },
  passport: { number: 'required' },
  driving_license: { number: 'required', licence: true },
  international_driving_permit: { number: 'optional', licence: true },
  residence_permit: { number: 'required' },
  visa: { number: 'optional' },
  entry_record: { number: 'none', entryDate: true },
  other: { number: 'optional', title: true },
}

export const CUSTOMER_DOCUMENT_VERIFICATIONS = ['not_verified', 'original_seen', 'copy_only'] as const
export type CustomerDocumentVerification = (typeof CUSTOMER_DOCUMENT_VERIFICATIONS)[number]

export const CUSTOMER_DOCUMENT_VOID_REASONS = ['entry_error', 'duplicate', 'wrong_customer', 'other'] as const
export type CustomerDocumentVoidReason = (typeof CUSTOMER_DOCUMENT_VOID_REASONS)[number]

/** Why a full number is opened (M2 plan K-9). A fixed list: the audit log never holds free text about a person. */
export const NUMBER_REVEAL_REASONS = ['contract_preparation', 'official_request', 'document_check', 'other'] as const
export type NumberRevealReason = (typeof NUMBER_REVEAL_REASONS)[number]
export const NUMBER_REVEAL_LIMIT_PER_HOUR = 30
export const NUMBER_REVEAL_VISIBLE_SECONDS = 30

export const CUSTOMER_DOCUMENT_SIDES = ['front', 'back', 'page'] as const
export type CustomerDocumentSide = (typeof CUSTOMER_DOCUMENT_SIDES)[number]
/** Per uploaded file (image or PDF). */
export const CUSTOMER_FILE_MAX_MB = 10
export const CUSTOMER_FILE_MAX_PDF_PAGES = 20
export const DEFAULT_DOCUMENT_WARNING_DAYS = 30

/** Number as compared and encrypted: upper case, letters and digits only ("ab 12-34/5" → "AB12345"). */
export const normalizeDocumentNumber = (raw: string) => raw.toUpperCase().replace(/[\s\-./]/g, '')
export const DOCUMENT_NUMBER_PATTERN = /^[A-Z0-9ÇĞİÖŞÜČĆŽŠĐ]{3,40}$/

/** The few trailing characters kept in clear for masked display; at least four characters always stay hidden. */
export function documentNumberHint(normalized: string): string {
  const visible = Math.max(0, Math.min(4, normalized.length - 4))
  return visible ? normalized.slice(-visible) : ''
}
export const maskedNumber = (hint: string | null) => (hint === null ? null : `••••${hint}`)

// ---------------------------------------------------------------------------
// Schemas (messages never repeat the typed value)

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const optDate = z.preprocess(blank, z.iso.date('Geçerli bir tarih girin').optional())
const country = z.preprocess((v) => (typeof v === 'string' ? blank(v.trim().toUpperCase()) : blank(v)), z.string().refine((c) => COUNTRY_CODES.includes(c), 'Listeden bir ülke seçin').optional())
const today = () => new Date().toISOString().slice(0, 10)
const number = z.preprocess(
  (v) => (typeof v === 'string' ? blank(normalizeDocumentNumber(v)) : blank(v)),
  z.string().regex(DOCUMENT_NUMBER_PATTERN, 'Belge numarası 3–40 harf veya rakamdan oluşmalı').optional(),
)
const categories = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(/[,\s]+/).filter(Boolean) : v ?? undefined),
  z.array(z.string().trim().toUpperCase().regex(/^[A-Z0-9+]{1,4}$/, 'Sınıfları virgülle ayırın, örneğin B, BE')).max(20).optional(),
)

const documentFields = z.object({
  issuingCountry: country,
  issuingAuthority: optText(120),
  title: optText(80),
  number,
  issuedOn: optDate,
  validFrom: optDate,
  validUntil: optDate,
  licenseCategories: categories,
  licenseFirstIssuedOn: optDate,
  entryDate: optDate,
  note: optText(300),
  verification: z.preprocess(blank, z.enum(CUSTOMER_DOCUMENT_VERIFICATIONS).default('not_verified')),
})
type Fields = z.infer<typeof documentFields>

/** Type-specific rules; each issue names a field and a message without the typed value. */
export function documentRules(type: CustomerDocumentType | undefined, d: Fields, opts: { numberGiven: boolean }): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  if (!type) return issues
  const info = CUSTOMER_DOCUMENT_TYPE_INFO[type]
  if (type !== 'other' && !d.issuingCountry) add('issuingCountry', 'Belgeyi düzenleyen ülkeyi seçin')
  if (info.number === 'required' && !opts.numberGiven) add('number', 'Belge numarasını girin')
  if (info.number === 'none' && d.number) add('number', 'Bu belge türünde numara tutulmaz')
  if (info.entryDate && !d.entryDate) add('entryDate', 'Giriş tarihini girin')
  if (info.title && !d.title) add('title', 'Belge adını girin')
  if (!info.licence && (d.licenseCategories?.length || d.licenseFirstIssuedOn)) add('licenseCategories', 'Sınıf bilgisi yalnız sürücü belgelerinde tutulur')
  if (d.issuedOn && d.issuedOn > today()) add('issuedOn', 'Düzenlenme tarihi gelecekte olamaz')
  if (d.entryDate && d.entryDate > today()) add('entryDate', 'Giriş tarihi gelecekte olamaz')
  if (d.licenseFirstIssuedOn && d.licenseFirstIssuedOn > today()) add('licenseFirstIssuedOn', 'İlk veriliş tarihi gelecekte olamaz')
  if (d.validFrom && d.validUntil && d.validFrom > d.validUntil) add('validUntil', 'Son geçerlilik, başlangıçtan önce olamaz')
  if (d.issuedOn && d.validUntil && d.issuedOn > d.validUntil) add('validUntil', 'Son geçerlilik, düzenlenme tarihinden önce olamaz')
  return issues
}

export const customerDocumentCreateSchema = documentFields
  .extend({ type: z.preprocess(blank, z.enum(CUSTOMER_DOCUMENT_TYPES, { error: 'Belge türünü seçin' })) })
  .superRefine((d, ctx) => {
    for (const i of documentRules(d.type, d, { numberGiven: !!d.number })) ctx.addIssue({ code: 'custom', path: [i.path], message: i.message })
  })
export type CustomerDocumentCreate = z.infer<typeof customerDocumentCreateSchema>

/** Correction of a period. The number is written only when a new one is typed; an empty field keeps the stored number. */
export const customerDocumentUpdateSchema = documentFields.extend({ version: z.number().int().min(1) })
export type CustomerDocumentUpdate = z.infer<typeof customerDocumentUpdateSchema>
export const validateDocumentUpdate = (type: CustomerDocumentType, d: CustomerDocumentUpdate, hasStoredNumber: boolean) =>
  documentRules(type, d, { numberGiven: !!d.number || hasStoredNumber })

/** New period of the same document type; keepNumber re-encrypts the previous period's number for the new record. */
export const customerDocumentRenewSchema = documentFields.extend({ version: z.number().int().min(1), keepNumber: z.boolean().optional() })
export type CustomerDocumentRenew = z.infer<typeof customerDocumentRenewSchema>

export const customerDocumentVerifySchema = z.object({ version: z.number().int().min(1), verification: z.enum(['original_seen', 'copy_only'], { error: 'Doğrulama türünü seçin' }) })
export const customerDocumentVoidSchema = z.object({
  version: z.number().int().min(1),
  reason: z.preprocess(blank, z.enum(CUSTOMER_DOCUMENT_VOID_REASONS, { error: 'Geçersiz sayma nedenini seçin' })),
  note: optText(200),
})
export const numberRevealSchema = z.object({ reason: z.preprocess(blank, z.enum(NUMBER_REVEAL_REASONS, { error: 'Numarayı açma nedenini seçin' })) })
export const documentLookupSchema = z.object({
  type: z.enum(CUSTOMER_DOCUMENT_TYPES, { error: 'Belge türünü seçin' }),
  issuingCountry: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.string().refine((c) => COUNTRY_CODES.includes(c), 'Listeden bir ülke seçin')),
  number: z.preprocess((v) => (typeof v === 'string' ? normalizeDocumentNumber(v) : v), z.string().regex(DOCUMENT_NUMBER_PATTERN, 'Belge numarası 3–40 harf veya rakamdan oluşmalı')),
})

// ---------------------------------------------------------------------------
// Validity (calendar dates in the company's time zone; never converted)

export type CustomerDocumentState = 'valid' | 'expiring' | 'expired' | 'no_expiry' | 'not_started' | 'superseded' | 'voided'

export interface DocumentValidity {
  state: CustomerDocumentState
  daysLeft: number | null
  startsInDays: number | null
}

export function customerDocumentValidity(
  d: { recordState: 'active' | 'voided'; superseded: boolean; validFrom: string | null; validUntil: string | null },
  today: string,
  warningDays = DEFAULT_DOCUMENT_WARNING_DAYS,
): DocumentValidity {
  if (d.recordState === 'voided') return { state: 'voided', daysLeft: null, startsInDays: null }
  if (d.superseded) return { state: 'superseded', daysLeft: d.validUntil ? daysBetween(today, d.validUntil) : null, startsInDays: null }
  if (d.validFrom && today < d.validFrom) return { state: 'not_started', daysLeft: d.validUntil ? daysBetween(today, d.validUntil) : null, startsInDays: daysBetween(today, d.validFrom) }
  if (!d.validUntil) return { state: 'no_expiry', daysLeft: null, startsInDays: null }
  const daysLeft = daysBetween(today, d.validUntil)
  if (daysLeft < 0) return { state: 'expired', daysLeft, startsInDays: null }
  if (daysLeft <= warningDays) return { state: 'expiring', daysLeft, startsInDays: null }
  return { state: 'valid', daysLeft, startsInDays: null }
}

// ---------------------------------------------------------------------------
// API shapes

export interface CustomerDocumentFile {
  id: string
  side: CustomerDocumentSide
  versionNo: number
  kind: 'pdf' | 'jpeg' | 'png'
  sizeBytes: number
  pages: number | null
  /** The newest file of its side; older versions stay listed and accessible to authorised users. */
  current: boolean
  uploadedByName: string | null
  createdAt: string
}

export interface CustomerDocument {
  id: string
  customerId: string
  type: CustomerDocumentType
  issuingCountry: string | null
  issuingAuthority: string | null
  title: string | null
  /** Masked: "••••4821", "••••" for short numbers, null when no number is recorded. */
  maskedNumber: string | null
  issuedOn: string | null
  validFrom: string | null
  validUntil: string | null
  licenseCategories: string[]
  licenseFirstIssuedOn: string | null
  entryDate: string | null
  note: string | null
  recordState: 'active' | 'voided'
  voidedReason: CustomerDocumentVoidReason | null
  voidedNote: string | null
  voidedAt: string | null
  voidedByName: string | null
  verification: CustomerDocumentVerification
  verifiedAt: string | null
  verifiedByName: string | null
  renewsId: string | null
  renewedById: string | null
  validity: DocumentValidity
  files: CustomerDocumentFile[]
  version: number
  createdAt: string
  createdByName: string | null
  updatedAt: string
  updatedByName: string | null
}

export interface CustomerDocumentsResponse {
  items: CustomerDocument[]
  today: string
  warningDays: number
  /** False while customer data keys are not configured: numbers and files cannot be written. */
  keysConfigured: boolean
  uploadsEnabled: boolean
}
