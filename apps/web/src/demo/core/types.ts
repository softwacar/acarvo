// ACARVO demo domain model. One typed database (Db) is the single source of truth for every demo screen: dashboard,
// calendar, reports and the detail pages all derive from these collections. Money is always integer minor units + ISO code.
// This model is a browser-side concept model; it is not a copy of the real backend schema.

export type Id = string
export type Iso = string // ISO instant (UTC)
export type Cur = string // ISO 4217 code

export interface Money {
  minor: number
  cur: Cur
}

// ---------------------------------------------------------------- organisation

export interface Branch {
  id: Id
  code: string
  name: string
  city: string
  country: string
  tz: string
  currency: Cur
  active: boolean
  address: string
  phone: string
  /** Seats / parking capacity per vehicle class (planning only). */
  classCapacity: Record<Id, number>
}

export interface DemoUser {
  id: Id
  name: string
  email: string
  roleId: Id
  /** Empty = all branches. */
  branchIds: Id[]
  status: 'active' | 'inactive' | 'invited'
  title: string
  /** Scoped permission overrides on top of the role (patron's per-person exceptions). */
  grant: string[]
  deny: string[]
}

export interface Role {
  id: Id
  name: string
  description: string
  system: boolean
  perms: string[]
}

export interface VehicleClass {
  id: Id
  code: string
  name: string
  seats: number
  doors: number
  gearbox: 'manual' | 'auto'
}

// ---------------------------------------------------------------- fleet

export type VehicleStatus = 'active' | 'out_of_service' | 'sold'
export type FuelLevel = 'empty' | 'quarter' | 'half' | 'three_quarters' | 'full'

export interface Vehicle {
  id: Id
  plate: string
  make: string
  model: string
  year: number
  color: string
  classId: Id
  homeBranchId: Id
  /** Physical location: a branch id, or 'customer' / 'service' / 'transit'. Different from the home branch. */
  location: string
  status: VehicleStatus
  odometerKm: number
  fuelType: 'petrol' | 'diesel' | 'hybrid' | 'electric'
  fuel: FuelLevel
  vin: string
  source: 'internal' | 'external'
  externalVehicleId?: Id
  /** Readiness is a separate dimension from availability. */
  readiness: { clean: boolean; fuelOk: boolean; checkedAt: Iso | null; checkedBy: Id | null; note: string }
  tire: { type: 'summer' | 'winter' | 'all_season'; mountedAt: Iso; treadMm: number }
  service: { intervalKm: number; lastKm: number; lastAt: Iso }
  keys: { count: number; holder: string }
}

export interface OdometerReading {
  id: Id
  vehicleId: Id
  km: number
  at: Iso
  source: 'initial' | 'handover' | 'return' | 'maintenance' | 'manual' | 'transfer'
  refType?: string
  refId?: Id
  by: Id | null
}

export interface LocationEvent {
  id: Id
  vehicleId: Id
  at: Iso
  location: string
  reason: string
  refType?: string
  refId?: Id
}

// ---------------------------------------------------------------- customers

export interface ContactLog {
  id: Id
  at: Iso
  by: Id
  channel: 'phone' | 'in_person' | 'email_manual' | 'note'
  summary: string
  followUpAt?: Iso
  followUpDone?: boolean
}

export interface Customer {
  id: Id
  no: string
  name: string
  kind: 'individual'
  phone: string
  email: string
  country: string
  residency: 'local' | 'foreign'
  dob: string
  corporateId?: Id
  language: 'tr' | 'en' | 'bs'
  /** Driving licence facts used by the driver eligibility rule (synthetic). */
  license: { issuedYear: number; validUntil: string; categories: string[] }
  contactPref: 'phone' | 'email' | 'none'
  notes: { id: Id; at: Iso; by: Id; text: string; pinned: boolean }[]
  /** Explainable operational restrictions only; never a hidden score. */
  restrictions: { id: Id; label: string; reason: string; at: Iso; by: Id }[]
  contacts: ContactLog[]
  createdAt: Iso
  archived: boolean
  gdpr: { requests: { id: Id; kind: 'access' | 'erasure' | 'rectification'; at: Iso; status: 'open' | 'closed'; note: string }[] }
}

