import {
  type DocumentFileVersion,
  type DocumentTypeRule,
  type VehicleDocument,
  type VehicleDocumentDetail,
  documentActivateSchema,
  documentCreateSchema,
  documentRenewSchema,
  documentStatus,
  documentTypeSummary,
  documentUpdateSchema,
  documentVoidSchema,
  todayIn,
  vehicleDocumentsOverview,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { documentFiles, vehicleDocumentFiles, vehicleDocuments } from '../../db/schema'
import { audit } from '../../lib/audit'
import { cleanDisplayName, MAX_DOCUMENT_BYTES, validateDocumentFile } from '../../lib/document-files'
import { AppError, notFound } from '../../lib/errors'
import { documentUploadPolicy } from '../../lib/malware'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { inScope } from './repository'

const VEHICLE_NOT_FOUND = 'Araç bulunamadı veya bu araca erişim yetkiniz yok.'
const DOC_NOT_FOUND = 'Belge bulunamadı.'
const vehicleParams = z.object({ id: z.uuid() })
const docParams = z.object({ id: z.uuid(), docId: z.uuid() })
type Row = Record<string, unknown>

function params<T>(schema: z.ZodType<T>, value: unknown, message = VEHICLE_NOT_FOUND): T {
  const r = schema.safeParse(value)
  if (!r.success) throw notFound(message)
  return r.data
}
const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString())
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10))

async function visibleVehicle(tx: Tx, access: CompanyAccess, vehicleId: string, lock = false) {
  const rows = await tx.execute(sql`select id, plate, home_branch_id from vehicles where id = ${vehicleId} ${lock ? sql`for update` : sql``}`)
  const v = rows.rows[0] as { id: string; plate: string; home_branch_id: string } | undefined
  if (!v || !inScope(access, v.home_branch_id)) throw notFound(VEHICLE_NOT_FOUND)
  return v
}

/** System types with this company's decisions; RLS keeps the settings to the active company. */
async function loadRules(tx: Tx): Promise<DocumentTypeRule[]> {
  const rows = await tx.execute(sql`
    select t.code, t.name, t.requires_expiry, coalesce(s.required, false) as required, coalesce(s.warn_days, 30) as warn_days
    from document_types t left join company_document_type_settings s on s.type_code = t.code
    order by t.sort_order`)
  return (rows.rows as Row[]).map((r) => ({
    code: r.code as DocumentTypeRule['code'],
    name: r.name as string,
    requiresExpiry: r.requires_expiry as boolean,
    required: r.required as boolean,
    warnDays: Number(r.warn_days),
  }))
}

async function companyToday(tx: Tx, access: CompanyAccess) {
  const r = await tx.execute(sql`select timezone from companies where id = ${access.companyId}`)
  return todayIn((r.rows[0] as { timezone: string }).timezone)
}

function fileVersion(r: Row, prefix = ''): DocumentFileVersion {
  const id = r[`${prefix}file_id`] as string
  return {
    id,
    versionNo: Number(r[`${prefix}version_no`]),
    mimeType: r[`${prefix}mime_type`] as string,
    sizeBytes: Number(r[`${prefix}size_bytes`]),
    pageCount: r[`${prefix}page_count`] == null ? null : Number(r[`${prefix}page_count`]),
    displayName: r[`${prefix}display_name`] as string,
    uploadedByName: (r[`${prefix}uploaded_by_name`] as string) ?? null,
    createdAt: iso(r[`${prefix}file_created_at`])!,
    url: `/api/document-files/${id}`,
    downloadUrl: `/api/document-files/${id}?indir=1`,
  }
}

const DOC_SELECT = sql`
  select d.*, cu.name as created_by_name, vu.name as voided_by_name,
    (select count(*) from vehicle_document_files x where x.document_id = d.id) as file_count,
    (select n.id from vehicle_documents n where n.renews_id = d.id and n.record_state <> 'voided' limit 1) as renewed_by_id,
    lf.file_id as lf_file_id, lf.version_no as lf_version_no, lf.mime_type as lf_mime_type, lf.size_bytes as lf_size_bytes,
    lf.page_count as lf_page_count, lf.display_name as lf_display_name, lf.uploaded_by_name as lf_uploaded_by_name, lf.created_at as lf_file_created_at
  from vehicle_documents d
  left join users cu on cu.id = d.created_by
  left join users vu on vu.id = d.voided_by
  left join lateral (
    select vf.file_id, vf.version_no, f.mime_type, f.size_bytes, f.page_count, f.display_name, u.name as uploaded_by_name, vf.created_at
    from vehicle_document_files vf
    join document_files f on f.company_id = vf.company_id and f.id = vf.file_id
    left join users u on u.id = vf.uploaded_by
    where vf.document_id = d.id order by vf.version_no desc limit 1
  ) lf on true`

