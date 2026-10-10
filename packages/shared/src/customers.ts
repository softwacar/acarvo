import { z } from 'zod'

// ---------------------------------------------------------------------------
// Customers (people) — docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md §4, M1.
// One schema validates the web form and the API body. Identity, passport and licence numbers are NOT part of M1.

export const CUSTOMER_RESIDENCIES = ['local', 'foreign'] as const
export type CustomerResidency = (typeof CUSTOMER_RESIDENCIES)[number]

/** Lifecycle. merged / anonymized are reserved for M5 / M6; M1 only uses active and archived. Nothing is ever deleted. */
export const CUSTOMER_STATUSES = ['active', 'archived', 'merged', 'anonymized'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]
export const CUSTOMER_STATUS_FILTERS = ['active', 'archived', 'all'] as const
export type CustomerStatusFilter = (typeof CUSTOMER_STATUS_FILTERS)[number]

export const CONTACT_PREFERENCES = ['phone', 'email', 'whatsapp', 'sms'] as const
export type ContactPreference = (typeof CONTACT_PREFERENCES)[number]

/** ISO 639-1 codes offered as the preferred service language. */
export const CUSTOMER_LANGUAGES = ['bs', 'hr', 'sr', 'tr', 'en', 'de', 'fr', 'it', 'es', 'ar', 'ru', 'sl', 'mk', 'sq', 'nl', 'pl'] as const
export type CustomerLanguage = (typeof CUSTOMER_LANGUAGES)[number]

/** Why a record was archived. A fixed list, so the audit log never holds free text about a person. */
export const CUSTOMER_ARCHIVE_REASONS = ['duplicate', 'inactive', 'customer_request', 'entry_error', 'other'] as const
export type CustomerArchiveReason = (typeof CUSTOMER_ARCHIVE_REASONS)[number]

export const CUSTOMER_SORTS = ['name', 'customerNo', 'created'] as const
export type CustomerSort = (typeof CUSTOMER_SORTS)[number]

export const CUSTOMER_TABS = ['genel', 'belgeler', 'rezervasyonlar', 'kiralamalar', 'cari', 'gorevler', 'gecmis'] as const
export type CustomerTab = (typeof CUSTOMER_TABS)[number]

/** ISO 3166-1 alpha-2. Names come from Intl.DisplayNames in the browser. */
export const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
  'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW'
).split(' ') as readonly string[]

/**
 * Country calling codes used only to complete a phone number typed without one (the company's country).
 * A number typed with "+" or "00" never depends on this list.
 */
export const CALLING_CODES: Record<string, string> = {
  BA: '387', HR: '385', RS: '381', ME: '382', SI: '386', MK: '389', AL: '355', XK: '383', TR: '90', DE: '49', AT: '43', CH: '41', IT: '39',
  FR: '33', ES: '34', PT: '351', NL: '31', BE: '32', LU: '352', GB: '44', IE: '353', DK: '45', SE: '46', NO: '47', FI: '358', PL: '48',
  CZ: '420', SK: '421', HU: '36', RO: '40', BG: '359', GR: '30', CY: '357', MT: '356', US: '1', CA: '1', AE: '971', SA: '966',
}

// ---------------------------------------------------------------------------
// Normalisation (same on both sides: the form previews it, the server stores and matches it)

/**
 * E.164 form of a typed phone number, or null when it cannot be determined.
 * "+…" and "00…" are international; a leading 0 or a bare national number takes the company country's code.
 * Nothing else is guessed: no country code and no known company code means "type it with the country code".
 */
export function normalizePhone(raw: string, defaultCountry?: string | null): string | null {
  const trimmed = raw.trim()
  if (!/^[+0-9\s().\-/]+$/.test(trimmed)) return null
  let digits = trimmed.replace(/[^0-9+]/g, '')
  if (digits.indexOf('+') > 0 || (digits.match(/\+/g)?.length ?? 0) > 1) return null
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('00')) digits = digits.slice(2)
  else {
    const cc = defaultCountry ? CALLING_CODES[defaultCountry] : undefined
    if (!cc) return null
    digits = cc + digits.replace(/^0+/, '')
  }
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null
}

