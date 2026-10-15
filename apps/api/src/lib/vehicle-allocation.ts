import type { AllocationConflict } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { Tx } from '../db/client'
import { toIso } from './timestamps'

/**
 * One vehicle allocation truth for reservations, rentals, maintenance, damage blocks and transfers
 * (docs/KIRALAMA_TESLIM_IADE_PLANI.md §3.1, docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md §1). The API and the database guards
 * use the same transaction lock and the same `vehicle_busy` function, so no two modules can give different answers
 * about the same vehicle, and concurrent writes for one vehicle are serialized.
 */
export async function lockVehicleAllocation(tx: Tx, companyId: string, vehicleId: string) {
  await tx.execute(sql`select vehicle_allocation_lock(${companyId}::uuid, ${vehicleId}::uuid)`)
}

/** What holds the vehicle in [from, to) (to = null: from `from` on). Numbers and times only, never people. */
export async function vehicleBusy(
  tx: Tx,
  companyId: string,
  vehicleId: string,
  from: string,
  to: string | null,
  except: { reservationId?: string | null; rentalId?: string | null; maintenanceId?: string | null; transferId?: string | null } = {},
): Promise<AllocationConflict[]> {
  const rows = (
    await tx.execute(sql`select kind, ref_no, starts_at, ends_at from vehicle_busy(${companyId}::uuid, ${vehicleId}::uuid, ${from}::timestamptz, ${to}::timestamptz,
      ${except.reservationId ?? null}::uuid, ${except.rentalId ?? null}::uuid, ${except.maintenanceId ?? null}::uuid, ${except.transferId ?? null}::uuid)`)
  ).rows as { kind: AllocationConflict['kind']; ref_no: string; starts_at: unknown; ends_at: unknown }[]
  return rows.map((r) => ({ kind: r.kind, refNo: r.ref_no, startsAt: toIso(r.starts_at), endsAt: r.ends_at == null ? null : toIso(r.ends_at) }))
}

/** The rental's current hold, same rule as the database function rental_occupancy (K2: open-ended when overdue). */
export function occupancyEnd(status: string, plannedReturnAt: string, returnedAt: string | null): string | null {
  if (status === 'returned' || status === 'closed') return returnedAt
  if (status === 'delivered') return Date.parse(plannedReturnAt) > Date.now() ? plannedReturnAt : null
  return plannedReturnAt
}
