// ---------------------------------------------------------------------------
// Time zones (docs/TEKNIK_UYGULAMA.md §9.1).
//
// Two kinds of time exist in ACARVO and are never mixed:
//  * instants (odometer and location events, audit, sessions): stored as timestamptz, sent as ISO 8601 UTC,
//    entered and shown as wall-clock time in the company's time zone;
//  * calendar dates (document validity, acquisition date): stored as `date`, sent as YYYY-MM-DD, never converted.

/** A calendar date without time, e.g. a document's last valid day. */
export const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const partsFormatters = new Map<string, Intl.DateTimeFormat>()
function partsIn(ms: number, timeZone: string) {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    partsFormatters.set(timeZone, f)
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), s: Number(p.second) }
}

/** Offset of a time zone from UTC at an instant, in milliseconds (e.g. +2 h in Sarajevo in summer). */
export function timeZoneOffsetMs(ms: number, timeZone: string) {
  const whole = Math.floor(ms / 1000) * 1000
  const p = partsIn(whole, timeZone)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - whole
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Wall-clock time (YYYY-MM-DDTHH:mm, the value of an <input type="datetime-local">) of an instant in a time zone. */
export function utcToWallTime(instant: string | number | Date, timeZone: string) {
  const p = partsIn(new Date(instant).getTime(), timeZone)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}

export interface WallTimeResult {
  /** ISO 8601 UTC instant. */
  iso: string
  /**
   * 'gap': the wall time does not exist (clocks jumped forward); the instant just after the jump is used.
   * 'ambiguous': the wall time occurs twice (clocks went back); the first occurrence is used.
   */
  note: 'gap' | 'ambiguous' | null
}

/**
 * Instant of a wall-clock time in a time zone, independent of the computer's own time zone.
 * Daylight saving changes are handled explicitly (see WallTimeResult.note). Null for malformed input.
 */
export function wallTimeToUtc(local: string, timeZone: string): WallTimeResult | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  if (new Date(guess).getUTCDate() !== d) return null
  const offsets = [...new Set([-1, 0, 1].map((k) => timeZoneOffsetMs(guess + k * 86_400_000, timeZone)))]
  const matches = offsets
    .map((o) => guess - o)
    .filter((t) => utcToWallTime(t, timeZone) === local)
    .sort((a, b) => a - b)
  if (matches.length) return { iso: new Date(matches[0]!).toISOString(), note: matches.length > 1 ? 'ambiguous' : null }
  // Spring-forward gap: read the time with the offset that applied before the jump, landing just after it.
  return { iso: new Date(guess - timeZoneOffsetMs(guess - 86_400_000, timeZone)).toISOString(), note: 'gap' }
}

/** Formats a calendar date (YYYY-MM-DD) as DD.MM.YYYY without any time zone conversion. */
export const formatDateOnly = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
