import { locale } from '../i18n'

export const MIN = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function dtf(tz: string, opts: Intl.DateTimeFormatOptions, key: string) {
  const k = `${locale()}|${tz}|${key}`
  let f = fmtCache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat(locale(), { timeZone: tz, ...opts })
    fmtCache.set(k, f)
  }
  return f
}

const partsFmt = new Map<string, Intl.DateTimeFormat>()
/** Wall-clock parts of an instant in a zone. */
export function parts(iso: string | number, tz: string) {
  let f = partsFmt.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    partsFmt.set(tz, f)
  }
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { y: +p.year!, mo: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, s: +p.second! }
}
const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" of an instant in a zone. */
export function dayOf(iso: string | number, tz: string): string {
  const p = parts(iso, tz)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`
}
export function tzOffsetMs(at: number, tz: string): number {
  const p = parts(at, tz)
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(at / 1000) * 1000
}
/** Local wall time ("YYYY-MM-DD", "HH:mm") in a zone → instant (ISO). */
export function zonedIso(ymd: string, hm: string, tz: string): string {
  const [y, mo, d] = ymd.split('-').map(Number) as [number, number, number]
  const [h, mi] = hm.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0)
  let t = guess - tzOffsetMs(guess, tz)
  t = guess - tzOffsetMs(t, tz)
  return new Date(t).toISOString()
}
export const startOfDay = (ymd: string, tz: string) => zonedIso(ymd, '00:00', tz)
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}
export function diffDaysYmd(a: string, b: string): number {
  const f = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number]
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((f(b) - f(a)) / DAY)
}
/** Monday-based weekday 0..6 of a "YYYY-MM-DD". */
export function weekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}
export const startOfWeekYmd = (ymd: string) => addDaysYmd(ymd, -weekday(ymd))
export const monthStartYmd = (ymd: string) => `${ymd.slice(0, 7)}-01`
export function monthEndYmd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number) as [number, number]
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}
export function addMonthsYmd(ymd: string, n: number): string {
  const [y, m] = ymd.split('-').map(Number) as [number, number]
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`
}

export const fmtDate = (iso: string | number, tz: string) => dtf(tz, { day: '2-digit', month: '2-digit', year: 'numeric' }, 'd').format(new Date(iso))
export const fmtDayShort = (iso: string | number, tz: string) => dtf(tz, { day: 'numeric', month: 'short' }, 'ds').format(new Date(iso))
export const fmtTime = (iso: string | number, tz: string) => dtf(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 't').format(new Date(iso))
export const fmtDateTime = (iso: string | number, tz: string) => `${fmtDate(iso, tz)} ${fmtTime(iso, tz)}`
export const fmtWeekday = (iso: string | number, tz: string) => dtf(tz, { weekday: 'short', day: 'numeric', month: 'short' }, 'wd').format(new Date(iso))
export const fmtLong = (iso: string | number, tz: string) => dtf(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, 'long').format(new Date(iso))
export const fmtMonthOf = (ymd: string, tz: string) => dtf(tz, { month: 'long', year: 'numeric' }, 'm').format(new Date(zonedIso(ymd, '12:00', tz)))
export const fmtWeekdayShort = (ymd: string, tz: string) => dtf(tz, { weekday: 'short' }, 'w').format(new Date(zonedIso(ymd, '12:00', tz)))
export const fmtYmd = (ymd: string, tz: string) => fmtDate(zonedIso(ymd, '12:00', tz), tz)

/** "YYYY-MM-DDTHH:mm" for an <input type="datetime-local"> showing the zone's wall time. */
export function toLocalInput(iso: string, tz: string): string {
  const p = parts(iso, tz)
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`
}
export function fromLocalInput(v: string, tz: string): string {
  const [d, t] = v.split('T') as [string, string]
  return zonedIso(d, t, tz)
}

export function durationText(ms: number, tr: boolean): string {
  const m = Math.round(Math.abs(ms) / MIN)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const mm = m % 60
  const out = [d && (tr ? `${d} gün` : `${d} d`), h && (tr ? `${h} sa` : `${h} h`), !d && mm && (tr ? `${mm} dk` : `${mm} min`)].filter(Boolean)
  return out.join(' ') || (tr ? '1 dk' : '1 min')
}
