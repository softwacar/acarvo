import {
  chargeCreateSchema,
  depositCreateSchema,
  depositReportSchema,
  depositReviewSchema,
  financeListSchema,
  financeNoteSchema,
  financeOpenSchema,
  financeReasonSchema,
  financeTransitionSchema,
  responsibleCorrectionSchema,
  responsibleDecisionSchema,
  type FinanceListQuery,
  paymentCreateSchema,
  parseAmount,
  type Permission,
  refundCompleteSchema,
  refundCreateSchema,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { currentQuoteForRental, nextNo } from '../pricing/repository'
import { RENTAL_NOT_FOUND } from '../rentals/repository'
import { inScope } from '../vehicles/repository'
import {
  CHARGE_LIST_SELECT,
  chargeOf,
  depositsOf,
  FINANCE_NOT_FOUND,
  fileItems,
  fileScope,
  financeSummary,
  PAYMENT_LIST_SELECT,
  paymentListItem,
  REFUND_SELECT,
  refundOf,
  rentalFinanceView,
  scopedRental,
} from './repository'

type Row = Record<string, unknown>
const idParams = z.object({ id: z.uuid() })
const parseId = (req: FastifyRequest, message: string) => {
  const p = idParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data.id
}
const need = (access: CompanyAccess, ...perms: Permission[]) => {
  if (!perms.some((p) => access.permissions.has(p))) throw forbidden()
}
const money = (text: string, currency: string, field = 'amount') => {
  const v = parseAmount(text, currency)
  if (v == null || v <= 0) throw new AppError(400, 'VALIDATION', 'Tutar geçersiz.', { [field]: `Geçerli bir ${currency} tutarı girin (küsurat basamağına dikkat)` })
  return v
}
const conflict = () => new AppError(409, 'VERSION_CONFLICT', 'Bu kayıt siz işlem yaparken değişti. Güncel bilgiler yüklendi; kontrol edip yeniden deneyin.')

/** Database rules turned into clear answers (the database is the last line; the API checks first). */
function mapGuard(e: unknown): never {
  if (e instanceof AppError) throw e
  const pg = ((e as { cause?: unknown }).cause ?? e) as { constraint?: string; code?: string }
  const c = pg.constraint ?? ''
  const map: Record<string, [number, string, string]> = {
    rental_finances_rental_key: [409, 'FINANCE_EXISTS', 'Bu kiralamanın finans dosyası zaten açık.'],
    rental_finances_closed: [409, 'FINANCE_CLOSED', 'Finans dosyası kapalı. Değişiklik için önce gerekçeyle yeniden açın.'],
    rental_finances_close_pending: [409, 'CLOSE_BLOCKED', 'Bekleyen kalem, tahsilat, depozito veya iade varken dosya kapatılamaz.'],
    rental_finances_close_balance: [409, 'CLOSE_BLOCKED', 'Dosya yalnız kalan bakiye sıfırken kapatılabilir.'],
    rental_finances_correction_movement: [409, 'FINANCE_CORRECTION_REVIEW', 'Bu dosyada finansal hareket var (kalem, tahsilat veya depozito). Ödeme sorumlusu yerinde düzeltilmez; kayıtlar başka kişiye taşınmaz. Yetkili inceleme gerekir.'],
    rental_finances_responsible: [409, 'RESPONSIBLE_NOT_OF_RENTAL', 'Ödeme sorumlusu yalnız kiralamanın kendi müşterisi veya kurumsal hesabı olabilir.'],
    finance_responsible_corrections_from: [409, 'VERSION_CONFLICT', 'Dosyanın ödeme sorumlusu siz çalışırken değişti. Sayfayı yenileyin.'],
    finance_responsible_corrections_same: [400, 'VALIDATION', 'Yeni ödeme sorumlusu mevcut sorumludan farklı olmalı.'],
    finance_responsible_corrections_open_key: [409, 'CORRECTION_PENDING', 'Bu dosya için zaten onay bekleyen bir düzeltme talebi var.'],
    rental_finances_close_unpriced: [409, 'CLOSE_BLOCKED', 'Onaylanmış iç hesap kalemi olmayan dosya kapatılamaz; fiyatlandırılmamış dosya "sıfır borçla kapandı" sayılmaz.'],
    finance_charges_quote: [409, 'QUOTE_NOT_CURRENT', 'Teklif güncel değil veya bu kiralamaya ait değil. Teklifi yeniden hesaplayın.'],
    finance_charges_quote_key: [409, 'QUOTE_ALREADY_CHARGED', 'Bu teklif bu dosyada zaten iç hesap kalemine dönüştürüldü.'],
    finance_charges_delivered: [409, 'NOT_DELIVERED', 'İç hesap kalemi yalnız araç teslim edildikten sonra onaylanabilir.'],
    finance_charges_currency: [409, 'CURRENCY_MISMATCH', 'Kalem finans dosyasının para biriminde olmalı.'],
    finance_payments_currency: [409, 'CURRENCY_MISMATCH', 'Tahsilat finans dosyasının para biriminde olmalı; kur dönüşümü yapılmaz.'],
    finance_payments_overpayment: [409, 'OVERPAYMENT', 'Tahsilat toplamı iç hesap kalemlerini aşamaz.'],
    finance_payments_reference_key: [409, 'REFERENCE_USED', 'Bu harici işlem referansı başka bir geçerli tahsilatta kayıtlı.'],
    finance_deposits_reference_key: [409, 'REFERENCE_USED', 'Bu harici işlem referansı başka bir geçerli depozitoda kayıtlı.'],
    finance_deposit_refunds_exceed: [409, 'REFUND_EXCEEDS', 'İade toplamı doğrulanmış depozito tutarını aşamaz.'],
    finance_deposit_refunds_not_held: [409, 'DEPOSIT_NOT_HELD', 'Yalnız doğrulanmış (tutulan) depozito iade edilebilir.'],
    finance_deposit_refunds_review: [409, 'DEPOSIT_IN_REVIEW', 'Depozito incelemede; inceleme kapanmadan iade yapılamaz.'],
  }
  const hit = map[c]
  if (hit) throw new AppError(hit[0], hit[1], hit[2])
  if (c.endsWith('_four_eyes')) throw new AppError(409, 'FOUR_EYES', 'Kendi kaydınızı onaylayamaz veya doğrulayamazsınız; başka bir yetkili gerekli.')
  if (c.endsWith('_lifecycle') || c.endsWith('_immutable')) throw new AppError(409, 'INVALID_TRANSITION', 'Kaydın durumu bu işleme izin vermiyor.')
  if (c.endsWith('_request_key')) throw new AppError(409, 'REQUEST_REPLAY', 'Bu istek zaten işlendi.')
  throw e
}

async function event(
  tx: Tx,
  companyId: string,
  financeId: string,
  e: { entityType: string; entityId: string; kind: string; from?: string | null; to?: string | null; amountMinor?: number | null; currency?: string | null; data?: Record<string, unknown>; requestId?: string | null },
  actor: string,
) {
  await tx
    .execute(sql`insert into finance_events (company_id, finance_id, entity_type, entity_id, kind, from_status, to_status, amount_minor, currency, data, client_request_id, actor_user_id)
      values (${companyId}, ${financeId}, ${e.entityType}, ${e.entityId}, ${e.kind}, ${e.from ?? null}, ${e.to ?? null}, ${e.amountMinor ?? null}, ${e.currency ?? null},
        ${e.data ? JSON.stringify(e.data) : null}::jsonb, ${e.requestId ?? null}, ${actor})`)
    .catch(mapGuard)
}

/** Rental in scope; writes need its pickup branch in the user's scope. */
async function rentalFor(tx: Tx, access: CompanyAccess, rentalId: string, write: boolean) {
  const k = await scopedRental(tx, access, rentalId, write)
  if (!k) throw notFound(RENTAL_NOT_FOUND)
  if (write && !inScope(access, k.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin kiralamasında finans işlemi yapma yetkiniz yok.')
  return k
}

async function fileOf(tx: Tx, rentalId: string, lock = false) {
  return (await tx.execute(sql`select * from rental_finances where rental_id = ${rentalId} ${lock ? sql`for update` : sql``}`)).rows[0] as Row | undefined
}

async function auditFinance(tx: Tx, access: CompanyAccess, userId: string, action: string, rentalId: string, summary: Record<string, unknown>) {
  await audit(tx, { companyId: access.companyId, actorUserId: userId, action, entity: 'rental', entityId: rentalId, summary })
}

/** A child record (charge, payment, deposit, refund) with its file and rental, in the user's scope. */
async function childOf(tx: Tx, access: CompanyAccess, table: 'finance_charges' | 'finance_payments' | 'finance_deposits' | 'finance_deposit_refunds', id: string) {
  const base =
    table === 'finance_deposit_refunds'
      ? sql`select x.*, d.finance_id, d.currency as deposit_currency, d.deposit_no from finance_deposit_refunds x join finance_deposits d on d.company_id = x.company_id and d.id = x.deposit_id where x.id = ${id} for update of x`
      : sql`select x.* from ${sql.raw(table)} x where x.id = ${id} for update of x`
  const x = (await tx.execute(base)).rows[0] as Row | undefined
  if (!x) throw notFound(FINANCE_NOT_FOUND)
  const f = (await tx.execute(sql`select * from rental_finances where id = ${x.finance_id as string}`)).rows[0] as Row
  const k = await scopedRental(tx, access, f.rental_id as string)
  if (!k) throw notFound(FINANCE_NOT_FOUND)
  if (!inScope(access, k.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin kiralamasında finans işlemi yapma yetkiniz yok.')
  return { x, f, k }
}

/** A replayed transition (same requestId) returns the current picture without changing anything again. */
async function replayed(tx: Tx, requestId: string) {
  return !!(await tx.execute(sql`select 1 from finance_events where client_request_id = ${requestId}`)).rows.length
}

export async function financeRoutes(app: FastifyInstance) {
  const view = async (tx: Tx, access: CompanyAccess, rentalId: string) => rentalFinanceView(tx, access, (await scopedRental(tx, access, rentalId))!)

  app.get('/rentals/:id/finance', async (req) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    return withCompany(req, 'finance.read', async (tx, access) => {
      need(access, 'rentals.read')
      const k = await rentalFor(tx, access, id, false)
      return rentalFinanceView(tx, access, k)
    })
  })

  /** Opens the rental's finance file: currency and the responsible party are chosen explicitly (FN5). */
  app.post('/rentals/:id/finance/open', async (req, reply) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    const out = await withCompany(req, 'finance.read', async (tx, access) => {
      need(access, 'finance.charges.manage', 'finance.payments.record', 'finance.deposits.record')
      const input = financeOpenSchema.parse(req.body)
      const k = await rentalFor(tx, access, id, true)
      if (k.status === 'cancelled') throw new AppError(409, 'RENTAL_CANCELLED', 'İptal edilmiş kiralamada finans dosyası açılmaz.')
      const existing = await fileOf(tx, id)
      if (existing) {
        if (await replayed(tx, input.requestId)) return { replay: true, body: await view(tx, access, id) }
        throw new AppError(409, 'FINANCE_EXISTS', 'Bu kiralamanın finans dosyası zaten açık.')
      }
      if (input.responsibleType === 'corporate' && !k.corporate_account_id) throw new AppError(400, 'VALIDATION', 'Bu kiralamanın kurumsal hesabı yok.', { responsibleType: 'Kurumsal hesap yok; müşteriyi seçin' })
      const userId = req.auth!.user.id
      const f = (
        await tx
          .execute(sql`insert into rental_finances (company_id, rental_id, currency, responsible_type, responsible_customer_id, responsible_corporate_id, created_by)
            values (${access.companyId}, ${id}, ${input.currency}, ${input.responsibleType}, ${input.responsibleType === 'customer' ? (k.customer_id as string) : null},
              ${input.responsibleType === 'corporate' ? (k.corporate_account_id as string) : null}, ${userId}) returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      await event(tx, access.companyId, f.id as string, { entityType: 'finance', entityId: f.id as string, kind: 'opened', to: 'open', currency: input.currency, data: { responsible: input.responsibleType }, requestId: input.requestId }, userId)
      await auditFinance(tx, access, userId, 'finance.open', id, { rentalNo: k.rental_no, currency: input.currency, responsible: input.responsibleType })
      return { replay: false, body: await view(tx, access, id) }
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  // -------------------------------------------------------------------------
  // FN5: correcting the responsible party of a file WITHOUT any financial movement, with four eyes. A file with lines,
  // payments or deposits is never corrected in place (records are never moved to another person); it needs a reviewed
  // procedure that is not part of V1. PostgreSQL enforces the same.

  app.post('/rentals/:id/finance/responsible-corrections', async (req, reply) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    return withCompany(req, 'finance.close', async (tx, access) => {
      const input = responsibleCorrectionSchema.parse(req.body)
      const k = await rentalFor(tx, access, id, true)
      const f = await fileOf(tx, id, true)
      if (!f) throw new AppError(409, 'NO_FINANCE_FILE', 'Bu kiralamanın finans dosyası yok.')
      if (await replayed(tx, input.requestId)) return reply.code(200).send(await view(tx, access, id))
      if (f.status === 'closed') throw new AppError(409, 'FINANCE_CLOSED', 'Kapalı dosyada ödeme sorumlusu düzeltilmez.')
      if ((await tx.execute(sql`select finance_file_has_movement(${access.companyId}::uuid, ${f.id as string}::uuid) as m`)).rows[0]!.m) {
        throw new AppError(409, 'FINANCE_CORRECTION_REVIEW', 'Bu dosyada finansal hareket var (kalem, tahsilat veya depozito). Ödeme sorumlusu yerinde düzeltilmez; kayıtlar başka kişiye taşınmaz. Yetkili inceleme gerekir.')
      }
      if (input.toType === 'corporate' && !k.corporate_account_id) throw new AppError(400, 'VALIDATION', 'Bu kiralamanın kurumsal hesabı yok.', { toType: 'Kurumsal hesap yok' })
      const toCustomer = input.toType === 'customer' ? (k.customer_id as string) : null
      const toCorporate = input.toType === 'corporate' ? (k.corporate_account_id as string) : null
      const userId = req.auth!.user.id
      const c = (
        await tx
          .execute(sql`insert into finance_responsible_corrections (company_id, finance_id, from_type, from_customer_id, from_corporate_id, to_type, to_customer_id, to_corporate_id, reason, requested_by, client_request_id)
            values (${access.companyId}, ${f.id as string}, ${f.responsible_type as string}, ${(f.responsible_customer_id as string | null) ?? null}, ${(f.responsible_corporate_id as string | null) ?? null},
              ${input.toType}, ${toCustomer}, ${toCorporate}, ${input.reason}, ${userId}, ${input.requestId}) returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      await event(tx, access.companyId, f.id as string, { entityType: 'finance', entityId: f.id as string, kind: 'responsible_correction_requested', data: { from: f.responsible_type, to: input.toType, correctionId: c.id }, requestId: input.requestId }, userId)
      await auditFinance(tx, access, userId, 'finance.responsible_correction.request', id, { rentalNo: k.rental_no, from: f.responsible_type, to: input.toType })
      return reply.code(201).send(await view(tx, access, id))
    })
  })

  for (const path of ['approve', 'reject', 'cancel'] as const) {
    app.post(`/finance/responsible-corrections/:id/${path}`, async (req) => {
      const cid = parseId(req, FINANCE_NOT_FOUND)
      try {
        return await decideCorrection(req, cid, path)
      } catch (e) {
        // A request whose file got a financial movement (or was closed) meanwhile is no longer valid: the approval
        // attempt closes it as rejected, with that reason, by the second person, and the refusal is returned.
        if (path === 'approve' && e instanceof AppError && e.code === 'FINANCE_CORRECTION_REVIEW') await invalidateCorrection(req, cid)
        throw e
      }
    })
  }
  async function invalidateCorrection(req: FastifyRequest, cid: string) {
    await withCompany(req, 'finance.close', async (tx, access) => {
      const c = (await tx.execute(sql`select c.*, f.rental_id, f.status as file_status from finance_responsible_corrections c join rental_finances f on f.company_id = c.company_id and f.id = c.finance_id
          where c.id = ${cid} for update of f`)).rows[0] as Row | undefined
      if (!c || c.status !== 'requested') return
      const userId = req.auth!.user.id
      if (c.requested_by === userId) return
      const moved = (await tx.execute(sql`select finance_file_has_movement(${access.companyId}::uuid, ${c.finance_id as string}::uuid) as m`)).rows[0]!.m
      if (!moved && c.file_status !== 'closed') return
      const k = await rentalFor(tx, access, c.rental_id as string, true)
      const note = 'Talepten sonra dosyada finansal hareket oluştu veya dosya kapandı; talep geçersiz sayıldı. Yetkili incelemesi gerekli.'
      await tx
        .execute(sql`update finance_responsible_corrections set status = 'rejected', decided_by = ${userId}, decided_at = now(), decision_note = ${note}, version = version + 1 where id = ${cid}`)
        .catch(mapGuard)
      await event(tx, access.companyId, c.finance_id as string, { entityType: 'finance', entityId: c.finance_id as string, kind: 'responsible_correction_rejected', data: { from: c.from_type, to: c.to_type, correctionId: cid, reason: 'movement' } }, userId)
      await auditFinance(tx, access, userId, 'finance.responsible_correction.invalidated', k.id as string, { rentalNo: k.rental_no, from: c.from_type, to: c.to_type })
    })
  }
  function decideCorrection(req: FastifyRequest, cid: string, path: 'approve' | 'reject' | 'cancel') {
    return withCompany(req, 'finance.close', async (tx, access) => {
      const input = responsibleDecisionSchema.parse(req.body)
      const c0 = (await tx.execute(sql`select finance_id from finance_responsible_corrections where id = ${cid}`)).rows[0] as Row | undefined
      if (!c0) throw notFound(FINANCE_NOT_FOUND)
      const f = (await tx.execute(sql`select * from rental_finances where id = ${c0.finance_id as string} for update`)).rows[0] as Row
      const k = await rentalFor(tx, access, f.rental_id as string, true)
      if (await replayed(tx, input.requestId)) return view(tx, access, k.id as string)
      const c = (await tx.execute(sql`select * from finance_responsible_corrections where id = ${cid} for update`)).rows[0] as Row
      if (Number(c.version) !== input.version) throw conflict()
      if (c.status !== 'requested') throw new AppError(409, 'INVALID_TRANSITION', 'Bu düzeltme talebi zaten sonuçlandırılmış.')
      const userId = req.auth!.user.id
      if (path === 'cancel' && c.requested_by !== userId) throw new AppError(403, 'FOUR_EYES', 'Talebi yalnız talep eden kişi geri çekebilir.')
      if (path !== 'cancel' && c.requested_by === userId) throw new AppError(403, 'FOUR_EYES', 'Kendi düzeltme talebinizi onaylayamaz veya reddedemezsiniz; ikinci bir finans yetkilisi gerekir.')
      if (path === 'reject' && (input.note?.length ?? 0) < 3) throw new AppError(400, 'VALIDATION', 'Ret gerekçesini yazın.', { note: 'Ret gerekçesini yazın' })
      if (path === 'approve') {
        if ((await tx.execute(sql`select finance_file_has_movement(${access.companyId}::uuid, ${f.id as string}::uuid) as m`)).rows[0]!.m || f.status === 'closed') {
          throw new AppError(409, 'FINANCE_CORRECTION_REVIEW', 'Talepten sonra dosyada finansal hareket oluştu veya dosya kapandı. Ödeme sorumlusu yerinde düzeltilmez; yetkili inceleme gerekir.')
        }
        await tx.execute(sql`update finance_responsible_corrections set status = 'applied', decided_by = ${userId}, decided_at = now(), decision_note = ${input.note ?? null}, version = version + 1 where id = ${cid}`).catch(mapGuard)
        await tx
          .execute(sql`update rental_finances set responsible_type = ${c.to_type as string}, responsible_customer_id = ${(c.to_customer_id as string | null) ?? null},
              responsible_corporate_id = ${(c.to_corporate_id as string | null) ?? null}, version = version + 1, updated_at = now() where id = ${f.id as string}`)
          .catch(mapGuard)
      } else {
        await tx
          .execute(sql`update finance_responsible_corrections set status = ${path === 'reject' ? 'rejected' : 'cancelled'}, decided_by = ${userId}, decided_at = now(),
              decision_note = ${input.note ?? null}, version = version + 1 where id = ${cid}`)
          .catch(mapGuard)
      }
      const kind = { approve: 'responsible_corrected', reject: 'responsible_correction_rejected', cancel: 'responsible_correction_cancelled' }[path]
      await event(tx, access.companyId, f.id as string, { entityType: 'finance', entityId: f.id as string, kind, data: { from: c.from_type, to: c.to_type, correctionId: cid }, requestId: input.requestId }, userId)
      await auditFinance(tx, access, userId, `finance.responsible_correction.${path}`, k.id as string, { rentalNo: k.rental_no, from: c.from_type, to: c.to_type })
      return view(tx, access, k.id as string)
    })
  }

  // -------------------------------------------------------------------------
  // Internal account lines

  app.post('/rentals/:id/finance/charges', async (req, reply) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    const out = await withCompany(req, 'finance.charges.manage', async (tx, access) => {
      const input = chargeCreateSchema.parse(req.body)
      const k = await rentalFor(tx, access, id, true)
      const replay = (await tx.execute(sql`select id from finance_charges where client_request_id = ${input.requestId}`)).rows[0]
      if (replay) return { replay: true, body: await view(tx, access, id) }
      const f = await fileOf(tx, id, true)
      if (!f) throw new AppError(409, 'NO_FINANCE_FILE', 'Önce finans dosyasını açın.')
      if (f.status === 'closed') throw new AppError(409, 'FINANCE_CLOSED', 'Finans dosyası kapalı. Değişiklik için önce gerekçeyle yeniden açın.')
      const userId = req.auth!.user.id
      const chargeNo = await nextNo(tx, access.companyId, 'finance_charge', 'H')
      let values: { description: string; amount: number; net: number; tax: number | null; taxStatus: string; quoteId: string | null; reason: string | null }
      if (input.kind === 'quote') {
        const q = await currentQuoteForRental(tx, id, (k.reservation_id as string) ?? null)
        if (!q || q.id !== input.quoteId) throw new AppError(409, 'QUOTE_NOT_CURRENT', 'Bu teklif kiralamanın geçerli teklifi değil. Fiyat teklifi sekmesinden yeniden hesaplayın.')
        if (!q.matchesPlan) throw new AppError(409, 'QUOTE_NOT_CURRENT', 'Teklif güncel değil (tarih, saat, sınıf veya sürücü sayısı değişti). Önce yeniden hesaplayın.')
        if (q.currency !== f.currency) throw new AppError(409, 'CURRENCY_MISMATCH', `Teklif ${q.currency}, finans dosyası ${f.currency as string}. Kur dönüşümü yapılmaz.`)
        values = { description: `Kiralama bedeli · teklif ${q.quoteNo} · ${q.priceList.name} r${q.priceList.revision}`, amount: q.grossMinor ?? q.netMinor, net: q.netMinor, tax: q.taxMinor, taxStatus: q.taxStatus, quoteId: q.id, reason: null }
      } else {
        const amount = money(input.amount, f.currency as string)
        values = { description: input.description, amount, net: amount, tax: null, taxStatus: 'not_configured', quoteId: null, reason: input.reason }
      }
      const row = (
        await tx
          .execute(sql`insert into finance_charges (company_id, finance_id, charge_no, kind, quote_id, description, currency, amount_minor, net_minor, tax_minor, tax_status, reason, client_request_id, created_by)
            values (${access.companyId}, ${f.id as string}, ${chargeNo}, ${input.kind}, ${values.quoteId}, ${values.description}, ${f.currency as string}, ${values.amount}, ${values.net}, ${values.tax},
              ${values.taxStatus}, ${values.reason}, ${input.requestId}, ${userId}) returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      await event(tx, access.companyId, f.id as string, { entityType: 'charge', entityId: row.id as string, kind: 'charge_prepared', to: 'pending', amountMinor: values.amount, currency: f.currency as string, data: { kind: input.kind, taxStatus: values.taxStatus } }, userId)
      await auditFinance(tx, access, userId, 'finance.charge.prepare', id, { rentalNo: k.rental_no, chargeNo, kind: input.kind, amountMinor: values.amount, currency: f.currency })
      return { replay: false, body: await view(tx, access, id) }
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  /** Charge transitions: approve (post), reject, request reversal, approve reversal, withdraw reversal. */
  const chargeAction = (path: string, perm: Permission, apply: (tx: Tx, x: Row, userId: string, body: Record<string, unknown>) => Promise<{ from: string; to: string; data?: Record<string, unknown> }>, schema: z.ZodType = financeTransitionSchema) =>
    app.post(`/finance/charges/:id/${path}`, async (req) => {
      const id = parseId(req, FINANCE_NOT_FOUND)
      return withCompany(req, perm, async (tx, access) => {
        const body = schema.parse(req.body) as { version: number; requestId: string } & Record<string, unknown>
        const { x, f, k } = await childOf(tx, access, 'finance_charges', id)
        if (await replayed(tx, body.requestId)) return view(tx, access, k.id as string)
        if (Number(x.version) !== body.version) throw conflict()
        const userId = req.auth!.user.id
        const t = await apply(tx, x, userId, body)
        await event(tx, access.companyId, f.id as string, { entityType: 'charge', entityId: id, kind: `charge_${path.replace('-', '_')}`, from: t.from, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency as string, data: t.data, requestId: body.requestId }, userId)
        await auditFinance(tx, access, userId, `finance.charge.${path}`, k.id as string, { rentalNo: k.rental_no, chargeNo: x.charge_no, from: t.from, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency })
        return view(tx, access, k.id as string)
      })
    })
  const fourEyes = (createdBy: unknown, userId: string) => {
    if (createdBy === userId) throw new AppError(409, 'FOUR_EYES', 'Kendi kaydınızı onaylayamaz veya doğrulayamazsınız; başka bir yetkili gerekli.')
  }
  chargeAction('approve', 'finance.charges.approve', async (tx, x, userId) => {
    fourEyes(x.created_by, userId)
    await tx.execute(sql`update finance_charges set status = 'posted', approved_at = now(), approved_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { from: x.status as string, to: 'posted' }
  })
  chargeAction(
    'reject',
    'finance.charges.approve',
    async (tx, x, userId, body) => {
      fourEyes(x.created_by, userId)
      await tx.execute(sql`update finance_charges set status = 'rejected', review_note = ${(body.note as string) ?? null}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
      return { from: x.status as string, to: 'rejected' }
    },
    financeNoteSchema,
  )
  chargeAction(
    'reversal-request',
    'finance.charges.manage',
    async (tx, x, userId, body) => {
      await tx
        .execute(sql`update finance_charges set status = 'reversal_requested', reversal_reason = ${body.reason as string}, reversal_requested_at = now(), reversal_requested_by = ${userId}, version = version + 1 where id = ${x.id as string}`)
        .catch(mapGuard)
      return { from: x.status as string, to: 'reversal_requested', data: { reason: 'given' } }
    },
    financeReasonSchema,
  )
  chargeAction('reversal-approve', 'finance.charges.approve', async (tx, x, userId) => {
    if (x.reversal_requested_by === userId) throw new AppError(409, 'FOUR_EYES', 'Kendi ters kayıt isteğinizi onaylayamazsınız; başka bir yetkili gerekli.')
    await tx.execute(sql`update finance_charges set status = 'reversed', reversed_at = now(), reversed_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { from: x.status as string, to: 'reversed' }
  })
  chargeAction('reversal-withdraw', 'finance.charges.manage', async (tx, x) => {
    await tx.execute(sql`update finance_charges set status = 'posted', reversal_reason = null, reversal_requested_at = null, reversal_requested_by = null, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { from: x.status as string, to: 'posted' }
  })

  // -------------------------------------------------------------------------
  // Payments

  app.post('/rentals/:id/finance/payments', async (req, reply) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    const out = await withCompany(req, 'finance.payments.record', async (tx, access) => {
      const input = paymentCreateSchema.parse(req.body)
      const k = await rentalFor(tx, access, id, true)
      const replay = (await tx.execute(sql`select id from finance_payments where client_request_id = ${input.requestId}`)).rows[0]
      if (replay) return { replay: true, body: await view(tx, access, id) }
      const f = await fileOf(tx, id, true)
      if (!f) throw new AppError(409, 'NO_FINANCE_FILE', 'Önce finans dosyasını açın.')
      if (f.status === 'closed') throw new AppError(409, 'FINANCE_CLOSED', 'Finans dosyası kapalı. Değişiklik için önce gerekçeyle yeniden açın.')
      const amount = money(input.amount, f.currency as string)
      // Payer: the rental's own customer or corporate account, or a third party by name only.
      if (input.payerType === 'customer' && input.payerCustomerId !== k.customer_id) {
        const ok = (await tx.execute(sql`select 1 from rental_drivers where rental_id = ${id} and customer_id = ${input.payerCustomerId ?? null} and removed_at is null`)).rows.length
        if (!ok) throw new AppError(400, 'VALIDATION', 'Ödeyen müşteri bu kiralamanın müşterisi veya sürücüsü değil.', { payerCustomerId: 'Kiralamanın müşterisini veya sürücüsünü seçin; başka kişi için "Başka kişi/kurum" kullanın' })
      }
      if (input.payerType === 'corporate' && input.payerCorporateId !== k.corporate_account_id) throw new AppError(400, 'VALIDATION', 'Ödeyen kurum bu kiralamanın kurumsal hesabı değil.', { payerCorporateId: 'Kiralamanın kurumsal hesabını seçin' })
      const receivedAt = input.receivedAt ?? new Date().toISOString()
      const t = Date.parse(receivedAt)
      if (t > Date.now() + 60_000 || t < Date.now() - 31 * 86_400_000) throw new AppError(400, 'VALIDATION', 'Tahsilat zamanı geçersiz.', { receivedAt: 'Gelecek bir zaman veya 31 günden eski bir zaman girilemez' })
      const userId = req.auth!.user.id
      const paymentNo = await nextNo(tx, access.companyId, 'finance_payment', 'T')
      const row = (
        await tx
          .execute(sql`insert into finance_payments (company_id, finance_id, payment_no, method, currency, amount_minor, payer_type, payer_customer_id, payer_corporate_id, payer_name,
              external_reference, received_at, branch_id, note, cash_ack, client_request_id, created_by)
            values (${access.companyId}, ${f.id as string}, ${paymentNo}, ${input.method}, ${f.currency as string}, ${amount}, ${input.payerType},
              ${input.payerType === 'customer' ? input.payerCustomerId! : null}, ${input.payerType === 'corporate' ? input.payerCorporateId! : null}, ${input.payerType === 'other' ? input.payerName! : null},
              ${input.externalReference ?? null}, ${receivedAt}, ${k.pickup_branch_id as string}, ${input.note ?? null}, ${input.method === 'cash'}, ${input.requestId}, ${userId}) returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      await event(tx, access.companyId, f.id as string, { entityType: 'payment', entityId: row.id as string, kind: 'payment_recorded', to: 'recorded', amountMinor: amount, currency: f.currency as string, data: { method: input.method, payerType: input.payerType, cashStatement: input.method === 'cash' } }, userId)
      await auditFinance(tx, access, userId, 'finance.payment.record', id, { rentalNo: k.rental_no, paymentNo, method: input.method, amountMinor: amount, currency: f.currency, payerType: input.payerType })
      return { replay: false, body: await view(tx, access, id) }
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  const paymentAction = (path: string, perm: Permission, schema: z.ZodType, apply: (tx: Tx, x: Row, userId: string, body: Record<string, unknown>) => Promise<{ to: string; data?: Record<string, unknown> }>) =>
    app.post(`/finance/payments/:id/${path}`, async (req) => {
      const id = parseId(req, FINANCE_NOT_FOUND)
      return withCompany(req, perm, async (tx, access) => {
        const body = schema.parse(req.body) as { version: number; requestId: string } & Record<string, unknown>
        const { x, f, k } = await childOf(tx, access, 'finance_payments', id)
        if (await replayed(tx, body.requestId)) return view(tx, access, k.id as string)
        if (Number(x.version) !== body.version) throw conflict()
        const userId = req.auth!.user.id
        const t = await apply(tx, x, userId, body)
        await event(tx, access.companyId, f.id as string, { entityType: 'payment', entityId: id, kind: `payment_${path}`, from: x.status as string, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency as string, data: t.data, requestId: body.requestId }, userId)
        await auditFinance(tx, access, userId, `finance.payment.${path}`, k.id as string, { rentalNo: k.rental_no, paymentNo: x.payment_no, from: x.status, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency })
        return view(tx, access, k.id as string)
      })
    })
  paymentAction('verify', 'finance.payments.verify', financeTransitionSchema, async (tx, x, userId) => {
    fourEyes(x.created_by, userId)
    await tx.execute(sql`update finance_payments set status = 'verified', verified_at = now(), verified_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'verified' }
  })
  paymentAction('reject', 'finance.payments.verify', financeNoteSchema, async (tx, x, userId, body) => {
    fourEyes(x.created_by, userId)
    await tx.execute(sql`update finance_payments set status = 'rejected', review_note = ${(body.note as string) ?? null}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'rejected' }
  })
  paymentAction('reverse', 'finance.charges.approve', financeReasonSchema, async (tx, x, userId, body) => {
    if (x.created_by === userId) throw new AppError(409, 'FOUR_EYES', 'Kendi kaydettiğiniz tahsilatı ters kaydedemezsiniz; başka bir yetkili gerekli.')
    await tx.execute(sql`update finance_payments set status = 'reversed', reversal_reason = ${body.reason as string}, reversed_at = now(), reversed_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'reversed', data: { reason: 'given' } }
  })

  // -------------------------------------------------------------------------
  // Deposits and their returns

  app.post('/rentals/:id/finance/deposits', async (req, reply) => {
    const id = parseId(req, RENTAL_NOT_FOUND)
    const out = await withCompany(req, 'finance.deposits.record', async (tx, access) => {
      const input = depositCreateSchema.parse(req.body)
      const k = await rentalFor(tx, access, id, true)
      const replay = (await tx.execute(sql`select id from finance_deposits where client_request_id = ${input.requestId}`)).rows[0]
      if (replay) return { replay: true, body: await view(tx, access, id) }
      const f = await fileOf(tx, id, true)
      if (!f) throw new AppError(409, 'NO_FINANCE_FILE', 'Önce finans dosyasını açın.')
      const amount = money(input.amount, input.currency)
      const userId = req.auth!.user.id
      const depositNo = await nextNo(tx, access.companyId, 'finance_deposit', 'D')
      const received = input.received
      const row = (
        await tx
          .execute(sql`insert into finance_deposits (company_id, finance_id, deposit_no, currency, amount_minor, method, external_reference, cash_ack, branch_id, note, status, reported_at, reported_by, client_request_id, created_by)
            values (${access.companyId}, ${f.id as string}, ${depositNo}, ${input.currency}, ${amount}, ${received ? input.method! : null}, ${received ? (input.externalReference ?? null) : null},
              ${received && input.method === 'cash'}, ${k.pickup_branch_id as string}, ${input.note ?? null}, ${received ? 'reported' : 'requested'},
              ${received ? sql`now()` : null}, ${received ? userId : null}, ${input.requestId}, ${userId}) returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      await event(tx, access.companyId, f.id as string, { entityType: 'deposit', entityId: row.id as string, kind: received ? 'deposit_reported' : 'deposit_requested', to: received ? 'reported' : 'requested', amountMinor: amount, currency: input.currency, data: received ? { method: input.method } : undefined }, userId)
      await auditFinance(tx, access, userId, 'finance.deposit.create', id, { rentalNo: k.rental_no, depositNo, amountMinor: amount, currency: input.currency, status: received ? 'reported' : 'requested' })
      return { replay: false, body: await view(tx, access, id) }
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  const depositAction = (path: string, perm: Permission, schema: z.ZodType, apply: (tx: Tx, x: Row, userId: string, body: Record<string, unknown>) => Promise<{ to: string; kind?: string; data?: Record<string, unknown> }>) =>
    app.post(`/finance/deposits/:id/${path}`, async (req) => {
      const id = parseId(req, FINANCE_NOT_FOUND)
      return withCompany(req, perm, async (tx, access) => {
        const body = schema.parse(req.body) as { version: number; requestId: string } & Record<string, unknown>
        const { x, f, k } = await childOf(tx, access, 'finance_deposits', id)
        if (await replayed(tx, body.requestId)) return view(tx, access, k.id as string)
        if (Number(x.version) !== body.version) throw conflict()
        if (f.status === 'closed') throw new AppError(409, 'FINANCE_CLOSED', 'Finans dosyası kapalı. Değişiklik için önce gerekçeyle yeniden açın.')
        const userId = req.auth!.user.id
        const t = await apply(tx, x, userId, body)
        await event(tx, access.companyId, f.id as string, { entityType: 'deposit', entityId: id, kind: t.kind ?? `deposit_${path}`, from: x.status as string, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency as string, data: t.data, requestId: body.requestId }, userId)
        await auditFinance(tx, access, userId, `finance.deposit.${path}`, k.id as string, { rentalNo: k.rental_no, depositNo: x.deposit_no, from: x.status, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency })
        return view(tx, access, k.id as string)
      })
    })
  depositAction('report', 'finance.deposits.record', depositReportSchema, async (tx, x, userId, b) => {
    await tx
      .execute(sql`update finance_deposits set status = 'reported', method = ${b.method as string}, external_reference = ${(b.externalReference as string) ?? null}, cash_ack = ${b.method === 'cash'},
        reported_at = now(), reported_by = ${userId}, version = version + 1 where id = ${x.id as string}`)
      .catch(mapGuard)
    return { to: 'reported', data: { method: b.method } }
  })
  depositAction('verify', 'finance.deposits.verify', financeTransitionSchema, async (tx, x, userId) => {
    fourEyes(x.reported_by, userId)
    await tx.execute(sql`update finance_deposits set status = 'verified', verified_at = now(), verified_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'verified' }
  })
  depositAction('reject', 'finance.deposits.verify', financeNoteSchema, async (tx, x, userId) => {
    fourEyes(x.reported_by, userId)
    await tx.execute(sql`update finance_deposits set status = 'rejected', version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'rejected' }
  })
  depositAction('cancel', 'finance.deposits.record', financeTransitionSchema, async (tx, x) => {
    await tx.execute(sql`update finance_deposits set status = 'cancelled', version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'cancelled' }
  })
  depositAction('review', 'finance.deposits.verify', depositReviewSchema, async (tx, x, _userId, b) => {
    const on = b.inReview as boolean
    await tx.execute(sql`update finance_deposits set in_review = ${on}, review_reason = ${on ? (b.reason as string) : null}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: x.status as string, kind: on ? 'deposit_review_opened' : 'deposit_review_closed' }
  })

  app.post('/finance/deposits/:id/refunds', async (req, reply) => {
    const id = parseId(req, FINANCE_NOT_FOUND)
    const out = await withCompany(req, 'finance.refunds.request', async (tx, access) => {
      const input = refundCreateSchema.parse(req.body)
      const { x, f, k } = await childOf(tx, access, 'finance_deposits', id)
      const replay = (await tx.execute(sql`select id from finance_deposit_refunds where client_request_id = ${input.requestId}`)).rows[0]
      if (replay) return { replay: true, body: await view(tx, access, k.id as string) }
      if (x.status !== 'verified') throw new AppError(409, 'DEPOSIT_NOT_HELD', 'Yalnız doğrulanmış (tutulan) depozito iade edilebilir.')
      const amount = money(input.amount, x.currency as string)
      const userId = req.auth!.user.id
      const refundNo = await nextNo(tx, access.companyId, 'finance_refund', 'DI')
      const row = (
        await tx
          .execute(sql`insert into finance_deposit_refunds (company_id, deposit_id, refund_no, currency, amount_minor, method, reason, client_request_id, created_by)
            values (${access.companyId}, ${id}, ${refundNo}, ${x.currency as string}, ${amount}, ${input.method}, ${input.reason}, ${input.requestId}, ${userId}) returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      await event(tx, access.companyId, f.id as string, { entityType: 'refund', entityId: row.id as string, kind: 'refund_requested', to: 'requested', amountMinor: amount, currency: x.currency as string, data: { method: input.method, depositNo: x.deposit_no } }, userId)
      await auditFinance(tx, access, userId, 'finance.refund.request', k.id as string, { rentalNo: k.rental_no, refundNo, depositNo: x.deposit_no, amountMinor: amount, currency: x.currency })
      return { replay: false, body: await view(tx, access, k.id as string) }
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  const refundAction = (path: string, perm: Permission, schema: z.ZodType, apply: (tx: Tx, x: Row, userId: string, body: Record<string, unknown>) => Promise<{ to: string; data?: Record<string, unknown> }>) =>
    app.post(`/finance/refunds/:id/${path}`, async (req) => {
      const id = parseId(req, FINANCE_NOT_FOUND)
      return withCompany(req, perm, async (tx, access) => {
        const body = schema.parse(req.body) as { version: number; requestId: string } & Record<string, unknown>
        const { x, f, k } = await childOf(tx, access, 'finance_deposit_refunds', id)
        if (await replayed(tx, body.requestId)) return view(tx, access, k.id as string)
        if (Number(x.version) !== body.version) throw conflict()
        const userId = req.auth!.user.id
        const t = await apply(tx, x, userId, body)
        await event(tx, access.companyId, f.id as string, { entityType: 'refund', entityId: id, kind: `refund_${path}`, from: x.status as string, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency as string, data: t.data, requestId: body.requestId }, userId)
        await auditFinance(tx, access, userId, `finance.refund.${path}`, k.id as string, { rentalNo: k.rental_no, refundNo: x.refund_no, from: x.status, to: t.to, amountMinor: Number(x.amount_minor), currency: x.currency })
        return view(tx, access, k.id as string)
      })
    })
  refundAction('approve', 'finance.refunds.approve', financeTransitionSchema, async (tx, x, userId) => {
    fourEyes(x.created_by, userId)
    await tx.execute(sql`update finance_deposit_refunds set status = 'approved', approved_at = now(), approved_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'approved' }
  })
  refundAction('reject', 'finance.refunds.approve', financeNoteSchema, async (tx, x, userId, b) => {
    fourEyes(x.created_by, userId)
    await tx.execute(sql`update finance_deposit_refunds set status = 'rejected', review_note = ${(b.note as string) ?? null}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'rejected' }
  })
  refundAction('cancel', 'finance.refunds.request', financeTransitionSchema, async (tx, x) => {
    await tx.execute(sql`update finance_deposit_refunds set status = 'cancelled', version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'cancelled' }
  })
  refundAction('complete', 'finance.refunds.approve', refundCompleteSchema, async (tx, x, userId, b) => {
    if (b.method !== x.method) throw new AppError(400, 'VALIDATION', 'İade yöntemi talepteki yöntemle aynı olmalı.')
    await tx
      .execute(sql`update finance_deposit_refunds set status = 'completed', external_reference = ${(b.externalReference as string) ?? null}, cash_ack = ${x.method === 'cash'},
        completed_at = now(), completed_by = ${userId}, version = version + 1 where id = ${x.id as string}`)
      .catch(mapGuard)
    return { to: 'completed', data: { statement: 'external_refund_reported' } }
  })
  refundAction('reverse', 'finance.refunds.approve', financeReasonSchema, async (tx, x, userId, b) => {
    if (x.completed_by === userId) throw new AppError(409, 'FOUR_EYES', 'İadenin yapıldığını kendiniz bildirdiyseniz ters kaydedemezsiniz; başka bir yetkili gerekli.')
    await tx.execute(sql`update finance_deposit_refunds set status = 'reversed', reversal_reason = ${b.reason as string}, reversed_at = now(), reversed_by = ${userId}, version = version + 1 where id = ${x.id as string}`).catch(mapGuard)
    return { to: 'reversed', data: { reason: 'given' } }
  })

  // -------------------------------------------------------------------------
  // Financial close (independent from the rental's operational close)

  for (const [path, schema] of [
    ['close', financeTransitionSchema],
    ['reopen', financeReasonSchema],
  ] as const) {
    app.post(`/rentals/:id/finance/${path}`, async (req) => {
      const id = parseId(req, RENTAL_NOT_FOUND)
      return withCompany(req, 'finance.close', async (tx, access) => {
        const body = schema.parse(req.body) as { version: number; requestId: string; reason?: string }
        const k = await rentalFor(tx, access, id, true)
        const f = await fileOf(tx, id, true)
        if (!f) throw new AppError(409, 'NO_FINANCE_FILE', 'Finans dosyası yok.')
        if (await replayed(tx, body.requestId)) return view(tx, access, id)
        if (Number(f.version) !== body.version) throw conflict()
        const userId = req.auth!.user.id
        if (path === 'close') {
          await tx.execute(sql`update rental_finances set status = 'closed', closed_at = now(), closed_by = ${userId}, reopen_reason = null, version = version + 1, updated_at = now() where id = ${f.id as string}`).catch(mapGuard)
        } else {
          await tx.execute(sql`update rental_finances set status = 'reopened', closed_at = null, reopen_reason = ${body.reason!}, version = version + 1, updated_at = now() where id = ${f.id as string}`).catch(mapGuard)
        }
        const to = path === 'close' ? 'closed' : 'reopened'
        await event(tx, access.companyId, f.id as string, { entityType: 'finance', entityId: f.id as string, kind: path === 'close' ? 'finance_closed' : 'finance_reopened', from: f.status as string, to, currency: f.currency as string, data: path === 'reopen' ? { reason: 'given' } : undefined, requestId: body.requestId }, userId)
        await auditFinance(tx, access, userId, `finance.${path}`, id, { rentalNo: k.rental_no, from: f.status, to })
        return view(tx, access, id)
      })
    })
  }

  // -------------------------------------------------------------------------
  // Finance centre lists and reports (finance.reports.read; always in the user's branch scope)

  const listFilters = (q: FinanceListQuery, alias: { amount: SQL; at: SQL; status: SQL; method?: SQL; currency: SQL }) => {
    const parts: SQL[] = []
    if (q.status) parts.push(sql`${alias.status} = ${q.status}`)
    if (q.method && alias.method) parts.push(sql`${alias.method} = ${q.method}`)
    if (q.currency) parts.push(sql`${alias.currency} = ${q.currency}`)
    if (q.branchId) parts.push(sql`k.pickup_branch_id = ${q.branchId}`)
    if (q.from) parts.push(sql`${alias.at} >= ${q.from}::date`)
    if (q.to) parts.push(sql`${alias.at} < (${q.to}::date + 1)`)
    if (q.q) {
      const t = `%${q.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`
      parts.push(sql`(lower(k.rental_no) like ${t} or lower(coalesce(rc.customer_no, '')) like ${t} or lower(coalesce(ra.account_no, '')) like ${t} or lower(coalesce(ra.legal_name, '')) like ${t})`)
    }
    return parts.length ? sql.join(parts, sql` and `) : sql`true`
  }
  const order = (q: FinanceListQuery, amount: SQL, at: SQL) =>
    q.sort === 'oldest' ? sql`${at} asc` : q.sort === 'amount_desc' ? sql`${amount} desc, ${at} desc` : q.sort === 'amount_asc' ? sql`${amount} asc, ${at} desc` : sql`${at} desc`
  const FROM_FILE = sql`join rental_finances f on f.company_id = x.company_id and f.id = x.finance_id
    join rentals k on k.company_id = f.company_id and k.id = f.rental_id
    left join customers rc on rc.company_id = f.company_id and rc.id = f.responsible_customer_id
    left join corporate_accounts ra on ra.company_id = f.company_id and ra.id = f.responsible_corporate_id`

  app.post('/finance/payments/search', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const q = financeListSchema.parse(req.body ?? {})
      const where = sql`${fileScope(access)} and ${listFilters(q, { amount: sql`x.amount_minor`, at: sql`x.received_at`, status: sql`x.status`, method: sql`x.method`, currency: sql`x.currency` })}`
      const total = Number(((await tx.execute(sql`select count(*)::int n from finance_payments x ${FROM_FILE} where ${where}`)).rows[0] as Row).n)
      const ids = ((await tx.execute(sql`select x.id from finance_payments x ${FROM_FILE} where ${where} order by ${order(q, sql`x.amount_minor`, sql`x.received_at`)}, x.id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)).rows as Row[]).map((r) => r.id as string)
      const rows = ids.length ? ((await tx.execute(sql`select ${PAYMENT_LIST_SELECT} where p.id in ${ids}`)).rows as Row[]) : []
      return { items: ids.map((i) => rows.find((r) => r.id === i)!).map(paymentListItem), total, page: q.page, pageSize: q.pageSize }
    }),
  )

  app.post('/finance/deposits/search', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const q = financeListSchema.parse(req.body ?? {})
      const where = sql`${fileScope(access)} and ${listFilters(q, { amount: sql`x.amount_minor`, at: sql`x.created_at`, status: sql`x.status`, method: sql`x.method`, currency: sql`x.currency` })}`
      const total = Number(((await tx.execute(sql`select count(*)::int n from finance_deposits x ${FROM_FILE} where ${where}`)).rows[0] as Row).n)
      const rows = (await tx.execute(sql`select x.id, k.id as rental_id, k.rental_no from finance_deposits x ${FROM_FILE} where ${where} order by ${order(q, sql`x.amount_minor`, sql`x.created_at`)}, x.id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)).rows as Row[]
      const deposits = rows.length ? await depositsOf(tx, sql`d.id in ${rows.map((r) => r.id as string)}`) : []
      return { items: rows.map((r) => ({ ...deposits.find((d) => d.id === r.id)!, rental: { id: r.rental_id as string, no: r.rental_no as string } })), total, page: q.page, pageSize: q.pageSize }
    }),
  )

  app.post('/finance/refunds/search', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const q = financeListSchema.parse(req.body ?? {})
      const FROM = sql`join finance_deposits dd on dd.company_id = x.company_id and dd.id = x.deposit_id
        join rental_finances f on f.company_id = dd.company_id and f.id = dd.finance_id join rentals k on k.company_id = f.company_id and k.id = f.rental_id
        left join customers rc on rc.company_id = f.company_id and rc.id = f.responsible_customer_id left join corporate_accounts ra on ra.company_id = f.company_id and ra.id = f.responsible_corporate_id`
      const where = sql`${fileScope(access)} and ${listFilters(q, { amount: sql`x.amount_minor`, at: sql`x.created_at`, status: sql`x.status`, method: sql`x.method`, currency: sql`x.currency` })}`
      const total = Number(((await tx.execute(sql`select count(*)::int n from finance_deposit_refunds x ${FROM} where ${where}`)).rows[0] as Row).n)
      const rows = (
        await tx.execute(sql`select x.id, dd.deposit_no, dd.id as deposit_id, k.id as rental_id, k.rental_no from finance_deposit_refunds x ${FROM} where ${where}
          order by ${order(q, sql`x.amount_minor`, sql`x.created_at`)}, x.id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)
      ).rows as Row[]
      const refunds = rows.length ? ((await tx.execute(sql`select ${REFUND_SELECT} where f.id in ${rows.map((r) => r.id as string)}`)).rows as Row[]) : []
      return {
        items: rows.map((r) => ({ ...refundOf(refunds.find((x) => x.id === r.id)!), deposit: { id: r.deposit_id as string, no: r.deposit_no as string }, rental: { id: r.rental_id as string, no: r.rental_no as string } })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      }
    }),
  )

  app.post('/finance/files/search', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const q = financeListSchema.parse(req.body ?? {})
      const parts: SQL[] = [fileScope(access)]
      if (q.status) parts.push(sql`f.status = ${q.status}`)
      if (q.currency) parts.push(sql`f.currency = ${q.currency}`)
      if (q.branchId) parts.push(sql`k.pickup_branch_id = ${q.branchId}`)
      if (q.q) {
        const t = `%${q.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`
        parts.push(sql`(lower(k.rental_no) like ${t} or lower(coalesce(c.customer_no, a.account_no)) like ${t} or lower(coalesce(a.legal_name, '')) like ${t})`)
      }
      const items = await fileItems(tx, sql.join(parts, sql` and `), 500)
      return { items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), total: items.length, page: q.page, pageSize: q.pageSize }
    }),
  )

  /** Everything waiting for a second person: payments, lines, deposits and returns. */
  app.get('/finance/pending', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const scope = fileScope(access)
      const payments = ((await tx.execute(sql`select ${PAYMENT_LIST_SELECT} where p.status = 'recorded' and ${scope} order by p.created_at limit 200`)).rows as Row[]).map(paymentListItem)
      const charges = ((await tx.execute(sql`select ${CHARGE_LIST_SELECT} where c.status in ('pending', 'reversal_requested') and ${scope} order by c.created_at limit 200`)).rows as Row[]).map((r) => ({ ...chargeOf(r), rental: { id: r.kx_id as string, no: r.kx_no as string } }))
      const depRows = (await tx.execute(sql`select d.id, k.id as rental_id, k.rental_no from finance_deposits d join rental_finances fx on fx.company_id = d.company_id and fx.id = d.finance_id join rentals k on k.company_id = fx.company_id and k.id = fx.rental_id
          where (d.status = 'reported' or d.in_review) and ${scope} order by d.created_at limit 200`)).rows as Row[]
      const deposits = depRows.length ? await depositsOf(tx, sql`d.id in ${depRows.map((r) => r.id as string)}`) : []
      const refRows = (await tx.execute(sql`select x.id, dd.id as deposit_id, dd.deposit_no, k.id as rental_id, k.rental_no from finance_deposit_refunds x join finance_deposits dd on dd.company_id = x.company_id and dd.id = x.deposit_id
          join rental_finances fx on fx.company_id = dd.company_id and fx.id = dd.finance_id join rentals k on k.company_id = fx.company_id and k.id = fx.rental_id
          where x.status in ('requested', 'approved') and ${scope} order by x.created_at limit 200`)).rows as Row[]
      const refunds = refRows.length ? ((await tx.execute(sql`select ${REFUND_SELECT} where f.id in ${refRows.map((r) => r.id as string)}`)).rows as Row[]) : []
      return {
        payments,
        charges,
        deposits: depRows.map((r) => ({ ...deposits.find((d) => d.id === r.id)!, rental: { id: r.rental_id as string, no: r.rental_no as string } })),
        refunds: refRows.map((r) => ({ ...refundOf(refunds.find((x) => x.id === r.id)!), deposit: { id: r.deposit_id as string, no: r.deposit_no as string }, rental: { id: r.rental_id as string, no: r.rental_no as string } })),
      }
    }),
  )

  /** Totals per currency (never summed across currencies), from real finance records only. */
  app.post('/finance/summary', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const q = financeListSchema.parse(req.body ?? {})
      return financeSummary(tx, access, { branchId: q.branchId, from: q.from, to: q.to })
    }),
  )

  app.post('/finance/events/search', async (req) =>
    withCompany(req, 'finance.reports.read', async (tx, access) => {
      const q = financeListSchema.parse(req.body ?? {})
      const parts: SQL[] = [fileScope(access)]
      if (q.status) parts.push(sql`e.entity_type = ${q.status}`)
      if (q.currency) parts.push(sql`e.currency = ${q.currency}`)
      if (q.from) parts.push(sql`e.at >= ${q.from}::date`)
      if (q.to) parts.push(sql`e.at < (${q.to}::date + 1)`)
      if (q.q) parts.push(sql`lower(k.rental_no) like ${`%${q.q.toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`)
      const where = sql.join(parts, sql` and `)
      const total = Number(((await tx.execute(sql`select count(*)::int n from finance_events e join rental_finances f on f.company_id = e.company_id and f.id = e.finance_id join rentals k on k.company_id = f.company_id and k.id = f.rental_id where ${where}`)).rows[0] as Row).n)
      const rows = (
        await tx.execute(sql`select e.*, u.name as actor_name, k.id as rental_id, k.rental_no, coalesce(c.charge_no, p.payment_no, d.deposit_no, r.refund_no) as entity_no
          from finance_events e join rental_finances f on f.company_id = e.company_id and f.id = e.finance_id join rentals k on k.company_id = f.company_id and k.id = f.rental_id
          left join users u on u.id = e.actor_user_id
          left join finance_charges c on e.entity_type = 'charge' and c.company_id = e.company_id and c.id = e.entity_id
          left join finance_payments p on e.entity_type = 'payment' and p.company_id = e.company_id and p.id = e.entity_id
          left join finance_deposits d on e.entity_type = 'deposit' and d.company_id = e.company_id and d.id = e.entity_id
          left join finance_deposit_refunds r on e.entity_type = 'refund' and r.company_id = e.company_id and r.id = e.entity_id
          where ${where} order by e.at ${q.sort === 'oldest' ? sql`asc` : sql`desc`}, e.id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)
      ).rows as Row[]
      return {
        items: rows.map((e) => ({
          id: e.id as string,
          rental: { id: e.rental_id as string, no: e.rental_no as string },
          entityType: e.entity_type,
          entityNo: e.entity_no ?? null,
          kind: e.kind,
          fromStatus: e.from_status ?? null,
          toStatus: e.to_status ?? null,
          amountMinor: e.amount_minor == null ? null : Number(e.amount_minor),
          currency: e.currency ?? null,
          actorName: e.actor_name ?? null,
          at: new Date(e.at as string).toISOString(),
        })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      }
    }),
  )

  // -------------------------------------------------------------------------
  // Customer and corporate account statements (cari görünüm): responsibility and payments kept apart.

  const partyView = async (tx: Tx, access: CompanyAccess, kind: 'customer' | 'corporate', id: string) => {
    const scope = fileScope(access)
    const files = await fileItems(tx, kind === 'customer' ? sql`${scope} and (f.responsible_customer_id = ${id} or k.customer_id = ${id})` : sql`${scope} and (f.responsible_corporate_id = ${id} or k.corporate_account_id = ${id})`)
    const paymentsAsPayer = (
      (await tx.execute(sql`select ${PAYMENT_LIST_SELECT}
          where ${kind === 'customer' ? sql`p.payer_customer_id = ${id} and fx.responsible_customer_id is distinct from ${id}` : sql`p.payer_corporate_id = ${id} and fx.responsible_corporate_id is distinct from ${id}`}
          and ${scope} order by p.received_at desc limit 100`)).rows as Row[]
    ).map(paymentListItem)
    const own = files.filter((f) => f.responsible.type === kind && f.responsible.id === id)
    const by = new Map<string, { currency: string; responsibleOutstandingMinor: number; postedMinor: number; verifiedMinor: number; recordedMinor: number; depositsHeldMinor: number }>()
    for (const f of own) {
      const t = by.get(f.totals.currency) ?? { currency: f.totals.currency, responsibleOutstandingMinor: 0, postedMinor: 0, verifiedMinor: 0, recordedMinor: 0, depositsHeldMinor: 0 }
      t.responsibleOutstandingMinor += f.totals.outstandingMinor
      t.postedMinor += f.totals.postedChargesMinor
      t.verifiedMinor += f.totals.verifiedPaymentsMinor
      t.recordedMinor += f.totals.recordedPaymentsMinor
      by.set(f.totals.currency, t)
      for (const h of f.depositsHeld) {
        const d = by.get(h.currency) ?? { currency: h.currency, responsibleOutstandingMinor: 0, postedMinor: 0, verifiedMinor: 0, recordedMinor: 0, depositsHeldMinor: 0 }
        d.depositsHeldMinor += h.minor
        by.set(h.currency, d)
      }
    }
    return { files, paymentsAsPayer, totals: [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency)) }
  }
  app.get('/customers/:id/finance', async (req) => {
    const id = parseId(req, 'Müşteri bulunamadı.')
    return withCompany(req, 'finance.read', async (tx, access) => {
      need(access, 'customers.read')
      if (!(await tx.execute(sql`select 1 from customers where id = ${id}`)).rows.length) throw notFound('Müşteri bulunamadı.')
      return partyView(tx, access, 'customer', id)
    })
  })
  app.get('/corporate-accounts/:id/finance', async (req) => {
    const id = parseId(req, 'Kurumsal hesap bulunamadı.')
    return withCompany(req, 'finance.read', async (tx, access) => {
      need(access, 'corporate.read')
      if (!(await tx.execute(sql`select 1 from corporate_accounts where id = ${id}`)).rows.length) throw notFound('Kurumsal hesap bulunamadı.')
      return partyView(tx, access, 'corporate', id)
    })
  })
}

