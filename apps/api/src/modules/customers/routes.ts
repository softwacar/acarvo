import {
  CUSTOMER_AUDITED_VALUE_FIELDS,
  customerArchiveSchema,
  customerCreateSchema,
  customerDuplicateCheckSchema,
  customerRestoreSchema,
  customerSearchSchema,
  customerUpdateSchema,
  normalizeName,
  normalizePhone,
} from '@acarvo/shared'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { branches, customers } from '../../db/schema'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { inScope } from '../vehicles/repository'
import {
  companyCountry,
  CUSTOMER_NOT_FOUND,
  customerActivity,
  customerColumns,
  findDuplicates,
  getCustomer,
  listCustomers,
  nextCustomerNo,
  phoneOrError,
} from './repository'

const idParams = z.object({ id: z.uuid() })
const parseId = (req: FastifyRequest) => {
  const parsed = idParams.safeParse(req.params)
  if (!parsed.success) throw notFound(CUSTOMER_NOT_FOUND)
  return parsed.data.id
}

/** Suggestions run on every phone / e-mail edit in the form; capped so they cannot be used to sweep the customer list. */
const DUPLICATE_CHECK_RATE_LIMIT = {
  rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => `customer-dup|${req.auth?.user.id ?? req.ip}` },
}

const conflict = async (tx: Tx, id: string) =>
  new AppError(409, 'VERSION_CONFLICT', 'Bu müşteri siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await getCustomer(tx, id) })

/** Strong suggestions (same phone or e-mail) must be seen before a separate person is saved; the user decides. */
async function requireDuplicateDecision(
  tx: Tx,
  input: { phoneE164: string | null; email: string | null; nameNormalized: string; dateOfBirth: string | null; excludeId?: string },
  acknowledged: boolean | undefined,
) {
  const matches = await findDuplicates(tx, input)
  const strong = matches.filter((m) => m.strength === 'strong')
  if (strong.length && !acknowledged) {
    throw new AppError(409, 'POSSIBLE_DUPLICATE', 'Bu telefon veya e-posta şirketinizdeki başka bir müşteride kayıtlı. Aynı kişi mi, kontrol edin.', undefined, { matches })
  }
  return strong.map((m) => m.customerNo)
}

async function assertBranch(tx: Tx, access: CompanyAccess, branchId: string) {
  const [br] = await tx.select({ id: branches.id, status: branches.status }).from(branches).where(eq(branches.id, branchId))
  if (!br || br.status !== 'active') throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { createdBranchId: 'Seçilen şube bulunamadı' })
  if (!inScope(access, branchId)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şube için yetkiniz yok.', { createdBranchId: 'Bu şubede kayıt açma yetkiniz yok' })
}

/** Which editable fields differ. Values are copied into the audit log only for non-personal fields. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const fields: string[] = []
  const values: Record<string, [unknown, unknown]> = {}
  for (const [key, value] of Object.entries(after)) {
    if (key === 'displayName' || key === 'nameNormalized' || key === 'phoneE164') continue
    if (String(before[key] ?? null) === String(value ?? null)) continue
    const field = key === 'phoneRaw' ? 'phone' : key
    fields.push(field)
    if ((CUSTOMER_AUDITED_VALUE_FIELDS as readonly string[]).includes(field)) values[field] = [before[key] ?? null, value ?? null]
  }
  if (!fields.includes('phone') && String(before.phoneE164 ?? null) !== String(after.phoneE164 ?? null)) fields.push('phone')
  return { fields, values }
}

export async function customerRoutes(app: FastifyInstance) {
  /** List and search. POST so that names, phone numbers and e-mail addresses never travel in a URL or reach access logs. */
  app.post('/search', async (req) => withCompany(req, 'customers.read', (tx) => listCustomers(tx, customerSearchSchema.parse(req.body ?? {}))))

  app.post('/duplicate-check', { config: DUPLICATE_CHECK_RATE_LIMIT }, async (req) =>
    withCompany(req, 'customers.manage', async (tx, access) => {
      const input = customerDuplicateCheckSchema.parse(req.body ?? {})
      const phoneE164 = input.phone ? normalizePhone(input.phone, await companyCountry(tx, access)) : null
      const name = normalizeName(input.givenName, input.familyName)
      return {
        matches: await findDuplicates(tx, {
          phoneE164,
          email: input.email ?? null,
          nameNormalized: name || null,
          dateOfBirth: input.dateOfBirth ?? null,
          excludeId: input.excludeId,
        }),
      }
    }),
  )

  app.get('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'customers.read', async (tx) => (await getCustomer(tx, id)) ?? Promise.reject(notFound(CUSTOMER_NOT_FOUND)))
  })

  /** What happened to this customer record. Personal values are not part of the entries, only which fields changed. */
  app.get('/:id/history', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'customers.read', async (tx) => {
      if (!(await getCustomer(tx, id))) throw notFound(CUSTOMER_NOT_FOUND)
      return { items: await customerActivity(tx, id) }
    })
  })

  app.post('/', async (req, reply) => {
    const created = await withCompany(req, 'customers.manage', async (tx, access) => {
      const input = customerCreateSchema.parse(req.body)
      // A user who works in exactly one branch opens records there; others choose (or leave it empty).
      const branchId = input.createdBranchId ?? (!access.allBranches && access.branchIds.length === 1 ? access.branchIds[0]! : null)
      if (branchId) await assertBranch(tx, access, branchId)
      const columns = customerColumns(input, phoneOrError(input.phone, await companyCountry(tx, access)))
      const acknowledged = await requireDuplicateDecision(tx, { ...columns, dateOfBirth: columns.dateOfBirth }, input.duplicateAcknowledged)
      const userId = req.auth!.user.id
      const customerNo = await nextCustomerNo(tx, access)
      const [row] = await tx
        .insert(customers)
        .values({ ...columns, companyId: access.companyId, customerNo, createdBranchId: branchId, createdBy: userId, updatedBy: userId })
        .returning({ id: customers.id })
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'customer.create',
        entity: 'customer',
        entityId: row!.id,
        summary: { customerNo, residency: columns.residency, createdBranchId: branchId, ...(acknowledged.length ? { acknowledgedDuplicates: acknowledged } : {}) },
      })
      return getCustomer(tx, row!.id)
    })
    return reply.code(201).send(created)
  })

  app.put('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'customers.manage', async (tx, access) => {
      const input = customerUpdateSchema.parse(req.body)
      // Lock the row so the version check and the update cannot interleave with another save.
      const [current] = await tx.select().from(customers).where(eq(customers.id, id)).for('update')
      if (!current || (current.status !== 'active' && current.status !== 'archived')) throw notFound(CUSTOMER_NOT_FOUND)
      if (current.version !== input.version) throw await conflict(tx, id)
      if (current.status === 'archived') throw new AppError(409, 'CUSTOMER_ARCHIVED', 'Arşivdeki müşteri düzenlenemez. Önce arşivden çıkarın.')

      // An update that leaves out the M1 classification keeps the recorded value (never cleared silently).
      const next = { ...customerColumns(input, phoneOrError(input.phone, await companyCountry(tx, access))), residency: input.residency ?? current.residency ?? null }
      const { fields, values } = changedFields(current, next)
      if (!fields.length) return getCustomer(tx, id)
      const contactChanged = fields.includes('phone') || fields.includes('email')
      const acknowledged = contactChanged ? await requireDuplicateDecision(tx, { ...next, excludeId: id }, input.duplicateAcknowledged) : []

      const userId = req.auth!.user.id
      const updated = await tx
        .update(customers)
        .set({ ...next, version: sql`${customers.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(sql`${customers.id} = ${id} and ${customers.version} = ${input.version}`)
        .returning({ id: customers.id })
      if (!updated.length) throw await conflict(tx, id)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'customer.update',
        entity: 'customer',
        entityId: id,
        summary: { customerNo: current.customerNo, fromVersion: input.version, fields, values, ...(acknowledged.length ? { acknowledgedDuplicates: acknowledged } : {}) },
      })
      return getCustomer(tx, id)
    })
  })

  /** Archiving hides the customer from the default list. Nothing is deleted; it can be restored. */
  app.post('/:id/archive', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'customers.manage', async (tx, access) => {
      const input = customerArchiveSchema.parse(req.body)
      const [current] = await tx.select().from(customers).where(eq(customers.id, id)).for('update')
      if (!current || (current.status !== 'active' && current.status !== 'archived')) throw notFound(CUSTOMER_NOT_FOUND)
      if (current.version !== input.version) throw await conflict(tx, id)
      if (current.status === 'archived') throw new AppError(409, 'ALREADY_ARCHIVED', 'Bu müşteri zaten arşivde.')
      const userId = req.auth!.user.id
      const now = new Date()
      await tx
        .update(customers)
        .set({ status: 'archived', archivedAt: now, archivedReason: input.reason, archivedBy: userId, version: sql`${customers.version} + 1`, updatedAt: now, updatedBy: userId })
        .where(eq(customers.id, id))
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'customer.archive',
        entity: 'customer',
        entityId: id,
        summary: { customerNo: current.customerNo, fromVersion: input.version, reason: input.reason },
      })
      return getCustomer(tx, id)
    })
  })

  app.post('/:id/restore', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'customers.manage', async (tx, access) => {
      const input = customerRestoreSchema.parse(req.body)
      const [current] = await tx.select().from(customers).where(eq(customers.id, id)).for('update')
      if (!current || (current.status !== 'active' && current.status !== 'archived')) throw notFound(CUSTOMER_NOT_FOUND)
      if (current.version !== input.version) throw await conflict(tx, id)
      if (current.status !== 'archived') throw new AppError(409, 'NOT_ARCHIVED', 'Bu müşteri arşivde değil.')
      const userId = req.auth!.user.id
      await tx
        .update(customers)
        .set({ status: 'active', archivedAt: null, archivedReason: null, archivedBy: null, version: sql`${customers.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(eq(customers.id, id))
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'customer.restore',
        entity: 'customer',
        entityId: id,
        summary: { customerNo: current.customerNo, fromVersion: input.version, previousReason: current.archivedReason },
      })
      return getCustomer(tx, id)
    })
  })
}
