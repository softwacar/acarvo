import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

// ---------------------------------------------------------------------------
// Global tables: no company data, no RLS.

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('users_email_lower_key').on(sql`lower(${t.email})`)],
)

export const companies = pgTable('companies', {
  id: id(),
  name: text('name').notNull(),
  country: text('country').notNull(),
  timezone: text('timezone').notNull(),
  currency: text('currency').notNull(),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  createdAt: createdAt(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    activeCompanyId: uuid('active_company_id').references(() => companies.id),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

// ---------------------------------------------------------------------------
// Company-scoped tables: every one carries company_id, has RLS, and links to
// other company rows only through composite (company_id, id) keys.

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    status: text('status', { enum: ['active', 'suspended', 'invited'] }).notNull().default('active'),
    allBranches: text('all_branches', { enum: ['yes', 'no'] }).notNull().default('no'),
    createdAt: createdAt(),
  },
  (t) => [unique('memberships_company_user_key').on(t.companyId, t.userId), unique('memberships_company_id_key').on(t.companyId, t.id)],
)

export const roles = pgTable(
  'roles',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    permissions: text('permissions').array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [unique('roles_company_name_key').on(t.companyId, t.name), unique('roles_company_id_key').on(t.companyId, t.id)],
)

export const membershipRoles = pgTable(
  'membership_roles',
  {
    companyId: uuid('company_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    roleId: uuid('role_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.roleId] }),
    foreignKey({ columns: [t.companyId, t.membershipId], foreignColumns: [memberships.companyId, memberships.id] }).onDelete('cascade'),
    foreignKey({ columns: [t.companyId, t.roleId], foreignColumns: [roles.companyId, roles.id] }).onDelete('cascade'),
  ],
)

export const branches = pgTable(
  'branches',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    timezone: text('timezone').notNull(),
    /** ISO 3166-1 alpha-2, set by the owner (M2). Empty until set: nothing assumes the company country. */
    country: text('country'),
    status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('branches_company_code_key').on(t.companyId, t.code),
    unique('branches_company_id_key').on(t.companyId, t.id),
    check('branches_country_check', sql`${t.country} is null or ${t.country} ~ '^[A-Z]{2}$'`),
  ],
)

export const membershipBranches = pgTable(
  'membership_branches',
  {
    companyId: uuid('company_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    branchId: uuid('branch_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.branchId] }),
    foreignKey({ columns: [t.companyId, t.membershipId], foreignColumns: [memberships.companyId, memberships.id] }).onDelete('cascade'),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }).onDelete('cascade'),
  ],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    summary: jsonb('summary'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_company_created_idx').on(t.companyId, t.createdAt),
    // Per-record history (e.g. a vehicle's Kayıt geçmişi): without it, a record with few entries scans the whole company log.
    index('audit_entity_created_idx').on(t.companyId, t.entity, t.entityId, t.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// Vehicles module (spec §13, §59BL, §59BM, §59U). Vehicles are never hard-deleted;
// current odometer and physical location are derived from append-only event tables.

export const vehicleClasses = pgTable(
  'vehicle_classes',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique('vehicle_classes_company_name_key').on(t.companyId, t.name), unique('vehicle_classes_company_id_key').on(t.companyId, t.id)],
)

export const FUEL_TYPES = ['petrol', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'lpg'] as const
export const TRANSMISSIONS = ['manual', 'automatic'] as const
export const VEHICLE_SOURCES = ['internal', 'external'] as const
export const VEHICLE_STATUSES = ['active', 'out_of_service', 'sold', 'disposed'] as const
export const ACQUISITION_TYPES = ['purchase', 'lease', 'long_term_rent', 'other'] as const

export const vehicles = pgTable(
  'vehicles',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    plate: text('plate').notNull(),
    plateNormalized: text('plate_normalized').notNull(),
    vehicleCode: text('vehicle_code'),
    make: text('make').notNull(),
    model: text('model').notNull(),
    trim: text('trim'),
    modelYear: integer('model_year'),
    classId: uuid('class_id').notNull(),
    color: text('color'),
    vin: text('vin'),
    fuelType: text('fuel_type', { enum: FUEL_TYPES }).notNull(),
    transmission: text('transmission', { enum: TRANSMISSIONS }).notNull(),
    seats: integer('seats'),
    source: text('source', { enum: VEHICLE_SOURCES }).notNull().default('internal'),
    homeBranchId: uuid('home_branch_id').notNull(),
    status: text('status', { enum: VEHICLE_STATUSES }).notNull().default('active'),
    acquisitionType: text('acquisition_type', { enum: ACQUISITION_TYPES }),
    acquisitionDate: date('acquisition_date'),
    acquisitionSeller: text('acquisition_seller'),
    acquisitionCostMinor: bigint('acquisition_cost_minor', { mode: 'number' }),
    acquisitionCurrency: text('acquisition_currency'),
    acquisitionReference: text('acquisition_reference'),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('vehicles_company_id_key').on(t.companyId, t.id),
    unique('vehicles_company_plate_key').on(t.companyId, t.plateNormalized),
    uniqueIndex('vehicles_company_code_key').on(t.companyId, sql`lower(${t.vehicleCode})`).where(sql`${t.vehicleCode} is not null`),
    index('vehicles_company_branch_idx').on(t.companyId, t.homeBranchId),
    foreignKey({ columns: [t.companyId, t.classId], foreignColumns: [vehicleClasses.companyId, vehicleClasses.id] }),
    foreignKey({ columns: [t.companyId, t.homeBranchId], foreignColumns: [branches.companyId, branches.id] }),
    check('vehicles_model_year_check', sql`${t.modelYear} is null or ${t.modelYear} between 1950 and 2100`),
    check('vehicles_seats_check', sql`${t.seats} is null or ${t.seats} between 1 and 99`),
    check('vehicles_cost_check', sql`(${t.acquisitionCostMinor} is null) = (${t.acquisitionCurrency} is null) and (${t.acquisitionCostMinor} is null or ${t.acquisitionCostMinor} >= 0)`),
    check('vehicles_currency_check', sql`${t.acquisitionCurrency} is null or ${t.acquisitionCurrency} ~ '^[A-Z]{3}$'`),
    check('vehicles_version_check', sql`${t.version} >= 1`),
  ],
)

export const ODOMETER_EVENTS = ['initial', 'manual', 'correction'] as const
/** Where a reading or location event came from. Later modules add rental, transfer, maintenance and supplier sources. */
export const HISTORY_SOURCES = ['vehicle_create', 'manual', 'correction'] as const

/**
 * Append-only. The vehicle's current odometer is the latest *effective* reading by time, where
 * effective means no row in odometer_corrections points at it (docs §8.5).
 */
export const odometerReadings = pgTable(
  'odometer_readings',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    vehicleId: uuid('vehicle_id').notNull(),
    km: integer('km').notNull(),
    eventType: text('event_type', { enum: ODOMETER_EVENTS }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: createdAt(),
    // Added in 0009 (nullable, existing rows untouched).
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    clientRequestId: uuid('client_request_id'),
    jumpReason: text('jump_reason'),
  },
  (t) => [
    unique('odometer_readings_company_id_key').on(t.companyId, t.id),
    index('odometer_vehicle_time_idx').on(t.companyId, t.vehicleId, t.occurredAt),
    uniqueIndex('odometer_readings_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    uniqueIndex('odometer_readings_correction_key').on(t.companyId, t.sourceId).where(sql`${t.sourceType} = 'correction'`),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    check('odometer_km_check', sql`${t.km} between 0 and 3000000`),
  ],
)

export const CORRECTION_ACTIONS = ['replace', 'void'] as const

/** A reading taken out of the effective history, with a reason. At most one per reading. */
export const odometerCorrections = pgTable(
  'odometer_corrections',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    vehicleId: uuid('vehicle_id').notNull(),
    readingId: uuid('reading_id').notNull(),
    action: text('action', { enum: CORRECTION_ACTIONS }).notNull(),
    reason: text('reason').notNull(),
    clientRequestId: uuid('client_request_id'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('odometer_corrections_company_id_key').on(t.companyId, t.id),
    unique('odometer_corrections_reading_key').on(t.companyId, t.readingId),
    uniqueIndex('odometer_corrections_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    index('odometer_corrections_vehicle_idx').on(t.companyId, t.vehicleId),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.readingId], foreignColumns: [odometerReadings.companyId, odometerReadings.id] }),
    check('odometer_corrections_reason_check', sql`char_length(${t.reason}) between 5 and 300`),
  ],
)

export const LOCATION_TYPES = ['branch', 'in_transit', 'with_customer', 'service_provider', 'supplier'] as const

/** Append-only physical location history. Not live GPS. Current location = latest effective event by time. */
export const vehicleLocationEvents = pgTable(
  'vehicle_location_events',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    vehicleId: uuid('vehicle_id').notNull(),
    locationType: text('location_type', { enum: LOCATION_TYPES }).notNull(),
    branchId: uuid('branch_id'),
    description: text('description'),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedBy: uuid('recorded_by').references(() => users.id),
    createdAt: createdAt(),
    // Added in 0009 (nullable, existing rows untouched).
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    reason: text('reason'),
    clientRequestId: uuid('client_request_id'),
  },
  (t) => [
    unique('vehicle_location_events_company_id_key').on(t.companyId, t.id),
    index('location_vehicle_time_idx').on(t.companyId, t.vehicleId, t.occurredAt),
    uniqueIndex('location_events_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    uniqueIndex('location_events_correction_key').on(t.companyId, t.sourceId).where(sql`${t.sourceType} = 'correction'`),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }),
    check('location_branch_check', sql`${t.locationType} <> 'branch' or ${t.branchId} is not null`),
  ],
)

/** A location event taken out of the effective history, with a reason. At most one per event. */
export const vehicleLocationCorrections = pgTable(
  'vehicle_location_corrections',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    vehicleId: uuid('vehicle_id').notNull(),
    eventId: uuid('event_id').notNull(),
    action: text('action', { enum: CORRECTION_ACTIONS }).notNull(),
    reason: text('reason').notNull(),
    clientRequestId: uuid('client_request_id'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('vehicle_location_corrections_company_id_key').on(t.companyId, t.id),
    unique('vehicle_location_corrections_event_key').on(t.companyId, t.eventId),
    uniqueIndex('vehicle_location_corrections_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    index('vehicle_location_corrections_vehicle_idx').on(t.companyId, t.vehicleId),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.eventId], foreignColumns: [vehicleLocationEvents.companyId, vehicleLocationEvents.id] }),
    check('vehicle_location_corrections_reason_check', sql`char_length(${t.reason}) between 5 and 300`),
  ],
)

// ---------------------------------------------------------------------------
// Files and vehicle promotional photos. Files live outside any public folder and are
// served only through the API after a permission check. Promotional (catalogue) photos
// are a separate table from the immutable handover/return evidence that comes later.

export const files = pgTable(
  'files',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    kind: text('kind', { enum: ['vehicle_promo_photo'] }).notNull(),
    storageKey: text('storage_key').notNull().unique(),
    thumbKey: text('thumb_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: text('sha256').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [unique('files_company_id_key').on(t.companyId, t.id)],
)

export const MAX_PROMO_PHOTOS = 6

export const vehiclePromoPhotos = pgTable(
  'vehicle_promo_photos',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    vehicleId: uuid('vehicle_id').notNull(),
    fileId: uuid('file_id').notNull(),
    position: integer('position').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    /** Credit for third-party photos (e.g. CC BY-SA): author, source, licence and the changes made. Null for own photos. */
    attribution: jsonb('attribution').$type<{ author: string; sourceUrl: string; license: string; licenseUrl: string; changes: string }>(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('promo_photos_file_key').on(t.fileId),
    uniqueIndex('promo_photos_one_primary_key').on(t.vehicleId).where(sql`${t.isPrimary}`),
    index('promo_photos_vehicle_idx').on(t.companyId, t.vehicleId),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.fileId], foreignColumns: [files.companyId, files.id] }),
    check('promo_photos_position_check', sql`${t.position} between 0 and 5`),
  ],
)

// ---------------------------------------------------------------------------
// Vehicle documents (docs/TEKNIK_UYGULAMA.md §8.4). Separate from promotional photos:
// own storage records, own tables. No physical deletion; file versions are immutable.

/** Global system document types (not company data). */
export const documentTypes = pgTable('document_types', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  requiresExpiry: boolean('requires_expiry').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

/** A company's decision for a type. No row = not required, warn 30 days. */
export const companyDocumentTypeSettings = pgTable(
  'company_document_type_settings',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id),
    typeCode: text('type_code').notNull().references(() => documentTypes.code),
    required: boolean('required').notNull().default(false),
    warnDays: integer('warn_days').notNull().default(30),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.typeCode] }), check('doc_settings_warn_days_check', sql`${t.warnDays} between 1 and 365`)],
)