export interface CorporateAccount {
  id: Id
  no: string
  name: string
  taxId: string
  country: string
  address: string
  contacts: { name: string; role: string; phone: string; email: string }[]
  creditLimits: Record<Cur, number>
  /** Credit override granted through a formal approval: per currency, minor units, tied to the approval. */
  overrides: { approvalId: Id; cur: Cur; minor: number }[]
  agreementId?: Id
  driverCustomerIds: Id[]
  paymentTermsDays: number
  status: 'active' | 'archived'
}

// ---------------------------------------------------------------- pricing & settings catalogs

export interface BaseRate {
  id: Id
  classId: Id
  cur: Cur
  dailyMinor: number
}
export interface Season {
  id: Id
  name: string
  from: string // YYYY-MM-DD
  to: string
  /** Percentage added to the base daily rate in this season. */
  uplift: number
  active: boolean
}
export interface PriceTier {
  fromDays: number
  discountPct: number
}
export interface CorporateAgreement {
  id: Id
  name: string
  discountPct: number
  classOverrides: { classId: Id; cur: Cur; dailyMinor: number }[]
  validFrom: string
  validTo: string
  active: boolean
}
export interface Extra {
  id: Id
  name: string
  kind: 'per_day' | 'per_rental'
  /** Explicit price row per transaction currency. No conversion between currencies in pricing. */
  prices: Record<Cur, number>
  active: boolean
}
export interface InsurancePackage {
  id: Id
  name: string
  code: string
  coverage: string
  deductible: Record<Cur, number>
  /** Explicit daily price row per transaction currency. */
  dailyPrice: Record<Cur, number>
  /** Extra deposit amount held for this package, per currency (0 = lower deposit). */
  depositEffect: Record<Cur, number>
  active: boolean
}
export interface TaxRule {
  id: Id
  name: string
  ratePct: number
  mode: 'inclusive' | 'exclusive'
  country: string
  active: boolean
  note: string
}
export interface PriceRevision {
  id: Id
  at: Iso
  by: Id
  summary: string
}

export interface FxRate {
  id: Id
  base: Cur
  quote: Cur
  /** 1 base = rate quote. A business-defined manual rate, never a market or central-bank rate. */
  rate: number
  purpose: 'tender' | 'refund' | 'deposit' | 'report'
  scope: 'company' | Id // company default or a branch override
  validFrom: Iso
  validUntil: Iso | null
  autoInverse: boolean
  enteredBy: Id
  enteredAt: Iso
  note: string
}

export interface DriverPolicy {
  minAge: number
  minLicenseYears: number
  youngDriverMaxAge: number
  youngDriverFee: Record<Cur, number>
  additionalDriverDaily: Record<Cur, number>
  maxAdditionalDrivers: number
}
export interface DepositPolicy {
  byClass: Record<Id, Record<Cur, number>>
  allowCardHold: boolean
  allowedMethods: PaymentMethod[]
}
export interface PaymentPolicy {
  allowOverpayment: boolean
  advanceRequiredPct: number
  refundMethods: PaymentMethod[]
}
export interface CashPolicy {
  requireCountOnClose: boolean
  /** Variance above this (minor, native currency) needs a reason + manager. */
  varianceReason: Record<Cur, number>
  handoverRequired: boolean
}
export interface Settings {
  company: { name: string; legalName: string; country: string; baseCurrency: Cur; taxId: string; tz: string; logoText: string; logoDataUrl: string | null; address: string; email: string; phone: string }
  locale: { lang: 'tr' | 'en'; firstDay: 0 | 1; dateOrder: 'dmy' | 'mdy' }
  languages: string[]
  acceptedCurrencies: Cur[]
  branchTender: Record<Id, Cur[]>
  duration: { dayMethod: 'calendar_day' | 'hours_24'; graceMinutes: number; minDays: number; lateFeePerHourPct: number; oneWayFee: Record<Cur, number>; fuelFeePerQuarter: Record<Cur, number>; kmPerDay: number; kmOverageFee: Record<Cur, number> }
  tiers: PriceTier[]
  defaultTaxId: Id
  driver: DriverPolicy
  deposit: DepositPolicy
  payment: PaymentPolicy
  cash: CashPolicy
  docs: { requireForForeign: string[]; requireForLocal: string[]; warnDays: number }
  contractLangs: string[]
  notify: { id: string; label: string; on: boolean }[]
  thresholds: { highDiscountPct: number; refundAbove: Record<Cur, number>; depositExceptionAbove: Record<Cur, number>; corporateOverride: boolean }
  privacy: { retentionMonths: number; maskIdentityRoles: string[]; auditRetentionMonths: number }
}

