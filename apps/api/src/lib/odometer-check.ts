import { largeJump } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { Tx } from '../db/client'
import { AppError } from './errors'
import { toIso } from './timestamps'

type Row = Record<string, unknown>
const kmText = (n: number) => `${n.toLocaleString('tr-TR')} km`

/** Effective odometer readings around a moment (same rule as the database guard). */
export async function odometerAround(tx: Tx, vehicleId: string, at: string) {
  const eff = sql`not exists (select 1 from odometer_corrections c where c.company_id = r.company_id and c.reading_id = r.id)`
  const prev = (await tx.execute(sql`select r.km, r.occurred_at from odometer_readings r where r.vehicle_id = ${vehicleId} and r.occurred_at <= ${at} and ${eff} order by r.km desc limit 1`)).rows[0] as Row | undefined
  const next = (await tx.execute(sql`select r.km, r.occurred_at from odometer_readings r where r.vehicle_id = ${vehicleId} and r.occurred_at > ${at} and ${eff} order by r.km asc limit 1`)).rows[0] as Row | undefined
  return {
    previous: prev ? { km: Number(prev.km), occurredAt: toIso(prev.occurred_at) } : null,
    next: next ? { km: Number(next.km), occurredAt: toIso(next.occurred_at) } : null,
  }
}

/** Friendly answers before an odometer write: the chronology (database guard) and a large jump needs a reason. */
export async function assertOdometer(tx: Tx, vehicleId: string, km: number, at: string, jumpReason: string | undefined) {
  const n = await odometerAround(tx, vehicleId, at)
  if (n.previous && km < n.previous.km) {
    throw new AppError(422, 'ODOMETER_OUT_OF_ORDER', `Kilometre, aracın kayıtlı son değerinden (${kmText(n.previous.km)}) düşük olamaz.`, { km: `En az ${kmText(n.previous.km)}` }, { previous: n.previous })
  }
  if (n.next && km > n.next.km) {
    throw new AppError(422, 'ODOMETER_OUT_OF_ORDER', `Kilometre, daha sonraki bir kayıttan (${kmText(n.next.km)}) yüksek olamaz.`, { km: `En fazla ${kmText(n.next.km)}` }, { next: n.next })
  }
  const jump = largeJump(n.previous, km, at)
  if (jump && !jumpReason) {
    throw new AppError(422, 'LARGE_JUMP_REASON_REQUIRED', `Bu değer bir öncekinden ${kmText(jump.deltaKm)} fazla (günlük ortalama ${kmText(jump.perDay)}). Doğruysa gerekçe girerek onaylayın.`, {
      largeJumpReason: 'Büyük artış için gerekçe girin',
    }, { ...jump, previous: n.previous })
  }
  return jump
}
