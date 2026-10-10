import {
  type HistoryCorrection,
  type HistoryWriteResult,
  type LocationEntry,
  type LocationPlace,
  type OdometerEntry,
  type VehicleHistory,
  currentOf,
  isInFuture,
  isLateEntry,
  largeJump,
  locationCorrectSchema,
  locationRecordSchema,
  odometerCorrectSchema,
  odometerOrderProblem,
  odometerRecordSchema,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { inScope } from './repository'

// Odometer and physical location management (docs/TEKNIK_UYGULAMA.md §8.5).
// Every write: visible vehicle → per-vehicle lock → repeated submit? → stale screen? → rules → insert → audit.

const VEHICLE_NOT_FOUND = 'Araç bulunamadı veya bu araca erişim yetkiniz yok.'
const RECORD_NOT_FOUND = 'Kayıt bulunamadı.'
const vehicleParams = z.object({ id: z.uuid() })
const readingParams = z.object({ id: z.uuid(), readingId: z.uuid() })
const eventParams = z.object({ id: z.uuid(), eventId: z.uuid() })
/** Sources this screen may correct. Records owned by later modules (rental, transfer…) are corrected there. */
const CORRECTABLE_SOURCES = new Set([null, 'vehicle_create', 'manual', 'correction'])
type Row = Record<string, unknown>

function params<T>(schema: z.ZodType<T>, value: unknown, message = VEHICLE_NOT_FOUND): T {
  const r = schema.safeParse(value)
  if (!r.success) throw notFound(message)
  return r.data
}
const iso = toIso
const str = (v: unknown) => (v == null ? null : (v as string))

interface VisibleVehicle {
  id: string
  plate: string
  homeBranchId: string
  createdAt: string
  timezone: string
}

async function visibleVehicle(tx: Tx, access: CompanyAccess, vehicleId: string): Promise<VisibleVehicle> {
  const rows = await tx.execute(sql`
    select v.id, v.plate, v.home_branch_id, v.created_at, c.timezone
    from vehicles v join companies c on c.id = v.company_id where v.id = ${vehicleId}`)
  const r = rows.rows[0] as Row | undefined
  if (!r || !inScope(access, r.home_branch_id as string)) throw notFound(VEHICLE_NOT_FOUND)
  return { id: r.id as string, plate: r.plate as string, homeBranchId: r.home_branch_id as string, createdAt: iso(r.created_at), timezone: r.timezone as string }
}

/** Same lock as the database guards: one writer per vehicle history at a time. */
const lockHistory = (tx: Tx, vehicleId: string) => tx.execute(sql`select lock_vehicle_history(${vehicleId}::uuid)`)

const kmText = (n: number) => `${new Intl.NumberFormat('tr-TR').format(n)} km`
/** Same format as the web app (DD.MM.YYYY HH:mm), in the company's time zone. */
const timeText = (at: string, timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(at))

// ---------------------------------------------------------------------------
// Reading the history

function correctionOf(r: Row): HistoryCorrection | null {
  if (!r.c_id) return null
  return {
    id: r.c_id as string,
    action: r.c_action as HistoryCorrection['action'],
    reason: r.c_reason as string,
    at: iso(r.c_at),
    byName: str(r.c_by),
    replacementId: str(r.c_replacement),
  }
}

function placeOf(r: Row, prefix = ''): LocationPlace {
  return {
    type: r[`${prefix}location_type`] as LocationPlace['type'],
    branchId: str(r[`${prefix}branch_id`]),
    branchName: str(r[`${prefix}branch_name`]),
    branchCode: str(r[`${prefix}branch_code`]),
    description: str(r[`${prefix}description`]),
  }
}

/** Newest records shown in the history; rules and corrections never depend on this window. */
const HISTORY_PAGE = 500

/**
 * History of one vehicle, newest first (at most HISTORY_PAGE records of each kind). With `only`, returns just that
 * reading or event (any age), for corrections.
 */
export async function loadHistory(tx: Tx, vehicle: Pick<VisibleVehicle, 'id' | 'createdAt'>, only?: { readingId?: string; eventId?: string }): Promise<VehicleHistory> {
  const oneReading = only?.readingId ? sql`and r.id = ${only.readingId}` : sql``
  const oneEvent = only?.eventId ? sql`and e.id = ${only.eventId}` : sql``
  const odo = await tx.execute(sql`
    select r.id, r.km, r.event_type, r.source_type, r.occurred_at, r.created_at, r.note, r.jump_reason, u.name as recorded_by_name,
      c.id as c_id, c.action as c_action, c.reason as c_reason, c.created_at as c_at, cu.name as c_by,
      (select x.id from odometer_readings x where x.company_id = c.company_id and x.source_type = 'correction' and x.source_id = c.id) as c_replacement,
      oc.reading_id as corrects_id, oc.reason as corrects_reason, ocr.km as corrects_km
    from odometer_readings r
    left join users u on u.id = r.recorded_by
    left join odometer_corrections c on c.company_id = r.company_id and c.reading_id = r.id
    left join users cu on cu.id = c.created_by
    left join odometer_corrections oc on r.source_type = 'correction' and oc.company_id = r.company_id and oc.id = r.source_id
    left join odometer_readings ocr on ocr.company_id = oc.company_id and ocr.id = oc.reading_id
    where r.vehicle_id = ${vehicle.id} ${oneReading}
    order by r.occurred_at desc, r.created_at desc limit ${HISTORY_PAGE}`)
  const loc = await tx.execute(sql`
    select e.id, e.location_type, e.branch_id, b.name as branch_name, b.code as branch_code, e.description, e.reason,
      e.event_type, e.source_type, e.occurred_at, e.created_at, u.name as recorded_by_name,
      c.id as c_id, c.action as c_action, c.reason as c_reason, c.created_at as c_at, cu.name as c_by,
      (select x.id from vehicle_location_events x where x.company_id = c.company_id and x.source_type = 'correction' and x.source_id = c.id) as c_replacement,
      oc.event_id as corrects_id, oc.reason as corrects_reason,
      oe.location_type as o_location_type, oe.branch_id as o_branch_id, ob.name as o_branch_name, ob.code as o_branch_code, oe.description as o_description
    from vehicle_location_events e
    left join branches b on b.company_id = e.company_id and b.id = e.branch_id
    left join users u on u.id = e.recorded_by
    left join vehicle_location_corrections c on c.company_id = e.company_id and c.event_id = e.id
    left join users cu on cu.id = c.created_by
    left join vehicle_location_corrections oc on e.source_type = 'correction' and oc.company_id = e.company_id and oc.id = e.source_id
    left join vehicle_location_events oe on oe.company_id = oc.company_id and oe.id = oc.event_id
    left join branches ob on ob.company_id = oe.company_id and ob.id = oe.branch_id
    where e.vehicle_id = ${vehicle.id} ${oneEvent}
    order by e.occurred_at desc, e.created_at desc limit ${HISTORY_PAGE}`)
  const versions = (
    await tx.execute(sql`select
      (select count(*) from odometer_readings where vehicle_id = ${vehicle.id}) || '-' || (select count(*) from odometer_corrections where vehicle_id = ${vehicle.id}) as odometer,
      (select count(*) from vehicle_location_events where vehicle_id = ${vehicle.id}) || '-' || (select count(*) from vehicle_location_corrections where vehicle_id = ${vehicle.id}) as location`)
  ).rows[0] as { odometer: string; location: string }

  const odometer: OdometerEntry[] = (odo.rows as Row[]).map((r) => {
    const occurredAt = iso(r.occurred_at)
    const recordedAt = iso(r.created_at)
    const eventType = r.event_type as OdometerEntry['eventType']
    return {
      id: r.id as string,
      km: Number(r.km),
      eventType,
      sourceType: str(r.source_type),
      occurredAt,
      recordedAt,
      note: str(r.note),
      jumpReason: str(r.jump_reason),
      recordedByName: str(r.recorded_by_name),
      late: eventType === 'manual' && isLateEntry(occurredAt, recordedAt),
      effective: !r.c_id,
      deltaKm: null,
      correction: correctionOf(r),
      corrects: r.corrects_id ? { id: r.corrects_id as string, km: Number(r.corrects_km), reason: r.corrects_reason as string } : null,
    }
  })
  // Differences between consecutive effective readings, oldest first.
  let prevKm: number | null = null
  for (const o of [...odometer].reverse()) {
    if (!o.effective) continue
    o.deltaKm = prevKm === null ? null : o.km - prevKm
    prevKm = o.km
  }

  const locations: LocationEntry[] = (loc.rows as Row[]).map((r) => {
    const occurredAt = iso(r.occurred_at)
    const recordedAt = iso(r.created_at)
    const eventType = r.event_type as LocationEntry['eventType']
    return {
      id: r.id as string,
      ...placeOf(r),
      eventType,
      sourceType: str(r.source_type),
      reason: str(r.reason),
      occurredAt,
      recordedAt,
      recordedByName: str(r.recorded_by_name),
      late: eventType === 'manual' && isLateEntry(occurredAt, recordedAt),
      effective: !r.c_id,
      previous: null,
      correction: correctionOf(r),
      corrects: r.corrects_id ? { id: r.corrects_id as string, place: placeOf(r, 'o_'), reason: r.corrects_reason as string } : null,
    }
  })
  let prevPlace: LocationPlace | null = null
  for (const l of [...locations].reverse()) {
    if (!l.effective) continue
    l.previous = prevPlace
    prevPlace = { type: l.type, branchId: l.branchId, branchName: l.branchName, branchCode: l.branchCode, description: l.description }
  }

  return {
    odometer,
    locations,
    currentOdometerId: currentOf(odometer)?.id ?? null,
    currentLocationId: currentOf(locations)?.id ?? null,
    odometerVersion: versions.odometer,
    locationVersion: versions.location,
    vehicleCreatedAt: vehicle.createdAt,
  }
}

// ---------------------------------------------------------------------------
// Shared write checks

function assertVersion(expected: string, actual: string, history: VehicleHistory) {
  if (expected !== actual) {
    throw new AppError(
      409,
      'HISTORY_CHANGED',
      'Siz formu doldururken bu araç için başka bir kayıt girildi. Güncel geçmişi kontrol edip yeniden deneyin.',
      undefined,
      { history },
    )
  }
}

function assertTime(occurredAt: string, vehicle: VisibleVehicle) {
  if (isInFuture(occurredAt)) {
    throw new AppError(422, 'INVALID_TIME', 'Gelecekteki bir zaman için kayıt girilemez.', { occurredAt: 'Gelecekteki bir zaman girilemez' })
  }
  if (Date.parse(occurredAt) < Date.parse(vehicle.createdAt)) {
    const msg = `Araç kaydından (${timeText(vehicle.createdAt, vehicle.timezone)}) önceki bir zamana kayıt girilemez.`
    throw new AppError(422, 'INVALID_TIME', msg, { occurredAt: msg })
  }
}

/** Database guard violations, in case two requests slip past the API checks at the same moment. */
function mapDbError(e: unknown): never {
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string }
  if (pg.code === '23514' && pg.constraint === 'odometer_chronology') {
    throw new AppError(422, 'ODOMETER_OUT_OF_ORDER', 'Kilometre okuması önceki ve sonraki okumalarla uyumlu değil.', { km: 'Okuma sırası bozuluyor' })
  }
  if (pg.code === '23514' && (pg.constraint === 'odometer_future' || pg.constraint === 'location_future')) {
    throw new AppError(422, 'INVALID_TIME', 'Gelecekteki bir zaman için kayıt girilemez.', { occurredAt: 'Gelecekteki bir zaman girilemez' })
  }
  if (pg.code === '23514' && pg.constraint === 'location_manual_type') {
    throw new AppError(422, 'LOCATION_TYPE_NOT_ALLOWED', 'Elle yalnız şube veya servis konumu girilebilir.')
  }
  if (pg.code === '23505' && (pg.constraint === 'odometer_corrections_reading_key' || pg.constraint === 'vehicle_location_corrections_event_key')) {
    throw new AppError(409, 'ALREADY_CORRECTED', 'Bu kayıt az önce başka bir kullanıcı tarafından düzeltildi.')
  }
  if (pg.code === '23505' && pg.constraint?.endsWith('_request_key')) {
    throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim daha önce işlendi. Sayfayı yenileyin.')
  }
  throw e
}

