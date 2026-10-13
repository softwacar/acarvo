import { type Permission, type PriceListInput, priceListSchema, pricingPreviewSchema, quoteCreateSchema, quoteOptionsSchema, resolveWallTime } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { inScope } from '../vehicles/repository'
import { getPriceList, listPriceLists, nextNo, PRICE_LIST_NOT_FOUND, priceFor, type PricingTarget, QUOTE_SELECT, quoteOf } from './repository'

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
const invalid = (fields: Record<string, string>, message = 'Bazı alanlar geçersiz.') => new AppError(400, 'VALIDATION', message, fields)

/** Classes and branch of a list document must be this company's (RLS hides others: they look unknown). */
async function checkReferences(tx: Tx, doc: PriceListInput) {
  if (doc.branchId && !(await tx.execute(sql`select 1 from branches where id = ${doc.branchId}`)).rows.length) throw invalid({ branchId: 'Şube bulunamadı' })
  const classes = [...new Set([...doc.rates.map((r) => r.vehicleClassId), ...doc.seasons.map((s) => s.vehicleClassId).filter((x): x is string => !!x)])]
  if (classes.length) {
    const found = ((await tx.execute(sql`select id from vehicle_classes where id in ${classes}`)).rows as Row[]).map((r) => r.id as string)
    const missing = classes.filter((c) => !found.includes(c))
    if (missing.length) throw invalid({ rates: 'Araç sınıfı bulunamadı' })
  }
}

/** Writes revision `revision` of a list with all its parts (same transaction: the database seals them afterwards). */
async function writeRevision(tx: Tx, companyId: string, listId: string, revision: number, doc: PriceListInput, userId: string) {
  await tx.execute(sql`insert into price_list_revisions (company_id, price_list_id, revision, day_method, grace_minutes, min_days, tax_mode, tax_rate_bp, tax_label, note, created_by)
    values (${companyId}, ${listId}, ${revision}, ${doc.dayMethod}, ${doc.graceMinutes}, ${doc.minDays}, ${doc.taxMode}, ${doc.taxMode === 'not_configured' ? null : doc.taxRateBp},
      ${doc.taxMode === 'not_configured' ? null : (doc.taxLabel ?? null)}, ${doc.note ?? null}, ${userId})`)
  for (const r of doc.rates) {
    await tx.execute(sql`insert into price_list_rates (company_id, price_list_id, revision, vehicle_class_id, rate_1_6_minor, rate_7_29_minor, rate_30_plus_minor)
      values (${companyId}, ${listId}, ${revision}, ${r.vehicleClassId}, ${r.rate1to6}, ${r.rate7to29 ?? null}, ${r.rate30plus ?? null})`)
  }
  for (const s of doc.seasons) {
    await tx.execute(sql`insert into price_list_seasons (company_id, price_list_id, revision, name, start_date, end_date, vehicle_class_id, percent_bp, priority, active)
      values (${companyId}, ${listId}, ${revision}, ${s.name}, ${s.startDate}, ${s.endDate}, ${s.vehicleClassId ?? null}, ${s.percentBp}, ${s.priority}, ${s.active})`)
  }
  for (const e of doc.extras) {
    await tx.execute(sql`insert into price_list_extras (company_id, price_list_id, revision, code, name, kind, mode, price_minor, max_quantity, taxable, active)
      values (${companyId}, ${listId}, ${revision}, ${e.code}, ${e.name}, ${e.kind}, ${e.mode}, ${e.priceMinor}, ${e.maxQuantity}, ${e.taxable}, ${e.active})`)
  }
  for (const d of doc.discounts) {
    await tx.execute(sql`insert into price_list_discounts (company_id, price_list_id, revision, name, type, value, min_days, active)
      values (${companyId}, ${listId}, ${revision}, ${d.name}, ${d.type}, ${d.value}, ${d.minDays}, ${d.active})`)
  }
}

