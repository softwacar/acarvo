import { z } from 'zod'
import { COUNTRY_CODES, CUSTOMER_LANGUAGES, type CustomerLanguage, type CustomerStatus, normalizeEmail } from './customers'

// ---------------------------------------------------------------------------
// Corporate accounts (M3) — docs/M3_KURUMSAL_HESAPLAR_PLANI.md. A corporate account is the commercial party; people
// stay in `customers` and are linked with roles. No credit limit, balance or risk here (Finance module).

/** D1: active / archived only; suspension is defined with reservations and rentals later. */
export const CORPORATE_STATUSES = ['active', 'archived'] as const
export type CorporateStatus = (typeof CORPORATE_STATUSES)[number]
export const CORPORATE_STATUS_FILTERS = ['active', 'archived', 'all'] as const
export type CorporateStatusFilter = (typeof CORPORATE_STATUS_FILTERS)[number]

/** D12: fixed lists, so the audit log never holds free text. */
export const CORPORATE_ARCHIVE_REASONS = ['inactive', 'duplicate', 'customer_request', 'entry_error', 'other'] as const
export type CorporateArchiveReason = (typeof CORPORATE_ARCHIVE_REASONS)[number]
export const CORPORATE_RESTORE_REASONS = ['reactivated', 'archived_by_mistake', 'other'] as const
export type CorporateRestoreReason = (typeof CORPORATE_RESTORE_REASONS)[number]

export const CORPORATE_SORTS = ['name', 'accountNo', 'created'] as const
export type CorporateSort = (typeof CORPORATE_SORTS)[number]
export const CORPORATE_PAGE_SIZES = [25, 50, 100] as const

export const CORPORATE_TABS = ['genel', 'adresler', 'vergi', 'kisiler', 'suruculer', 'gecmis', 'rezervasyonlar', 'kiralamalar', 'cari'] as const
export type CorporateTab = (typeof CORPORATE_TABS)[number]

/** D6 */
export const CHANNEL_KINDS = ['phone', 'email', 'website', 'other'] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

/** D5: suggestions only; any short upper-case code is accepted (no country's tax structure is assumed). */
export const TAX_SCHEME_SUGGESTIONS = ['VAT', 'PDV', 'JIB', 'PIB', 'OIB', 'VKN', 'TCKN', 'EIN', 'UID', 'USTID', 'SIRET', 'OTHER'] as const

/** D3: what staff checked, never a legal verdict. */
export const TAX_VALIDITIES = ['not_checked', 'checked_by_staff', 'no_longer_used'] as const
export type TaxValidity = (typeof TAX_VALIDITIES)[number]

/** D7 */
export const ADDRESS_KINDS = ['registered', 'billing', 'postal', 'other'] as const
export type AddressKind = (typeof ADDRESS_KINDS)[number]

/** D8 */
export const PERSON_ROLES = ['representative', 'contact', 'booker', 'authorized_driver', 'billing_contact', 'other'] as const
export type PersonRole = (typeof PERSON_ROLES)[number]
export const PERSON_END_REASONS = ['left_company', 'role_ended', 'entry_error', 'other'] as const
export type PersonEndReason = (typeof PERSON_END_REASONS)[number]

// ---------------------------------------------------------------------------
// Normalisation

/** Tax / registration key: upper case, no spaces, dots, dashes or slashes ("ba 4200-123.456" → "BA4200123456"). */
export const normalizeTaxValue = (v: string) => v.toUpperCase().replace(/[\s.\-/_]/g, '')

/** Website key: lower case, no scheme, no "www.", no trailing slash. */
export const normalizeWebsite = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')

export type TaxIdWarning = 'short' | 'unusual_characters' | 'prefix_mismatch'

/**
 * D4: hints only, never a verdict. No country's legal format is encoded: a very short value, characters other than
 * letters and digits, or a VAT value whose two-letter prefix differs from the given country (Greece uses "EL").
 */