async function insertOrMap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    return mapDbError(e)
  }
}

/** A repeated submit returns the first result instead of creating a second record. */
async function findRequest(tx: Tx, table: 'odometer_readings' | 'odometer_corrections' | 'vehicle_location_events' | 'vehicle_location_corrections', clientRequestId: string, vehicleId: string) {
  const r = (await tx.execute(sql`select id, vehicle_id from ${sql.identifier(table)} where client_request_id = ${clientRequestId}`)).rows[0] as
    | { id: string; vehicle_id: string }
    | undefined
  if (r && r.vehicle_id !== vehicleId) throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim başka bir araç için kullanıldı. Sayfayı yenileyin.')
  return r?.id ?? null
}

interface Neighbour {
  id: string
  km: number
  occurredAt: string
  recordedByName: string | null
}

/**
 * Effective readings around a moment, straight from the database (not from the displayed page of history):
 * the highest reading at or before it and the lowest after it. Same rule as the database guard.
 */
async function neighboursAt(tx: Tx, vehicleId: string, at: string, excludeId?: string) {
  const effective = sql`not exists (select 1 from odometer_corrections c where c.company_id = r.company_id and c.reading_id = r.id)`
  const exclude = excludeId ? sql`and r.id <> ${excludeId}` : sql``
  const pick = async (cond: ReturnType<typeof sql>, order: ReturnType<typeof sql>): Promise<Neighbour | null> => {
    const r = (
      await tx.execute(sql`select r.id, r.km, r.occurred_at, u.name as recorded_by_name from odometer_readings r left join users u on u.id = r.recorded_by
        where r.vehicle_id = ${vehicleId} and ${cond} and ${effective} ${exclude} order by ${order} limit 1`)
    ).rows[0] as Row | undefined
    return r ? { id: r.id as string, km: Number(r.km), occurredAt: iso(r.occurred_at), recordedByName: str(r.recorded_by_name) } : null
  }
  return {
    previous: await pick(sql`r.occurred_at <= ${at}`, sql`r.km desc, r.occurred_at desc`),
    next: await pick(sql`r.occurred_at > ${at}`, sql`r.km asc, r.occurred_at asc`),
  }
}

