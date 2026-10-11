import { createHash, randomUUID } from 'node:crypto'
import {
  CUSTOMER_DOCUMENT_SIDES,
  CUSTOMER_FILE_MAX_MB,
  CUSTOMER_FILE_MAX_PDF_PAGES,
  NUMBER_REVEAL_LIMIT_PER_HOUR,
  NUMBER_REVEAL_VISIBLE_SECONDS,
  numberRevealSchema,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { customerDocumentFiles, customerFiles } from '../../db/schema'
import { audit } from '../../lib/audit'
import { validateDocumentFile } from '../../lib/document-files'
import { documentUploadPolicy } from '../../lib/malware'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import { UPLOAD_RATE_LIMIT } from '../../plugins/security'
import { companyToday } from '../vehicles/document-overview'
import { DOCUMENT_NOT_FOUND, documentWarningDays, loadCustomerDocuments, requireCrypto } from './documents'
import { CUSTOMER_NOT_FOUND, getCustomer } from './repository'

type Row = Record<string, unknown>
const MAX_BYTES = CUSTOMER_FILE_MAX_MB * 1024 * 1024
const docParams = z.object({ id: z.uuid(), docId: z.uuid() })
const sideQuery = z.object({ side: z.enum(CUSTOMER_DOCUMENT_SIDES).default('front') })
const accessSchema = z.object({ mode: z.enum(['view', 'download']) })
const FILE_NOT_FOUND = 'Dosya bulunamadı veya bu dosyaya erişim yetkiniz yok.'
const TYPE_SLUG: Record<string, string> = {
  national_id: 'kimlik',
  passport: 'pasaport',
  driving_license: 'surucu-belgesi',
  international_driving_permit: 'uluslararasi-surucu-belgesi',
  residence_permit: 'oturma-izni',
  visa: 'vize',
  entry_record: 'giris-kaydi',
  other: 'belge',
}

/**
 * Upload and reveal (M2d). Order of an upload: permission, policy and record checks → read and validate the content
 * (type from the bytes, PDF active-content refusal, images re-encoded without EXIF/GPS) → malware scan → encrypt in
 * memory → write ciphertext → one transaction for the records. No plaintext copy is written to disk at any point; a
 * stored ciphertext is removed again if the records cannot be written.
 */
export async function customerDocumentFileRoutes(app: FastifyInstance) {
  const policy = () => documentUploadPolicy(app.env, app.scanner)

  app.post('/:id/documents/:docId/files', { config: UPLOAD_RATE_LIMIT }, async (req, reply) => {
    const p = docParams.safeParse(req.params)
    if (!p.success) throw notFound(DOCUMENT_NOT_FOUND)
    const { id, docId } = p.data
    const { side } = sideQuery.parse(req.query)
    const up = policy()
    if (!up.enabled) throw new AppError(503, 'UPLOADS_DISABLED', up.reason!)
    const crypto = requireCrypto(app.customerCrypto)
    const companyId = await withCompany(req, 'customers.documents.manage', async (tx, access) => {
      await assertWritableDocument(tx, id, docId)
      return access.companyId
    })
    if (!req.isMultipart()) throw new AppError(400, 'NO_FILE', 'Yüklenecek dosya bulunamadı.')
    const part = await req.file({ limits: { fileSize: MAX_BYTES, files: 1, fields: 0, parts: 1 } })
    if (!part) throw new AppError(400, 'NO_FILE', 'Yüklenecek dosya bulunamadı.')
    const input = await part.toBuffer()
    if (part.file.truncated || input.length > MAX_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', `Dosya en fazla ${CUSTOMER_FILE_MAX_MB} MB olabilir.`)
    const clean = await validateDocumentFile(input)
    if (clean.pageCount !== null && clean.pageCount > CUSTOMER_FILE_MAX_PDF_PAGES) throw new AppError(415, 'UNSUPPORTED_DOCUMENT', `PDF en fazla ${CUSTOMER_FILE_MAX_PDF_PAGES} sayfa olabilir.`)
    const scan = await app.scanner.scan(clean.data)
    if (scan === 'infected') throw new AppError(422, 'MALWARE_DETECTED', 'Dosyada zararlı içerik bulundu; yükleme reddedildi.')
    if (scan !== 'clean') throw new AppError(503, 'SCANNER_UNAVAILABLE', 'Zararlı dosya taraması şu an yapılamıyor; yükleme yapılmadı. Daha sonra tekrar deneyin.')

    const fileId = randomUUID()
    const enc = crypto.encrypt(companyId, 'file', fileId, clean.data)
    const key = app.storage.newCustomerFileKey(companyId, fileId)
    await app.storage.put(key, enc.ciphertext)
    try {
      const result = await withCompany(req, 'customers.documents.manage', async (tx, access) => {
        const { customer } = await assertWritableDocument(tx, id, docId, true)
        const next = (await tx.execute(sql`select coalesce(max(version_no), 0) + 1 as n from customer_document_files where document_id = ${docId}`)).rows[0] as { n: number }
        const userId = req.auth!.user.id
        const kind = clean.ext === 'jpg' ? 'jpeg' : clean.ext
        await tx.insert(customerFiles).values({
          id: fileId,
          companyId: access.companyId,
          storageKey: key,
          kind,
          sizeBytes: clean.data.length,
          pages: clean.pageCount,
          encKeyId: enc.keyId,
          ciphertextSha256: createHash('sha256').update(enc.ciphertext).digest('hex'),
          createdBy: userId,
        })
        await tx.insert(customerDocumentFiles).values({ companyId: access.companyId, documentId: docId, fileId, side, versionNo: Number(next.n), uploadedBy: userId })
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'customer.document.file_add',
          entity: 'customer_document',
          entityId: docId,
          summary: { customerId: id, customerNo: customer.customerNo, fileId, side, versionNo: Number(next.n), kind, scanner: app.scanner.name },
        })
        const today = await companyToday(tx, access)
        return (await loadCustomerDocuments(tx, id, today, await documentWarningDays(tx), docId))[0]
      })
      return reply.code(201).send(result)
    } catch (e) {
      await app.storage.remove(key)
      throw e
    }
  })

  /**
   * Opens a full document number for 30 seconds (in the browser). Reason required; at most 30 per user per hour,
   * counted in the database across sessions, restarts and companies; audited without the number.
   */
  app.post('/:id/documents/:docId/reveal-number', async (req) => {
    const p = docParams.safeParse(req.params)
    if (!p.success) throw notFound(DOCUMENT_NOT_FOUND)
    const { id, docId } = p.data
    const crypto = requireCrypto(app.customerCrypto)
    return withCompany(req, 'customers.identity.reveal', async (tx, access) => {
      const { reason } = numberRevealSchema.parse(req.body)
      const customer = await getCustomer(tx, id)
      if (!customer) throw notFound(CUSTOMER_NOT_FOUND)
      const d = (await tx.execute(sql`select id, type, number_ciphertext, number_key_id from customer_documents where id = ${docId} and customer_id = ${id}`)).rows[0] as Row | undefined
      if (!d) throw notFound(DOCUMENT_NOT_FOUND)
      if (d.number_ciphertext == null) throw new AppError(409, 'NO_NUMBER', 'Bu belgede kayıtlı numara yok.')
      const userId = req.auth!.user.id
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`number-reveal:${userId}`}, 0))`)
      const used = (await tx.execute(sql`select count(*)::int as n from user_sensitive_actions where user_id = ${userId} and action = 'document_number_reveal' and at > now() - interval '1 hour'`)).rows[0] as { n: number }
      if (used.n >= NUMBER_REVEAL_LIMIT_PER_HOUR) {
        throw new AppError(429, 'REVEAL_LIMIT', `Bir saat içinde en fazla ${NUMBER_REVEAL_LIMIT_PER_HOUR} belge numarası açılabilir. Daha sonra tekrar deneyin.`)
      }
      const number = crypto.decrypt(access.companyId, 'number', docId, d.number_ciphertext as Buffer, d.number_key_id as string).toString('utf8')
      await tx.execute(sql`insert into user_sensitive_actions (user_id, action) values (${userId}, 'document_number_reveal')`)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'customer.document.number_reveal',
        entity: 'customer_document',
        entityId: docId,
        summary: { customerId: id, customerNo: customer.customerNo, type: d.type, reason },
      })
      return { number, visibleSeconds: NUMBER_REVEAL_VISIBLE_SECONDS, remainingThisHour: NUMBER_REVEAL_LIMIT_PER_HOUR - used.n - 1 }
    })
  })
}

async function assertWritableDocument(tx: Tx, customerId: string, docId: string, lock = false) {
  const customer = await getCustomer(tx, customerId)
  if (!customer) throw notFound(CUSTOMER_NOT_FOUND)
  if (customer.status !== 'active') throw new AppError(409, 'CUSTOMER_ARCHIVED', 'Arşivdeki müşterinin belgelerine dosya eklenemez.')
  const r = (await tx.execute(sql`select record_state from customer_documents where id = ${docId} and customer_id = ${customerId} ${lock ? sql`for update` : sql``}`)).rows[0] as Row | undefined
  if (!r) throw notFound(DOCUMENT_NOT_FOUND)
  if (r.record_state === 'voided') throw new AppError(409, 'DOCUMENT_VOIDED', 'Geçersiz sayılmış belgeye dosya eklenemez.')
  return { customer }
}

/** A customer file of the active company (RLS) with its document, or 404. */
async function visibleCustomerFile(tx: Tx, fileId: string) {
  const r = (
    await tx.execute(sql`
      select f.id, f.storage_key, f.kind, f.enc_key_id, f.ciphertext_sha256, df.side, df.version_no, d.id as document_id, d.type, c.id as customer_id, c.customer_no
      from customer_files f
      join customer_document_files df on df.company_id = f.company_id and df.file_id = f.id
      join customer_documents d on d.company_id = df.company_id and d.id = df.document_id
      join customers c on c.company_id = d.company_id and c.id = d.customer_id
      where f.id = ${fileId} and c.status in ('active', 'archived')`)
  ).rows[0] as Row | undefined
  if (!r) throw notFound(FILE_NOT_FOUND)
  return r
}

const MODE_PERMISSION = { view: 'customers.documents.view', download: 'customers.documents.download' } as const
const MIME = { pdf: 'application/pdf', jpeg: 'image/jpeg', png: 'image/png' } as const
const EXT = { pdf: 'pdf', jpeg: 'jpg', png: 'png' } as const

/**
 * Customer document files, served like vehicle document files (docs §8.4.4): a POST asks for a short-lived grant bound
 * to session, company, file kind, file and purpose (audited as requested); the GET needs that grant and same-origin
 * Fetch Metadata, re-checks the permission and decrypts in memory. Viewing and downloading are separate permissions.
 */
export async function customerFileRoutes(app: FastifyInstance) {
  app.post(
    '/:id/access',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: (req: FastifyRequest) => `cust-file-access|${req.auth?.user.id ?? req.ip}` } } },
    async (req) => {
      const parsed = z.object({ id: z.uuid() }).safeParse(req.params)
      if (!parsed.success) throw notFound(FILE_NOT_FOUND)
      const { mode } = accessSchema.parse(req.body)
      return withCompany(req, null, async (tx, access) => {
        if (!access.permissions.has(MODE_PERMISSION[mode])) throw forbidden(mode === 'view' ? 'Belge görüntüsünü açma yetkiniz yok.' : 'Belge dosyasını indirme yetkiniz yok.')
        const r = await visibleCustomerFile(tx, parsed.data.id)
        const auth = req.auth!
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: auth.user.id,
          action: mode === 'view' ? 'customer.document.view_request' : 'customer.document.download_request',
          entity: 'customer_document',
          entityId: r.document_id as string,
          summary: { customerId: r.customer_id, customerNo: r.customer_no, fileId: parsed.data.id, side: r.side, versionNo: Number(r.version_no), mode },
        })
        const { expiresAt } = app.documentGrants.issue({ kind: 'customer_document', sessionId: auth.session.id, userId: auth.user.id, companyId: access.companyId, fileId: parsed.data.id, mode })
        return { url: `/api/customer-files/${parsed.data.id}${mode === 'download' ? '?indir=1' : ''}`, expiresAt: new Date(expiresAt).toISOString() }
      })
    },
  )

  app.get('/:id', async (req: FastifyRequest, reply) => {
    const site = req.headers['sec-fetch-site']
    if (site !== undefined && site !== 'same-origin' && site !== 'none') throw new AppError(403, 'CROSS_SITE_REQUEST', 'Belgeler yalnız ACARVO içinden açılabilir.')
    const parsed = z.object({ id: z.uuid() }).safeParse(req.params)
    if (!parsed.success) throw notFound(FILE_NOT_FOUND)
    const mode = (req.query as Record<string, unknown>).indir === '1' ? 'download' : 'view'
    const crypto = requireCrypto(app.customerCrypto)
    const file = await withCompany(req, null, async (tx, access) => {
      // Permissions are checked again on every request: a revoked permission closes access at once.
      if (!access.permissions.has(MODE_PERMISSION[mode])) throw forbidden()
      const r = await visibleCustomerFile(tx, parsed.data.id)
      if (!app.documentGrants.allows({ kind: 'customer_document', sessionId: req.auth!.session.id, companyId: access.companyId, fileId: parsed.data.id, mode })) {
        throw new AppError(403, 'ACCESS_GRANT_REQUIRED', 'Bu belgeyi açmak için ACARVO içindeki Görüntüle veya İndir düğmesini kullanın. Bağlantının süresi dolmuş olabilir.')
      }
      return { ...r, companyId: access.companyId } as Row & { companyId: string }
    })
    const ciphertext = await app.storage.readAll(file.storage_key as string)
    if (createHash('sha256').update(ciphertext).digest('hex') !== file.ciphertext_sha256) throw new AppError(500, 'FILE_INTEGRITY', 'Dosya bütünlük denetiminden geçmedi.')
    const data = crypto.decrypt(file.companyId, 'file', parsed.data.id, ciphertext, file.enc_key_id as string)
    const kind = file.kind as keyof typeof MIME
    const name = `${TYPE_SLUG[file.type as string] ?? 'belge'}_${file.side}_v${file.version_no}.${EXT[kind]}`
    return reply
      .header('content-type', MIME[kind])
      .header('content-length', data.length)
      .header('cache-control', 'private, no-store, max-age=0')
      .header('pragma', 'no-cache')
      .header('x-content-type-options', 'nosniff')
      .header('content-disposition', `${mode === 'download' ? 'attachment' : 'inline'}; filename="${name}"`)
      .header('content-security-policy', "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'")
      .send(data)
  })
}

