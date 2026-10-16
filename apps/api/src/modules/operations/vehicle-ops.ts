import {
  type AllocationConflict,
  maintenanceScheduleSchema,
  maintenanceSearchSchema,
  damageSearchSchema,
  SERVICE_DUE_SOON_DAYS,
  SERVICE_DUE_SOON_KM,
  type ServiceDue,
  transferSearchSchema,
  type VehicleOperations,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { vehicleBusy } from '../../lib/vehicle-allocation'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { inScope } from '../vehicles/repository'
import { listDamages } from './damage'
import { listMaintenance } from './maintenance'
import { listTransfers } from './transfers'
import { parseId, type Row, VEHICLE_NOT_FOUND } from './common'

// Vehicle 360°: what holds the vehicle, its maintenance, damage files and transfers, and the periodic service reminder.

async function visibleVehicle(tx: Tx, access: CompanyAccess, id: string) {
  const r = (await tx.execute(sql`select id, plate, home_branch_id from vehicles where id = ${id}`)).rows[0] as Row | undefined
  if (!r || !inScope(access, r.home_branch_id as string)) throw notFound(VEHICLE_NOT_FOUND)
  return r
}

const addMonths = (iso: string, months: number) => {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

/** Periodic service from real records only: the last completed periodic maintenance, the current odometer, the schedule. */
export async function serviceDue(tx: Tx, vehicleId: string): Promise<ServiceDue> {
  const s = (await tx.execute(sql`select interval_km, interval_months, version from maintenance_schedules where vehicle_id = ${vehicleId}`)).rows[0] as Row | undefined
  const last = (
    await tx.execute(sql`select maintenance_no, completed_at, end_km from maintenance_records where vehicle_id = ${vehicleId} and type = 'periodic' and status = 'completed'
      order by completed_at desc limit 1`)
  ).rows[0] as Row | undefined
  const cur = (
    await tx.execute(sql`select r.km from odometer_readings r where r.vehicle_id = ${vehicleId}
      and not exists (select 1 from odometer_corrections c where c.company_id = r.company_id and c.reading_id = r.id) order by r.occurred_at desc, r.created_at desc limit 1`)
  ).rows[0] as Row | undefined
  const schedule = s ? { intervalKm: s.interval_km == null ? null : Number(s.interval_km), intervalMonths: s.interval_months == null ? null : Number(s.interval_months), version: Number(s.version) } : null
  const lastOut = last ? { maintenanceNo: last.maintenance_no as string, completedAt: toIso(last.completed_at), km: Number(last.end_km) } : null
  const currentKm = cur ? Number(cur.km) : null
  return classifyServiceDue(schedule, lastOut, currentKm)
}

/** The service reminder rule, shared by the vehicle view and the dashboard (one definition). */
export function classifyServiceDue(schedule: ServiceDue['schedule'], lastOut: ServiceDue['last'], currentKm: number | null): ServiceDue {
  const base: ServiceDue = { state: 'no_schedule', schedule, last: lastOut, currentKm, nextDueKm: null, nextDueDate: null, kmLeft: null, daysLeft: null }
  if (!schedule) return base
  if (!lastOut) return { ...base, state: 'no_history' }
  const nextDueKm = schedule.intervalKm != null ? lastOut.km + schedule.intervalKm : null
  const nextDueDate = schedule.intervalMonths != null ? addMonths(lastOut.completedAt, schedule.intervalMonths) : null
  const kmLeft = nextDueKm != null && currentKm != null ? nextDueKm - currentKm : null
  const daysLeft = nextDueDate ? Math.floor((Date.parse(nextDueDate) - Date.now()) / 86_400_000) : null
  const overdue = (kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft < 0)
  const soon = (kmLeft != null && kmLeft <= SERVICE_DUE_SOON_KM) || (daysLeft != null && daysLeft <= SERVICE_DUE_SOON_DAYS)
  return { ...base, state: overdue ? 'overdue' : soon ? 'due_soon' : 'ok', nextDueKm, nextDueDate, kmLeft, daysLeft }
}

export async function vehicleOperationRoutes(app: FastifyInstance) {
  app.get('/:id/operations', async (req) => {
    const id = parseId(req, VEHICLE_NOT_FOUND)
    return withCompany(req, 'vehicles.read', async (tx, access): Promise<VehicleOperations> => {
      await visibleVehicle(tx, access, id)
      const p = access.permissions
      const can = { maintenance: p.has('maintenance.read'), damage: p.has('damage.read'), transfers: p.has('transfers.read') }
      const now = new Date().toISOString()
      const holdsNow = await vehicleBusy(tx, access.companyId, id, now, null)
      const blockedNow = holdsNow.filter((h) => h.startsAt <= now)
      const blocked = holdsNow.some((h) => h.kind === 'damage')
      const atRisk: AllocationConflict[] = blocked ? holdsNow.filter((h) => h.kind === 'reservation' || (h.kind === 'rental' && h.startsAt > now)) : []
      const all = { page: 1, pageSize: 100 as const, dir: 'desc' as const, vehicleId: id }
      return {
        holdsNow,
        blockedNow,
        maintenance: can.maintenance ? (await listMaintenance(tx, access, maintenanceSearchSchema.parse({ ...all, view: 'all' }))).items : [],
        damages: can.damage ? (await listDamages(tx, access, damageSearchSchema.parse({ ...all, view: 'all' }))).items : [],
        transfers: can.transfers ? (await listTransfers(tx, access, transferSearchSchema.parse({ ...all, view: 'all' }))).items : [],
        serviceDue: can.maintenance ? await serviceDue(tx, id) : null,
        atRisk,
        access: can,
      }
    })
  })

  /** The vehicle's periodic service interval (a reminder only; it never blocks anything). */
  app.put('/:id/maintenance-schedule', async (req) => {
    const id = parseId(req, VEHICLE_NOT_FOUND)
    return withCompany(req, 'maintenance.manage', async (tx, access) => {
      const input = maintenanceScheduleSchema.parse(req.body)
      const v = await visibleVehicle(tx, access, id)
      const cur = (await tx.execute(sql`select version from maintenance_schedules where vehicle_id = ${id} for update`)).rows[0] as Row | undefined
      if ((cur ? Number(cur.version) : 0) !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bakım aralığı siz çalışırken değiştirildi. Sayfayı yenileyin.')
      const userId = req.auth!.user.id
      if (cur) {
        await tx.execute(sql`update maintenance_schedules set interval_km = ${input.intervalKm ?? null}, interval_months = ${input.intervalMonths ?? null}, version = version + 1, updated_at = now(), updated_by = ${userId} where vehicle_id = ${id}`)
      } else {
        await tx.execute(sql`insert into maintenance_schedules (company_id, vehicle_id, interval_km, interval_months, updated_by) values (${access.companyId}, ${id}, ${input.intervalKm ?? null}, ${input.intervalMonths ?? null}, ${userId})`)
      }
      await audit(tx, { companyId: access.companyId, actorUserId: userId, action: 'maintenance.schedule', entity: 'vehicle', entityId: id, summary: { plate: v.plate, intervalKm: input.intervalKm ?? null, intervalMonths: input.intervalMonths ?? null } })
      return serviceDue(tx, id)
    })
  })
}