// ---------------------------------------------------------------- pricing snapshots

export interface PriceLine {
  kind: 'base' | 'season' | 'tier' | 'corporate' | 'discount' | 'extra' | 'insurance' | 'driver' | 'young_driver' | 'oneway' | 'fuel' | 'km' | 'late' | 'damage' | 'fine' | 'other'
  label: string
  qty: number
  unitMinor: number
  totalMinor: number
  note?: string
}
export interface TaxLine {
  ruleId: Id
  name: string
  ratePct: number
  mode: 'inclusive' | 'exclusive'
  baseMinor: number
  taxMinor: number
}
export interface PriceSnapshot {
  id: Id
  cur: Cur
  days: number
  lines: PriceLine[]
  netMinor: number
  taxLines: TaxLine[]
  taxMinor: number
  grossMinor: number
  revisionId: Id
  computedAt: Iso
  /** Why a calculation could not complete (missing price row). A snapshot with blockers is not a quote. */
  blockers: string[]
}

// ---------------------------------------------------------------- reservations & rentals

export type ReservationStatus = 'pending' | 'confirmed' | 'converted' | 'cancelled' | 'no_show'
export type RentalStatus = 'prepared' | 'delivered' | 'returned' | 'closed' | 'cancelled' | 'exception_closed' | 'loss_closed'

export interface HistoryEntry {
  id: Id
  at: Iso
  by: Id | 'system'
  action: string
  detail: string
}

export interface Reservation {
  id: Id
  no: string
  status: ReservationStatus
  customerId: Id
  corporateId?: Id
  classId: Id
  /** Class-only reservation until a specific vehicle is assigned. */
  vehicleId?: Id
  pickupBranchId: Id
  returnBranchId: Id
  pickupAt: Iso
  returnAt: Iso
  currency: Cur
  extras: { extraId: Id; qty: number }[]
  insuranceId?: Id
  drivers: { customerId: Id; primary: boolean }[]
  price: PriceSnapshot | null
  approvedDiscountPct?: number
  channel: 'phone' | 'walk_in' | 'web_form' | 'partner' | 'corporate' | 'quote'
  partnerId?: Id
  leadId?: Id
  quoteId?: Id
  notes: string
  rentalId?: Id
  cancelReason?: string
  createdAt: Iso
  createdBy: Id
  history: HistoryEntry[]
}

export interface WaitlistEntry {
  id: Id
  customerId: Id
  classId: Id
  branchId: Id
  from: Iso
  to: Iso
  status: 'waiting' | 'offered' | 'converted' | 'expired'
  note: string
  createdAt: Iso
}

export interface InspectionPin {
  id: Id
  view: 'front' | 'rear' | 'left' | 'right' | 'top' | 'interior'
  x: number
  y: number
  type: 'scratch' | 'dent' | 'crack' | 'missing' | 'other'
  note: string
}
export interface Inspection {
  at: Iso
  by: Id
  km: number
  fuel: FuelLevel
  photos: { id: Id; label: string; tone: string }[]
  pins: InspectionPin[]
  checks: Record<string, boolean>
  note: string
}

export interface Rental {
  id: Id
  no: string
  status: RentalStatus
  financeStatus: 'open' | 'closed'
  reservationId?: Id
  customerId: Id
  corporateId?: Id
  drivers: { customerId: Id; primary: boolean }[]
  vehicleId: Id
  classId: Id
  pickupBranchId: Id
  returnBranchId: Id
  plannedPickupAt: Iso
  plannedReturnAt: Iso
  actualPickupAt?: Iso
  actualReturnAt?: Iso
  currency: Cur
  extras: { extraId: Id; qty: number }[]
  insuranceId?: Id
  /** Coverage terms frozen when the rental was prepared. */
  coverageSnapshot?: { name: string; code: string; deductible: Money; dailyPrice: Money }
  price: PriceSnapshot | null
  approvedDiscountPct?: number
  deposit: { required: Money; state: 'none' | 'requested' | 'held' | 'released' | 'applied' | 'waived'; method?: PaymentMethod; note: string }
  contract: { id?: Id; signed: boolean; signedAt?: Iso; signedBy?: string }
  handover?: Inspection
  ret?: Inspection
  extensions: { id: Id; at: Iso; by: Id; fromReturn: Iso; toReturn: Iso; deltaMinor: number; note: string }[]
  swaps: { id: Id; at: Iso; by: Id; fromVehicleId: Id; toVehicleId: Id; reason: string }[]
  /** Staff statements gate for handover (document check, driver eligibility). */
  gate: { docsChecked: boolean; driverOk: boolean; note: string }
  notes: string
  closeKind?: 'normal' | 'exception' | 'loss'
  closeReason?: string
  createdAt: Iso
  createdBy: Id
  history: HistoryEntry[]
}