function mapDoc(r: Row, rules: DocumentTypeRule[], today: string): VehicleDocument {
  const rule = rules.find((x) => x.code === r.type_code)!
  const fileCount = Number(r.file_count)
  const doc = {
    id: r.id as string,
    typeCode: r.type_code as VehicleDocument['typeCode'],
    documentNumber: (r.document_number as string) ?? null,
    issuer: (r.issuer as string) ?? null,
    issuedOn: day(r.issued_on),
    validFrom: day(r.valid_from),
    validUntil: day(r.valid_until),
    notes: (r.notes as string) ?? null,
    recordState: r.record_state as VehicleDocument['recordState'],
    renewsId: (r.renews_id as string) ?? null,
    renewedById: (r.renewed_by_id as string) ?? null,
    voidedReason: (r.voided_reason as string) ?? null,
    voidedAt: iso(r.voided_at),
    voidedByName: (r.voided_by_name as string) ?? null,
    lockedAt: iso(r.locked_at),
    version: Number(r.version),
    createdAt: iso(r.created_at)!,
    createdByName: (r.created_by_name as string) ?? null,
    updatedAt: iso(r.updated_at)!,
    fileCount,
    latestFile: r.lf_file_id ? fileVersion(r, 'lf_') : null,
  }
  return { ...doc, status: documentStatus({ id: doc.id, recordState: doc.recordState, validFrom: doc.validFrom, validUntil: doc.validUntil, fileCount }, rule, today) }
}

async function listForVehicle(tx: Tx, vehicleId: string, rules: DocumentTypeRule[], today: string) {
  const rows = await tx.execute(sql`${DOC_SELECT} where d.vehicle_id = ${vehicleId} order by d.valid_from desc nulls last, d.created_at desc`)
  return (rows.rows as Row[]).map((r) => mapDoc(r, rules, today))
}

async function loadDetail(tx: Tx, vehicleId: string, docId: string, rules: DocumentTypeRule[], today: string): Promise<VehicleDocumentDetail> {
  const rows = await tx.execute(sql`${DOC_SELECT} where d.id = ${docId} and d.vehicle_id = ${vehicleId}`)
  const r = rows.rows[0] as Row | undefined
  if (!r) throw notFound(DOC_NOT_FOUND)
  const doc = mapDoc(r, rules, today)
  const files = await tx.execute(sql`
    select vf.file_id, vf.version_no, f.mime_type, f.size_bytes, f.page_count, f.display_name, u.name as uploaded_by_name, vf.created_at as file_created_at
    from vehicle_document_files vf
    join document_files f on f.company_id = vf.company_id and f.id = vf.file_id
    left join users u on u.id = vf.uploaded_by
    where vf.document_id = ${docId} order by vf.version_no desc`)
  // Renewal chain: walk back through renews_id, then forward through successors.
  const chainRows = await tx.execute(sql`
    with recursive back as (
      select id, renews_id, valid_from, valid_until, record_state, 0 as depth from vehicle_documents where id = ${docId}
      union all
      select p.id, p.renews_id, p.valid_from, p.valid_until, p.record_state, b.depth - 1 from vehicle_documents p join back b on p.id = b.renews_id where b.depth > -50
    ), fwd as (
      select id, renews_id, valid_from, valid_until, record_state, 0 as depth from vehicle_documents where id = ${docId}
      union all
      select n.id, n.renews_id, n.valid_from, n.valid_until, n.record_state, f.depth + 1 from vehicle_documents n join fwd f on n.renews_id = f.id where f.depth < 50
    )
    select distinct on (id) id, valid_from, valid_until, record_state, depth from (select * from back union all select * from fwd) c order by id, depth`)
  const rule = rules.find((x) => x.code === doc.typeCode)!
  const chain = (chainRows.rows as Row[])
    .map((c) => ({ id: c.id as string, validFrom: day(c.valid_from), validUntil: day(c.valid_until), recordState: c.record_state as VehicleDocument['recordState'], depth: Number(c.depth) }))
    .sort((a, b) => a.depth - b.depth)
    .map(({ depth: _d, ...c }) => ({ ...c, status: documentStatus({ ...c, fileCount: 1 }, rule, today).status }))
  return { ...doc, files: (files.rows as Row[]).map((f) => fileVersion(f)), chain }
}

