import { z } from 'zod'
import type { LocationSummary } from './vehicles'

// ---------------------------------------------------------------------------
// Odometer and physical location history (spec §59CY, §59CG, §13.3 tab 8; docs/TEKNIK_UYGULAMA.md §8.5).
// Current values are derived from append-only events; corrections are new records with a reason.

/** A jump above either threshold needs an extra confirmation with a reason (UI and API). */
export const LARGE_JUMP_KM = 20_000
export const LARGE_JUMP_KM_PER_DAY = 1_500
/** Odometer entries older than this need a note. */
export const LATE_ENTRY_HOURS = 48
/** Clock tolerance for "not in the future". */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000
export const MAX_ODOMETER_KM = 3_000_000

/** Manual entries may only place a vehicle at a branch or at a service provider. In transit, with customer and at supplier come from later modules. */
export const MANUAL_LOCATION_TYPES = ['branch', 'service_provider'] as const
export type ManualLocationType = (typeof MANUAL_LOCATION_TYPES)[number]
export const CORRECTION_ACTIONS = ['replace', 'void'] as const
export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number]

const blank = (v: unknown) => (v === '' || v === null ? undefined : v)
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max, `En fazla ${max} karakter`).optional())
const reason = (min: number, label = 'Gerekçe') =>
  z.string({ error: `${label} girin` }).trim().min(min, `${label} en az ${min} karakter olmalı`).max(300, 'En fazla 300 karakter')
const optReason = z.preprocess(blank, reason(5).optional())
const km = z.coerce.number({ error: 'Kilometre girin' }).int('Tam sayı girin').min(0, 'Kilometre negatif olamaz').max(MAX_ODOMETER_KM, '3.000.000 km üstü girilemez')
const occurredAt = z.iso.datetime({ offset: true, error: 'Geçerli bir tarih ve saat girin' })
/** Guards against stale screens and repeated submits (docs §8.5.4). */
const concurrency = { expectedVersion: z.string().max(40), clientRequestId: z.uuid() }

export const odometerRecordSchema = z.object({
  km,
  occurredAt,
  note: optText(300),
  largeJumpReason: optReason,
  ...concurrency,
})
export type OdometerRecordInput = z.output<typeof odometerRecordSchema>

export const odometerCorrectSchema = z
  .object({
    action: z.enum(CORRECTION_ACTIONS, { error: 'Düzeltme türünü seçin' }),
    km: z.preprocess(blank, km.optional()),
    reason: reason(5),
    largeJumpReason: optReason,
    ...concurrency,
  })
  .superRefine((v, ctx) => {
    if (v.action === 'replace' && v.km === undefined) ctx.addIssue({ code: 'custom', path: ['km'], message: 'Doğru kilometreyi girin' })
  })
export type OdometerCorrectInput = z.output<typeof odometerCorrectSchema>

const locationFields = {
  locationType: z.enum(MANUAL_LOCATION_TYPES, { error: 'Konum türünü seçin' }),
  branchId: z.preprocess(blank, z.uuid('Şube seçin').optional()),
  description: optText(120),
}
const locationRefine = (v: { locationType?: ManualLocationType; branchId?: string; description?: string }, ctx: z.RefinementCtx) => {
  if (v.locationType === 'branch' && !v.branchId) ctx.addIssue({ code: 'custom', path: ['branchId'], message: 'Şube seçin' })
  if (v.locationType === 'service_provider' && !v.description) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Servisin veya yerin adını girin' })
}

export const locationRecordSchema = z
  .object({ ...locationFields, reason: reason(3, 'Değişiklik nedeni'), occurredAt, ...concurrency })
  .superRefine(locationRefine)
export type LocationRecordInput = z.output<typeof locationRecordSchema>

export const locationCorrectSchema = z
  .object({
    action: z.enum(CORRECTION_ACTIONS, { error: 'Düzeltme türünü seçin' }),
    locationType: z.enum(MANUAL_LOCATION_TYPES).optional(),
    branchId: locationFields.branchId,
    description: locationFields.description,
    reason: reason(5),
    ...concurrency,
  })
  .superRefine((v, ctx) => {
    if (v.action !== 'replace') return
    if (!v.locationType) ctx.addIssue({ code: 'custom', path: ['locationType'], message: 'Doğru konumu seçin' })
    else locationRefine(v, ctx)
  })
export type LocationCorrectInput = z.output<typeof locationCorrectSchema>

// ---------------------------------------------------------------------------
// Pure rules, shared by the API (authoritative) and the forms (early explanation).

export interface OdometerPoint {
  id: string
  km: number
  occurredAt: string
  effective: boolean
}

