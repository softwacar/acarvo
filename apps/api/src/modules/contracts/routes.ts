import { createHash } from 'node:crypto'
import {
  checkTemplateBody,
  contractArchiveSchema,
  contractCreateSchema,
  contractExternalSchema,
  type ContractStatus,
  contractTransitionSchema,
  type Permission,
  renderTemplate,
  TEMPLATE_FIELDS,
  templateActivateSchema,
  templateCreateSchema,
  templateVersionSaveSchema,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { renderContractPdf } from '../../lib/contract-pdf'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { RENTAL_NOT_FOUND, rentalScopeSql } from '../rentals/repository'
import { nextNo } from '../pricing/repository'
import { inScope } from '../vehicles/repository'
import { buildSnapshot, CONTRACT_NOT_FOUND, contractDetail, contractRow, getTemplate, listTemplates, pdfHeader, rentalContracts, TEMPLATE_NOT_FOUND } from './repository'
import { PREVIEW_VALUES, sampleBody } from './samples'

type Row = Record<string, unknown>
const idParams = z.object({ id: z.uuid() })
const parseId = (req: FastifyRequest, message: string) => {
  const p = idParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data.id
}
const need = (access: CompanyAccess, permission: Permission) => {
  if (!access.permissions.has(permission)) throw forbidden()
}

/** Template bodies: unknown placeholders and stray braces are refused at every save (they would print literally). */
function validateBody(body: string) {
  const check = checkTemplateBody(body)
  if (check.unknown.length) throw new AppError(400, 'VALIDATION', 'Şablonda tanımsız alan var.', { body: `Tanımsız alan: ${check.unknown.slice(0, 5).join(', ')}` })
  if (check.stray) throw new AppError(400, 'VALIDATION', 'Şablonda kapanmamış veya hatalı {{ }} işareti var.', { body: 'Alanlar {{alan.adi}} biçiminde yazılır' })
  if (/<\s*\/?\s*[a-z!]/i.test(body)) throw new AppError(400, 'VALIDATION', 'Şablon düz metindir; HTML etiketi kullanılamaz.', { body: 'HTML etiketi kullanmayın' })
  if (/\b(?:https?|ftp|file|data|javascript):/i.test(body)) throw new AppError(400, 'VALIDATION', 'Şablonda bağlantı veya dış kaynak kullanılamaz.', { body: 'Bağlantı veya dış kaynak eklemeyin' })
  return check
}

function mapGuard(e: unknown): never {
  if (e instanceof AppError) throw e
  const pg = ((e as { cause?: unknown }).cause ?? e) as { constraint?: string; message?: string }
  const c = pg.constraint
  if (c === 'contract_template_versions_required') throw new AppError(409, 'TEMPLATE_INCOMPLETE', 'Şablonda zorunlu alanlar eksik.')
  if (c === 'contract_template_versions_immutable' || c === 'contract_template_versions_lifecycle') throw new AppError(409, 'INVALID_TRANSITION', 'Etkin veya kullanımdan kalkmış şablon sürümü değiştirilemez.')
  if (c === 'contract_template_versions_draft_key') throw new AppError(409, 'DRAFT_EXISTS', 'Bu şablonun zaten bir taslak sürümü var.')
  if (c === 'contracts_template_active') throw new AppError(409, 'TEMPLATE_INACTIVE', 'Seçilen şablon sürümü etkin değil.')
  if (c === 'contracts_rental_status') throw new AppError(409, 'RENTAL_CLOSED', 'Sözleşme taslağı yalnız hazırlanan veya kiradaki kiralamalar için oluşturulur.')
  if (c === 'contracts_rental_open_key') throw new AppError(409, 'CONTRACT_OPEN', 'Bu kiralamanın açık bir sözleşmesi var. Yeni sürüm oluşturun veya önce arşivleyin.')
  if (c === 'contracts_lifecycle' || c === 'contracts_final') throw new AppError(409, 'INVALID_TRANSITION', 'Sözleşmenin durumu bu işleme izin vermiyor.')
  if (c === 'contracts_immutable' || c === 'contracts_sources') throw new AppError(409, 'CONTRACT_IMMUTABLE', 'Sözleşme içeriği ve kaynakları değiştirilemez.')
  if (c === 'contracts_request_key' || c === 'contract_events_request_key') throw new AppError(409, 'REQUEST_REPLAY', 'Bu istek zaten işlendi.')
  if (pg.message === 'template_inactive') throw new AppError(409, 'TEMPLATE_INACTIVE', 'Seçilen şablon sürümü etkin değil.')
  throw e
}

const STATUS_LABEL: Record<ContractStatus, string> = { draft: 'Taslak', under_review: 'Kontrol bekliyor', externally_processed: 'Dışarıda işleme alındı', archived: 'Arşivlendi', superseded: 'Yeni sürümle değiştirildi' }

export async function contractTemplateRoutes(app: FastifyInstance) {
  app.get('/contract-templates', async (req) => withCompany(req, 'contracts.read', async (tx) => ({ items: await listTemplates(tx), fields: TEMPLATE_FIELDS })))

  app.post('/contract-templates', async (req, reply) => {
    const created = await withCompany(req, 'settings.contracts.manage', async (tx, access) => {
      const input = templateCreateSchema.parse(req.body)
      const userId = req.auth!.user.id
      const t = (
        await tx.execute(sql`insert into contract_templates (company_id, name, language, country, is_sample, created_by)
          values (${access.companyId}, ${input.name}, ${input.language}, ${input.country ?? null}, ${input.fromSample}, ${userId}) returning id`)
      ).rows[0] as Row
      await tx.execute(sql`insert into contract_template_versions (company_id, template_id, version_no, body, created_by)
        values (${access.companyId}, ${t.id as string}, 1, ${input.fromSample ? sampleBody(input.language) : ''}, ${userId})`)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'contract_template.create', entity: 'contract_template', entityId: t.id as string, summary: { name: input.name, language: input.language, country: input.country ?? null, fromSample: input.fromSample } })
      return getTemplate(tx, t.id as string)
    })
    return reply.code(201).send(created)
  })

  /** Saves the body of the template's draft version (version-checked). Active and retired versions never change. */
  app.put('/contract-templates/:id/draft', async (req) => {
    const id = parseId(req, TEMPLATE_NOT_FOUND)
    return withCompany(req, 'settings.contracts.manage', async (tx, access) => {
      const input = templateVersionSaveSchema.parse(req.body)
      const draft = (await tx.execute(sql`select * from contract_template_versions where template_id = ${id} and status = 'draft' for update`)).rows[0] as Row | undefined
      if (!draft) throw notFound('Bu şablonun taslak sürümü yok.')
      if (Number(draft.version) !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu şablon siz düzenlerken başka bir kullanıcı tarafından değiştirildi.', undefined, { current: await getTemplate(tx, id) })
      const check = validateBody(input.body)
      await tx.execute(sql`update contract_template_versions set body = ${input.body}, version = version + 1 where id = ${draft.id as string}`).catch(mapGuard)
      await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'contract_template.save_draft', entity: 'contract_template', entityId: id, summary: { versionNo: Number(draft.version_no), length: input.body.length, fields: check.used.length, missingRequired: check.missingRequired } })
      return getTemplate(tx, id)
    })
  })

  /** Opens a new draft version from the active one (only one draft per template). */
  app.post('/contract-templates/:id/draft', async (req, reply) => {
    const id = parseId(req, TEMPLATE_NOT_FOUND)
    const out = await withCompany(req, 'settings.contracts.manage', async (tx, access) => {
      // No lock on the template row (the runtime role cannot update it): the one-draft index decides concurrent requests.
      const t = (await tx.execute(sql`select id from contract_templates where id = ${id}`)).rows[0]
      if (!t) throw notFound(TEMPLATE_NOT_FOUND)
      const versions = (await tx.execute(sql`select version_no, status, body from contract_template_versions where template_id = ${id} order by version_no desc`)).rows as Row[]
      if (versions.some((v) => v.status === 'draft')) throw new AppError(409, 'DRAFT_EXISTS', 'Bu şablonun zaten bir taslak sürümü var.')
      const source = versions.find((v) => v.status === 'active') ?? versions[0]
      const next = Number(versions[0]?.version_no ?? 0) + 1
      await tx
        .execute(sql`insert into contract_template_versions (company_id, template_id, version_no, body, created_by) values (${access.companyId}, ${id}, ${next}, ${(source?.body as string) ?? ''}, ${req.auth!.user.id})`)
        .catch(mapGuard)
      await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'contract_template.new_draft', entity: 'contract_template', entityId: id, summary: { versionNo: next, fromVersionNo: source ? Number(source.version_no) : null } })
      return getTemplate(tx, id)
    })
    return reply.code(201).send(out)
  })

  /** Activates the draft: it must contain every required field; the previous active version is retired (stays readable). */
  app.post('/contract-templates/:id/activate', async (req) => {
    const id = parseId(req, TEMPLATE_NOT_FOUND)
    return withCompany(req, 'settings.contracts.manage', async (tx, access) => {
      const { version } = templateActivateSchema.parse(req.body)
      const draft = (await tx.execute(sql`select * from contract_template_versions where template_id = ${id} and status = 'draft' for update`)).rows[0] as Row | undefined
      if (!draft) throw notFound('Bu şablonun taslak sürümü yok.')
      if (Number(draft.version) !== version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu şablon bu arada değişti. Sayfayı yenileyin.', undefined, { current: await getTemplate(tx, id) })
      const check = validateBody(draft.body as string)
      if (check.missingRequired.length) {
        throw new AppError(409, 'TEMPLATE_INCOMPLETE', 'Şablonda zorunlu alanlar eksik.', { body: `Eksik: ${check.missingRequired.map((f) => TEMPLATE_FIELDS[f]).join(', ')}` }, { missing: check.missingRequired })
      }
      const userId = req.auth!.user.id
      const prev = (await tx.execute(sql`update contract_template_versions set status = 'retired', retired_at = now(), version = version + 1 where template_id = ${id} and status = 'active' returning version_no`)).rows[0] as Row | undefined
      await tx.execute(sql`update contract_template_versions set status = 'active', activated_at = now(), activated_by = ${userId}, version = version + 1 where id = ${draft.id as string}`).catch(mapGuard)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'contract_template.activate', entity: 'contract_template', entityId: id, summary: { versionNo: Number(draft.version_no), retiredVersionNo: prev ? Number(prev.version_no) : null } })
      return getTemplate(tx, id)
    })
  })

  /** Renders a body with clearly fictional sample values (nothing stored, no real record used). */
  app.post('/contract-templates/preview', async (req) =>
    withCompany(req, 'contracts.read', async () => {
      const { body } = z.object({ body: z.string().max(20_000) }).parse(req.body)
      const check = checkTemplateBody(body)
      return { text: renderTemplate(body, PREVIEW_VALUES), check }
    }),
  )
}

