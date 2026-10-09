import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
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
    status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
    createdAt: createdAt(),
  },
  (t) => [unique('branches_company_code_key').on(t.companyId, t.code), unique('branches_company_id_key').on(t.companyId, t.id)],
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
  (t) => [index('audit_company_created_idx').on(t.companyId, t.createdAt)],
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

export const ODOMETER_EVENTS = ['initial', 'correction'] as const

/** Append-only. The latest reading (by time) is the vehicle's current odometer. */
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
  },
  (t) => [
    index('odometer_vehicle_time_idx').on(t.companyId, t.vehicleId, t.occurredAt),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    check('odometer_km_check', sql`${t.km} between 0 and 3000000`),
  ],
)

export const LOCATION_TYPES = ['branch', 'in_transit', 'with_customer', 'service_provider', 'supplier'] as const

/** Append-only physical location history. Not live GPS. */
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
  },
  (t) => [
    index('location_vehicle_time_idx').on(t.companyId, t.vehicleId, t.occurredAt),
    foreignKey({ columns: [t.companyId, t.vehicleId], foreignColumns: [vehicles.companyId, vehicles.id] }),
    foreignKey({ columns: [t.companyId, t.branchId], foreignColumns: [branches.companyId, branches.id] }),
    check('location_branch_check', sql`${t.locationType} <> 'branch' or ${t.branchId} is not null`),
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
