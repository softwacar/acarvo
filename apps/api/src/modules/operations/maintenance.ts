import {
  type AllocationConflict,
  allocationConflictText,
  maintenanceApproveSchema,
  maintenanceCompleteSchema,
  maintenanceCreateSchema,
  type MaintenanceDetail,
  type MaintenanceListItem,
  type MaintenanceListResponse,
  maintenanceReasonSchema,
  type MaintenanceSearch,
  maintenanceSearchSchema,
  maintenanceStartSchema,
  maintenanceUpdateSchema,
  maintenanceWorkDoneSchema,
  OPERATION_BACKDATE_HOURS,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { actualTime, branchRow, resolveLocal } from '../../lib/branch-time'
import { AppError, notFound } from '../../lib/errors'
import { assertOdometer } from '../../lib/odometer-check'
import { toIso } from '../../lib/timestamps'
import { lockVehicleAllocation, vehicleBusy } from '../../lib/vehicle-allocation'
import { withCompany } from '../../plugins/auth'
import { UPLOAD_RATE_LIMIT } from '../../plugins/security'
import type { CompanyAccess } from '../auth/context'
import { nextNo } from '../pricing/repository'
import { moment } from '../reservations/repository'
import { inScope } from '../vehicles/repository'
import { requirePhotoGrant } from './photo-access'
import {
  activeBranch,
  addEvent,
  branchRef,
  branchScopeSql,
  guarded,
  insertFile,
  invalid,
  isoOrNull,
  loadEvents,
  loadPhotos,
  MAINTENANCE_EVENTS,

  num,
  operationalVehicle,
  operationBranches,
  parseId,
  parsePhoto,
  receivePhoto,
  replayOf,
  type Row,
  str,
  streamFile,
  uploadPolicy,
} from './common'

// Maintenance V1 (plan §2): planning is not taking into service; completion is not "ready for handover"; a plan never
// silently creates a conflicting commitment; nothing is deleted; completed records never change.

export const MAINTENANCE_NOT_FOUND = 'Bakım kaydı bulunamadı veya bu kayda erişim yetkiniz yok.'
/** A plan may start a little in the past (recorded late), never further back. */
const PLAN_PAST_HOURS = 24

const LIST_SELECT = sql`
  m.id, m.maintenance_no, m.status, m.type, m.reason, m.timezone, m.planned_start_at, m.planned_end_at, m.actual_start_at, m.completed_at, m.provider_name,
  v.id as v_id, v.plate as v_plate, v.make as v_make, v.model as v_model,
  b.id as b_id, b.name as b_name, b.code as b_code`
const LIST_FROM = sql`
  from maintenance_records m
  join vehicles v on v.company_id = m.company_id and v.id = m.vehicle_id
  join branches b on b.company_id = m.company_id and b.id = m.branch_id`
const OVERDUE = sql`(m.status in ('in_service', 'awaiting_check', 'planned') and m.planned_end_at < now())`

/** Visible: the responsible branch or the vehicle's home branch is the user's. */
const scopeSql = (access: CompanyAccess) => branchScopeSql(access, sql`m.branch_id`, sql`v.home_branch_id`)

export function maintenanceItem(r: Row): MaintenanceListItem {
  const tz = r.timezone as string
  const status = r.status as MaintenanceListItem['status']
  return {
    id: r.id as string,
    maintenanceNo: r.maintenance_no as string,
    status,
    type: r.type as MaintenanceListItem['type'],
    reason: r.reason as string,
    vehicle: { id: r.v_id as string, plate: r.v_plate as string, make: r.v_make as string, model: r.v_model as string },
    branch: branchRef(r, 'b'),
    plannedStart: moment(r.planned_start_at, tz),
    plannedEnd: moment(r.planned_end_at, tz),
    actualStartAt: isoOrNull(r.actual_start_at),
    completedAt: isoOrNull(r.completed_at),
    providerName: str(r.provider_name),
    overdue: ['planned', 'in_service', 'awaiting_check'].includes(status) && Date.parse(toIso(r.planned_end_at)) < Date.now(),
  }
}

const VIEW_SQL: Record<MaintenanceSearch['view'], SQL> = {
  open: sql`m.status in ('pending_approval', 'planned', 'in_service', 'awaiting_check')`,
  pending_approval: sql`m.status = 'pending_approval'`,
  planned: sql`m.status = 'planned'`,
  in_service: sql`m.status = 'in_service'`,
  awaiting_check: sql`m.status = 'awaiting_check'`,
  overdue: OVERDUE,
  completed: sql`m.status = 'completed'`,
  cancelled: sql`m.status = 'cancelled'`,
  all: sql`true`,
}
const SORT_SQL: Record<MaintenanceSearch['sort'], string> = { planned: 'm.planned_start_at', created: 'm.created_at', number: 'm.maintenance_no' }
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export async function listMaintenance(tx: Tx, access: CompanyAccess, q: MaintenanceSearch, extra?: SQL): Promise<MaintenanceListResponse> {
  const conds: SQL[] = [scopeSql(access)]
  if (extra) conds.push(extra)
  if (q.branchId) conds.push(sql`m.branch_id = ${q.branchId}`)
  if (q.vehicleId) conds.push(sql`m.vehicle_id = ${q.vehicleId}`)
  if (q.type) conds.push(sql`m.type = ${q.type}`)
  if (q.q) {
    const like = `%${escapeLike(q.q.trim())}%`
    const plate = `%${escapeLike(q.q.replace(/[\s-]/g, '').toUpperCase())}%`
    conds.push(sql`(m.maintenance_no ilike ${like} or v.plate_normalized like ${plate} or m.reason ilike ${like} or m.provider_name ilike ${like})`)
  }
  const base = sql.join(conds, sql` and `)
  const where = sql`${base} and ${VIEW_SQL[q.view]}`
  const order = sql.raw(`${SORT_SQL[q.sort]} ${q.dir === 'asc' ? 'asc' : 'desc'}, m.maintenance_no desc`)
  const rows = (await tx.execute(sql`select ${LIST_SELECT} ${LIST_FROM} where ${where} order by ${order} limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)).rows as Row[]
  const totals = (
    await tx.execute(sql`select count(*) filter (where ${VIEW_SQL[q.view]})::int as total,
        count(*) filter (where m.status = 'pending_approval')::int as pending_approval,
        count(*) filter (where m.status = 'planned')::int as planned,
        count(*) filter (where m.status = 'in_service')::int as in_service,
        count(*) filter (where m.status = 'awaiting_check')::int as awaiting_check,
        count(*) filter (where ${OVERDUE})::int as overdue
      ${LIST_FROM} where ${base}`)
  ).rows[0] as Row
  return {
    items: rows.map(maintenanceItem),
    total: Number(totals.total),
    page: q.page,
    pageSize: q.pageSize,
    counts: {
      pending_approval: Number(totals.pending_approval),
      planned: Number(totals.planned),
      in_service: Number(totals.in_service),
      awaiting_check: Number(totals.awaiting_check),
      overdue: Number(totals.overdue),
    },
  }
}

/** What would conflict with this record's hold (damage blocks never do: repairs need the vehicle). */
async function holdConflicts(tx: Tx, companyId: string, vehicleId: string, from: string, to: string | null, exceptId?: string): Promise<AllocationConflict[]> {
  return (await vehicleBusy(tx, companyId, vehicleId, from, to, { maintenanceId: exceptId ?? null })).filter((c) => c.kind !== 'damage')
}

async function getMaintenance(app: FastifyInstance, tx: Tx, access: CompanyAccess, id: string): Promise<MaintenanceDetail> {
  const r = (
    await tx.execute(sql`select ${LIST_SELECT}, m.*, v.status as v_status, v.home_branch_id as v_home, vc.name as v_class,
        d.damage_no, d.review_status as d_review, au.name as approved_by_name, su.name as started_by_name, cu.name as completed_by_name, cr.name as created_by_name
      ${LIST_FROM}
      join vehicle_classes vc on vc.company_id = v.company_id and vc.id = v.class_id
      left join damage_files d on d.company_id = m.company_id and d.id = m.damage_file_id
      left join users au on au.id = m.approved_by left join users su on su.id = m.started_by left join users cu on cu.id = m.completed_by left join users cr on cr.id = m.created_by
      where m.id = ${id} and ${scopeSql(access)}`)
  ).rows[0] as Row | undefined
  if (!r) throw notFound(MAINTENANCE_NOT_FOUND)
  const item = maintenanceItem(r)
  const open = ['pending_approval', 'planned', 'in_service', 'awaiting_check'].includes(item.status)
  const from = item.status === 'in_service' || item.status === 'awaiting_check' ? item.actualStartAt! : item.plannedStart.at
  const conflicts = open ? await holdConflicts(tx, access.companyId, item.vehicle.id, from, item.plannedEnd.at > from ? item.plannedEnd.at : null, id) : []
  return {
    ...item,
    timeZone: r.timezone as string,
    workDoneAt: isoOrNull(r.work_done_at),
    startKm: num(r.start_km),
    endKm: num(r.end_km),
    atProvider: r.at_provider as boolean,
    workDone: str(r.work_done),
    parts: str(r.parts),
    notes: str(r.notes),
    damageFile: r.damage_file_id ? { id: r.damage_file_id as string, damageNo: r.damage_no as string, reviewStatus: r.d_review as never } : null,
    approvedAt: isoOrNull(r.approved_at),
    approvedByName: str(r.approved_by_name),
    startedByName: str(r.started_by_name),
    completedByName: str(r.completed_by_name),
    cancelledAt: isoOrNull(r.cancelled_at),
    cancelReason: str(r.cancel_reason),
    createdAt: toIso(r.created_at),
    createdByName: str(r.created_by_name),
    version: Number(r.version),
    conflicts,
    vehicle: { ...item.vehicle, className: r.v_class as string, status: r.v_status as string, homeBranchId: r.v_home as string },
    photos: await loadPhotos(tx, 'maintenance_photos', 'maintenance_id', id, `/api/maintenance/${id}/photos`),
    events: await loadEvents(tx, MAINTENANCE_EVENTS, id),
    uploadPolicy: uploadPolicy(app),
  }
}

/** Locks the record for this step; out of scope looks like unknown. Mutations need the responsible branch. */
async function lockMaintenance(tx: Tx, access: CompanyAccess, id: string) {
  const r = (
    await tx.execute(sql`select m.*, v.plate, v.home_branch_id from maintenance_records m join vehicles v on v.company_id = m.company_id and v.id = m.vehicle_id
      where m.id = ${id} for update of m`)
  ).rows[0] as Row | undefined
  if (!r || !(inScope(access, r.branch_id as string) || inScope(access, r.home_branch_id as string))) throw notFound(MAINTENANCE_NOT_FOUND)
  if (!inScope(access, r.branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu bakımın sorumlu şubesinde işlem yetkiniz yok.')
  return r
}

const conflictError = (plate: string, conflicts: AllocationConflict[], hint: string) =>
  new AppError(409, 'MAINTENANCE_CONFLICT', `${plate} bu dönemde müsait değil: ${conflicts.map(allocationConflictText).join(', ')}. ${hint}`, undefined, { conflicts })

export async function maintenanceRoutes(app: FastifyInstance) {
  const detail = (tx: Tx, access: CompanyAccess, id: string) => getMaintenance(app, tx, access, id)
  const versionConflict = async (tx: Tx, access: CompanyAccess, id: string) =>
    new AppError(409, 'VERSION_CONFLICT', 'Bu bakım kaydı siz çalışırken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await detail(tx, access, id) })

  app.get('/branches', async (req) => withCompany(req, 'maintenance.read', async (tx, access) => operationBranches(tx, access)))

  /** List and search. POST so that plates and notes never travel in a URL. */
  app.post('/search', async (req) => withCompany(req, 'maintenance.read', async (tx, access) => listMaintenance(tx, access, maintenanceSearchSchema.parse(req.body ?? {}))))

  app.get('/:id', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.read', async (tx, access) => detail(tx, access, id))
  })

  /**
   * A plan. Without conflicts it holds the vehicle at once (planned). With conflicts it is refused with the conflicting
   * records, unless the user keeps it as "pending approval", which holds nothing until approved without conflicts.
   */
  app.post('/', async (req, reply) =>
    withCompany(req, 'maintenance.manage', async (tx, access) => {
      const input = maintenanceCreateSchema.parse(req.body)
      const userId = req.auth!.user.id
      const prior = (await tx.execute(sql`select id from maintenance_records where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
      if (prior) return reply.code(200).send(await detail(tx, access, prior.id as string))
      const vehicle = await operationalVehicle(tx, access, input.vehicleId)
      if (vehicle.status === 'sold' || vehicle.status === 'disposed') throw invalid({ vehicleId: 'Araç artık filoda değil' })
      const b = await activeBranch(tx, access, input.branchId, 'branchId', true, 'bakım planlama')
      const start = resolveLocal(input.plannedStartLocal, b, input.plannedStartChoice, 'plannedStartLocal', 'plannedStartChoice')
      const end = resolveLocal(input.plannedEndLocal, b, input.plannedEndChoice, 'plannedEndLocal', 'plannedEndChoice')
      if (Date.parse(end) <= Date.parse(start)) throw invalid({ plannedEndLocal: 'Bitiş başlangıçtan sonra olmalı' })
      if (Date.parse(end) - Date.parse(start) > 180 * 86_400_000) throw invalid({ plannedEndLocal: 'Bir bakım planı en fazla 180 gün olabilir' })
      if (Date.parse(start) < Date.now() - PLAN_PAST_HOURS * 3_600_000) throw invalid({ plannedStartLocal: `Planlanan başlangıç en fazla ${PLAN_PAST_HOURS} saat öncesi olabilir` })
      if (input.damageFileId) {
        const d = (await tx.execute(sql`select vehicle_id from damage_files where id = ${input.damageFileId}`)).rows[0] as Row | undefined
        if (!d || d.vehicle_id !== vehicle.id) throw invalid({ damageFileId: 'Hasar dosyası bu araca ait değil' })
      }
      await lockVehicleAllocation(tx, access.companyId, vehicle.id)
      const conflicts = await holdConflicts(tx, access.companyId, vehicle.id, start, end)
      if (conflicts.length && !input.keepPending) {
        throw conflictError(vehicle.plate, conflicts, 'Bakım çakışan bir taahhüt oluşturamaz: tarihi değiştirin veya planı onay bekleyen olarak kaydedin (aracı tutmaz).')
      }
      const status = conflicts.length ? 'pending_approval' : 'planned'
      const no = await nextNo(tx, access.companyId, 'maintenance', 'B')
      const row = (
        await guarded(
          tx.execute(sql`insert into maintenance_records (company_id, maintenance_no, vehicle_id, branch_id, type, reason, status, planned_start_at, planned_end_at, timezone,
              provider_name, notes, damage_file_id, client_request_id, created_by, updated_by)
            values (${access.companyId}, ${no}, ${vehicle.id}, ${b.id}, ${input.type}, ${input.reason}, ${status}, ${start}, ${end}, ${b.timezone},
              ${input.providerName ?? null}, ${input.notes ?? null}, ${input.damageFileId ?? null}, ${input.requestId}, ${userId}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const id = row.id as string
      const data = { type: input.type, plannedStartAt: start, plannedEndAt: end, branch: b.code, conflicts: conflicts.map(allocationConflictText) }
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'created', userId, { to: status, data })
      if (input.damageFileId) await addEvent(tx, { table: 'damage_events', fk: 'damage_id' }, access.companyId, input.damageFileId, 'updated', userId, { data: { maintenanceNo: no } })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.create', entity: 'maintenance', entityId: id, summary: { maintenanceNo: no, vehicle: vehicle.plate, status, ...data } })
      return reply.code(201).send(await detail(tx, access, id))
    }),
  )

  /** Plan and texts. The plan changes before the work starts; the expected end also while it runs (re-checked). */
  app.put('/:id', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.manage', async (tx, access) => {
      const input = maintenanceUpdateSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      const status = cur.status as string
      if (status === 'completed' || status === 'cancelled') throw new AppError(409, 'INVALID_TRANSITION', 'Tamamlanmış veya iptal edilmiş bakım değiştirilemez.')
      const started = status === 'in_service' || status === 'awaiting_check'
      if (started && (input.type || input.plannedStartLocal || input.providerName !== undefined)) {
        throw new AppError(409, 'IMMUTABLE', 'Servise alınmış bakımın türü, başlangıcı ve servis sağlayıcısı değiştirilemez.')
      }
      const b = (await branchRow(tx, cur.branch_id as string))!
      const start = input.plannedStartLocal ? resolveLocal(input.plannedStartLocal, b, input.plannedStartChoice, 'plannedStartLocal', 'plannedStartChoice') : toIso(cur.planned_start_at)
      const end = input.plannedEndLocal ? resolveLocal(input.plannedEndLocal, b, input.plannedEndChoice, 'plannedEndLocal', 'plannedEndChoice') : toIso(cur.planned_end_at)
      if (Date.parse(end) <= Date.parse(start)) throw invalid({ plannedEndLocal: 'Bitiş başlangıçtan sonra olmalı' })
      if (started && input.plannedEndLocal && Date.parse(end) <= Date.now()) throw invalid({ plannedEndLocal: 'Süren bakımda beklenen bitiş gelecekte olmalı' })
      const planChanged = start !== toIso(cur.planned_start_at) || end !== toIso(cur.planned_end_at)
      if (planChanged && status !== 'pending_approval') {
        await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
        const from = started ? toIso(cur.actual_start_at) : start
        const conflicts = await holdConflicts(tx, access.companyId, cur.vehicle_id as string, from, end, id)
        if (conflicts.length) throw conflictError(cur.plate as string, conflicts, 'Plan değiştirilmedi.')
      }
      const userId = req.auth!.user.id
      const text = (v: string | undefined, old: unknown) => (v === undefined ? (old as string | null) : v || null)
      await guarded(
        tx.execute(sql`update maintenance_records set type = ${input.type ?? (cur.type as string)}, reason = ${input.reason ?? (cur.reason as string)},
            planned_start_at = ${start}, planned_end_at = ${end}, provider_name = ${text(input.providerName, cur.provider_name)}, notes = ${text(input.notes, cur.notes)},
            work_done = ${text(input.workDone, cur.work_done)}, parts = ${text(input.parts, cur.parts)},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { planChanged, plannedStartAt: start, plannedEndAt: end }
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'updated', userId, { from: status, to: status, data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.update', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /** Pending approval → planned: only without conflicts at this moment (re-checked under the vehicle lock). */
  app.post('/:id/approve', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.approve', async (tx, access) => {
      const input = maintenanceApproveSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      if (cur.status !== 'pending_approval') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız onay bekleyen bakım planı onaylanabilir.')
      await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
      const conflicts = await holdConflicts(tx, access.companyId, cur.vehicle_id as string, toIso(cur.planned_start_at), toIso(cur.planned_end_at), id)
      if (conflicts.length) throw conflictError(cur.plate as string, conflicts, 'Plan onaylanmadı; çakışan kayıtlar çözülmeden araç bakım için ayrılamaz.')
      const userId = req.auth!.user.id
      await guarded(tx.execute(sql`update maintenance_records set status = 'planned', approved_at = now(), approved_by = ${userId}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'approved', userId, { from: 'pending_approval', to: 'planned', requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.approve', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, fromVersion: input.version } })
      return detail(tx, access, id)
    })
  })

  /**
   * Taking the vehicle into service (planned or pending → in service): the real start, never in the future; the vehicle
   * must be free from then to the expected end (no active rental, confirmed reservation, transfer or other maintenance).
   * An optional start km and a service-provider location go to the vehicle history in the same transaction.
   */
  app.post('/:id/start', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.manage', async (tx, access) => {
      const input = maintenanceStartSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      if (cur.status !== 'planned' && cur.status !== 'pending_approval') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız planlanmış bakım servise alınabilir.')
      const b = (await branchRow(tx, cur.branch_id as string))!
      const startedAt = actualTime(input.startedLocal, b, input.startedChoice, 'startedLocal', 'startedChoice', OPERATION_BACKDATE_HOURS)
      let end = toIso(cur.planned_end_at)
      if (input.expectedEndLocal) end = resolveLocal(input.expectedEndLocal, b, input.expectedEndChoice, 'expectedEndLocal', 'expectedEndChoice')
      if (Date.parse(end) <= Math.max(Date.now(), Date.parse(startedAt))) {
        throw invalid({ expectedEndLocal: 'Planlanan bitiş geçti; beklenen yeni bitişi girin' }, 'Planlanan bitiş geçmiş. Bakımın ne zaman biteceğini girin; araç süresiz tutulmaz.')
      }
      const providerName = input.providerName ?? str(cur.provider_name)
      if (input.atProvider && !providerName) throw invalid({ providerName: 'Servis sağlayıcının adını girin' })
      const vehicleId = cur.vehicle_id as string
      await lockVehicleAllocation(tx, access.companyId, vehicleId)
      const conflicts = await holdConflicts(tx, access.companyId, vehicleId, startedAt, end, id)
      if (conflicts.length) throw conflictError(cur.plate as string, conflicts, 'Araç servise alınmadı. Rezervasyonlar otomatik iptal edilmez; önce ilgili kayıtları çözün.')
      const userId = req.auth!.user.id
      let readingId: string | null = null
      let locationId: string | null = null
      let jump = null
      if (input.km != null) {
        jump = await assertOdometer(tx, vehicleId, input.km, startedAt, input.largeJumpReason)
        readingId = (
          (
            await guarded(
              tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
                values (${access.companyId}, ${vehicleId}, ${input.km}, 'maintenance_start', 'maintenance_start', ${id}, ${startedAt}, ${jump ? input.largeJumpReason! : null}, ${userId}) returning id`),
            )
          ).rows[0] as Row
        ).id as string
      }
      if (input.atProvider) {
        locationId = (
          (
            await guarded(
              tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, description, event_type, source_type, source_id, occurred_at, recorded_by)
                values (${access.companyId}, ${vehicleId}, 'service_provider', ${providerName}, 'maintenance_start', 'maintenance_start', ${id}, ${startedAt}, ${userId}) returning id`),
            )
          ).rows[0] as Row
        ).id as string
      }
      await guarded(
        // Started earlier than planned: the plan's start moves to the real start (the original plan stays in the event).
        tx.execute(sql`update maintenance_records set status = 'in_service', actual_start_at = ${startedAt}, started_by = ${userId}, planned_end_at = ${end},
            planned_start_at = least(planned_start_at, ${startedAt}::timestamptz),
            at_provider = ${input.atProvider}, provider_name = ${providerName}, start_km = ${input.km ?? null}, start_odometer_reading_id = ${readingId},
            start_location_event_id = ${locationId}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { startedAt, expectedEndAt: end, plannedStartAt: toIso(cur.planned_start_at), plannedEndAt: toIso(cur.planned_end_at), km: input.km ?? null, atProvider: input.atProvider, largeJump: !!jump }
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'started', userId, { from: cur.status as string, to: 'in_service', data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.start', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, vehicle: cur.plate, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /** In service → awaiting the check: the work is recorded; the vehicle is still held. */
  app.post('/:id/work-done', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.manage', async (tx, access) => {
      const input = maintenanceWorkDoneSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      if (cur.status !== 'in_service') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız serviste olan bakım için iş bitti kaydedilebilir.')
      const b = (await branchRow(tx, cur.branch_id as string))!
      const doneAt = actualTime(input.doneLocal, b, input.doneChoice, 'doneLocal', 'doneChoice', OPERATION_BACKDATE_HOURS)
      if (Date.parse(doneAt) < Date.parse(toIso(cur.actual_start_at))) throw invalid({ doneLocal: 'İşin bitişi servise alınmadan önce olamaz' })
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update maintenance_records set status = 'awaiting_check', work_done_at = ${doneAt}, work_done_by = ${userId}, work_done = ${input.workDone},
            parts = coalesce(${input.parts ?? null}, parts), version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'work_done', userId, { from: 'in_service', to: 'awaiting_check', data: { doneAt }, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.work_done', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, fromVersion: input.version, doneAt } })
      return detail(tx, access, id)
    })
  })

  /** The check sends the work back (awaiting the check → in service), with a reason. */
  app.post('/:id/return-to-work', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.approve', async (tx, access) => {
      const input = maintenanceReasonSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      if (cur.status !== 'awaiting_check') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız kontrol bekleyen bakım işe geri gönderilebilir.')
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update maintenance_records set status = 'in_service', work_done_at = null, work_done_by = null, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'started', userId, { from: 'awaiting_check', to: 'in_service', reason: input.reason, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.return_to_work', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, fromVersion: input.version } })
      return detail(tx, access, id)
    })
  })

  /**
   * Awaiting the check → completed: completion km (required, not below the start km) and, after a provider visit, the
   * branch the vehicle comes back to, both into the vehicle history atomically. Completion is not "ready for handover".
   */
  app.post('/:id/complete', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.approve', async (tx, access) => {
      const input = maintenanceCompleteSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      if (cur.status !== 'awaiting_check') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız kontrol bekleyen bakım tamamlanabilir.')
      const b = (await branchRow(tx, cur.branch_id as string))!
      const completedAt = actualTime(input.completedLocal, b, input.completedChoice, 'completedLocal', 'completedChoice', OPERATION_BACKDATE_HOURS)
      if (Date.parse(completedAt) < Date.parse(toIso(cur.work_done_at))) throw invalid({ completedLocal: 'Tamamlanma işin bitişinden önce olamaz' })
      if (cur.start_km != null && input.km < Number(cur.start_km)) {
        throw new AppError(422, 'KM_BELOW_START', `Tamamlanma kilometresi başlangıç kilometresinden (${Number(cur.start_km).toLocaleString('tr-TR')} km) düşük olamaz.`, { km: 'Başlangıçtan düşük olamaz' })
      }
      let returnBranch = null
      if (cur.at_provider) {
        if (!input.returnBranchId) throw invalid({ returnBranchId: 'Aracın servisten döndüğü şubeyi seçin' })
        returnBranch = await activeBranch(tx, access, input.returnBranchId, 'returnBranchId', false)
      }
      const vehicleId = cur.vehicle_id as string
      const jump = await assertOdometer(tx, vehicleId, input.km, completedAt, input.largeJumpReason)
      const userId = req.auth!.user.id
      const reading = (
        await guarded(
          tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
            values (${access.companyId}, ${vehicleId}, ${input.km}, 'maintenance_end', 'maintenance_end', ${id}, ${completedAt}, ${jump ? input.largeJumpReason! : null}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      let locationId: string | null = null
      if (returnBranch) {
        locationId = (
          (
            await guarded(
              tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, description, event_type, source_type, source_id, occurred_at, recorded_by)
                values (${access.companyId}, ${vehicleId}, 'branch', ${returnBranch.id}, ${cur.maintenance_no as string}, 'maintenance_end', 'maintenance_end', ${id}, ${completedAt}, ${userId}) returning id`),
            )
          ).rows[0] as Row
        ).id as string
      }
      await guarded(
        tx.execute(sql`update maintenance_records set status = 'completed', completed_at = ${completedAt}, completed_by = ${userId}, end_km = ${input.km},
            end_odometer_reading_id = ${reading.id as string}, end_location_event_id = ${locationId}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { completedAt, km: input.km, returnBranch: returnBranch?.code ?? null, largeJump: !!jump }
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'completed', userId, { from: 'awaiting_check', to: 'completed', data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.complete', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, vehicle: cur.plate, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /** Pending or planned → cancelled, with a reason. A started maintenance is finished, never cancelled. */
  app.post('/:id/cancel', async (req) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.manage', async (tx, access) => {
      const input = maintenanceReasonSchema.parse(req.body)
      const cur = await lockMaintenance(tx, access, id)
      if (await replayOf(tx, MAINTENANCE_EVENTS, input.requestId, id)) return detail(tx, access, id)
      if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
      if (cur.status !== 'planned' && cur.status !== 'pending_approval') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız başlamamış bakım iptal edilebilir.')
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update maintenance_records set status = 'cancelled', cancelled_at = now(), cancelled_by = ${userId}, cancel_reason = ${input.reason},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'cancelled', userId, { from: cur.status as string, to: 'cancelled', reason: input.reason, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.cancel', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, fromVersion: input.version } })
      return detail(tx, access, id)
    })
  })

  // Photos (service report, parts, invoice image): only while the record is open.
  app.post('/:id/photos', { config: UPLOAD_RATE_LIMIT }, async (req, reply) => {
    const id = parseId(req, MAINTENANCE_NOT_FOUND)
    await withCompany(req, 'maintenance.manage', async (tx, access) => {
      const cur = await lockMaintenance(tx, access, id)
      if (cur.status === 'completed' || cur.status === 'cancelled') throw new AppError(409, 'RECORD_CLOSED', 'Kapanmış bakım kaydına fotoğraf eklenemez.')
    })
    const photo = await receivePhoto(app, req, 'maintenance')
    try {
      const out = await withCompany(req, 'maintenance.manage', async (tx, access) => {
        const cur = await lockMaintenance(tx, access, id)
        const userId = req.auth!.user.id
        const fileId = await insertFile(tx, access.companyId, 'maintenance_photo', photo, userId)
        const p = (await guarded(tx.execute(sql`insert into maintenance_photos (company_id, maintenance_id, file_id, created_by) values (${access.companyId}, ${id}, ${fileId}, ${userId}) returning id`))).rows[0] as Row
        await tx.execute(sql`update maintenance_records set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
        await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'photo_added', userId, { data: { photoId: p.id } })
        await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.photo.add', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, photoId: p.id, scanner: app.scanner.name } })
        return detail(tx, access, id)
      })
      return reply.code(201).send(out)
    } catch (e) {
      await app.storage.remove(photo.keys.main, photo.keys.thumb)
      throw e
    }
  })

  app.delete('/:id/photos/:photoId', async (req) => {
    const { id, photoId } = parsePhoto(req, MAINTENANCE_NOT_FOUND)
    return withCompany(req, 'maintenance.manage', async (tx, access) => {
      const cur = await lockMaintenance(tx, access, id)
      const userId = req.auth!.user.id
      const res = await guarded(tx.execute(sql`update maintenance_photos set removed_at = now(), removed_by = ${userId} where id = ${photoId} and maintenance_id = ${id} and removed_at is null returning id`))
      if (!res.rows.length) throw notFound('Fotoğraf bulunamadı.')
      await tx.execute(sql`update maintenance_records set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
      await addEvent(tx, MAINTENANCE_EVENTS, access.companyId, id, 'photo_removed', userId, { data: { photoId } })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.photo.remove', entity: 'maintenance', entityId: id, summary: { maintenanceNo: cur.maintenance_no, photoId } })
      return detail(tx, access, id)
    })
  })

  /** Streams a photo after company (RLS), permission and branch-scope checks; never cached. */
  app.get('/:id/photos/:photoId', async (req, reply) => {
    const { id, photoId } = parsePhoto(req, MAINTENANCE_NOT_FOUND)
    const variant = (req.query as { variant?: string }).variant === 'thumb' ? 'thumb' : 'main'
    const file = await withCompany(req, 'maintenance.read', async (tx, access) => {
      const r = (
        await tx.execute(sql`select f.storage_key, f.thumb_key from maintenance_photos p
          join maintenance_records m on m.company_id = p.company_id and m.id = p.maintenance_id
          join vehicles v on v.company_id = m.company_id and v.id = m.vehicle_id
          join files f on f.company_id = p.company_id and f.id = p.file_id
          where p.id = ${photoId} and m.id = ${id} and ${scopeSql(access)}`)
      ).rows[0] as Row | undefined
      if (!r) throw notFound()
      requirePhotoGrant(app, req, access.companyId, 'maintenance', id)
      return r
    })
    return streamFile(app, reply, file, variant)
  })
}