export function taxIdWarnings(country: string, scheme: string, value: string): TaxIdWarning[] {
  const n = normalizeTaxValue(value)
  const out: TaxIdWarning[] = []
  if (n.length < 5) out.push('short')
  if (!/^[A-Z0-9]+$/.test(n)) out.push('unusual_characters')
  // Two leading letters followed by a value that contains digits ("ATU12345678", "DE123456789").
  const prefix = /^([A-Z]{2})(?=[A-Z0-9]*\d)/.exec(n)?.[1]
  if (scheme === 'VAT' && prefix && prefix !== country && !(country === 'GR' && prefix === 'EL')) out.push('prefix_mismatch')
  return out
}

// ---------------------------------------------------------------------------
// Schemas (messages never repeat what was typed)

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
const reqText = (max: number, msg: string) => z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string({ error: msg }).min(1, msg).max(max, `En fazla ${max} karakter`))
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const upperCountry = (v: unknown) => (typeof v === 'string' ? blank(v.trim().toUpperCase()) : blank(v))
const reqCountry = (msg: string) => z.preprocess(upperCountry, z.string({ error: msg }).refine((c) => COUNTRY_CODES.includes(c), msg))
const optCountry = (msg: string) => z.preprocess(upperCountry, z.string().refine((c) => COUNTRY_CODES.includes(c), msg).optional())
const optDate = z.preprocess(blank, z.iso.date('Geçerli bir tarih girin').optional())
const version = z.number().int().min(1)

export const corporateFieldsSchema = z.object({
  legalName: reqText(200, 'Resmi unvanı girin'),
  tradeName: optText(120),
  country: reqCountry('Ülke seçin'),
  registrationNumber: optText(60),
  registrationAuthority: optText(120),
  preferredLanguage: z.preprocess(blank, z.enum(CUSTOMER_LANGUAGES, { error: 'Listeden bir dil seçin' }).optional()),
  note: optText(1000),
})
export type CorporateInput = z.infer<typeof corporateFieldsSchema>

const channelBase = z.object({
  kind: z.enum(CHANNEL_KINDS, { error: 'Kanal türü seçin' }),
  value: reqText(254, 'Değeri girin'),
  label: optText(60),
  isPrimary: z.boolean().optional(),
})
const channelRules = <T extends z.ZodType<{ kind: ChannelKind; value: string }>>(s: T) =>
  s.superRefine((c, ctx) => {
    if (c.kind === 'email' && !z.email().safeParse(normalizeEmail(c.value)).success) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Geçerli bir e-posta adresi girin' })
    if (c.kind === 'website' && !/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/.test(normalizeWebsite(c.value))) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Geçerli bir web adresi girin, örneğin ornek.ba' })
    if (c.kind === 'phone' && !/^[+0-9\s().\-/]{5,32}$/.test(c.value)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Telefon numarasını ülke koduyla girin, örneğin +387 33 123 456' })
  })
export const channelInputSchema = channelRules(channelBase)
export const channelUpdateSchema = channelRules(channelBase.extend({ version }))
export type ChannelInput = z.infer<typeof channelInputSchema>

const taxBase = z.object({
  country: reqCountry('Ülke seçin'),
  scheme: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.string({ error: 'Vergi kimliği türünü girin' }).regex(/^[A-Z0-9_]{2,16}$/, 'Tür 2–16 harf veya rakam olmalı, örneğin VAT')),
  value: reqText(64, 'Vergi kimliğini girin').refine((v) => normalizeTaxValue(v).length >= 1, 'Vergi kimliğini girin'),
  validity: z.preprocess(blank, z.enum(TAX_VALIDITIES).default('not_checked')),
  note: optText(300),
  isPrimary: z.boolean().optional(),
})
export const taxIdInputSchema = taxBase
export const taxIdUpdateSchema = taxBase.extend({ version })
export type TaxIdInput = z.infer<typeof taxIdInputSchema>