/** What changed, without prices of other parties or personal data: counts and header fields. */
const docSummary = (doc: PriceListInput) => ({
  currency: doc.currency,
  dayMethod: doc.dayMethod,
  graceMinutes: doc.graceMinutes,
  minDays: doc.minDays,
  taxMode: doc.taxMode,
  taxRateBp: doc.taxMode === 'not_configured' ? null : doc.taxRateBp,
  rates: doc.rates.length,
  seasons: doc.seasons.length,
  extras: doc.extras.length,
  discounts: doc.discounts.length,
})

function mapGuard(e: unknown): never {
  if (e instanceof AppError) throw e
  const pg = ((e as { cause?: unknown }).cause ?? e) as { constraint?: string }
  const c = pg.constraint
  if (c === 'price_lists_rates_required') throw new AppError(409, 'RATES_REQUIRED', 'Etkinleştirmek için en az bir araç sınıfı tarifesi gerekli.')
  if (c === 'price_lists_lifecycle' || c === 'price_lists_final') throw new AppError(409, 'INVALID_TRANSITION', 'Fiyat listesinin durumu bu işleme izin vermiyor.')
  if (c === 'price_list_revisions_sequence' || c === 'price_list_revisions_key') throw new AppError(409, 'VERSION_CONFLICT', 'Fiyat listesi bu arada değişti. Sayfayı yenileyin.')
  if (c === 'price_quotes_price_list') throw new AppError(409, 'PRICE_CHANGED', 'Fiyat listesi bu arada değişti; teklifi yeniden hesaplayın.')
  if (c === 'price_quotes_target') throw new AppError(409, 'TARGET_CHANGED', 'Kaydın planı veya durumu bu arada değişti; teklifi yeniden hesaplayın.')
  if (c === 'price_quotes_request_key' || c === 'price_quotes_reservation_current_key' || c === 'price_quotes_rental_current_key') throw new AppError(409, 'REQUEST_REPLAY', 'Bu istek zaten işlendi.')
  throw e
}

/** Reservation or rental the quote is for: scope, plan and class, locked (one quote change at a time per target). */
async function lockTarget(tx: Tx, access: CompanyAccess, kind: 'reservation' | 'rental', id: string) {
  const r = (
    kind === 'reservation'
      ? await tx.execute(sql`select r.id, r.reservation_no as no, r.status, r.vehicle_class_id, r.pickup_at, r.return_at, r.pickup_timezone, r.pickup_branch_id, r.return_branch_id, null::uuid as actual_return_branch_id,
            (select count(*)::int from reservation_drivers d where d.company_id = r.company_id and d.reservation_id = r.id and d.removed_at is null) as drivers
          from reservations r where r.id = ${id} for update of r`)
      : await tx.execute(sql`select k.id, k.rental_no as no, k.status, k.vehicle_class_id, k.planned_pickup_at as pickup_at, k.planned_return_at as return_at, k.pickup_timezone, k.pickup_branch_id, k.return_branch_id, k.actual_return_branch_id,
            (select count(*)::int from rental_drivers d where d.company_id = k.company_id and d.rental_id = k.id and d.removed_at is null) as drivers
          from rentals k where k.id = ${id} for update of k`)
  ).rows[0] as Row | undefined
  const visible = r && [r.pickup_branch_id, r.return_branch_id, r.actual_return_branch_id].some((b) => b && inScope(access, b as string))
  if (!r || !visible) throw notFound(kind === 'reservation' ? 'Rezervasyon bulunamadı veya bu rezervasyona erişim yetkiniz yok.' : 'Kiralama bulunamadı veya bu kiralamaya erişim yetkiniz yok.')
  const target: PricingTarget = {
    vehicleClassId: r.vehicle_class_id as string,
    pickupAt: toIso(r.pickup_at),
    returnAt: toIso(r.return_at),
    pickupTimeZone: r.pickup_timezone as string,
    pickupBranchId: r.pickup_branch_id as string,
    additionalDrivers: Math.max(0, Number(r.drivers) - 1),
  }
  return { row: r, target }
}

