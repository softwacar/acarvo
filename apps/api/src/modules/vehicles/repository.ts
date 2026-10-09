import {
  type LocationSummary,
  normalizePlate,
  type VehicleDetail,
  type VehicleInput,
  type VehicleListItem,
  type VehicleListQuery,
  type VehicleSort,
} from '@acarvo/shared'
import { and, eq, ne, type SQL, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { branches, vehicleClasses, vehicles } from '../../db/schema'
import { AppError } from '../../lib/errors'
import type { CompanyAccess } from '../auth/context'

/** Branches whose vehicles the user may see and change; null means all branches of the company. */
export const branchScope = (access: CompanyAccess): string[] | null => (access.allBranches ? null : access.branchIds)
export const inScope = (access: CompanyAccess, branchId: string) => access.allBranches || access.branchIds.includes(branchId)

// Money is stored in minor units; the API speaks decimal strings ("18500.00").
export const toMinor = (decimal: string) => {
  const [whole, frac = ''] = decimal.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}
export const fromMinor = (minor: number) => `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`

const SORT_SQL: Record<VehicleSort, string> = {
  plate: 'v.plate_normalized',
  vehicle: 'lower(v.make) %DIR%, lower(v.model)',
  class: 'c.sort_order %DIR%, c.name',
  branch: 'b.name',
  km: 'o.km',
  year: 'v.model_year',
  created: 'v.created_at',
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

/** Current odometer and physical location are the latest events, never columns on the vehicle. */
const FROM = sql`
  from vehicles v
  join vehicle_classes c on c.company_id = v.company_id and c.id = v.class_id
  join branches b on b.company_id = v.company_id and b.id = v.home_branch_id
  left join lateral (
    select r.km, r.occurred_at from odometer_readings r
    where r.company_id = v.company_id and r.vehicle_id = v.id
    order by r.occurred_at desc, r.created_at desc limit 1
  ) o on true
  left join lateral (
    select e.location_type, e.occurred_at, lb.name as branch_name from vehicle_location_events e
    left join branches lb on lb.company_id = e.company_id and lb.id = e.branch_id
    where e.company_id = v.company_id and e.vehicle_id = v.id
    order by e.occurred_at desc, e.created_at desc limit 1
  ) l on true`

type Row = Record<string, unknown>
/** Timestamps arrive as Date or as PostgreSQL text ("2026-10-09 22:41:23.5+02"); the API always answers ISO 8601. */
const iso = (v: unknown) =>
  v instanceof Date ? v.toISOString() : new Date(String(v).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString()
const odometerOf = (r: Row) => (r.km == null ? null : { km: Number(r.km), at: iso(r.km_at) })
const locationOf = (r: Row): LocationSummary | null =>
  r.location_type == null ? null : { type: r.location_type as LocationSummary['type'], branchName: (r.location_branch as string) ?? null, at: iso(r.location_at) }

const SELECT_LIST = sql`v.*, c.name as class_name, b.name as branch_name, b.code as branch_code,
  o.km, o.occurred_at as km_at, l.location_type, l.branch_name as location_branch, l.occurred_at as location_at`

export async function listVehicles(tx: Tx, access: CompanyAccess, q: VehicleListQuery) {
  const conds: SQL[] = []
  const scope = branchScope(access)
  if (scope) conds.push(scope.length ? sql`v.home_branch_id in ${scope}` : sql`false`)
  if (q.q) {
    const pattern = `%${escapeLike(q.q.toLocaleLowerCase('tr'))}%`
    const plate = normalizePlate(q.q)
    conds.push(sql`(
      ${plate ? sql`v.plate_normalized like ${`%${escapeLike(plate)}%`} or` : sql``}
      lower(coalesce(v.vehicle_code, '')) like ${pattern}
      or lower(v.make || ' ' || v.model || coalesce(' ' || v.trim, '')) like ${pattern}
    )`)
  }
  if (q.classId) conds.push(sql`v.class_id = ${q.classId}`)
  if (q.branchId) conds.push(sql`v.home_branch_id = ${q.branchId}`)
  if (q.status) conds.push(sql`v.status = ${q.status}`)
  if (q.fuelType) conds.push(sql`v.fuel_type = ${q.fuelType}`)
  if (q.transmission) conds.push(sql`v.transmission = ${q.transmission}`)
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``

  const dir = q.dir === 'desc' ? 'desc' : 'asc'
  const order = sql.raw(`${SORT_SQL[q.sort].replaceAll('%DIR%', dir)} ${dir} nulls last, v.plate_normalized asc, v.id asc`)
  const offset = (q.page - 1) * q.pageSize

  const result = await tx.execute(sql`select ${SELECT_LIST}, count(*) over () as total_count ${FROM} ${where} order by ${order} limit ${q.pageSize} offset ${offset}`)
  const rows = result.rows as Row[]
  let total = rows.length ? Number(rows[0]!.total_count) : 0
  if (!rows.length && q.page > 1) {
    // Past the last page: still report the real total.
    const c = await tx.execute(sql`select count(*) as n ${FROM} ${where}`)
    total = Number((c.rows[0] as Row).n)
  }
  const items: VehicleListItem[] = rows.map((r) => ({
    id: r.id as string,
    plate: r.plate as string,
    vehicleCode: (r.vehicle_code as string) ?? null,
    make: r.make as string,
    model: r.model as string,
    trim: (r.trim as string) ?? null,
    modelYear: (r.model_year as number) ?? null,
    className: r.class_name as string,
    source: r.source as VehicleListItem['source'],
    homeBranch: { id: r.home_branch_id as string, name: r.branch_name as string, code: r.branch_code as string },
    fuelType: r.fuel_type as VehicleListItem['fuelType'],
    transmission: r.transmission as VehicleListItem['transmission'],
    status: r.status as VehicleListItem['status'],
    odometer: odometerOf(r),
    location: locationOf(r),
  }))
  return { items, total, page: q.page, pageSize: q.pageSize }
}

/** One vehicle, or null when it does not exist in this company or is outside the user's branches. */
export async function getVehicle(tx: Tx, access: CompanyAccess, id: string): Promise<VehicleDetail | null> {
  const result = await tx.execute(
    sql`select ${SELECT_LIST}, u.name as updated_by_name ${FROM} left join users u on u.id = v.updated_by where v.id = ${id} limit 1`,
  )
  const r = result.rows[0] as Row | undefined
  if (!r || !inScope(access, r.home_branch_id as string)) return null
  return {
    id: r.id as string,
    plate: r.plate as string,
    vehicleCode: (r.vehicle_code as string) ?? null,
    make: r.make as string,
    model: r.model as string,
    trim: (r.trim as string) ?? null,
    modelYear: (r.model_year as number) ?? null,
    classId: r.class_id as string,
    className: r.class_name as string,
    color: (r.color as string) ?? null,
    vin: (r.vin as string) ?? null,
    fuelType: r.fuel_type as VehicleDetail['fuelType'],
    transmission: r.transmission as VehicleDetail['transmission'],
    seats: (r.seats as number) ?? null,
    source: r.source as VehicleDetail['source'],
    homeBranchId: r.home_branch_id as string,
    homeBranchName: r.branch_name as string,
    status: r.status as VehicleDetail['status'],
    acquisitionType: (r.acquisition_type as VehicleDetail['acquisitionType']) ?? null,
    acquisitionDate: r.acquisition_date ? String(r.acquisition_date).slice(0, 10) : null,
    acquisitionSeller: (r.acquisition_seller as string) ?? null,
    acquisitionCost: r.acquisition_cost_minor == null ? null : fromMinor(Number(r.acquisition_cost_minor)),
    acquisitionCurrency: (r.acquisition_currency as string) ?? null,
    acquisitionReference: (r.acquisition_reference as string) ?? null,
    notes: (r.notes as string) ?? null,
    version: r.version as number,
    odometer: odometerOf(r),
    location: locationOf(r),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    updatedByName: (r.updated_by_name as string) ?? null,
  }
}

/** Class and branch must exist in this company (RLS) and the branch must be within the user's scope. */
export async function assertReferences(tx: Tx, access: CompanyAccess, input: { classId: string; homeBranchId: string }, extraBranch?: { field: string; id: string }) {
  const [cls] = await tx.select({ id: vehicleClasses.id }).from(vehicleClasses).where(eq(vehicleClasses.id, input.classId))
  if (!cls) throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { classId: 'Seçilen araç sınıfı bulunamadı' })
  for (const [field, id] of [['homeBranchId', input.homeBranchId], ...(extraBranch ? [[extraBranch.field, extraBranch.id]] : [])] as [string, string][]) {
    const [br] = await tx.select({ id: branches.id, status: branches.status }).from(branches).where(eq(branches.id, id))
    if (!br || br.status !== 'active') throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { [field]: 'Seçilen şube bulunamadı' })
    if (!inScope(access, id)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şube için yetkiniz yok.', { [field]: 'Bu şubede araç işlemi yapma yetkiniz yok' })
  }
}

/** Plate and vehicle code are unique within the company. The answer links to the existing record when the user may see it. */
export async function assertUnique(tx: Tx, access: CompanyAccess, input: { plate: string; vehicleCode?: string }, exceptId?: string) {
  const plate = normalizePlate(input.plate)
  const notSelf = exceptId ? ne(vehicles.id, exceptId) : undefined
  const [dup] = await tx
    .select({ id: vehicles.id, plate: vehicles.plate, homeBranchId: vehicles.homeBranchId })
    .from(vehicles)
    .where(and(eq(vehicles.plateNormalized, plate), notSelf))
    .limit(1)
  if (dup) {
    const visible = inScope(access, dup.homeBranchId)
    throw new AppError(
      409,
      'DUPLICATE_PLATE',
      visible ? `${dup.plate} plakası bu şirkette zaten kayıtlı.` : 'Bu plaka şirketinizde yetkiniz olmayan bir şubede kayıtlı.',
      { plate: 'Bu plaka zaten kayıtlı' },
      visible ? { id: dup.id, plate: dup.plate } : null,
    )
  }
  if (input.vehicleCode) {
    const [dupCode] = await tx
      .select({ id: vehicles.id, plate: vehicles.plate, homeBranchId: vehicles.homeBranchId })
      .from(vehicles)
      .where(and(sql`lower(${vehicles.vehicleCode}) = ${input.vehicleCode.toLocaleLowerCase('tr')}`, notSelf))
      .limit(1)
    if (dupCode) {
      const visible = inScope(access, dupCode.homeBranchId)
      throw new AppError(
        409,
        'DUPLICATE_CODE',
        visible ? `Bu araç kodu ${dupCode.plate} plakalı araçta kullanılıyor.` : 'Bu araç kodu şirketinizde başka bir araçta kullanılıyor.',
        { vehicleCode: 'Bu araç kodu zaten kullanılıyor' },
        visible ? { id: dupCode.id, plate: dupCode.plate } : null,
      )
    }
  }
}

/** Column values for the editable master data. */
export function vehicleColumns(input: VehicleInput) {
  return {
    plate: input.plate.toLocaleUpperCase('tr').replace(/\s+/g, ' '),
    plateNormalized: normalizePlate(input.plate),
    vehicleCode: input.vehicleCode ?? null,
    make: input.make,
    model: input.model,
    trim: input.trim ?? null,
    modelYear: input.modelYear ?? null,
    classId: input.classId,
    color: input.color ?? null,
    vin: input.vin ?? null,
    fuelType: input.fuelType,
    transmission: input.transmission,
    seats: input.seats ?? null,
    homeBranchId: input.homeBranchId,
    status: input.status,
    acquisitionType: input.acquisitionType ?? null,
    acquisitionDate: input.acquisitionDate ?? null,
    acquisitionSeller: input.acquisitionSeller ?? null,
    acquisitionCostMinor: input.acquisitionCost === undefined ? null : toMinor(input.acquisitionCost),
    acquisitionCurrency: input.acquisitionCurrency ?? null,
    acquisitionReference: input.acquisitionReference ?? null,
    notes: input.notes ?? null,
  }
}

/** Unique-constraint races (two saves at once) end as the same 409 as the pre-check. */
export function mapUniqueViolation(e: unknown): never {
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string }
  if (pg.code === '23505' && pg.constraint === 'vehicles_company_plate_key') {
    throw new AppError(409, 'DUPLICATE_PLATE', 'Bu plaka bu şirkette zaten kayıtlı.', { plate: 'Bu plaka zaten kayıtlı' }, null)
  }
  if (pg.code === '23505' && pg.constraint === 'vehicles_company_code_key') {
    throw new AppError(409, 'DUPLICATE_CODE', 'Bu araç kodu zaten kullanılıyor.', { vehicleCode: 'Bu araç kodu zaten kullanılıyor' }, null)
  }
  throw e
}

/** Odometer and physical location events of one vehicle, newest first. Append-only sources. */
export async function vehicleHistory(tx: Tx, vehicleId: string) {
  const odometer = await tx.execute(sql`
    select r.id, r.km, r.event_type, r.occurred_at, r.note, u.name as recorded_by_name
    from odometer_readings r left join users u on u.id = r.recorded_by
    where r.vehicle_id = ${vehicleId}
    order by r.occurred_at desc, r.created_at desc limit 200`)
  const locations = await tx.execute(sql`
    select e.id, e.location_type, e.event_type, e.description, e.occurred_at, b.name as branch_name, b.code as branch_code, u.name as recorded_by_name
    from vehicle_location_events e
    left join branches b on b.company_id = e.company_id and b.id = e.branch_id
    left join users u on u.id = e.recorded_by
    where e.vehicle_id = ${vehicleId}
    order by e.occurred_at desc, e.created_at desc limit 200`)
  return {
    odometer: (odometer.rows as Row[]).map((r) => ({
      id: r.id as string,
      km: Number(r.km),
      eventType: r.event_type as string,
      occurredAt: iso(r.occurred_at),
      note: (r.note as string) ?? null,
      recordedByName: (r.recorded_by_name as string) ?? null,
    })),
    locations: (locations.rows as Row[]).map((r) => ({
      id: r.id as string,
      type: r.location_type as LocationSummary['type'],
      eventType: r.event_type as string,
      description: (r.description as string) ?? null,
      branchName: (r.branch_name as string) ?? null,
      branchCode: (r.branch_code as string) ?? null,
      occurredAt: iso(r.occurred_at),
      recordedByName: (r.recorded_by_name as string) ?? null,
    })),
  }
}

/** Audit entries about one vehicle, newest first. */
export async function vehicleActivity(tx: Tx, vehicleId: string) {
  const result = await tx.execute(sql`
    select a.id, a.action, a.summary, a.created_at, u.name as actor_name
    from audit_log a left join users u on u.id = a.actor_user_id
    where a.entity = 'vehicle' and a.entity_id = ${vehicleId}
    order by a.created_at desc limit 100`)
  return (result.rows as Row[]).map((r) => ({
    id: r.id as string,
    action: r.action as string,
    summary: (r.summary as Record<string, unknown>) ?? null,
    at: iso(r.created_at),
    actorName: (r.actor_name as string) ?? null,
  }))
}