const addressBase = z.object({
  kind: z.enum(ADDRESS_KINDS, { error: 'Adres türü seçin' }),
  label: optText(60),
  line1: reqText(160, 'Açık adresi girin'),
  line2: optText(160),
  city: reqText(80, 'Şehri girin'),
  region: optText(80),
  postalCode: optText(20),
  country: reqCountry('Ülke seçin'),
  isPrimary: z.boolean().optional(),
})
export const addressInputSchema = addressBase
export const addressUpdateSchema = addressBase.extend({ version })
export type AddressInput = z.infer<typeof addressInputSchema>

export const corporateCreateSchema = corporateFieldsSchema.extend({
  createdBranchId: z.preprocess(blank, z.uuid('Şube seçin').optional()),
  channels: z.array(channelInputSchema).max(6, 'En fazla 6 iletişim kanalı').optional(),
  address: addressInputSchema.optional(),
  taxId: taxIdInputSchema.optional(),
  /** Set after the user saw the strong duplicate suggestions and chose to create a separate account. */
  duplicateAcknowledged: z.boolean().optional(),
})
export const corporateUpdateSchema = corporateFieldsSchema.extend({ version, duplicateAcknowledged: z.boolean().optional() })
export const corporateArchiveSchema = z.object({ version, reason: z.preprocess(blank, z.enum(CORPORATE_ARCHIVE_REASONS, { error: 'Arşivleme nedeni seçin' })) })
export const corporateRestoreSchema = z.object({ version, reason: z.preprocess(blank, z.enum(CORPORATE_RESTORE_REASONS, { error: 'Geri alma nedeni seçin' })) })
export const subRecordRemoveSchema = z.object({ version })

/** List query, sent in a POST body: names, tax ids, e-mail addresses and phone numbers never appear in a URL. */
export const corporateSearchSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100, 'Arama en fazla 100 karakter olabilir').optional()),
  country: optCountry('Geçersiz filtre'),
  status: z.preprocess(blank, z.enum(CORPORATE_STATUS_FILTERS).default('active')),
  people: z.preprocess(blank, z.enum(['with_drivers', 'without_people']).optional()),
  sort: z.preprocess(blank, z.enum(CORPORATE_SORTS).default('name')),
  dir: z.preprocess(blank, z.enum(['asc', 'desc']).default('asc')),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (CORPORATE_PAGE_SIZES as readonly number[]).includes(n))
    .default(25),
})
export type CorporateSearch = z.infer<typeof corporateSearchSchema>

export const corporateDuplicateCheckSchema = z.object({
  legalName: optText(200),
  country: optCountry('Geçersiz ülke'),
  registrationNumber: optText(60),
  taxCountry: optCountry('Geçersiz ülke'),
  taxScheme: z.preprocess((v) => (typeof v === 'string' ? blank(v.trim().toUpperCase()) : blank(v)), z.string().max(16).optional()),
  taxValue: optText(64),
  email: z.preprocess((v) => (typeof v === 'string' ? blank(normalizeEmail(v)) : blank(v)), z.string().max(254).optional()),
  phone: z.preprocess(blank, z.string().trim().max(32).optional()),
  excludeId: z.preprocess(blank, z.uuid().optional()),
})

const rolesSchema = z
  .array(z.enum(PERSON_ROLES, { error: 'Geçersiz rol' }), { error: 'En az bir rol seçin' })
  .min(1, 'En az bir rol seçin')
  .max(PERSON_ROLES.length)
  .refine((r) => new Set(r).size === r.length, 'Bir rol yalnız bir kez seçilebilir')
const personFields = z.object({
  roles: rolesSchema,
  jobTitle: optText(80),
  note: optText(300),
  validFrom: optDate,
  validUntil: optDate,
})
const periodRule = <T extends z.ZodType<{ validFrom?: string; validUntil?: string }>>(s: T) =>
  s.superRefine((p, ctx) => {
    if (p.validFrom && p.validUntil && p.validUntil < p.validFrom) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Bitiş, başlangıçtan önce olamaz' })
  })