export const documentFiles = pgTable(
  'document_files',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    storageKey: text('storage_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    pageCount: integer('page_count'),
    displayName: text('display_name').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('document_files_company_id_key').on(t.companyId, t.id),
    check('document_files_mime_check', sql`${t.mimeType} in ('application/pdf', 'image/jpeg', 'image/png')`),
    check('document_files_size_check', sql`${t.sizeBytes} > 0`),
  ],
)

export const vehicleDocuments = pgTable(
  'vehicle_documents',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    vehicleId: uuid('vehicle_id').notNull(),
    typeCode: text('type_code').notNull().references(() => documentTypes.code),
    documentNumber: text('document_number'),
    issuer: text('issuer'),
    issuedOn: date('issued_on'),
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),
    notes: text('notes'),
    recordState: text('record_state', { enum: ['draft', 'active', 'voided'] }).notNull(),
    renewsId: uuid('renews_id'),
    voidedReason: text('voided_reason'),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    /** Set when a rental pins this period (later phase); locked periods cannot be corrected. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('vehicle_documents_company_id_key').on(t.companyId, t.id),
    index('vehicle_documents_vehicle_idx').on(t.companyId, t.vehicleId, t.typeCode),
    uniqueIndex('vehicle_documents_renews_once_key').on(t.renewsId).where(sql`${t.renewsId} is not null and ${t.recordState} <> 'voided'`),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.renewsId], foreignColumns: [t.companyId, t.id] }),
    check('vehicle_documents_dates_check', sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validFrom} <= ${t.validUntil}`),
    check('vehicle_documents_state_check', sql`${t.recordState} in ('draft', 'active', 'voided')`),
    check('vehicle_documents_void_check', sql`(${t.recordState} = 'voided') = (${t.voidedAt} is not null and ${t.voidedReason} is not null)`),
    check('vehicle_documents_version_check', sql`${t.version} >= 1`),
  ],
)

export const vehicleDocumentFiles = pgTable(
  'vehicle_document_files',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    documentId: uuid('document_id').notNull(),
    fileId: uuid('file_id').notNull(),
    versionNo: integer('version_no').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('vehicle_document_files_file_key').on(t.fileId),
    unique('vehicle_document_files_version_key').on(t.documentId, t.versionNo),
    foreignKey({ columns: [t.companyId, t.documentId], foreignColumns: [vehicleDocuments.companyId, vehicleDocuments.id] }),
    foreignKey({ columns: [t.companyId, t.fileId], foreignColumns: [documentFiles.companyId, documentFiles.id] }),
    check('vehicle_document_files_version_check', sql`${t.versionNo} >= 1`),
  ],
)

// ---------------------------------------------------------------------------
// Customers (people), M1 — docs/MUSTERILER_KURUMSAL_HESAPLAR_PLANI.md §4, §15.
// A person belongs to exactly one company: no shared pool, no cross-company identity or matching.
// Identity / passport / licence numbers are not stored here (M2, encrypted, in their own table).

/** Per-company counters for human-readable numbers (M-000123, K-00042). Never reused. */
export const companySequences = pgTable(
  'company_sequences',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id),
    kind: text('kind', { enum: ['customer', 'corporate_account', 'reservation', 'rental', 'price_quote', 'contract', 'finance_charge', 'finance_payment', 'finance_deposit', 'finance_refund'] }).notNull(),
    nextValue: bigint('next_value', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.kind] }),
    check('company_sequences_kind_check', sql`${t.kind} in ('customer', 'corporate_account', 'reservation', 'rental', 'price_quote', 'contract', 'finance_charge', 'finance_payment', 'finance_deposit', 'finance_refund')`),
    check('company_sequences_next_check', sql`${t.nextValue} >= 1`),
  ],
)

