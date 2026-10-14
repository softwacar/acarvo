import { z } from 'zod'
import { isCurrency } from './money'

// ---------------------------------------------------------------------------
// Finance V1 — docs/FINANS_YONETIMI_V1_PLANI.md (spec §59BE, §64, §67, §78.3, §85.6). Internal operating records:
// nothing here moves money, takes card data or issues an invoice. Amounts travel as decimal text and are parsed
// exactly on the server in the currency's minor unit; totals are always per currency.

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'external_pos', 'other_external'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export const DEPOSIT_METHODS = ['cash', 'bank_transfer', 'external_pos', 'external_card_hold', 'other_external'] as const
export type DepositMethod = (typeof DEPOSIT_METHODS)[number]
export const CHARGE_STATUSES = ['pending', 'posted', 'rejected', 'reversal_requested', 'reversed'] as const
export type ChargeStatus = (typeof CHARGE_STATUSES)[number]
export const PAYMENT_STATUSES = ['recorded', 'verified', 'rejected', 'reversed'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]
export const DEPOSIT_STATUSES = ['requested', 'reported', 'verified', 'rejected', 'cancelled'] as const
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number]
export const REFUND_STATUSES = ['requested', 'approved', 'completed', 'rejected', 'cancelled', 'reversed'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]
export const FINANCE_FILE_STATUSES = ['open', 'closed', 'reopened'] as const
export type FinanceFileStatus = (typeof FINANCE_FILE_STATUSES)[number]

const blank = (v: unknown) => ((typeof v === 'string' && v.trim() === '') || v === null ? undefined : v)
/** Amount as typed ("1234,50"); parsed exactly against the record's currency on the server. */
const amount = z.string({ error: 'Tutar girin' }).trim().min(1, 'Tutar girin').max(20)
const reference = z
  .string()
  .trim()
  .min(3, 'Referans en az 3 karakter')
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ./_-]*$/, 'Yalnız harf, rakam, boşluk ve . / _ - kullanın (kart numarası veya kişisel bilgi yazmayın)')
const optReference = z.preprocess(blank, reference.optional())
const reason = (msg: string) => z.string({ error: msg }).trim().min(3, msg).max(300, 'En fazla 300 karakter')
const note = z.preprocess(blank, z.string().trim().max(300, 'En fazla 300 karakter').optional())
const request = { requestId: z.uuid() }
const versioned = { version: z.number().int().min(1), requestId: z.uuid() }

/** Card numbers must never reach ACARVO: a reference that looks like one is refused everywhere. */
export function looksLikeCardNumber(text: string) {
  const digits = text.replace(/[\s.-]/g, '')
  if (!/^\d{12,19}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}
const noCard = (v: string | undefined) => !v || !looksLikeCardNumber(v)
const NO_CARD = 'Kart numarası girilemez. Yalnız POS fişindeki işlem/onay referansını yazın.'

export const financeOpenSchema = z.object({
  currency: z.string().trim().toUpperCase().refine(isCurrency, 'Geçerli bir ISO 4217 para birimi seçin'),
  responsibleType: z.enum(['customer', 'corporate'], { error: 'Ödeme sorumlusunu seçin' }),
  ...request,
})

export const chargeCreateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('quote'), quoteId: z.uuid(), ...request }),
  z.object({
    kind: z.literal('manual'),
    description: z.string().trim().min(3, 'Açıklama girin').max(160),
    amount,
    reason: reason('Gerekçe girin'),
    ...request,
  }),
])

export const paymentCreateSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS, { error: 'Yöntemi seçin' }),
    amount,
    payerType: z.enum(['customer', 'corporate', 'other'], { error: 'Ödeyeni seçin' }),
    payerCustomerId: z.preprocess(blank, z.uuid().optional()),
    payerCorporateId: z.preprocess(blank, z.uuid().optional()),
    payerName: z.preprocess(blank, z.string().trim().min(2, 'Ödeyenin adını girin').max(80).optional()),
    externalReference: optReference,
    /** Staff statement for cash: "I received this cash myself". */
    cashAck: z.boolean().default(false),
    receivedAt: z.preprocess(blank, z.iso.datetime({ offset: true }).optional()),
    note,
    ...request,
  })
  .refine((p) => p.method !== 'cash' || p.cashAck, { message: 'Nakdi teslim aldığınızı onaylayın', path: ['cashAck'] })
  .refine((p) => !['bank_transfer', 'external_pos'].includes(p.method) || !!p.externalReference, { message: 'Harici işlem referansını girin', path: ['externalReference'] })
  .refine((p) => noCard(p.externalReference), { message: NO_CARD, path: ['externalReference'] })
  .refine((p) => p.payerType !== 'other' || !!p.payerName, { message: 'Ödeyenin adını girin', path: ['payerName'] })