// ---------------------------------------------------------------- finance

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'
export type ChargeStatus = 'pending' | 'posted' | 'voided'

export interface Charge {
  id: Id
  no: string
  rentalId: Id
  kind: PriceLine['kind']
  label: string
  amountMinor: number
  cur: Cur
  taxMinor: number
  status: ChargeStatus
  /** Idempotency key: rentalId + source event + kind. A charge for the same key is created once. */
  key: string
  postedAt?: Iso
  voidReason?: string
  sourceType?: string
  sourceId?: Id
}

export interface RateSnapshot {
  base: Cur
  quote: Cur
  rate: number
  rateId: Id
  direction: 'direct' | 'inverse'
  pinnedAt: Iso
  roundingMinor: number
}

export interface Payment {
  id: Id
  no: string
  kind: 'payment' | 'advance'
  status: 'recorded' | 'applied' | 'voided' | 'refunded' | 'forfeited'
  rentalId?: Id
  reservationId?: Id
  payer: { type: 'customer' | 'corporate' | 'other'; id?: Id; name: string }
  method: PaymentMethod
  tender: Money
  rate?: RateSnapshot
  /** Applied equivalent in the obligation currency (minor). */
  appliedMinor: number
  obligationCur: Cur
  allocations: { chargeId: Id; minor: number }[]
  /** Advances: held (unapplied) → transferred to a rental → applied; or paid back (refunded) / kept as a policy fee (forfeited). */
  advanceState?: 'unapplied' | 'transferred' | 'applied' | 'refunded' | 'forfeited'
  forfeitReason?: string
  forfeitedAt?: Iso
  branchId: Id
  drawerId?: Id
  reference: string
  note: string
  recordedBy: Id
  recordedAt: Iso
  voidReason?: string
  voidedAt?: Iso
}

export interface DepositRecord {
  id: Id
  rentalId: Id
  amount: Money
  method: PaymentMethod
  state: 'held' | 'released' | 'applied'
  heldAt: Iso
  releasedAt?: Iso
  drawerId?: Id
  by: Id
  note: string
}

export interface RefundRecord {
  id: Id
  no: string
  rentalId?: Id
  reservationId?: Id
  amount: Money
  method: PaymentMethod
  status: 'requested' | 'approved' | 'completed' | 'rejected'
  reason: string
  /** An advance that is being paid back (the refund closes this advance). */
  paymentId?: Id
  approvalId?: Id
  drawerId?: Id
  requestedBy: Id
  requestedAt: Iso
  completedAt?: Iso
}

export interface PaymentPlanItem {
  id: Id
  rentalId: Id
  dueAt: Iso
  amount: Money
  payerName: string
  method: PaymentMethod
  status: 'planned' | 'partially_paid' | 'overdue' | 'completed'
  paymentIds: Id[]
}

export interface Drawer {
  id: Id
  branchId: Id
  currency: Cur
  name: string
  status: 'closed' | 'open'
  sessionId?: Id
}
export interface CashSession {
  id: Id
  drawerId: Id
  openedAt: Iso
  openedBy: Id
  openingMinor: number
  closedAt?: Iso
  closedBy?: Id
  countedMinor?: number
  expectedMinor?: number
  varianceMinor?: number
  varianceReason?: string
  handoverTo?: Id
  handoverNote?: string
}
export interface CashMovement {
  id: Id
  drawerId: Id
  sessionId: Id
  kind: 'in' | 'out'
  minor: number
  cur: Cur
  at: Iso
  by: Id
  reason: string
  sourceType: 'payment' | 'deposit' | 'refund' | 'expense' | 'manual' | 'opening'
  sourceId?: Id
}

export interface Expense {
  id: Id
  no: string
  category: string
  vendor: string
  branchId: Id
  date: string
  amount: Money
  status: 'draft' | 'posted' | 'voided'
  sourceType?: 'maintenance' | 'fine' | 'roadside' | 'cleaning'
  sourceId?: Id
  note: string
  createdBy: Id
  voidReason?: string
}

// ---------------------------------------------------------------- operations

