import {
  addDays,
  allocationConflictText,
  type Permission,
  RESERVATION_MAX_DAYS,
  RESERVATION_PAST_TOLERANCE_MINUTES,
  reservationAvailabilitySchema,
  reservationCancelSchema,
  reservationConfirmSchema,
  reservationCreateSchema,
  type ReservationInput,
  reservationNoShowSchema,
  reservationSearchSchema,
  reservationTimelineSchema,
  reservationUpdateSchema,
  resolveWallTime,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { lockVehicleAllocation, vehicleBusy } from '../../lib/vehicle-allocation'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { documentWarningDays } from '../customers/documents'
import { CUSTOMER_NOT_FOUND } from '../customers/repository'
import { companyToday } from '../vehicles/document-overview'
import { inScope } from '../vehicles/repository'
import {
  availability,
  getReservation,
  listReservations,
  moment,
  nextReservationNo,
  relatedReservations,
  RESERVATION_NOT_FOUND,
  reservationActivity,
  timeline,
} from './repository'

type Row = Record<string, unknown>

const idParams = z.object({ id: z.uuid() })
const parseId = (req: FastifyRequest, message = RESERVATION_NOT_FOUND) => {
  const p = idParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data.id
}
const need = (access: CompanyAccess, permission: Permission) => {
  if (!access.permissions.has(permission)) throw forbidden()
}
const invalid = (fields: Record<string, string>, message = 'Bazı alanlar geçersiz.') => new AppError(400, 'VALIDATION', message, fields)

const shown = (local: string) => `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11)}`

interface BranchRow {
  id: string
  name: string
  code: string
  timezone: string
  status: string
}
async function branch(tx: Tx, id: string): Promise<BranchRow | null> {
  return ((await tx.execute(sql`select id, name, code, timezone, status from branches where id = ${id}`)).rows[0] as unknown as BranchRow | undefined) ?? null
}

/**
 * Resolves the wall times in each branch's time zone (R4): a time that never happened is refused, a doubled time
 * needs an explicit choice. Return must be after pickup; the stay is bounded; a new pickup cannot lie in the past (R5).
 */
async function resolvePlan(
  tx: Tx,
  access: CompanyAccess,
  input: { pickupBranchId: string; returnBranchId: string; pickupLocal: string; returnLocal: string; pickupChoice?: 'earlier' | 'later'; returnChoice?: 'earlier' | 'later' },
  opts: { checkPast: boolean; requireScope: boolean },
) {
  const [pb, rb] = [await branch(tx, input.pickupBranchId), await branch(tx, input.returnBranchId)]
  if (!pb || pb.status !== 'active') throw invalid({ pickupBranchId: 'Alış şubesi bulunamadı' })
  if (!rb || rb.status !== 'active') throw invalid({ returnBranchId: 'İade şubesi bulunamadı' })
  if (opts.requireScope && !inScope(access, pb.id)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubede rezervasyon oluşturma veya değiştirme yetkiniz yok.', { pickupBranchId: 'Bu şube için yetkiniz yok' })
  const resolve = (local: string, b: BranchRow, choice: 'earlier' | 'later' | undefined, field: string, choiceField: string) => {
    const r = resolveWallTime(local, b.timezone)
    if (!r) throw invalid({ [field]: 'Geçerli bir tarih ve saat girin' })
    if (r.kind === 'nonexistent') throw invalid({ [field]: `${shown(local)} ${b.name} saatinde (${b.timezone}) yaşanmadı: yaz saatine geçişte saatler ileri alındı. Gerçek saati girin.` })
    if (r.kind === 'ambiguous') {
      if (!choice) {
        throw new AppError(400, 'AMBIGUOUS_TIME', `${shown(local)} ${b.name} saatinde (${b.timezone}) iki kez yaşandı. Hangisi olduğunu seçin.`, { [choiceField]: 'Saatin hangisi olduğunu seçin' }, {
          field,
          earlier: r.earlier,
          later: r.later,
        })
      }
      return r[choice].iso
    }
    return r.iso
  }
  const pickupAt = resolve(input.pickupLocal, pb, input.pickupChoice, 'pickupLocal', 'pickupChoice')
  const returnAt = resolve(input.returnLocal, rb, input.returnChoice, 'returnLocal', 'returnChoice')
  if (Date.parse(returnAt) <= Date.parse(pickupAt)) throw invalid({ returnLocal: 'İade, alıştan sonra olmalı' })
  if (Date.parse(returnAt) - Date.parse(pickupAt) > RESERVATION_MAX_DAYS * 86_400_000) throw invalid({ returnLocal: `Bir rezervasyon en fazla ${RESERVATION_MAX_DAYS} gün olabilir` })
  if (opts.checkPast && Date.parse(pickupAt) < Date.now() - RESERVATION_PAST_TOLERANCE_MINUTES * 60_000) throw invalid({ pickupLocal: 'Alış zamanı geçmişte olamaz' })
  return { pickupAt, returnAt, pickupBranch: pb, returnBranch: rb }
}

async function activeCustomer(tx: Tx, id: string, field: string, allowArchivedIfUnchanged: boolean) {
  const r = (await tx.execute(sql`select id, customer_no, status from customers where id = ${id}`)).rows[0] as Row | undefined
  if (!r || (r.status !== 'active' && r.status !== 'archived')) throw new AppError(404, 'NOT_FOUND', CUSTOMER_NOT_FOUND, { [field]: 'Kişi bulunamadı' })
  if (r.status === 'archived' && !allowArchivedIfUnchanged) throw new AppError(409, 'CUSTOMER_ARCHIVED', 'Arşivdeki müşteri rezervasyona eklenemez. Önce müşteriyi arşivden çıkarın.', { [field]: 'Müşteri arşivde' })
  return { id: r.id as string, customerNo: r.customer_no as string }
}

/** Parties, class and vehicle of the input, checked against this company (RLS hides other companies' rows: 404). */
async function resolveParties(tx: Tx, input: ReservationInput, current?: Row) {
  const same = (col: string, v: unknown) => !!current && String(current[col] ?? '') === String(v ?? '')
  const customer = await activeCustomer(tx, input.customerId, 'customerId', same('customer_id', input.customerId))
  const booker = input.bookerCustomerId ? await activeCustomer(tx, input.bookerCustomerId, 'bookerCustomerId', same('booker_customer_id', input.bookerCustomerId)) : null
  const currentDrivers = current ? ((await tx.execute(sql`select customer_id from reservation_drivers where reservation_id = ${current.id as string} and removed_at is null`)).rows as Row[]).map((d) => d.customer_id as string) : []
  const drivers: { id: string; customerNo: string; isPrimary: boolean }[] = []
  for (const [i, d] of (input.drivers ?? []).entries()) {
    const c = await activeCustomer(tx, d.customerId, `drivers.${i}.customerId`, currentDrivers.includes(d.customerId))
    drivers.push({ ...c, isPrimary: !!d.isPrimary })
  }
  let account: { id: string; accountNo: string } | null = null
  if (input.corporateAccountId) {
    const a = (await tx.execute(sql`select id, account_no, status from corporate_accounts where id = ${input.corporateAccountId}`)).rows[0] as Row | undefined
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Kurumsal hesap bulunamadı.', { corporateAccountId: 'Kurumsal hesap bulunamadı' })
    if (a.status !== 'active' && !same('corporate_account_id', input.corporateAccountId)) throw new AppError(409, 'ACCOUNT_ARCHIVED', 'Arşivdeki kurumsal hesap rezervasyona bağlanamaz.', { corporateAccountId: 'Kurumsal hesap arşivde' })
    account = { id: a.id as string, accountNo: a.account_no as string }
  }
  const cls = (await tx.execute(sql`select id, name from vehicle_classes where id = ${input.vehicleClassId}`)).rows[0] as Row | undefined
  if (!cls) throw invalid({ vehicleClassId: 'Araç sınıfı bulunamadı' })
  let vehicle: { id: string; plate: string; status: string } | null = null
  if (input.vehicleId) {
    const v = (await tx.execute(sql`select id, plate, status, class_id from vehicles where id = ${input.vehicleId}`)).rows[0] as Row | undefined
    if (!v || v.status === 'sold' || v.status === 'disposed') throw invalid({ vehicleId: 'Araç bulunamadı veya filoda değil' })
    if (v.class_id !== input.vehicleClassId) throw invalid({ vehicleId: 'Araç seçilen sınıftan değil; üst sınıf vermek için önce sınıfı değiştirin' })
    vehicle = { id: v.id as string, plate: v.plate as string, status: v.status as string }
  }
  return { customer, booker, drivers, account, cls: { id: cls.id as string, name: cls.name as string }, vehicle }
}

/**
 * Friendly 409 before the write, from the shared allocation truth (confirmed reservations and rentals); the database
 * trigger is the final guard, under the same lock (also under concurrency).
 */
async function assertVehicleFree(tx: Tx, companyId: string, vehicle: { id: string; plate: string; status: string }, pickupAt: string, returnAt: string, exceptId?: string) {
  await lockVehicleAllocation(tx, companyId, vehicle.id)
  if (vehicle.status !== 'active') throw new AppError(409, 'VEHICLE_NOT_ACTIVE', `${vehicle.plate} şu anda hizmet dışı; onaylı rezervasyon yapılamaz.`, { vehicleId: 'Araç hizmet dışı' })
  const conflicts = await vehicleBusy(tx, companyId, vehicle.id, pickupAt, returnAt, { reservationId: exceptId })
  if (conflicts.length) {
    const rented = conflicts.some((c) => c.kind === 'rental')
    const other = conflicts.filter((c) => c.kind !== 'reservation' && c.kind !== 'rental')
    throw new AppError(
      409,
      'VEHICLE_UNAVAILABLE',
      other.length
        ? `${vehicle.plate} bu dönemde müsait değil: ${conflicts.map(allocationConflictText).join(', ')}.`
        : rented
          ? `${vehicle.plate} bu dönemde kirada veya kiralama için ayrılmış (${conflicts.map((c) => c.refNo).join(', ')}).`
          : `${vehicle.plate} bu dönemde başka bir onaylı rezervasyonda.`,
      { vehicleId: 'Araç bu dönemde dolu' },
      { conflicts },
    )
  }
}

/** Database guards end as the same answers (concurrent saves, direct changes). */
function mapGuard(e: unknown): never {
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string }
  if (pg.constraint === 'reservations_vehicle_overlap') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde başka bir onaylı rezervasyonda.', { vehicleId: 'Araç bu dönemde dolu' })
  if (pg.constraint === 'reservations_vehicle_rented') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde kirada veya kiralama için ayrılmış.', { vehicleId: 'Araç bu dönemde dolu' })
  if (pg.constraint === 'reservations_vehicle_maintenance') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde bakımda veya bakım için planlanmış.', { vehicleId: 'Araç bu dönemde bakımda' })
  if (pg.constraint === 'reservations_vehicle_damage') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bir hasar nedeniyle kullanılamaz olarak işaretli; onaylı rezervasyon yapılamaz.', { vehicleId: 'Araç hasar nedeniyle kullanılamaz' })
  if (pg.constraint === 'reservations_vehicle_transfer') throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'Araç bu dönemde şubeler arası transferde.', { vehicleId: 'Araç bu dönemde transferde' })
  if (pg.constraint === 'reservations_vehicle_transfer_location')
    throw new AppError(409, 'VEHICLE_ELSEWHERE', 'Onaylı bir transfer aracı alıştan önce başka bir şubeye götürüyor; bu şubeden onaylı rezervasyon yapılamaz.', { vehicleId: 'Araç alış zamanında başka şubede olacak' })
  if (pg.constraint === 'reservations_vehicle_not_active') throw new AppError(409, 'VEHICLE_NOT_ACTIVE', 'Araç hizmet dışı; onaylı rezervasyon yapılamaz.', { vehicleId: 'Araç hizmet dışı' })
  if (pg.constraint === 'reservations_vehicle_class') throw invalid({ vehicleId: 'Araç seçilen sınıftan değil' })
  if (pg.constraint === 'reservations_lifecycle' || pg.constraint === 'reservations_final') throw new AppError(409, 'INVALID_TRANSITION', 'Bu rezervasyonun durumu bu işleme izin vermiyor.')
  throw e
}