export const depositCreateSchema = z
  .object({
    currency: z.string().trim().toUpperCase().refine(isCurrency, 'Geçerli bir ISO 4217 para birimi seçin'),
    amount,
    /** Only "requested" (expected) or already received and reported now. */
    received: z.boolean(),
    method: z.preprocess(blank, z.enum(DEPOSIT_METHODS).optional()),
    externalReference: optReference,
    cashAck: z.boolean().default(false),
    note,
    ...request,
  })
  .refine((p) => !p.received || !!p.method, { message: 'Yöntemi seçin', path: ['method'] })
  .refine((p) => !p.received || p.method !== 'cash' || p.cashAck, { message: 'Nakdi teslim aldığınızı onaylayın', path: ['cashAck'] })
  .refine((p) => !p.received || !['bank_transfer', 'external_pos', 'external_card_hold'].includes(p.method ?? '') || !!p.externalReference, { message: 'Harici işlem referansını girin', path: ['externalReference'] })
  .refine((p) => noCard(p.externalReference), { message: NO_CARD, path: ['externalReference'] })

export const depositReportSchema = z
  .object({ ...versioned, method: z.enum(DEPOSIT_METHODS, { error: 'Yöntemi seçin' }), externalReference: optReference, cashAck: z.boolean().default(false) })
  .refine((p) => p.method !== 'cash' || p.cashAck, { message: 'Nakdi teslim aldığınızı onaylayın', path: ['cashAck'] })
  .refine((p) => !['bank_transfer', 'external_pos', 'external_card_hold'].includes(p.method) || !!p.externalReference, { message: 'Harici işlem referansını girin', path: ['externalReference'] })
  .refine((p) => noCard(p.externalReference), { message: NO_CARD, path: ['externalReference'] })
export const depositReviewSchema = z.object({ ...versioned, inReview: z.boolean(), reason: z.preprocess(blank, reason('İnceleme nedenini girin').optional()) }).refine((p) => !p.inReview || !!p.reason, { message: 'İnceleme nedenini girin', path: ['reason'] })

export const refundCreateSchema = z.object({ amount, method: z.enum(PAYMENT_METHODS, { error: 'İade yöntemini seçin' }), reason: reason('İade gerekçesini girin'), ...request })
export const refundCompleteSchema = z
  .object({ ...versioned, externalReference: optReference, cashAck: z.boolean().default(false), method: z.enum(PAYMENT_METHODS) })
  .refine((p) => p.method !== 'cash' || p.cashAck, { message: 'Nakdi iade ettiğinizi onaylayın', path: ['cashAck'] })
  .refine((p) => p.method === 'cash' || !!p.externalReference, { message: 'Harici iade referansını girin', path: ['externalReference'] })
  .refine((p) => noCard(p.externalReference), { message: NO_CARD, path: ['externalReference'] })

export const financeTransitionSchema = z.object(versioned)
export const financeReasonSchema = z.object({ ...versioned, reason: reason('Gerekçe girin') })
export const financeNoteSchema = z.object({ ...versioned, note: z.preprocess(blank, z.string().trim().max(300).optional()) })

export const financeListSchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(60).optional()),
  status: z.preprocess(blank, z.string().max(30).optional()),
  method: z.preprocess(blank, z.string().max(30).optional()),
  currency: z.preprocess(blank, z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional()),
  branchId: z.preprocess(blank, z.uuid().optional()),
  from: z.preprocess(blank, z.iso.date().optional()),
  to: z.preprocess(blank, z.iso.date().optional()),
  sort: z.enum(['newest', 'oldest', 'amount_desc', 'amount_asc']).default('newest'),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
})
export type FinanceListQuery = z.infer<typeof financeListSchema>

// ---------------------------------------------------------------------------
// API shapes

