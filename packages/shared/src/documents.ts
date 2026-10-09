import { z } from 'zod'

// ---------------------------------------------------------------------------
// Vehicle documents (spec §59C, §13.3 tab 6; docs/TEKNIK_UYGULAMA.md §8.4).

export const DOCUMENT_TYPE_CODES = ['registration', 'inspection', 'liability_insurance', 'comprehensive_insurance', 'roadside_assistance', 'other'] as const
export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODES)[number]
export const DOCUMENT_RECORD_STATES = ['draft', 'active', 'voided'] as const
export type DocumentRecordState = (typeof DOCUMENT_RECORD_STATES)[number]

export const MAX_DOCUMENT_PDF_MB = 20
export const MAX_DOCUMENT_IMAGE_MB = 10
export const MAX_DOCUMENT_PDF_PAGES = 50
export const DEFAULT_WARN_DAYS = 30
export const CRITICAL_DAYS = 7

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const optDate = z.preprocess(blank, z.iso.date('Geçerli bir tarih girin').optional())

/** Fields of one document period. Whether it can be active depends on the type and is checked by the server. */
export const documentFieldsSchema = z
  .object({
    documentNumber: optText(60),
    issuer: optText(120),
    issuedOn: optDate,
    validFrom: optDate,
    validUntil: optDate,
    notes: optText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.validFrom && v.validUntil && v.validFrom > v.validUntil) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'Son geçerlilik tarihi başlangıçtan önce olamaz' })
    }
    if (v.issuedOn && v.validUntil && v.issuedOn > v.validUntil) {
      ctx.addIssue({ code: 'custom', path: ['issuedOn'], message: 'Düzenlenme tarihi son geçerlilikten sonra olamaz' })
    }
  })

export const documentCreateSchema = z.intersection(
  documentFieldsSchema,
  z.object({
    typeCode: z.enum(DOCUMENT_TYPE_CODES, { error: 'Belge türü seçin' }),
    state: z.enum(['draft', 'active']).default('active'),
  }),
)
export const documentUpdateSchema = z.intersection(documentFieldsSchema, z.object({ version: z.coerce.number().int().min(1) }))
export const documentRenewSchema = z.intersection(documentFieldsSchema, z.object({ state: z.enum(['draft', 'active']).default('active') }))
export const documentActivateSchema = z.object({ version: z.coerce.number().int().min(1) })
export const documentVoidSchema = z.object({
  version: z.coerce.number().int().min(1),
  reason: z.string({ error: 'Gerekçe girin' }).trim().min(3, 'Gerekçe en az 3 karakter olmalı').max(300, 'En fazla 300 karakter'),
})

// ---------------------------------------------------------------------------
// Status: one pure function, used by the API. The web app only displays the result.

export interface DocumentTypeRule {
  code: DocumentTypeCode
  name: string
  requiresExpiry: boolean
  /** Company decision (Settings). Never assumed from the country. Default false. */
  required: boolean
  warnDays: number
}

export interface DocumentForStatus {
  id: string
  recordState: DocumentRecordState
  validFrom: string | null
  validUntil: string | null
  fileCount: number
}

export type DocumentStatus = 'voided' | 'draft' | 'not_started' | 'expired' | 'expiring' | 'valid'

export interface DocumentStatusResult {
  status: DocumentStatus
  /** Days until the last valid day (0 = today is the last day); null without an end date. */
  daysLeft: number | null
  /** Days until it starts, for not_started. */
  startsInDays: number | null
  critical: boolean
  /** Why a draft cannot be active yet. */
  draftReason: 'missing_expiry' | null
  /** Separate warning; does not change the status. */
  noFile: boolean
}

const DAY = 86_400_000
const toDay = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
export const daysBetween = (from: string, to: string) => Math.round((toDay(to) - toDay(from)) / DAY)
export const addDays = (iso: string, n: number) => new Date(toDay(iso) + n * DAY).toISOString().slice(0, 10)

