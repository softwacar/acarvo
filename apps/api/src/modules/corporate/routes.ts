import {
  addressInputSchema,
  addressUpdateSchema,
  channelInputSchema,
  channelUpdateSchema,
  CORPORATE_AUDITED_VALUE_FIELDS,
  corporateArchiveSchema,
  corporateCreateSchema,
  corporateDuplicateCheckSchema,
  type CorporateInput,
  corporateRestoreSchema,
  corporateSearchSchema,
  corporateUpdateSchema,
  normalizeName,
  normalizePhone,
  normalizeTaxValue,
  type Permission,
  personEndSchema,
  personLinkSchema,
  personUpdateSchema,
  subRecordRemoveSchema,
  taxIdInputSchema,
  taxIdUpdateSchema,
  taxIdWarnings,
} from '@acarvo/shared'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { branches, corporateAccounts } from '../../db/schema'
import { audit } from '../../lib/audit'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { CUSTOMER_NOT_FOUND, companyCountry, getCustomer } from '../customers/repository'
import { documentWarningDays } from '../customers/documents'
import { companyToday } from '../vehicles/document-overview'
import { inScope } from '../vehicles/repository'
import {
  ACCOUNT_NOT_FOUND,
  accountActivity,
  channelValues,
  customerLinks,
  findAccountDuplicates,
  getAccount,
  listAccounts,
  loadPeople,
  nextAccountNo,
} from './repository'

type Row = Record<string, unknown>

const RECORD_NOT_FOUND = 'Kayıt bulunamadı veya bu hesaba ait değil.'
const PERSON_LINK_NOT_FOUND = 'Kişi ilişkisi bulunamadı veya bu hesaba ait değil.'

const idParams = z.object({ id: z.uuid() })
const subParams = z.object({ id: z.uuid(), sid: z.uuid() })
const parseId = (req: FastifyRequest) => {
  const p = idParams.safeParse(req.params)
  if (!p.success) throw notFound(ACCOUNT_NOT_FOUND)
  return p.data.id
}
const parseSub = (req: FastifyRequest, message = RECORD_NOT_FOUND) => {
  const p = subParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data
}

/** Suggestions run while the form is typed in; capped so they cannot be used to sweep the account list. */
const DUPLICATE_CHECK_RATE_LIMIT = {
  rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => `corporate-dup|${req.auth?.user.id ?? req.ip}` },
}

const need = (access: CompanyAccess, permission: Permission) => {
  if (!access.permissions.has(permission)) throw forbidden()
}