async function odometerProblem(tx: Tx, km: number, at: string, vehicle: VisibleVehicle, excludeId?: string) {
  const n = await neighboursAt(tx, vehicle.id, at, excludeId)
  const problem = odometerOrderProblem(km, n)
  if (!problem) return n
  const other = problem === 'below_previous' ? n.previous! : n.next!
  const when = timeText(other.occurredAt, vehicle.timezone)
  const message =
    problem === 'below_previous'
      ? `Bu değer, ${when} tarihli ${kmText(other.km)} okumasından düşük. Kilometre geriye gidemez; önceki okuma hatalıysa onu gerekçeyle düzeltin.`
      : `Bu değer, daha sonraki ${when} tarihli ${kmText(other.km)} okumasından yüksek. Geçmiş tarihli bir okuma sonraki okumaları aşamaz.`
  throw new AppError(422, 'ODOMETER_OUT_OF_ORDER', message, { km: message }, {
    problem,
    conflict: { id: other.id, km: other.km, occurredAt: other.occurredAt, recordedByName: other.recordedByName },
  })
}

function assertJumpReason(n: { previous: Neighbour | null }, km: number, at: string, reasonGiven: string | undefined) {
  const jump = largeJump(n.previous, km, at)
  if (jump && !reasonGiven) {
    const msg = `Bu okuma bir öncekinden ${kmText(jump.deltaKm)} fazla (günlük ortalama ${kmText(jump.perDay)}). Doğruysa gerekçe girerek onaylayın.`
    throw new AppError(422, 'LARGE_JUMP_REASON_REQUIRED', msg, { largeJumpReason: 'Büyük artış için gerekçe girin' }, { ...jump, previous: n.previous })
  }
  return jump
}

