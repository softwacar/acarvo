import { randomUUID } from 'node:crypto'
import {
  CUSTOMER_DOCUMENT_TYPE_INFO,
  type CustomerDocument,
  type CustomerDocumentFile,
  type CustomerDocumentType,
  customerDocumentCreateSchema,
  customerDocumentRenewSchema,
  customerDocumentUpdateSchema,
  customerDocumentValidity,
  customerDocumentVerifySchema,
  customerDocumentVoidSchema,
  DEFAULT_DOCUMENT_WARNING_DAYS,
  documentLookupSchema,
  documentNumberHint,
  maskedNumber,
  validateDocumentUpdate,
  type CustomerDocumentStatus,
  evaluateRequirements,
  type Permission,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { customerDocuments } from '../../db/schema'
import { audit } from '../../lib/audit'
import { documentUploadPolicy } from '../../lib/malware'
import type { CustomerCrypto } from '../../lib/customer-crypto'
import { AppError, notFound } from '../../lib/errors'
import { consumeSensitiveAction, DOCUMENT_NUMBER_CHECK_LIMITS } from '../../lib/sensitive-actions'
import { toIso } from '../../lib/timestamps'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { companyToday } from '../vehicles/document-overview'
import { CUSTOMER_NOT_FOUND, getCustomer } from './repository'
import { branchCountries, loadPolicies } from '../settings/document-requirements'

type Row = Record<string, unknown>

export const DOCUMENT_NOT_FOUND = 'Belge bulunamadı veya bu belgeye erişim yetkiniz yok.'
const KEYS_MISSING = 'Belge numaraları ve dosyaları için şifreleme anahtarı yapılandırılmadı. Sistem yöneticisi anahtar kurulumunu tamamlamalı.'

const custParams = z.object({ id: z.uuid() })
const docParams = z.object({ id: z.uuid(), docId: z.uuid() })
const parse = <T>(schema: z.ZodType<T>, value: unknown, message: string): T => {
  const r = schema.safeParse(value)
  if (!r.success) throw notFound(message)
  return r.data
}
const str = (v: unknown) => (v == null ? null : String(v))
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10))

/** Exact-match key of a number: per company (derived HMAC key), per type and issuing country. */
export const lookupParts = (type: string, issuingCountry: string | null, normalized: string) => [type, issuingCountry ?? '', normalized]

/** Warning window for "expiring" (company setting from M2e; default 30 days). */
export async function documentWarningDays(tx: Tx): Promise<number> {
  const exists = (await tx.execute(sql`select to_regclass('customer_document_settings') is not null as e`)).rows[0] as { e: boolean }
  if (!exists.e) return DEFAULT_DOCUMENT_WARNING_DAYS
  const r = (await tx.execute(sql`select warning_days from customer_document_settings limit 1`)).rows[0] as { warning_days: number } | undefined
  return r?.warning_days ?? DEFAULT_DOCUMENT_WARNING_DAYS
}

export function requireCrypto(crypto: CustomerCrypto | null): CustomerCrypto {
  if (!crypto) throw new AppError(503, 'CUSTOMER_KEYS_MISSING', KEYS_MISSING)
  return crypto
}

/** Encrypted columns for a number bound to this company and document. */
export function numberColumns(crypto: CustomerCrypto, companyId: string, documentId: string, type: string, issuingCountry: string | null, normalized: string) {
  const enc = crypto.encrypt(companyId, 'number', documentId, Buffer.from(normalized, 'utf8'))
  const lookup = crypto.lookup(companyId, lookupParts(type, issuingCountry, normalized))
  return { numberCiphertext: enc.ciphertext, numberKeyId: enc.keyId, numberHint: documentNumberHint(normalized), numberLookup: lookup.hash, numberLookupKeyId: lookup.keyId }
}
const NO_NUMBER = { numberCiphertext: null, numberKeyId: null, numberHint: null, numberLookup: null, numberLookupKeyId: null }