/** The rental's locked row; visible = in the user's branch scope. Writes need the pickup branch in scope. */
async function lockRental(tx: Tx, access: CompanyAccess, rentalId: string, write: boolean) {
  const k = (await tx.execute(sql`select k.id, k.status, k.pickup_branch_id, k.rental_no from rentals k where k.id = ${rentalId} and ${rentalScopeSql(access)} for update of k`)).rows[0] as Row | undefined
  if (!k) throw notFound(RENTAL_NOT_FOUND)
  if (write && !inScope(access, k.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin kiralamasında sözleşme işlemi yapma yetkiniz yok.')
  return k
}

async function event(tx: Tx, companyId: string, contractId: string, kind: string, actor: string, extra: { from?: string | null; to?: string | null; data?: Record<string, unknown>; requestId?: string } = {}) {
  await tx.execute(sql`insert into contract_events (company_id, contract_id, kind, from_status, to_status, data, client_request_id, actor_user_id)
    values (${companyId}, ${contractId}, ${kind}, ${extra.from ?? null}, ${extra.to ?? null}, ${extra.data ? JSON.stringify(extra.data) : null}::jsonb, ${extra.requestId ?? null}, ${actor})`)
}

export async function contractRoutes(app: FastifyInstance) {
  /** Writes a new contract revision with its snapshot and draft PDF. Returns the stored file key (removed if the transaction fails). */
  async function draftContract(
    tx: Tx,
    access: CompanyAccess,
    userId: string,
    input: { rentalId: string; templateVersionId: string; requestId: string; supersedes?: { id: string; contractNo: string; revision: number } },
    written: string[],
  ) {
    const contractNo = input.supersedes?.contractNo ?? (await nextNo(tx, access.companyId, 'contract', 'S'))
    const revision = (input.supersedes?.revision ?? 0) + 1
    const now = new Date()
    const { snapshot, quoteId, reservationId } = await buildSnapshot(tx, input.rentalId, input.templateVersionId, { contractNo, revision, now }).catch(mapGuard)
    const row = (
      await tx
        .execute(sql`insert into contracts (company_id, contract_no, revision, supersedes_id, rental_id, reservation_id, quote_id, template_version_id, content, client_request_id, created_by, updated_by)
          values (${access.companyId}, ${contractNo}, ${revision}, ${input.supersedes?.id ?? null}, ${input.rentalId}, ${reservationId}, ${quoteId}, ${input.templateVersionId},
            ${JSON.stringify(snapshot)}::jsonb, ${input.requestId}, ${userId}, ${userId}) returning id`)
        .catch(mapGuard)
    ).rows[0] as Row
    const id = row.id as string
    const pdf = await renderContractPdf({ title: 'Araç kiralama sözleşmesi — taslak', header: pdfHeader(snapshot, contractNo, revision), body: snapshot.renderedText, footerId: `${contractNo} · sürüm ${revision}`, createdAt: now })
    const key = app.storage.newContractKey(access.companyId)
    await app.storage.put(key, pdf)
    written.push(key)
    await tx.execute(sql`insert into contract_files (company_id, contract_id, storage_key, size_bytes, sha256) values (${access.companyId}, ${id}, ${key}, ${pdf.length}, ${createHash('sha256').update(pdf).digest('hex')})`)
    await event(tx, access.companyId, id, 'created', userId, { to: 'draft', data: { revision, quoteNo: snapshot.quote?.no ?? null, templateVersionNo: snapshot.template.versionNo, priceCalculated: !!snapshot.quote } })
    await audit(tx, {
      companyId: access.companyId,
      actorUserId: userId,
      action: input.supersedes ? 'contract.revise' : 'contract.create',
      entity: 'rental',
      entityId: input.rentalId,
      summary: { contractNo, revision, rentalNo: snapshot.rental.no, template: snapshot.template.name, templateVersionNo: snapshot.template.versionNo, quoteNo: snapshot.quote?.no ?? null },
    })
    return id
  }

  /** Runs a write; any PDF written by a transaction that then failed is removed again (no orphan files). */
  async function withFiles<T>(fn: (written: string[]) => Promise<T>): Promise<T> {
    const written: string[] = []
    try {
      return await fn(written)
    } catch (e) {
      if (written.length) await app.storage.remove(...written).catch(() => undefined)
      throw e
    }
  }

  app.get('/rentals/:id/contracts', async (req) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    return withCompany(req, 'contracts.read', async (tx, access) => {
      need(access, 'rentals.read')
      const k = await lockRental(tx, access, id, false)
      const templates = (await listTemplates(tx)).flatMap((t) => t.versions.filter((v) => v.status === 'active').map((v) => ({ id: v.id, name: t.name, language: t.language, country: t.country, versionNo: v.versionNo, isSample: t.isSample })))
      return { items: await rentalContracts(tx, id), activeTemplates: templates, rentalStatus: k.status as string }
    })
  })

  app.post('/rentals/:id/contracts', async (req, reply) => {
    const rentalId = parseId(req, RENTAL_NOT_FOUND)
    const input = contractCreateSchema.parse(req.body)
    const out = await withFiles((written) =>
      withCompany(req, 'contracts.manage', async (tx, access) => {
        need(access, 'rentals.read')
        await lockRental(tx, access, rentalId, true)
        const replay = (await tx.execute(sql`select id, rental_id from contracts where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
        if (replay) {
          if (replay.rental_id !== rentalId) throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim başka bir kayıt için kullanıldı. Sayfayı yenileyin.')
          return { replay: true, body: await contractDetail(tx, access, (await contractRow(tx, access, replay.id as string))!) }
        }
        const open = (await tx.execute(sql`select contract_no from contracts where rental_id = ${rentalId} and status in ('draft', 'under_review', 'externally_processed')`)).rows[0] as Row | undefined
        if (open) throw new AppError(409, 'CONTRACT_OPEN', `Bu kiralamanın açık bir sözleşmesi var (${open.contract_no}). Yeni sürüm oluşturun veya önce arşivleyin.`)
        const id = await draftContract(tx, access, req.auth!.user.id, { rentalId, templateVersionId: input.templateVersionId, requestId: input.requestId }, written)
        return { replay: false, body: await contractDetail(tx, access, (await contractRow(tx, access, id))!) }
      }),
    )
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  /** Logged view of one contract (who looked at which contract, never its content). */
  app.get('/contracts/:id', async (req) => {
    const id = parseId(req, CONTRACT_NOT_FOUND)
    return withCompany(req, 'contracts.read', async (tx, access) => {
      need(access, 'rentals.read')
      const r = await contractRow(tx, access, id)
      if (!r) throw notFound(CONTRACT_NOT_FOUND)
      await event(tx, access.companyId, id, 'viewed', req.auth!.user.id)
      return contractDetail(tx, access, r)
    })
  })

  /** The draft PDF as an attachment: separate permission, integrity check, no caching, neutral file name, logged. */
  app.get('/contracts/:id/pdf', async (req, reply) => {
    const id = parseId(req, CONTRACT_NOT_FOUND)
    const file = await withCompany(req, 'contracts.download', async (tx, access) => {
      need(access, 'rentals.read')
      const r = await contractRow(tx, access, id)
      if (!r) throw notFound(CONTRACT_NOT_FOUND)
      if (!r.storage_key) throw new AppError(404, 'FILE_MISSING', 'Bu sözleşmenin PDF dosyası yok.')
      await event(tx, access.companyId, id, 'downloaded', req.auth!.user.id)
      await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'contract.download', entity: 'contract', entityId: id, summary: { contractNo: r.contract_no, revision: Number(r.revision) } })
      return r
    })
    const data = await app.storage.readAll(file.storage_key as string)
    if (createHash('sha256').update(data).digest('hex') !== file.sha256) throw new AppError(500, 'FILE_INTEGRITY', 'Dosya bütünlük denetiminden geçmedi.')
    return reply
      .header('content-type', 'application/pdf')
      .header('content-length', data.length)
      .header('cache-control', 'private, no-store, max-age=0')
      .header('pragma', 'no-cache')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `attachment; filename="sozlesme-taslagi_${file.contract_no as string}_s${Number(file.revision)}.pdf"`)
      .header('content-security-policy', "sandbox; default-src 'none'")
      .send(data)
  })

  /** New revision of an open contract (e.g. after the quote or template changed): the old one is superseded, never edited. */
  app.post('/contracts/:id/revise', async (req, reply) => {
    const id = parseId(req, CONTRACT_NOT_FOUND)
    const input = contractCreateSchema.extend({ version: z.number().int().min(1) }).parse(req.body)
    const out = await withFiles((written) =>
      withCompany(req, 'contracts.manage', async (tx, access) => {
        need(access, 'rentals.read')
        const replay = (await tx.execute(sql`select id from contracts where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
        if (replay) return { replay: true, body: await contractDetail(tx, access, (await contractRow(tx, access, replay.id as string))!) }
        const cur = await contractRow(tx, access, id)
        if (!cur) throw notFound(CONTRACT_NOT_FOUND)
        await lockRental(tx, access, cur.rental_id as string, true)
        const locked = (await tx.execute(sql`select status, version from contracts where id = ${id} for update`)).rows[0] as Row
        if (Number(locked.version) !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu sözleşme bu arada değişti. Sayfayı yenileyin.')
        if (!['draft', 'under_review', 'externally_processed'].includes(locked.status as string)) throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız açık bir sözleşmenin yeni sürümü oluşturulur.')
        const userId = req.auth!.user.id
        await tx.execute(sql`update contracts set status = 'superseded', version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`).catch(mapGuard)
        await event(tx, access.companyId, id, 'superseded', userId, { from: locked.status as string, to: 'superseded' })
        const newId = await draftContract(tx, access, userId, { rentalId: cur.rental_id as string, templateVersionId: input.templateVersionId, requestId: input.requestId, supersedes: { id, contractNo: cur.contract_no as string, revision: Number(cur.revision) } }, written)
        return { replay: false, body: await contractDetail(tx, access, (await contractRow(tx, access, newId))!) }
      }),
    )
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  const transition = (path: string, to: ContractStatus, schema: typeof contractTransitionSchema | typeof contractExternalSchema | typeof contractArchiveSchema) =>
    app.post(`/contracts/:id/${path}`, async (req) => {
      const id = parseId(req, CONTRACT_NOT_FOUND)
      return withCompany(req, 'contracts.manage', async (tx, access) => {
        need(access, 'rentals.read')
        const input = schema.parse(req.body) as z.infer<typeof contractTransitionSchema> & { externalReference?: string; reason?: string }
        const cur = await contractRow(tx, access, id)
        if (!cur) throw notFound(CONTRACT_NOT_FOUND)
        const replay = (await tx.execute(sql`select contract_id from contract_events where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
        if (replay) {
          if (replay.contract_id !== id) throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim başka bir kayıt için kullanıldı. Sayfayı yenileyin.')
          return contractDetail(tx, access, (await contractRow(tx, access, id))!)
        }
        await lockRental(tx, access, cur.rental_id as string, true)
        const locked = (await tx.execute(sql`select status, version from contracts where id = ${id} for update`)).rows[0] as Row
        if (Number(locked.version) !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu sözleşme bu arada değişti. Sayfayı yenileyin.')
        const userId = req.auth!.user.id
        const from = locked.status as ContractStatus
        if (to === 'externally_processed') {
          await tx
            .execute(sql`update contracts set status = ${to}, external_ack_at = now(), external_ack_by = ${userId}, external_reference = ${input.externalReference!}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
            .catch(mapGuard)
        } else if (to === 'archived') {
          await tx.execute(sql`update contracts set status = ${to}, archive_reason = ${input.reason!}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`).catch(mapGuard)
        } else {
          await tx.execute(sql`update contracts set status = ${to}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`).catch(mapGuard)
        }
        const kind = to === 'under_review' ? 'review' : to === 'externally_processed' ? 'external' : 'archived'
        const data = to === 'externally_processed' ? { externalReference: input.externalReference, statement: 'external_process' } : to === 'archived' ? { reason: input.reason } : undefined
        await event(tx, access.companyId, id, kind, userId, { from, to, data, requestId: input.requestId }).catch(mapGuard)
        await audit(tx, { companyId: access.companyId, actorUserId: userId, action: `contract.${kind}`, entity: 'contract', entityId: id, summary: { contractNo: cur.contract_no, revision: Number(cur.revision), from: STATUS_LABEL[from], to: STATUS_LABEL[to], ...(data ?? {}) } })
        return contractDetail(tx, access, (await contractRow(tx, access, id))!)
      })
    })
  transition('review', 'under_review', contractTransitionSchema)
  transition('external', 'externally_processed', contractExternalSchema)
  transition('archive', 'archived', contractArchiveSchema)
}