export const personLinkSchema = periodRule(personFields.extend({ customerId: z.uuid('Kişi seçin') }))
export const personUpdateSchema = periodRule(personFields.extend({ version }))
export const personEndSchema = z.object({ version, reason: z.preprocess(blank, z.enum(PERSON_END_REASONS, { error: 'Sona erdirme nedeni seçin' })) })

// ---------------------------------------------------------------------------
// API shapes

export interface CorporateBranchRef {
  id: string
  name: string
  code: string
}

export interface CorporateChannel {
  id: string
  kind: ChannelKind
  /** Phone numbers in display form; e-mail and website as stored. */
  value: string
  label: string | null
  isPrimary: boolean
  version: number
}

export interface CorporateTaxId {
  id: string
  country: string
  scheme: string
  value: string
  validity: TaxValidity
  note: string | null
  isPrimary: boolean
  warnings: TaxIdWarning[]
  version: number
}

export interface CorporateAddress {
  id: string
  kind: AddressKind
  label: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postalCode: string | null
  country: string
  isPrimary: boolean
  version: number
}

export interface CorporateListItem {
  id: string
  accountNo: string
  legalName: string
  tradeName: string | null
  country: string
  status: CorporateStatus
  primaryTaxId: { country: string; scheme: string; value: string } | null
  primaryContact: { kind: ChannelKind; value: string } | null
  peopleCount: number
  driverCount: number
  createdAt: string
}

export interface CorporateListResponse {
  items: CorporateListItem[]
  total: number
  page: number
  pageSize: number
}

export interface CorporateDetail {
  id: string
  accountNo: string
  legalName: string
  tradeName: string | null
  country: string
  registrationNumber: string | null
  registrationAuthority: string | null
  preferredLanguage: CustomerLanguage | null
  note: string | null
  status: CorporateStatus
  archivedAt: string | null
  archivedReason: CorporateArchiveReason | null
  archivedByName: string | null
  createdBranch: CorporateBranchRef | null
  channels: CorporateChannel[]
  taxIds: CorporateTaxId[]
  addresses: CorporateAddress[]
  peopleCount: number
  driverCount: number
  version: number
  createdAt: string
  createdByName: string | null
  updatedAt: string
  updatedByName: string | null
}

export type CorporateDuplicateReason = 'tax_id' | 'email' | 'phone' | 'name' | 'registration'

export interface CorporateDuplicateMatch {
  id: string
  accountNo: string
  legalName: string
  country: string
  status: CorporateStatus
  strength: 'strong' | 'possible'
  reasons: CorporateDuplicateReason[]
}

/** Licence summary of an authorised driver (D11): dates and state only, and only with the document read permission. */
export interface DriverLicenceSummary {
  state: 'valid' | 'expiring' | 'expired' | 'missing'
  validUntil: string | null
}

export interface CorporatePerson {
  id: string
  customer: { id: string; customerNo: string; displayName: string; status: CustomerStatus; phone: string | null; email: string | null }
  roles: PersonRole[]
  jobTitle: string | null
  note: string | null
  validFrom: string | null
  validUntil: string | null
  active: boolean
  endedAt: string | null
  endedReason: PersonEndReason | null
  endedByName: string | null
  version: number
  createdAt: string
  createdByName: string | null
  /** null when the viewer may not read customer documents, or the person is not an authorised driver. */
  licence: DriverLicenceSummary | null
}

export interface CorporatePeopleResponse {
  items: CorporatePerson[]
  /** Whether licence summaries were included (the viewer may read customer documents). */
  licenceShown: boolean
}

export interface CustomerCorporateLink {
  id: string
  account: { id: string; accountNo: string; legalName: string; status: CorporateStatus }
  roles: PersonRole[]
  jobTitle: string | null
  validFrom: string | null
  validUntil: string | null
  active: boolean
  endedAt: string | null
}

export interface CorporateActivityItem {
  id: string
  action: string
  summary: Record<string, unknown> | null
  at: string
  actorName: string | null
}

/** Fields whose old and new values may be written to the audit log (company facts, not personal data). */
export const CORPORATE_AUDITED_VALUE_FIELDS = ['country', 'preferredLanguage'] as const
