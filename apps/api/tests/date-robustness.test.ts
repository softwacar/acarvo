import { billableDays, resolveWallTime, todayIn, wallTimeInstant } from '@acarvo/shared'
import { describe, expect, it } from 'vitest'
import { addDays, nextClockChange, spansClockChange } from './test-dates'

// Date robustness (date-test review): the finance and rental tests place their rentals relative to "today". These checks run without a
// database and without the system clock, over every day of four years, so a test that is only right on some days is caught on any day.

const TZ = 'Europe/Sarajevo'
const FIRST = '2026-01-01'
const DAYS = 4 * 365 + 1 // through 2029-12-31

describe('clock changes of the company zone', () => {
  it('are found on the real European dates', () => {
    const found: [string, string][] = []
    let from = FIRST
    for (let i = 0; i < 8; i++) {
      const c = nextClockChange(TZ, from)
      found.push([c.day, c.kind])
      from = addDays(c.day, 1)
    }
    expect(found).toEqual([
      ['2026-03-29', 'spring'],
      ['2026-10-25', 'autumn'],
      ['2027-03-28', 'spring'],
      ['2027-10-31', 'autumn'],
      ['2028-03-26', 'spring'],
      ['2028-10-29', 'autumn'],
      ['2029-03-25', 'spring'],
      ['2029-10-28', 'autumn'],
    ])
  })

  it('the day found is a day with a skipped hour (spring) or a repeated hour (autumn), for every start day of the year', () => {
    for (let i = 0; i < 366; i++) {
      const from = addDays(FIRST, i)
      const spring = nextClockChange(TZ, from, 'spring')
      expect(resolveWallTime(`${spring.day}T02:30`, TZ), `02:30 on ${spring.day} does not exist`).toMatchObject({ kind: 'nonexistent' })
      const autumn = nextClockChange(TZ, from, 'autumn')
      expect(resolveWallTime(`${autumn.day}T02:30`, TZ), `02:30 on ${autumn.day} happens twice`).toMatchObject({ kind: 'ambiguous' })
      // the "later" 02:30 is one hour after the "earlier" one
      const earlier = Date.parse(wallTimeInstant(`${autumn.day}T02:30`, TZ, 'earlier')!)
      const later = Date.parse(wallTimeInstant(`${autumn.day}T02:30`, TZ, 'later')!)
      expect(later - earlier).toBe(3_600_000)
      expect(wallTimeInstant(`${autumn.day}T02:30`, TZ, 'later')).toBe(`${autumn.day}T01:30:00.000Z`)
    }
  })
})

describe('"day after tomorrow 10:00 to the day after that" on every day of four years', () => {
  const window = (base: string) => ({ from: wallTimeInstant(`${addDays(base, 1)}T10:00`, TZ)!, to: wallTimeInstant(`${addDays(base, 3)}T10:00`, TZ)! })
  const bill = (base: string, dayMethod: 'calendar_day' | 'rolling_24h') => {
    const { from, to } = window(base)
    return billableDays({ pickupAt: from, returnAt: to, pickupTimeZone: TZ, dayMethod, graceMinutes: 0, minDays: 1 }).days
  }

  it('is two calendar days on every date (the premise of the finance tests)', () => {
    for (let i = 0; i < DAYS; i++) expect(bill(addDays(FIRST, i), 'calendar_day'), addDays(FIRST, i)).toBe(2)
  })

  it('with elapsed 24-hour periods it is the elapsed hours rounded up, so it is three days only when the window spans the autumn change', () => {
    const three: string[] = []
    for (let i = 0; i < DAYS; i++) {
      const base = addDays(FIRST, i)
      const { from, to } = window(base)
      const hours = (Date.parse(to) - Date.parse(from)) / 3_600_000
      expect(bill(base, 'rolling_24h'), base).toBe(Math.ceil(hours / 24))
      if (bill(base, 'rolling_24h') === 3) three.push(base)
    }
    // exactly the bases whose window (base+1 .. base+3, 10:00) contains the autumn change night (03:00 on the change day D): D-3 and D-2
    for (const base of three) expect(spansClockChange(TZ, addDays(base, 1), addDays(base, 3)) && nextClockChange(TZ, addDays(base, 1), 'autumn').day <= addDays(base, 3), base).toBe(true)
    expect(three).toEqual(['2026-10-22', '2026-10-23', '2027-10-28', '2027-10-29', '2028-10-26', '2028-10-27', '2029-10-25', '2029-10-26'])
  })

  it('the dates that broke the old finance tests are exactly those: 22 and 23 October 2026 (the tests failed on 22 October)', () => {
    expect(['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'].map((d) => bill(d, 'rolling_24h'))).toEqual([2, 3, 3, 2])
  })
})

describe('day arithmetic over year ends, month ends and leap days', () => {
  it('every day is exactly one after the one before, the whole range', () => {
    let day = FIRST
    for (let i = 1; i < DAYS; i++) {
      const next = addDays(day, 1)
      expect(Date.parse(`${next}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`), `${day} → ${next}`).toBe(86_400_000)
      day = next
    }
    expect(day).toBe('2029-12-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('today in the company zone changes exactly at local midnight, winter and summer, and on clock-change days', () => {
    // winter (UTC+1): local midnight is 23:00 UTC; summer (UTC+2): 22:00 UTC
    expect(todayIn(TZ, new Date('2026-12-31T22:59:59Z'))).toBe('2026-12-31')
    expect(todayIn(TZ, new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01')
    expect(todayIn(TZ, new Date('2027-07-14T21:59:59Z'))).toBe('2027-07-14')
    expect(todayIn(TZ, new Date('2027-07-14T22:00:00Z'))).toBe('2027-07-15')
    // the night of the spring change: midnight is still UTC+1 (23:00 UTC); the autumn night: midnight is still UTC+2 (22:00 UTC)
    expect(todayIn(TZ, new Date('2027-03-27T23:00:00Z'))).toBe('2027-03-28')
    expect(todayIn(TZ, new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25')
    // the server zone does not matter: it is the same instant
    expect(todayIn('UTC', new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31')
  })
})

describe('other zones (the helpers do not assume Europe)', () => {
  it('finds the United States clock changes and none in UTC', () => {
    expect(nextClockChange('America/New_York', '2026-01-01', 'spring').day).toBe('2026-03-08')
    expect(nextClockChange('America/New_York', '2026-03-09', 'autumn').day).toBe('2026-11-01')
    expect(() => nextClockChange('UTC', '2026-01-01')).toThrow(/No clock change/)
  })
  it('the same instant is a different local day in different zones, and day arithmetic stays on the local calendar', () => {
    const at = new Date('2026-10-25T01:30:00Z') // the repeated hour in Sarajevo
    expect(todayIn('Europe/Sarajevo', at)).toBe('2026-10-25')
    expect(todayIn('America/New_York', at)).toBe('2026-10-24')
    expect(todayIn('Asia/Tokyo', at)).toBe('2026-10-25')
  })
})