export type TaskPriority = 'urgent' | 'high' | 'normal'
export interface Task {
  id: Id
  no: string
  title: string
  description: string
  priority: TaskPriority
  status: 'open' | 'in_progress' | 'done'
  dueAt: Iso
  createdBy: Id
  createdAt: Iso
  ownerId?: Id
  recipientIds: Id[]
  /** Open pool: any eligible employee may claim it. */
  pool: boolean
  branchId?: Id
  link?: { type: LinkType; id: Id }
  doneAt?: Iso
  history: HistoryEntry[]
}

export type LinkType =
  | 'vehicle'
  | 'rental'
  | 'reservation'
  | 'customer'
  | 'corporate'
  | 'maintenance'
  | 'damage'
  | 'incident'
  | 'fine'
  | 'payment'
  | 'approval'
  | 'task'
  | 'contract'
  | 'lead'
  | 'quote'
  | 'partner'
  | 'supplier'
  | 'engagement'
  | 'expense'
  | 'document'
  | 'transfer'

export interface ServiceProvider {
  id: Id
  name: string
  kind: 'workshop' | 'tire' | 'wash' | 'tow'
  city: string
}
export interface Maintenance {
  id: Id
  no: string
  vehicleId: Id
  type: 'periodic' | 'repair' | 'tire' | 'cleaning' | 'inspection'
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  plannedStart: Iso
  plannedEnd: Iso
  actualStart?: Iso
  actualEnd?: Iso
  providerId?: Id
  reason: string
  cost: Money | null
  km?: number
  damageId?: Id
  tireSwap?: { to: 'summer' | 'winter' | 'all_season'; treadMm: number }
  history: HistoryEntry[]
}

export interface Damage {
  id: Id
  no: string
  vehicleId: Id
  rentalId?: Id
  status: 'reported' | 'investigating' | 'liability_set' | 'closed'
  severity: 'minor' | 'moderate' | 'severe'
  area: string
  description: string
  photos: number
  blocksVehicle: boolean
  estimate: Money | null
  insurance?: { name: string; deductible: Money }
  liability: 'undetermined' | 'customer' | 'insurer' | 'company'
  repairMaintenanceId?: Id
  chargeId?: Id
  recovery?: { insurerRef: string; amount: Money; receivedAt?: Iso }
  createdAt: Iso
  createdBy: Id
  history: HistoryEntry[]
}

export interface Incident {
  id: Id
  no: string
  kind: 'accident' | 'breakdown' | 'theft' | 'complaint' | 'safety' | 'other'
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'investigating' | 'resolved' | 'closed'
  title: string
  description: string
  vehicleId?: Id
  rentalId?: Id
  ownerId: Id
  evidence: { id: Id; label: string; at: Iso }[]
  links: { type: LinkType; id: Id }[]
  resolution?: string
  createdAt: Iso
  createdBy: Id
  history: HistoryEntry[]
}

export interface Fine {
  id: Id
  no: string
  vehicleId: Id
  occurredAt: Iso
  kind: string
  authorityRef: string
  authority: string
  amount: Money
  dueDate: string
  status: 'recorded' | 'liability_pending' | 'assigned' | 'closed'
  suggestedRentalId?: Id
  rentalId?: Id
  dispute: 'none' | 'filed' | 'accepted' | 'rejected'
  authorityPaidAt?: Iso
  customerChargeId?: Id
  expenseId?: Id
  history: HistoryEntry[]
}

export interface Transfer {
  id: Id
  no: string
  vehicleId: Id
  fromBranchId: Id
  toBranchId: Id
  status: 'requested' | 'in_transit' | 'completed' | 'cancelled'
  plannedAt: Iso
  departedAt?: Iso
  arrivedAt?: Iso
  reason: string
}

// ---------------------------------------------------------------- commercial