/**
 * Refuses a number that is active for another customer of this company. Compared with every lookup key in the ring,
 * so it also holds during a lookup-key rotation. The answer names the other customer only by number and name, which the
 * user can see anyway; never the document number.
 */
async function assertNumberFree(tx: Tx, crypto: CustomerCrypto, access: CompanyAccess, customerId: string, type: string, issuingCountry: string | null, normalized: string, exceptDocumentId?: string) {
  const hashes = crypto.lookupCandidates(access.companyId, lookupParts(type, issuingCountry, normalized)).map((c) => c.hash)
  const r = (
    await tx.execute(sql`
      select c.customer_no, c.display_name from customer_documents d join customers c on c.company_id = d.company_id and c.id = d.customer_id
      where d.record_state = 'active' and d.customer_id <> ${customerId} and d.number_lookup in ${hashes}
        ${exceptDocumentId ? sql`and d.id <> ${exceptDocumentId}` : sql``}
      limit 1`)
  ).rows[0] as Row | undefined
  // The other customer is named only to users who may see customers anyway.
  if (r) throw numberInUse(access.permissions.has('customers.read') ? { customerNo: r.customer_no as string, displayName: r.display_name as string } : null)
}
const numberInUse = (other: { customerNo: string; displayName: string } | null) =>
  new AppError(409, 'DOCUMENT_NUMBER_IN_USE', 'Bu belge numarası şirketinizde başka bir müşteride kayıtlı.', { number: 'Bu numara başka bir müşteride kayıtlı' }, other ? { otherCustomer: other } : null)

/** Database guard of the same rule (concurrent saves) ends as the same 409. */
export function mapDocumentViolation(e: unknown): never {
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string }
  if (pg.code === '23505' && pg.constraint === 'customer_documents_number_owner') throw numberInUse(null)
  if (pg.code === '23505' && pg.constraint === 'customer_documents_renews_once_key') throw new AppError(409, 'ALREADY_RENEWED', 'Bu belge dönemi zaten yenilenmiş.')
  throw e
}

async function activeCustomer(tx: Tx, customerId: string) {
  const c = await getCustomer(tx, customerId)
  if (!c) throw notFound(CUSTOMER_NOT_FOUND)
  if (c.status !== 'active') throw new AppError(409, 'CUSTOMER_ARCHIVED', 'Arşivdeki müşterinin belgeleri değiştirilemez. Önce arşivden çıkarın.')
  return c
}

