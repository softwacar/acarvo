import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  inet,
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