function samePlace(a: LocationPlace, b: { type: string; branchId?: string | null; description?: string | null }) {
  return a.type === b.type && (a.branchId ?? null) === (b.branchId ?? null) && (a.type !== 'service_provider' || (a.description ?? '').trim().toLowerCase() === (b.description ?? '').trim().toLowerCase())
}

async function assertTargetBranch(tx: Tx, access: CompanyAccess, branchId: string) {
  const b = (await tx.execute(sql`select id, name, status from branches where id = ${branchId}`)).rows[0] as { id: string; name: string; status: string } | undefined
  if (!b) throw new AppError(422, 'VALIDATION_FAILED', 'Şube bulunamadı.', { branchId: 'Şube bulunamadı' })
  if (b.status !== 'active') throw new AppError(422, 'VALIDATION_FAILED', 'Bu şube aktif değil.', { branchId: 'Aktif bir şube seçin' })
  // Company-wide users may choose any branch of the company; branch-limited users only their own (docs §8.5.3).
  if (!inScope(access, b.id)) {
    throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubeye konum kaydı yapma yetkiniz yok. Şubeler arası taşıma ileride Transfer modülüyle yapılacak.', {
      branchId: 'Bu şube için yetkiniz yok',
    })
  }
  return b
}

const placeSummary = (p: { type: string; branchName?: string | null; description?: string | null }) => ({ type: p.type, branchName: p.branchName ?? null, description: p.description ?? null })