async function setDrivers(tx: Tx, access: CompanyAccess, reservationId: string, userId: string, drivers: { id: string; isPrimary: boolean }[]) {
  const current = (await tx.execute(sql`select id, customer_id, is_primary from reservation_drivers where reservation_id = ${reservationId} and removed_at is null`)).rows as Row[]
  const wanted = new Map(drivers.map((d) => [d.id, d.isPrimary]))
  // Remove first (frees the primary slot), then add or re-flag.
  for (const c of current) {
    if (!wanted.has(c.customer_id as string) || wanted.get(c.customer_id as string) !== c.is_primary) {
      await tx.execute(sql`update reservation_drivers set removed_at = now(), removed_by = ${userId}, is_primary = false where id = ${c.id as string}`)
    }
  }
  for (const d of drivers) {
    const keep = current.find((c) => c.customer_id === d.id && c.is_primary === d.isPrimary)
    if (!keep) {
      await tx.execute(sql`insert into reservation_drivers (company_id, reservation_id, customer_id, is_primary, created_by) values (${access.companyId}, ${reservationId}, ${d.id}, ${d.isPrimary}, ${userId})`)
    }
  }
}

async function statusEvent(tx: Tx, access: CompanyAccess, reservationId: string, from: string | null, to: string, userId: string, reason?: string | null, note?: string | null) {
  await tx.execute(sql`insert into reservation_status_events (company_id, reservation_id, from_status, to_status, reason, note, actor_user_id)
    values (${access.companyId}, ${reservationId}, ${from}, ${to}, ${reason ?? null}, ${note ?? null}, ${userId})`)
}

