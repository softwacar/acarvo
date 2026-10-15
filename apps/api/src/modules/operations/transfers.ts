import {
  type AllocationConflict,
  allocationConflictText,
  OPERATION_BACKDATE_HOURS,
  transferApproveSchema,
  transferCancelSchema,
  transferCreateSchema,
  transferDepartSchema,
  type TransferDetail,
  type TransferListItem,
  type TransferListResponse,
  transferReceiveSchema,
  type TransferSearch,
  transferSearchSchema,
  transferUpdateSchema,
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
import type { CompanyAccess } from '../auth/context'
import { nextNo } from '../pricing/repository'
import { moment } from '../reservations/repository'
import { inScope } from '../vehicles/repository'
import {
  activeBranch,
  addEvent,
  branchRef,
  branchScopeSql,
  currentLocation,
  guarded,
  invalid,
  isoOrNull,
  loadEvents,
  need,
  num,
  operationalVehicle,
  operationBranches,
  parseId,
  replayOf,
  type Row,
  str,
  TRANSFER_EVENTS,
} from './common'

// Vehicle transfers V1 (plan §4, spec §59R): request → approve → depart (in transit) → receive at the destination
// (= completed). In transit is not arrived; the location changes to the destination only when it is received there.
// The home branch never changes. A transfer never silently invalidates a confirmed reservation.

export const TRANSFER_NOT_FOUND = 'Transfer bulunamadı veya bu kayda erişim yetkiniz yok.'
const PLAN_PAST_HOURS = 24

const LIST_SELECT = sql`
  t.id, t.transfer_no, t.status, t.purpose, t.from_timezone, t.to_timezone, t.planned_departure_at, t.planned_arrival_at, t.departed_at, t.arrived_at,
  v.id as v_id, v.plate as v_plate, v.make as v_make, v.model as v_model,
  fb.id as fb_id, fb.name as fb_name, fb.code as fb_code, tb.id as tb_id, tb.name as tb_name, tb.code as tb_code`
const LIST_FROM = sql`
  from vehicle_transfers t
  join vehicles v on v.company_id = t.company_id and v.id = t.vehicle_id
  join branches fb on fb.company_id = t.company_id and fb.id = t.from_branch_id
  join branches tb on tb.company_id = t.company_id and tb.id = t.to_branch_id`
const LATE = sql`(t.status = 'in_transit' and t.planned_arrival_at < now())`
/** Visible to both ends of the trip. */
const scopeSql = (access: CompanyAccess) => branchScopeSql(access, sql`t.from_branch_id`, sql`t.to_branch_id`)

export function transferItem(r: Row): TransferListItem {
  return {
    id: r.id as string,
    transferNo: r.transfer_no as string,
    status: r.status as TransferListItem['status'],
    vehicle: { id: r.v_id as string, plate: r.v_plate as string, make: r.v_make as string, model: r.v_model as string },
    fromBranch: branchRef(r, 'fb'),
    toBranch: branchRef(r, 'tb'),
    plannedDeparture: moment(r.planned_departure_at, r.from_timezone as string),
    plannedArrival: moment(r.planned_arrival_at, r.to_timezone as string),
    departedAt: isoOrNull(r.departed_at),
    arrivedAt: isoOrNull(r.arrived_at),
    late: r.status === 'in_transit' && Date.parse(toIso(r.planned_arrival_at)) < Date.now(),
    purpose: r.purpose as TransferListItem['purpose'],
  }
}

export async function listTransfers(tx: Tx, access: CompanyAccess, q: TransferSearch, extra?: SQL): Promise<TransferListResponse> {
  const incoming = access.allBranches ? sql`t.status = 'in_transit'` : access.branchIds.length ? sql`(t.status = 'in_transit' and t.to_branch_id in ${access.branchIds})` : sql`false`
  const VIEW_SQL: Record<TransferSearch['view'], SQL> = {
    open: sql`t.status in ('requested', 'approved', 'in_transit')`,
    requested: sql`t.status = 'requested'`,
    approved: sql`t.status = 'approved'`,
    in_transit: sql`t.status = 'in_transit'`,
    late: LATE,
    incoming,
    completed: sql`t.status = 'completed'`,
    cancelled: sql`t.status = 'cancelled'`,
    all: sql`true`,
  }
  const SORT_SQL: Record<TransferSearch['sort'], string> = { departure: 't.planned_departure_at', arrival: 't.planned_arrival_at', created: 't.created_at', number: 't.transfer_no' }
  const conds: SQL[] = [scopeSql(access)]
  if (extra) conds.push(extra)
  if (q.branchId) conds.push(sql`(t.from_branch_id = ${q.branchId} or t.to_branch_id = ${q.branchId})`)
  if (q.vehicleId) conds.push(sql`t.vehicle_id = ${q.vehicleId}`)
  if (q.q) {
    const like = `%${q.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const plate = `%${q.q.replace(/[\s-]/g, '').toUpperCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    conds.push(sql`(t.transfer_no ilike ${like} or v.plate_normalized like ${plate} or t.reason ilike ${like})`)
  }
  const base = sql.join(conds, sql` and `)
  const order = sql.raw(`${SORT_SQL[q.sort]} ${q.dir === 'asc' ? 'asc' : 'desc'}, t.transfer_no desc`)
  const rows = (await tx.execute(sql`select ${LIST_SELECT} ${LIST_FROM} where ${base} and ${VIEW_SQL[q.view]} order by ${order} limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)).rows as Row[]
  const totals = (
    await tx.execute(sql`select count(*) filter (where ${VIEW_SQL[q.view]})::int as total,
        count(*) filter (where t.status = 'requested')::int as requested,
        count(*) filter (where t.status = 'approved')::int as approved,
        count(*) filter (where t.status = 'in_transit')::int as in_transit,
        count(*) filter (where ${LATE})::int as late,
        count(*) filter (where ${incoming})::int as incoming
      ${LIST_FROM} where ${base}`)
  ).rows[0] as Row
  return {
    items: rows.map(transferItem),
    total: Number(totals.total),
    page: q.page,
    pageSize: q.pageSize,
    counts: { requested: Number(totals.requested), approved: Number(totals.approved), in_transit: Number(totals.in_transit), late: Number(totals.late), incoming: Number(totals.incoming) },
  }
}

/** Holds that would conflict with the transfer's own (damage blocks do not: a damaged vehicle may go to a repair branch). */
async function holdConflicts(tx: Tx, companyId: string, vehicleId: string, from: string, to: string | null, exceptId?: string): Promise<AllocationConflict[]> {
  return (await vehicleBusy(tx, companyId, vehicleId, from, to, { transferId: exceptId ?? null })).filter((c) => c.kind !== 'damage')
}
/** A damage block on the vehicle in the window: a normal transfer never moves a vehicle marked not usable (BHT1). */
async function damageHolds(tx: Tx, companyId: string, vehicleId: string, from: string, to: string | null) {
  // From now on: a block lifted earlier in the planned window does not count.
  const start = new Date(Math.max(Date.parse(from), Date.now())).toISOString()
  if (to && Date.parse(to) <= Date.parse(start)) return []
  return (await vehicleBusy(tx, companyId, vehicleId, start, to)).filter((c) => c.kind === 'damage')
}
const damagedError = (plate: string, holds: AllocationConflict[]) =>
  new AppError(
    409,
    'VEHICLE_NOT_USABLE',
    `${plate} kullanılamaz olarak işaretli (${holds.map((h) => h.refNo).join(', ')}). Normal transferle yola çıkarılamaz. Onarım için taşınacaksa hasar dosyasından çekici veya taşıyıcıyla “onarım amaçlı taşıma” oluşturun.`,
    undefined,
    { conflicts: holds },
  )

async function nextCommitmentConflict(tx: Tx, companyId: string, vehicleId: string, arrival: string, destination: string) {
  const r = (await tx.execute(sql`select transfer_next_commitment_conflict(${companyId}::uuid, ${vehicleId}::uuid, ${arrival}::timestamptz, ${destination}::uuid) as ref`)).rows[0] as Row
  return str(r.ref)
}

async function getTransfer(tx: Tx, access: CompanyAccess, id: string): Promise<TransferDetail> {
  const r = (
    await tx.execute(sql`select ${LIST_SELECT}, t.*, v.status as v_status, v.home_branch_id as v_home, vc.name as v_class,
        ru.name as requested_by_name, au.name as approved_by_name, du.name as departed_by_name, eu.name as received_by_name,
        df.damage_no as df_no, exists (select 1 from damage_blocks x where x.company_id = t.company_id and x.damage_id = t.damage_file_id and x.ended_at is null) as df_blocked
      ${LIST_FROM}
      join vehicle_classes vc on vc.company_id = v.company_id and vc.id = v.class_id
      left join damage_files df on df.company_id = t.company_id and df.id = t.damage_file_id
      left join users ru on ru.id = t.created_by left join users au on au.id = t.approved_by left join users du on du.id = t.departed_by left join users eu on eu.id = t.received_by
      where t.id = ${id} and ${scopeSql(access)}`)
  ).rows[0] as Row | undefined
  if (!r) throw notFound(TRANSFER_NOT_FOUND)
  const item = transferItem(r)
  const open = item.status === 'requested' || item.status === 'approved'
  const conflicts =
    open && item.plannedArrival.at > new Date().toISOString()
      ? [
          ...(item.purpose === 'operational' ? await damageHolds(tx, access.companyId, item.vehicle.id, item.plannedDeparture.at, item.plannedArrival.at) : []),
          ...(await holdConflicts(tx, access.companyId, item.vehicle.id, item.plannedDeparture.at, item.plannedArrival.at, id)),
        ]
      : []
  const next = open ? await nextCommitmentConflict(tx, access.companyId, item.vehicle.id, item.plannedArrival.at, item.toBranch.id) : null
  const p = access.permissions
  const fromScope = inScope(access, item.fromBranch.id)
  const toScope = inScope(access, item.toBranch.id)
  const repairOk = item.purpose === 'operational' || p.has('transfers.repair')
  return {
    ...item,
    reason: r.reason as string,
    driverNote: str(r.driver_note),
    transportMethod: (r.transport_method as TransferDetail['transportMethod']) ?? null,
    transportAckAt: isoOrNull(r.transport_ack_at),
    damageFile: r.damage_file_id ? { id: r.damage_file_id as string, damageNo: r.df_no as string, blocked: r.df_blocked === true } : null,
    departureKm: num(r.departure_km),
    arrivalKm: num(r.arrival_km),
    departureFuel: (r.departure_fuel as TransferDetail['departureFuel']) ?? null,
    arrivalFuel: (r.arrival_fuel as TransferDetail['arrivalFuel']) ?? null,
    departureNote: str(r.departure_note),
    arrivalNote: str(r.arrival_note),
    requestedByName: str(r.requested_by_name),
    approvedAt: isoOrNull(r.approved_at),
    approvedByName: str(r.approved_by_name),
    departedByName: str(r.departed_by_name),
    receivedByName: str(r.received_by_name),
    cancelledAt: isoOrNull(r.cancelled_at),
    cancelReason: str(r.cancel_reason),
    createdAt: toIso(r.created_at),
    version: Number(r.version),
    vehicle: { ...item.vehicle, className: r.v_class as string, status: r.v_status as string, homeBranchId: r.v_home as string },
    conflicts,
    nextCommitmentConflict: next,
    currentLocation: await currentLocation(tx, item.vehicle.id),
    can: {
      approve: item.status === 'requested' && p.has('transfers.approve') && fromScope && repairOk,
      depart: item.status === 'approved' && p.has('transfers.execute') && fromScope && repairOk,
      receive: item.status === 'in_transit' && p.has('transfers.execute') && toScope,
      cancel: open && p.has('transfers.request') && fromScope,
      edit: open && p.has('transfers.request') && fromScope,
    },
    events: await loadEvents(tx, TRANSFER_EVENTS, id),
  }
}

/** Locks the transfer for a step. Visible to both ends; `end` says which branch must be the user's for this step. */
async function lockTransfer(tx: Tx, access: CompanyAccess, id: string, end: 'from' | 'to', what: string) {
  const r = (
    await tx.execute(sql`select t.*, v.plate, fb.code as fb_code, tb.code as tb_code, fb.name as fb_name, fb.timezone as fb_tz, tb.name as tb_name, tb.timezone as tb_tz
      from vehicle_transfers t join vehicles v on v.company_id = t.company_id and v.id = t.vehicle_id
      join branches fb on fb.company_id = t.company_id and fb.id = t.from_branch_id join branches tb on tb.company_id = t.company_id and tb.id = t.to_branch_id
      where t.id = ${id} for update of t`)
  ).rows[0] as Row | undefined
  if (!r || !(inScope(access, r.from_branch_id as string) || inScope(access, r.to_branch_id as string))) throw notFound(TRANSFER_NOT_FOUND)
  const branch = end === 'from' ? (r.from_branch_id as string) : (r.to_branch_id as string)
  if (!inScope(access, branch)) {
    throw new AppError(403, 'BRANCH_FORBIDDEN', end === 'to' ? `Teslim alma yalnız varış şubesinin (${r.tb_code as string}) işidir.` : `Bu adım yalnız çıkış şubesinin (${r.fb_code as string}) işidir: ${what}.`)
  }
  return r
}

const conflictError = (plate: string, conflicts: AllocationConflict[], hint: string) =>
  new AppError(409, 'TRANSFER_CONFLICT', `${plate} bu dönemde müsait değil: ${conflicts.map(allocationConflictText).join(', ')}. ${hint}`, undefined, { conflicts })
const nextError = (ref: string) =>
  new AppError(409, 'NEXT_COMMITMENT_ELSEWHERE', `Aracın varıştan sonraki ilk kaydı (${ref}) başka bir şubeden başlıyor. Transfer bu kaydı sessizce geçersiz kılamaz; rezervasyon otomatik iptal edilmez.`, undefined, { refNo: ref })

export async function transferRoutes(app: FastifyInstance) {
  const detail = getTransfer
  const versionConflict = async (tx: Tx, access: CompanyAccess, id: string) =>
    new AppError(409, 'VERSION_CONFLICT', 'Bu transfer siz çalışırken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await detail(tx, access, id) })
  const begin = async (tx: Tx, access: CompanyAccess, id: string, input: { version: number; requestId: string }, end: 'from' | 'to', what: string) => {
    const cur = await lockTransfer(tx, access, id, end, what)
    if (await replayOf(tx, TRANSFER_EVENTS, input.requestId, id)) return null
    if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
    return cur
  }

  app.get('/branches', async (req) => withCompany(req, 'transfers.read', async (tx, access) => operationBranches(tx, access)))
  app.post('/search', async (req) => withCompany(req, 'transfers.read', async (tx, access) => listTransfers(tx, access, transferSearchSchema.parse(req.body ?? {}))))
  app.get('/:id', async (req) => {
    const id = parseId(req, TRANSFER_NOT_FOUND)
    return withCompany(req, 'transfers.read', async (tx, access) => detail(tx, access, id))
  })

  /** A request from a branch of the user. It holds nothing until approved; the plan is in each branch's own time zone. */
  app.post('/', async (req, reply) =>
    withCompany(req, 'transfers.request', async (tx, access) => {
      const input = transferCreateSchema.parse(req.body)
      const userId = req.auth!.user.id
      const prior = (await tx.execute(sql`select id from vehicle_transfers where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
      if (prior) return reply.code(200).send(await detail(tx, access, prior.id as string))
      if (input.purpose === 'repair') need(access, 'transfers.repair')
      const vehicle = await operationalVehicle(tx, access, input.vehicleId)
      if (vehicle.status === 'sold' || vehicle.status === 'disposed') throw invalid({ vehicleId: 'Araç artık filoda değil' })
      const from = await activeBranch(tx, access, input.fromBranchId, 'fromBranchId', true, 'transfer talebi')
      const to = await activeBranch(tx, access, input.toBranchId, 'toBranchId', false)
      const dep = resolveLocal(input.plannedDepartureLocal, from, input.plannedDepartureChoice, 'plannedDepartureLocal', 'plannedDepartureChoice')
      const arr = resolveLocal(input.plannedArrivalLocal, to, input.plannedArrivalChoice, 'plannedArrivalLocal', 'plannedArrivalChoice')
      if (Date.parse(arr) <= Date.parse(dep)) throw invalid({ plannedArrivalLocal: 'Varış çıkıştan sonra olmalı' })
      if (Date.parse(arr) - Date.parse(dep) > 30 * 86_400_000) throw invalid({ plannedArrivalLocal: 'Bir transfer en fazla 30 gün sürebilir' })
      if (Date.parse(dep) < Date.now() - PLAN_PAST_HOURS * 3_600_000) throw invalid({ plannedDepartureLocal: `Planlanan çıkış en fazla ${PLAN_PAST_HOURS} saat öncesi olabilir` })
      if (input.purpose === 'repair') {
        const d = (await tx.execute(sql`select vehicle_id, review_status from damage_files where id = ${input.damageFileId!}`)).rows[0] as Row | undefined
        if (!d || d.vehicle_id !== vehicle.id || d.review_status === 'closed') throw invalid({ damageFileId: 'Bu aracın açık bir hasar dosyasını seçin' })
      }
      const no = await nextNo(tx, access.companyId, 'transfer', 'T')
      const row = (
        await guarded(
          tx.execute(sql`insert into vehicle_transfers (company_id, transfer_no, vehicle_id, from_branch_id, to_branch_id, reason, planned_departure_at, planned_arrival_at,
              from_timezone, to_timezone, driver_note, purpose, damage_file_id, transport_method, client_request_id, created_by, updated_by)
            values (${access.companyId}, ${no}, ${vehicle.id}, ${from.id}, ${to.id}, ${input.reason}, ${dep}, ${arr}, ${from.timezone}, ${to.timezone},
              ${input.driverNote ?? null}, ${input.purpose}, ${input.purpose === 'repair' ? input.damageFileId! : null}, ${input.purpose === 'repair' ? input.transportMethod! : null},
              ${input.requestId}, ${userId}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const id = row.id as string
      const data = { vehicle: vehicle.plate, from: from.code, to: to.code, plannedDepartureAt: dep, plannedArrivalAt: arr, purpose: input.purpose, transportMethod: input.transportMethod ?? null }
      await addEvent(tx, TRANSFER_EVENTS, access.companyId, id, 'created', userId, { to: 'requested', data })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'transfer.create', entity: 'transfer', entityId: id, summary: { transferNo: no, ...data } })
      return reply.code(201).send(await detail(tx, access, id))
    }),
  )

  /** Plan and texts before departure (destination only while requested); an approved plan is re-checked. */
  app.put('/:id', async (req) => {
    const id = parseId(req, TRANSFER_NOT_FOUND)
    return withCompany(req, 'transfers.request', async (tx, access) => {
      const input = transferUpdateSchema.parse(req.body)
      const cur = await begin(tx, access, id, input, 'from', 'transferi değiştirme')
      if (!cur) return detail(tx, access, id)
      if (cur.status !== 'requested' && cur.status !== 'approved') throw new AppError(409, 'INVALID_TRANSITION', 'Yola çıkmış, tamamlanmış veya iptal edilmiş transfer değiştirilemez.')
      if (input.toBranchId && input.toBranchId !== cur.to_branch_id && cur.status !== 'requested') throw new AppError(409, 'IMMUTABLE', 'Onaylanmış transferin varış şubesi değiştirilemez; iptal edip yeni talep oluşturun.')
      const to = input.toBranchId ? await activeBranch(tx, access, input.toBranchId, 'toBranchId', false) : (await branchRow(tx, cur.to_branch_id as string))!
      if (to.id === cur.from_branch_id) throw invalid({ toBranchId: 'Varış şubesi çıkış şubesinden farklı olmalı' })
      const fromB = { name: cur.fb_name as string, timezone: cur.fb_tz as string }
      const dep = input.plannedDepartureLocal ? resolveLocal(input.plannedDepartureLocal, fromB, input.plannedDepartureChoice, 'plannedDepartureLocal', 'plannedDepartureChoice') : toIso(cur.planned_departure_at)
      const arr = input.plannedArrivalLocal ? resolveLocal(input.plannedArrivalLocal, to, input.plannedArrivalChoice, 'plannedArrivalLocal', 'plannedArrivalChoice') : toIso(cur.planned_arrival_at)
      if (Date.parse(arr) <= Date.parse(dep)) throw invalid({ plannedArrivalLocal: 'Varış çıkıştan sonra olmalı' })
      const planChanged = dep !== toIso(cur.planned_departure_at) || arr !== toIso(cur.planned_arrival_at)
      if (planChanged && cur.status === 'approved') {
        await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
        if (cur.purpose === 'operational') {
          const damaged = await damageHolds(tx, access.companyId, cur.vehicle_id as string, dep, arr)
          if (damaged.length) throw damagedError(cur.plate as string, damaged)
        }
        const conflicts = await holdConflicts(tx, access.companyId, cur.vehicle_id as string, dep, arr, id)
        if (conflicts.length) throw conflictError(cur.plate as string, conflicts, 'Plan değiştirilmedi.')
        const next = await nextCommitmentConflict(tx, access.companyId, cur.vehicle_id as string, arr, to.id)
        if (next) throw nextError(next)
      }
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update vehicle_transfers set to_branch_id = ${to.id}, to_timezone = ${to.timezone}, reason = ${input.reason ?? (cur.reason as string)},
            planned_departure_at = ${dep}, planned_arrival_at = ${arr}, driver_note = ${input.driverNote === undefined ? (cur.driver_note as string | null) : input.driverNote || null},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { to: to.code, plannedDepartureAt: dep, plannedArrivalAt: arr, planChanged }
      await addEvent(tx, TRANSFER_EVENTS, access.companyId, id, 'updated', userId, { from: cur.status as string, to: cur.status as string, data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'transfer.update', entity: 'transfer', entityId: id, summary: { transferNo: cur.transfer_no, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /** Requested → approved: the vehicle is held for the plan; refused (with reasons) if anything holds it or the next commitment starts elsewhere. */
  app.post('/:id/approve', async (req) => {
    const id = parseId(req, TRANSFER_NOT_FOUND)
    return withCompany(req, 'transfers.approve', async (tx, access) => {
      const input = transferApproveSchema.parse(req.body)
      const cur = await begin(tx, access, id, input, 'from', 'transfer onayı')
      if (!cur) return detail(tx, access, id)
      if (cur.status !== 'requested') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız talep aşamasındaki transfer onaylanabilir.')
      if (cur.purpose === 'repair') need(access, 'transfers.repair')
      if (Date.parse(toIso(cur.planned_arrival_at)) <= Date.now()) throw invalid({ plannedArrivalLocal: 'Planlanan varış geçti; önce planı güncelleyin' }, 'Planlanan varış geçmiş; transfer onaylanmadı.')
      const vehicleId = cur.vehicle_id as string
      await lockVehicleAllocation(tx, access.companyId, vehicleId)
      if (cur.purpose === 'operational') {
        const damaged = await damageHolds(tx, access.companyId, vehicleId, toIso(cur.planned_departure_at), toIso(cur.planned_arrival_at))
        if (damaged.length) throw damagedError(cur.plate as string, damaged)
      }
      const conflicts = await holdConflicts(tx, access.companyId, vehicleId, toIso(cur.planned_departure_at), toIso(cur.planned_arrival_at), id)
      if (conflicts.length) throw conflictError(cur.plate as string, conflicts, 'Transfer onaylanmadı; rezervasyonlar otomatik iptal edilmez.')
      const next = await nextCommitmentConflict(tx, access.companyId, vehicleId, toIso(cur.planned_arrival_at), cur.to_branch_id as string)
      if (next) throw nextError(next)
      const userId = req.auth!.user.id
      await guarded(tx.execute(sql`update vehicle_transfers set status = 'approved', approved_at = now(), approved_by = ${userId}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      await addEvent(tx, TRANSFER_EVENTS, access.companyId, id, 'approved', userId, { from: 'requested', to: 'approved', requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'transfer.approve', entity: 'transfer', entityId: id, summary: { transferNo: cur.transfer_no, vehicle: cur.plate, fromVersion: input.version } })
      return detail(tx, access, id)
    })
  })

  /**
   * Approved → in transit, at the origin branch: the real departure (never in the future), departure km and fuel. One
   * "in transit" location event and one odometer reading go to the vehicle history in the same transaction; the
   * destination is not recorded as the location yet.
   */
  app.post('/:id/depart', async (req) => {
    const id = parseId(req, TRANSFER_NOT_FOUND)
    return withCompany(req, 'transfers.execute', async (tx, access) => {
      const input = transferDepartSchema.parse(req.body)
      const cur = await begin(tx, access, id, input, 'from', 'çıkış kaydı')
      if (!cur) return detail(tx, access, id)
      if (cur.status !== 'approved') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız onaylanmış transfer yola çıkabilir.')
      if (cur.purpose === 'repair') {
        need(access, 'transfers.repair')
        if (!input.transportAck) {
          throw invalid({ transportAck: 'Aracın beyan edilen çekici veya taşıyıcıyla yola çıktığını onaylayın' }, 'Onarım amaçlı taşıma yalnız taşıma beyanıyla yola çıkar; araç kendi gücüyle sürülmez.')
        }
      }
      const departedAt = actualTime(input.departedLocal, { name: cur.fb_name as string, timezone: cur.fb_tz as string }, input.departedChoice, 'departedLocal', 'departedChoice', OPERATION_BACKDATE_HOURS)
      if (Date.parse(toIso(cur.planned_arrival_at)) <= Math.max(Date.now(), Date.parse(departedAt))) {
        throw invalid({ plannedArrivalLocal: 'Planlanan varış geçti; önce varış zamanını güncelleyin' }, 'Planlanan varış geçmiş. Önce beklenen varışı güncelleyin; araç süresiz tutulmaz.')
      }
      const vehicleId = cur.vehicle_id as string
      await lockVehicleAllocation(tx, access.companyId, vehicleId)
      if (cur.purpose === 'operational') {
        const damaged = await damageHolds(tx, access.companyId, vehicleId, departedAt, toIso(cur.planned_arrival_at))
        if (damaged.length) throw damagedError(cur.plate as string, damaged)
      }
      const conflicts = await holdConflicts(tx, access.companyId, vehicleId, departedAt, toIso(cur.planned_arrival_at), id)
      if (conflicts.length) throw conflictError(cur.plate as string, conflicts, 'Araç yola çıkarılmadı.')
      const next = await nextCommitmentConflict(tx, access.companyId, vehicleId, toIso(cur.planned_arrival_at), cur.to_branch_id as string)
      if (next) throw nextError(next)
      const jump = await assertOdometer(tx, vehicleId, input.km, departedAt, input.largeJumpReason)
      const userId = req.auth!.user.id
      const reading = (
        await guarded(
          tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
            values (${access.companyId}, ${vehicleId}, ${input.km}, 'transfer_departure', 'transfer_departure', ${id}, ${departedAt}, ${jump ? input.largeJumpReason! : null}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const location = (
        await guarded(
          tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, description, event_type, source_type, source_id, occurred_at, recorded_by)
            values (${access.companyId}, ${vehicleId}, 'in_transit', ${`${cur.transfer_no as string} ${cur.fb_code as string} → ${cur.tb_code as string}`}, 'transfer_departure', 'transfer_departure', ${id}, ${departedAt}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      await guarded(
        tx.execute(sql`update vehicle_transfers set status = 'in_transit', departed_at = ${departedAt}, departed_by = ${userId}, departure_km = ${input.km}, departure_fuel = ${input.fuel},
            departure_note = ${input.note ?? null}, transport_ack_at = ${cur.purpose === 'repair' ? sql`now()` : null}, transport_ack_by = ${cur.purpose === 'repair' ? userId : null},
            departure_odometer_reading_id = ${reading.id as string}, departure_location_event_id = ${location.id as string},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { departedAt, km: input.km, fuel: input.fuel, largeJump: !!jump, purpose: cur.purpose, transportMethod: cur.transport_method ?? null, transportAck: cur.purpose === 'repair' }
      await addEvent(tx, TRANSFER_EVENTS, access.companyId, id, 'departed', userId, { from: 'approved', to: 'in_transit', data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'transfer.depart', entity: 'transfer', entityId: id, summary: { transferNo: cur.transfer_no, vehicle: cur.plate, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /**
   * In transit → completed, at the destination branch only: arrival km (not below departure) and fuel; the vehicle is
   * located at the destination from the real arrival on. The home branch does not change.
   */
  app.post('/:id/receive', async (req) => {
    const id = parseId(req, TRANSFER_NOT_FOUND)
    return withCompany(req, 'transfers.execute', async (tx, access) => {
      const input = transferReceiveSchema.parse(req.body)
      const cur = await begin(tx, access, id, input, 'to', 'teslim alma')
      if (!cur) return detail(tx, access, id)
      if (cur.status !== 'in_transit') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız yoldaki transfer teslim alınabilir.')
      const arrivedAt = actualTime(input.arrivedLocal, { name: cur.tb_name as string, timezone: cur.tb_tz as string }, input.arrivedChoice, 'arrivedLocal', 'arrivedChoice', OPERATION_BACKDATE_HOURS)
      if (Date.parse(arrivedAt) < Date.parse(toIso(cur.departed_at))) throw invalid({ arrivedLocal: 'Varış çıkıştan önce olamaz' })
      if (input.km < Number(cur.departure_km)) {
        throw new AppError(422, 'ARRIVAL_KM_BELOW_DEPARTURE', `Varış kilometresi çıkış kilometresinden (${Number(cur.departure_km).toLocaleString('tr-TR')} km) düşük olamaz.`, { km: 'Çıkıştan düşük olamaz' })
      }
      const vehicleId = cur.vehicle_id as string
      const jump = await assertOdometer(tx, vehicleId, input.km, arrivedAt, input.largeJumpReason)
      const userId = req.auth!.user.id
      const reading = (
        await guarded(
          tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
            values (${access.companyId}, ${vehicleId}, ${input.km}, 'transfer_arrival', 'transfer_arrival', ${id}, ${arrivedAt}, ${jump ? input.largeJumpReason! : null}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const location = (
        await guarded(
          tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, description, event_type, source_type, source_id, occurred_at, recorded_by)
            values (${access.companyId}, ${vehicleId}, 'branch', ${cur.to_branch_id as string}, ${cur.transfer_no as string}, 'transfer_arrival', 'transfer_arrival', ${id}, ${arrivedAt}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      await guarded(
        tx.execute(sql`update vehicle_transfers set status = 'completed', arrived_at = ${arrivedAt}, received_by = ${userId}, arrival_km = ${input.km}, arrival_fuel = ${input.fuel},
            arrival_note = ${input.note ?? null}, arrival_odometer_reading_id = ${reading.id as string}, arrival_location_event_id = ${location.id as string},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const late = Math.round((Date.parse(arrivedAt) - Date.parse(toIso(cur.planned_arrival_at))) / 60_000)
      const data = { arrivedAt, km: input.km, fuel: input.fuel, drivenKm: input.km - Number(cur.departure_km), lateMinutes: late > 0 ? late : 0, largeJump: !!jump }
      await addEvent(tx, TRANSFER_EVENTS, access.companyId, id, 'received', userId, { from: 'in_transit', to: 'completed', data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'transfer.receive', entity: 'transfer', entityId: id, summary: { transferNo: cur.transfer_no, vehicle: cur.plate, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /** Requested or approved → cancelled, with a reason. Once on the road a transfer is received, never cancelled. */
  app.post('/:id/cancel', async (req) => {
    const id = parseId(req, TRANSFER_NOT_FOUND)
    return withCompany(req, 'transfers.request', async (tx, access) => {
      const input = transferCancelSchema.parse(req.body)
      const cur = await begin(tx, access, id, input, 'from', 'transfer iptali')
      if (!cur) return detail(tx, access, id)
      if (cur.status !== 'requested' && cur.status !== 'approved') throw new AppError(409, 'INVALID_TRANSITION', 'Yalnız yola çıkmamış transfer iptal edilebilir.')
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`update vehicle_transfers set status = 'cancelled', cancelled_at = now(), cancelled_by = ${userId}, cancel_reason = ${input.reason},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      await addEvent(tx, TRANSFER_EVENTS, access.companyId, id, 'cancelled', userId, { from: cur.status as string, to: 'cancelled', reason: input.reason, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'transfer.cancel', entity: 'transfer', entityId: id, summary: { transferNo: cur.transfer_no, fromVersion: input.version } })
      return detail(tx, access, id)
    })
  })
}