export interface FinanceActor {
  name: string | null
  at: string | null
}
export interface FinanceCharge {
  id: string
  chargeNo: string
  kind: 'quote' | 'manual'
  quote: { id: string; no: string } | null
  description: string
  currency: string
  amountMinor: number
  netMinor: number
  taxMinor: number | null
  taxStatus: 'complete' | 'not_configured'
  status: ChargeStatus
  reason: string | null
  reviewNote: string | null
  created: FinanceActor
  approved: FinanceActor
  reversalReason: string | null
  reversalRequested: FinanceActor
  reversed: FinanceActor
  version: number
}
export interface FinancePayment {
  id: string
  paymentNo: string
  method: PaymentMethod
  currency: string
  amountMinor: number
  payer: { type: 'customer' | 'corporate' | 'other'; id: string | null; name: string; no: string | null }
  externalReference: string | null
  receivedAt: string
  branch: { id: string; code: string }
  note: string | null
  cashAck: boolean
  status: PaymentStatus
  reviewNote: string | null
  created: FinanceActor
  verified: FinanceActor
  reversalReason: string | null
  reversed: FinanceActor
  version: number
}
export interface FinanceRefund {
  id: string
  refundNo: string
  currency: string
  amountMinor: number
  method: PaymentMethod
  reason: string
  status: RefundStatus
  reviewNote: string | null
  externalReference: string | null
  created: FinanceActor
  approved: FinanceActor
  completed: FinanceActor
  reversalReason: string | null
  reversed: FinanceActor
  version: number
}
export interface FinanceDeposit {
  id: string
  depositNo: string
  currency: string
  amountMinor: number
  method: DepositMethod | null
  externalReference: string | null
  note: string | null
  status: DepositStatus
  inReview: boolean
  reviewReason: string | null
  created: FinanceActor
  reported: FinanceActor
  verified: FinanceActor
  /** Verified amount minus completed returns (what ACARVO records as still held). */
  heldMinor: number
  refundOpenMinor: number
  refundedMinor: number
  refunds: FinanceRefund[]
  version: number
}
export interface FinanceEvent {
  id: string
  entityType: 'finance' | 'charge' | 'payment' | 'deposit' | 'refund'
  entityNo: string | null
  kind: string
  fromStatus: string | null
  toStatus: string | null
  amountMinor: number | null
  currency: string | null
  data: Record<string, unknown> | null
  actorName: string | null
  at: string
}
/** Totals in the file currency; every concept separate (spec §85.6). */
export interface FinanceTotals {
  currency: string
  pendingChargesMinor: number
  postedChargesMinor: number
  recordedPaymentsMinor: number
  verifiedPaymentsMinor: number
  /** Posted lines minus verified payments; never negative (an excess is shown as overpaidMinor). */
  outstandingMinor: number
  overpaidMinor: number
  taxIncomplete: boolean
}
export interface DepositTotals {
  currency: string
  requestedMinor: number
  reportedMinor: number
  heldMinor: number
  refundOpenMinor: number
  refundedMinor: number
}
export interface ReturnFacts {
  plannedReturnAt: string
  actualReturnAt: string | null
  lateMinutes: number | null
  handoverKm: number | null
  returnKm: number | null
  handoverFuel: string | null
  returnFuel: string | null
  newFindings: number
  /** Something on return may cost money; ACARVO does not price it (FN6). */
  reviewNeeded: boolean
}
export interface RentalFinanceView {
  rental: { id: string; no: string; status: string; customer: { id: string; name: string; no: string }; corporate: { id: string; name: string; no: string } | null }
  quote: null | { id: string; no: string; currency: string; amountMinor: number; netMinor: number; taxStatus: 'complete' | 'not_configured'; matchesPlan: boolean; priceList: string; revision: number; charged: boolean }
  finance: null | {
    id: string
    currency: string
    responsible: { type: 'customer' | 'corporate'; id: string; name: string; no: string }
    status: FinanceFileStatus
    closed: FinanceActor
    reopenReason: string | null
    version: number
    created: FinanceActor
  }
  totals: FinanceTotals | null
  depositTotals: DepositTotals[]
  charges: FinanceCharge[]
  payments: FinancePayment[]
  deposits: FinanceDeposit[]
  events: FinanceEvent[]
  returnFacts: ReturnFacts | null
  /** Why the file cannot be closed now (codes), empty when it can. */
  closeBlockers: string[]
  can: Record<string, boolean>
}

export interface FinanceListPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
export interface FinancePaymentListItem extends FinancePayment {
  rental: { id: string; no: string }
  responsible: { type: 'customer' | 'corporate'; name: string }
}
export interface FinanceDepositListItem extends FinanceDeposit {
  rental: { id: string; no: string }
}
export interface FinanceRefundListItem extends FinanceRefund {
  deposit: { id: string; no: string }
  rental: { id: string; no: string }
}
export interface FinanceFileListItem {
  id: string
  rental: { id: string; no: string; status: string }
  responsible: { type: 'customer' | 'corporate'; id: string; name: string; no: string }
  status: FinanceFileStatus
  totals: FinanceTotals
  depositsHeld: { currency: string; minor: number }[]
  pending: number
  updatedAt: string
}
export interface FinanceSummaryRow {
  currency: string
  verifiedPaymentsMinor: number
  verifiedByMethod: Record<PaymentMethod, number>
  recordedPaymentsMinor: number
  postedChargesMinor: number
  pendingChargesMinor: number
  outstandingMinor: number
  depositsHeldMinor: number
  depositsReportedMinor: number
  refundsOpenMinor: number
  refundsCompletedMinor: number
}
export interface FinancePendingResponse {
  payments: FinancePaymentListItem[]
  charges: (FinanceCharge & { rental: { id: string; no: string } })[]
  deposits: FinanceDepositListItem[]
  refunds: FinanceRefundListItem[]
}
export interface PartyFinanceView {
  files: FinanceFileListItem[]
  /** Payments this party made on rentals where someone else is responsible (kept apart, spec §64.1). */
  paymentsAsPayer: FinancePaymentListItem[]
  totals: { currency: string; responsibleOutstandingMinor: number; postedMinor: number; verifiedMinor: number; recordedMinor: number; depositsHeldMinor: number }[]
}