// ---------------------------------------------------------------------------
// Routes

export async function vehicleHistoryRoutes(app: FastifyInstance) {
  /** Odometer and location history; the vehicle must be visible to the user (company + branch scope). */
  app.get('/:id/history', async (req) => {
    const { id } = params(vehicleParams, req.params)
    return withCompany(req, 'vehicles.read', async (tx, access) => loadHistory(tx, await visibleVehicle(tx, access, id)))
  })

  /** New manual odometer reading. */
  app.post('/:id/odometer', async (req, reply) => {
    const { id } = params(vehicleParams, req.params)
    const result = await withCompany(req, 'vehicles.odometer.record', async (tx, access): Promise<HistoryWriteResult> => {
      const input = odometerRecordSchema.parse(req.body)
      const vehicle = await visibleVehicle(tx, access, id)
      await lockHistory(tx, id)
      const repeated = await findRequest(tx, 'odometer_readings', input.clientRequestId, id)
      let history = await loadHistory(tx, vehicle)
      if (repeated) return { id: repeated, becameCurrent: history.currentOdometerId === repeated, duplicate: true, history }
      assertVersion(input.expectedVersion, history.odometerVersion, history)
      assertTime(input.occurredAt, vehicle)
      if (isLateEntry(input.occurredAt) && !input.note) {
        throw new AppError(422, 'NOTE_REQUIRED', '48 saatten eski kilometre kayıtlarında açıklama zorunludur.', { note: '48 saatten eski kayıtlarda açıklama girin' })
      }
      const n = await odometerProblem(tx, input.km, input.occurredAt, vehicle)
      const jump = assertJumpReason(n, input.km, input.occurredAt, input.largeJumpReason)
      const userId = req.auth!.user.id
      const row = await insertOrMap(async () =>
        (
          await tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, occurred_at, note, jump_reason, client_request_id, recorded_by)
            values (${access.companyId}, ${id}, ${input.km}, 'manual', 'manual', ${input.occurredAt}, ${input.note ?? null}, ${jump ? input.largeJumpReason! : null}, ${input.clientRequestId}, ${userId})
            returning id`)
        ).rows[0] as { id: string },
      )
      history = await loadHistory(tx, vehicle)
      const becameCurrent = history.currentOdometerId === row.id
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.odometer.record',
        entity: 'vehicle',
        entityId: id,
        summary: {
          readingId: row.id,
          km: input.km,
          occurredAt: input.occurredAt,
          previousKm: n.previous?.km ?? null,
          late: isLateEntry(input.occurredAt),
          jumpReason: jump ? input.largeJumpReason : null,
          becameCurrent,
        },
      })
      return { id: row.id, becameCurrent, duplicate: false, history }
    })
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })

  /** Takes a reading out of the effective history with a reason; 'replace' adds the right value at the same time. */
  app.post('/:id/odometer/:readingId/correct', async (req, reply) => {
    const { id, readingId } = params(readingParams, req.params)
    const result = await withCompany(req, 'vehicles.history.correct', async (tx, access): Promise<HistoryWriteResult> => {
      const input = odometerCorrectSchema.parse(req.body)
      const vehicle = await visibleVehicle(tx, access, id)
      await lockHistory(tx, id)
      const repeated = await findRequest(tx, 'odometer_corrections', input.clientRequestId, id)
      let history = await loadHistory(tx, vehicle)
      if (repeated) return { id: repeated, becameCurrent: false, duplicate: true, history }
      assertVersion(input.expectedVersion, history.odometerVersion, history)
      const reading = history.odometer.find((o) => o.id === readingId) ?? (await loadHistory(tx, vehicle, { readingId })).odometer[0]
      if (!reading) throw notFound(RECORD_NOT_FOUND)
      if (!reading.effective) throw new AppError(409, 'ALREADY_CORRECTED', 'Bu kayıt zaten düzeltilmiş. Gerekirse yerine geçen kaydı düzeltin.')
      if (!CORRECTABLE_SOURCES.has(reading.sourceType)) throw new AppError(409, 'SOURCE_OWNED', 'Bu kayıt kendi işleminden düzeltilmelidir.')
      let jump: ReturnType<typeof largeJump> = null
      if (input.action === 'replace') {
        if (input.km === reading.km) throw new AppError(422, 'VALIDATION_FAILED', 'Yeni değer eskisiyle aynı.', { km: 'Yeni değer eskisiyle aynı' })
        const n = await odometerProblem(tx, input.km!, reading.occurredAt, vehicle, reading.id)
        jump = assertJumpReason(n, input.km!, reading.occurredAt, input.largeJumpReason)
      }
      const userId = req.auth!.user.id
      const correction = await insertOrMap(async () =>
        (
          await tx.execute(sql`insert into odometer_corrections (company_id, vehicle_id, reading_id, action, reason, client_request_id, created_by)
            values (${access.companyId}, ${id}, ${readingId}, ${input.action}, ${input.reason}, ${input.clientRequestId}, ${userId}) returning id`)
        ).rows[0] as { id: string },
      )
      let replacementId: string | null = null
      if (input.action === 'replace') {
        replacementId = await insertOrMap(async () =>
          (
            (
              await tx.execute(sql`insert into odometer_readings (company_id, vehicle_id, km, event_type, source_type, source_id, occurred_at, jump_reason, recorded_by)
                values (${access.companyId}, ${id}, ${input.km!}, 'correction', 'correction', ${correction.id}, ${reading.occurredAt}, ${jump ? input.largeJumpReason! : null}, ${userId})
                returning id`)
            ).rows[0] as { id: string }
          ).id,
        )
      }
      history = await loadHistory(tx, vehicle)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.odometer.correct',
        entity: 'vehicle',
        entityId: id,
        summary: { readingId, correctionId: correction.id, action: input.action, oldKm: reading.km, newKm: input.action === 'replace' ? input.km : null, reason: input.reason, replacementId },
      })
      return { id: correction.id, becameCurrent: replacementId !== null && history.currentOdometerId === replacementId, duplicate: false, history }
    })
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })

  /** New manual location: at a branch or at a service provider. Not a transfer; the home branch does not change. */
  app.post('/:id/location', async (req, reply) => {
    const { id } = params(vehicleParams, req.params)
    const result = await withCompany(req, 'vehicles.location.record', async (tx, access): Promise<HistoryWriteResult> => {
      const input = locationRecordSchema.parse(req.body)
      const vehicle = await visibleVehicle(tx, access, id)
      const branch = input.locationType === 'branch' ? await assertTargetBranch(tx, access, input.branchId!) : null
      await lockHistory(tx, id)
      const repeated = await findRequest(tx, 'vehicle_location_events', input.clientRequestId, id)
      let history = await loadHistory(tx, vehicle)
      if (repeated) return { id: repeated, becameCurrent: history.currentLocationId === repeated, duplicate: true, history }
      assertVersion(input.expectedVersion, history.locationVersion, history)
      assertTime(input.occurredAt, vehicle)
      const current = history.locations.find((l) => l.id === history.currentLocationId) ?? null
      const target = { type: input.locationType, branchId: branch?.id ?? null, description: input.locationType === 'service_provider' ? input.description! : null }
      const willBeCurrent = !current || Date.parse(input.occurredAt) >= Date.parse(current.occurredAt)
      if (willBeCurrent && current && samePlace(current, target)) {
        throw new AppError(422, 'SAME_LOCATION', 'Araç zaten bu konumda kayıtlı.', { locationType: 'Araç zaten bu konumda' })
      }
      const userId = req.auth!.user.id
      const row = await insertOrMap(async () =>
        (
          await tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, description, reason, event_type, source_type, occurred_at, client_request_id, recorded_by)
            values (${access.companyId}, ${id}, ${target.type}, ${target.branchId}, ${target.description}, ${input.reason}, 'manual', 'manual', ${input.occurredAt}, ${input.clientRequestId}, ${userId})
            returning id`)
        ).rows[0] as { id: string },
      )
      history = await loadHistory(tx, vehicle)
      const becameCurrent = history.currentLocationId === row.id
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.location.record',
        entity: 'vehicle',
        entityId: id,
        summary: {
          eventId: row.id,
          from: current ? placeSummary(current) : null,
          to: placeSummary({ ...target, branchName: branch?.name }),
          occurredAt: input.occurredAt,
          reason: input.reason,
          becameCurrent,
        },
      })
      return { id: row.id, becameCurrent, duplicate: false, history }
    })
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })

  /** Takes a location event out of the effective history with a reason; 'replace' records the right place at the same time. */
  app.post('/:id/location/:eventId/correct', async (req, reply) => {
    const { id, eventId } = params(eventParams, req.params)
    const result = await withCompany(req, 'vehicles.history.correct', async (tx, access): Promise<HistoryWriteResult> => {
      const input = locationCorrectSchema.parse(req.body)
      const vehicle = await visibleVehicle(tx, access, id)
      const branch = input.action === 'replace' && input.locationType === 'branch' ? await assertTargetBranch(tx, access, input.branchId!) : null
      await lockHistory(tx, id)
      const repeated = await findRequest(tx, 'vehicle_location_corrections', input.clientRequestId, id)
      let history = await loadHistory(tx, vehicle)
      if (repeated) return { id: repeated, becameCurrent: false, duplicate: true, history }
      assertVersion(input.expectedVersion, history.locationVersion, history)
      const event = history.locations.find((l) => l.id === eventId) ?? (await loadHistory(tx, vehicle, { eventId })).locations[0]
      if (!event) throw notFound(RECORD_NOT_FOUND)
      if (!event.effective) throw new AppError(409, 'ALREADY_CORRECTED', 'Bu kayıt zaten düzeltilmiş. Gerekirse yerine geçen kaydı düzeltin.')
      if (!CORRECTABLE_SOURCES.has(event.sourceType)) throw new AppError(409, 'SOURCE_OWNED', 'Bu kayıt kendi işleminden düzeltilmelidir.')
      if (event.branchId && !inScope(access, event.branchId)) {
        throw new AppError(403, 'BRANCH_FORBIDDEN', 'Yetkiniz dışındaki bir şubeye ait konum kaydını düzeltemezsiniz.')
      }
      const target =
        input.action === 'replace'
          ? { type: input.locationType!, branchId: branch?.id ?? null, description: input.locationType === 'service_provider' ? input.description! : null }
          : null
      if (target && samePlace(event, target)) throw new AppError(422, 'VALIDATION_FAILED', 'Yeni konum eskisiyle aynı.', { locationType: 'Yeni konum eskisiyle aynı' })
      const userId = req.auth!.user.id
      const correction = await insertOrMap(async () =>
        (
          await tx.execute(sql`insert into vehicle_location_corrections (company_id, vehicle_id, event_id, action, reason, client_request_id, created_by)
            values (${access.companyId}, ${id}, ${eventId}, ${input.action}, ${input.reason}, ${input.clientRequestId}, ${userId}) returning id`)
        ).rows[0] as { id: string },
      )
      let replacementId: string | null = null
      if (target) {
        replacementId = await insertOrMap(async () =>
          (
            (
              await tx.execute(sql`insert into vehicle_location_events (company_id, vehicle_id, location_type, branch_id, description, reason, event_type, source_type, source_id, occurred_at, recorded_by)
                values (${access.companyId}, ${id}, ${target.type}, ${target.branchId}, ${target.description}, ${input.reason}, 'correction', 'correction', ${correction.id}, ${event.occurredAt}, ${userId})
                returning id`)
            ).rows[0] as { id: string }
          ).id,
        )
      }
      history = await loadHistory(tx, vehicle)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.location.correct',
        entity: 'vehicle',
        entityId: id,
        summary: {
          eventId,
          correctionId: correction.id,
          action: input.action,
          from: placeSummary(event),
          to: target ? placeSummary({ ...target, branchName: branch?.name }) : null,
          reason: input.reason,
          replacementId,
        },
      })
      return { id: correction.id, becameCurrent: replacementId !== null && history.currentLocationId === replacementId, duplicate: false, history }
    })
    return reply.code(result.duplicate ? 200 : 201).send(result)
  })
}
