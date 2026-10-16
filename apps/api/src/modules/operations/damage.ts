import {
  type AllocationConflict,
  damageBlockSchema,
  type DamageCandidate,
  damageCreateSchema,
  type DamageDetail,
  type DamageListItem,
  type DamageListResponse,
  damageRepairSchema,
  damageReviewSchema,
  type DamageSearch,
  damageSearchSchema,
  damageReleaseDecisionSchema,
  damageUnblockSchema,
  damageUpdateSchema,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { actualTime } from '../../lib/branch-time'
import { AppError, notFound } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { lockVehicleAllocation, vehicleBusy } from '../../lib/vehicle-allocation'
import { withCompany } from '../../plugins/auth'
import { UPLOAD_RATE_LIMIT } from '../../plugins/security'
import type { CompanyAccess } from '../auth/context'
import { nextNo } from '../pricing/repository'
import { RENTAL_NOT_FOUND, rentalScopeSql } from '../rentals/repository'
import { moment } from '../reservations/repository'
import { inScope } from '../vehicles/repository'
import { requirePhotoGrant } from './photo-access'
import {
  activeBranch,
  addEvent,
  branchRef,
  branchScopeSql,
  DAMAGE_EVENTS,
  guarded,
  insertFile,
  isoOrNull,
  loadEvents,
  loadPhotos,
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

// Damage files V1 (plan §3): a finding is not a liability. No fault, charge, insurance claim, deposit deduction or debt
// is created here. A blocking damage holds the vehicle (shared allocation) until a permitted user lifts it, with a reason.

export const DAMAGE_NOT_FOUND = 'Hasar dosyası bulunamadı veya bu kayda erişim yetkiniz yok.'
/** A damage may be recorded some time after it was found (e.g. noticed while cleaning), never in the future. */
const DETECTION_BACKDATE_HOURS = 30 * 24

const LIST_SELECT = sql`
  d.id, d.damage_no, d.timezone, d.detected_at, d.view, d.area, d.damage_type, d.severity, d.usability, d.review_status, d.repair_status,
  exists (select 1 from damage_blocks x where x.company_id = d.company_id and x.damage_id = d.id and x.ended_at is null) as blocked,
  v.id as v_id, v.plate as v_plate, v.make as v_make, v.model as v_model,
  b.id as b_id, b.name as b_name, b.code as b_code, k.id as k_id, k.rental_no as k_no`
const LIST_FROM = sql`
  from damage_files d
  join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id
  join branches b on b.company_id = d.company_id and b.id = d.branch_id
  left join rentals k on k.company_id = d.company_id and k.id = d.rental_id`
const BLOCKED = sql`exists (select 1 from damage_blocks x where x.company_id = d.company_id and x.damage_id = d.id and x.ended_at is null)`
const scopeSql = (access: CompanyAccess) => branchScopeSql(access, sql`d.branch_id`, sql`v.home_branch_id`)

export function damageItem(r: Row): DamageListItem {
  return {
    id: r.id as string,
    damageNo: r.damage_no as string,
    vehicle: { id: r.v_id as string, plate: r.v_plate as string, make: r.v_make as string, model: r.v_model as string },
    branch: branchRef(r, 'b'),
    detected: moment(r.detected_at, r.timezone as string),
    view: r.view as DamageListItem['view'],
    area: str(r.area),
    damageType: r.damage_type as DamageListItem['damageType'],
    severity: r.severity as DamageListItem['severity'],
    usability: r.usability as DamageListItem['usability'],
    reviewStatus: r.review_status as DamageListItem['reviewStatus'],
    repairStatus: r.repair_status as DamageListItem['repairStatus'],
    blocked: r.blocked === true,
    rental: r.k_id ? { id: r.k_id as string, rentalNo: r.k_no as string } : null,
  }
}

const VIEW_SQL: Record<DamageSearch['view'], SQL> = {
  open: sql`d.review_status <> 'closed'`,
  blocked: BLOCKED,
  reported: sql`d.review_status = 'reported'`,
  under_review: sql`d.review_status = 'under_review'`,
  assessed: sql`d.review_status = 'assessed'`,
  closed: sql`d.review_status = 'closed'`,
  all: sql`true`,
}
const SORT_SQL: Record<DamageSearch['sort'], string> = { detected: 'd.detected_at', created: 'd.created_at', number: 'd.damage_no' }
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export async function listDamages(tx: Tx, access: CompanyAccess, q: DamageSearch, extra?: SQL): Promise<DamageListResponse> {
  const conds: SQL[] = [scopeSql(access)]
  if (extra) conds.push(extra)
  if (q.branchId) conds.push(sql`d.branch_id = ${q.branchId}`)
  if (q.vehicleId) conds.push(sql`d.vehicle_id = ${q.vehicleId}`)
  if (q.rentalId) conds.push(sql`d.rental_id = ${q.rentalId}`)
  if (q.severity) conds.push(sql`d.severity = ${q.severity}`)
  if (q.q) {
    const like = `%${escapeLike(q.q.trim())}%`
    const plate = `%${escapeLike(q.q.replace(/[\s-]/g, '').toUpperCase())}%`
    conds.push(sql`(d.damage_no ilike ${like} or v.plate_normalized like ${plate} or d.description ilike ${like} or d.area ilike ${like} or k.rental_no ilike ${like})`)
  }
  const base = sql.join(conds, sql` and `)
  const order = sql.raw(`${SORT_SQL[q.sort]} ${q.dir === 'asc' ? 'asc' : 'desc'}, d.damage_no desc`)
  const rows = (await tx.execute(sql`select ${LIST_SELECT} ${LIST_FROM} where ${base} and ${VIEW_SQL[q.view]} order by ${order} limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)).rows as Row[]
  const totals = (
    await tx.execute(sql`select count(*) filter (where ${VIEW_SQL[q.view]})::int as total,
        count(*) filter (where d.review_status <> 'closed')::int as open,
        count(*) filter (where ${BLOCKED})::int as blocked,
        count(*) filter (where d.review_status = 'reported')::int as reported,
        count(*) filter (where d.review_status = 'under_review')::int as under_review
      ${LIST_FROM} where ${base}`)
  ).rows[0] as Row
  return {
    items: rows.map(damageItem),
    total: Number(totals.total),
    page: q.page,
    pageSize: q.pageSize,
    counts: { open: Number(totals.open), blocked: Number(totals.blocked), reported: Number(totals.reported), under_review: Number(totals.under_review) },
  }
}

/** Confirmed reservations of the vehicle from now on: kept as they are, shown as at risk while a block is open. */
async function atRisk(tx: Tx, companyId: string, vehicleId: string): Promise<AllocationConflict[]> {
  return (await vehicleBusy(tx, companyId, vehicleId, new Date().toISOString(), null)).filter((c) => c.kind === 'reservation' || (c.kind === 'rental' && c.startsAt > new Date().toISOString()))
}

async function getDamage(app: FastifyInstance, tx: Tx, access: CompanyAccess, id: string): Promise<DamageDetail> {
  const r = (
    await tx.execute(sql`select ${LIST_SELECT}, d.*, v.status as v_status, v.home_branch_id as v_home, vc.name as v_class, i.kind as i_kind, mk.category as mk_category,
        cu.name as created_by_name
      ${LIST_FROM}
      join vehicle_classes vc on vc.company_id = v.company_id and vc.id = v.class_id
      left join rental_inspections i on i.company_id = d.company_id and i.id = d.inspection_id
      left join rental_damage_marks mk on mk.company_id = d.company_id and mk.id = d.source_mark_id
      left join users cu on cu.id = d.created_by
      where d.id = ${id} and ${scopeSql(access)}`)
  ).rows[0] as Row | undefined
  if (!r) throw notFound(DAMAGE_NOT_FOUND)
  const item = damageItem(r)
  const blocks = (
    await tx.execute(sql`select b.*, su.name as started_by_name, eu.name as ended_by_name from damage_blocks b
      left join users su on su.id = b.started_by left join users eu on eu.id = b.ended_by where b.damage_id = ${id} order by b.started_at desc`)
  ).rows as Row[]
  const maintenance = (await tx.execute(sql`select id, maintenance_no, status from maintenance_records where damage_file_id = ${id} order by created_at desc`)).rows as Row[]
  const releases = (
    await tx.execute(sql`select r.*, ru.name as requested_by_name, du.name as decided_by_name from damage_block_release_requests r
      left join users ru on ru.id = r.requested_by left join users du on du.id = r.decided_by where r.damage_id = ${id} order by r.requested_at desc`)
  ).rows as Row[]
  return {
    ...item,
    timeZone: r.timezone as string,
    locationText: str(r.location_text),
    description: r.description as string,
    assessmentNote: str(r.assessment_note),
    source: r.inspection_id
      ? { inspectionId: r.inspection_id as string, inspectionKind: r.i_kind as 'handover' | 'return', markId: str(r.source_mark_id), markCategory: str(r.mk_category) }
      : null,
    closedAt: isoOrNull(r.closed_at),
    closeReason: str(r.close_reason),
    createdAt: toIso(r.created_at),
    createdByName: str(r.created_by_name),
    version: Number(r.version),
    vehicle: { ...item.vehicle, className: r.v_class as string, status: r.v_status as string, homeBranchId: r.v_home as string },
    blocks: blocks.map((b) => ({
      id: b.id as string,
      startedAt: toIso(b.started_at),
      startedByName: str(b.started_by_name),
      startReason: b.start_reason as string,
      endedAt: isoOrNull(b.ended_at),
      endedByName: str(b.ended_by_name),
      endReason: str(b.end_reason),
    })),
    releaseRequests: releases.map((r) => ({
      id: r.id as string,
      blockId: r.block_id as string,
      status: r.status as DamageDetail['releaseRequests'][number]['status'],
      reason: r.reason as string,
      usability: r.usability as 'usable' | 'restricted',
      requestedById: r.requested_by as string,
      requestedByName: str(r.requested_by_name),
      requestedAt: toIso(r.requested_at),
      decidedByName: str(r.decided_by_name),
      decidedAt: isoOrNull(r.decided_at),
      decisionNote: str(r.decision_note),
      version: Number(r.version),
    })),
    maintenance: maintenance.map((m) => ({ id: m.id as string, maintenanceNo: m.maintenance_no as string, status: m.status as never })),
    atRisk: item.blocked ? await atRisk(tx, access.companyId, item.vehicle.id) : [],
    photos: await loadPhotos(tx, 'damage_photos', 'damage_id', id, `/api/damages/${id}/photos`),
    events: await loadEvents(tx, DAMAGE_EVENTS, id),
    uploadPolicy: uploadPolicy(app),
  }
}

async function lockDamage(tx: Tx, access: CompanyAccess, id: string) {
  const r = (
    await tx.execute(sql`select d.*, v.plate, v.home_branch_id from damage_files d join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id
      where d.id = ${id} for update of d`)
  ).rows[0] as Row | undefined
  if (!r || !(inScope(access, r.branch_id as string) || inScope(access, r.home_branch_id as string))) throw notFound(DAMAGE_NOT_FOUND)
  if (!inScope(access, r.branch_id as string)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu hasar dosyasının şubesinde işlem yetkiniz yok.')
  return r
}

export async function damageRoutes(app: FastifyInstance) {
  const detail = (tx: Tx, access: CompanyAccess, id: string) => getDamage(app, tx, access, id)
  const versionConflict = async (tx: Tx, access: CompanyAccess, id: string) =>
    new AppError(409, 'VERSION_CONFLICT', 'Bu hasar dosyası siz çalışırken başka bir kullanıcı tarafından güncellendi.', undefined, { current: await detail(tx, access, id) })
  /** Every step re-reads the record under a row lock, honours a resent request and refuses a stale screen. */
  const step = async (tx: Tx, access: CompanyAccess, id: string, input: { version: number; requestId: string }) => {
    const cur = await lockDamage(tx, access, id)
    if (await replayOf(tx, DAMAGE_EVENTS, input.requestId, id)) return null
    if (Number(cur.version) !== input.version) throw await versionConflict(tx, access, id)
    if (cur.review_status === 'closed') throw new AppError(409, 'INVALID_TRANSITION', 'Kapatılmış hasar dosyası değiştirilemez. Yeni bulgu için yeni dosya açın.')
    return cur
  }

  app.get('/branches', async (req) => withCompany(req, 'damage.read', async (tx, access) => operationBranches(tx, access)))
  app.post('/search', async (req) => withCompany(req, 'damage.read', async (tx, access) => listDamages(tx, access, damageSearchSchema.parse(req.body ?? {}))))

  /** Findings of a rental's final inspections that can become damage files (one file per finding). Marks never change. */
  app.get('/candidates', async (req) =>
    withCompany(req, 'damage.read', async (tx, access): Promise<{ items: DamageCandidate[] }> => {
      const q = z.object({ rentalId: z.uuid() }).safeParse(req.query)
      if (!q.success) throw notFound(RENTAL_NOT_FOUND)
      const rental = (await tx.execute(sql`select k.id from rentals k where k.id = ${q.data.rentalId} and ${rentalScopeSql(access, 'k')}`)).rows[0]
      if (!rental) throw notFound(RENTAL_NOT_FOUND)
      const rows = (
        await tx.execute(sql`select m.id, m.inspection_id, i.kind, m.view, m.category, m.note, m.existing_mark_id, d.id as d_id, d.damage_no
          from rental_damage_marks m join rental_inspections i on i.company_id = m.company_id and i.id = m.inspection_id
          left join damage_files d on d.company_id = m.company_id and d.source_mark_id = m.id
          where i.rental_id = ${q.data.rentalId} and i.state = 'final' and m.removed_at is null order by i.kind, m.created_at`)
      ).rows as Row[]
      return {
        items: rows.map((m) => ({
          markId: m.id as string,
          inspectionId: m.inspection_id as string,
          inspectionKind: m.kind as 'handover' | 'return',
          view: m.view as string,
          category: m.category as string,
          note: str(m.note),
          newFinding: m.kind === 'return' && !m.existing_mark_id,
          damageFile: m.d_id ? { id: m.d_id as string, damageNo: m.damage_no as string } : null,
        })),
      }
    }),
  )

  app.get('/:id', async (req) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.read', async (tx, access) => detail(tx, access, id))
  })

  /**
   * A damage file. From a rental's final inspection mark it links the finding without changing it (one file per mark).
   * "Not usable" starts a block at once, in the same transaction, under the shared vehicle lock.
   */
  app.post('/', async (req, reply) =>
    withCompany(req, 'damage.report', async (tx, access) => {
      const input = damageCreateSchema.parse(req.body)
      const userId = req.auth!.user.id
      const prior = (await tx.execute(sql`select id from damage_files where client_request_id = ${input.requestId}`)).rows[0] as Row | undefined
      if (prior) return reply.code(200).send(await detail(tx, access, prior.id as string))
      const vehicle = await operationalVehicle(tx, access, input.vehicleId)
      const b = await activeBranch(tx, access, input.branchId, 'branchId', true, 'hasar bildirme')
      const detectedAt = actualTime(input.detectedLocal, b, input.detectedChoice, 'detectedLocal', 'detectedChoice', DETECTION_BACKDATE_HOURS)
      let inspectionId: string | null = null
      if (input.rentalId) {
        const k = (await tx.execute(sql`select k.id, k.vehicle_id from rentals k where k.id = ${input.rentalId} and ${rentalScopeSql(access, 'k')}`)).rows[0] as Row | undefined
        if (!k) throw new AppError(404, 'NOT_FOUND', RENTAL_NOT_FOUND, { rentalId: 'Kiralama bulunamadı' })
        if (k.vehicle_id !== vehicle.id) throw new AppError(400, 'VALIDATION', 'Kiralama başka bir araca ait.', { rentalId: 'Kiralama bu araca ait değil' })
      }
      if (input.sourceMarkId) {
        const m = (
          await tx.execute(sql`select m.inspection_id, i.state, d.damage_no from rental_damage_marks m join rental_inspections i on i.company_id = m.company_id and i.id = m.inspection_id
            left join damage_files d on d.company_id = m.company_id and d.source_mark_id = m.id
            where m.id = ${input.sourceMarkId} and i.rental_id = ${input.rentalId!} and m.removed_at is null`)
        ).rows[0] as Row | undefined
        if (!m) throw new AppError(400, 'VALIDATION', 'Bulgu bu kiralamanın kontrolünde yok.', { sourceMarkId: 'Bulgu bulunamadı' })
        if (m.state !== 'final') throw new AppError(409, 'INSPECTION_OPEN', 'Bulgu henüz kesinleşmemiş bir kontrolde; kontrol tamamlandıktan sonra hasar dosyası açılabilir.')
        if (m.damage_no) throw new AppError(409, 'DUPLICATE_FINDING', `Bu bulgu için zaten bir hasar dosyası var (${m.damage_no as string}).`)
        inspectionId = m.inspection_id as string
      }
      const no = await nextNo(tx, access.companyId, 'damage', 'H')
      const row = (
        await guarded(
          tx.execute(sql`insert into damage_files (company_id, damage_no, vehicle_id, branch_id, rental_id, inspection_id, source_mark_id, detected_at, timezone, location_text,
              view, area, description, damage_type, severity, usability, client_request_id, created_by, updated_by)
            values (${access.companyId}, ${no}, ${vehicle.id}, ${b.id}, ${input.rentalId ?? null}, ${inspectionId}, ${input.sourceMarkId ?? null}, ${detectedAt}, ${b.timezone},
              ${input.locationText ?? null}, ${input.view}, ${input.area ?? null}, ${input.description}, ${input.damageType}, ${input.severity}, ${input.usability},
              ${input.requestId}, ${userId}, ${userId}) returning id`),
        )
      ).rows[0] as Row
      const id = row.id as string
      const data = { vehicle: vehicle.plate, severity: input.severity, usability: input.usability, damageType: input.damageType, fromInspection: !!inspectionId }
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'created', userId, { to: 'reported', data })
      if (input.usability === 'not_usable') {
        await lockVehicleAllocation(tx, access.companyId, vehicle.id)
        await guarded(
          tx.execute(sql`insert into damage_blocks (company_id, damage_id, vehicle_id, started_at, started_by, start_reason)
            values (${access.companyId}, ${id}, ${vehicle.id}, now(), ${userId}, ${input.blockReason!})`),
        )
        await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'blocked', userId, { reason: input.blockReason! })
      }
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.create', entity: 'damage', entityId: id, summary: { damageNo: no, ...data, blocked: input.usability === 'not_usable' } })
      return reply.code(201).send(await detail(tx, access, id))
    }),
  )

  /** Description and assessment fields. Usability moves only between usable and restricted here (a block decides not usable). */
  app.put('/:id', async (req) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.report', async (tx, access) => {
      const input = damageUpdateSchema.parse(req.body)
      const cur = await step(tx, access, id, input)
      if (!cur) return detail(tx, access, id)
      if (input.usability && cur.usability === 'not_usable') throw new AppError(409, 'BLOCK_OPEN', 'Araç kullanılamaz olarak işaretli; kullanılabilirlik ancak engel kaldırılırken değişir.')
      const userId = req.auth!.user.id
      const text = (v: string | undefined, old: unknown) => (v === undefined ? (old as string | null) : v || null)
      await guarded(
        tx.execute(sql`update damage_files set description = ${input.description ?? (cur.description as string)}, area = ${text(input.area, cur.area)},
            location_text = ${text(input.locationText, cur.location_text)}, damage_type = ${input.damageType ?? (cur.damage_type as string)},
            severity = ${input.severity ?? (cur.severity as string)}, usability = ${input.usability ?? (cur.usability as string)},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      const data = { severity: input.severity ?? cur.severity, usability: input.usability ?? cur.usability }
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'updated', userId, { data, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.update', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, fromVersion: input.version, ...data } })
      return detail(tx, access, id)
    })
  })

  /** Review: under review, assessed (with a note) or closed (with a reason; never while a block is open). */
  app.post('/:id/review', async (req) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.review', async (tx, access) => {
      const input = damageReviewSchema.parse(req.body)
      const cur = await step(tx, access, id, input)
      if (!cur) return detail(tx, access, id)
      if (input.reviewStatus === cur.review_status) return detail(tx, access, id)
      const userId = req.auth!.user.id
      const closing = input.reviewStatus === 'closed'
      await guarded(
        tx.execute(sql`update damage_files set review_status = ${input.reviewStatus},
            assessment_note = ${input.reviewStatus === 'assessed' && input.note ? input.note : (cur.assessment_note as string | null)},
            closed_at = ${closing ? sql`now()` : null}, closed_by = ${closing ? userId : null}, close_reason = ${closing ? input.note! : null},
            version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`),
      )
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, closing ? 'closed' : 'review', userId, { from: cur.review_status as string, to: input.reviewStatus, reason: input.note ?? null, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.review', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, fromVersion: input.version, from: cur.review_status, to: input.reviewStatus } })
      return detail(tx, access, id)
    })
  })

  /** Repair state, set by staff. A completed maintenance never marks the damage repaired by itself. */
  app.post('/:id/repair', async (req) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.review', async (tx, access) => {
      const input = damageRepairSchema.parse(req.body)
      const cur = await step(tx, access, id, input)
      if (!cur) return detail(tx, access, id)
      const userId = req.auth!.user.id
      await guarded(tx.execute(sql`update damage_files set repair_status = ${input.repairStatus}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'repair', userId, { from: cur.repair_status as string, to: input.repairStatus, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.repair', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, fromVersion: input.version, from: cur.repair_status, to: input.repairStatus } })
      return detail(tx, access, id)
    })
  })

  /** Marks the vehicle not usable from now on (a new block period). Existing reservations are never cancelled. */
  app.post('/:id/block', async (req) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.report', async (tx, access) => {
      const input = damageBlockSchema.parse(req.body)
      const cur = await step(tx, access, id, input)
      if (!cur) return detail(tx, access, id)
      const userId = req.auth!.user.id
      await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
      await guarded(
        tx.execute(sql`insert into damage_blocks (company_id, damage_id, vehicle_id, started_at, started_by, start_reason)
          values (${access.companyId}, ${id}, ${cur.vehicle_id as string}, now(), ${userId}, ${input.reason})`),
      )
      await guarded(tx.execute(sql`update damage_files set usability = 'not_usable', version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'blocked', userId, { reason: input.reason, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.block', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, vehicle: cur.plate, fromVersion: input.version } })
      return detail(tx, access, id)
    })
  })

  /**
   * Asks for the open block to be lifted (own permission, reason, the usability afterwards). Nothing is lifted yet: a
   * second authorised person decides (four eyes, also enforced by PostgreSQL). One open request per block.
   */
  app.post('/:id/unblock-request', async (req) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.unblock', async (tx, access) => {
      const input = damageUnblockSchema.parse(req.body)
      const cur = await step(tx, access, id, input)
      if (!cur) return detail(tx, access, id)
      const block = (await tx.execute(sql`select id from damage_blocks where damage_id = ${id} and ended_at is null`)).rows[0] as Row | undefined
      if (!block) throw new AppError(409, 'NOT_BLOCKED', 'Bu hasar dosyasının açık bir engeli yok.')
      const open = (await tx.execute(sql`select id from damage_block_release_requests where block_id = ${block.id as string} and status = 'requested'`)).rows[0]
      if (open) throw new AppError(409, 'RELEASE_PENDING', 'Bu engel için zaten onay bekleyen bir kaldırma talebi var.')
      const userId = req.auth!.user.id
      await guarded(
        tx.execute(sql`insert into damage_block_release_requests (company_id, damage_id, block_id, reason, usability, requested_by)
          values (${access.companyId}, ${id}, ${block.id as string}, ${input.reason}, ${input.usability}, ${userId})`),
      )
      await guarded(tx.execute(sql`update damage_files set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`))
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'release_requested', userId, { reason: input.reason, data: { usability: input.usability }, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.release_request', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, vehicle: cur.plate, usability: input.usability } })
      return detail(tx, access, id)
    })
  })

  /** Locks the damage file, then the release request; out of scope looks like unknown. */
  const lockRelease = async (tx: Tx, access: CompanyAccess, rid: string, input: { version: number; requestId: string }) => {
    const r = (await tx.execute(sql`select damage_id from damage_block_release_requests where id = ${rid}`)).rows[0] as Row | undefined
    if (!r) throw notFound('Kaldırma talebi bulunamadı.')
    const cur = await lockDamage(tx, access, r.damage_id as string)
    if (await replayOf(tx, DAMAGE_EVENTS, input.requestId, cur.id as string)) return { cur, rel: null }
    const rel = (await tx.execute(sql`select * from damage_block_release_requests where id = ${rid} for update`)).rows[0] as Row
    if (Number(rel.version) !== input.version) {
      throw new AppError(409, 'VERSION_CONFLICT', 'Bu talep siz çalışırken değişti.', undefined, { current: await detail(tx, access, cur.id as string) })
    }
    if (rel.status !== 'requested') throw new AppError(409, 'INVALID_TRANSITION', 'Bu talep zaten sonuçlandırılmış.')
    return { cur, rel }
  }

  /**
   * A second authorised person approves: the block ends now, the usability changes, and the vehicle's other holds
   * (maintenance, transfers, rentals, reservations) stay as they are. Never by the requester.
   */
  app.post('/release-requests/:id/approve', async (req) => {
    const rid = parseId(req, 'Kaldırma talebi bulunamadı.')
    return withCompany(req, 'damage.unblock', async (tx, access) => {
      const input = damageReleaseDecisionSchema.parse(req.body)
      const { cur, rel } = await lockRelease(tx, access, rid, input)
      if (!rel) return detail(tx, access, cur.id as string)
      const userId = req.auth!.user.id
      if (rel.requested_by === userId) throw new AppError(403, 'FOUR_EYES', 'Kendi kaldırma talebinizi onaylayamazsınız; farklı bir yetkili onaylamalı.')
      await lockVehicleAllocation(tx, access.companyId, cur.vehicle_id as string)
      const block = (await tx.execute(sql`select id from damage_blocks where id = ${rel.block_id as string} and ended_at is null for update`)).rows[0]
      if (!block) throw new AppError(409, 'NOT_BLOCKED', 'Engel artık açık değil.')
      await guarded(
        tx.execute(sql`update damage_block_release_requests set status = 'approved', decided_by = ${userId}, decided_at = now(), decision_note = ${input.note ?? null}, version = version + 1 where id = ${rid}`),
      )
      await guarded(tx.execute(sql`update damage_blocks set ended_at = now(), ended_by = ${userId}, end_reason = ${rel.reason as string} where id = ${rel.block_id as string}`))
      await guarded(tx.execute(sql`update damage_files set usability = ${rel.usability as string}, version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${cur.id as string}`))
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, cur.id as string, 'unblocked', userId, { reason: rel.reason as string, data: { usability: rel.usability, releaseRequestId: rid }, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.unblock', entity: 'damage', entityId: cur.id as string, summary: { damageNo: cur.damage_no, vehicle: cur.plate, usability: rel.usability, fourEyes: true } })
      return detail(tx, access, cur.id as string)
    })
  })

  app.post('/release-requests/:id/reject', async (req) => {
    const rid = parseId(req, 'Kaldırma talebi bulunamadı.')
    return withCompany(req, 'damage.unblock', async (tx, access) => {
      const input = damageReleaseDecisionSchema.parse(req.body)
      const { cur, rel } = await lockRelease(tx, access, rid, input)
      if (!rel) return detail(tx, access, cur.id as string)
      const userId = req.auth!.user.id
      if (rel.requested_by === userId) throw new AppError(403, 'FOUR_EYES', 'Kendi talebinizi reddedemezsiniz; geri çekebilirsiniz.')
      if (!input.note || input.note.length < 5) throw new AppError(400, 'VALIDATION', 'Ret gerekçesini yazın.', { note: 'Ret gerekçesini yazın (en az 5 karakter)' })
      await guarded(tx.execute(sql`update damage_block_release_requests set status = 'rejected', decided_by = ${userId}, decided_at = now(), decision_note = ${input.note}, version = version + 1 where id = ${rid}`))
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, cur.id as string, 'release_rejected', userId, { reason: input.note, requestId: input.requestId })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.release_reject', entity: 'damage', entityId: cur.id as string, summary: { damageNo: cur.damage_no } })
      return detail(tx, access, cur.id as string)
    })
  })

  app.post('/release-requests/:id/cancel', async (req) => {
    const rid = parseId(req, 'Kaldırma talebi bulunamadı.')
    return withCompany(req, 'damage.unblock', async (tx, access) => {
      const input = damageReleaseDecisionSchema.parse(req.body)
      const { cur, rel } = await lockRelease(tx, access, rid, input)
      if (!rel) return detail(tx, access, cur.id as string)
      const userId = req.auth!.user.id
      if (rel.requested_by !== userId) throw new AppError(403, 'FOUR_EYES', 'Talebi yalnız talep eden kişi geri çekebilir.')
      await guarded(tx.execute(sql`update damage_block_release_requests set status = 'cancelled', decided_by = ${userId}, decided_at = now(), version = version + 1 where id = ${rid}`))
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, cur.id as string, 'release_cancelled', userId, { requestId: input.requestId })
      return detail(tx, access, cur.id as string)
    })
  })

  app.post('/:id/photos', { config: UPLOAD_RATE_LIMIT }, async (req, reply) => {
    const id = parseId(req, DAMAGE_NOT_FOUND)
    await withCompany(req, 'damage.report', async (tx, access) => {
      const cur = await lockDamage(tx, access, id)
      if (cur.review_status === 'closed') throw new AppError(409, 'RECORD_CLOSED', 'Kapatılmış hasar dosyasına fotoğraf eklenemez.')
    })
    const photo = await receivePhoto(app, req, 'damages')
    try {
      const out = await withCompany(req, 'damage.report', async (tx, access) => {
        const cur = await lockDamage(tx, access, id)
        const userId = req.auth!.user.id
        const fileId = await insertFile(tx, access.companyId, 'damage_photo', photo, userId)
        const p = (await guarded(tx.execute(sql`insert into damage_photos (company_id, damage_id, file_id, created_by) values (${access.companyId}, ${id}, ${fileId}, ${userId}) returning id`))).rows[0] as Row
        await tx.execute(sql`update damage_files set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
        await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'photo_added', userId, { data: { photoId: p.id } })
        await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.photo.add', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, photoId: p.id, scanner: app.scanner.name } })
        return detail(tx, access, id)
      })
      return reply.code(201).send(out)
    } catch (e) {
      await app.storage.remove(photo.keys.main, photo.keys.thumb)
      throw e
    }
  })

  app.delete('/:id/photos/:photoId', async (req) => {
    const { id, photoId } = parsePhoto(req, DAMAGE_NOT_FOUND)
    return withCompany(req, 'damage.report', async (tx, access) => {
      const cur = await lockDamage(tx, access, id)
      const userId = req.auth!.user.id
      const res = await guarded(tx.execute(sql`update damage_photos set removed_at = now(), removed_by = ${userId} where id = ${photoId} and damage_id = ${id} and removed_at is null returning id`))
      if (!res.rows.length) throw notFound('Fotoğraf bulunamadı.')
      await tx.execute(sql`update damage_files set version = version + 1, updated_at = now(), updated_by = ${userId} where id = ${id}`)
      await addEvent(tx, DAMAGE_EVENTS, access.companyId, id, 'photo_removed', userId, { data: { photoId } })
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'damage.photo.remove', entity: 'damage', entityId: id, summary: { damageNo: cur.damage_no, photoId } })
      return detail(tx, access, id)
    })
  })

  app.get('/:id/photos/:photoId', async (req, reply) => {
    const { id, photoId } = parsePhoto(req, DAMAGE_NOT_FOUND)
    const variant = (req.query as { variant?: string }).variant === 'thumb' ? 'thumb' : 'main'
    const file = await withCompany(req, 'damage.read', async (tx, access) => {
      const r = (
        await tx.execute(sql`select f.storage_key, f.thumb_key from damage_photos p
          join damage_files d on d.company_id = p.company_id and d.id = p.damage_id
          join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id
          join files f on f.company_id = p.company_id and f.id = p.file_id
          where p.id = ${photoId} and d.id = ${id} and ${scopeSql(access)}`)
      ).rows[0] as Row | undefined
      if (!r) throw notFound()
      requirePhotoGrant(app, req, access.companyId, 'damage', id)
      return r
    })
    return streamFile(app, reply, file, variant)
  })

}