const conflict = async (tx: Tx, id: string) =>
  new AppError(409, 'VERSION_CONFLICT', 'Bu kurumsal hesap siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await getAccount(tx, id) })

/** The account row, locked, for any change to it or its records. Archived accounts cannot change (except restore). */
async function lockAccount(tx: Tx, id: string, { allowArchived = false } = {}) {
  const r = (await tx.execute(sql`select id, account_no, status, version, country from corporate_accounts where id = ${id} for update`)).rows[0] as Row | undefined
  if (!r) throw notFound(ACCOUNT_NOT_FOUND)
  if (!allowArchived && r.status === 'archived') throw new AppError(409, 'ACCOUNT_ARCHIVED', 'Arşivdeki kurumsal hesap değiştirilemez. Önce arşivden çıkarın.')
  return { id: r.id as string, accountNo: r.account_no as string, status: r.status as string, version: r.version as number, country: r.country as string }
}

async function assertBranch(tx: Tx, access: CompanyAccess, branchId: string) {
  const [br] = await tx.select({ id: branches.id, status: branches.status }).from(branches).where(eq(branches.id, branchId))
  if (!br || br.status !== 'active') throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { createdBranchId: 'Seçilen şube bulunamadı' })
  if (!inScope(access, branchId)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şube için yetkiniz yok.', { createdBranchId: 'Bu şubede kayıt açma yetkiniz yok' })
}

const coreColumns = (input: CorporateInput) => ({
  legalName: input.legalName,
  legalNameNormalized: normalizeName(input.legalName),
  tradeName: input.tradeName ?? null,
  country: input.country,
  registrationNumber: input.registrationNumber ?? null,
  registrationNumberNormalized: input.registrationNumber ? normalizeTaxValue(input.registrationNumber) || null : null,
  registrationAuthority: input.registrationAuthority ?? null,
  preferredLanguage: input.preferredLanguage ?? null,
  note: input.note ?? null,
})

/** Strong suggestions must be seen before a separate account (or a record shared with another account) is saved. */
async function requireDuplicateDecision(tx: Tx, input: Parameters<typeof findAccountDuplicates>[1], acknowledged: boolean | undefined) {
  const matches = await findAccountDuplicates(tx, input)
  const strong = matches.filter((m) => m.strength === 'strong')
  if (strong.length && !acknowledged) {
    throw new AppError(409, 'POSSIBLE_DUPLICATE', 'Bu vergi kimliği, telefon veya e-posta şirketinizdeki başka bir kurumsal hesapta kayıtlı. Aynı şirket mi, kontrol edin.', undefined, { matches })
  }
  return strong.map((m) => m.accountNo)
}

// ---------------------------------------------------------------------------
// Primary flags: one primary per scope (channel kind, address kind, or the account for tax ids)

type SubTable = 'corporate_contact_channels' | 'corporate_tax_ids' | 'corporate_addresses'
const scopeSql = (table: SubTable, scope: string | null) => (table === 'corporate_tax_ids' || scope === null ? sql`` : sql`and kind = ${scope}`)

async function makePrimary(tx: Tx, table: SubTable, accountId: string, scope: string | null, id: string) {
  await tx.execute(sql`update ${sql.identifier(table)} set is_primary = false where account_id = ${accountId} ${scopeSql(table, scope)} and is_primary and removed_at is null and id <> ${id}`)
  await tx.execute(sql`update ${sql.identifier(table)} set is_primary = true where id = ${id} and not is_primary`)
}

/** After a change: a scope with active records always has one primary (the oldest is promoted). Returns the promoted id. */
async function ensurePrimary(tx: Tx, table: SubTable, accountId: string, scope: string | null): Promise<string | null> {
  const has = (await tx.execute(sql`select 1 from ${sql.identifier(table)} where account_id = ${accountId} ${scopeSql(table, scope)} and is_primary and removed_at is null`)).rows.length
  if (has) return null
  const r = (
    await tx.execute(sql`update ${sql.identifier(table)} set is_primary = true
      where id = (select id from ${sql.identifier(table)} where account_id = ${accountId} ${scopeSql(table, scope)} and removed_at is null order by created_at limit 1)
      returning id`)
  ).rows[0] as Row | undefined
  return (r?.id as string) ?? null
}

async function lockSub(tx: Tx, table: SubTable, accountId: string, id: string, version: number | null) {
  const r = (await tx.execute(sql`select * from ${sql.identifier(table)} where id = ${id} and account_id = ${accountId} and removed_at is null for update`)).rows[0] as Row | undefined
  if (!r) throw notFound(RECORD_NOT_FOUND)
  if (version !== null && r.version !== version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu kayıt siz düzenlerken başka bir kullanıcı tarafından güncellendi. Güncel bilgiler yüklendi.')
  return r
}

const changed = (before: Row, after: Record<string, unknown>, columns: Record<string, string>) =>
  Object.entries(columns)
    .filter(([key, col]) => String(before[col] ?? null) !== String(after[key] ?? null))
    .map(([key]) => key)

// ---------------------------------------------------------------------------

export async function corporateRoutes(app: FastifyInstance) {
  /** List and search. POST so that names, tax ids, phone numbers and e-mail addresses never travel in a URL. */
  app.post('/search', async (req) =>
    withCompany(req, 'corporate.read', async (tx) => listAccounts(tx, corporateSearchSchema.parse(req.body ?? {}))),
  )

  app.post('/duplicate-check', { config: DUPLICATE_CHECK_RATE_LIMIT }, async (req) =>
    withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = corporateDuplicateCheckSchema.parse(req.body ?? {})
      const name = input.legalName ? normalizeName(input.legalName) : ''
      return {
        matches: await findAccountDuplicates(tx, {
          legalNameNormalized: name || null,
          country: input.country ?? null,
          registrationNormalized: input.registrationNumber ? normalizeTaxValue(input.registrationNumber) || null : null,
          taxValueNormalized: input.taxValue ? normalizeTaxValue(input.taxValue) || null : null,
          email: input.email ?? null,
          phoneE164: input.phone ? normalizePhone(input.phone, await companyCountry(tx, access)) : null,
          excludeId: input.excludeId,
        }),
      }
    }),
  )

  app.get('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'corporate.read', async (tx) => (await getAccount(tx, id)) ?? Promise.reject(notFound(ACCOUNT_NOT_FOUND)))
  })

  /** What happened to the account and its records. Tax ids, addresses, phone numbers and e-mail addresses are not copied. */
  app.get('/:id/history', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'corporate.read', async (tx) => {
      if (!(await getAccount(tx, id))) throw notFound(ACCOUNT_NOT_FOUND)
      return { items: await accountActivity(tx, id) }
    })
  })

  app.post('/', async (req, reply) => {
    const created = await withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = corporateCreateSchema.parse(req.body)
      const branchId = input.createdBranchId ?? (!access.allBranches && access.branchIds.length === 1 ? access.branchIds[0]! : null)
      if (branchId) await assertBranch(tx, access, branchId)
      const country = await companyCountry(tx, access)
      const channels = (input.channels ?? []).map((c, i) => ({ ...c, ...channelValues(c.kind, c.value, country, `channels.${i}.value`) }))
      const core = coreColumns(input)
      const acknowledged = await requireDuplicateDecision(
        tx,
        {
          legalNameNormalized: core.legalNameNormalized,
          country: core.country,
          registrationNormalized: core.registrationNumberNormalized,
          taxValueNormalized: input.taxId ? normalizeTaxValue(input.taxId.value) : null,
          email: channels.find((c) => c.kind === 'email')?.valueNormalized ?? null,
          phoneE164: channels.find((c) => c.kind === 'phone')?.valueNormalized ?? null,
        },
        input.duplicateAcknowledged,
      )
      const userId = req.auth!.user.id
      const accountNo = await nextAccountNo(tx, access)
      const [row] = await tx
        .insert(corporateAccounts)
        .values({ ...core, companyId: access.companyId, accountNo, createdBranchId: branchId, createdBy: userId, updatedBy: userId })
        .returning({ id: corporateAccounts.id })
      const accountId = row!.id
      const seen = new Set<string>()
      for (const c of channels) {
        // The first channel of each kind is primary unless another one of that kind asks for it.
        const primary = c.isPrimary ? !seen.has(`p:${c.kind}`) : !seen.has(c.kind) && !channels.some((o) => o.kind === c.kind && o.isPrimary)
        if (primary) seen.add(`p:${c.kind}`)
        seen.add(c.kind)
        await tx.execute(sql`insert into corporate_contact_channels (company_id, account_id, kind, value, value_normalized, label, is_primary, created_by, updated_by)
          values (${access.companyId}, ${accountId}, ${c.kind}, ${c.value}, ${c.valueNormalized}, ${c.label ?? null}, ${primary}, ${userId}, ${userId})`)
      }
      if (input.address) {
        const a = input.address
        await tx.execute(sql`insert into corporate_addresses (company_id, account_id, kind, label, line1, line2, city, region, postal_code, country, is_primary, created_by, updated_by)
          values (${access.companyId}, ${accountId}, ${a.kind}, ${a.label ?? null}, ${a.line1}, ${a.line2 ?? null}, ${a.city}, ${a.region ?? null}, ${a.postalCode ?? null}, ${a.country}, true, ${userId}, ${userId})`)
      }
      if (input.taxId) {
        const t = input.taxId
        await tx.execute(sql`insert into corporate_tax_ids (company_id, account_id, country, scheme, value, value_normalized, validity, note, is_primary, created_by, updated_by)
          values (${access.companyId}, ${accountId}, ${t.country}, ${t.scheme}, ${t.value}, ${normalizeTaxValue(t.value)}, ${t.validity}, ${t.note ?? null}, true, ${userId}, ${userId})`)
      }
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.create',
        entity: 'corporate_account',
        entityId: accountId,
        summary: {
          accountNo,
          country: core.country,
          createdBranchId: branchId,
          channels: channels.map((c) => c.kind),
          address: input.address ? input.address.kind : null,
          taxId: input.taxId ? { country: input.taxId.country, scheme: input.taxId.scheme } : null,
          ...(acknowledged.length ? { acknowledgedDuplicates: acknowledged } : {}),
        },
      })
      return getAccount(tx, accountId)
    })
    return reply.code(201).send(created)
  })

  app.put('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = corporateUpdateSchema.parse(req.body)
      const [current] = await tx.select().from(corporateAccounts).where(eq(corporateAccounts.id, id)).for('update')
      if (!current) throw notFound(ACCOUNT_NOT_FOUND)
      if (current.version !== input.version) throw await conflict(tx, id)
      if (current.status === 'archived') throw new AppError(409, 'ACCOUNT_ARCHIVED', 'Arşivdeki kurumsal hesap düzenlenemez. Önce arşivden çıkarın.')
      const next = coreColumns(input)
      const fields: string[] = []
      const values: Record<string, [unknown, unknown]> = {}
      for (const [key, value] of Object.entries(next)) {
        if (key === 'legalNameNormalized' || key === 'registrationNumberNormalized') continue
        const before = current[key as keyof typeof current]
        if (String(before ?? null) === String(value ?? null)) continue
        fields.push(key)
        if ((CORPORATE_AUDITED_VALUE_FIELDS as readonly string[]).includes(key)) values[key] = [before ?? null, value ?? null]
      }
      if (!fields.length) return getAccount(tx, id)
      const userId = req.auth!.user.id
      await tx
        .update(corporateAccounts)
        .set({ ...next, version: sql`${corporateAccounts.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(eq(corporateAccounts.id, id))
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.update',
        entity: 'corporate_account',
        entityId: id,
        summary: { accountNo: current.accountNo, fromVersion: input.version, fields, values },
      })
      return getAccount(tx, id)
    })
  })

  /** Archiving hides the account from the default list. Nothing is deleted; links to people stay as they are (D13). */
  app.post('/:id/archive', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = corporateArchiveSchema.parse(req.body)
      const acc = await lockAccount(tx, id, { allowArchived: true })
      if (acc.version !== input.version) throw await conflict(tx, id)
      if (acc.status === 'archived') throw new AppError(409, 'ALREADY_ARCHIVED', 'Bu kurumsal hesap zaten arşivde.')
      const userId = req.auth!.user.id
      const now = new Date()
      await tx
        .update(corporateAccounts)
        .set({ status: 'archived', archivedAt: now, archivedReason: input.reason, archivedBy: userId, version: sql`${corporateAccounts.version} + 1`, updatedAt: now, updatedBy: userId })
        .where(eq(corporateAccounts.id, id))
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'corporate.archive', entity: 'corporate_account', entityId: id, summary: { accountNo: acc.accountNo, fromVersion: input.version, reason: input.reason } })
      return getAccount(tx, id)
    })
  })

  app.post('/:id/restore', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = corporateRestoreSchema.parse(req.body)
      const [current] = await tx.select().from(corporateAccounts).where(eq(corporateAccounts.id, id)).for('update')
      if (!current) throw notFound(ACCOUNT_NOT_FOUND)
      if (current.version !== input.version) throw await conflict(tx, id)
      if (current.status !== 'archived') throw new AppError(409, 'NOT_ARCHIVED', 'Bu kurumsal hesap arşivde değil.')
      const userId = req.auth!.user.id
      await tx
        .update(corporateAccounts)
        .set({ status: 'active', archivedAt: null, archivedReason: null, archivedBy: null, version: sql`${corporateAccounts.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(eq(corporateAccounts.id, id))
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.restore',
        entity: 'corporate_account',
        entityId: id,
        summary: { accountNo: current.accountNo, fromVersion: input.version, reason: input.reason, previousReason: current.archivedReason },
      })
      return getAccount(tx, id)
    })
  })

  // -------------------------------------------------------------------------
  // Contact channels

  app.post('/:id/channels', async (req, reply) => {
    const id = parseId(req)
    const out = await withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = channelInputSchema.parse(req.body)
      const body = req.body as { duplicateAcknowledged?: unknown }
      const acc = await lockAccount(tx, id)
      const v = channelValues(input.kind, input.value, await companyCountry(tx, access))
      if (input.kind === 'email' || input.kind === 'phone') {
        await requireDuplicateDecision(
          tx,
          { legalNameNormalized: null, country: null, registrationNormalized: null, taxValueNormalized: null, email: input.kind === 'email' ? v.valueNormalized : null, phoneE164: input.kind === 'phone' ? v.valueNormalized : null, excludeId: id },
          body?.duplicateAcknowledged === true,
        )
      }
      const userId = req.auth!.user.id
      const r = (
        await tx.execute(sql`insert into corporate_contact_channels (company_id, account_id, kind, value, value_normalized, label, is_primary, created_by, updated_by)
          values (${access.companyId}, ${id}, ${input.kind}, ${v.value}, ${v.valueNormalized}, ${input.label ?? null}, false, ${userId}, ${userId}) returning id`)
      ).rows[0] as Row
      if (input.isPrimary) await makePrimary(tx, 'corporate_contact_channels', id, input.kind, r.id as string)
      else await ensurePrimary(tx, 'corporate_contact_channels', id, input.kind)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'corporate.channel.add', entity: 'corporate_channel', entityId: r.id as string, summary: { accountId: id, accountNo: acc.accountNo, kind: input.kind } })
      return getAccount(tx, id)
    })
    return reply.code(201).send(out)
  })

  app.put('/:id/channels/:sid', async (req) => {
    const { id, sid } = parseSub(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = channelUpdateSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = await lockSub(tx, 'corporate_contact_channels', id, sid, input.version)
      const v = channelValues(input.kind, input.value, await companyCountry(tx, access))
      const after = { kind: input.kind, value: v.value, label: input.label ?? null }
      const fields = changed(cur, after, { kind: 'kind', value: 'value', label: 'label' })
      if ((input.kind === 'email' || input.kind === 'phone') && v.valueNormalized !== cur.value_normalized) {
        const body = req.body as { duplicateAcknowledged?: unknown }
        await requireDuplicateDecision(
          tx,
          { legalNameNormalized: null, country: null, registrationNormalized: null, taxValueNormalized: null, email: input.kind === 'email' ? v.valueNormalized : null, phoneE164: input.kind === 'phone' ? v.valueNormalized : null, excludeId: id },
          body?.duplicateAcknowledged === true,
        )
      }
      const userId = req.auth!.user.id
      const kindChanged = input.kind !== cur.kind
      if (fields.length) {
        await tx.execute(sql`update corporate_contact_channels set kind = ${input.kind}, value = ${v.value}, value_normalized = ${v.valueNormalized}, label = ${input.label ?? null},
          is_primary = ${kindChanged ? false : (cur.is_primary as boolean)}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      }
      if (input.isPrimary && !(cur.is_primary && !kindChanged)) {
        await makePrimary(tx, 'corporate_contact_channels', id, input.kind, sid)
        fields.push('isPrimary')
      }
      if (kindChanged) await ensurePrimary(tx, 'corporate_contact_channels', id, cur.kind as string)
      await ensurePrimary(tx, 'corporate_contact_channels', id, input.kind)
      if (fields.length) {
        await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'corporate.channel.update', entity: 'corporate_channel', entityId: sid, summary: { accountId: id, accountNo: acc.accountNo, kind: input.kind, fields } })
      }
      return getAccount(tx, id)
    })
  })

  app.post('/:id/channels/:sid/remove', async (req) => {
    const { id, sid } = parseSub(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = subRecordRemoveSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = await lockSub(tx, 'corporate_contact_channels', id, sid, input.version)
      const userId = req.auth!.user.id
      await tx.execute(sql`update corporate_contact_channels set removed_at = now(), removed_by = ${userId}, is_primary = false, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      const promoted = cur.is_primary ? await ensurePrimary(tx, 'corporate_contact_channels', id, cur.kind as string) : null
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'corporate.channel.remove', entity: 'corporate_channel', entityId: sid, summary: { accountId: id, accountNo: acc.accountNo, kind: cur.kind, wasPrimary: cur.is_primary, promoted: !!promoted } })
      return getAccount(tx, id)
    })
  })

  // -------------------------------------------------------------------------
  // Tax ids (D2–D5): several per account, any country and scheme; hints, never a verdict

  app.post('/:id/tax-ids', async (req, reply) => {
    const id = parseId(req)
    const out = await withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = taxIdInputSchema.parse(req.body)
      const body = req.body as { duplicateAcknowledged?: unknown }
      const acc = await lockAccount(tx, id)
      const normalized = normalizeTaxValue(input.value)
      const same = (await tx.execute(sql`select 1 from corporate_tax_ids where account_id = ${id} and country = ${input.country} and scheme = ${input.scheme} and value_normalized = ${normalized} and removed_at is null`)).rows.length
      if (same) throw new AppError(409, 'TAX_ID_EXISTS', 'Bu vergi kimliği bu hesapta zaten kayıtlı.', { value: 'Bu hesapta zaten kayıtlı' })
      await requireDuplicateDecision(
        tx,
        { legalNameNormalized: null, country: null, registrationNormalized: null, taxValueNormalized: normalized, email: null, phoneE164: null, excludeId: id },
        body?.duplicateAcknowledged === true,
      )
      const userId = req.auth!.user.id
      const r = (
        await tx.execute(sql`insert into corporate_tax_ids (company_id, account_id, country, scheme, value, value_normalized, validity, note, is_primary, created_by, updated_by)
          values (${access.companyId}, ${id}, ${input.country}, ${input.scheme}, ${input.value}, ${normalized}, ${input.validity}, ${input.note ?? null}, false, ${userId}, ${userId}) returning id`)
      ).rows[0] as Row
      if (input.isPrimary) await makePrimary(tx, 'corporate_tax_ids', id, null, r.id as string)
      else await ensurePrimary(tx, 'corporate_tax_ids', id, null)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.tax_id.add',
        entity: 'corporate_tax_id',
        entityId: r.id as string,
        summary: { accountId: id, accountNo: acc.accountNo, country: input.country, scheme: input.scheme, validity: input.validity, warnings: taxIdWarnings(input.country, input.scheme, input.value) },
      })
      return getAccount(tx, id)
    })
    return reply.code(201).send(out)
  })

  app.put('/:id/tax-ids/:sid', async (req) => {
    const { id, sid } = parseSub(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = taxIdUpdateSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = await lockSub(tx, 'corporate_tax_ids', id, sid, input.version)
      const normalized = normalizeTaxValue(input.value)
      const fields = changed(cur, { country: input.country, scheme: input.scheme, value: input.value, validity: input.validity, note: input.note ?? null }, { country: 'country', scheme: 'scheme', value: 'value', validity: 'validity', note: 'note' })
      if (normalized !== cur.value_normalized) {
        const body = req.body as { duplicateAcknowledged?: unknown }
        await requireDuplicateDecision(tx, { legalNameNormalized: null, country: null, registrationNormalized: null, taxValueNormalized: normalized, email: null, phoneE164: null, excludeId: id }, body?.duplicateAcknowledged === true)
      }
      const userId = req.auth!.user.id
      if (fields.length) {
        await tx
          .execute(sql`update corporate_tax_ids set country = ${input.country}, scheme = ${input.scheme}, value = ${input.value}, value_normalized = ${normalized}, validity = ${input.validity},
            note = ${input.note ?? null}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
          .catch((e: unknown) => {
            const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string }
            if (pg.code === '23505') throw new AppError(409, 'TAX_ID_EXISTS', 'Bu vergi kimliği bu hesapta zaten kayıtlı.', { value: 'Bu hesapta zaten kayıtlı' })
            throw e
          })
      }
      if (input.isPrimary && !cur.is_primary) {
        await makePrimary(tx, 'corporate_tax_ids', id, null, sid)
        fields.push('isPrimary')
      }
      if (fields.length) {
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'corporate.tax_id.update',
          entity: 'corporate_tax_id',
          entityId: sid,
          summary: { accountId: id, accountNo: acc.accountNo, country: input.country, scheme: input.scheme, validity: input.validity, fields },
        })
      }
      return getAccount(tx, id)
    })
  })

  app.post('/:id/tax-ids/:sid/remove', async (req) => {
    const { id, sid } = parseSub(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = subRecordRemoveSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = await lockSub(tx, 'corporate_tax_ids', id, sid, input.version)
      const userId = req.auth!.user.id
      await tx.execute(sql`update corporate_tax_ids set removed_at = now(), removed_by = ${userId}, is_primary = false, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      const promoted = cur.is_primary ? await ensurePrimary(tx, 'corporate_tax_ids', id, null) : null
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.tax_id.remove',
        entity: 'corporate_tax_id',
        entityId: sid,
        summary: { accountId: id, accountNo: acc.accountNo, country: cur.country, scheme: cur.scheme, wasPrimary: cur.is_primary, promoted: !!promoted },
      })
      return getAccount(tx, id)
    })
  })

  // -------------------------------------------------------------------------
  // Addresses (D7): several of each kind; one primary per kind

  app.post('/:id/addresses', async (req, reply) => {
    const id = parseId(req)
    const out = await withCompany(req, 'corporate.manage', async (tx, access) => {
      const a = addressInputSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const userId = req.auth!.user.id
      const r = (
        await tx.execute(sql`insert into corporate_addresses (company_id, account_id, kind, label, line1, line2, city, region, postal_code, country, is_primary, created_by, updated_by)
          values (${access.companyId}, ${id}, ${a.kind}, ${a.label ?? null}, ${a.line1}, ${a.line2 ?? null}, ${a.city}, ${a.region ?? null}, ${a.postalCode ?? null}, ${a.country}, false, ${userId}, ${userId}) returning id`)
      ).rows[0] as Row
      if (a.isPrimary) await makePrimary(tx, 'corporate_addresses', id, a.kind, r.id as string)
      else await ensurePrimary(tx, 'corporate_addresses', id, a.kind)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'corporate.address.add', entity: 'corporate_address', entityId: r.id as string, summary: { accountId: id, accountNo: acc.accountNo, kind: a.kind, country: a.country } })
      return getAccount(tx, id)
    })
    return reply.code(201).send(out)
  })

  app.put('/:id/addresses/:sid', async (req) => {
    const { id, sid } = parseSub(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const a = addressUpdateSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = await lockSub(tx, 'corporate_addresses', id, sid, a.version)
      const after = { kind: a.kind, label: a.label ?? null, line1: a.line1, line2: a.line2 ?? null, city: a.city, region: a.region ?? null, postalCode: a.postalCode ?? null, country: a.country }
      const fields = changed(cur, after, { kind: 'kind', label: 'label', line1: 'line1', line2: 'line2', city: 'city', region: 'region', postalCode: 'postal_code', country: 'country' })
      const userId = req.auth!.user.id
      const kindChanged = a.kind !== cur.kind
      if (fields.length) {
        await tx.execute(sql`update corporate_addresses set kind = ${a.kind}, label = ${after.label}, line1 = ${a.line1}, line2 = ${after.line2}, city = ${a.city}, region = ${after.region},
          postal_code = ${after.postalCode}, country = ${a.country}, is_primary = ${kindChanged ? false : (cur.is_primary as boolean)}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      }
      if (a.isPrimary && !(cur.is_primary && !kindChanged)) {
        await makePrimary(tx, 'corporate_addresses', id, a.kind, sid)
        fields.push('isPrimary')
      }
      if (kindChanged) await ensurePrimary(tx, 'corporate_addresses', id, cur.kind as string)
      await ensurePrimary(tx, 'corporate_addresses', id, a.kind)
      if (fields.length) {
        await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'corporate.address.update', entity: 'corporate_address', entityId: sid, summary: { accountId: id, accountNo: acc.accountNo, kind: a.kind, country: a.country, fields } })
      }
      return getAccount(tx, id)
    })
  })

  app.post('/:id/addresses/:sid/remove', async (req) => {
    const { id, sid } = parseSub(req)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      const input = subRecordRemoveSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = await lockSub(tx, 'corporate_addresses', id, sid, input.version)
      const userId = req.auth!.user.id
      await tx.execute(sql`update corporate_addresses set removed_at = now(), removed_by = ${userId}, is_primary = false, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      const promoted = cur.is_primary ? await ensurePrimary(tx, 'corporate_addresses', id, cur.kind as string) : null
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.address.remove',
        entity: 'corporate_address',
        entityId: sid,
        summary: { accountId: id, accountNo: acc.accountNo, kind: cur.kind, country: cur.country, wasPrimary: cur.is_primary, promoted: !!promoted },
      })
      return { ...(await getAccount(tx, id))!, promotedAddressId: promoted }
    })
  })

  // -------------------------------------------------------------------------
  // People (D8–D11): links to existing customers of the same company; history kept

  app.get('/:id/people', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'corporate.read', async (tx, access) => {
      // Names and contact details of people are customer data (D10).
      need(access, 'customers.read')
      if (!(await getAccount(tx, id))) throw notFound(ACCOUNT_NOT_FOUND)
      const licenceShown = access.permissions.has('customers.documents.read')
      const licence = licenceShown ? { today: await companyToday(tx, access), warningDays: await documentWarningDays(tx) } : null
      return { items: await loadPeople(tx, id, licence), licenceShown }
    })
  })

  app.post('/:id/people', async (req, reply) => {
    const id = parseId(req)
    const out = await withCompany(req, 'corporate.manage', async (tx, access) => {
      need(access, 'customers.read')
      const input = personLinkSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      // Another company's customer is invisible here (RLS): the same answer as an unknown id.
      const customer = await getCustomer(tx, input.customerId)
      if (!customer) throw new AppError(404, 'NOT_FOUND', CUSTOMER_NOT_FOUND, { customerId: 'Kişi bulunamadı' })
      if (customer.status !== 'active') throw new AppError(409, 'CUSTOMER_ARCHIVED', 'Arşivdeki müşteri kurumsal hesaba bağlanamaz. Önce müşteriyi arşivden çıkarın.')
      const existing = (await tx.execute(sql`select id from corporate_account_people where account_id = ${id} and customer_id = ${input.customerId} and ended_at is null`)).rows[0] as Row | undefined
      if (existing) throw new AppError(409, 'ALREADY_LINKED', 'Bu kişi bu hesaba zaten bağlı. Rollerini kişinin satırından değiştirin.', undefined, { linkId: existing.id })
      const userId = req.auth!.user.id
      const r = (
        await tx
          .execute(sql`insert into corporate_account_people (company_id, account_id, customer_id, roles, job_title, note, valid_from, valid_until, created_by, updated_by)
            values (${access.companyId}, ${id}, ${input.customerId}, ${sql`${`{${input.roles.join(',')}}`}::text[]`}, ${input.jobTitle ?? null}, ${input.note ?? null}, ${input.validFrom ?? null}, ${input.validUntil ?? null}, ${userId}, ${userId}) returning id`)
          .catch((e: unknown) => {
            const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string }
            if (pg.code === '23505') throw new AppError(409, 'ALREADY_LINKED', 'Bu kişi bu hesaba zaten bağlı.')
            throw e
          })
      ).rows[0] as Row
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.person.link',
        entity: 'corporate_person',
        entityId: r.id as string,
        summary: { accountId: id, accountNo: acc.accountNo, customerId: customer.id, customerNo: customer.customerNo, roles: input.roles },
      })
      return { id: r.id as string }
    })
    return reply.code(201).send(out)
  })

  app.put('/:id/people/:sid', async (req) => {
    const { id, sid } = parseSub(req, PERSON_LINK_NOT_FOUND)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      need(access, 'customers.read')
      const input = personUpdateSchema.parse(req.body)
      const acc = await lockAccount(tx, id)
      const cur = (await tx.execute(sql`select p.*, c.customer_no from corporate_account_people p join customers c on c.company_id = p.company_id and c.id = p.customer_id where p.id = ${sid} and p.account_id = ${id} for update of p`)).rows[0] as Row | undefined
      if (!cur) throw notFound(PERSON_LINK_NOT_FOUND)
      if (cur.ended_at) throw new AppError(409, 'LINK_ENDED', 'Sona ermiş ilişki değiştirilemez. Kişiyi yeniden bağlayın.')
      if (cur.version !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu ilişki siz düzenlerken başka bir kullanıcı tarafından güncellendi. Güncel bilgiler yüklendi.')
      const beforeRoles = [...(cur.roles as string[])].sort()
      const afterRoles = [...input.roles].sort()
      const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10))
      const fields: string[] = []
      if (beforeRoles.join() !== afterRoles.join()) fields.push('roles')
      if ((cur.job_title ?? null) !== (input.jobTitle ?? null)) fields.push('jobTitle')
      if ((cur.note ?? null) !== (input.note ?? null)) fields.push('note')
      if (day(cur.valid_from) !== (input.validFrom ?? null)) fields.push('validFrom')
      if (day(cur.valid_until) !== (input.validUntil ?? null)) fields.push('validUntil')
      if (!fields.length) return { id: sid }
      const userId = req.auth!.user.id
      await tx.execute(sql`update corporate_account_people set roles = ${sql`${`{${input.roles.join(',')}}`}::text[]`}, job_title = ${input.jobTitle ?? null}, note = ${input.note ?? null},
        valid_from = ${input.validFrom ?? null}, valid_until = ${input.validUntil ?? null}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.person.update',
        entity: 'corporate_person',
        entityId: sid,
        summary: { accountId: id, accountNo: acc.accountNo, customerId: cur.customer_id, customerNo: cur.customer_no, fields, ...(fields.includes('roles') ? { roles: [beforeRoles, afterRoles] } : {}) },
      })
      return { id: sid }
    })
  })

  /** Ends a link: the person's customer record is untouched and the link stays as history (D9). */
  app.post('/:id/people/:sid/end', async (req) => {
    const { id, sid } = parseSub(req, PERSON_LINK_NOT_FOUND)
    return withCompany(req, 'corporate.manage', async (tx, access) => {
      need(access, 'customers.read')
      const input = personEndSchema.parse(req.body)
      // Ending is allowed on archived accounts too: a person may leave a company that no longer rents.
      const acc = await lockAccount(tx, id, { allowArchived: true })
      const cur = (await tx.execute(sql`select p.*, c.customer_no from corporate_account_people p join customers c on c.company_id = p.company_id and c.id = p.customer_id where p.id = ${sid} and p.account_id = ${id} for update of p`)).rows[0] as Row | undefined
      if (!cur) throw notFound(PERSON_LINK_NOT_FOUND)
      if (cur.ended_at) throw new AppError(409, 'LINK_ENDED', 'Bu ilişki zaten sona ermiş.')
      if (cur.version !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu ilişki siz işlem yaparken güncellendi. Güncel bilgiler yüklendi.')
      const userId = req.auth!.user.id
      await tx.execute(sql`update corporate_account_people set ended_at = now(), ended_by = ${userId}, ended_reason = ${input.reason}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${sid}`)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'corporate.person.end',
        entity: 'corporate_person',
        entityId: sid,
        summary: { accountId: id, accountNo: acc.accountNo, customerId: cur.customer_id, customerNo: cur.customer_no, roles: cur.roles, reason: input.reason },
      })
      return { id: sid }
    })
  })
}

/** Müşteri 360°: the person's corporate links (needs both the customer and the corporate read permission). */
export async function customerCorporateLinkRoutes(app: FastifyInstance) {
  app.get('/:id/corporate-links', async (req) => {
    const p = idParams.safeParse(req.params)
    if (!p.success) throw notFound(CUSTOMER_NOT_FOUND)
    return withCompany(req, 'customers.read', async (tx, access) => {
      need(access, 'corporate.read')
      if (!(await getCustomer(tx, p.data.id))) throw notFound(CUSTOMER_NOT_FOUND)
      return { items: await customerLinks(tx, p.data.id) }
    })
  })
}