/** Documents of one customer with their files, newest first; masked numbers only. */
export async function loadCustomerDocuments(tx: Tx, customerId: string, today: string, warningDays: number, onlyId?: string): Promise<CustomerDocument[]> {
  const rows = (
    await tx.execute(sql`
      select d.id, d.customer_id, d.type, d.issuing_country, d.issuing_authority, d.title, d.number_hint, d.issued_on, d.valid_from, d.valid_until,
             d.license_categories, d.license_first_issued_on, d.entry_date, d.note, d.record_state, d.voided_reason, d.voided_note, d.voided_at,
             d.verification, d.verified_at, d.renews_id, d.version, d.created_at, d.updated_at,
             vu.name as voided_by_name, ve.name as verified_by_name, cu.name as created_by_name, uu.name as updated_by_name,
             (select n.id from customer_documents n where n.company_id = d.company_id and n.renews_id = d.id and n.record_state <> 'voided' limit 1) as renewed_by_id
      from customer_documents d
      left join users vu on vu.id = d.voided_by
      left join users ve on ve.id = d.verified_by
      left join users cu on cu.id = d.created_by
      left join users uu on uu.id = d.updated_by
      where d.customer_id = ${customerId} ${onlyId ? sql`and d.id = ${onlyId}` : sql``}
      order by d.created_at desc`)
  ).rows as Row[]
  const ids = rows.map((r) => r.id as string)
  const fileRows = ids.length
    ? ((
        await tx.execute(sql`
          select df.document_id, df.side, df.version_no, df.created_at, f.id, f.kind, f.size_bytes, f.pages, u.name as uploaded_by_name
          from customer_document_files df
          join customer_files f on f.company_id = df.company_id and f.id = df.file_id
          left join users u on u.id = df.uploaded_by
          where df.document_id in (select unnest(${`{${ids.join(',')}}`}::uuid[]))
          order by df.version_no desc`)
      ).rows as Row[])
    : []
  return rows.map((r) => {
    const mine = fileRows.filter((f) => f.document_id === r.id)
    const seenSides = new Set<string>()
    const files: CustomerDocumentFile[] = mine.map((f) => {
      // The newest version of front and back is current; extra pages are all current.
      const side = f.side as CustomerDocumentFile['side']
      const current = side === 'page' || !seenSides.has(side)
      seenSides.add(side)
      return {
        id: f.id as string,
        side,
        versionNo: Number(f.version_no),
        kind: f.kind as CustomerDocumentFile['kind'],
        sizeBytes: Number(f.size_bytes),
        pages: f.pages == null ? null : Number(f.pages),
        current,
        uploadedByName: str(f.uploaded_by_name),
        createdAt: toIso(f.created_at),
      }
    })
    const recordState = r.record_state as 'active' | 'voided'
    const superseded = !!r.renewed_by_id
    return {
      id: r.id as string,
      customerId: r.customer_id as string,
      type: r.type as CustomerDocumentType,
      issuingCountry: str(r.issuing_country),
      issuingAuthority: str(r.issuing_authority),
      title: str(r.title),
      maskedNumber: maskedNumber(r.number_hint == null ? null : String(r.number_hint)),
      issuedOn: day(r.issued_on),
      validFrom: day(r.valid_from),
      validUntil: day(r.valid_until),
      licenseCategories: (r.license_categories as string[]) ?? [],
      licenseFirstIssuedOn: day(r.license_first_issued_on),
      entryDate: day(r.entry_date),
      note: str(r.note),
      recordState,
      voidedReason: (r.voided_reason as CustomerDocument['voidedReason']) ?? null,
      voidedNote: str(r.voided_note),
      voidedAt: r.voided_at ? toIso(r.voided_at) : null,
      voidedByName: str(r.voided_by_name),
      verification: r.verification as CustomerDocument['verification'],
      verifiedAt: r.verified_at ? toIso(r.verified_at) : null,
      verifiedByName: str(r.verified_by_name),
      renewsId: str(r.renews_id),
      renewedById: str(r.renewed_by_id),
      validity: customerDocumentValidity({ recordState, superseded, validFrom: day(r.valid_from), validUntil: day(r.valid_until) }, today, warningDays),
      files,
      version: Number(r.version),
      createdAt: toIso(r.created_at),
      createdByName: str(r.created_by_name),
      updatedAt: toIso(r.updated_at),
      updatedByName: str(r.updated_by_name),
    }
  })
}

async function lockDocument(tx: Tx, customerId: string, docId: string) {
  const r = (await tx.execute(sql`select * from customer_documents where id = ${docId} and customer_id = ${customerId} for update`)).rows[0] as Row | undefined
  if (!r) throw notFound(DOCUMENT_NOT_FOUND)
  return r
}

const VERSION_CONFLICT = (current: CustomerDocument | undefined) =>
  new AppError(409, 'VERSION_CONFLICT', 'Bu belge siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, { current })

/** Non-number field values written by create, correct and renew. */
function plainColumns(d: z.infer<typeof customerDocumentUpdateSchema> | z.infer<typeof customerDocumentCreateSchema>) {
  return {
    issuingCountry: d.issuingCountry ?? null,
    issuingAuthority: d.issuingAuthority ?? null,
    title: d.title ?? null,
    issuedOn: d.issuedOn ?? null,
    validFrom: d.validFrom ?? null,
    validUntil: d.validUntil ?? null,
    licenseCategories: d.licenseCategories ?? [],
    licenseFirstIssuedOn: d.licenseFirstIssuedOn ?? null,
    entryDate: d.entryDate ?? null,
    note: d.note ?? null,
  }
}

const docAudit = (tx: Tx, access: CompanyAccess, req: FastifyRequest, action: string, docId: string, customer: { id: string; customerNo: string }, summary: Record<string, unknown>) =>
  audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action, entity: 'customer_document', entityId: docId, summary: { customerId: customer.id, customerNo: customer.customerNo, ...summary } })