const openStatus = { reservation: ['pending', 'confirmed'], rental: ['prepared', 'delivered'] }

export async function pricingRoutes(app: FastifyInstance) {
  app.get('/price-lists', async (req) => withCompany(req, 'pricing.read', async (tx) => ({ items: await listPriceLists(tx) })))

  app.get('/price-lists/:id', async (req) => {
    const id = parseId(req, PRICE_LIST_NOT_FOUND)
    const rev = Number((req.query as { revision?: string }).revision)
    return withCompany(req, 'pricing.read', async (tx) => (await getPriceList(tx, id, Number.isInteger(rev) && rev > 0 ? rev : undefined)) ?? Promise.reject(notFound(PRICE_LIST_NOT_FOUND)))
  })

  /** Revisions of a list: when, by whom, what kind of rules (each one stays readable). */
  app.get('/price-lists/:id/history', async (req) => {
    const id = parseId(req, PRICE_LIST_NOT_FOUND)
    return withCompany(req, 'pricing.read', async (tx) => {
      const rows = (
        await tx.execute(sql`select r.revision, r.created_at, r.day_method, r.tax_mode, r.tax_rate_bp, u.name as created_by_name,
            (select count(*)::int from price_list_rates x where x.company_id = r.company_id and x.price_list_id = r.price_list_id and x.revision = r.revision) as rates,
            (select count(*)::int from price_list_seasons x where x.company_id = r.company_id and x.price_list_id = r.price_list_id and x.revision = r.revision) as seasons,
            (select count(*)::int from price_list_extras x where x.company_id = r.company_id and x.price_list_id = r.price_list_id and x.revision = r.revision) as extras,
            (select count(*)::int from price_list_discounts x where x.company_id = r.company_id and x.price_list_id = r.price_list_id and x.revision = r.revision) as discounts,
            (select count(*)::int from price_quotes q where q.company_id = r.company_id and q.price_list_id = r.price_list_id and q.price_list_revision = r.revision) as quotes
          from price_list_revisions r left join users u on u.id = r.created_by where r.price_list_id = ${id} order by r.revision desc`)
      ).rows as Row[]
      if (!rows.length) throw notFound(PRICE_LIST_NOT_FOUND)
      const events = (
        await tx.execute(sql`select a.action, a.summary, a.created_at, u.name as actor_name from audit_log a left join users u on u.id = a.actor_user_id
          where a.entity = 'price_list' and a.entity_id = ${id} order by a.created_at desc limit 200`)
      ).rows as Row[]
      return {
        revisions: rows.map((r) => ({
          revision: Number(r.revision),
          createdAt: toIso(r.created_at),
          createdByName: (r.created_by_name as string) ?? null,
          dayMethod: r.day_method,
          taxMode: r.tax_mode,
          taxRateBp: r.tax_rate_bp == null ? null : Number(r.tax_rate_bp),
          counts: { rates: Number(r.rates), seasons: Number(r.seasons), extras: Number(r.extras), discounts: Number(r.discounts), quotes: Number(r.quotes) },
        })),
        events: events.map((e) => ({ action: e.action as string, summary: e.summary, at: toIso(e.created_at), actorName: (e.actor_name as string) ?? null })),
      }
    })
  })

  app.post('/price-lists', async (req, reply) => {
    const created = await withCompany(req, 'pricing.manage', async (tx, access) => {
      const doc = priceListSchema.parse(req.body)
      await checkReferences(tx, doc)
      const userId = req.auth!.user.id
      const row = (
        await tx.execute(sql`insert into price_lists (company_id, name, currency, branch_id, valid_from, valid_until, priority, created_by, updated_by)
          values (${access.companyId}, ${doc.name}, ${doc.currency}, ${doc.branchId ?? null}, ${doc.validFrom ?? null}, ${doc.validUntil ?? null}, ${doc.priority}, ${userId}, ${userId}) returning id`)
      ).rows[0] as Row
      await writeRevision(tx, access.companyId, row.id as string, 1, doc, userId).catch(mapGuard)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'price_list.create', entity: 'price_list', entityId: row.id as string, summary: { name: doc.name, revision: 1, ...docSummary(doc) } })
      return getPriceList(tx, row.id as string)
    })
    return reply.code(201).send(created)
  })

  /** Saves the whole list as a new revision (version-checked); quotes on older revisions keep theirs. */
  app.put('/price-lists/:id', async (req) => {
    const id = parseId(req, PRICE_LIST_NOT_FOUND)
    return withCompany(req, 'pricing.manage', async (tx, access) => {
      const body = req.body as { version?: number }
      const doc = priceListSchema.parse(req.body)
      const cur = (await tx.execute(sql`select * from price_lists where id = ${id} for update`)).rows[0] as Row | undefined
      if (!cur) throw notFound(PRICE_LIST_NOT_FOUND)
      if (cur.version !== body.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu fiyat listesi siz düzenlerken başka bir kullanıcı tarafından değiştirildi.', undefined, { current: await getPriceList(tx, id) })
      if (cur.status === 'archived') throw new AppError(409, 'INVALID_TRANSITION', 'Arşivdeki fiyat listesi değiştirilemez.')
      if (doc.currency !== cur.currency) throw invalid({ currency: 'Para birimi liste oluşturulduktan sonra değişmez; yeni liste açın' })
      await checkReferences(tx, doc)
      const userId = req.auth!.user.id
      const next = Number(cur.current_revision) + 1
      await writeRevision(tx, access.companyId, id, next, doc, userId).catch(mapGuard)
      await tx
        .execute(sql`update price_lists set name = ${doc.name}, branch_id = ${doc.branchId ?? null}, valid_from = ${doc.validFrom ?? null}, valid_until = ${doc.validUntil ?? null},
          priority = ${doc.priority}, current_revision = ${next}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
        .catch(mapGuard)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'price_list.revise', entity: 'price_list', entityId: id, summary: { name: doc.name, fromRevision: next - 1, revision: next, ...docSummary(doc) } })
      return getPriceList(tx, id)
    })
  })

  for (const [path, status, action] of [
    ['activate', 'active', 'price_list.activate'],
    ['archive', 'archived', 'price_list.archive'],
  ] as const) {
    app.post(`/price-lists/:id/${path}`, async (req) => {
      const id = parseId(req, PRICE_LIST_NOT_FOUND)
      return withCompany(req, 'pricing.manage', async (tx, access) => {
        const { version } = z.object({ version: z.number().int().min(1) }).parse(req.body)
        const cur = (await tx.execute(sql`select * from price_lists where id = ${id} for update`)).rows[0] as Row | undefined
        if (!cur) throw notFound(PRICE_LIST_NOT_FOUND)
        if (cur.version !== version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu fiyat listesi bu arada değişti. Sayfayı yenileyin.', undefined, { current: await getPriceList(tx, id) })
        if (cur.status === status) return getPriceList(tx, id)
        const userId = req.auth!.user.id
        await tx.execute(sql`update price_lists set status = ${status}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`).catch(mapGuard)
        await audit(tx, { companyId: access.companyId, actorUserId: userId, action, entity: 'price_list', entityId: id, summary: { name: cur.name, revision: cur.current_revision, fromStatus: cur.status } })
        return getPriceList(tx, id)
      })
    })
  }

  /** Free preview on the pricing screen (nothing stored): any class, branch and period, in the branch's own time. */
  app.post('/preview', async (req) =>
    withCompany(req, 'pricing.read', async (tx) => {
      const input = pricingPreviewSchema.parse(req.body)
      const branch = async (bid: string) => (await tx.execute(sql`select id, name, timezone from branches where id = ${bid}`)).rows[0] as Row | undefined
      const [pb, rb] = [await branch(input.pickupBranchId), await branch(input.returnBranchId)]
      if (!pb) throw invalid({ pickupBranchId: 'Şube bulunamadı' })
      if (!rb) throw invalid({ returnBranchId: 'Şube bulunamadı' })
      const resolve = (local: string, tz: string, choice: 'earlier' | 'later' | undefined, field: string) => {
        const r = resolveWallTime(local, tz)
        if (!r) throw invalid({ [field]: 'Geçerli bir tarih ve saat girin' })
        if (r.kind === 'nonexistent') throw invalid({ [field]: 'Bu saat yaz saatine geçişte yaşanmadı. Gerçek saati girin.' })
        if (r.kind === 'ambiguous') {
          if (!choice) throw new AppError(400, 'AMBIGUOUS_TIME', 'Bu saat kış saatine geçişte iki kez yaşandı. Hangisi olduğunu seçin.', { [field]: 'Saatin hangisi olduğunu seçin' }, { field, earlier: r.earlier, later: r.later })
          return r[choice].iso
        }
        return r.iso
      }
      const pickupAt = resolve(input.pickupLocal, pb.timezone as string, input.pickupChoice, 'pickupLocal')
      const returnAt = resolve(input.returnLocal, rb.timezone as string, input.returnChoice, 'returnLocal')
      if (Date.parse(returnAt) <= Date.parse(pickupAt)) throw invalid({ returnLocal: 'İade, alıştan sonra olmalı' })
      const r = await priceFor(tx, { vehicleClassId: input.vehicleClassId, pickupAt, returnAt, pickupTimeZone: pb.timezone as string, pickupBranchId: pb.id as string, additionalDrivers: input.additionalDrivers }, input)
      const { engineInput, ...result } = r
      void engineInput
      return result
    }),
  )
}

/** Quotes of reservations and rentals: preview (nothing stored), save (idempotent, 409 if the price changed), list. */
export async function quoteRoutes(app: FastifyInstance) {
  for (const kind of ['reservation', 'rental'] as const) {
    const base = kind === 'reservation' ? '/reservations/:id/quotes' : '/rentals/:id/quotes'
    const readPerm: Permission = kind === 'reservation' ? 'reservations.read' : 'rentals.read'
    const notFoundMsg = kind === 'reservation' ? 'Rezervasyon bulunamadı.' : 'Kiralama bulunamadı.'

    app.post(`${base}/preview`, async (req) => {
      const id = parseId(req, notFoundMsg)
      return withCompany(req, 'pricing.read', async (tx, access) => {
        need(access, readPerm)
        const options = quoteOptionsSchema.parse(req.body ?? {})
        const { target } = await lockTarget(tx, access, kind, id)
        const { engineInput, ...result } = await priceFor(tx, target, options)
        void engineInput
        return result
      })
    })

    app.get(base, async (req) => {
      const id = parseId(req, notFoundMsg)
      return withCompany(req, 'pricing.read', async (tx, access) => {
        need(access, readPerm)
        const { row } = await lockTarget(tx, access, kind, id)
        const reservationId = kind === 'rental' ? ((await tx.execute(sql`select reservation_id from rentals where id = ${id}`)).rows[0] as Row).reservation_id : null
        const rows = (
          await tx.execute(sql`select ${QUOTE_SELECT} where ${kind === 'reservation' ? sql`q.reservation_id = ${id}` : sql`(q.rental_id = ${id} ${reservationId ? sql`or q.reservation_id = ${reservationId as string}` : sql``})`}
            order by q.created_at desc limit 100`)
        ).rows as Row[]
        void row
        return { items: rows.map(quoteOf) }
      })
    })

    app.post(base, async (req, reply) => {
      const id = parseId(req, notFoundMsg)
      const input = quoteCreateSchema.parse(req.body)
      const out = await withCompany(req, 'pricing.quote', async (tx, access) => {
        need(access, readPerm)
        const { row, target } = await lockTarget(tx, access, kind, id)
        const replay = (await tx.execute(sql`select ${QUOTE_SELECT} where q.client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
        if (replay) {
          if ((kind === 'reservation' ? replay.reservation_id : replay.rental_id) !== id) throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim başka bir kayıt için kullanıldı. Sayfayı yenileyin.')
          return { replay: true, body: quoteOf(replay) }
        }
        if (!openStatus[kind].includes(row.status as string)) throw new AppError(409, 'TARGET_CLOSED', 'Bu kayıt için artık teklif oluşturulamaz.')
        if (!inScope(access, row.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin kaydına teklif oluşturma yetkiniz yok.')
        const result = await priceFor(tx, target, input)
        if (!result.ok || !result.engineInput) throw new AppError(409, 'PRICING_UNAVAILABLE', 'Fiyat hesaplanamadı.', undefined, { result: { ...result, engineInput: undefined } })
        if (result.netMinor !== input.expectedNetMinor || result.grossMinor !== input.expectedGrossMinor) {
          throw new AppError(409, 'PRICE_CHANGED', 'Fiyat siz bakarken değişti. Yeni fiyatı kontrol edip onaylayın.', undefined, { result: { ...result, engineInput: undefined } })
        }
        const userId = req.auth!.user.id
        const newId = ((await tx.execute(sql`select gen_random_uuid() as id`)).rows[0] as Row).id as string
        const previous = (await tx.execute(sql`select id, quote_no from price_quotes where status = 'quoted' and ${kind === 'reservation' ? sql`reservation_id` : sql`rental_id`} = ${id} for update`)).rows[0] as Row | undefined
        if (previous) await tx.execute(sql`update price_quotes set status = 'superseded', superseded_at = now(), superseded_by_id = ${newId} where id = ${previous.id as string}`).catch(mapGuard)
        const quoteNo = await nextNo(tx, access.companyId, 'price_quote', 'Q')
        await tx
          .execute(sql`insert into price_quotes (id, company_id, quote_no, ${kind === 'reservation' ? sql`reservation_id` : sql`rental_id`}, price_list_id, price_list_revision, currency, vehicle_class_id,
              pickup_at, return_at, pickup_timezone, days, tier, day_method, inputs, lines, net_minor, tax_minor, gross_minor, tax_status, engine_version, client_request_id, created_by)
            values (${newId}, ${access.companyId}, ${quoteNo}, ${id}, ${result.priceList!.id}, ${result.priceList!.revision}, ${result.currency}, ${target.vehicleClassId},
              ${target.pickupAt}, ${target.returnAt}, ${target.pickupTimeZone}, ${result.days}, ${result.tier}, ${result.dayMethod},
              ${JSON.stringify({ selectedExtras: input.selectedExtras, discountId: input.discountId ?? null, additionalDrivers: target.additionalDrivers })}::jsonb,
              ${JSON.stringify(result.lines)}::jsonb, ${result.netMinor}, ${result.taxMinor}, ${result.grossMinor}, ${result.taxStatus}, ${result.engineVersion}, ${input.requestId}, ${userId})`)
          .catch(mapGuard)
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'price_quote.create',
          entity: kind,
          entityId: id,
          summary: { quoteNo, target: row.no, supersedes: previous?.quote_no ?? null, priceList: result.priceList!.name, revision: result.priceList!.revision, currency: result.currency, days: result.days, netMinor: result.netMinor, taxStatus: result.taxStatus },
        })
        return { replay: false, body: quoteOf((await tx.execute(sql`select ${QUOTE_SELECT} where q.id = ${newId}`)).rows[0] as Row) }
      })
      return reply.code(out.replay ? 200 : 201).send(out.body)
    })
  }
}
