import { resolveWallTime } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { Tx } from '../db/client'
import { AppError } from './errors'

// Branch wall times (docs/TEKNIK_UYGULAMA.md §8.5, K8): one rule for rentals, maintenance and transfers.

export interface BranchRow {
  id: string
  name: string
  code: string
  timezone: string
  status: string
  country: string | null
}

export async function branchRow(tx: Tx, id: string): Promise<BranchRow | null> {
  return ((await tx.execute(sql`select id, name, code, timezone, status, country from branches where id = ${id}`)).rows[0] as unknown as BranchRow | undefined) ?? null
}

const invalid = (fields: Record<string, string>, message = 'Bazı alanlar geçersiz.') => new AppError(400, 'VALIDATION', message, fields)
/** YYYY-MM-DDTHH:mm as DD.MM.YYYY HH:mm. */
export const shownLocal = (local: string) => `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11)}`

/** A wall time in a branch's zone: a skipped time is refused, a doubled time needs a choice (same rule as reservations). */
export function resolveLocal(local: string, b: Pick<BranchRow, 'name' | 'timezone'>, choice: 'earlier' | 'later' | undefined, field: string, choiceField: string): string {
  const r = resolveWallTime(local, b.timezone)
  if (!r) throw invalid({ [field]: 'Geçerli bir tarih ve saat girin' })
  if (r.kind === 'nonexistent') throw invalid({ [field]: `${shownLocal(local)} ${b.name} saatinde (${b.timezone}) yaşanmadı: yaz saatine geçişte saatler ileri alındı. Gerçek saati girin.` })
  if (r.kind === 'ambiguous') {
    if (!choice) {
      throw new AppError(400, 'AMBIGUOUS_TIME', `${shownLocal(local)} ${b.name} saatinde (${b.timezone}) iki kez yaşandı. Hangisi olduğunu seçin.`, { [choiceField]: 'Saatin hangisi olduğunu seçin' }, {
        field,
        earlier: r.earlier,
        later: r.later,
      })
    }
    return r[choice].iso
  }
  return r.iso
}

/** K8: a real time is never in the future and at most `hours` back. Empty = now. */
export function actualTime(local: string | undefined, b: Pick<BranchRow, 'name' | 'timezone'>, choice: 'earlier' | 'later' | undefined, field: string, choiceField: string, hours: number) {
  if (!local) return new Date().toISOString()
  const at = resolveLocal(local, b, choice, field, choiceField)
  if (Date.parse(at) > Date.now() + 2 * 60_000) throw invalid({ [field]: 'Gerçekleşen zaman gelecekte olamaz' })
  if (Date.parse(at) < Date.now() - hours * 3_600_000) throw invalid({ [field]: `En fazla ${hours} saat öncesi girilebilir` })
  return at
}
