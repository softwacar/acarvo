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

/** Which of the two occurrences of a doubled wall time (clocks going back) is meant. */
export const AMBIGUOUS_TIME_CHOICES = ['earlier', 'later'] as const
export type AmbiguousTimeChoice = (typeof AMBIGUOUS_TIME_CHOICES)[number]

export interface WallTimeOption {
  /** ISO 8601 UTC instant. */
  iso: string
  /** Offset from UTC at that instant, in minutes (e.g. 120 for UTC+2). */
  offsetMinutes: number
}

/**
 * What a wall-clock time means in a time zone:
 *  - 'valid': exactly one instant;
 *  - 'nonexistent': the time never happened (clocks jumped forward, e.g. 29.03.2026 02:30 in Sarajevo);
 *  - 'ambiguous': it happened twice (clocks went back, e.g. 25.10.2026 02:30); `earlier` is the first occurrence
 *    (summer time), `later` the second (winter time). The caller must ask which one; nothing is chosen silently.
 */
export type WallTimeResolution =
  | ({ kind: 'valid' } & WallTimeOption)
  | { kind: 'nonexistent' }
  | { kind: 'ambiguous'; earlier: WallTimeOption; later: WallTimeOption }

/**
 * Resolves a wall-clock time (YYYY-MM-DDTHH:mm, the value of an <input type="datetime-local">) in a time zone,
 * independent of the computer's own zone. Null for malformed input. Never shifts or picks a time on its own.
 */
export function resolveWallTime(local: string, timeZone: string): WallTimeResolution | null {
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
  const option = (t: number): WallTimeOption => ({ iso: new Date(t).toISOString(), offsetMinutes: timeZoneOffsetMs(t, timeZone) / 60_000 })
  if (matches.length === 0) return { kind: 'nonexistent' }
  if (matches.length === 1) return { kind: 'valid', ...option(matches[0]!) }
  return { kind: 'ambiguous', earlier: option(matches[0]!), later: option(matches[matches.length - 1]!) }
}

/** The instant for a wall time and (when doubled) an explicit choice; null when nonexistent, malformed or not chosen. */
export function wallTimeInstant(local: string, timeZone: string, choice?: AmbiguousTimeChoice): string | null {
  const r = resolveWallTime(local, timeZone)
  if (!r || r.kind === 'nonexistent') return null
  if (r.kind === 'valid') return r.iso
  return choice ? r[choice].iso : null
}

/** "UTC+2", "UTC+5:30", "UTC−3". */
export function formatUtcOffset(minutes: number) {
  const sign = minutes < 0 ? '−' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const mm = abs % 60
  return `UTC${sign}${h}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`
}

/** Formats a calendar date (YYYY-MM-DD) as DD.MM.YYYY without any time zone conversion. */
export const formatDateOnly = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`

/** DD.MM.YYYY HH:mm of a wall-time input value, for messages. */
const shownWallTime = (local: string) => `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11)}`

/** Same wording in the form (immediately) and from the API (as the final check). */
export const nonexistentTimeMessage = (local: string, timeZone: string) =>
  `${shownWallTime(local)} şirket saatinde (${timeZone}) yaşanmadı: yaz saatine geçişte saatler ileri alındı. Gerçek saati girin.`
export const ambiguousTimeMessage = (local: string, timeZone: string) =>
  `${shownWallTime(local)} şirket saatinde (${timeZone}) iki kez yaşandı: kış saatine geçişte saatler geri alındı. Hangisi olduğunu seçin.`