/** Groups an E.164 number for reading: "+387 61 000 101". Display only; never parsed back. */
export function formatPhone(e164: string): string {
  const d = e164.replace(/^\+/, '')
  const cc = Object.values(CALLING_CODES)
    .filter((c) => d.startsWith(c))
    .sort((a, b) => b.length - a.length)[0]
  if (!cc) return e164
  const rest = d.slice(cc.length)
  // Groups of three from the end; a lone leading digit joins the next group ("7700 000 106", "61 000 101").
  const groups: string[] = []
  for (let end = rest.length; end > 0; end -= 3) groups.unshift(rest.slice(Math.max(0, end - 3), end))
  if (groups.length > 1 && groups[0]!.length === 1) groups.splice(0, 2, groups[0]! + groups[1]!)
  return `+${cc} ${groups.join(' ')}`
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Name key for duplicate suggestions: no accents, no case, single spaces ("Ajla Testović" → "ajla testovic"). */
export function normalizeName(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .replace(/[đĐ]/g, 'd')
    .replace(/[ıİ]/g, 'i')
    .replace(/[łŁ]/g, 'l')
    .replace(/[ßẞ]/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export const customerDisplayName = (c: { givenName?: string | null; familyName?: string | null }) => [c.givenName, c.familyName].filter(Boolean).join(' ')

/** "+387 61 ••• •01" style mask for duplicate suggestions. */
export function maskPhone(e164: string | null): string | null {
  if (!e164) return null
  const formatted = formatPhone(e164)
  const visibleTail = 2
  let seen = 0
  const digitsTotal = formatted.replace(/\D/g, '').length
  const ccLength = (formatted.split(' ')[0] ?? '').replace(/\D/g, '').length
  return formatted.replace(/\d/g, (d) => {
    seen++
    return seen <= ccLength + 2 || seen > digitsTotal - visibleTail ? d : '•'
  })
}

/** "aj•••@example.test" style mask for duplicate suggestions. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null
  const [local = '', domain = ''] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(4, local.length - 2)))}@${domain}`
}

// ---------------------------------------------------------------------------
// Schemas

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '') || v === null ? undefined : v
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const optEnum = <T extends readonly [string, ...string[]]>(values: T, msg: string) => z.preprocess(blank, z.enum(values, { error: msg }).optional())
const country = (msg: string) => z.preprocess((v) => (typeof v === 'string' ? blank(v.trim().toUpperCase()) : blank(v)), z.string().refine((c) => COUNTRY_CODES.includes(c), msg).optional())
const today = () => new Date().toISOString().slice(0, 10)

/** Fields of the person record. Messages never repeat what was typed (they end up in API errors). */
export const customerFieldsSchema = z.object({
  givenName: optText(80),
  familyName: optText(80),
  // Required (checked in withRules, so that a missing name, contact and residency are reported together).
  residency: z.preprocess(blank, z.enum(CUSTOMER_RESIDENCIES, { error: 'İkamet durumunu seçin: Yerli veya Yabancı (ikamet)' }).optional()),
  nationality: country('Listeden bir ülke seçin'),
  dateOfBirth: z.preprocess(
    blank,
    z.iso
      .date('Geçerli bir tarih girin')
      .refine((d) => d >= '1900-01-01', 'Geçerli bir doğum tarihi girin')
      .refine((d) => d <= today(), 'Doğum tarihi gelecekte olamaz')
      .optional(),
  ),
  phone: z.preprocess(blank, z.string().trim().max(32, 'Telefon en fazla 32 karakter olabilir').optional()),
  email: z.preprocess(
    (v) => (typeof v === 'string' ? blank(normalizeEmail(v)) : blank(v)),
    z.email('Geçerli bir e-posta adresi girin').max(254, 'E-posta en fazla 254 karakter olabilir').optional(),
  ),
  addressLine1: optText(120),
  addressLine2: optText(120),
  city: optText(80),
  postalCode: optText(20),
  region: optText(80),
  addressCountry: country('Listeden bir ülke seçin'),
  preferredLanguage: optEnum(CUSTOMER_LANGUAGES, 'Listeden bir dil seçin'),
  contactPreference: optEnum(CONTACT_PREFERENCES, 'Listeden bir iletişim tercihi seçin'),
  operationalNote: optText(1000),
})

type RequiredParts = { givenName?: string; familyName?: string; phone?: string; email?: string; residency?: CustomerResidency }
const withRules = <T extends z.ZodType<RequiredParts>>(schema: T) =>
  schema.superRefine((c, ctx) => {
    if (!c.givenName && !c.familyName) ctx.addIssue({ code: 'custom', path: ['givenName'], message: 'Ad veya soyaddan en az birini girin' })
    if (!c.phone && !c.email) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Telefon veya e-postadan en az birini girin' })
    if (!c.residency) ctx.addIssue({ code: 'custom', path: ['residency'], message: 'İkamet durumunu seçin: Yerli veya Yabancı (ikamet)' })
  })

export const customerInputSchema = withRules(customerFieldsSchema)
export type CustomerInput = z.infer<typeof customerFieldsSchema> & { residency: CustomerResidency }

export const customerCreateSchema = withRules(
  customerFieldsSchema.extend({
    createdBranchId: z.preprocess(blank, z.uuid('Şube seçin').optional()),
    /** Set after the user saw the strong duplicate suggestions and chose to create a separate person. */
    duplicateAcknowledged: z.boolean().optional(),
  }),
)
export const customerUpdateSchema = withRules(
  customerFieldsSchema.extend({
    version: z.number().int().min(1),
    duplicateAcknowledged: z.boolean().optional(),
  }),
)

export const customerArchiveSchema = z.object({
  version: z.number().int().min(1),
  reason: z.preprocess(blank, z.enum(CUSTOMER_ARCHIVE_REASONS, { error: 'Arşivleme nedeni seçin' })),
})
export const customerRestoreSchema = z.object({ version: z.number().int().min(1) })

export const CUSTOMER_PAGE_SIZES = [25, 50, 100] as const

/** List query. Sent in a POST body, so names, phone numbers and e-mail addresses never appear in a URL. */
export const customerSearchSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(100, 'Arama en fazla 100 karakter olabilir').optional()),
  residency: optEnum(CUSTOMER_RESIDENCIES, 'Geçersiz filtre'),
  status: z.preprocess(blank, z.enum(CUSTOMER_STATUS_FILTERS).default('active')),
  branchId: z.preprocess(blank, z.uuid().optional()),
  sort: z.preprocess(blank, z.enum(CUSTOMER_SORTS).default('name')),
  dir: z.preprocess(blank, z.enum(['asc', 'desc']).default('asc')),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce
    .number()
    .refine((n) => (CUSTOMER_PAGE_SIZES as readonly number[]).includes(n))
    .default(25),
})
export type CustomerSearch = z.infer<typeof customerSearchSchema>

