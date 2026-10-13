import { sql } from 'drizzle-orm'
import {
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
    kind: text('kind', { enum: ['customer', 'corporate_account'] }).notNull(),
    nextValue: bigint('next_value', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.companyId, t.kind] }),
    check('company_sequences_kind_check', sql`${t.kind} in ('customer', 'corporate_account')`),
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