/** An active period of a type that needs an end date must have one (the database checks this too). */
function assertActivatable(rule: DocumentTypeRule, input: { validUntil?: string | null }) {
  if (rule.requiresExpiry && !input.validUntil) {
    throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { validUntil: `${rule.name} için son geçerlilik tarihi gerekli. Tarih bilinmiyorsa taslak olarak kaydedin.` })
  }
}

async function lockDocument(tx: Tx, vehicleId: string, docId: string) {
  const rows = await tx.execute(sql`select * from vehicle_documents where id = ${docId} and vehicle_id = ${vehicleId} for update`)
  const d = rows.rows[0] as Row | undefined
  if (!d) throw notFound(DOC_NOT_FOUND)
  return d
}

function assertEditable(d: Row, version: number, current: () => Promise<unknown>) {
  if (d.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belge değiştirilemez.')
  if (d.locked_at) throw new AppError(409, 'DOCUMENT_LOCKED', 'Bu belge dönemi bir kayda sabitlenmiş; düzeltme yerine yeni dönem açın.')
  if (Number(d.version) !== version) {
    return current().then((c) => {
      throw new AppError(409, 'VERSION_CONFLICT', 'Bu belge siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, { current: c })
    })
  }
  return Promise.resolve()
}

function mapUnique(e: unknown): never {
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string }
  if (pg.code === '23505' && pg.constraint === 'vehicle_documents_renews_once_key') {
    throw new AppError(409, 'ALREADY_RENEWED', 'Bu belge dönemi zaten yenilenmiş.')
  }
  if (pg.code === '23514') throw new AppError(400, 'VALIDATION', 'Belge bilgileri tutarlı değil.')
  throw e
}

const fieldValues = (v: { documentNumber?: string; issuer?: string; issuedOn?: string; validFrom?: string; validUntil?: string; notes?: string }) => ({
  documentNumber: v.documentNumber ?? null,
  issuer: v.issuer ?? null,
  issuedOn: v.issuedOn ?? null,
  validFrom: v.validFrom ?? null,
  validUntil: v.validUntil ?? null,
  notes: v.notes ?? null,
})

export async function vehicleDocumentRoutes(app: FastifyInstance) {
  const policy = () => documentUploadPolicy(app.env, app.scanner)

  app.get('/:id/documents', async (req) => {
    const { id } = params(vehicleParams, req.params)
    return withCompany(req, 'vehicles.documents.read', async (tx, access) => {
      await visibleVehicle(tx, access, id)
      const [rules, today] = [await loadRules(tx), await companyToday(tx, access)]
      const documents = await listForVehicle(tx, id, rules, today)
      const types = rules.map((rule) => {
        const docs = documents.filter((d) => d.typeCode === rule.code).map((d) => ({ id: d.id, recordState: d.recordState, validFrom: d.validFrom, validUntil: d.validUntil, fileCount: d.fileCount }))
        return { ...rule, summary: documentTypeSummary(rule, docs, today) }
      })
      return { today, types, documents, overview: vehicleDocumentsOverview(types.map((t) => t.summary)), upload: policy() }
    })
  })

  app.get('/:id/documents/:docId', async (req) => {
    const { id, docId } = params(docParams, req.params, DOC_NOT_FOUND)
    return withCompany(req, 'vehicles.documents.read', async (tx, access) => {
      await visibleVehicle(tx, access, id)
      return loadDetail(tx, id, docId, await loadRules(tx), await companyToday(tx, access))
    })
  })

  app.post('/:id/documents', async (req, reply) => {
    const { id } = params(vehicleParams, req.params)
    const created = await withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id)
      const input = documentCreateSchema.parse(req.body)
      const rules = await loadRules(tx)
      const rule = rules.find((r) => r.code === input.typeCode)!
      if (input.state === 'active') assertActivatable(rule, input)
      const userId = req.auth!.user.id
      const [row] = await tx
        .insert(vehicleDocuments)
        .values({ ...fieldValues(input), companyId: access.companyId, vehicleId: id, typeCode: input.typeCode, recordState: input.state, createdBy: userId, updatedBy: userId })
        .returning({ id: vehicleDocuments.id })
        .catch(mapUnique)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'vehicle.document.create', entity: 'vehicle', entityId: id, summary: { plate: v.plate, documentId: row!.id, type: input.typeCode, state: input.state } })
      return loadDetail(tx, id, row!.id, rules, await companyToday(tx, access))
    })
    return reply.code(201).send(created)
  })

  app.put('/:id/documents/:docId', async (req) => {
    const { id, docId } = params(docParams, req.params, DOC_NOT_FOUND)
    return withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id)
      const input = documentUpdateSchema.parse(req.body)
      const rules = await loadRules(tx)
      const today = await companyToday(tx, access)
      const d = await lockDocument(tx, id, docId)
      await assertEditable(d, input.version, () => loadDetail(tx, id, docId, rules, today))
      const rule = rules.find((r) => r.code === d.type_code)!
      if (d.record_state === 'active') assertActivatable(rule, input)
      const next = fieldValues(input)
      const before: Record<string, unknown> = {
        documentNumber: d.document_number ?? null,
        issuer: d.issuer ?? null,
        issuedOn: day(d.issued_on),
        validFrom: day(d.valid_from),
        validUntil: day(d.valid_until),
        notes: d.notes ?? null,
      }
      const changes = Object.fromEntries(Object.entries(next).filter(([k, val]) => String(before[k] ?? null) !== String(val ?? null)).map(([k, val]) => [k, [before[k] ?? null, val]]))
      if (Object.keys(changes).length === 0) return loadDetail(tx, id, docId, rules, today)
      await tx
        .update(vehicleDocuments)
        .set({ ...next, version: sql`${vehicleDocuments.version} + 1`, updatedAt: new Date(), updatedBy: req.auth!.user.id })
        .where(sql`${vehicleDocuments.id} = ${docId}`)
        .catch(mapUnique)
      await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'vehicle.document.update', entity: 'vehicle', entityId: id, summary: { plate: v.plate, documentId: docId, type: d.type_code, changes } })
      return loadDetail(tx, id, docId, rules, today)
    })
  })

  app.post('/:id/documents/:docId/activate', async (req) => {
    const { id, docId } = params(docParams, req.params, DOC_NOT_FOUND)
    return withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id)
      const input = documentActivateSchema.parse(req.body)
      const rules = await loadRules(tx)
      const today = await companyToday(tx, access)
      const d = await lockDocument(tx, id, docId)
      await assertEditable(d, input.version, () => loadDetail(tx, id, docId, rules, today))
      if (d.record_state !== 'draft') throw new AppError(409, 'NOT_DRAFT', 'Yalnız taslak belge etkinleştirilebilir.')
      assertActivatable(rules.find((r) => r.code === d.type_code)!, { validUntil: day(d.valid_until) })
      await tx
        .update(vehicleDocuments)
        .set({ recordState: 'active', version: sql`${vehicleDocuments.version} + 1`, updatedAt: new Date(), updatedBy: req.auth!.user.id })
        .where(sql`${vehicleDocuments.id} = ${docId}`)
      await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'vehicle.document.activate', entity: 'vehicle', entityId: id, summary: { plate: v.plate, documentId: docId, type: d.type_code } })
      return loadDetail(tx, id, docId, rules, today)
    })
  })

  /**
   * Renewal is one transaction and never touches the earlier period: it stays active and valid
   * until its own end date, so a policy starting in the future cannot end today's cover early.
   */
  app.post('/:id/documents/:docId/renew', async (req, reply) => {
    const { id, docId } = params(docParams, req.params, DOC_NOT_FOUND)
    const created = await withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id)
      const input = documentRenewSchema.parse(req.body)
      const rules = await loadRules(tx)
      const prev = await lockDocument(tx, id, docId)
      if (prev.record_state !== 'active') throw new AppError(409, 'NOT_RENEWABLE', 'Yalnız geçerli kayıttaki (aktif) bir belge dönemi yenilenebilir.')
      const successor = await tx.execute(sql`select id from vehicle_documents where renews_id = ${docId} and record_state <> 'voided' limit 1`)
      if (successor.rows.length) throw new AppError(409, 'ALREADY_RENEWED', 'Bu belge dönemi zaten yenilenmiş.')
      const rule = rules.find((r) => r.code === prev.type_code)!
      if (input.state === 'active') assertActivatable(rule, input)
      const prevUntil = day(prev.valid_until)
      if (prevUntil && input.validUntil && input.validUntil <= prevUntil) {
        throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { validUntil: 'Yeni dönem, öncekinin bitişinden sonra bitmeli.' })
      }
      const userId = req.auth!.user.id
      const [row] = await tx
        .insert(vehicleDocuments)
        .values({
          ...fieldValues(input),
          companyId: access.companyId,
          vehicleId: id,
          typeCode: prev.type_code as string,
          recordState: input.state,
          renewsId: docId,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: vehicleDocuments.id })
        .catch(mapUnique)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.document.renew',
        entity: 'vehicle',
        entityId: id,
        summary: { plate: v.plate, documentId: row!.id, renews: docId, type: prev.type_code, validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null },
      })
      return loadDetail(tx, id, row!.id, rules, await companyToday(tx, access))
    })
    return reply.code(201).send(created)
  })

  app.post('/:id/documents/:docId/void', async (req) => {
    const { id, docId } = params(docParams, req.params, DOC_NOT_FOUND)
    return withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id)
      const input = documentVoidSchema.parse(req.body)
      const rules = await loadRules(tx)
      const today = await companyToday(tx, access)
      const d = await lockDocument(tx, id, docId)
      await assertEditable(d, input.version, () => loadDetail(tx, id, docId, rules, today))
      const userId = req.auth!.user.id
      await tx
        .update(vehicleDocuments)
        .set({ recordState: 'voided', voidedReason: input.reason, voidedBy: userId, voidedAt: new Date(), version: sql`${vehicleDocuments.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(sql`${vehicleDocuments.id} = ${docId}`)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'vehicle.document.void', entity: 'vehicle', entityId: id, summary: { plate: v.plate, documentId: docId, type: d.type_code, reason: input.reason } })
      return loadDetail(tx, id, docId, rules, today)
    })
  })

  /**
   * New file version. Order: policy and access checks → read and validate content → malware scan →
   * store → one transaction for the records. A failure at any step leaves the document, its earlier
   * versions and today's valid period exactly as they were; a stored file is removed again.
   */
  app.post('/:id/documents/:docId/files', async (req, reply) => {
    const { id, docId } = params(docParams, req.params, DOC_NOT_FOUND)
    const p = policy()
    if (!p.enabled) throw new AppError(503, 'UPLOADS_DISABLED', p.reason!)
    await withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
      await visibleVehicle(tx, access, id)
      const rows = await tx.execute(sql`select record_state from vehicle_documents where id = ${docId} and vehicle_id = ${id}`)
      const d = rows.rows[0] as { record_state: string } | undefined
      if (!d) throw notFound(DOC_NOT_FOUND)
      if (d.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belgeye dosya eklenemez.')
    })
    if (!req.isMultipart()) throw new AppError(400, 'NO_FILE', 'Yüklenecek dosya bulunamadı.')
    const part = await req.file({ limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0, parts: 1 } })
    if (!part) throw new AppError(400, 'NO_FILE', 'Yüklenecek dosya bulunamadı.')
    const input = await part.toBuffer()
    const clean = await validateDocumentFile(input)
    const scan = await app.scanner.scan(clean.data)
    if (scan === 'infected') throw new AppError(422, 'MALWARE_DETECTED', 'Dosyada zararlı içerik bulundu; yükleme reddedildi.')
    if (scan !== 'clean') throw new AppError(503, 'SCANNER_UNAVAILABLE', 'Zararlı dosya taraması şu an yapılamıyor; yükleme yapılmadı. Daha sonra tekrar deneyin.')

    const key = app.storage.newDocumentKey(req.auth!.session.activeCompanyId!, clean.ext)
    await app.storage.put(key, clean.data)
    try {
      const result = await withCompany(req, 'vehicles.documents.manage', async (tx, access) => {
        const v = await visibleVehicle(tx, access, id)
        const d = await lockDocument(tx, id, docId)
        if (d.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belgeye dosya eklenemez.')
        const next = (await tx.execute(sql`select coalesce(max(version_no), 0) + 1 as n from vehicle_document_files where document_id = ${docId}`)).rows[0] as { n: number }
        const userId = req.auth!.user.id
        const [file] = await tx
          .insert(documentFiles)
          .values({
            companyId: access.companyId,
            storageKey: key,
            mimeType: clean.mimeType,
            sizeBytes: clean.data.length,
            sha256: clean.sha256,
            pageCount: clean.pageCount,
            displayName: cleanDisplayName(part.filename, `belge.${clean.ext}`),
            uploadedBy: userId,
          })
          .returning({ id: documentFiles.id })
        await tx.insert(vehicleDocumentFiles).values({ companyId: access.companyId, documentId: docId, fileId: file!.id, versionNo: Number(next.n), uploadedBy: userId })
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'vehicle.document.file_add',
          entity: 'vehicle',
          entityId: id,
          summary: { plate: v.plate, documentId: docId, type: d.type_code, fileId: file!.id, versionNo: Number(next.n), mimeType: clean.mimeType, scanner: app.scanner.name },
        })
        return loadDetail(tx, id, docId, await loadRules(tx), await companyToday(tx, access))
      })
      return reply.code(201).send(result)
    } catch (e) {
      await app.storage.remove(key)
      throw e
    }
  })
}

const TYPE_SLUG: Record<string, string> = {
  registration: 'ruhsat',
  inspection: 'muayene',
  liability_insurance: 'trafik-sigortasi',
  comprehensive_insurance: 'kasko',
  roadside_assistance: 'yol-yardim',
  other: 'belge',
}

/**
 * Streams a document file after checking, on every request: session, document read permission,
 * company (RLS) and the branch scope of the owning vehicle. Never cached; viewing and downloading
 * are recorded in the audit log.
 */
export async function documentFileRoutes(app: FastifyInstance) {
  app.get('/:id', async (req: FastifyRequest, reply) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(req.params)
    if (!parsed.success) throw notFound()
    const download = (req.query as { indir?: string }).indir === '1'
    const file = await withCompany(req, 'vehicles.documents.read', async (tx, access) => {
      const rows = await tx.execute(sql`
        select f.storage_key, f.mime_type, vf.version_no, d.id as document_id, d.type_code, d.valid_until, d.created_at as doc_created_at,
               v.id as vehicle_id, v.plate, v.home_branch_id
        from document_files f
        join vehicle_document_files vf on vf.company_id = f.company_id and vf.file_id = f.id
        join vehicle_documents d on d.company_id = vf.company_id and d.id = vf.document_id
        join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id
        where f.id = ${parsed.data.id}`)
      const r = rows.rows[0] as Row | undefined
      if (!r || !inScope(access, r.home_branch_id as string)) throw notFound()
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: req.auth!.user.id,
        action: download ? 'vehicle.document.download' : 'vehicle.document.view',
        entity: 'vehicle',
        entityId: r.vehicle_id as string,
        summary: { plate: r.plate, documentId: r.document_id, type: r.type_code, fileId: parsed.data.id, versionNo: Number(r.version_no) },
      })
      return r
    })
    const ext = file.mime_type === 'application/pdf' ? 'pdf' : file.mime_type === 'image/png' ? 'png' : 'jpg'
    const dated = day(file.valid_until) ?? String(iso(file.doc_created_at)).slice(0, 10)
    const name = `${String(file.plate).replace(/[^A-Za-z0-9-]/g, '')}_${TYPE_SLUG[file.type_code as string] ?? 'belge'}_${dated}_v${file.version_no}.${ext}`
    const { stream, size } = await app.storage.open(file.storage_key as string)
    return reply
      .header('content-type', file.mime_type as string)
      .header('content-length', size)
      .header('cache-control', 'private, no-store, max-age=0')
      .header('pragma', 'no-cache')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `${download ? 'attachment' : 'inline'}; filename="${name}"`)
      .header('content-security-policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'")
      .send(stream)
  })
}