/**
 * Neighbours of a moment among effective readings: `previous` is the highest reading at or before it,
 * `next` the lowest reading after it. A new value must satisfy previous.km <= km <= next.km.
 */
export function odometerNeighbours<T extends OdometerPoint>(readings: T[], at: string, excludeId?: string) {
  const t = Date.parse(at)
  let previous: T | null = null
  let next: T | null = null
  for (const r of readings) {
    if (!r.effective || r.id === excludeId) continue
    const rt = Date.parse(r.occurredAt)
    if (rt <= t) {
      if (!previous || r.km > previous.km) previous = r
    } else if (!next || r.km < next.km) next = r
  }
  return { previous, next }
}

export type OdometerOrderProblem = 'below_previous' | 'above_next' | null
export function odometerOrderProblem(km: number, n: { previous: OdometerPoint | null; next: OdometerPoint | null }): OdometerOrderProblem {
  if (n.previous && km < n.previous.km) return 'below_previous'
  if (n.next && km > n.next.km) return 'above_next'
  return null
}

/** Jump from the previous effective reading; null when below both thresholds. Days count as at least one. */
export function largeJump(previous: { km: number; occurredAt: string } | null, km: number, at: string) {
  if (!previous) return null
  const deltaKm = km - previous.km
  if (deltaKm <= 0) return null
  const days = Math.max(1, (Date.parse(at) - Date.parse(previous.occurredAt)) / 86_400_000)
  const perDay = Math.round(deltaKm / days)
  return deltaKm > LARGE_JUMP_KM || perDay > LARGE_JUMP_KM_PER_DAY ? { deltaKm, perDay, days: Math.round(days * 10) / 10 } : null
}

export const isLateEntry = (occurredAt: string, recordedAt: string | number = Date.now()) =>
  (new Date(recordedAt).getTime() - Date.parse(occurredAt)) / 3_600_000 > LATE_ENTRY_HOURS

export const isInFuture = (occurredAt: string, now = Date.now()) => Date.parse(occurredAt) > now + FUTURE_TOLERANCE_MS

/** Latest effective record by event time, then by entry time. */
export function currentOf<T extends { effective: boolean; occurredAt: string; recordedAt: string }>(items: T[]): T | null {
  let best: T | null = null
  for (const i of items) {
    if (!i.effective) continue
    if (!best || i.occurredAt > best.occurredAt || (i.occurredAt === best.occurredAt && i.recordedAt > best.recordedAt)) best = i
  }
  return best
}

// ---------------------------------------------------------------------------
// API shapes

export interface HistoryCorrection {
  id: string
  action: CorrectionAction
  reason: string
  at: string
  byName: string | null
  /** The record that replaced this one ('replace' only). */
  replacementId: string | null
}

export interface OdometerEntry {
  id: string
  km: number
  eventType: 'initial' | 'manual' | 'correction'
  sourceType: string | null
  occurredAt: string
  recordedAt: string
  note: string | null
  jumpReason: string | null
  recordedByName: string | null
  /** Entered more than 48 hours after the event. */
  late: boolean
  /** Not corrected; counts for the current value. */
  effective: boolean
  /** Difference to the previous effective reading (effective readings only). */
  deltaKm: number | null
  correction: HistoryCorrection | null
  /** For a replacement reading: the reading it corrects, and why. */
  corrects: { id: string; km: number; reason: string } | null
}

export interface LocationPlace {
  type: LocationSummary['type']
  branchId: string | null
  branchName: string | null
  branchCode: string | null
  description: string | null
}

export interface LocationEntry extends LocationPlace {
  id: string
  eventType: 'initial' | 'manual' | 'correction'
  sourceType: string | null
  reason: string | null
  occurredAt: string
  recordedAt: string
  recordedByName: string | null
  late: boolean
  effective: boolean
  /** Previous effective place (effective events only). */
  previous: LocationPlace | null
  correction: HistoryCorrection | null
  corrects: { id: string; place: LocationPlace; reason: string } | null
}

export interface VehicleHistory {
  /** Newest first. */
  odometer: OdometerEntry[]
  locations: LocationEntry[]
  currentOdometerId: string | null
  currentLocationId: string | null
  /** Concurrency tokens: number of records and corrections. Sent back as expectedVersion. */
  odometerVersion: string
  locationVersion: string
  /** Vehicle registration time; entries cannot be dated before it. */
  vehicleCreatedAt: string
}

export interface HistoryWriteResult {
  id: string
  /** False when a back-dated entry was added behind a newer record. */
  becameCurrent: boolean
  /** True when the same clientRequestId was already processed (no new record). */
  duplicate: boolean
  history: VehicleHistory
}
