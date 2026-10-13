import { z } from 'zod'

// ---------------------------------------------------------------------------
// Contracts V1 — docs/FIYATLANDIRMA_SOZLESME_PLANI.md (spec §59J, §83.1–83.4, §85.3). Templates are plain text with
// an allow-list of {{fields}}; no HTML, no external resources. A contract keeps an immutable snapshot of what it was
// made from. ACARVO has no e-signature: there is no "signed" state, only a staff statement about an external process.

export const TEMPLATE_FIELDS = {
  'company.name': 'Kiralayan şirket',
  'branch.pickup': 'Başlangıç şubesi',
  'branch.return': 'Planlanan iade şubesi',
  'contract.no': 'Sözleşme numarası',
  'contract.date': 'Sözleşme taslağı tarihi',
  'contract.revision': 'Sözleşme sürümü',
  'template.version': 'Şablon sürümü',
  'rental.no': 'Kiralama numarası',
  'reservation.no': 'Rezervasyon numarası',
  'renter.name': 'Kiracı (müşteri)',
  'renter.no': 'Müşteri numarası',
  'corporate.name': 'Kurumsal hesap',
  'corporate.no': 'Kurumsal hesap numarası',
  'driver.primary': 'Ana sürücü',
  'drivers.additional': 'Ek sürücüler',
  'vehicle.plate': 'Plaka',
  'vehicle.make_model': 'Marka / model',
  'vehicle.class': 'Araç sınıfı',
  'period.pickup': 'Planlanan alış',
  'period.return': 'Planlanan iade',
  'price.table': 'Fiyat kalemleri (teklif)',
  'price.total': 'Toplam (teklif)',
  'price.currency': 'Para birimi',
} as const
export type TemplateField = keyof typeof TEMPLATE_FIELDS

/** §85.3: a rental contract cannot be issued from a template without these. */
export const REQUIRED_TEMPLATE_FIELDS: TemplateField[] = ['contract.no', 'renter.name', 'vehicle.plate', 'period.pickup', 'period.return', 'price.table']

export const TEMPLATE_LANGUAGES = ['tr', 'bs', 'en', 'de', 'hr', 'sr'] as const
export type TemplateLanguage = (typeof TEMPLATE_LANGUAGES)[number]
export const TEMPLATE_MAX_LENGTH = 20_000

const FIELD_RE = /\{\{\s*([a-z_.]+)\s*\}\}/g

/** Placeholders used in a body; unknown ones and missing required ones are reported (never printed literally). */
export function checkTemplateBody(body: string) {
  const used = new Set<string>()
  for (const m of body.matchAll(FIELD_RE)) used.add(m[1]!)
  const unknown = [...used].filter((f) => !(f in TEMPLATE_FIELDS))
  const missingRequired = REQUIRED_TEMPLATE_FIELDS.filter((f) => !used.has(f))
  // A stray "{{" that is not a well-formed placeholder is refused too: it would print literally.
  const stray = body.replace(FIELD_RE, '').includes('{{') || body.replace(FIELD_RE, '').includes('}}')
  return { used: [...used] as TemplateField[], unknown, missingRequired, stray }
}

/** Renders a template with plain-text values. Values are text, never markup: nothing is interpreted. */
export function renderTemplate(body: string, values: Partial<Record<TemplateField, string>>) {
  return body.replace(FIELD_RE, (_, f: string) => (f in TEMPLATE_FIELDS ? (values[f as TemplateField] ?? '—') : '—'))
}

export const CONTRACT_STATUSES = ['draft', 'under_review', 'externally_processed', 'archived', 'superseded'] as const
export type ContractStatus = (typeof CONTRACT_STATUSES)[number]

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, 'Şablon adını girin').max(80),
  language: z.enum(TEMPLATE_LANGUAGES, { error: 'Belge dilini seçin' }),
  country: z.preprocess(blank, z.string().regex(/^[A-Z]{2}$/).nullable().optional()),
  /** Start from the clearly marked sample (ÖRNEK — hukuki onay gerektirir) or from an empty body. */
  fromSample: z.boolean().default(false),
})
export const templateVersionSaveSchema = z.object({
  version: z.number().int().min(1),
  body: z.string().max(TEMPLATE_MAX_LENGTH, `En fazla ${TEMPLATE_MAX_LENGTH} karakter`),
})
export const templateActivateSchema = z.object({ version: z.number().int().min(1) })

export const contractCreateSchema = z.object({
  templateVersionId: z.uuid('Şablon seçin'),
  requestId: z.uuid(),
})
export const contractTransitionSchema = z.object({ version: z.number().int().min(1), requestId: z.uuid() })
export const contractExternalSchema = contractTransitionSchema.extend({
  /** F7: staff statement that the contract was signed / processed in the external process. Not an e-signature. */
  externalAck: z.literal(true, { error: 'Beyanı onaylayın' }),
  externalReference: z
    .string()
    .trim()
    .min(3, 'Dış referans en az 3 karakter')
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/, 'Yalnız harf, rakam, boşluk ve . / _ - kullanın (ad veya kimlik numarası yazmayın)'),
})
export const contractArchiveSchema = contractTransitionSchema.extend({
  reason: z.preprocess(blank, z.enum(['entry_error', 'replaced_outside', 'rental_cancelled', 'other'], { error: 'Arşivleme nedenini seçin' })),
})

// ---------------------------------------------------------------------------
// API shapes

export interface ContractTemplateVersion {
  id: string
  versionNo: number
  status: 'draft' | 'active' | 'retired'
  body: string
  usedFields: string[]
  createdByName: string | null
  createdAt: string
  activatedAt: string | null
  version: number
}
export interface ContractTemplate {
  id: string
  name: string
  language: TemplateLanguage
  country: string | null
  isSample: boolean
  versions: ContractTemplateVersion[]
}

export interface ContractSnapshot {
  company: { name: string }
  rental: { no: string }
  reservation: { no: string } | null
  renter: { name: string; no: string }
  corporate: { name: string; no: string } | null
  drivers: { name: string; no: string; primary: boolean }[]
  vehicle: { plate: string; make: string; model: string; className: string }
  pickup: { local: string; timeZone: string; branch: string }
  return: { local: string; timeZone: string; branch: string }
  quote: null | { no: string; currency: string; lines: { label: string; amountMinor: number }[]; netMinor: number; taxMinor: number | null; grossMinor: number | null; taxStatus: string }
  template: { name: string; language: string; versionNo: number }
  renderedText: string
}

export interface ContractEvent {
  id: string
  kind: string
  fromStatus: ContractStatus | null
  toStatus: ContractStatus | null
  data: Record<string, unknown> | null
  actorName: string | null
  at: string
}

export interface ContractDetail {
  id: string
  contractNo: string
  revision: number
  status: ContractStatus
  rental: { id: string; no: string }
  quote: { id: string; no: string } | null
  template: { id: string; name: string; versionNo: number }
  snapshot: ContractSnapshot
  externalReference: string | null
  externalAckAt: string | null
  externalAckByName: string | null
  pdf: { available: boolean; sizeBytes: number | null; sha256: string | null }
  canDownload: boolean
  createdAt: string
  createdByName: string | null
  events: ContractEvent[]
  version: number
}