export async function customerDocumentRoutes(app: FastifyInstance) {
  /**
   * Counts a typed document number (DOCUMENT_NUMBER_CHECK_LIMITS) in its own committed transaction before the request
   * runs, so refused attempts (number in use, invalid fields, conflicts) count too. Needs the same permission as the
   * request; without keys nothing is compared and nothing is counted. The number itself is never stored or logged.
   */
  async function chargeNumberCheck(req: FastifyRequest, permission: Permission, also?: Permission) {
    if (!app.customerCrypto) return
    try {
      await withCompany(req, permission, async (tx, access) => {
        if (also && !access.permissions.has(also)) throw new AppError(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok.')
        await consumeSensitiveAction(tx, {
          userId: req.auth!.user.id,
          companyId: access.companyId,
          action: 'document_number_check',
          limits: DOCUMENT_NUMBER_CHECK_LIMITS,
          code: 'DOCUMENT_NUMBER_LIMIT',
          message: (minutes) =>
            `Kısa sürede çok sayıda belge numarası girildi. Güvenlik nedeniyle numara içeren işlemler geçici olarak durduruldu; yaklaşık ${minutes} dakika sonra tekrar deneyin. Numarasız işlemler devam edebilir.`,
        })
      })
    } catch (e) {
      if (e instanceof AppError && e.status === 429) req.log.warn({ userId: req.auth?.user.id, code: e.code }, 'document number check limit reached')
      throw e
    }
  }
  const typedNumber = (body: unknown) => {
    const n = (body as { number?: unknown } | null | undefined)?.number
    return typeof n === 'string' && n.trim() !== ''
  }

  const context = async (tx: Tx, access: CompanyAccess) => ({ today: await companyToday(tx, access), warningDays: await documentWarningDays(tx) })
  const one = async (tx: Tx, access: CompanyAccess, customerId: string, docId: string) => {
    const { today, warningDays } = await context(tx, access)
    return (await loadCustomerDocuments(tx, customerId, today, warningDays, docId))[0]!
  }

  app.get('/:id/documents', async (req) => {
    const { id } = parse(custParams, req.params, CUSTOMER_NOT_FOUND)
    return withCompany(req, 'customers.documents.read', async (tx, access) => {
      if (!(await getCustomer(tx, id))) throw notFound(CUSTOMER_NOT_FOUND)
      const { today, warningDays } = await context(tx, access)
      const uploads = documentUploadPolicy(app.env, app.scanner)
      return { items: await loadCustomerDocuments(tx, id, today, warningDays), today, warningDays, keysConfigured: !!app.customerCrypto, uploadsEnabled: uploads.enabled && !!app.customerCrypto }
    })
  })

  app.post('/:id/documents', async (req, reply) => {
    const { id } = parse(custParams, req.params, CUSTOMER_NOT_FOUND)
    if (typedNumber(req.body)) await chargeNumberCheck(req, 'customers.documents.manage')
    const created = await withCompany(req, 'customers.documents.manage', async (tx, access) => {
      const input = customerDocumentCreateSchema.parse(req.body)
      const customer = await activeCustomer(tx, id)
      const docId = randomUUID()
      let number: ReturnType<typeof numberColumns> | typeof NO_NUMBER = NO_NUMBER
      if (input.number) {
        const crypto = requireCrypto(app.customerCrypto)
        await assertNumberFree(tx, crypto, access, id, input.type, input.issuingCountry ?? null, input.number)
        number = numberColumns(crypto, access.companyId, docId, input.type, input.issuingCountry ?? null, input.number)
      }
      const userId = req.auth!.user.id
      const verified = input.verification !== 'not_verified'
      await tx
        .insert(customerDocuments)
        .values({
          id: docId,
          companyId: access.companyId,
          customerId: id,
          type: input.type,
          ...plainColumns(input),
          ...number,
          verification: input.verification,
          verifiedBy: verified ? userId : null,
          verifiedAt: verified ? new Date() : null,
          createdBy: userId,
          updatedBy: userId,
        })
        .catch(mapDocumentViolation)
      await docAudit(tx, access, req, 'customer.document.create', docId, customer, {
        type: input.type,
        issuingCountry: input.issuingCountry ?? null,
        hasNumber: !!input.number,
        verification: input.verification,
      })
      return one(tx, access, id, docId)
    })
    return reply.code(201).send(created)
  })

  /** Corrects a period. The stored number is replaced only when a new one is typed. */
  app.put('/:id/documents/:docId', async (req) => {
    const { id, docId } = parse(docParams, req.params, DOCUMENT_NOT_FOUND)
    if (typedNumber(req.body)) await chargeNumberCheck(req, 'customers.documents.manage')
    return withCompany(req, 'customers.documents.manage', async (tx, access) => {
      const input = customerDocumentUpdateSchema.parse(req.body)
      const customer = await activeCustomer(tx, id)
      const current = await lockDocument(tx, id, docId)
      if (Number(current.version) !== input.version) throw VERSION_CONFLICT(await one(tx, access, id, docId))
      if (current.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belge düzeltilemez.')
      if (current.locked_at) throw new AppError(409, 'DOCUMENT_LOCKED', 'Bu belge bir kiralamada kullanıldığı için düzeltilemez; yeni dönem açın.')
      const type = current.type as CustomerDocumentType
      const issues = validateDocumentUpdate(type, input, current.number_ciphertext != null)
      if (issues.length) throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', Object.fromEntries(issues.map((i) => [i.path, i.message])))

      const next = plainColumns(input)
      const fields: string[] = []
      for (const [k, v] of Object.entries(next)) {
        const col = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)
        const before = current[col]
        const norm = (x: unknown) => (Array.isArray(x) ? x.join(',') : x == null ? '' : String(x))
        if (norm(before) !== norm(v)) fields.push(k)
      }
      let number: Partial<ReturnType<typeof numberColumns>> = {}
      const issuingCountry = next.issuingCountry
      const countryChanged = fields.includes('issuingCountry')
      if (input.number || (countryChanged && current.number_ciphertext != null)) {
        const crypto = requireCrypto(app.customerCrypto)
        // A new country changes the exact-match key; the stored number is re-keyed (decrypted and re-encrypted in memory).
        const plain = input.number ?? crypto.decrypt(access.companyId, 'number', docId, current.number_ciphertext as Buffer, current.number_key_id as string).toString('utf8')
        await assertNumberFree(tx, crypto, access, id, type, issuingCountry, plain, docId)
        number = numberColumns(crypto, access.companyId, docId, type, issuingCountry, plain)
        if (input.number) fields.push('number')
      }
      if (CUSTOMER_DOCUMENT_TYPE_INFO[type].number === 'none') number = {}
      if (!fields.length) return one(tx, access, id, docId)
      const userId = req.auth!.user.id
      await tx
        .update(customerDocuments)
        .set({ ...next, ...number, version: sql`${customerDocuments.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(sql`${customerDocuments.id} = ${docId}`)
        .catch(mapDocumentViolation)
      await docAudit(tx, access, req, 'customer.document.update', docId, customer, { type, fromVersion: input.version, fields })
      return one(tx, access, id, docId)
    })
  })

  app.post('/:id/documents/:docId/verify', async (req) => {
    const { id, docId } = parse(docParams, req.params, DOCUMENT_NOT_FOUND)
    return withCompany(req, 'customers.documents.manage', async (tx, access) => {
      const input = customerDocumentVerifySchema.parse(req.body)
      const customer = await activeCustomer(tx, id)
      const current = await lockDocument(tx, id, docId)
      if (Number(current.version) !== input.version) throw VERSION_CONFLICT(await one(tx, access, id, docId))
      if (current.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belge doğrulanamaz.')
      const userId = req.auth!.user.id
      await tx
        .update(customerDocuments)
        .set({ verification: input.verification, verifiedBy: userId, verifiedAt: new Date(), version: sql`${customerDocuments.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(sql`${customerDocuments.id} = ${docId}`)
      await docAudit(tx, access, req, 'customer.document.verify', docId, customer, { type: current.type, verification: input.verification, previous: current.verification })
      return one(tx, access, id, docId)
    })
  })

  /** New period of the same document; the previous period and its files stay unchanged. */
  app.post('/:id/documents/:docId/renew', async (req, reply) => {
    const { id, docId } = parse(docParams, req.params, DOCUMENT_NOT_FOUND)
    if (typedNumber(req.body)) await chargeNumberCheck(req, 'customers.documents.manage')
    const created = await withCompany(req, 'customers.documents.manage', async (tx, access) => {
      const input = customerDocumentRenewSchema.parse(req.body)
      const customer = await activeCustomer(tx, id)
      const old = await lockDocument(tx, id, docId)
      if (Number(old.version) !== input.version) throw VERSION_CONFLICT(await one(tx, access, id, docId))
      if (old.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belge yenilenemez.')
      const type = old.type as CustomerDocumentType
      const keep = !!input.keepNumber && old.number_ciphertext != null && !input.number
      const issues = validateDocumentUpdate(type, input, keep)
      if (issues.length) throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', Object.fromEntries(issues.map((i) => [i.path, i.message])))
      const newId = randomUUID()
      const issuingCountry = input.issuingCountry ?? null
      let number: ReturnType<typeof numberColumns> | typeof NO_NUMBER = NO_NUMBER
      if (input.number || keep) {
        const crypto = requireCrypto(app.customerCrypto)
        const plain = input.number ?? crypto.decrypt(access.companyId, 'number', docId, old.number_ciphertext as Buffer, old.number_key_id as string).toString('utf8')
        await assertNumberFree(tx, crypto, access, id, type, issuingCountry, plain)
        number = numberColumns(crypto, access.companyId, newId, type, issuingCountry, plain)
      }
      const userId = req.auth!.user.id
      const verified = input.verification !== 'not_verified'
      await tx
        .insert(customerDocuments)
        .values({
          id: newId,
          companyId: access.companyId,
          customerId: id,
          type,
          ...plainColumns(input),
          ...number,
          verification: input.verification,
          verifiedBy: verified ? userId : null,
          verifiedAt: verified ? new Date() : null,
          renewsId: docId,
          createdBy: userId,
          updatedBy: userId,
        })
        .catch(mapDocumentViolation)
      await docAudit(tx, access, req, 'customer.document.renew', newId, customer, { type, renewsId: docId, keptNumber: keep, hasNumber: number.numberCiphertext !== null })
      return one(tx, access, id, newId)
    })
    return reply.code(201).send(created)
  })

  app.post('/:id/documents/:docId/void', async (req) => {
    const { id, docId } = parse(docParams, req.params, DOCUMENT_NOT_FOUND)
    return withCompany(req, 'customers.documents.manage', async (tx, access) => {
      const input = customerDocumentVoidSchema.parse(req.body)
      const customer = await activeCustomer(tx, id)
      const current = await lockDocument(tx, id, docId)
      if (Number(current.version) !== input.version) throw VERSION_CONFLICT(await one(tx, access, id, docId))
      if (current.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Bu belge zaten geçersiz sayılmış.')
      const userId = req.auth!.user.id
      await tx
        .update(customerDocuments)
        .set({ recordState: 'voided', voidedAt: new Date(), voidedBy: userId, voidedReason: input.reason, voidedNote: input.note ?? null, version: sql`${customerDocuments.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(sql`${customerDocuments.id} = ${docId}`)
      await docAudit(tx, access, req, 'customer.document.void', docId, customer, { type: current.type, reason: input.reason })
      return one(tx, access, id, docId)
    })
  })

  /**
   * How the customer's documents meet the company's active country policies. For every country of the company's
   * branches, each residency class with an active policy is evaluated side by side: the class itself is decided by staff
   * at rental time, never derived here. Information only; nothing is blocked.
   */
  app.get('/:id/document-status', async (req) => {
    const { id } = parse(custParams, req.params, CUSTOMER_NOT_FOUND)
    return withCompany(req, 'customers.documents.read', async (tx, access) => {
      const customer = await getCustomer(tx, id)
      if (!customer) throw notFound(CUSTOMER_NOT_FOUND)
      const { today, warningDays } = await context(tx, access)
      const documents = await loadCustomerDocuments(tx, id, today, warningDays)
      const policies = await loadPolicies(tx, true)
      const branches = await branchCountries(tx)
      const countries = [...new Set([...branches.countries.map((c) => c.country), ...policies.map((p) => p.country)])].sort()
      const status: CustomerDocumentStatus = {
        today,
        warningDays,
        residenceCountry: customer.residenceCountry,
        branchesWithoutCountry: branches.withoutCountry,
        countries: countries.map((country) => ({
          country,
          branchCount: branches.countries.find((c) => c.country === country)?.branchCount ?? 0,
          classes: policies
            .filter((p) => p.country === country)
            .sort((a, b) => a.residencyClass.localeCompare(b.residencyClass) * -1)
            .map((p) => ({ residencyClass: p.residencyClass, policyId: p.id, version: p.version, items: evaluateRequirements(p.items, documents) })),
        })),
      }
      return status
    })
  })

  /** What happened to one document: entries without values (no numbers, no file contents or names). */
  app.get('/:id/documents/:docId/history', async (req) => {
    const { id, docId } = parse(docParams, req.params, DOCUMENT_NOT_FOUND)
    return withCompany(req, 'customers.documents.read', async (tx) => {
      const r = (await tx.execute(sql`select 1 from customer_documents where id = ${docId} and customer_id = ${id}`)).rows
      if (!r.length) throw notFound(DOCUMENT_NOT_FOUND)
      const items = (
        await tx.execute(sql`
          select a.id, a.action, a.summary, a.created_at, u.name as actor_name
          from audit_log a left join users u on u.id = a.actor_user_id
          where a.entity = 'customer_document' and a.entity_id = ${docId}
          order by a.created_at desc limit 200`)
      ).rows as Row[]
      return { items: items.map((a) => ({ id: a.id as string, action: a.action as string, summary: (a.summary as Record<string, unknown>) ?? null, at: toIso(a.created_at), actorName: str(a.actor_name) })) }
    })
  })

  /**
   * Finds the customer holding an exact document number, inside the active company only. The number travels in the
   * body, is compared as a per-company HMAC and is never logged or returned. Rate limited against sweeping: per minute in
   * memory and DOCUMENT_NUMBER_CHECK_LIMITS in the database (shared with typed numbers in create, correct and renew).
   */
  app.post(
    '/document-lookup',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => `doc-lookup|${req.auth?.user.id ?? req.ip}` } } },
    async (req) => {
      await chargeNumberCheck(req, 'customers.documents.read', 'customers.read')
      return withCompany(req, 'customers.documents.read', async (tx, access) => {
        if (!access.permissions.has('customers.read')) throw new AppError(403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok.')
        const input = documentLookupSchema.parse(req.body)
        const crypto = requireCrypto(app.customerCrypto)
        const hashes = crypto.lookupCandidates(access.companyId, lookupParts(input.type, input.issuingCountry, input.number)).map((c) => c.hash)
        const rows = (
          await tx.execute(sql`
            select distinct c.id, c.customer_no, c.display_name, c.status
            from customer_documents d join customers c on c.company_id = d.company_id and c.id = d.customer_id
            where d.number_lookup in ${hashes} and d.record_state = 'active' and c.status in ('active', 'archived')
            limit 5`)
        ).rows as Row[]
        return { matches: rows.map((r) => ({ id: r.id as string, customerNo: r.customer_no as string, displayName: r.display_name as string, status: r.status as string })) }
      })
    },
  )
}