export interface Partner {
  id: Id
  no: string
  name: string
  kind: 'hotel' | 'agency' | 'travel' | 'corporate_broker'
  country: string
  contact: { name: string; email: string; phone: string }
  commission: { type: 'percent'; pct: number; trigger: 'delivered' | 'returned' | 'closed'; version: number }
  status: 'active' | 'paused'
  portalAccess: boolean
}
export interface CommissionRecord {
  id: Id
  partnerId: Id
  rentalId: Id
  base: Money
  amount: Money
  status: 'earned' | 'adjusted'
  adjustedFrom?: number
  earnedAt: Iso
}
export interface PartnerPayment {
  id: Id
  partnerId: Id
  commissionIds: Id[]
  amount: Money
  paidAt: Iso
  reference: string
}
export interface Lead {
  id: Id
  no: string
  source: 'web_form' | 'phone' | 'partner' | 'walk_in' | 'referral'
  partnerId?: Id
  name: string
  phone: string
  email: string
  customerId?: Id
  classId: Id
  from: Iso
  to: Iso
  branchId: Id
  ownerId: Id
  status: 'new' | 'contacted' | 'quoted' | 'accepted' | 'lost' | 'converted'
  lostReason?: string
  notes: string
  reminders: { id: Id; at: Iso; text: string; done: boolean }[]
  quoteIds: Id[]
  reservationId?: Id
  createdAt: Iso
}
export interface Quote {
  id: Id
  no: string
  leadId: Id
  version: number
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded'
  validUntil: Iso
  price: PriceSnapshot
  classId: Id
  from: Iso
  to: Iso
  insuranceId?: Id
  extras: { extraId: Id; qty: number }[]
  createdAt: Iso
  createdBy: Id
  note: string
}

export interface Supplier {
  id: Id
  no: string
  name: string
  country: string
  contact: { name: string; email: string; phone: string }
  status: 'active' | 'paused'
  depositHeld: Money
  terms: string
}
export interface SourcingRequest {
  id: Id
  no: string
  supplierId?: Id
  classId: Id
  from: Iso
  to: Iso
  branchId: Id
  reason: string
  status: 'open' | 'offered' | 'accepted' | 'declined' | 'cancelled'
  offers: { id: Id; supplierId: Id; vehicle: string; dailyRate: Money; validUntil: Iso; status: 'open' | 'accepted' | 'declined' }[]
  engagementId?: Id
  createdAt: Iso
}
export interface ExternalVehicle {
  id: Id
  supplierId: Id
  plate: string
  make: string
  model: string
  classId: Id
  year: number
  /** Master record; its past engagements remain. */
  vehicleId?: Id
}
export interface Engagement {
  id: Id
  no: string
  supplierId: Id
  externalVehicleId: Id
  requestId?: Id
  from: Iso
  to: Iso
  dailyCost: Money
  status: 'confirmed' | 'received' | 'returned' | 'cancelled'
  receivedAt?: Iso
  returnedAt?: Iso
  receiveInspection?: { km: number; fuel: FuelLevel; photos: number; note: string; at: Iso }
  returnInspection?: { km: number; fuel: FuelLevel; photos: number; note: string; at: Iso }
  settlementId?: Id
}
export interface SupplierSettlement {
  id: Id
  supplierId: Id
  engagementId: Id
  payable: Money
  status: 'open' | 'paid'
  paidAt?: Iso
  paymentRef?: string
}

// ---------------------------------------------------------------- control

export type ApprovalType = 'high_discount' | 'deposit_exception' | 'refund' | 'financial_correction' | 'corporate_credit_override' | 'partner_commission_adjustment'
export interface Approval {
  id: Id
  no: string
  type: ApprovalType
  status: 'requested' | 'approved' | 'rejected' | 'applied'
  requesterId: Id
  reviewerId?: Id
  appliedBy?: Id
  target: { type: LinkType; id: Id }
  /** Refund of a specific advance payment. */
  paymentId?: Id
  reason: string
  requested: Money | null
  /** Percentage for high discount; minor amount otherwise. */
  proposedPct?: number
  decisionNote?: string
  createdAt: Iso
  decidedAt?: Iso
  appliedAt?: Iso
  history: HistoryEntry[]
}

export interface Rule {
  id: Id
  name: string
  status: 'draft' | 'active' | 'archived'
  version: number
  /** Safe catalogue only: notification / review flags. No policy overrides. */
  conditions: { field: string; op: '>' | '<' | '=' | '>=' | '<='; value: number | string }[]
  join: 'AND' | 'OR'
  action: 'alert' | 'review_flag'
  severity: 'info' | 'warning' | 'critical'
  message: string
  versions: { version: number; at: Iso; by: Id; summary: string }[]
}

export interface Exception {
  id: Id
  no: string
  source: { type: LinkType; id: Id }
  title: string
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'reviewed' | 'accepted' | 'rejected'
  reviewerId?: Id
  decision?: string
  createdAt: Iso
}