/** Today's date (YYYY-MM-DD) in a company's time zone. */
export function todayIn(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Status of one document on `today` (company-local date). The end date is inclusive. */
export function documentStatus(doc: DocumentForStatus, rule: DocumentTypeRule, today: string): DocumentStatusResult {
  const base = { daysLeft: null, startsInDays: null, critical: false, draftReason: null, noFile: doc.fileCount === 0 } as const
  if (doc.recordState === 'voided') return { ...base, status: 'voided' }
  if (doc.recordState === 'draft') {
    return { ...base, status: 'draft', draftReason: rule.requiresExpiry && !doc.validUntil ? 'missing_expiry' : null }
  }
  if (doc.validFrom && today < doc.validFrom) return { ...base, status: 'not_started', startsInDays: daysBetween(today, doc.validFrom) }
  if (!doc.validUntil) return { ...base, status: 'valid' }
  const daysLeft = daysBetween(today, doc.validUntil)
  if (daysLeft < 0) return { ...base, status: 'expired', daysLeft, critical: true }
  if (daysLeft <= rule.warnDays) return { ...base, status: 'expiring', daysLeft, critical: daysLeft <= CRITICAL_DAYS }
  return { ...base, status: 'valid', daysLeft }
}

export type TypeSummaryState = 'valid' | 'renewed' | 'expiring' | 'expired' | 'not_started' | 'draft' | 'missing' | 'none'
export type SummaryLevel = 'ok' | 'neutral' | 'warning' | 'critical'

export interface DocumentTypeSummary {
  code: DocumentTypeCode
  state: TypeSummaryState
  level: SummaryLevel
  /** Document covering today, or the record the row describes (latest expired / draft). */
  shownId: string | null
  currentId: string | null
  /** Earliest future period. */
  nextId: string | null
  nextStartsOn: string | null
  daysLeft: number | null
  /** Days without cover between the current period and the next one. */
  gapDays: number | null
  /** No valid document right now although the type is required. */
  uncoveredRequired: boolean
  noFile: boolean
}

/**
 * Row of the Belgeler table for one type. "Current" is decided by dates, never by a stored
 * "replaced" flag: a renewal that starts in the future does not end the period that covers today.
 */
export function documentTypeSummary(rule: DocumentTypeRule, docs: DocumentForStatus[], today: string): DocumentTypeSummary {
  const active = docs.filter((d) => d.recordState === 'active')
  const covers = (d: DocumentForStatus) => (!d.validFrom || d.validFrom <= today) && (!d.validUntil || today <= d.validUntil)
  const end = (d: DocumentForStatus) => d.validUntil ?? '9999-12-31'
  const current = active
    .filter(covers)
    .sort((a, b) => end(b).localeCompare(end(a)) || (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0]
  const next = active.filter((d) => d.validFrom && d.validFrom > today).sort((a, b) => a.validFrom!.localeCompare(b.validFrom!))[0]
  const base: DocumentTypeSummary = {
    code: rule.code,
    state: 'none',
    level: 'neutral',
    shownId: null,
    currentId: current?.id ?? null,
    nextId: next?.id ?? null,
    nextStartsOn: next?.validFrom ?? null,
    daysLeft: null,
    gapDays: null,
    uncoveredRequired: false,
    noFile: false,
  }

  if (current) {
    const s = documentStatus(current, rule, today)
    const out = { ...base, shownId: current.id, daysLeft: s.daysLeft, noFile: s.noFile }
    if (s.status === 'expiring') {
      if (next && current.validUntil && next.validFrom! <= addDays(current.validUntil, 1)) return { ...out, state: 'renewed', level: 'ok' }
      const gapDays = next && current.validUntil ? daysBetween(current.validUntil, next.validFrom!) - 1 : null
      return { ...out, state: 'expiring', level: s.critical ? 'critical' : 'warning', gapDays }
    }
    return { ...out, state: 'valid', level: 'ok' }
  }

  if (next) {
    return { ...base, shownId: next.id, state: 'not_started', level: rule.required ? 'critical' : 'neutral', uncoveredRequired: rule.required, noFile: next.fileCount === 0 }
  }
  const expired = active.filter((d) => d.validUntil && d.validUntil < today).sort((a, b) => b.validUntil!.localeCompare(a.validUntil!))[0]
  if (expired) {
    return {
      ...base,
      shownId: expired.id,
      state: 'expired',
      level: 'critical',
      daysLeft: daysBetween(today, expired.validUntil!),
      uncoveredRequired: rule.required,
      noFile: expired.fileCount === 0,
    }
  }
  const draft = docs.filter((d) => d.recordState === 'draft')[0]
  if (draft) return { ...base, shownId: draft.id, state: 'draft', level: rule.required ? 'critical' : 'neutral', uncoveredRequired: rule.required, noFile: draft.fileCount === 0 }
  return rule.required ? { ...base, state: 'missing', level: 'critical', uncoveredRequired: true } : base
}

export interface VehicleDocumentsOverview {
  critical: number
  warning: number
  ok: number
  /** Most urgent row, for the facts strip. */
  headline: DocumentTypeSummary | null
}

export function vehicleDocumentsOverview(rows: DocumentTypeSummary[]): VehicleDocumentsOverview {
  const rank: Record<SummaryLevel, number> = { critical: 3, warning: 2, ok: 1, neutral: 0 }
  const sorted = [...rows].sort((a, b) => rank[b.level] - rank[a.level] || (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999))
  return {
    critical: rows.filter((r) => r.level === 'critical').length,
    warning: rows.filter((r) => r.level === 'warning').length,
    ok: rows.filter((r) => r.level === 'ok').length,
    headline: sorted[0] && sorted[0].level !== 'neutral' ? sorted[0] : null,
  }
}

// ---------------------------------------------------------------------------
// API shapes

export interface DocumentFileVersion {
  id: string
  versionNo: number
  mimeType: string
  sizeBytes: number
  pageCount: number | null
  displayName: string
  uploadedByName: string | null
  createdAt: string
  url: string
  downloadUrl: string
}

export interface VehicleDocument {
  id: string
  typeCode: DocumentTypeCode
  documentNumber: string | null
  issuer: string | null
  issuedOn: string | null
  validFrom: string | null
  validUntil: string | null
  notes: string | null
  recordState: DocumentRecordState
  renewsId: string | null
  renewedById: string | null
  voidedReason: string | null
  voidedAt: string | null
  voidedByName: string | null
  lockedAt: string | null
  version: number
  createdAt: string
  createdByName: string | null
  updatedAt: string
  fileCount: number
  latestFile: DocumentFileVersion | null
  status: DocumentStatusResult
}

export interface VehicleDocumentsResponse {
  today: string
  types: (DocumentTypeRule & { summary: DocumentTypeSummary })[]
  documents: VehicleDocument[]
  overview: VehicleDocumentsOverview
  upload: { enabled: boolean; scanner: string; reason: string | null }
}

export interface VehicleDocumentDetail extends VehicleDocument {
  files: DocumentFileVersion[]
  /** Earlier and later periods linked through renewals, oldest first (includes this one). */
  chain: { id: string; validFrom: string | null; validUntil: string | null; recordState: DocumentRecordState; status: DocumentStatus }[]
}