export const customers = pgTable(
  'customers',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    customerNo: text('customer_no').notNull(),
    givenName: text('given_name'),
    familyName: text('family_name'),
    displayName: text('display_name').notNull(),
    /** Accent- and case-free name for search and duplicate suggestions. */
    nameNormalized: text('name_normalized').notNull(),
    phoneRaw: text('phone_raw'),
    phoneE164: text('phone_e164'),
    email: text('email'),
    /**
     * M1 Yerli/Yabancı classification with no defined reference country. Kept as recorded (never converted or
     * derived); optional from M2. The rental-time classification is a separate, staff-confirmed snapshot.
     */
    residency: text('residency', { enum: ['local', 'foreign'] }),
    nationality: text('nationality'),
    /** Country the person lives in (M2). Separate from nationality; never derived from it. */
    residenceCountry: text('residence_country'),
    dateOfBirth: date('date_of_birth'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    postalCode: text('postal_code'),
    region: text('region'),
    addressCountry: text('address_country'),
    preferredLanguage: text('preferred_language'),
    contactPreference: text('contact_preference'),
    operationalNote: text('operational_note'),
    status: text('status', { enum: ['active', 'archived', 'merged', 'anonymized'] }).notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedReason: text('archived_reason'),
    archivedBy: uuid('archived_by').references(() => users.id),
    /** Reserved for M5 (merge) and M6 (privacy requests); not used in M1. */
    mergedIntoId: uuid('merged_into_id'),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
    processingRestricted: boolean('processing_restricted').notNull().default(false),
    /** Where the record was opened. Informational only: every authorised user of the company can find the customer. */
    createdBranchId: uuid('created_branch_id'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('customers_company_id_key').on(t.companyId, t.id),
    unique('customers_company_no_key').on(t.companyId, t.customerNo),
    index('customers_company_name_idx').on(t.companyId, t.status, t.nameNormalized),
    index('customers_company_phone_idx').on(t.companyId, t.phoneE164),
    index('customers_company_email_idx').on(t.companyId, t.email),
    index('customers_company_created_idx').on(t.companyId, t.createdAt),
    foreignKey({ columns: [t.companyId, t.createdBranchId], foreignColumns: [branches.companyId, branches.id] }),
    foreignKey({ columns: [t.companyId, t.mergedIntoId], foreignColumns: [t.companyId, t.id] }),
    check('customers_no_check', sql`${t.customerNo} ~ '^M-[0-9]{6,}$'`),
    check('customers_name_check', sql`coalesce(btrim(${t.givenName}), '') <> '' or coalesce(btrim(${t.familyName}), '') <> ''`),
    check('customers_contact_check', sql`${t.phoneE164} is not null or ${t.email} is not null or ${t.status} = 'anonymized'`),
    check('customers_phone_check', sql`${t.phoneE164} is null or ${t.phoneE164} ~ '^[+][1-9][0-9]{6,14}$'`),
    check('customers_email_check', sql`${t.email} is null or (${t.email} = lower(${t.email}) and ${t.email} like '%_@_%')`),
    check('customers_residency_check', sql`${t.residency} in ('local', 'foreign')`),
    check('customers_status_check', sql`${t.status} in ('active', 'archived', 'merged', 'anonymized')`),
    check('customers_country_check', sql`(${t.nationality} is null or ${t.nationality} ~ '^[A-Z]{2}$') and (${t.addressCountry} is null or ${t.addressCountry} ~ '^[A-Z]{2}$')`),
    check('customers_residence_country_check', sql`${t.residenceCountry} is null or ${t.residenceCountry} ~ '^[A-Z]{2}$'`),
    check('customers_dob_check', sql`${t.dateOfBirth} is null or ${t.dateOfBirth} >= date '1900-01-01'`),
    check('customers_archive_check', sql`(${t.status} = 'archived') = (${t.archivedAt} is not null and ${t.archivedReason} is not null)`),
    check(
      'customers_archive_reason_check',
      sql`${t.archivedReason} is null or ${t.archivedReason} in ('duplicate', 'inactive', 'customer_request', 'entry_error', 'other')`,
    ),
    check('customers_merged_check', sql`(${t.status} = 'merged') = (${t.mergedIntoId} is not null) and ${t.mergedIntoId} is distinct from ${t.id}`),
    check('customers_version_check', sql`${t.version} >= 1`),
  ],
)

// ---------------------------------------------------------------------------
// Customer documents (M2) — a record type separate from vehicle documents.
// Document numbers and files are encrypted by the API (lib/customer-crypto.ts); the database never sees plaintext.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

export const customerDocuments = pgTable(
  'customer_documents',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    customerId: uuid('customer_id').notNull(),
    type: text('type').notNull(),
    issuingCountry: text('issuing_country'),
    issuingAuthority: text('issuing_authority'),
    title: text('title'),
    /** AES-256-GCM ciphertext bound to company and document id; never plaintext. */
    numberCiphertext: bytea('number_ciphertext'),
    numberKeyId: text('number_key_id'),
    /** Up to four trailing characters for masked display; at least four characters always stay hidden. */
    numberHint: text('number_hint'),
    /** Per-company HMAC of type + issuing country + normalised number, for exact matching only. */
    numberLookup: text('number_lookup'),
    numberLookupKeyId: text('number_lookup_key_id'),
    issuedOn: date('issued_on'),
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),
    licenseCategories: text('license_categories').array().notNull().default(sql`'{}'::text[]`),
    licenseFirstIssuedOn: date('license_first_issued_on'),
    entryDate: date('entry_date'),
    note: text('note'),
    recordState: text('record_state', { enum: ['active', 'voided'] }).notNull().default('active'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id),
    voidedReason: text('voided_reason'),
    voidedNote: text('voided_note'),
    verification: text('verification', { enum: ['not_verified', 'original_seen', 'copy_only'] }).notNull().default('not_verified'),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** The period this record renews; the older period is kept unchanged. */
    renewsId: uuid('renews_id'),
    /** Set when a rental pins this period (Rentals module); a locked period is renewed instead of corrected. */
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('customer_documents_company_id_key').on(t.companyId, t.id),
    index('customer_documents_customer_idx').on(t.companyId, t.customerId),
    index('customer_documents_lookup_idx').on(t.companyId, t.numberLookup),
    uniqueIndex('customer_documents_renews_once_key').on(t.renewsId).where(sql`${t.renewsId} is not null and ${t.recordState} <> 'voided'`),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.renewsId], foreignColumns: [t.companyId, t.id] }),
    check(
      'customer_documents_type_check',
      sql`${t.type} in ('national_id', 'passport', 'driving_license', 'international_driving_permit', 'residence_permit', 'visa', 'entry_record', 'other')`,
    ),
    check('customer_documents_country_check', sql`${t.issuingCountry} is null or ${t.issuingCountry} ~ '^[A-Z]{2}$'`),
    check(
      'customer_documents_number_check',
      sql`(${t.numberCiphertext} is null) = (${t.numberKeyId} is null) and (${t.numberCiphertext} is null) = (${t.numberLookup} is null) and (${t.numberCiphertext} is null) = (${t.numberLookupKeyId} is null) and (${t.numberCiphertext} is null) = (${t.numberHint} is null)`,
    ),
    check('customer_documents_dates_check', sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validFrom} <= ${t.validUntil}`),
    check('customer_documents_state_check', sql`${t.recordState} in ('active', 'voided')`),
    check('customer_documents_void_check', sql`(${t.recordState} = 'voided') = (${t.voidedAt} is not null and ${t.voidedReason} is not null)`),
    check('customer_documents_void_reason_check', sql`${t.voidedReason} is null or ${t.voidedReason} in ('entry_error', 'duplicate', 'wrong_customer', 'other')`),
    check('customer_documents_verification_check', sql`${t.verification} in ('not_verified', 'original_seen', 'copy_only')`),
    check('customer_documents_entry_check', sql`${t.type} <> 'entry_record' or (${t.entryDate} is not null and ${t.numberCiphertext} is null)`),
    check('customer_documents_title_check', sql`${t.type} <> 'other' or coalesce(btrim(${t.title}), '') <> ''`),
    check('customer_documents_renews_check', sql`${t.renewsId} is distinct from ${t.id}`),
    check('customer_documents_version_check', sql`${t.version} >= 1`),
  ],
)

/** Encrypted customer document files in private storage. Only the ciphertext's digest is kept (no plaintext digest). */
export const customerFiles = pgTable(
  'customer_files',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    storageKey: text('storage_key').notNull().unique(),
    kind: text('kind', { enum: ['pdf', 'jpeg', 'png'] }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    pages: integer('pages'),
    encKeyId: text('enc_key_id').notNull(),
    ciphertextSha256: text('ciphertext_sha256').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('customer_files_company_id_key').on(t.companyId, t.id),
    check('customer_files_kind_check', sql`${t.kind} in ('pdf', 'jpeg', 'png')`),
    check('customer_files_size_check', sql`${t.sizeBytes} > 0`),
  ],
)

/** Immutable file versions of a document, per side (front, back, extra page). Nothing is replaced in place. */
export const customerDocumentFiles = pgTable(
  'customer_document_files',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    documentId: uuid('document_id').notNull(),
    fileId: uuid('file_id').notNull(),
    side: text('side', { enum: ['front', 'back', 'page'] }).notNull(),
    versionNo: integer('version_no').notNull(),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    unique('customer_document_files_file_key').on(t.fileId),
    unique('customer_document_files_version_key').on(t.documentId, t.versionNo),
    foreignKey({ columns: [t.companyId, t.documentId], foreignColumns: [customerDocuments.companyId, customerDocuments.id] }),
    foreignKey({ columns: [t.companyId, t.fileId], foreignColumns: [customerFiles.companyId, customerFiles.id] }),
    check('customer_document_files_side_check', sql`${t.side} in ('front', 'back', 'page')`),
    check('customer_document_files_version_check', sql`${t.versionNo} >= 1`),
  ],
)

/**
 * Log of sensitive actions used for server-side limits that survive sessions and restarts (full-number reveals and
 * typed document-number checks). Holds who, what kind, when and in which company: never a number, a customer or a
 * document. RLS (0020): a row is visible to its own user and inside its company; inserts only for oneself in the
 * active company; no UPDATE or DELETE for the app, so a counter cannot be reset.
 */
export const userSensitiveActions = pgTable(
  'user_sensitive_actions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    action: text('action').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_sensitive_actions_user_at_idx').on(t.userId, t.action, t.at),
    index('user_sensitive_actions_company_user_at_idx').on(t.companyId, t.userId, t.action, t.at),
    check('user_sensitive_actions_action_check', sql`${t.action} in ('document_number_reveal', 'document_number_check', 'corporate_duplicate_check')`),
  ],
)

// ---------------------------------------------------------------------------
// Customer document requirements per country (M2e). Nothing is active by default: the company owner creates a draft
// (empty, from a passive template or as a copy), edits it and activates it explicitly. Activated versions never change;
// a change is a new version. Legal correctness is the company's responsibility (templates are not legally verified).

export const customerDocumentSettings = pgTable(
  'customer_document_settings',
  {
    companyId: uuid('company_id').primaryKey().references(() => companies.id),
    /** "Expiring" window in days for customer documents. */
    warningDays: integer('warning_days').notNull().default(30),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: updatedAt(),
  },
  (t) => [check('customer_document_settings_warning_check', sql`${t.warningDays} between 1 and 365`)],
)

export const documentRequirementPolicies = pgTable(
  'document_requirement_policies',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    /** Country of the branch where a rental starts (ISO 3166-1). */
    country: text('country').notNull(),
    residencyClass: text('residency_class', { enum: ['local', 'foreign'] }).notNull(),
    version: integer('version').notNull(),
    status: text('status', { enum: ['draft', 'active', 'retired'] }).notNull().default('draft'),
    /** Passive template the draft started from, if any (informational). */
    templateCode: text('template_code'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    activatedBy: uuid('activated_by').references(() => users.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    unique('document_requirement_policies_company_id_key').on(t.companyId, t.id),
    unique('document_requirement_policies_version_key').on(t.companyId, t.country, t.residencyClass, t.version),
    uniqueIndex('document_requirement_policies_active_key').on(t.companyId, t.country, t.residencyClass).where(sql`${t.status} = 'active'`),
    check('document_requirement_policies_country_check', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('document_requirement_policies_class_check', sql`${t.residencyClass} in ('local', 'foreign')`),
    check('document_requirement_policies_status_check', sql`${t.status} in ('draft', 'active', 'retired')`),
    check('document_requirement_policies_version_check', sql`${t.version} >= 1`),
    check('document_requirement_policies_active_check', sql`${t.status} = 'draft' or ${t.activatedAt} is not null or ${t.retiredAt} is not null`),
  ],
)

export const documentRequirementItems = pgTable(
  'document_requirement_items',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    policyId: uuid('policy_id').notNull(),
    position: integer('position').notNull(),
    /** Any one of these document types satisfies the item ("kimlik kartı VEYA oturma izni"). */
    acceptedTypes: text('accepted_types').array().notNull(),
    /** Staff must record that they saw the original (verification "original_seen"). */
    originalSeenRequired: boolean('original_seen_required').notNull().default(false),
    /** A copy (file) must be kept. Separate from seeing the original. */
    copyRequired: boolean('copy_required').notNull().default(false),
  },
  (t) => [
    unique('document_requirement_items_position_key').on(t.policyId, t.position),
    foreignKey({ columns: [t.companyId, t.policyId], foreignColumns: [documentRequirementPolicies.companyId, documentRequirementPolicies.id] }).onDelete('cascade'),
    check('document_requirement_items_types_check', sql`cardinality(${t.acceptedTypes}) between 1 and 8`),
    check('document_requirement_items_position_check', sql`${t.position} between 1 and 20`),
  ],
)

// ---------------------------------------------------------------------------
// Corporate accounts (M3) — docs/M3_KURUMSAL_HESAPLAR_PLANI.md. The commercial party only: people stay in `customers`
// and are linked through corporate_account_people. Every row belongs to one company (forced RLS, composite keys);
// nothing is deleted: accounts are archived, sub-records removed by a mark, links ended.

export const corporateAccounts = pgTable(
  'corporate_accounts',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    accountNo: text('account_no').notNull(),
    legalName: text('legal_name').notNull(),
    /** Accent- and case-free legal name for search and duplicate suggestions. */
    legalNameNormalized: text('legal_name_normalized').notNull(),
    tradeName: text('trade_name'),
    country: text('country').notNull(),
    registrationNumber: text('registration_number'),
    registrationNumberNormalized: text('registration_number_normalized'),
    registrationAuthority: text('registration_authority'),
    preferredLanguage: text('preferred_language'),
    note: text('note'),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedReason: text('archived_reason'),
    archivedBy: uuid('archived_by').references(() => users.id),
    /** Where the record was opened. Informational only: every authorised user of the company can find the account. */
    createdBranchId: uuid('created_branch_id'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('corporate_accounts_company_id_key').on(t.companyId, t.id),
    unique('corporate_accounts_company_no_key').on(t.companyId, t.accountNo),
    index('corporate_accounts_company_name_idx').on(t.companyId, t.status, t.legalNameNormalized),
    index('corporate_accounts_company_created_idx').on(t.companyId, t.createdAt),
    index('corporate_accounts_company_registration_idx').on(t.companyId, t.registrationNumberNormalized),
    foreignKey({ columns: [t.companyId, t.createdBranchId], foreignColumns: [branches.companyId, branches.id] }),
    check('corporate_accounts_no_check', sql`${t.accountNo} ~ '^K-[0-9]{5,}$'`),
    check('corporate_accounts_name_check', sql`btrim(${t.legalName}) <> ''`),
    check('corporate_accounts_country_check', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('corporate_accounts_status_check', sql`${t.status} in ('active', 'archived')`),
    check('corporate_accounts_archive_check', sql`(${t.status} = 'archived') = (${t.archivedAt} is not null and ${t.archivedReason} is not null)`),
    check('corporate_accounts_archive_reason_check', sql`${t.archivedReason} is null or ${t.archivedReason} in ('inactive', 'duplicate', 'customer_request', 'entry_error', 'other')`),
    check('corporate_accounts_version_check', sql`${t.version} >= 1`),
  ],
)

export const corporateContactChannels = pgTable(
  'corporate_contact_channels',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    accountId: uuid('account_id').notNull(),
    kind: text('kind', { enum: ['phone', 'email', 'website', 'other'] }).notNull(),
    value: text('value').notNull(),
    valueNormalized: text('value_normalized').notNull(),
    label: text('label'),
    isPrimary: boolean('is_primary').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.accountId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    index('corporate_channels_account_idx').on(t.companyId, t.accountId),
    index('corporate_channels_value_idx').on(t.companyId, t.valueNormalized),
    uniqueIndex('corporate_channels_primary_key').on(t.companyId, t.accountId, t.kind).where(sql`${t.isPrimary} and ${t.removedAt} is null`),
    check('corporate_channels_kind_check', sql`${t.kind} in ('phone', 'email', 'website', 'other')`),
    check('corporate_channels_value_check', sql`btrim(${t.value}) <> '' and ${t.valueNormalized} <> ''`),
    check('corporate_channels_version_check', sql`${t.version} >= 1`),
  ],
)

export const corporateTaxIds = pgTable(
  'corporate_tax_ids',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    accountId: uuid('account_id').notNull(),
    country: text('country').notNull(),
    scheme: text('scheme').notNull(),
    value: text('value').notNull(),
    valueNormalized: text('value_normalized').notNull(),
    validity: text('validity', { enum: ['not_checked', 'checked_by_staff', 'no_longer_used'] }).notNull().default('not_checked'),
    note: text('note'),
    isPrimary: boolean('is_primary').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.accountId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    index('corporate_tax_ids_account_idx').on(t.companyId, t.accountId),
    index('corporate_tax_ids_value_idx').on(t.companyId, t.valueNormalized),
    // D2: unique within one account; the same value on another account is a duplicate suggestion, not a block.
    uniqueIndex('corporate_tax_ids_account_value_key').on(t.companyId, t.accountId, t.country, t.scheme, t.valueNormalized).where(sql`${t.removedAt} is null`),
    uniqueIndex('corporate_tax_ids_primary_key').on(t.companyId, t.accountId).where(sql`${t.isPrimary} and ${t.removedAt} is null`),
    check('corporate_tax_ids_country_check', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('corporate_tax_ids_scheme_check', sql`${t.scheme} ~ '^[A-Z0-9_]{2,16}$'`),
    check('corporate_tax_ids_value_check', sql`btrim(${t.value}) <> '' and ${t.valueNormalized} <> ''`),
    check('corporate_tax_ids_validity_check', sql`${t.validity} in ('not_checked', 'checked_by_staff', 'no_longer_used')`),
    check('corporate_tax_ids_version_check', sql`${t.version} >= 1`),
  ],
)

export const corporateAddresses = pgTable(
  'corporate_addresses',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    accountId: uuid('account_id').notNull(),
    kind: text('kind', { enum: ['registered', 'billing', 'postal', 'other'] }).notNull(),
    label: text('label'),
    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city').notNull(),
    region: text('region'),
    postalCode: text('postal_code'),
    country: text('country').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.accountId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    index('corporate_addresses_account_idx').on(t.companyId, t.accountId),
    uniqueIndex('corporate_addresses_primary_key').on(t.companyId, t.accountId, t.kind).where(sql`${t.isPrimary} and ${t.removedAt} is null`),
    check('corporate_addresses_kind_check', sql`${t.kind} in ('registered', 'billing', 'postal', 'other')`),
    check('corporate_addresses_country_check', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('corporate_addresses_text_check', sql`btrim(${t.line1}) <> '' and btrim(${t.city}) <> ''`),
    check('corporate_addresses_version_check', sql`${t.version} >= 1`),
  ],
)

export const corporateAccountPeople = pgTable(
  'corporate_account_people',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    accountId: uuid('account_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    roles: text('roles').array().notNull(),
    jobTitle: text('job_title'),
    note: text('note'),
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endedBy: uuid('ended_by').references(() => users.id),
    endedReason: text('ended_reason'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.accountId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    index('corporate_people_account_idx').on(t.companyId, t.accountId),
    index('corporate_people_customer_idx').on(t.companyId, t.customerId),
    // D9: one active link per account and person; ended links stay as history.
    uniqueIndex('corporate_people_active_key').on(t.companyId, t.accountId, t.customerId).where(sql`${t.endedAt} is null`),
    check(
      'corporate_people_roles_check',
      sql`cardinality(${t.roles}) between 1 and 6 and ${t.roles} <@ array['representative', 'contact', 'booker', 'authorized_driver', 'billing_contact', 'other']::text[]`,
    ),
    check('corporate_people_period_check', sql`${t.validUntil} is null or ${t.validFrom} is null or ${t.validUntil} >= ${t.validFrom}`),
    check('corporate_people_end_check', sql`(${t.endedAt} is null) = (${t.endedReason} is null)`),
    check('corporate_people_end_reason_check', sql`${t.endedReason} is null or ${t.endedReason} in ('left_company', 'role_ended', 'entry_error', 'other')`),
    check('corporate_people_version_check', sql`${t.version} >= 1`),
  ],
)

// ---------------------------------------------------------------------------
// Reservations V1 — docs/REZERVASYON_YONETIMI_PLANI.md. A reservation works with one customer (person) and may carry a
// corporate account context; people are referenced, never copied. Nothing is deleted: reservations end as cancelled or
// no-show, drivers are removed by a mark, status events are append-only. Price is not stored (no pricing module yet).

export const reservations = pgTable(
  'reservations',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    reservationNo: text('reservation_no').notNull(),
    status: text('status', { enum: ['pending', 'confirmed', 'converted', 'cancelled', 'no_show'] }).notNull().default('pending'),
    source: text('source').notNull(),
    customerId: uuid('customer_id').notNull(),
    corporateAccountId: uuid('corporate_account_id'),
    bookerCustomerId: uuid('booker_customer_id'),
    vehicleClassId: uuid('vehicle_class_id').notNull(),
    vehicleId: uuid('vehicle_id'),
    pickupBranchId: uuid('pickup_branch_id').notNull(),
    returnBranchId: uuid('return_branch_id').notNull(),
    pickupAt: timestamp('pickup_at', { withTimezone: true }).notNull(),
    returnAt: timestamp('return_at', { withTimezone: true }).notNull(),
    /** Time zone the pickup / return wall time was entered in (the branch's zone at that time). */
    pickupTimezone: text('pickup_timezone').notNull(),
    returnTimezone: text('return_timezone').notNull(),
    note: text('note'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    cancelNote: text('cancel_note'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    noShowReason: text('no_show_reason'),
    noShowNote: text('no_show_note'),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    noShowBy: uuid('no_show_by').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('reservations_company_id_key').on(t.companyId, t.id),
    unique('reservations_company_no_key').on(t.companyId, t.reservationNo),
    index('reservations_company_pickup_idx').on(t.companyId, t.pickupAt),
    index('reservations_company_status_pickup_idx').on(t.companyId, t.status, t.pickupAt),
    index('reservations_company_vehicle_idx').on(t.companyId, t.vehicleId, t.pickupAt),
    index('reservations_company_customer_idx').on(t.companyId, t.customerId),
    index('reservations_company_account_idx').on(t.companyId, t.corporateAccountId),
    index('reservations_company_created_idx').on(t.companyId, t.createdAt),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.bookerCustomerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.corporateAccountId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    foreignKey({ columns: [t.companyId, t.vehicleClassId], foreignColumns: [vehicleClasses.companyId, vehicleClasses.id] }),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.pickupBranchId], foreignColumns: [branches.companyId, branches.id] }),
    foreignKey({ columns: [t.companyId, t.returnBranchId], foreignColumns: [branches.companyId, branches.id] }),
    check('reservations_no_check', sql`${t.reservationNo} ~ '^R-[0-9]{6,}$'`),
    check('reservations_status_check', sql`${t.status} in ('pending', 'confirmed', 'converted', 'cancelled', 'no_show')`),
    check('reservations_source_check', sql`${t.source} in ('direct_walk_in', 'phone', 'website', 'partner', 'corporate', 'returning_customer', 'other')`),
    check('reservations_period_check', sql`${t.returnAt} > ${t.pickupAt}`),
    check('reservations_confirmed_vehicle_check', sql`${t.status} <> 'confirmed' or ${t.vehicleId} is not null`),
    check('reservations_cancel_check', sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null and ${t.cancelReason} is not null)`),
    check('reservations_cancel_reason_check', sql`${t.cancelReason} is null or ${t.cancelReason} in ('customer_request', 'no_vehicle', 'duplicate', 'entry_error', 'other')`),
    check('reservations_no_show_check', sql`(${t.status} = 'no_show') = (${t.noShowAt} is not null and ${t.noShowReason} is not null)`),
    check('reservations_no_show_reason_check', sql`${t.noShowReason} is null or ${t.noShowReason} in ('did_not_arrive', 'unreachable', 'arrived_without_requirements', 'other')`),
    check('reservations_version_check', sql`${t.version} >= 1`),
  ],
)

