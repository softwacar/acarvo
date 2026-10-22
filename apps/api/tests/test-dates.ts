import { timeZoneOffsetMs } from '@acarvo/shared'

// Date helpers for tests that must give the same answer on any day (decision of the date-test review, docs/ACARVO_API_TARIH_TESTLERI_DUZELTME_RAPORU.md).
// Nothing here reads the system clock: every function takes the day it works from.

/** "2026-10-23" + n days → "2026-10-26". Calendar arithmetic through UTC noon, so no clock change can skip or repeat a day. */
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export interface ClockChange {
  /** The local date on which the clocks change. */
  day: string
  /** spring: an hour is skipped (the day has 23 hours). autumn: an hour is repeated (25 hours). */
  kind: 'spring' | 'autumn'
}

/**
 * The first change of the UTC offset of `timeZone` on or after `fromDay`, found by comparing the offset at two consecutive UTC noons.
 * With `kind`, the first change of that kind. Searches 400 days: every year has both kinds in zones that use summer time.
 */
export function nextClockChange(timeZone: string, fromDay: string, kind?: ClockChange['kind']): ClockChange {
  const offset = (day: string) => timeZoneOffsetMs(Date.parse(`${day}T12:00:00Z`), timeZone)
  for (let i = 0; i < 400; i++) {
    const day = addDays(fromDay, i)
    const before = offset(day)
    const after = offset(addDays(day, 1))
    if (before === after) continue
    // The offset differs between two consecutive noons: the change happened in the night between them, which belongs to the next local date.
    const found: ClockChange = { day: addDays(day, 1), kind: after > before ? 'spring' : 'autumn' }
    if (!kind || found.kind === kind) return found
  }
  throw new Error(`No ${kind ?? 'clock'} change found within 400 days of ${fromDay} in ${timeZone}`)
}

/** True when the local wall-clock interval [fromLocal, toLocal] (both "YYYY-MM-DDTHH:mm") spans a clock change of the zone. */
export function spansClockChange(timeZone: string, fromDay: string, toDay: string): boolean {
  const offset = (day: string) => timeZoneOffsetMs(Date.parse(`${day}T12:00:00Z`), timeZone)
  return offset(fromDay) !== offset(toDay)
}