export const customerDuplicateCheckSchema = z.object({
  givenName: optText(80),
  familyName: optText(80),
  phone: z.preprocess(blank, z.string().trim().max(32).optional()),
  email: z.preprocess((v) => (typeof v === 'string' ? blank(normalizeEmail(v)) : blank(v)), z.string().max(254).optional()),
  dateOfBirth: z.preprocess(blank, z.iso.date().optional()),
  excludeId: z.preprocess(blank, z.uuid().optional()),
})

// ---------------------------------------------------------------------------
// API shapes

export interface CustomerBranchRef {
  id: string
  name: string
  code: string
}

export interface CustomerListItem {
  id: string
  customerNo: string
  displayName: string
  phone: string | null
  email: string | null
  residency: CustomerResidency
  nationality: string | null
  status: CustomerStatus
  createdBranch: CustomerBranchRef | null
  createdAt: string
}

export interface CustomerListResponse {
  items: CustomerListItem[]
  total: number
  page: number
  pageSize: number
}

export interface CustomerDetail {
  id: string
  customerNo: string
  givenName: string | null
  familyName: string | null
  displayName: string
  phone: string | null
  phoneRaw: string | null
  email: string | null
  residency: CustomerResidency
  nationality: string | null
  dateOfBirth: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  postalCode: string | null
  region: string | null
  addressCountry: string | null
  preferredLanguage: CustomerLanguage | null
  contactPreference: ContactPreference | null
  operationalNote: string | null
  status: CustomerStatus
  archivedAt: string | null
  archivedReason: CustomerArchiveReason | null
  archivedByName: string | null
  createdBranch: CustomerBranchRef | null
  version: number
  createdAt: string
  createdByName: string | null
  updatedAt: string
  updatedByName: string | null
}

export type DuplicateReason = 'phone' | 'email' | 'name_dob'

export interface CustomerDuplicateMatch {
  id: string
  customerNo: string
  displayName: string
  maskedPhone: string | null
  maskedEmail: string | null
  status: CustomerStatus
  strength: 'strong' | 'possible'
  reasons: DuplicateReason[]
}

export interface CustomerDuplicateResponse {
  matches: CustomerDuplicateMatch[]
}

export interface CustomerActivityItem {
  id: string
  action: string
  summary: Record<string, unknown> | null
  at: string
  actorName: string | null
}

/** Field names in audit entries. Personal values are not copied into the log, only which fields changed. */
export const CUSTOMER_AUDITED_VALUE_FIELDS = ['residency', 'preferredLanguage', 'contactPreference'] as const
