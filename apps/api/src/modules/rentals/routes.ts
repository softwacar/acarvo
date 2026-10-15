import {
  allocationConflictText,
  CHECKLIST_ITEMS,
  HANDOVER_BACKDATE_HOURS,
  inspectionDraftSchema,
  type Permission,
  RENTAL_MAX_DAYS,
  RESERVATION_PAST_TOLERANCE_MINUTES,
  RETURN_BACKDATE_HOURS,
  rentalAvailabilitySchema,
  rentalCancelSchema,
  rentalCloseSchema,
  rentalCreateSchema,
  rentalDeliverSchema,
  rentalDocumentCheckSchema,
  rentalExtendSchema,
  rentalFromReservationSchema,
  type RentalInput,
  rentalReturnSchema,
  rentalSearchSchema,
  rentalUpdateSchema,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { actualTime, branchRow, resolveLocal } from '../../lib/branch-time'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { processPromoPhoto } from '../../lib/images'
import { documentUploadPolicy } from '../../lib/malware'
import { assertOdometer } from '../../lib/odometer-check'
import { toIso } from '../../lib/timestamps'
import { lockVehicleAllocation, vehicleBusy } from '../../lib/vehicle-allocation'
import { withCompany } from '../../plugins/auth'
import { UPLOAD_RATE_LIMIT } from '../../plugins/security'
import type { CompanyAccess } from '../auth/context'
import { CUSTOMER_NOT_FOUND } from '../customers/repository'
import { availability, moment } from '../reservations/repository'
import { inScope } from '../vehicles/repository'
import {
  activeDrivers,
  activePolicy,
  closeGates,
  deliveryGates,
  getRental,
  listRentals,
  loadInspection,
  newFindings,
  nextRentalNo,
  periodDocuments,
  relatedRentals,
  RENTAL_NOT_FOUND,
  rentalActivity,
  rentalCore,
  uncoveredItems,
} from './repository'

type Row = Record<string, unknown>

const idParams = z.object({ id: z.uuid() })
const kindParams = z.object({ id: z.uuid(), kind: z.enum(['handover', 'return']) })
const photoParams = z.object({ id: z.uuid(), kind: z.enum(['handover', 'return']).optional(), photoId: z.uuid() })
const parseId = (req: FastifyRequest, message = RENTAL_NOT_FOUND) => {
  const p = idParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data.id
}
const need = (access: CompanyAccess, permission: Permission) => {
  if (!access.permissions.has(permission)) throw forbidden()
}
const invalid = (fields: Record<string, string>, message = 'Bazı alanlar geçersiz.') => new AppError(400, 'VALIDATION', message, fields)
const kmText = (n: number) => `${n.toLocaleString('tr-TR')} km`

const branch = branchRow

async function resolvePlan(
  tx: Tx,
  access: CompanyAccess,
  input: { pickupBranchId: string; returnBranchId: string; pickupLocal: string; returnLocal: string; pickupChoice?: 'earlier' | 'later'; returnChoice?: 'earlier' | 'later' },
  opts: { checkPast: boolean; requireScope: boolean },
) {
  const [pb, rb] = [await branch(tx, input.pickupBranchId), await branch(tx, input.returnBranchId)]
  if (!pb || pb.status !== 'active') throw invalid({ pickupBranchId: 'Başlangıç şubesi bulunamadı' })
  if (!rb || rb.status !== 'active') throw invalid({ returnBranchId: 'İade şubesi bulunamadı' })
  if (opts.requireScope && !inScope(access, pb.id)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubede kiralama hazırlama veya değiştirme yetkiniz yok.', { pickupBranchId: 'Bu şube için yetkiniz yok' })
  const pickupAt = resolveLocal(input.pickupLocal, pb, input.pickupChoice, 'pickupLocal', 'pickupChoice')
  const returnAt = resolveLocal(input.returnLocal, rb, input.returnChoice, 'returnLocal', 'returnChoice')
  if (Date.parse(returnAt) <= Date.parse(pickupAt)) throw invalid({ returnLocal: 'İade, alıştan sonra olmalı' })
  if (Date.parse(returnAt) - Date.parse(pickupAt) > RENTAL_MAX_DAYS * 86_400_000) throw invalid({ returnLocal: `Bir kiralama en fazla ${RENTAL_MAX_DAYS} gün olabilir` })
  if (opts.checkPast && Date.parse(pickupAt) < Date.now() - RESERVATION_PAST_TOLERANCE_MINUTES * 60_000) throw invalid({ pickupLocal: 'Alış zamanı geçmişte olamaz' })
  return { pickupAt, returnAt, pickupBranch: pb, returnBranch: rb }
}

async function activeCustomer(tx: Tx, id: string, field: string, allowArchivedIfUnchanged: boolean) {
  const r = (await tx.execute(sql`select id, customer_no, status from customers where id = ${id}`)).rows[0] as Row | undefined
  if (!r || (r.status !== 'active' && r.status !== 'archived')) throw new AppError(404, 'NOT_FOUND', CUSTOMER_NOT_FOUND, { [field]: 'Kişi bulunamadı' })
  if (r.status === 'archived' && !allowArchivedIfUnchanged) throw new AppError(409, 'CUSTOMER_ARCHIVED', 'Arşivdeki müşteri kiralamaya eklenemez. Önce müşteriyi arşivden çıkarın.', { [field]: 'Müşteri arşivde' })
  return { id: r.id as string, customerNo: r.customer_no as string }
}

/** Parties, class and vehicle of the input, checked against this company (RLS hides other companies' rows: 404). */
async function resolveParties(tx: Tx, input: RentalInput, current?: Row) {
  const same = (col: string, v: unknown) => !!current && String(current[col] ?? '') === String(v ?? '')
  const customer = await activeCustomer(tx, input.customerId, 'customerId', same('customer_id', input.customerId))
  const currentDrivers = current ? (await activeDrivers(tx, current.id as string)).map((d) => d.id) : []
  const drivers: { id: string; customerNo: string; isPrimary: boolean }[] = []
  for (const [i, d] of input.drivers.entries()) {
    const c = await activeCustomer(tx, d.customerId, `drivers.${i}.customerId`, currentDrivers.includes(d.customerId))
    drivers.push({ ...c, isPrimary: !!d.isPrimary })
  }
  let account: { id: string; accountNo: string } | null = null
  if (input.corporateAccountId) {
    const a = (await tx.execute(sql`select id, account_no, status from corporate_accounts where id = ${input.corporateAccountId}`)).rows[0] as Row | undefined
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Kurumsal hesap bulunamadı.', { corporateAccountId: 'Kurumsal hesap bulunamadı' })
    if (a.status !== 'active' && !same('corporate_account_id', input.corporateAccountId)) throw new AppError(409, 'ACCOUNT_ARCHIVED', 'Arşivdeki kurumsal hesap kiralamaya bağlanamaz.', { corporateAccountId: 'Kurumsal hesap arşivde' })
    account = { id: a.id as string, accountNo: a.account_no as string }
  }
  const cls = (await tx.execute(sql`select id, name from vehicle_classes where id = ${input.vehicleClassId}`)).rows[0] as Row | undefined
  if (!cls) throw invalid({ vehicleClassId: 'Araç sınıfı bulunamadı' })
  const v = (await tx.execute(sql`select id, plate, status, class_id from vehicles where id = ${input.vehicleId}`)).rows[0] as Row | undefined
  if (!v || v.status === 'sold' || v.status === 'disposed') throw invalid({ vehicleId: 'Araç bulunamadı veya filoda değil' })
  if (v.class_id !== input.vehicleClassId) throw invalid({ vehicleId: 'Araç seçilen sınıftan değil' })
  const vehicle = { id: v.id as string, plate: v.plate as string, status: v.status as string }
  return { customer, drivers, account, cls: { id: cls.id as string, name: cls.name as string }, vehicle }
}

/** Friendly 409 from the shared allocation truth; the database guard is the final word under the same lock. */
async function assertVehicleFree(tx: Tx, companyId: string, vehicle: { id: string; plate: string; status: string }, from: string, to: string, except: { reservationId?: string | null; rentalId?: string | null }) {
  await lockVehicleAllocation(tx, companyId, vehicle.id)
  if (vehicle.status !== 'active') throw new AppError(409, 'VEHICLE_NOT_ACTIVE', `${vehicle.plate} şu anda hizmet dışı; kiralanamaz.`, { vehicleId: 'Araç hizmet dışı' })
  const conflicts = await vehicleBusy(tx, companyId, vehicle.id, from, to, except)
  if (conflicts.length) {
    throw new AppError(409, 'VEHICLE_UNAVAILABLE', `${vehicle.plate} bu dönemde dolu: ${conflicts.map(allocationConflictText).join(', ')}.`, { vehicleId: 'Araç bu dönemde dolu' }, { conflicts })
  }
}

/** Database guards end as the same answers (concurrent saves, direct changes). */
function mapGuard(e: unknown): never {
  if (e instanceof AppError) throw e
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string; message?: string }
  const c = pg.constraint
  if (c === 'rentals_vehicle_reserved' || c === 'rentals_vehicle_overlap') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde başka bir rezervasyonda veya kiralamada.', { vehicleId: 'Araç bu dönemde dolu' })
  if (c === 'rentals_vehicle_maintenance') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde bakımda veya bakım için planlanmış.', { vehicleId: 'Araç bu dönemde bakımda' })
  if (c === 'rentals_vehicle_damage') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bir hasar nedeniyle kullanılamaz olarak işaretli; kiralanamaz veya teslim edilemez.', { vehicleId: 'Araç hasar nedeniyle kullanılamaz' })
  if (c === 'rentals_vehicle_transfer') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde şubeler arası transferde.', { vehicleId: 'Araç bu dönemde transferde' })
  if (c === 'rentals_vehicle_transfer_location')
    throw new AppError(409, 'VEHICLE_ELSEWHERE', 'Onaylı bir transfer aracı alıştan önce başka bir şubeye götürüyor; bu şubeden kiralama hazırlanamaz.', { vehicleId: 'Araç alış zamanında başka şubede olacak' })
  if (c === 'rentals_vehicle_not_active') throw new AppError(409, 'VEHICLE_NOT_ACTIVE', 'Araç hizmet dışı; kiralanamaz veya teslim edilemez.', { vehicleId: 'Araç hizmet dışı' })
  if (c === 'rentals_vehicle_class') throw invalid({ vehicleId: 'Araç seçilen sınıftan değil' })
  if (c === 'rentals_lifecycle' || c === 'rentals_final' || c === 'reservations_lifecycle' || c === 'reservations_final') throw new AppError(409, 'INVALID_TRANSITION', 'Kaydın durumu bu işleme izin vermiyor.')
  if (c === 'rentals_handover_evidence' || c === 'rentals_return_evidence' || c === 'rentals_close_evidence' || c === 'rental_inspections_history')
    throw new AppError(409, 'EVIDENCE_MISSING', 'Gerekli teslim/iade kaydı tamamlanmadan bu işlem yapılamaz.')
  if (c === 'rental_inspections_photos') throw new AppError(409, 'PHOTOS_REQUIRED', 'En az 4, en fazla 5 fotoğraf gerekli.')
  if (c === 'rental_inspection_photos_limit') throw new AppError(409, 'PHOTO_LIMIT', 'Bir kontrolde en fazla 5 fotoğraf olabilir.')
  if (c === 'rental_inspection_photos_frozen' || c === 'rental_damage_marks_frozen' || c === 'rental_inspections_final' || c === 'rental_inspections_window')
    throw new AppError(409, 'INSPECTION_CLOSED', 'Bu kontrol kesinleşmiş veya bu aşamada değiştirilemez.')
  if (c === 'rental_inspections_counterpart') throw invalid({ counterpartCustomerId: 'Kiralamanın sürücülerinden birini seçin' })
  if (c === 'rental_damage_marks_photo') throw invalid({ marks: 'İşaretin fotoğrafı bu kontrole ait değil' })
  if (c === 'rental_damage_marks_existing') throw invalid({ marks: 'İşaret yalnız bu kiralamanın teslim işaretine bağlanabilir' })
  if (c === 'rental_drivers_frozen' || c === 'rental_document_checks_frozen') throw new AppError(409, 'RENTAL_NOT_PREPARED', 'Teslimden sonra sürücüler ve belge kararları değiştirilemez.')
  if (c === 'odometer_chronology') throw new AppError(422, 'ODOMETER_OUT_OF_ORDER', 'Kilometre aracın kayıtlı km geçmişiyle çelişiyor (geriye gidemez).', { km: 'Kilometre geçmişle çelişiyor' })
  if (c === 'odometer_future' || c === 'location_future') throw invalid({ time: 'Gerçekleşen zaman gelecekte olamaz' })
  if (c === 'rentals_external_terms_mode') throw new AppError(409, 'EXTERNAL_TERMS_MODE_OFF', 'Dış sözleşme ve fiyat modu kapalı; ACARVO’da sözleşme ve fiyat modülü olmadığı için teslim yapılamaz.')
  if (c === 'rentals_external_terms_statement') throw invalid({ externalReference: 'İki beyan ve dış referans gerekli' }, 'Teslim için iki beyan ve dış referans gerekli.')
  if (c === 'rentals_external_reference_check') throw invalid({ externalReference: 'Yalnız harf, rakam, boşluk ve . / _ - kullanın' })
  if (c === 'rentals_branch_country') throw new AppError(409, 'BRANCH_COUNTRY_MISSING', 'Başlangıç şubesinin ülkesi tanımlı değil; teslim yapılamaz.')
  if (c === 'rentals_document_decision') throw new AppError(409, 'DOCUMENT_DECISION_REQUIRED', 'Her sürücü için güncel ve uygun belge kararı olmadan teslim yapılamaz.')
  if (c === 'rental_inspections_incomplete') throw new AppError(409, 'INSPECTION_INCOMPLETE', 'Kontrol eksik: temizlik, genel durum ve kontrol listesinin her maddesi yanıtlanmalı.')
  if (c === 'rental_inspections_checklist') throw invalid({ checklist: 'Geçersiz kontrol listesi maddesi veya yanıtı' })
  if (c === 'rentals_reservation_key') throw new AppError(409, 'ALREADY_CONVERTED', 'Bu rezervasyondan zaten bir kiralama oluşturulmuş.')
  if (c === 'rentals_request_key' || c === 'rental_events_request_key') throw new AppError(409, 'REQUEST_REPLAY', 'Bu istek zaten işlendi.')
  if (c === 'rental_inspections_kind_key') throw new AppError(409, 'INSPECTION_CONFLICT', 'Bu kontrol başka bir kullanıcı tarafından başlatıldı. Sayfayı yenileyin.')
  throw e
}
const guarded = <T>(p: Promise<T>) => p.catch(mapGuard)

async function setDrivers(tx: Tx, access: CompanyAccess, rentalId: string, userId: string, drivers: { id: string; isPrimary: boolean }[]) {
  const current = (await tx.execute(sql`select id, customer_id, is_primary from rental_drivers where rental_id = ${rentalId} and removed_at is null`)).rows as Row[]
  const wanted = new Map(drivers.map((d) => [d.id, d.isPrimary]))
  for (const c of current) {
    if (!wanted.has(c.customer_id as string) || wanted.get(c.customer_id as string) !== c.is_primary) {
      await guarded(tx.execute(sql`update rental_drivers set removed_at = now(), removed_by = ${userId}, is_primary = false where id = ${c.id as string}`))
    }
  }
  for (const d of drivers) {
    if (!current.find((c) => c.customer_id === d.id && c.is_primary === d.isPrimary)) {
      await guarded(tx.execute(sql`insert into rental_drivers (company_id, rental_id, customer_id, is_primary, created_by) values (${access.companyId}, ${rentalId}, ${d.id}, ${d.isPrimary}, ${userId})`))
    }
  }
}

async function addEvent(
  tx: Tx,
  access: CompanyAccess,
  rentalId: string,
  kind: string,
  from: string | null,
  to: string,
  userId: string,
  extra: { reason?: string | null; data?: Record<string, unknown>; requestId?: string | null } = {},
) {
  await guarded(
    tx.execute(sql`insert into rental_events (company_id, rental_id, kind, from_status, to_status, reason, data, client_request_id, actor_user_id)
      values (${access.companyId}, ${rentalId}, ${kind}, ${from}, ${to}, ${extra.reason ?? null}, ${extra.data ? JSON.stringify(extra.data) : null}::jsonb, ${extra.requestId ?? null}, ${userId})`),
  )
}

/** A request id already used: the same rental returns its current state; another rental is a client error. */
async function replayOf(tx: Tx, requestId: string, rentalId: string) {
  const r = (await tx.execute(sql`select rental_id from rental_events where client_request_id = ${requestId}`)).rows[0] as Row | undefined
  if (!r) return false
  if (r.rental_id !== rentalId) throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim başka bir kiralama için kullanıldı. Sayfayı yenileyin.')
  return true
}

async function lockRental(tx: Tx, access: CompanyAccess, id: string) {
  const r = (await tx.execute(sql`select k.*, pb.code as pb_code, rb.code as rb_code, v.plate, c.customer_no from rentals k
      join branches pb on pb.company_id = k.company_id and pb.id = k.pickup_branch_id
      join branches rb on rb.company_id = k.company_id and rb.id = k.return_branch_id
      join vehicles v on v.company_id = k.company_id and v.id = k.vehicle_id
      join customers c on c.company_id = k.company_id and c.id = k.customer_id
      where k.id = ${id} for update of k`)).rows[0] as Row | undefined
  if (!r) throw notFound(RENTAL_NOT_FOUND)
  // Out of scope looks like unknown.
  const visible = [r.pickup_branch_id, r.return_branch_id, r.actual_return_branch_id].some((b) => b && inScope(access, b as string))
  if (!visible) throw notFound(RENTAL_NOT_FOUND)
  return r
}

const requirePickupScope = (access: CompanyAccess, r: Row, what: string) => {
  if (!inScope(access, r.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', `Bu kiralamanın başlangıç şubesinde ${what} yetkiniz yok.`)
}

export async function rentalRoutes(app: FastifyInstance) {
  const uploadPolicy = () => {
    const p = documentUploadPolicy(app.env, app.scanner)
    return { enabled: p.enabled, reason: p.enabled ? null : 'Fotoğraf yükleme kapalı: zararlı dosya taraması yapılandırılmamış.' }
  }
  const detail = async (tx: Tx, access: CompanyAccess, id: string) => (await getRental(tx, access, id, { uploadPolicy: uploadPolicy() })) ?? Promise.reject(notFound(RENTAL_NOT_FOUND))
  const conflict = async (tx: Tx, access: CompanyAccess, id: string) =>
    new AppError(409, 'VERSION_CONFLICT', 'Bu kiralama siz çalışırken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await detail(tx, access, id) })

  /** List and search. POST so that names, plates and phone numbers never travel in a URL. */
  app.post('/search', async (req) => withCompany(req, 'rentals.read', async (tx, access) => listRentals(tx, access, rentalSearchSchema.parse(req.body ?? {}))))

  app.get('/branches', async (req) =>
    withCompany(req, 'rentals.read', async (tx, access) => {
      const rows = (await tx.execute(sql`select id, name, code, timezone, country from branches where status = 'active' order by name`)).rows as Row[]
      return {
        items: rows.map((b) => ({ id: b.id as string, name: b.name as string, code: b.code as string, timeZone: b.timezone as string, country: (b.country as string) ?? null, inScope: inScope(access, b.id as string) })),
      }
    }),
  )

  /** Same shared allocation truth as the reservation screen (vehicle_busy). */
  app.post('/availability', async (req) =>
    withCompany(req, 'rentals.read', async (tx, access) => {
      const input = rentalAvailabilitySchema.parse(req.body ?? {})
      const plan = await resolvePlan(tx, access, input, { checkPast: false, requireScope: false })
      const out = await availability(tx, access, { vehicleClassId: input.vehicleClassId, pickupBranchId: input.pickupBranchId, pickupAt: plan.pickupAt, returnAt: plan.returnAt, excludeRentalId: input.excludeRentalId })
      return { pickup: moment(plan.pickupAt, plan.pickupBranch.timezone), return: moment(plan.returnAt, plan.returnBranch.timezone), ...out }
    }),
  )

  app.get('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.read', async (tx, access) => detail(tx, access, id))
  })

  app.get('/:id/history', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.read', async (tx, access) => {
      await detail(tx, access, id)
      return { items: await rentalActivity(tx, id) }
    })
  })

  // -------------------------------------------------------------------------
  // Create: direct (spec §10.2) or from a confirmed reservation.

  app.post('/', async (req, reply) => {
    const input = rentalCreateSchema.parse(req.body)
    const run = () =>
      withCompany(req, 'rentals.manage', async (tx, access) => {
        const existing = (await tx.execute(sql`select id from rentals where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
        if (existing) return { replay: true, body: await detail(tx, access, existing.id as string) }
        const plan = await resolvePlan(tx, access, input, { checkPast: true, requireScope: true })
        const p = await resolveParties(tx, input)
        await assertVehicleFree(tx, access.companyId, p.vehicle, plan.pickupAt, plan.returnAt, {})
        const userId = req.auth!.user.id
        const rentalNo = await nextRentalNo(tx, access)
        const row = (
          await guarded(
            tx.execute(sql`insert into rentals (company_id, rental_no, status, origin, customer_id, corporate_account_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id,
                planned_pickup_at, planned_return_at, pickup_timezone, return_timezone, note, client_request_id, created_by, updated_by)
              values (${access.companyId}, ${rentalNo}, 'prepared', 'direct', ${p.customer.id}, ${p.account?.id ?? null}, ${p.cls.id}, ${p.vehicle.id}, ${plan.pickupBranch.id}, ${plan.returnBranch.id},
                ${plan.pickupAt}, ${plan.returnAt}, ${plan.pickupBranch.timezone}, ${plan.returnBranch.timezone}, ${input.note ?? null}, ${input.requestId}, ${userId}, ${userId})
              returning id`),
          )
        ).rows[0] as Row
        const id = row.id as string
        await setDrivers(tx, access, id, userId, p.drivers)
        await addEvent(tx, access, id, 'created', null, 'prepared', userId, { data: { origin: 'direct' } })
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'rental.create',
          entity: 'rental',
          entityId: id,
          summary: {
            rentalNo,
            origin: 'direct',
            customerNo: p.customer.customerNo,
            corporateAccountNo: p.account?.accountNo ?? null,
            drivers: p.drivers.map((d) => `${d.customerNo}${d.isPrimary ? '*' : ''}`),
            vehicleClass: p.cls.name,
            vehicle: p.vehicle.plate,
            pickupBranch: plan.pickupBranch.code,
            returnBranch: plan.returnBranch.code,
            plannedPickupAt: plan.pickupAt,
            plannedReturnAt: plan.returnAt,
          },
        })
        return { replay: false, body: await detail(tx, access, id) }
      })
    const out = await run().catch(async (e) => {
      // Two copies of one request at the same moment: the second sees the first one's rental.
      if (e instanceof AppError && e.code === 'REQUEST_REPLAY') return run()
      throw e
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  /** Confirmed reservation → prepared rental, atomically: the reservation becomes converted in the same transaction. */
  app.post('/from-reservation/:id', async (req, reply) => {
    const reservationId = parseId(req, 'Rezervasyon bulunamadı veya bu rezervasyona erişim yetkiniz yok.')
    const input = rentalFromReservationSchema.parse(req.body)
    const run = () =>
      withCompany(req, 'rentals.manage', async (tx, access) => {
        need(access, 'reservations.read')
        const res = (
          await tx.execute(sql`select r.*, pb.code as pb_code, rb.code as rb_code, vc.name as class_name, v.plate, v.status as vehicle_status, c.customer_no, a.account_no, pb.timezone as pb_tz
            from reservations r
            join branches pb on pb.company_id = r.company_id and pb.id = r.pickup_branch_id
            join branches rb on rb.company_id = r.company_id and rb.id = r.return_branch_id
            join vehicle_classes vc on vc.company_id = r.company_id and vc.id = r.vehicle_class_id
            join customers c on c.company_id = r.company_id and c.id = r.customer_id
            left join vehicles v on v.company_id = r.company_id and v.id = r.vehicle_id
            left join corporate_accounts a on a.company_id = r.company_id and a.id = r.corporate_account_id
            where r.id = ${reservationId} for update of r`)
        ).rows[0] as Row | undefined
        if (!res || (!access.allBranches && !access.branchIds.includes(res.pickup_branch_id as string) && !access.branchIds.includes(res.return_branch_id as string))) {
          throw notFound('Rezervasyon bulunamadı veya bu rezervasyona erişim yetkiniz yok.')
        }
        // After the reservation lock: a conversion that committed meanwhile is visible here.
        const existing = (await tx.execute(sql`select id from rentals where client_request_id = ${input.requestId} or reservation_id = ${reservationId} limit 1`)).rows[0] as Row | undefined
        if (existing) {
          const mine = (await tx.execute(sql`select id from rentals where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
          if (mine) return { replay: true, body: await detail(tx, access, mine.id as string) }
          throw new AppError(409, 'ALREADY_CONVERTED', 'Bu rezervasyondan zaten bir kiralama oluşturulmuş.', undefined, { rentalId: existing.id })
        }
        if (!inScope(access, res.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin rezervasyonunu kiralamaya dönüştürme yetkiniz yok.')
        if (res.version !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Rezervasyon siz bakarken güncellendi. Sayfayı yenileyip tekrar deneyin.')
        if (res.status === 'pending') throw new AppError(409, 'RESERVATION_NOT_CONFIRMED', 'Yalnız onaylı rezervasyon kiralamaya dönüştürülür. Önce belirli bir araç atayıp rezervasyonu onaylayın.')
        if (res.status !== 'confirmed') throw new AppError(409, 'INVALID_TRANSITION', 'İptal edilmiş, Gelmedi olarak işaretlenmiş veya dönüşmüş rezervasyon kiralamaya dönüştürülemez.')
        const customer = await activeCustomer(tx, res.customer_id as string, 'customerId', false)
        const userId = req.auth!.user.id
        await lockVehicleAllocation(tx, access.companyId, res.vehicle_id as string)
        if (res.vehicle_status !== 'active') throw new AppError(409, 'VEHICLE_NOT_ACTIVE', `${res.plate as string} şu anda hizmet dışı; rezervasyon kiralamaya dönüştürülemez.`)
        // The reservation's own allocation turns into the rental's: converted first, then the rental (same transaction).
        await guarded(tx.execute(sql`update reservations set status = 'converted', version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${reservationId}`))
        await tx.execute(sql`insert into reservation_status_events (company_id, reservation_id, from_status, to_status, actor_user_id) values (${access.companyId}, ${reservationId}, 'confirmed', 'converted', ${userId})`)
        const rentalNo = await nextRentalNo(tx, access)
        const row = (
          await guarded(
            tx.execute(sql`insert into rentals (company_id, rental_no, status, origin, reservation_id, customer_id, corporate_account_id, vehicle_class_id, vehicle_id, pickup_branch_id, return_branch_id,
                planned_pickup_at, planned_return_at, pickup_timezone, return_timezone, note, client_request_id, created_by, updated_by)
              values (${access.companyId}, ${rentalNo}, 'prepared', 'reservation', ${reservationId}, ${customer.id}, ${res.corporate_account_id as string | null}, ${res.vehicle_class_id as string},
                ${res.vehicle_id as string}, ${res.pickup_branch_id as string}, ${res.return_branch_id as string}, ${res.pickup_at as string}, ${res.return_at as string},
                ${res.pickup_timezone as string}, ${res.return_timezone as string}, ${null}, ${input.requestId}, ${userId}, ${userId})
              returning id`),
          )
        ).rows[0] as Row
        const id = row.id as string
        const drivers = ((await tx.execute(sql`select customer_id, is_primary from reservation_drivers where reservation_id = ${reservationId} and removed_at is null`)).rows as Row[]).map((d) => ({
          id: d.customer_id as string,
          isPrimary: d.is_primary as boolean,
        }))
        await setDrivers(tx, access, id, userId, drivers)
        await addEvent(tx, access, id, 'created', null, 'prepared', userId, { data: { origin: 'reservation', reservationNo: res.reservation_no } })
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'reservation.convert',
          entity: 'reservation',
          entityId: reservationId,
          summary: { reservationNo: res.reservation_no, fromVersion: input.version, rentalNo },
        })
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'rental.create',
          entity: 'rental',
          entityId: id,
          summary: {
            rentalNo,
            origin: 'reservation',
            reservationNo: res.reservation_no,
            customerNo: res.customer_no,
            corporateAccountNo: res.account_no ?? null,
            vehicle: res.plate,
            pickupBranch: res.pb_code,
            returnBranch: res.rb_code,
            plannedPickupAt: toIso(res.pickup_at),
            plannedReturnAt: toIso(res.return_at),
          },
        })
        return { replay: false, body: await detail(tx, access, id) }
      })
    const out = await run().catch(async (e) => {
      if (e instanceof AppError && (e.code === 'REQUEST_REPLAY' || e.code === 'ALREADY_CONVERTED') && !(e.details as { rentalId?: string } | undefined)?.rentalId) return run()
      throw e
    })
    return reply.code(out.replay ? 200 : 201).send(out.body)
  })

  /** Edits a prepared rental. Plan changes are re-checked and make earlier document decisions stale (K4). */
  app.put('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.manage', async (tx, access) => {
      const input = rentalUpdateSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'prepared') throw new AppError(409, 'RENTAL_NOT_PREPARED', 'Yalnız teslim bekleyen kiralama düzenlenebilir. Teslimden sonra yalnız iade zamanı uzatılabilir.')
      requirePickupScope(access, cur, 'değişiklik yapma')
      const plan = await resolvePlan(tx, access, input, { checkPast: false, requireScope: true })
      const p = await resolveParties(tx, input, cur)
      const userId = req.auth!.user.id
      const changes: Record<string, [unknown, unknown]> = {}
      const track = (field: string, before: unknown, after: unknown) => {
        if (String(before ?? null) !== String(after ?? null)) changes[field] = [before ?? null, after ?? null]
      }
      track('plannedPickupAt', toIso(cur.planned_pickup_at), plan.pickupAt)
      track('plannedReturnAt', toIso(cur.planned_return_at), plan.returnAt)
      track('pickupBranch', cur.pb_code, plan.pickupBranch.code)
      track('returnBranch', cur.rb_code, plan.returnBranch.code)
      track('vehicle', cur.plate, p.vehicle.plate)
      track('customer', cur.customer_no, p.customer.customerNo)
      track('corporateAccount', cur.corporate_account_id, p.account?.id)
      track('vehicleClass', cur.vehicle_class_id, p.cls.id)
      const oldDrivers = ((await tx.execute(sql`select c.customer_no, d.is_primary from rental_drivers d join customers c on c.company_id = d.company_id and c.id = d.customer_id where d.rental_id = ${id} and d.removed_at is null order by c.customer_no`)).rows as Row[]).map((d) => `${d.customer_no}${d.is_primary ? '*' : ''}`)
      const newDrivers = p.drivers.map((d) => `${d.customerNo}${d.isPrimary ? '*' : ''}`).sort()
      if (oldDrivers.join() !== newDrivers.join()) changes.drivers = [oldDrivers, newDrivers]
      const noteChanged = (cur.note ?? null) !== (input.note ?? null)
      if (!Object.keys(changes).length && !noteChanged) return detail(tx, access, id)
      const scheduleChanged = ['plannedPickupAt', 'plannedReturnAt', 'vehicle'].some((f) => f in changes)
      if (scheduleChanged) await assertVehicleFree(tx, access.companyId, p.vehicle, plan.pickupAt, plan.returnAt, { reservationId: cur.reservation_id as string | null, rentalId: id })
      await guarded(
        tx.execute(sql`update rentals set customer_id = ${p.customer.id}, corporate_account_id = ${p.account?.id ?? null}, vehicle_class_id = ${p.cls.id}, vehicle_id = ${p.vehicle.id},
            pickup_branch_id = ${plan.pickupBranch.id}, return_branch_id = ${plan.returnBranch.id}, planned_pickup_at = ${plan.pickupAt}, planned_return_at = ${plan.returnAt},
            pickup_timezone = ${plan.pickupBranch.timezone}, return_timezone = ${plan.returnBranch.timezone}, note = ${input.note ?? null},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      if (changes.drivers) await setDrivers(tx, access, id, userId, p.drivers)
      // Another vehicle: the open handover evidence was of the old one, so its photos, marks and readings no longer count.
      if (changes.vehicle) {
        const h = (await tx.execute(sql`select id from rental_inspections where rental_id = ${id} and kind = 'handover' and state = 'draft'`)).rows[0] as Row | undefined
        if (h) {
          await tx.execute(sql`update rental_damage_marks set removed_at = now(), removed_by = ${userId} where inspection_id = ${h.id as string} and removed_at is null`)
          await tx.execute(sql`update rental_inspection_photos set removed_at = now(), removed_by = ${userId} where inspection_id = ${h.id as string} and removed_at is null`)
          await guarded(tx.execute(sql`update rental_inspections set vehicle_id = ${p.vehicle.id}, km = null, fuel = null, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${h.id as string}`))
        }
      }
      const planChanged = Object.keys(changes).some((f) => f !== 'corporateAccount')
      await addEvent(tx, access, id, 'updated', 'prepared', 'prepared', userId, { data: { planChanged, fields: Object.keys(changes) } })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.update', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, fromVersion: input.version, changes, noteChanged } })
      return detail(tx, access, id)
    })
  })

  /** §59BY: only a prepared rental is cancelled; a handed-over rental goes through return and close. */
  app.post('/:id/cancel', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.manage', async (tx, access) => {
      const input = rentalCancelSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (await replayOf(tx, input.requestId, id)) return detail(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'prepared') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız teslim bekleyen kiralama iptal edilebilir. Teslim edilmiş kiralama iade ve kapanışla sonlanır.')
      requirePickupScope(access, cur, 'iptal')
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update rentals set status = 'cancelled', cancel_reason = ${input.reason}, cancel_note = ${input.note ?? null}, cancelled_at = now(), cancelled_by = ${userId},
          version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      await addEvent(tx, access, id, 'cancelled', 'prepared', 'cancelled', userId, { reason: input.reason, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.cancel', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, fromVersion: input.version, reason: input.reason } })
      return detail(tx, access, id)
    })
  })

  /**
   * Staff's document decision per driver (K3, K4): local/foreign chosen by staff, reference country = pickup branch,
   * the active policy if any. With a policy, "eligible" needs every item covered by a document valid for the period.
   * Without one the decision is recorded as a staff check under an undefined rule, never as "no documents needed".
   */
  app.put('/:id/document-check', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.manage', async (tx, access) => {
      need(access, 'customers.documents.read')
      const input = rentalDocumentCheckSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'prepared') throw new AppError(409, 'RENTAL_NOT_PREPARED', 'Belge kararı teslimden önce verilir; teslimden sonra değişmez.')
      requirePickupScope(access, cur, 'belge kararı verme')
      const core = await rentalCore(tx, id)
      if (!core.pickupCountry) {
        throw new AppError(409, 'BRANCH_COUNTRY_MISSING', 'Başlangıç şubesinin ülkesi tanımlı değil. Belge kuralı ülkeye göre uygulandığı için önce yetkili bir kişi Şubeler ekranından ülkeyi girmeli.')
      }
      const drivers = await activeDrivers(tx, id)
      const pickupDay = toIso(cur.planned_pickup_at)
      const docs = await periodDocuments(
        tx,
        input.drivers.map((d) => d.customerId),
        moment(pickupDay, core.pickupTimezone).local.slice(0, 10),
        moment(core.plannedReturnAt, core.returnTimezone).local.slice(0, 10),
      )
      const userId = req.auth!.user.id
      const summary: Record<string, unknown>[] = []
      for (const [i, d] of input.drivers.entries()) {
        const driver = drivers.find((x) => x.id === d.customerId)
        if (!driver) throw invalid({ [`drivers.${i}.customerId`]: 'Bu kişi kiralamanın sürücüsü değil' })
        const policy = await activePolicy(tx, core.pickupCountry, d.residencyClass)
        const valid = docs.get(d.customerId)!.valid
        if (d.decision === 'eligible' && policy) {
          const missing = uncoveredItems(
            policy.items,
            valid.map((v) => v.type),
          )
          if (missing.length) {
            throw invalid({ [`drivers.${i}.decision`]: 'Uygulanan belge kuralındaki belgeler kiralama süresince geçerli değil veya kayıtlı değil' }, 'Gerekli belge eksik; sürücü uygun olarak işaretlenemez.')
          }
        }
        await guarded(
          tx.execute(sql`insert into rental_document_checks (company_id, rental_id, customer_id, driver_role, residency_class, reference_country, rule_status, policy_id, policy_version,
              required_items, document_ids, decision, note, checked_by)
            values (${access.companyId}, ${id}, ${d.customerId}, ${driver.isPrimary ? 'primary' : 'additional'}, ${d.residencyClass}, ${core.pickupCountry}, ${policy ? 'policy_applied' : 'no_policy'},
              ${policy?.id ?? null}, ${policy?.version ?? null}, ${JSON.stringify(policy?.items ?? [])}::jsonb, ${`{${valid.map((v) => v.id).join(',')}}`}::uuid[], ${d.decision}, ${d.note ?? null}, ${userId})`),
        )
        const no = (await tx.execute(sql`select customer_no from customers where id = ${d.customerId}`)).rows[0] as Row
        summary.push({ customerNo: no.customer_no, residencyClass: d.residencyClass, ruleStatus: policy ? 'policy_applied' : 'no_policy', policyVersion: policy?.version ?? null, decision: d.decision, documents: valid.length })
      }
      await guarded(tx.execute(sql`update rentals set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      await addEvent(tx, access, id, 'document_check', 'prepared', 'prepared', userId, { data: { drivers: summary } })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.document_check', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, referenceCountry: core.pickupCountry, drivers: summary } })
      return detail(tx, access, id)
    })
  })

  // -------------------------------------------------------------------------
  // Inspections (handover and return): drafts, photos, marks.

  /** The rental, locked, with the inspection window and scope checked for this kind. */
  async function openInspectionContext(tx: Tx, access: CompanyAccess, id: string, kind: 'handover' | 'return') {
    const cur = await lockRental(tx, access, id)
    if (kind === 'handover') {
      if (cur.status !== 'prepared') throw new AppError(409, 'INSPECTION_CLOSED', 'Teslim kontrolü yalnız teslimden önce düzenlenir.')
      requirePickupScope(access, cur, 'teslim kaydı')
    } else {
      if (cur.status !== 'delivered' && cur.status !== 'returned') throw new AppError(409, 'INSPECTION_CLOSED', 'İade kontrolü yalnız araç teslim edildikten sonra ve kiralama kapanmadan düzenlenir.')
    }
    return cur
  }

  async function ensureInspection(tx: Tx, access: CompanyAccess, cur: Row, kind: 'handover' | 'return', userId: string) {
    const existing = (await tx.execute(sql`select id, version, state from rental_inspections where rental_id = ${cur.id as string} and kind = ${kind} for update`)).rows[0] as Row | undefined
    if (existing) return existing
    return (
      await guarded(
        tx.execute(sql`insert into rental_inspections (company_id, rental_id, vehicle_id, kind, created_by, updated_by) values (${access.companyId}, ${cur.id as string}, ${cur.vehicle_id as string}, ${kind}, ${userId}, ${userId})
          returning id, version, state`),
      )
    ).rows[0] as Row
  }

  app.put('/:id/inspections/:kind', async (req) => {
    const p = kindParams.safeParse(req.params)
    if (!p.success) throw notFound(RENTAL_NOT_FOUND)
    const { id, kind } = p.data
    return withCompany(req, 'rentals.handover', async (tx, access) => {
      const input = inspectionDraftSchema.parse(req.body)
      const cur = await openInspectionContext(tx, access, id, kind)
      const userId = req.auth!.user.id
      const before = (await tx.execute(sql`select id, version, state from rental_inspections where rental_id = ${id} and kind = ${kind} for update`)).rows[0] as Row | undefined
      if ((before ? Number(before.version) : 0) !== input.inspectionVersion) {
        throw new AppError(409, 'INSPECTION_CONFLICT', 'Bu kontrol siz çalışırken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await detail(tx, access, id) })
      }
      const insp = await ensureInspection(tx, access, cur, kind, userId)
      if (insp.state !== 'draft') throw new AppError(409, 'INSPECTION_CLOSED', 'Kesinleşmiş kontrol değiştirilemez.')
      const inspectionId = insp.id as string
      const checklist = Object.fromEntries(Object.entries(input.checklist).filter(([k]) => (CHECKLIST_ITEMS as readonly string[]).includes(k)))
      // A return's km and fuel come from the return itself (with its odometer entry), not from a draft.
      const kmFuel = kind === 'handover' ? sql`km = ${input.km ?? null}, fuel = ${input.fuel ?? null},` : sql``
      await guarded(
        tx.execute(sql`update rental_inspections set ${kmFuel} cleanliness = ${input.cleanliness ?? null}, condition = ${input.condition ?? null},
            checklist = ${JSON.stringify(checklist)}::jsonb, notes = ${input.notes ?? null}, counterpart_customer_id = ${input.counterpartCustomerId ?? null},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${inspectionId}`),
      )
      // Marks: keep the listed ones (updated in place), mark the others removed, add new ones.
      const current = (await tx.execute(sql`select * from rental_damage_marks where inspection_id = ${inspectionId} and removed_at is null`)).rows as Row[]
      const keep = new Set(input.marks.filter((m) => m.id).map((m) => m.id!))
      for (const m of current) if (!keep.has(m.id as string)) await guarded(tx.execute(sql`update rental_damage_marks set removed_at = now(), removed_by = ${userId} where id = ${m.id as string}`))
      for (const m of input.marks) {
        if (m.id) {
          const old = current.find((c) => c.id === m.id)
          if (!old) throw invalid({ marks: 'İşaret bulunamadı; sayfayı yenileyin' })
          await guarded(
            tx.execute(sql`update rental_damage_marks set view = ${m.view}, x_permille = ${m.x}, y_permille = ${m.y}, category = ${m.category}, note = ${m.note ?? null},
                photo_id = ${m.photoId ?? null}, existing_mark_id = ${m.existingMarkId ?? null} where id = ${m.id}`),
          )
        } else {
          await guarded(
            tx.execute(sql`insert into rental_damage_marks (company_id, inspection_id, view, x_permille, y_permille, category, note, photo_id, existing_mark_id, created_by)
              values (${access.companyId}, ${inspectionId}, ${m.view}, ${m.x}, ${m.y}, ${m.category}, ${m.note ?? null}, ${m.photoId ?? null}, ${m.existingMarkId ?? null}, ${userId})`),
          )
        }
      }
      return detail(tx, access, id)
    })
  })

  /** Evidence photo: content-checked, re-encoded without metadata, scanned, stored privately; at most 5 per inspection. */
  app.post('/:id/inspections/:kind/photos', { config: UPLOAD_RATE_LIMIT }, async (req, reply) => {
    const p = kindParams.safeParse(req.params)
    if (!p.success) throw notFound(RENTAL_NOT_FOUND)
    const { id, kind } = p.data
    const angle = z.enum(['front', 'rear', 'left', 'right', 'interior', 'other']).safeParse((req.query as { angle?: string }).angle)
    if (!angle.success) throw invalid({ angle: 'Fotoğrafın açısını seçin' })
    const policy = uploadPolicy()
    if (!policy.enabled) throw new AppError(409, 'UPLOADS_CLOSED', policy.reason!)
    // 1. Cheap checks before reading the body.
    await withCompany(req, 'rentals.handover', async (tx, access) => {
      const cur = await openInspectionContext(tx, access, id, kind)
      const n = (await tx.execute(sql`select count(*)::int as n from rental_inspection_photos p join rental_inspections i on i.company_id = p.company_id and i.id = p.inspection_id
        where i.rental_id = ${cur.id as string} and i.kind = ${kind} and p.removed_at is null`)).rows[0] as { n: number }
      if (n.n >= 5) throw new AppError(409, 'PHOTO_LIMIT', 'Bir kontrolde en fazla 5 fotoğraf olabilir.')
    })
    // 2. Read, validate, clean and scan outside any transaction.
    if (!req.isMultipart()) throw new AppError(400, 'NO_FILE', 'Yüklenecek fotoğraf bulunamadı.')
    const part = await req.file()
    if (!part) throw new AppError(400, 'NO_FILE', 'Yüklenecek fotoğraf bulunamadı.')
    const image = await processPromoPhoto(await part.toBuffer())
    const scan = await app.scanner.scan(image.main)
    if (scan === 'infected') throw new AppError(422, 'MALWARE_DETECTED', 'Dosyada zararlı içerik bulundu; yükleme reddedildi.')
    if (scan !== 'clean') throw new AppError(503, 'SCANNER_UNAVAILABLE', 'Zararlı dosya taraması şu an yapılamıyor; yükleme yapılmadı. Daha sonra tekrar deneyin.')
    // 3. Store, then link in one transaction; on any failure the stored files are removed.
    const keys = app.storage.newRentalPhotoKeys(req.auth!.session.activeCompanyId!)
    await app.storage.put(keys.main, image.main)
    await app.storage.put(keys.thumb, image.thumb)
    try {
      const out = await withCompany(req, 'rentals.handover', async (tx, access) => {
        const cur = await openInspectionContext(tx, access, id, kind)
        const userId = req.auth!.user.id
        const insp = await ensureInspection(tx, access, cur, kind, userId)
        if (insp.state !== 'draft') throw new AppError(409, 'INSPECTION_CLOSED', 'Kesinleşmiş kontrole fotoğraf eklenemez.')
        const [file] = (
          await tx.execute(sql`insert into files (company_id, kind, storage_key, thumb_key, mime_type, size_bytes, width, height, sha256, uploaded_by)
            values (${access.companyId}, 'rental_inspection_photo', ${keys.main}, ${keys.thumb}, 'image/webp', ${image.main.length}, ${image.width}, ${image.height}, ${image.sha256}, ${userId}) returning id`)
        ).rows as Row[]
        const [photo] = (
          await guarded(
            tx.execute(sql`insert into rental_inspection_photos (company_id, inspection_id, file_id, angle, created_by) values (${access.companyId}, ${insp.id as string}, ${file!.id as string}, ${angle.data}, ${userId}) returning id`),
          )
        ).rows as Row[]
        await tx.execute(sql`update rental_inspections set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${insp.id as string}`)
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'rental.photo.add',
          entity: 'rental',
          entityId: id,
          summary: { rentalNo: cur.rental_no, inspection: kind, angle: angle.data, photoId: photo!.id, width: image.width, height: image.height, scanner: app.scanner.name },
        })
        return detail(tx, access, id)
      })
      return reply.code(201).send(out)
    } catch (e) {
      await app.storage.remove(keys.main, keys.thumb)
      throw e
    }
  })

  /** Takes a photo off an open inspection (a removal mark; the file stays as part of the record). */
  app.delete('/:id/inspections/:kind/photos/:photoId', async (req) => {
    const p = photoParams.safeParse(req.params)
    if (!p.success || !p.data.kind) throw notFound(RENTAL_NOT_FOUND)
    const { id, kind, photoId } = p.data as { id: string; kind: 'handover' | 'return'; photoId: string }
    return withCompany(req, 'rentals.handover', async (tx, access) => {
      const cur = await openInspectionContext(tx, access, id, kind)
      const userId = req.auth!.user.id
      const ph = (await tx.execute(sql`select p.id, p.inspection_id from rental_inspection_photos p join rental_inspections i on i.company_id = p.company_id and i.id = p.inspection_id
        where p.id = ${photoId} and i.rental_id = ${id} and i.kind = ${kind} and p.removed_at is null`)).rows[0] as Row | undefined
      if (!ph) throw notFound('Fotoğraf bulunamadı.')
      await guarded(tx.execute(sql`update rental_damage_marks set photo_id = null where inspection_id = ${ph.inspection_id as string} and photo_id = ${photoId} and removed_at is null`))
      await guarded(tx.execute(sql`update rental_inspection_photos set removed_at = now(), removed_by = ${userId} where id = ${photoId}`))
      await tx.execute(sql`update rental_inspections set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${ph.inspection_id as string}`)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.photo.remove', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, inspection: kind, photoId } })
      return detail(tx, access, id)
    })
  })

  /** Streams an evidence photo after company (RLS), permission and branch-scope checks; never cached. */
  app.get('/:id/photos/:photoId', async (req, reply) => {
    const p = photoParams.safeParse(req.params)
    if (!p.success) throw notFound()
    const variant = (req.query as { variant?: string }).variant === 'thumb' ? 'thumb' : 'main'
    const file = await withCompany(req, 'rentals.read', async (tx, access) => {
      const r = (
        await tx.execute(sql`select f.storage_key, f.thumb_key, k.pickup_branch_id, k.return_branch_id, k.actual_return_branch_id from rental_inspection_photos ph
          join rental_inspections i on i.company_id = ph.company_id and i.id = ph.inspection_id
          join rentals k on k.company_id = i.company_id and k.id = i.rental_id
          join files f on f.company_id = ph.company_id and f.id = ph.file_id
          where ph.id = ${p.data.photoId} and k.id = ${p.data.id}`)
      ).rows[0] as Row | undefined
      if (!r || ![r.pickup_branch_id, r.return_branch_id, r.actual_return_branch_id].some((b) => b && inScope(access, b as string))) throw notFound()
      return r
    })
    const { stream, size } = await app.storage.open(variant === 'thumb' ? (file.thumb_key as string) : (file.storage_key as string))
    return reply
      .header('content-type', 'image/webp')
      .header('content-length', size)
      .header('cache-control', 'private, no-store, max-age=0')
      .header('pragma', 'no-cache')
      .header('vary', 'Cookie')
      .header('content-disposition', 'inline')
      .send(stream)
  })

  // -------------------------------------------------------------------------
  // Handover, extension, return, close.

  /**
   * Prepared → Delivered (spec §85.4 "Teslimi Tamamla"): every gate re-evaluated under the vehicle lock; one handover
   * odometer reading and one "with customer" location event, the final inspection and the status change, all in one
   * transaction. A resent request returns the first result; a stale screen gets a version conflict.
   */
  app.post('/:id/deliver', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.handover', async (tx, access) => {
      const input = rentalDeliverSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (await replayOf(tx, input.requestId, id)) return detail(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'prepared') throw new AppError(409, 'INVALID_TRANSITION', 'Bu kiralama zaten teslim edilmiş veya kapanmış.')
      requirePickupScope(access, cur, 'teslim')
      const handover = await loadInspection(tx, id, 'handover')
      if (!handover || handover.version !== input.inspectionVersion) {
        throw new AppError(409, 'INSPECTION_CONFLICT', 'Teslim kontrolü siz çalışırken değişti. Sayfayı yenileyip kontrol edin.', undefined, { current: await detail(tx, access, id) })
      }
      const pb = (await branch(tx, cur.pickup_branch_id as string))!
      const deliveredAt = actualTime(input.deliveredLocal, pb, input.deliveredChoice, 'deliveredLocal', 'deliveredChoice', HANDOVER_BACKDATE_HOURS)
      await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
      const core = await rentalCore(tx, id)
      const drivers = await activeDrivers(tx, id)
      const gates = await deliveryGates(tx, access.companyId, core, drivers, handover, deliveredAt)
      const blocked = gates.filter((g) => g.state === 'blocked')
      if (blocked.length) throw new AppError(409, 'DELIVERY_BLOCKED', 'Teslim için gereken koşullar tamamlanmadı.', undefined, { gates })
      // K1: both statements and the external reference, each explicit; the database checks the same with the handover.
      const missing: Record<string, string> = {}
      if (!input.externalContractAck) missing.externalContractAck = 'Sözleşmenin ACARVO dışında düzenlendiğini ve işlemin dış süreçte tamamlandığını kontrol ettiğinizi beyan edin'
      if (!input.externalPricingAck) missing.externalPricingAck = 'Fiyatın ACARVO dışında belirlendiğini ve taraflarla dış süreçte ele alındığını beyan edin'
      if (!input.externalReference) missing.externalReference = 'Dış sözleşme veya işlem referansını girin'
      if (Object.keys(missing).length) throw invalid(missing, 'ACARVO’da sözleşme ve fiyat yok; teslim için iki beyan ve dış referans gerekli.')
      const km = handover.km!
      const jump = await assertOdometer(tx, cur.vehicle_id as string, km, deliveredAt, input.largeJumpReason)
      const userId = req.auth!.user.id
      const reading = (
        await guarded(
          tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
            values (${access.companyId}, ${cur.vehicle_id as string}, ${km}, 'rental_handover', 'rental_handover', ${handover.id}, ${deliveredAt}, ${jump ? input.largeJumpReason! : null}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const location = (
        await guarded(
          tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, description, event_type, source_type, source_id, occurred_at, recorded_by)
            values (${access.companyId}, ${cur.vehicle_id as string}, 'with_customer', ${cur.rental_no as string}, 'rental_handover', 'rental_handover', ${handover.id}, ${deliveredAt}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      await guarded(
        tx.execute(sql`update rental_inspections set state = 'final', occurred_at = ${deliveredAt}, branch_id = ${pb.id}, performed_by = ${userId}, odometer_reading_id = ${reading.id as string},
            location_event_id = ${location.id as string}, finalized_at = now(), finalized_by = ${userId}, version = version + 1, updated_at = now(), updated_by = ${userId}
          where id = ${handover.id}`),
      )
      await guarded(
        tx.execute(sql`update rentals set status = 'delivered', delivered_at = ${deliveredAt}, delivered_by = ${userId}, external_terms_ack_at = now(), external_terms_ack_by = ${userId},
            external_pricing_ack_at = now(), external_pricing_ack_by = ${userId}, external_reference = ${input.externalReference!},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const early = Date.parse(deliveredAt) < Date.parse(toIso(cur.planned_pickup_at))
      const data = { km, fuel: handover.fuel, deliveredAt, earlyMinutes: early ? Math.round((Date.parse(toIso(cur.planned_pickup_at)) - Date.parse(deliveredAt)) / 60_000) : 0, photos: handover.photos.length, marks: handover.marks.length }
      await addEvent(tx, access, id, 'delivered', 'prepared', 'delivered', userId, { data, requestId: input.requestId })
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'rental.deliver',
        entity: 'rental',
        entityId: id,
        summary: { rentalNo: cur.rental_no, fromVersion: input.version, vehicle: cur.plate, branch: pb.code, externalContractAck: true, externalPricingAck: true, externalReferenceRecorded: true, ...data },
      })
      return detail(tx, access, id)
    })
  })

  /** §59BV: a new planned return, re-checked against reservations and rentals; never "paid" or priced (K1). */
  app.post('/:id/extend', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.manage', async (tx, access) => {
      const input = rentalExtendSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (await replayOf(tx, input.requestId, id)) return detail(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'prepared' && cur.status !== 'delivered') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız teslim bekleyen veya aktif kiralamanın iade zamanı değiştirilebilir.')
      requirePickupScope(access, cur, 'iade zamanını değiştirme')
      const rb = await branch(tx, input.returnBranchId)
      if (!rb || rb.status !== 'active') throw invalid({ returnBranchId: 'İade şubesi bulunamadı' })
      const newReturn = resolveLocal(input.returnLocal, rb, input.returnChoice, 'returnLocal', 'returnChoice')
      const start = toIso(cur.delivered_at ?? cur.planned_pickup_at)
      if (Date.parse(newReturn) <= Date.parse(start)) throw invalid({ returnLocal: 'Yeni iade zamanı başlangıçtan sonra olmalı' })
      if (cur.status === 'delivered' && Date.parse(newReturn) <= Date.now()) throw invalid({ returnLocal: 'Aktif kiralamada yeni iade zamanı gelecekte olmalı' })
      if (Date.parse(newReturn) - Date.parse(start) > RENTAL_MAX_DAYS * 86_400_000) throw invalid({ returnLocal: `Bir kiralama en fazla ${RENTAL_MAX_DAYS} gün olabilir` })
      const oldReturn = toIso(cur.planned_return_at)
      if (oldReturn === newReturn && cur.return_branch_id === rb.id) return detail(tx, access, id)
      await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
      const conflicts = await vehicleBusy(tx, access.companyId, cur.vehicle_id as string, start, newReturn, { reservationId: cur.reservation_id as string | null, rentalId: id })
      if (conflicts.length) {
        throw new AppError(409, 'VEHICLE_UNAVAILABLE', `Yeni iade zamanı ${cur.plate as string} için başka bir kayıtla çakışıyor: ${conflicts.map(allocationConflictText).join(', ')}. Uzatma uygulanmadı.`, { returnLocal: 'Bu tarihe uzatılamaz' }, { conflicts })
      }
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update rentals set planned_return_at = ${newReturn}, return_branch_id = ${rb.id}, return_timezone = ${rb.timezone}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { fromReturnAt: oldReturn, toReturnAt: newReturn, fromBranch: cur.rb_code, toBranch: rb.code, channel: input.channel, pricing: 'not_calculated' }
      await addEvent(tx, access, id, 'extended', cur.status as string, cur.status as string, userId, { data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.extend', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /**
   * Delivered → Returned: the real return time and branch, km and fuel, one return odometer reading and one "at branch"
   * location event, in one transaction. The vehicle's home branch does not change (this is not a transfer). The return
   * inspection (photos, checklist, marks) is finished before closing.
   */
  app.post('/:id/return', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.handover', async (tx, access) => {
      const input = rentalReturnSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (await replayOf(tx, input.requestId, id)) return detail(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'delivered') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız aktif (teslim edilmiş) kiralama iade alınabilir.')
      const rb = await branch(tx, input.returnBranchId)
      if (!rb || rb.status !== 'active') throw invalid({ returnBranchId: 'İade şubesi bulunamadı' })
      if (!inScope(access, rb.id)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubede iade alma yetkiniz yok.', { returnBranchId: 'Bu şube için yetkiniz yok' })
      const returnedAt = actualTime(input.returnedLocal, rb, input.returnedChoice, 'returnedLocal', 'returnedChoice', RETURN_BACKDATE_HOURS)
      if (Date.parse(returnedAt) <= Date.parse(toIso(cur.delivered_at))) throw invalid({ returnedLocal: 'İade, teslimden sonra olmalı' })
      const handover = (await loadInspection(tx, id, 'handover'))!
      if (handover.km != null && input.km < handover.km) {
        throw new AppError(422, 'RETURN_KM_BELOW_HANDOVER', `İade kilometresi teslim kilometresinden (${kmText(handover.km)}) düşük olamaz.`, { km: `En az ${kmText(handover.km)}` })
      }
      const jump = await assertOdometer(tx, cur.vehicle_id as string, input.km, returnedAt, input.largeJumpReason)
      const userId = req.auth!.user.id
      const insp = await ensureInspection(tx, access, cur, 'return', userId)
      const inspectionId = insp.id as string
      await guarded(
        tx.execute(sql`update rental_inspections set km = ${input.km}, fuel = ${input.fuel}, occurred_at = ${returnedAt}, branch_id = ${rb.id}, performed_by = ${userId},
            counterpart_customer_id = coalesce(${input.counterpartCustomerId ?? null}::uuid, counterpart_customer_id), version = version + 1, updated_at = now(), updated_by = ${userId}
          where id = ${inspectionId}`),
      )
      const reading = (
        await guarded(
          tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
            values (${access.companyId}, ${cur.vehicle_id as string}, ${input.km}, 'rental_return', 'rental_return', ${inspectionId}, ${returnedAt}, ${jump ? input.largeJumpReason! : null}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const location = (
        await guarded(
          tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, description, event_type, source_type, source_id, occurred_at, recorded_by)
            values (${access.companyId}, ${cur.vehicle_id as string}, 'branch', ${rb.id}, ${cur.rental_no as string}, 'rental_return', 'rental_return', ${inspectionId}, ${returnedAt}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      await guarded(tx.execute(sql`update rental_inspections set odometer_reading_id = ${reading.id as string}, location_event_id = ${location.id as string} where id = ${inspectionId}`))
      await guarded(
        tx.execute(sql`update rentals set status = 'returned', returned_at = ${returnedAt}, returned_by = ${userId}, actual_return_branch_id = ${rb.id}, actual_return_timezone = ${rb.timezone},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const lateMinutes = Math.round((Date.parse(returnedAt) - Date.parse(toIso(cur.planned_return_at))) / 60_000)
      const data = { km: input.km, fuel: input.fuel, usedKm: handover.km != null ? input.km - handover.km : null, fuelAtHandover: handover.fuel, returnedAt, lateMinutes, branch: rb.code, plannedBranch: cur.rb_code }
      await addEvent(tx, access, id, 'returned', 'delivered', 'returned', userId, { data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.return', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, fromVersion: input.version, vehicle: cur.plate, ...data } })
      return detail(tx, access, id)
    })
  })

  /**
   * Returned → Closed (spec §10.3): the return inspection is complete (4–5 photos, checklist, cleanliness, condition)
   * and new findings were seen by staff. No damage case, liability, charge, refund or "financially closed" (K6, K1).
   */
  app.post('/:id/close', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'rentals.handover', async (tx, access) => {
      const input = rentalCloseSchema.parse(req.body)
      const cur = await lockRental(tx, access, id)
      if (await replayOf(tx, input.requestId, id)) return detail(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'returned') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız iadesi alınmış kiralama kapatılabilir.')
      if (!inScope(access, cur.actual_return_branch_id as string) && !inScope(access, cur.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu kiralamayı kapatma yetkiniz yok.')
      const ret = await loadInspection(tx, id, 'return')
      if (!ret || ret.version !== input.inspectionVersion) {
        throw new AppError(409, 'INSPECTION_CONFLICT', 'İade kontrolü siz çalışırken değişti. Sayfayı yenileyip kontrol edin.', undefined, { current: await detail(tx, access, id) })
      }
      const gates = closeGates(ret)
      if (gates.some((g) => g.state === 'blocked')) throw new AppError(409, 'CLOSE_BLOCKED', 'İade kontrolü tamamlanmadan kiralama kapatılamaz.', undefined, { gates })
      const findings = newFindings(ret)
      if (findings && !input.findingsAcknowledged) throw invalid({ findingsAcknowledged: 'Yeni hasar bulgularını gördüğünüzü onaylayın' }, 'İadede yeni hasar bulgusu var; kapatmadan önce onaylayın.')
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update rental_inspections set state = 'final', finalized_at = now(), finalized_by = ${userId},
            findings_acknowledged_at = ${findings ? sql`now()` : null}, findings_acknowledged_by = ${findings ? userId : null},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${ret.id}`),
      )
      await guarded(tx.execute(sql`update rentals set status = 'closed', closed_at = now(), closed_by = ${userId}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      const data = { photos: ret.photos.length, marks: ret.marks.length, newFindings: findings }
      await addEvent(tx, access, id, 'closed', 'returned', 'closed', userId, { data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'rental.close', entity: 'rental', entityId: id, summary: { rentalNo: cur.rental_no, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })
}

/** 360° tabs of customers, corporate accounts and vehicles. */
export async function relatedRentalRoutes(app: FastifyInstance) {
  app.get('/customers/:id/rentals', async (req) => {
    const id = parseId(req, CUSTOMER_NOT_FOUND)
    return withCompany(req, 'rentals.read', async (tx, access) => {
      need(access, 'customers.read')
      return {
        items: await relatedRentals(tx, access, sql`(k.customer_id = ${id} or exists (select 1 from rental_drivers d where d.company_id = k.company_id and d.rental_id = k.id and d.customer_id = ${id} and d.removed_at is null))`),
      }
    })
  })
  app.get('/corporate-accounts/:id/rentals', async (req) => {
    const id = parseId(req, 'Kurumsal hesap bulunamadı.')
    return withCompany(req, 'rentals.read', async (tx, access) => {
      need(access, 'corporate.read')
      return { items: await relatedRentals(tx, access, sql`k.corporate_account_id = ${id}`) }
    })
  })
  app.get('/vehicles/:id/rentals', async (req) => {
    const id = parseId(req, 'Araç bulunamadı.')
    return withCompany(req, 'rentals.read', async (tx, access) => {
      need(access, 'vehicles.read')
      return { items: await relatedRentals(tx, access, sql`k.vehicle_id = ${id}`) }
    })
  })
}