async function docsContext(tx: Tx, access: CompanyAccess) {
  if (!access.permissions.has('customers.documents.read')) return null
  const day = await companyToday(tx, access)
  return { day, warningUntil: addDays(day, await documentWarningDays(tx)) }
}

const conflict = async (tx: Tx, access: CompanyAccess, id: string) =>
  new AppError(409, 'VERSION_CONFLICT', 'Bu rezervasyon siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await getReservation(tx, access, id, await docsContext(tx, access)) })

async function lockReservation(tx: Tx, access: CompanyAccess, id: string) {
  const r = (await tx.execute(sql`select r.*, pb.code as pb_code, rb.code as rb_code, vc.name as class_name, v.plate, c.customer_no, a.account_no, bk.customer_no as booker_no
      from reservations r
      join branches pb on pb.company_id = r.company_id and pb.id = r.pickup_branch_id
      join branches rb on rb.company_id = r.company_id and rb.id = r.return_branch_id
      join vehicle_classes vc on vc.company_id = r.company_id and vc.id = r.vehicle_class_id
      join customers c on c.company_id = r.company_id and c.id = r.customer_id
      left join vehicles v on v.company_id = r.company_id and v.id = r.vehicle_id
      left join corporate_accounts a on a.company_id = r.company_id and a.id = r.corporate_account_id
      left join customers bk on bk.company_id = r.company_id and bk.id = r.booker_customer_id
      where r.id = ${id} for update of r`)).rows[0] as Row | undefined
  if (!r) throw notFound(RESERVATION_NOT_FOUND)
  // Out of scope looks like unknown (R10).
  if (!access.allBranches && !access.branchIds.includes(r.pickup_branch_id as string) && !access.branchIds.includes(r.return_branch_id as string)) throw notFound(RESERVATION_NOT_FOUND)
  return r
}

export async function reservationRoutes(app: FastifyInstance) {
  /** List and search. POST so that names and phone numbers never travel in a URL. */
  app.post('/search', async (req) => withCompany(req, 'reservations.read', async (tx, access) => listReservations(tx, access, reservationSearchSchema.parse(req.body ?? {}))))

  /** Every active branch of the company (a return may end anywhere), with its time zone and whether the user may start reservations there (R10). */
  app.get('/branches', async (req) =>
    withCompany(req, 'reservations.read', async (tx, access) => {
      const rows = (await tx.execute(sql`select id, name, code, timezone from branches where status = 'active' order by name`)).rows as Row[]
      return { items: rows.map((b) => ({ id: b.id as string, name: b.name as string, code: b.code as string, timeZone: b.timezone as string, inScope: inScope(access, b.id as string) })) }
    }),
  )

  app.post('/timeline', async (req) => withCompany(req, 'reservations.read', async (tx, access) => timeline(tx, access, reservationTimelineSchema.parse(req.body ?? {}))))

  /** Vehicles of a class for a period, as far as ACARVO can tell (R1, R2). No customer data of other reservations. */
  app.post('/availability', async (req) =>
    withCompany(req, 'reservations.read', async (tx, access) => {
      const input = reservationAvailabilitySchema.parse(req.body ?? {})
      const plan = await resolvePlan(tx, access, input, { checkPast: false, requireScope: false })
      const out = await availability(tx, access, { vehicleClassId: input.vehicleClassId, pickupBranchId: input.pickupBranchId, pickupAt: plan.pickupAt, returnAt: plan.returnAt, excludeReservationId: input.excludeReservationId })
      return { pickup: moment(plan.pickupAt, plan.pickupBranch.timezone), return: moment(plan.returnAt, plan.returnBranch.timezone), ...out }
    }),
  )

  app.get('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'reservations.read', async (tx, access) => (await getReservation(tx, access, id, await docsContext(tx, access))) ?? Promise.reject(notFound(RESERVATION_NOT_FOUND)))
  })

  app.get('/:id/history', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'reservations.read', async (tx, access) => {
      if (!(await getReservation(tx, access, id, null))) throw notFound(RESERVATION_NOT_FOUND)
      return { items: await reservationActivity(tx, id) }
    })
  })

  app.post('/', async (req, reply) => {
    const created = await withCompany(req, 'reservations.manage', async (tx, access) => {
      const input = reservationCreateSchema.parse(req.body)
      if (input.confirm) need(access, 'reservations.confirm')
      const plan = await resolvePlan(tx, access, input, { checkPast: true, requireScope: true })
      const p = await resolveParties(tx, input)
      if (input.confirm && !p.vehicle) throw new AppError(409, 'VEHICLE_REQUIRED', 'Onaylı rezervasyon için belirli bir araç seçin. Araç sınıfı kapasitesi henüz doğrulanamadığı için yalnız sınıfla onay verilmez.', { vehicleId: 'Araç seçin' })
      if (input.confirm && p.vehicle) await assertVehicleFree(tx, access.companyId, p.vehicle, plan.pickupAt, plan.returnAt)
      const userId = req.auth!.user.id
      const status = input.confirm ? 'confirmed' : 'pending'
      const reservationNo = await nextReservationNo(tx, access)
      const row = (
        await tx
          .execute(sql`insert into reservations (company_id, reservation_no, status, source, customer_id, corporate_account_id, booker_customer_id, vehicle_class_id, vehicle_id,
              pickup_branch_id, return_branch_id, pickup_at, return_at, pickup_timezone, return_timezone, note, confirmed_at, confirmed_by, created_by, updated_by)
            values (${access.companyId}, ${reservationNo}, ${status}, ${input.source}, ${p.customer.id}, ${p.account?.id ?? null}, ${p.booker?.id ?? null}, ${p.cls.id}, ${p.vehicle?.id ?? null},
              ${plan.pickupBranch.id}, ${plan.returnBranch.id}, ${plan.pickupAt}, ${plan.returnAt}, ${plan.pickupBranch.timezone}, ${plan.returnBranch.timezone}, ${input.note ?? null},
              ${input.confirm ? sql`now()` : null}, ${input.confirm ? userId : null}, ${userId}, ${userId})
            returning id`)
          .catch(mapGuard)
      ).rows[0] as Row
      const id = row.id as string
      await setDrivers(tx, access, id, userId, p.drivers)
      await statusEvent(tx, access, id, null, status, userId)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'reservation.create',
        entity: 'reservation',
        entityId: id,
        summary: {
          reservationNo,
          status,
          source: input.source,
          customerNo: p.customer.customerNo,
          corporateAccountNo: p.account?.accountNo ?? null,
          bookerNo: p.booker?.customerNo ?? null,
          drivers: p.drivers.map((d) => d.customerNo),
          vehicleClass: p.cls.name,
          vehicle: p.vehicle?.plate ?? null,
          pickupBranch: plan.pickupBranch.code,
          returnBranch: plan.returnBranch.code,
          pickupAt: plan.pickupAt,
          returnAt: plan.returnAt,
        },
      })
      return getReservation(tx, access, id, await docsContext(tx, access))
    })
    return reply.code(201).send(created)
  })

  /** Edits a pending or confirmed reservation. A confirmed one keeps its vehicle, is re-checked and needs a reason (R7). */
  app.put('/:id', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'reservations.manage', async (tx, access) => {
      const input = reservationUpdateSchema.parse(req.body)
      const cur = await lockReservation(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'pending' && cur.status !== 'confirmed') throw new AppError(409, 'RESERVATION_CLOSED', 'İptal edilmiş, Gelmedi olarak işaretlenmiş veya kiralamaya dönüşmüş rezervasyon değiştirilemez.')
      const curPickupLocal = moment(cur.pickup_at, cur.pickup_timezone as string).local
      const pickupChanged = input.pickupLocal !== curPickupLocal || input.pickupBranchId !== cur.pickup_branch_id
      const plan = await resolvePlan(tx, access, input, { checkPast: pickupChanged, requireScope: true })
      // Scope of the current pickup branch too: a branch-limited user cannot move another branch's reservation into theirs.
      if (!inScope(access, cur.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu rezervasyonu değiştirme yetkiniz yok.')
      const p = await resolveParties(tx, input, cur)
      const confirmed = cur.status === 'confirmed'
      const scheduleChanged =
        toIso(cur.pickup_at) !== plan.pickupAt || toIso(cur.return_at) !== plan.returnAt || cur.pickup_branch_id !== plan.pickupBranch.id || cur.return_branch_id !== plan.returnBranch.id || cur.vehicle_class_id !== p.cls.id || (cur.vehicle_id ?? null) !== (p.vehicle?.id ?? null)
      if (confirmed && !p.vehicle) throw new AppError(409, 'VEHICLE_REQUIRED', 'Onaylı rezervasyondan araç kaldırılamaz. Aracı değiştirebilir veya rezervasyonu iptal edebilirsiniz.', { vehicleId: 'Araç seçin' })
      if (confirmed && scheduleChanged && !input.changeReason) throw invalid({ changeReason: 'Onaylı rezervasyonda tarih, şube, sınıf veya araç değişikliği için gerekçe seçin' })
      if (confirmed && scheduleChanged && p.vehicle) await assertVehicleFree(tx, access.companyId, p.vehicle, plan.pickupAt, plan.returnAt, id)
      const userId = req.auth!.user.id
      const changes: Record<string, [unknown, unknown]> = {}
      const track = (field: string, before: unknown, after: unknown) => {
        if (String(before ?? null) !== String(after ?? null)) changes[field] = [before ?? null, after ?? null]
      }
      track('pickupAt', toIso(cur.pickup_at), plan.pickupAt)
      track('returnAt', toIso(cur.return_at), plan.returnAt)
      track('pickupBranch', cur.pb_code, plan.pickupBranch.code)
      track('returnBranch', cur.rb_code, plan.returnBranch.code)
      track('vehicleClass', cur.class_name, p.cls.name)
      track('vehicle', cur.plate, p.vehicle?.plate)
      track('customer', cur.customer_no, p.customer.customerNo)
      track('corporateAccount', cur.account_no, p.account?.accountNo)
      track('booker', cur.booker_no, p.booker?.customerNo)
      track('source', cur.source, input.source)
      const oldDrivers = ((await tx.execute(sql`select c.customer_no, d.is_primary from reservation_drivers d join customers c on c.company_id = d.company_id and c.id = d.customer_id where d.reservation_id = ${id} and d.removed_at is null order by c.customer_no`)).rows as Row[]).map((d) => `${d.customer_no}${d.is_primary ? '*' : ''}`)
      const newDrivers = p.drivers.map((d) => `${d.customerNo}${d.isPrimary ? '*' : ''}`).sort()
      if (oldDrivers.join() !== newDrivers.join()) changes.drivers = [oldDrivers, newDrivers]
      const noteChanged = (cur.note ?? null) !== (input.note ?? null)
      if (!Object.keys(changes).length && !noteChanged) return getReservation(tx, access, id, await docsContext(tx, access))
      await tx
        .execute(sql`update reservations set source = ${input.source}, customer_id = ${p.customer.id}, corporate_account_id = ${p.account?.id ?? null}, booker_customer_id = ${p.booker?.id ?? null},
            vehicle_class_id = ${p.cls.id}, vehicle_id = ${p.vehicle?.id ?? null}, pickup_branch_id = ${plan.pickupBranch.id}, return_branch_id = ${plan.returnBranch.id},
            pickup_at = ${plan.pickupAt}, return_at = ${plan.returnAt}, pickup_timezone = ${plan.pickupBranch.timezone}, return_timezone = ${plan.returnBranch.timezone},
            note = ${input.note ?? null}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
        .catch(mapGuard)
      if (changes.drivers) await setDrivers(tx, access, id, userId, p.drivers)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'reservation.update',
        entity: 'reservation',
        entityId: id,
        summary: { reservationNo: cur.reservation_no, status: cur.status, fromVersion: input.version, changes, noteChanged, ...(input.changeReason && scheduleChanged ? { changeReason: input.changeReason } : {}) },
      })
      return getReservation(tx, access, id, await docsContext(tx, access))
    })
  })

  /** Pending → Confirmed: needs a specific vehicle (R1) and re-checks it in this transaction (spec §9.2). */
  app.post('/:id/confirm', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'reservations.confirm', async (tx, access) => {
      const input = reservationConfirmSchema.parse(req.body)
      const cur = await lockReservation(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'pending') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız bekleyen rezervasyon onaylanabilir.')
      if (!inScope(access, cur.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin rezervasyonunu onaylama yetkiniz yok.')
      if (!cur.vehicle_id) throw new AppError(409, 'VEHICLE_REQUIRED', 'Onaylamak için belirli bir araç atayın. Araç sınıfı kapasitesi bakım, transfer ve kiralama kayıtları henüz ACARVO’da olmadığı için doğrulanamaz.', { vehicleId: 'Araç atayın' })
      const v = (await tx.execute(sql`select id, plate, status from vehicles where id = ${cur.vehicle_id as string}`)).rows[0] as Row
      await assertVehicleFree(tx, access.companyId, { id: v.id as string, plate: v.plate as string, status: v.status as string }, toIso(cur.pickup_at), toIso(cur.return_at), id)
      const userId = req.auth!.user.id
      await tx.execute(sql`update reservations set status = 'confirmed', confirmed_at = now(), confirmed_by = ${userId}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`).catch(mapGuard)
      await statusEvent(tx, access, id, 'pending', 'confirmed', userId)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'reservation.confirm', entity: 'reservation', entityId: id, summary: { reservationNo: cur.reservation_no, fromVersion: input.version, vehicle: v.plate } })
      return getReservation(tx, access, id, await docsContext(tx, access))
    })
  })

  app.post('/:id/cancel', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'reservations.manage', async (tx, access) => {
      const input = reservationCancelSchema.parse(req.body)
      const cur = await lockReservation(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'pending' && cur.status !== 'confirmed') throw new AppError(409, 'INVALID_TRANSITION', 'Bu rezervasyon zaten kapanmış; iptal edilemez.')
      if (!inScope(access, cur.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin rezervasyonunu iptal etme yetkiniz yok.')
      const userId = req.auth!.user.id
      await tx
        .execute(sql`update reservations set status = 'cancelled', cancel_reason = ${input.reason}, cancel_note = ${input.note ?? null}, cancelled_at = now(), cancelled_by = ${userId},
          version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
        .catch(mapGuard)
      await statusEvent(tx, access, id, cur.status as string, 'cancelled', userId, input.reason, input.note)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'reservation.cancel', entity: 'reservation', entityId: id, summary: { reservationNo: cur.reservation_no, fromStatus: cur.status, fromVersion: input.version, reason: input.reason } })
      return getReservation(tx, access, id, await docsContext(tx, access))
    })
  })

  /** §59BF: only a confirmed reservation whose pickup time has passed (R8). No fee is added. */
  app.post('/:id/no-show', async (req) => {
    const id = parseId(req)
    return withCompany(req, 'reservations.manage', async (tx, access) => {
      const input = reservationNoShowSchema.parse(req.body)
      const cur = await lockReservation(tx, access, id)
      if (cur.version !== input.version) throw await conflict(tx, access, id)
      if (cur.status !== 'confirmed') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız onaylı rezervasyon Gelmedi olarak işaretlenebilir.')
      if (Date.parse(toIso(cur.pickup_at)) > Date.now()) throw new AppError(409, 'PICKUP_NOT_PASSED', 'Alış zamanı henüz gelmedi; Gelmedi işareti alış zamanından sonra verilebilir.')
      if (!inScope(access, cur.pickup_branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin rezervasyonunu işaretleme yetkiniz yok.')
      const userId = req.auth!.user.id
      await tx
        .execute(sql`update reservations set status = 'no_show', no_show_reason = ${input.reason}, no_show_note = ${input.note ?? null}, no_show_at = now(), no_show_by = ${userId},
          version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
        .catch(mapGuard)
      await statusEvent(tx, access, id, 'confirmed', 'no_show', userId, input.reason, input.note)
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'reservation.no_show', entity: 'reservation', entityId: id, summary: { reservationNo: cur.reservation_no, fromVersion: input.version, reason: input.reason } })
      return getReservation(tx, access, id, await docsContext(tx, access))
    })
  })
}

/** 360° tabs of customers, corporate accounts and vehicles. */
export async function relatedReservationRoutes(app: FastifyInstance) {
  app.get('/customers/:id/reservations', async (req) => {
    const id = parseId(req, CUSTOMER_NOT_FOUND)
    return withCompany(req, 'reservations.read', async (tx, access) => {
      need(access, 'customers.read')
      return {
        items: await relatedReservations(
          tx,
          access,
          sql`(r.customer_id = ${id} or r.booker_customer_id = ${id} or exists (select 1 from reservation_drivers d where d.company_id = r.company_id and d.reservation_id = r.id and d.customer_id = ${id} and d.removed_at is null))`,
        ),
      }
    })
  })
  app.get('/corporate-accounts/:id/reservations', async (req) => {
    const id = parseId(req, 'Kurumsal hesap bulunamadı.')
    return withCompany(req, 'reservations.read', async (tx, access) => {
      need(access, 'corporate.read')
      return { items: await relatedReservations(tx, access, sql`r.corporate_account_id = ${id}`) }
    })
  })
  app.get('/vehicles/:id/reservations', async (req) => {
    const id = parseId(req, 'Araç bulunamadı.')
    return withCompany(req, 'reservations.read', async (tx, access) => {
      need(access, 'vehicles.read')
      return { items: await relatedReservations(tx, access, sql`r.vehicle_id = ${id}`) }
    })
  })
}