export interface DemoDocument {
  id: Id
  ownerType: 'customer' | 'vehicle' | 'contract' | 'rental' | 'maintenance' | 'insurance' | 'supplier' | 'company'
  ownerId: Id
  kind: string
  name: string
  version: number
  validUntil?: string
  /** Placeholder: demo documents carry no real file or personal data. */
  placeholder: true
  uploadedAt: Iso
  uploadedBy: Id
}

export interface ContractTemplate {
  id: Id
  name: string
  lang: 'tr' | 'en' | 'bs'
  version: number
  clauses: { id: Id; title: string; body: string }[]
  active: boolean
  seriesPrefix: string
}
export interface Contract {
  id: Id
  no: string
  rentalId: Id
  templateId: Id
  templateVersion: number
  version: number
  lang: 'tr' | 'en' | 'bs'
  status: 'issued' | 'signed' | 'superseded'
  issuedAt: Iso
  issuedBy: Id
  signedAt?: Iso
  signedBy?: string
  staffApprovedBy?: Id
  /** Frozen text so later template edits never rewrite an issued version. */
  snapshot: { title: string; clauses: { title: string; body: string }[]; renterName: string; vehicle: string; period: string; totals: string; coverage: string; deposit: string }
}

export interface DemoEvent {
  id: Id
  at: Iso
  actorId: Id | 'system'
  actorName: string
  branchId?: Id
  module: string
  type: string
  sourceType: string
  sourceId: string
  summary: string
  before?: string
  after?: string
  reason?: string
  cur?: Cur
  minor?: number
}

export interface Shift {
  id: Id
  branchId: Id
  userId: Id
  openedAt: Iso
  closedAt?: Iso
  handoverToId?: Id
  handoverNote?: string
}

export interface Notification {
  id: Id
  at: Iso
  userId?: Id
  kind: string
  text: string
  link?: { type: LinkType; id: Id }
  read: boolean
}

// ---------------------------------------------------------------- platform / partner portal (separate contexts)

export interface Tenant {
  id: Id
  name: string
  country: string
  tz: string
  plan: 'starter' | 'professional' | 'enterprise'
  status: 'active' | 'trial' | 'suspended'
  owner: string
  ownerEmail: string
  branches: number
  users: number
  vehicles: number
  createdAt: Iso
}

// ---------------------------------------------------------------- the database

export interface Db {
  meta: { schema: number; anchor: string; createdAt: Iso; modified: boolean }
  clock: { now: Iso }
  session: { userId: Id; branchId: Id | 'all'; lang: 'tr' | 'en'; context: 'company' | 'platform' | 'partner'; partnerId: Id }
  counters: Record<string, number>
  settings: Settings
  branches: Branch[]
  users: DemoUser[]
  roles: Role[]
  classes: VehicleClass[]
  vehicles: Vehicle[]
  odometer: OdometerReading[]
  locations: LocationEvent[]
  customers: Customer[]
  corporates: CorporateAccount[]
  baseRates: BaseRate[]
  seasons: Season[]
  agreements: CorporateAgreement[]
  extras: Extra[]
  insurance: InsurancePackage[]
  taxRules: TaxRule[]
  priceRevisions: PriceRevision[]
  fxRates: FxRate[]
  reservations: Reservation[]
  waitlist: WaitlistEntry[]
  rentals: Rental[]
  charges: Charge[]
  payments: Payment[]
  deposits: DepositRecord[]
  refunds: RefundRecord[]
  paymentPlans: PaymentPlanItem[]
  drawers: Drawer[]
  cashSessions: CashSession[]
  cashMovements: CashMovement[]
  expenses: Expense[]
  tasks: Task[]
  providers: ServiceProvider[]
  maintenance: Maintenance[]
  damages: Damage[]
  incidents: Incident[]
  fines: Fine[]
  transfers: Transfer[]
  partners: Partner[]
  commissions: CommissionRecord[]
  partnerPayments: PartnerPayment[]
  leads: Lead[]
  quotes: Quote[]
  suppliers: Supplier[]
  sourcing: SourcingRequest[]
  externalVehicles: ExternalVehicle[]
  engagements: Engagement[]
  settlements: SupplierSettlement[]
  approvals: Approval[]
  rules: Rule[]
  exceptions: Exception[]
  documents: DemoDocument[]
  templates: ContractTemplate[]
  contracts: Contract[]
  events: DemoEvent[]
  shifts: Shift[]
  notifications: Notification[]
  tenants: Tenant[]
}