export const reservationDrivers = pgTable(
  'reservation_drivers',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    reservationId: uuid('reservation_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.reservationId], foreignColumns: [reservations.companyId, reservations.id] }),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    index('reservation_drivers_reservation_idx').on(t.companyId, t.reservationId),
    index('reservation_drivers_customer_idx').on(t.companyId, t.customerId),
    uniqueIndex('reservation_drivers_active_key').on(t.companyId, t.reservationId, t.customerId).where(sql`${t.removedAt} is null`),
    uniqueIndex('reservation_drivers_primary_key').on(t.companyId, t.reservationId).where(sql`${t.isPrimary} and ${t.removedAt} is null`),
  ],
)

export const reservationStatusEvents = pgTable(
  'reservation_status_events',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    reservationId: uuid('reservation_id').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    note: text('note'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.reservationId], foreignColumns: [reservations.companyId, reservations.id] }),
    index('reservation_status_events_reservation_idx').on(t.companyId, t.reservationId, t.at),
    check('reservation_status_events_to_check', sql`${t.toStatus} in ('pending', 'confirmed', 'converted', 'cancelled', 'no_show')`),
  ],
)

// ---------------------------------------------------------------------------
// Rentals, handover and return V1 — docs/KIRALAMA_TESLIM_IADE_PLANI.md (spec §10, §59B, §59L, §59CY, §83.4).
// Every row belongs to one company (forced RLS, composite keys). Nothing is deleted: rentals are cancelled or closed,
// drivers and draft photos and marks removed by a mark; final inspections, document checks and events never change.
// No price, payment, deposit or contract is stored here: those modules do not exist yet (K1).

export const RENTAL_STATUS_VALUES = ['prepared', 'delivered', 'returned', 'closed', 'cancelled'] as const

export const rentals = pgTable(
  'rentals',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    rentalNo: text('rental_no').notNull(),
    status: text('status', { enum: RENTAL_STATUS_VALUES }).notNull().default('prepared'),
    origin: text('origin', { enum: ['reservation', 'direct'] }).notNull(),
    reservationId: uuid('reservation_id'),
    customerId: uuid('customer_id').notNull(),
    corporateAccountId: uuid('corporate_account_id'),
    vehicleClassId: uuid('vehicle_class_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    pickupBranchId: uuid('pickup_branch_id').notNull(),
    returnBranchId: uuid('return_branch_id').notNull(),
    plannedPickupAt: timestamp('planned_pickup_at', { withTimezone: true }).notNull(),
    plannedReturnAt: timestamp('planned_return_at', { withTimezone: true }).notNull(),
    pickupTimezone: text('pickup_timezone').notNull(),
    returnTimezone: text('return_timezone').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    deliveredBy: uuid('delivered_by').references(() => users.id),
    /** K1: staff stated that the contract was made and completed outside ACARVO for this handover. */
    externalTermsAckAt: timestamp('external_terms_ack_at', { withTimezone: true }),
    externalTermsAckBy: uuid('external_terms_ack_by').references(() => users.id),
    /** K1 (0029): separate statement that pricing was set and settled outside ACARVO, and the external reference. */
    externalPricingAckAt: timestamp('external_pricing_ack_at', { withTimezone: true }),
    externalPricingAckBy: uuid('external_pricing_ack_by').references(() => users.id),
    externalReference: text('external_reference'),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    returnedBy: uuid('returned_by').references(() => users.id),
    actualReturnBranchId: uuid('actual_return_branch_id'),
    actualReturnTimezone: text('actual_return_timezone'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    cancelNote: text('cancel_note'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    note: text('note'),
    clientRequestId: uuid('client_request_id'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('rentals_company_id_key').on(t.companyId, t.id),
    unique('rentals_company_no_key').on(t.companyId, t.rentalNo),
    uniqueIndex('rentals_reservation_key').on(t.companyId, t.reservationId).where(sql`${t.reservationId} is not null`),
    uniqueIndex('rentals_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    index('rentals_company_status_pickup_idx').on(t.companyId, t.status, t.plannedPickupAt),
    index('rentals_company_pickup_idx').on(t.companyId, t.plannedPickupAt),
    index('rentals_company_return_idx').on(t.companyId, t.plannedReturnAt),
    index('rentals_company_vehicle_idx').on(t.companyId, t.vehicleId, t.plannedPickupAt),
    index('rentals_company_customer_idx').on(t.companyId, t.customerId),
    index('rentals_company_account_idx').on(t.companyId, t.corporateAccountId),
    index('rentals_company_created_idx').on(t.companyId, t.createdAt),
    foreignKey({ columns: [t.companyId, t.reservationId], foreignColumns: [reservations.companyId, reservations.id] }),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.corporateAccountId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    foreignKey({ columns: [t.companyId, t.vehicleClassId], foreignColumns: [vehicleClasses.companyId, vehicleClasses.id] }),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.pickupBranchId], foreignColumns: [branches.companyId, branches.id] }),
    foreignKey({ columns: [t.companyId, t.returnBranchId], foreignColumns: [branches.companyId, branches.id] }),
    foreignKey({ columns: [t.companyId, t.actualReturnBranchId], foreignColumns: [branches.companyId, branches.id] }),
    check('rentals_no_check', sql`${t.rentalNo} ~ '^K-[0-9]{6,}$'`),
    check('rentals_status_check', sql`${t.status} in ('prepared', 'delivered', 'returned', 'closed', 'cancelled')`),
    check('rentals_origin_check', sql`(${t.origin} = 'reservation') = (${t.reservationId} is not null)`),
    check('rentals_period_check', sql`${t.plannedReturnAt} > ${t.plannedPickupAt}`),
    check('rentals_delivered_check', sql`(${t.status} in ('delivered', 'returned', 'closed')) = (${t.deliveredAt} is not null and ${t.deliveredBy} is not null)`),
    check('rentals_returned_check', sql`(${t.status} in ('returned', 'closed')) = (${t.returnedAt} is not null and ${t.actualReturnBranchId} is not null and ${t.actualReturnTimezone} is not null)`),
    check('rentals_return_after_delivery_check', sql`${t.returnedAt} is null or ${t.returnedAt} > ${t.deliveredAt}`),
    check('rentals_closed_check', sql`(${t.status} = 'closed') = (${t.closedAt} is not null)`),
    check('rentals_cancel_check', sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null and ${t.cancelReason} is not null)`),
    check('rentals_cancel_reason_check', sql`${t.cancelReason} is null or ${t.cancelReason} in ('customer_request', 'vehicle_problem', 'documents_missing', 'entry_error', 'other')`),
    check('rentals_version_check', sql`${t.version} >= 1`),
    check('rentals_external_reference_check', sql`${t.externalReference} is null or (char_length(${t.externalReference}) between 3 and 40 and ${t.externalReference} ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$')`),
  ],
)

/**
 * K1: the company's rental operating mode. External contract/pricing mode lets handovers proceed on staff statements
 * while ACARVO has no contract or pricing module. Off unless the company owner turns it on; no row = off.
 */
export const companyRentalSettings = pgTable('company_rental_settings', {
  companyId: uuid('company_id').primaryKey().references(() => companies.id),
  externalTermsMode: boolean('external_terms_mode').notNull().default(false),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: updatedAt(),
})

export const rentalDrivers = pgTable(
  'rental_drivers',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    rentalId: uuid('rental_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    index('rental_drivers_rental_idx').on(t.companyId, t.rentalId),
    index('rental_drivers_customer_idx').on(t.companyId, t.customerId),
    uniqueIndex('rental_drivers_active_key').on(t.companyId, t.rentalId, t.customerId).where(sql`${t.removedAt} is null`),
    uniqueIndex('rental_drivers_primary_key').on(t.companyId, t.rentalId).where(sql`${t.isPrimary} and ${t.removedAt} is null`),
  ],
)

/** Append-only lifecycle and operation events; the request id makes a resent request return the first result. */
export const rentalEvents = pgTable(
  'rental_events',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    rentalId: uuid('rental_id').notNull(),
    kind: text('kind').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    reason: text('reason'),
    /** Numbers, times and codes only: no names, contacts, document numbers or free text. */
    data: jsonb('data').$type<Record<string, unknown>>(),
    clientRequestId: uuid('client_request_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('rental_events_company_id_key').on(t.companyId, t.id),
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    index('rental_events_rental_idx').on(t.companyId, t.rentalId, t.at),
    uniqueIndex('rental_events_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    check('rental_events_kind_check', sql`${t.kind} in ('created', 'updated', 'document_check', 'delivered', 'extended', 'returned', 'closed', 'cancelled')`),
    check('rental_events_to_check', sql`${t.toStatus} in ('prepared', 'delivered', 'returned', 'closed', 'cancelled')`),
  ],
)

/**
 * The applied document decision of one driver (spec §10.3 "Kiralama Dosyası"): staff's local/foreign choice, the
 * reference country (pickup branch), the policy and version if one was active, the document record ids considered
 * and staff's decision. Immutable; a new decision is a new row and the latest one counts.
 */
export const rentalDocumentChecks = pgTable(
  'rental_document_checks',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    rentalId: uuid('rental_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    driverRole: text('driver_role', { enum: ['primary', 'additional'] }).notNull(),
    residencyClass: text('residency_class', { enum: ['local', 'foreign'] }).notNull(),
    referenceCountry: text('reference_country'),
    ruleStatus: text('rule_status', { enum: ['policy_applied', 'no_policy', 'branch_country_missing'] }).notNull(),
    policyId: uuid('policy_id'),
    policyVersion: integer('policy_version'),
    /** Items of the applied policy: each is "any one of these types". Empty when no policy applied. */
    requiredItems: jsonb('required_items').$type<{ acceptedTypes: string[] }[]>().notNull().default(sql`'[]'::jsonb`),
    /** Customer document record ids (immutable versions) that were valid for the period. Never numbers. */
    documentIds: uuid('document_ids').array().notNull().default(sql`'{}'::uuid[]`),
    decision: text('decision', { enum: ['eligible', 'not_eligible'] }).notNull(),
    note: text('note'),
    checkedBy: uuid('checked_by').references(() => users.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    foreignKey({ columns: [t.companyId, t.customerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.policyId], foreignColumns: [documentRequirementPolicies.companyId, documentRequirementPolicies.id] }),
    index('rental_document_checks_rental_idx').on(t.companyId, t.rentalId, t.checkedAt),
    check('rental_document_checks_country_check', sql`${t.referenceCountry} is null or ${t.referenceCountry} ~ '^[A-Z]{2}$'`),
    check('rental_document_checks_rule_check', sql`(${t.ruleStatus} = 'policy_applied') = (${t.policyId} is not null and ${t.policyVersion} is not null)`),
    check('rental_document_checks_country_rule_check', sql`(${t.ruleStatus} = 'branch_country_missing') = (${t.referenceCountry} is null)`),
    check('rental_document_checks_note_check', sql`${t.note} is null or char_length(${t.note}) <= 500`),
  ],
)

export const rentalInspections = pgTable(
  'rental_inspections',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    rentalId: uuid('rental_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),
    kind: text('kind', { enum: ['handover', 'return'] }).notNull(),
    state: text('state', { enum: ['draft', 'final'] }).notNull().default('draft'),
    km: integer('km'),
    fuel: text('fuel'),
    cleanliness: text('cleanliness'),
    condition: text('condition'),
    /** Each item answered explicitly ('ok' | 'missing' | 'not_applicable'); unanswered items are absent, never "ok". */
    checklist: jsonb('checklist').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    notes: text('notes'),
    /** The driver who received (handover) or brought back (return) the vehicle. */
    counterpartCustomerId: uuid('counterpart_customer_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    branchId: uuid('branch_id'),
    performedBy: uuid('performed_by').references(() => users.id),
    odometerReadingId: uuid('odometer_reading_id'),
    locationEventId: uuid('location_event_id'),
    /** Return only: staff saw the new damage findings (no damage case, liability or charge is created). */
    findingsAcknowledgedAt: timestamp('findings_acknowledged_at', { withTimezone: true }),
    findingsAcknowledgedBy: uuid('findings_acknowledged_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    finalizedBy: uuid('finalized_by').references(() => users.id),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('rental_inspections_company_id_key').on(t.companyId, t.id),
    unique('rental_inspections_kind_key').on(t.companyId, t.rentalId, t.kind),
    index('rental_inspections_vehicle_idx').on(t.companyId, t.vehicleId, t.occurredAt),
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.counterpartCustomerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }),
    foreignKey({ columns: [t.companyId, t.odometerReadingId], foreignColumns: [odometerReadings.companyId, odometerReadings.id] }),
    foreignKey({ columns: [t.companyId, t.locationEventId], foreignColumns: [vehicleLocationEvents.companyId, vehicleLocationEvents.id] }),
    check('rental_inspections_kind_check', sql`${t.kind} in ('handover', 'return')`),
    check('rental_inspections_state_check', sql`${t.state} in ('draft', 'final')`),
    check('rental_inspections_km_check', sql`${t.km} is null or ${t.km} between 0 and 3000000`),
    check('rental_inspections_fuel_check', sql`${t.fuel} is null or ${t.fuel} in ('empty', 'quarter', 'half', 'three_quarters', 'full')`),
    check('rental_inspections_cleanliness_check', sql`${t.cleanliness} is null or ${t.cleanliness} in ('clean', 'acceptable', 'dirty')`),
    check('rental_inspections_condition_check', sql`${t.condition} is null or ${t.condition} in ('good', 'minor_issues', 'needs_attention')`),
    check('rental_inspections_notes_check', sql`${t.notes} is null or char_length(${t.notes}) <= 2000`),
    check(
      'rental_inspections_final_check',
      sql`${t.state} = 'draft' or (${t.finalizedAt} is not null and ${t.km} is not null and ${t.fuel} is not null and ${t.occurredAt} is not null and ${t.branchId} is not null and ${t.performedBy} is not null)`,
    ),
    check('rental_inspections_version_check', sql`${t.version} >= 1`),
  ],
)

export const rentalInspectionPhotos = pgTable(
  'rental_inspection_photos',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    inspectionId: uuid('inspection_id').notNull(),
    fileId: uuid('file_id').notNull(),
    angle: text('angle', { enum: ['front', 'rear', 'left', 'right', 'interior', 'other'] }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('rental_inspection_photos_company_id_key').on(t.companyId, t.id),
    unique('rental_inspection_photos_file_key').on(t.fileId),
    index('rental_inspection_photos_inspection_idx').on(t.companyId, t.inspectionId),
    foreignKey({ columns: [t.companyId, t.inspectionId], foreignColumns: [rentalInspections.companyId, rentalInspections.id] }),
    foreignKey({ columns: [t.companyId, t.fileId], foreignColumns: [files.companyId, files.id] }),
    check('rental_inspection_photos_angle_check', sql`${t.angle} in ('front', 'rear', 'left', 'right', 'interior', 'other')`),
  ],
)

/** A mark on the body outline (spec §83.4). Not a damage case and not a charge. */
export const rentalDamageMarks = pgTable(
  'rental_damage_marks',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    inspectionId: uuid('inspection_id').notNull(),
    view: text('view', { enum: ['front', 'rear', 'left', 'right', 'top'] }).notNull(),
    /** Position on the outline in thousandths of its width and height. */
    xPermille: integer('x_permille').notNull(),
    yPermille: integer('y_permille').notNull(),
    category: text('category', { enum: ['scratch', 'dent', 'crack', 'stain', 'missing_part', 'other'] }).notNull(),
    note: text('note'),
    photoId: uuid('photo_id'),
    /** Return marks only: the handover mark this one is the same damage as. Null on a return mark = new finding. */
    existingMarkId: uuid('existing_mark_id'),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references(() => users.id),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('rental_damage_marks_company_id_key').on(t.companyId, t.id),
    index('rental_damage_marks_inspection_idx').on(t.companyId, t.inspectionId),
    foreignKey({ columns: [t.companyId, t.inspectionId], foreignColumns: [rentalInspections.companyId, rentalInspections.id] }),
    foreignKey({ columns: [t.companyId, t.photoId], foreignColumns: [rentalInspectionPhotos.companyId, rentalInspectionPhotos.id] }),
    foreignKey({ columns: [t.companyId, t.existingMarkId], foreignColumns: [t.companyId, t.id] }),
    check('rental_damage_marks_view_check', sql`${t.view} in ('front', 'rear', 'left', 'right', 'top')`),
    check('rental_damage_marks_position_check', sql`${t.xPermille} between 0 and 1000 and ${t.yPermille} between 0 and 1000`),
    check('rental_damage_marks_category_check', sql`${t.category} in ('scratch', 'dent', 'crack', 'stain', 'missing_part', 'other')`),
    check('rental_damage_marks_note_check', sql`${t.note} is null or char_length(${t.note}) <= 300`),
  ],
)

// ---------------------------------------------------------------------------
// Pricing and contracts V1 — docs/FIYATLANDIRMA_SOZLESME_PLANI.md. Every row belongs to one company (forced RLS,
// composite keys). A price list's calculation rules live in immutable revisions: each save writes a new revision with
// its own rates, seasons, extras and discounts, so quotes that pinned an older revision never change. Nothing is
// deleted. No payment, debt, deposit or invoice is stored here (Finance does not exist yet).

export const priceLists = pgTable(
  'price_lists',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    /** ISO 4217; fixed for the list's life (quotes of one list share one transaction currency). */
    currency: text('currency').notNull(),
    status: text('status', { enum: ['draft', 'active', 'archived'] }).notNull().default('draft'),
    /** Null = every branch of the company. */
    branchId: uuid('branch_id'),
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),
    priority: integer('priority').notNull().default(0),
    currentRevision: integer('current_revision').notNull().default(1),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('price_lists_company_id_key').on(t.companyId, t.id),
    index('price_lists_company_status_idx').on(t.companyId, t.status, t.priority),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }),
    check('price_lists_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('price_lists_status_check', sql`${t.status} in ('draft', 'active', 'archived')`),
    check('price_lists_valid_check', sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validUntil} >= ${t.validFrom}`),
    check('price_lists_priority_check', sql`${t.priority} between 0 and 1000`),
    check('price_lists_name_check', sql`char_length(${t.name}) between 1 and 80`),
    check('price_lists_version_check', sql`${t.version} >= 1 and ${t.currentRevision} >= 1`),
  ],
)

export const priceListRevisions = pgTable(
  'price_list_revisions',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    priceListId: uuid('price_list_id').notNull(),
    revision: integer('revision').notNull(),
    dayMethod: text('day_method', { enum: ['rolling_24h', 'calendar_day'] }).notNull(),
    graceMinutes: integer('grace_minutes').notNull(),
    minDays: integer('min_days').notNull(),
    taxMode: text('tax_mode', { enum: ['not_configured', 'exclusive', 'inclusive'] }).notNull(),
    taxRateBp: integer('tax_rate_bp'),
    taxLabel: text('tax_label'),
    note: text('note'),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('price_list_revisions_key').on(t.companyId, t.priceListId, t.revision),
    foreignKey({ columns: [t.companyId, t.priceListId], foreignColumns: [priceLists.companyId, priceLists.id] }),
    check('price_list_revisions_day_method_check', sql`${t.dayMethod} in ('rolling_24h', 'calendar_day')`),
    check('price_list_revisions_grace_check', sql`${t.graceMinutes} between 0 and 180`),
    check('price_list_revisions_min_days_check', sql`${t.minDays} between 1 and 30`),
    check('price_list_revisions_tax_check', sql`${t.taxMode} in ('not_configured', 'exclusive', 'inclusive') and ((${t.taxMode} = 'not_configured') = (${t.taxRateBp} is null))`),
    check('price_list_revisions_tax_rate_check', sql`${t.taxRateBp} is null or ${t.taxRateBp} between 1 and 10000`),
    check('price_list_revisions_revision_check', sql`${t.revision} >= 1`),
  ],
)

const revisionFk = (t: { companyId: AnyPgColumn; priceListId: AnyPgColumn; revision: AnyPgColumn }) =>
  foreignKey({ columns: [t.companyId, t.priceListId, t.revision], foreignColumns: [priceListRevisions.companyId, priceListRevisions.priceListId, priceListRevisions.revision] })

export const priceListRates = pgTable(
  'price_list_rates',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    priceListId: uuid('price_list_id').notNull(),
    revision: integer('revision').notNull(),
    vehicleClassId: uuid('vehicle_class_id').notNull(),
    rate1to6Minor: bigint('rate_1_6_minor', { mode: 'number' }).notNull(),
    rate7to29Minor: bigint('rate_7_29_minor', { mode: 'number' }),
    rate30plusMinor: bigint('rate_30_plus_minor', { mode: 'number' }),
  },
  (t) => [
    unique('price_list_rates_class_key').on(t.companyId, t.priceListId, t.revision, t.vehicleClassId),
    revisionFk(t),
    foreignKey({ columns: [t.companyId, t.vehicleClassId], foreignColumns: [vehicleClasses.companyId, vehicleClasses.id] }),
    check('price_list_rates_amount_check', sql`${t.rate1to6Minor} between 0 and 10000000000 and coalesce(${t.rate7to29Minor}, 0) between 0 and 10000000000 and coalesce(${t.rate30plusMinor}, 0) between 0 and 10000000000`),
  ],
)

export const priceListSeasons = pgTable(
  'price_list_seasons',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    priceListId: uuid('price_list_id').notNull(),
    revision: integer('revision').notNull(),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    vehicleClassId: uuid('vehicle_class_id'),
    percentBp: integer('percent_bp').notNull(),
    priority: integer('priority').notNull(),
    active: boolean('active').notNull(),
  },
  (t) => [
    index('price_list_seasons_list_idx').on(t.companyId, t.priceListId, t.revision),
    revisionFk(t),
    foreignKey({ columns: [t.companyId, t.vehicleClassId], foreignColumns: [vehicleClasses.companyId, vehicleClasses.id] }),
    check('price_list_seasons_dates_check', sql`${t.endDate} >= ${t.startDate}`),
    check('price_list_seasons_percent_check', sql`${t.percentBp} between -9000 and 50000`),
    check('price_list_seasons_priority_check', sql`${t.priority} between 0 and 1000`),
  ],
)

export const priceListExtras = pgTable(
  'price_list_extras',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    priceListId: uuid('price_list_id').notNull(),
    revision: integer('revision').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['standard', 'additional_driver'] }).notNull(),
    mode: text('mode', { enum: ['per_day', 'per_rental'] }).notNull(),
    priceMinor: bigint('price_minor', { mode: 'number' }).notNull(),
    maxQuantity: integer('max_quantity').notNull(),
    taxable: boolean('taxable').notNull(),
    active: boolean('active').notNull(),
  },
  (t) => [
    unique('price_list_extras_code_key').on(t.companyId, t.priceListId, t.revision, t.code),
    revisionFk(t),
    check('price_list_extras_kind_check', sql`${t.kind} in ('standard', 'additional_driver') and ${t.mode} in ('per_day', 'per_rental')`),
    check('price_list_extras_amount_check', sql`${t.priceMinor} between 0 and 10000000000 and ${t.maxQuantity} between 1 and 20`),
    check('price_list_extras_code_check', sql`${t.code} ~ '^[A-Z0-9_-]{2,20}$'`),
  ],
)

export const priceListDiscounts = pgTable(
  'price_list_discounts',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    priceListId: uuid('price_list_id').notNull(),
    revision: integer('revision').notNull(),
    name: text('name').notNull(),
    type: text('type', { enum: ['percent', 'fixed'] }).notNull(),
    value: bigint('value', { mode: 'number' }).notNull(),
    minDays: integer('min_days').notNull(),
    active: boolean('active').notNull(),
  },
  (t) => [
    index('price_list_discounts_list_idx').on(t.companyId, t.priceListId, t.revision),
    revisionFk(t),
    check('price_list_discounts_check', sql`${t.type} in ('percent', 'fixed') and ${t.value} >= 1 and (${t.type} <> 'percent' or ${t.value} <= 10000) and ${t.value} <= 10000000000 and ${t.minDays} between 1 and 366`),
  ],
)

/** A price quote (spec §67: a preview, never a Charge). Immutable; a new quote supersedes the previous one. */
export const priceQuotes = pgTable(
  'price_quotes',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    quoteNo: text('quote_no').notNull(),
    status: text('status', { enum: ['quoted', 'superseded'] }).notNull().default('quoted'),
    reservationId: uuid('reservation_id'),
    rentalId: uuid('rental_id'),
    priceListId: uuid('price_list_id').notNull(),
    priceListRevision: integer('price_list_revision').notNull(),
    currency: text('currency').notNull(),
    vehicleClassId: uuid('vehicle_class_id').notNull(),
    pickupAt: timestamp('pickup_at', { withTimezone: true }).notNull(),
    returnAt: timestamp('return_at', { withTimezone: true }).notNull(),
    pickupTimezone: text('pickup_timezone').notNull(),
    days: integer('days').notNull(),
    tier: text('tier').notNull(),
    dayMethod: text('day_method').notNull(),
    /** What was asked: extras and quantities, discount, additional drivers. */
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull(),
    /** The calculation lines with their sources and revision. */
    lines: jsonb('lines').$type<unknown[]>().notNull(),
    netMinor: bigint('net_minor', { mode: 'number' }).notNull(),
    taxMinor: bigint('tax_minor', { mode: 'number' }),
    grossMinor: bigint('gross_minor', { mode: 'number' }),
    taxStatus: text('tax_status', { enum: ['complete', 'not_configured'] }).notNull(),
    engineVersion: text('engine_version').notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
    clientRequestId: uuid('client_request_id').notNull(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededById: uuid('superseded_by_id'),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('price_quotes_company_id_key').on(t.companyId, t.id),
    unique('price_quotes_company_no_key').on(t.companyId, t.quoteNo),
    unique('price_quotes_request_key').on(t.companyId, t.clientRequestId),
    uniqueIndex('price_quotes_reservation_current_key').on(t.companyId, t.reservationId).where(sql`${t.status} = 'quoted' and ${t.reservationId} is not null`),
    uniqueIndex('price_quotes_rental_current_key').on(t.companyId, t.rentalId).where(sql`${t.status} = 'quoted' and ${t.rentalId} is not null`),
    index('price_quotes_reservation_idx').on(t.companyId, t.reservationId, t.createdAt),
    index('price_quotes_rental_idx').on(t.companyId, t.rentalId, t.createdAt),
    index('price_quotes_list_idx').on(t.companyId, t.priceListId),
    foreignKey({ columns: [t.companyId, t.reservationId], foreignColumns: [reservations.companyId, reservations.id] }),
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    foreignKey({ columns: [t.companyId, t.priceListId, t.priceListRevision], foreignColumns: [priceListRevisions.companyId, priceListRevisions.priceListId, priceListRevisions.revision] }),
    foreignKey({ columns: [t.companyId, t.vehicleClassId], foreignColumns: [vehicleClasses.companyId, vehicleClasses.id] }),
    check('price_quotes_no_check', sql`${t.quoteNo} ~ '^Q-[0-9]{6,}$'`),
    check('price_quotes_target_check', sql`(${t.reservationId} is null) <> (${t.rentalId} is null)`),
    check('price_quotes_status_check', sql`${t.status} in ('quoted', 'superseded') and ((${t.status} = 'superseded') = (${t.supersededAt} is not null))`),
    check('price_quotes_tax_check', sql`${t.taxStatus} in ('complete', 'not_configured') and ((${t.taxStatus} = 'complete') = (${t.taxMinor} is not null and ${t.grossMinor} is not null))`),
    check('price_quotes_period_check', sql`${t.returnAt} > ${t.pickupAt} and ${t.days} >= 1`),
    check('price_quotes_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
)

export const contractTemplates = pgTable(
  'contract_templates',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    name: text('name').notNull(),
    language: text('language').notNull(),
    country: text('country'),
    /** Started from ACARVO's clearly marked sample text (not legal advice). */
    isSample: boolean('is_sample').notNull().default(false),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    unique('contract_templates_company_id_key').on(t.companyId, t.id),
    check('contract_templates_language_check', sql`${t.language} in ('tr', 'bs', 'en', 'de', 'hr', 'sr')`),
    check('contract_templates_country_check', sql`${t.country} is null or ${t.country} ~ '^[A-Z]{2}$'`),
    check('contract_templates_name_check', sql`char_length(${t.name}) between 1 and 80`),
  ],
)

export const contractTemplateVersions = pgTable(
  'contract_template_versions',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    templateId: uuid('template_id').notNull(),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: ['draft', 'active', 'retired'] }).notNull().default('draft'),
    body: text('body').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    activatedBy: uuid('activated_by').references(() => users.id),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    unique('contract_template_versions_company_id_key').on(t.companyId, t.id),
    unique('contract_template_versions_no_key').on(t.companyId, t.templateId, t.versionNo),
    uniqueIndex('contract_template_versions_active_key').on(t.companyId, t.templateId).where(sql`${t.status} = 'active'`),
    uniqueIndex('contract_template_versions_draft_key').on(t.companyId, t.templateId).where(sql`${t.status} = 'draft'`),
    foreignKey({ columns: [t.companyId, t.templateId], foreignColumns: [contractTemplates.companyId, contractTemplates.id] }),
    check('contract_template_versions_status_check', sql`${t.status} in ('draft', 'active', 'retired')`),
    check('contract_template_versions_body_check', sql`char_length(${t.body}) <= 20000`),
    check('contract_template_versions_active_check', sql`${t.status} = 'draft' or ${t.activatedAt} is not null`),
  ],
)

export const CONTRACT_STATUS_VALUES = ['draft', 'under_review', 'externally_processed', 'archived', 'superseded'] as const

/** A rental contract (spec §83.2): numbered, versioned, with an immutable snapshot. No e-signature state exists. */
export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    contractNo: text('contract_no').notNull(),
    revision: integer('revision').notNull().default(1),
    supersedesId: uuid('supersedes_id'),
    status: text('status', { enum: CONTRACT_STATUS_VALUES }).notNull().default('draft'),
    rentalId: uuid('rental_id').notNull(),
    reservationId: uuid('reservation_id'),
    quoteId: uuid('quote_id'),
    templateVersionId: uuid('template_version_id').notNull(),
    /** What the contract says, frozen at creation: parties, vehicle, period, quote lines, rendered text. No ID numbers. */
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    externalAckAt: timestamp('external_ack_at', { withTimezone: true }),
    externalAckBy: uuid('external_ack_by').references(() => users.id),
    externalReference: text('external_reference'),
    archiveReason: text('archive_reason'),
    clientRequestId: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [
    unique('contracts_company_id_key').on(t.companyId, t.id),
    unique('contracts_company_no_key').on(t.companyId, t.contractNo, t.revision),
    unique('contracts_request_key').on(t.companyId, t.clientRequestId),
    uniqueIndex('contracts_rental_open_key').on(t.companyId, t.rentalId).where(sql`${t.status} in ('draft', 'under_review', 'externally_processed')`),
    index('contracts_rental_idx').on(t.companyId, t.rentalId, t.createdAt),
    index('contracts_company_created_idx').on(t.companyId, t.createdAt),
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    foreignKey({ columns: [t.companyId, t.reservationId], foreignColumns: [reservations.companyId, reservations.id] }),
    foreignKey({ columns: [t.companyId, t.quoteId], foreignColumns: [priceQuotes.companyId, priceQuotes.id] }),
    foreignKey({ columns: [t.companyId, t.templateVersionId], foreignColumns: [contractTemplateVersions.companyId, contractTemplateVersions.id] }),
    foreignKey({ columns: [t.companyId, t.supersedesId], foreignColumns: [t.companyId, t.id] }),
    check('contracts_no_check', sql`${t.contractNo} ~ '^S-[0-9]{6,}$'`),
    check('contracts_status_check', sql`${t.status} in ('draft', 'under_review', 'externally_processed', 'archived', 'superseded')`),
    check('contracts_external_check', sql`(${t.status} = 'externally_processed') = (${t.externalAckAt} is not null and ${t.externalAckBy} is not null and ${t.externalReference} is not null) or (${t.status} in ('archived', 'superseded') and ${t.externalAckAt} is not null)`),
    check('contracts_external_reference_check', sql`${t.externalReference} is null or (char_length(${t.externalReference}) between 3 and 40 and ${t.externalReference} ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$')`),
    check('contracts_archive_check', sql`(${t.status} = 'archived') = (${t.archiveReason} is not null)`),
    check('contracts_revision_check', sql`${t.revision} >= 1 and ${t.version} >= 1`),
  ],
)

export const contractFiles = pgTable(
  'contract_files',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    contractId: uuid('contract_id').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('contract_files_contract_key').on(t.companyId, t.contractId),
    foreignKey({ columns: [t.companyId, t.contractId], foreignColumns: [contracts.companyId, contracts.id] }),
    check('contract_files_sha_check', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
)

/** Append-only: lifecycle, views and downloads (who, when, which contract; no content). */
export const contractEvents = pgTable(
  'contract_events',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    contractId: uuid('contract_id').notNull(),
    kind: text('kind').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    clientRequestId: uuid('client_request_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('contract_events_contract_idx').on(t.companyId, t.contractId, t.at),
    uniqueIndex('contract_events_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    foreignKey({ columns: [t.companyId, t.contractId], foreignColumns: [contracts.companyId, contracts.id] }),
    check('contract_events_kind_check', sql`${t.kind} in ('created', 'review', 'external', 'archived', 'superseded', 'viewed', 'downloaded')`),
  ],
)

// ---------------------------------------------------------------------------
// Finance V1 — docs/FINANS_YONETIMI_V1_PLANI.md. Internal operating records only: no payment provider, no card data,
// no official invoice. Amounts are integers in the minor unit of their ISO currency. Records are never deleted;
// amounts, currencies and parties never change; corrections are explicit, audited status transitions (four-eyes).

export const FINANCE_PAYMENT_METHODS = ['cash', 'bank_transfer', 'external_pos', 'other_external'] as const
export const FINANCE_DEPOSIT_METHODS = ['cash', 'bank_transfer', 'external_pos', 'external_card_hold', 'other_external'] as const

/** One finance file per rental: transaction currency, the party responsible for payment, financial close. */
export const rentalFinances = pgTable(
  'rental_finances',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    rentalId: uuid('rental_id').notNull(),
    currency: text('currency').notNull(),
    responsibleType: text('responsible_type', { enum: ['customer', 'corporate'] }).notNull(),
    responsibleCustomerId: uuid('responsible_customer_id'),
    responsibleCorporateId: uuid('responsible_corporate_id'),
    status: text('status', { enum: ['open', 'closed', 'reopened'] }).notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id),
    reopenReason: text('reopen_reason'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').references(() => users.id),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('rental_finances_company_id_key').on(t.companyId, t.id),
    unique('rental_finances_rental_key').on(t.companyId, t.rentalId),
    foreignKey({ columns: [t.companyId, t.rentalId], foreignColumns: [rentals.companyId, rentals.id] }),
    foreignKey({ columns: [t.companyId, t.responsibleCustomerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.responsibleCorporateId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    index('rental_finances_customer_idx').on(t.companyId, t.responsibleCustomerId),
    index('rental_finances_corporate_idx').on(t.companyId, t.responsibleCorporateId),
    check('rental_finances_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'rental_finances_responsible_check',
      sql`(${t.responsibleType} = 'customer' and ${t.responsibleCustomerId} is not null and ${t.responsibleCorporateId} is null) or (${t.responsibleType} = 'corporate' and ${t.responsibleCorporateId} is not null and ${t.responsibleCustomerId} is null)`,
    ),
    check('rental_finances_status_check', sql`${t.status} in ('open', 'closed', 'reopened') and ((${t.status} = 'closed') = (${t.closedAt} is not null))`),
    check('rental_finances_reopen_check', sql`${t.status} <> 'reopened' or char_length(${t.reopenReason}) between 3 and 300`),
  ],
)

/** Internal account lines of a rental (not an invoice, not a legal receivable by themselves). */
export const financeCharges = pgTable(
  'finance_charges',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    financeId: uuid('finance_id').notNull(),
    chargeNo: text('charge_no').notNull(),
    kind: text('kind', { enum: ['quote', 'manual'] }).notNull(),
    quoteId: uuid('quote_id'),
    description: text('description').notNull(),
    currency: text('currency').notNull(),
    /** The amount that counts against payments: gross when tax is complete, net otherwise (then flagged). */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    netMinor: bigint('net_minor', { mode: 'number' }).notNull(),
    taxMinor: bigint('tax_minor', { mode: 'number' }),
    taxStatus: text('tax_status', { enum: ['complete', 'not_configured'] }).notNull(),
    status: text('status', { enum: ['pending', 'posted', 'rejected', 'reversal_requested', 'reversed'] }).notNull().default('pending'),
    reason: text('reason'),
    reviewNote: text('review_note'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    reversalReason: text('reversal_reason'),
    reversalRequestedAt: timestamp('reversal_requested_at', { withTimezone: true }),
    reversalRequestedBy: uuid('reversal_requested_by').references(() => users.id),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => users.id),
    clientRequestId: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
  },
  (t) => [
    unique('finance_charges_company_id_key').on(t.companyId, t.id),
    unique('finance_charges_no_key').on(t.companyId, t.chargeNo),
    unique('finance_charges_request_key').on(t.companyId, t.clientRequestId),
    uniqueIndex('finance_charges_quote_key').on(t.companyId, t.financeId, t.quoteId).where(sql`${t.quoteId} is not null and ${t.status} not in ('rejected', 'reversed')`),
    index('finance_charges_finance_idx').on(t.companyId, t.financeId, t.createdAt),
    index('finance_charges_status_idx').on(t.companyId, t.status, t.createdAt),
    foreignKey({ columns: [t.companyId, t.financeId], foreignColumns: [rentalFinances.companyId, rentalFinances.id] }),
    foreignKey({ columns: [t.companyId, t.quoteId], foreignColumns: [priceQuotes.companyId, priceQuotes.id] }),
    check('finance_charges_no_check', sql`${t.chargeNo} ~ '^H-[0-9]{6,}$'`),
    check('finance_charges_kind_check', sql`(${t.kind} = 'quote') = (${t.quoteId} is not null)`),
    check('finance_charges_amount_check', sql`${t.amountMinor} > 0 and ${t.amountMinor} <= 100000000000 and ${t.netMinor} >= 0 and (${t.taxMinor} is null or ${t.taxMinor} >= 0)`),
    check('finance_charges_tax_check', sql`(${t.taxStatus} = 'complete') = (${t.taxMinor} is not null)`),
    check('finance_charges_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('finance_charges_text_check', sql`char_length(${t.description}) between 1 and 160 and (${t.reason} is null or char_length(${t.reason}) <= 300)`),
    check('finance_charges_four_eyes', sql`${t.approvedBy} is null or ${t.approvedBy} <> ${t.createdBy}`),
    check('finance_charges_reversal_four_eyes', sql`${t.reversedBy} is null or ${t.reversedBy} <> ${t.reversalRequestedBy}`),
  ],
)

/** Collections recorded by staff. Recording is a statement; only a second person's verification makes it count. */
export const financePayments = pgTable(
  'finance_payments',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    financeId: uuid('finance_id').notNull(),
    paymentNo: text('payment_no').notNull(),
    method: text('method', { enum: FINANCE_PAYMENT_METHODS }).notNull(),
    currency: text('currency').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    payerType: text('payer_type', { enum: ['customer', 'corporate', 'other'] }).notNull(),
    payerCustomerId: uuid('payer_customer_id'),
    payerCorporateId: uuid('payer_corporate_id'),
    /** A third party's name as given (not a customer record); never copied into history. */
    payerName: text('payer_name'),
    externalReference: text('external_reference'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    branchId: uuid('branch_id').notNull(),
    note: text('note'),
    cashAck: boolean('cash_ack').notNull().default(false),
    status: text('status', { enum: ['recorded', 'verified', 'rejected', 'reversed'] }).notNull().default('recorded'),
    reviewNote: text('review_note'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    reversalReason: text('reversal_reason'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => users.id),
    clientRequestId: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
  },
  (t) => [
    unique('finance_payments_company_id_key').on(t.companyId, t.id),
    unique('finance_payments_no_key').on(t.companyId, t.paymentNo),
    unique('finance_payments_request_key').on(t.companyId, t.clientRequestId),
    uniqueIndex('finance_payments_reference_key').on(t.companyId, t.method, t.externalReference).where(sql`${t.externalReference} is not null and ${t.status} in ('recorded', 'verified')`),
    index('finance_payments_finance_idx').on(t.companyId, t.financeId, t.createdAt),
    index('finance_payments_list_idx').on(t.companyId, t.receivedAt),
    index('finance_payments_status_idx').on(t.companyId, t.status, t.receivedAt),
    index('finance_payments_payer_customer_idx').on(t.companyId, t.payerCustomerId),
    index('finance_payments_payer_corporate_idx').on(t.companyId, t.payerCorporateId),
    foreignKey({ columns: [t.companyId, t.financeId], foreignColumns: [rentalFinances.companyId, rentalFinances.id] }),
    foreignKey({ columns: [t.companyId, t.payerCustomerId], foreignColumns: [customers.companyId, customers.id] }),
    foreignKey({ columns: [t.companyId, t.payerCorporateId], foreignColumns: [corporateAccounts.companyId, corporateAccounts.id] }),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }),
    check('finance_payments_no_check', sql`${t.paymentNo} ~ '^T-[0-9]{6,}$'`),
    check('finance_payments_amount_check', sql`${t.amountMinor} > 0 and ${t.amountMinor} <= 100000000000 and ${t.currency} ~ '^[A-Z]{3}$'`),
    check(
      'finance_payments_payer_check',
      sql`(${t.payerType} = 'customer' and ${t.payerCustomerId} is not null and ${t.payerCorporateId} is null and ${t.payerName} is null) or (${t.payerType} = 'corporate' and ${t.payerCorporateId} is not null and ${t.payerCustomerId} is null and ${t.payerName} is null) or (${t.payerType} = 'other' and ${t.payerCustomerId} is null and ${t.payerCorporateId} is null and char_length(${t.payerName}) between 2 and 80)`,
    ),
    check('finance_payments_cash_check', sql`(${t.method} = 'cash') = ${t.cashAck}`),
    check(
      'finance_payments_reference_check',
      sql`(${t.method} not in ('external_pos', 'bank_transfer') or ${t.externalReference} is not null) and (${t.externalReference} is null or (char_length(${t.externalReference}) between 3 and 40 and ${t.externalReference} ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$'))`,
    ),
    check('finance_payments_note_check', sql`${t.note} is null or char_length(${t.note}) <= 300`),
    check('finance_payments_four_eyes', sql`${t.verifiedBy} is null or ${t.verifiedBy} <> ${t.createdBy}`),
  ],
)

/** Security deposits: separate from rental payments, revenue, damage charges and card authorisations. */
export const financeDeposits = pgTable(
  'finance_deposits',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    financeId: uuid('finance_id').notNull(),
    depositNo: text('deposit_no').notNull(),
    currency: text('currency').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    method: text('method', { enum: FINANCE_DEPOSIT_METHODS }),
    externalReference: text('external_reference'),
    cashAck: boolean('cash_ack').notNull().default(false),
    branchId: uuid('branch_id').notNull(),
    note: text('note'),
    status: text('status', { enum: ['requested', 'reported', 'verified', 'rejected', 'cancelled'] }).notNull().default('requested'),
    inReview: boolean('in_review').notNull().default(false),
    reviewReason: text('review_reason'),
    reportedAt: timestamp('reported_at', { withTimezone: true }),
    reportedBy: uuid('reported_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    closedReason: text('closed_reason'),
    clientRequestId: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
  },
  (t) => [
    unique('finance_deposits_company_id_key').on(t.companyId, t.id),
    unique('finance_deposits_no_key').on(t.companyId, t.depositNo),
    unique('finance_deposits_request_key').on(t.companyId, t.clientRequestId),
    uniqueIndex('finance_deposits_reference_key').on(t.companyId, t.method, t.externalReference).where(sql`${t.externalReference} is not null and ${t.status} in ('reported', 'verified')`),
    index('finance_deposits_finance_idx').on(t.companyId, t.financeId, t.createdAt),
    index('finance_deposits_status_idx').on(t.companyId, t.status, t.createdAt),
    foreignKey({ columns: [t.companyId, t.financeId], foreignColumns: [rentalFinances.companyId, rentalFinances.id] }),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }),
    check('finance_deposits_no_check', sql`${t.depositNo} ~ '^D-[0-9]{6,}$'`),
    check('finance_deposits_amount_check', sql`${t.amountMinor} > 0 and ${t.amountMinor} <= 100000000000 and ${t.currency} ~ '^[A-Z]{3}$'`),
    check('finance_deposits_reported_check', sql`${t.status} in ('requested', 'cancelled') or (${t.method} is not null and ${t.reportedAt} is not null and ${t.reportedBy} is not null)`),
    check('finance_deposits_cash_check', sql`${t.method} is null or (${t.method} = 'cash') = ${t.cashAck}`),
    check(
      'finance_deposits_reference_check',
      sql`(${t.method} is null or ${t.method} not in ('external_pos', 'bank_transfer', 'external_card_hold') or ${t.externalReference} is not null) and (${t.externalReference} is null or (char_length(${t.externalReference}) between 3 and 40 and ${t.externalReference} ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$'))`,
    ),
    check('finance_deposits_review_check', sql`${t.inReview} = (${t.reviewReason} is not null) and (${t.reviewReason} is null or char_length(${t.reviewReason}) between 3 and 300)`),
    check('finance_deposits_four_eyes', sql`${t.verifiedBy} is null or ${t.verifiedBy} <> ${t.reportedBy}`),
  ],
)

/** Deposit returns: a request, a second person's approval, then the staff report that the money went back outside ACARVO. */
export const financeDepositRefunds = pgTable(
  'finance_deposit_refunds',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    depositId: uuid('deposit_id').notNull(),
    refundNo: text('refund_no').notNull(),
    currency: text('currency').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    method: text('method', { enum: FINANCE_PAYMENT_METHODS }).notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: ['requested', 'approved', 'completed', 'rejected', 'cancelled', 'reversed'] }).notNull().default('requested'),
    reviewNote: text('review_note'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    externalReference: text('external_reference'),
    cashAck: boolean('cash_ack').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id),
    reversalReason: text('reversal_reason'),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => users.id),
    clientRequestId: uuid('client_request_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
  },
  (t) => [
    unique('finance_deposit_refunds_company_id_key').on(t.companyId, t.id),
    unique('finance_deposit_refunds_no_key').on(t.companyId, t.refundNo),
    unique('finance_deposit_refunds_request_key').on(t.companyId, t.clientRequestId),
    index('finance_deposit_refunds_deposit_idx').on(t.companyId, t.depositId, t.createdAt),
    index('finance_deposit_refunds_status_idx').on(t.companyId, t.status, t.createdAt),
    foreignKey({ columns: [t.companyId, t.depositId], foreignColumns: [financeDeposits.companyId, financeDeposits.id] }),
    check('finance_deposit_refunds_no_check', sql`${t.refundNo} ~ '^DI-[0-9]{6,}$'`),
    check('finance_deposit_refunds_amount_check', sql`${t.amountMinor} > 0 and ${t.amountMinor} <= 100000000000 and ${t.currency} ~ '^[A-Z]{3}$'`),
    check('finance_deposit_refunds_reason_check', sql`char_length(${t.reason}) between 3 and 300`),
    check('finance_deposit_refunds_completed_check', sql`${t.status} not in ('completed', 'reversed') or (${t.completedAt} is not null and ${t.completedBy} is not null)`),
    check('finance_deposit_refunds_cash_check', sql`${t.completedAt} is null or (${t.method} = 'cash') = ${t.cashAck}`),
    check('finance_deposit_refunds_reference_check', sql`${t.externalReference} is null or (char_length(${t.externalReference}) between 3 and 40 and ${t.externalReference} ~ '^[A-Za-z0-9][A-Za-z0-9 ./_-]*$')`),
    check('finance_deposit_refunds_four_eyes', sql`${t.approvedBy} is null or ${t.approvedBy} <> ${t.createdBy}`),
  ],
)

/** Append-only history of every finance step (who, when, what changed; no personal data, no card data). */
export const financeEvents = pgTable(
  'finance_events',
  {
    id: id(),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    financeId: uuid('finance_id').notNull(),
    entityType: text('entity_type', { enum: ['finance', 'charge', 'payment', 'deposit', 'refund'] }).notNull(),
    entityId: uuid('entity_id').notNull(),
    kind: text('kind').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    clientRequestId: uuid('client_request_id'),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('finance_events_finance_idx').on(t.companyId, t.financeId, t.at),
    index('finance_events_company_idx').on(t.companyId, t.at),
    uniqueIndex('finance_events_request_key').on(t.companyId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    foreignKey({ columns: [t.companyId, t.financeId], foreignColumns: [rentalFinances.companyId, rentalFinances.id] }),
    check('finance_events_currency_check', sql`${t.currency} is null or ${t.currency} ~ '^[A-Z]{3}$'`),
  ],
)
