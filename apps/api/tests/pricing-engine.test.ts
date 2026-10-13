import { billableDays, calculateQuote, currencyExponent, divRound, type EngineInput, formatMoney, minorToDecimal, parseAmount, wallTimeInstant } from '@acarvo/shared'
import { describe, expect, it } from 'vitest'

// The pricing calculator on its own (no database): money, rounding, days, tiers, seasons, extras, discounts, tax.

const TZ = 'Europe/Sarajevo'
const at = (local: string, tz = TZ) => wallTimeInstant(local, tz, 'earlier')!
function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    priceList: { id: 'pl', name: 'Standart', revision: 3, currency: 'EUR', dayMethod: 'rolling_24h', graceMinutes: 0, minDays: 1 },
    tax: { mode: 'not_configured', rateBp: null, label: null },
    vehicleClassId: 'c1',
    pickupAt: at('2026-11-02T10:00'),
    returnAt: at('2026-11-05T10:00'),
    pickupTimeZone: TZ,
    rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 4500, rate7to29: 4000, rate30plus: 3000 }],
    seasons: [],
    extras: [],
    discounts: [],
    selectedExtras: [],
    additionalDrivers: 0,
    discountId: null,
    ...over,
  }
}

describe('money', () => {
  it('uses ISO minor units, parses decimals exactly and shows the ISO code', () => {
    expect([currencyExponent('EUR'), currencyExponent('BAM'), currencyExponent('JPY'), currencyExponent('KWD')]).toEqual([2, 2, 0, 3])
    expect(parseAmount('19.99', 'EUR')).toBe(1999)
    expect(parseAmount('0,1', 'EUR')).toBe(10)
    expect(parseAmount('19.999', 'EUR')).toBeNull()
    expect(parseAmount('1500', 'JPY')).toBe(1500)
    expect(parseAmount('1500.5', 'JPY')).toBeNull()
    expect(parseAmount('2.125', 'KWD')).toBe(2125)
    expect(parseAmount('-5', 'EUR')).toBeNull()
    expect(minorToDecimal(1999, 'EUR')).toBe('19.99')
    expect(minorToDecimal(5, 'KWD')).toBe('0.005')
    expect(formatMoney(123456, 'EUR')).toBe('1.234,56 EUR')
    expect(formatMoney(1500, 'JPY')).toBe('1.500 JPY')
    // 0.1 + 0.2 never happens: integers only.
    expect(parseAmount('0.1', 'EUR')! + parseAmount('0.2', 'EUR')!).toBe(30)
  })
  it('rounds half away from zero', () => {
    expect([divRound(5n, 2n), divRound(-5n, 2n), divRound(4n, 3n), divRound(-4n, 3n), divRound(149n, 100n), divRound(150n, 100n)]).toEqual([3n, -3n, 1n, -1n, 1n, 2n])
  })
})

describe('days (F1)', () => {
  it('24-hour blocks: a started block counts, grace forgives a short overrun, minimum days apply', () => {
    const b = (from: string, to: string, grace = 0, min = 1) => billableDays({ pickupAt: at(from), returnAt: at(to), pickupTimeZone: TZ, dayMethod: 'rolling_24h', graceMinutes: grace, minDays: min }).days
    expect(b('2026-11-02T10:00', '2026-11-04T10:00')).toBe(2)
    expect(b('2026-11-02T10:00', '2026-11-04T10:01')).toBe(3)
    expect(b('2026-11-02T10:00', '2026-11-04T10:59', 59)).toBe(2)
    expect(b('2026-11-02T10:00', '2026-11-04T11:00', 59)).toBe(3)
    expect(b('2026-11-02T10:00', '2026-11-02T13:00')).toBe(1)
    expect(b('2026-11-02T10:00', '2026-11-02T13:00', 0, 3)).toBe(3)
  })
  it('calendar days in the pickup branch zone: midnight, month end, year end', () => {
    const c = (from: string, to: string) => billableDays({ pickupAt: at(from), returnAt: at(to), pickupTimeZone: TZ, dayMethod: 'calendar_day', graceMinutes: 0, minDays: 1 }).days
    expect(c('2026-11-02T23:30', '2026-11-03T00:30')).toBe(1)
    expect(c('2026-11-02T10:00', '2026-11-02T18:00')).toBe(1)
    expect(c('2026-11-02T10:00', '2026-11-04T09:00')).toBe(2)
    expect(c('2026-10-30T10:00', '2026-11-02T10:00')).toBe(3)
    expect(c('2026-12-30T10:00', '2027-01-02T10:00')).toBe(3)
  })
  it('DST: a 23-hour or 25-hour calendar day is one day; 24-hour blocks follow real elapsed time', () => {
    // Clocks go back on 25.10.2026 in Sarajevo: 10:00 → next day 10:00 is 25 hours.
    const r = billableDays({ pickupAt: at('2026-10-24T10:00'), returnAt: at('2026-10-25T10:00'), pickupTimeZone: TZ, dayMethod: 'rolling_24h', graceMinutes: 0, minDays: 1 })
    expect(r).toEqual({ minutes: 1500, days: 2 })
    expect(billableDays({ pickupAt: at('2026-10-24T10:00'), returnAt: at('2026-10-25T10:00'), pickupTimeZone: TZ, dayMethod: 'calendar_day', graceMinutes: 0, minDays: 1 }).days).toBe(1)
    // Spring forward 28.03.2027: 23 hours is one 24-hour block.
    expect(billableDays({ pickupAt: at('2027-03-27T10:00'), returnAt: at('2027-03-28T10:00'), pickupTimeZone: TZ, dayMethod: 'rolling_24h', graceMinutes: 0, minDays: 1 }).days).toBe(1)
  })
})

describe('calculation', () => {
  it('uses the tier of the whole length; missing higher tiers fall back; same input gives the same result', () => {
    const q = calculateQuote(input())
    expect(q).toMatchObject({ ok: true, days: 3, tier: '1-6', baseMinor: 13_500, netMinor: 13_500, taxMinor: null, grossMinor: null, taxStatus: 'not_configured' })
    expect(q.lines[0]).toMatchObject({ kind: 'base', quantity: 3, unitMinor: 4500, amountMinor: 13_500, source: { id: 'r1', revision: 3 } })
    expect(calculateQuote(input({ returnAt: at('2026-11-11T10:00') })).baseMinor).toBe(9 * 4000)
    expect(calculateQuote(input({ returnAt: at('2026-12-07T10:00') })).baseMinor).toBe(35 * 3000)
    const noTiers = input({ rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 4500, rate7to29: null, rate30plus: null }], returnAt: at('2026-12-07T10:00') })
    expect(calculateQuote(noTiers).lines[0]!.label).toContain('1–6 gün')
    expect(JSON.stringify(calculateQuote(input()))).toBe(JSON.stringify(calculateQuote(input())))
    expect(calculateQuote(input({ vehicleClassId: 'other' }))).toMatchObject({ ok: false, problems: [{ code: 'class_not_priced' }] })
  })
  it('seasons change only the days inside them; the higher priority wins; equal priority overlap stops the quote', () => {
    const high = { id: 's1', name: 'Yüksek sezon', startDate: '2026-11-03', endDate: '2026-11-30', vehicleClassId: null, percentBp: 2000, priority: 1, active: true }
    const q = calculateQuote(input({ seasons: [high] }))
    // 02.11 base, 03.11 and 04.11 in season: 2 × 45,00 × 20 % = 18,00.
    expect(q.lines.find((l) => l.kind === 'season')).toMatchObject({ quantity: 2, amountMinor: 1800, source: { dates: ['2026-11-03', '2026-11-04'] } })
    expect(q.baseMinor).toBe(13_500 + 1800)
    const holiday = { ...high, id: 's2', name: 'Bayram', startDate: '2026-11-04', endDate: '2026-11-04', percentBp: 5000, priority: 5 }
    const both = calculateQuote(input({ seasons: [high, holiday] }))
    expect(both.lines.filter((l) => l.kind === 'season').map((l) => [l.label.split(' ·')[0], l.quantity])).toEqual([
      ['Yüksek sezon', 1],
      ['Bayram', 1],
    ])
    const clash = calculateQuote(input({ seasons: [high, { ...holiday, priority: 1 }] }))
    expect(clash).toMatchObject({ ok: false, problems: [{ code: 'season_conflict', date: '2026-11-04' }] })
    // A class-specific season does not touch other classes.
    expect(calculateQuote(input({ seasons: [{ ...high, vehicleClassId: 'c2' }] })).baseMinor).toBe(13_500)
  })
  it('extras per day or per rental, the additional-driver fee per additional driver, limits enforced', () => {
    const extras = [
      { id: 'e1', code: 'GPS', name: 'Navigasyon', kind: 'standard' as const, mode: 'per_day' as const, priceMinor: 500, maxQuantity: 1, taxable: true, active: true },
      { id: 'e2', code: 'SEAT', name: 'Çocuk koltuğu', kind: 'standard' as const, mode: 'per_rental' as const, priceMinor: 2000, maxQuantity: 2, taxable: false, active: true },
      { id: 'e3', code: 'DRV', name: 'Ek sürücü', kind: 'additional_driver' as const, mode: 'per_day' as const, priceMinor: 300, maxQuantity: 5, taxable: true, active: true },
    ]
    const q = calculateQuote(input({ extras, selectedExtras: [{ extraId: 'e1', quantity: 1 }, { extraId: 'e2', quantity: 2 }], additionalDrivers: 2 }))
    expect(q.lines.filter((l) => l.kind !== 'base').map((l) => [l.kind, l.amountMinor])).toEqual([
      ['extra', 1500],
      ['extra', 4000],
      ['additional_driver', 1800],
    ])
    expect(q.extrasMinor).toBe(7300)
    expect(calculateQuote(input({ extras, selectedExtras: [{ extraId: 'e1', quantity: 2 }] }))).toMatchObject({ ok: false, problems: [{ code: 'extra_quantity' }] })
    expect(calculateQuote(input({ extras, selectedExtras: [{ extraId: 'nope', quantity: 1 }] }))).toMatchObject({ ok: false })
  })
  it('one discount on the rental only, never below zero, with its minimum length', () => {
    const discounts = [
      { id: 'd1', name: 'Uzun kiralama', type: 'percent' as const, value: 1000, minDays: 3, active: true },
      { id: 'd2', name: 'Sabit', type: 'fixed' as const, value: 99_999, minDays: 1, active: true },
    ]
    expect(calculateQuote(input({ discounts, discountId: 'd1' }))).toMatchObject({ discountMinor: 1350, netMinor: 12_150 })
    expect(calculateQuote(input({ discounts, discountId: 'd2' }))).toMatchObject({ discountMinor: 13_500, netMinor: 0 })
    expect(calculateQuote(input({ discounts, discountId: 'd1', returnAt: at('2026-11-03T10:00') }))).toMatchObject({ ok: false, problems: [{ code: 'discount_min_days', minDays: 3 }] })
  })
  it('tax only when configured; exclusive and inclusive follow the spec example (§66.2); untaxed extras stay out', () => {
    const one = { rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 10_000, rate7to29: null, rate30plus: null }], returnAt: at('2026-11-03T10:00') }
    expect(calculateQuote(input({ ...one, tax: { mode: 'exclusive', rateBp: 2000, label: 'PDV' } }))).toMatchObject({ netMinor: 10_000, taxMinor: 2000, grossMinor: 12_000, taxStatus: 'complete' })
    const incl = calculateQuote(input({ ...one, rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 12_000, rate7to29: null, rate30plus: null }], tax: { mode: 'inclusive', rateBp: 2000, label: 'PDV' } }))
    expect(incl).toMatchObject({ netMinor: 10_000, taxMinor: 2000, grossMinor: 12_000 })
    const untaxed = [{ id: 'e2', code: 'SEAT', name: 'Koltuk', kind: 'standard' as const, mode: 'per_rental' as const, priceMinor: 1000, maxQuantity: 1, taxable: false, active: true }]
    const mixed = calculateQuote(input({ ...one, extras: untaxed, selectedExtras: [{ extraId: 'e2', quantity: 1 }], tax: { mode: 'exclusive', rateBp: 1700, label: 'PDV' } }))
    expect(mixed).toMatchObject({ netMinor: 11_000, taxMinor: 1700, grossMinor: 12_700 })
    // Rounding to the minor unit, half away from zero: 333 × 17 % = 56.61 → 57.
    expect(calculateQuote(input({ ...one, rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 333, rate7to29: null, rate30plus: null }], tax: { mode: 'exclusive', rateBp: 1700, label: 'PDV' } })).taxMinor).toBe(57)
    // Not configured: no tax and no gross, never a guessed rate.
    expect(calculateQuote(input(one))).toMatchObject({ taxMinor: null, grossMinor: null, taxStatus: 'not_configured' })
    expect(calculateQuote(input(one)).lines.some((l) => l.kind === 'tax')).toBe(false)
  })
  it('works in currencies without or with three minor digits; never converts', () => {
    const jpy = calculateQuote(input({ priceList: { ...input().priceList, currency: 'JPY' }, rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 7000, rate7to29: null, rate30plus: null }], tax: { mode: 'exclusive', rateBp: 1000, label: 'Tax' } }))
    expect(jpy).toMatchObject({ currency: 'JPY', netMinor: 21_000, taxMinor: 2100, grossMinor: 23_100 })
    const kwd = calculateQuote(input({ priceList: { ...input().priceList, currency: 'KWD' }, rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: 12_345, rate7to29: null, rate30plus: null }] }))
    expect(kwd).toMatchObject({ currency: 'KWD', netMinor: 37_035 })
    expect(kwd.notApplied).toEqual(['corporate_agreement', 'one_way', 'mileage', 'insurance_package'])
  })
})

describe('integration review: approved decisions F1–F4 and rounding', () => {
  const days = (from: string, to: string, dayMethod: 'rolling_24h' | 'calendar_day', tz = TZ) =>
    billableDays({ pickupAt: at(from, tz), returnAt: at(to, tz), pickupTimeZone: tz, dayMethod, graceMinutes: 0, minDays: 1 }).days

  it('F1 calendar day: same local day = 1 day, otherwise the date difference; touched days are not each charged', () => {
    expect(days('2026-10-10T23:00', '2026-10-11T01:00', 'calendar_day')).toBe(1)
    expect(days('2026-10-10T08:00', '2026-10-10T20:00', 'calendar_day')).toBe(1)
    // Mon 10:00 → Wed 22:00 touches three dates but is a two-day difference.
    expect(days('2026-11-02T10:00', '2026-11-04T22:00', 'calendar_day')).toBe(2)
    // The night clocks go back (25.10.2026) and spring forward (28.03.2027): still one calendar day.
    expect(days('2026-10-24T23:00', '2026-10-25T01:00', 'calendar_day')).toBe(1)
    expect(days('2027-03-27T23:00', '2027-03-28T04:00', 'calendar_day')).toBe(1)
  })

  it('F1: calendar days are counted in the pickup branch zone, not the browser or server zone', () => {
    // 22:30 UTC on 10 Oct → 11 Oct 00:30 in Sarajevo (UTC+2) but 01:30 in Istanbul (UTC+3); return 12 Oct 21:30 UTC.
    const q = (tz: string) => billableDays({ pickupAt: '2026-10-10T22:30:00.000Z', returnAt: '2026-10-12T21:30:00.000Z', pickupTimeZone: tz, dayMethod: 'calendar_day', graceMinutes: 0, minDays: 1 }).days
    expect(q('Europe/Sarajevo')).toBe(1)
    expect(q('Europe/Istanbul')).toBe(2)
    expect(q('America/New_York')).toBe(2)
  })

  it('F3 tier boundaries 6/7 and 29/30 with both day methods; one tier for the whole rental, never mixed', () => {
    for (const method of ['rolling_24h', 'calendar_day'] as const) {
      const priceList = { id: 'pl', name: 'S', revision: 1, currency: 'EUR', dayMethod: method, graceMinutes: 0, minDays: 1 }
      const q = (to: string) => calculateQuote(input({ priceList, returnAt: at(to) }))
      expect(q('2026-11-08T10:00')).toMatchObject({ days: 6, tier: '1-6', baseMinor: 6 * 4500 })
      expect(q('2026-11-09T10:00')).toMatchObject({ days: 7, tier: '7-29', baseMinor: 7 * 4000 })
      expect(q('2026-11-10T10:00')).toMatchObject({ days: 8, tier: '7-29', baseMinor: 8 * 4000 })
      expect(q('2026-12-01T10:00')).toMatchObject({ days: 29, tier: '7-29', baseMinor: 29 * 4000 })
      expect(q('2026-12-02T10:00')).toMatchObject({ days: 30, tier: '30+', baseMinor: 30 * 3000 })
      expect(q('2026-11-10T10:00').lines.filter((l) => l.kind === 'base')).toHaveLength(1)
    }
    // A started 24-hour block crosses the boundary: 6 days + 1 minute is 7 days, tier 7–29.
    expect(calculateQuote(input({ returnAt: at('2026-11-08T10:01') }))).toMatchObject({ days: 7, tier: '7-29' })
  })

  it('season start and end days are inclusive; a season outside the period changes nothing', () => {
    const s = (startDate: string, endDate: string) => ({ id: 's', name: 'S', startDate, endDate, vehicleClassId: null, percentBp: 1000, priority: 0, active: true })
    // Days of the rental: 02, 03, 04 Nov.
    expect(calculateQuote(input({ seasons: [s('2026-11-04', '2026-11-10')] })).lines.find((l) => l.kind === 'season')?.quantity).toBe(1)
    expect(calculateQuote(input({ seasons: [s('2026-10-01', '2026-11-02')] })).lines.find((l) => l.kind === 'season')?.quantity).toBe(1)
    expect(calculateQuote(input({ seasons: [s('2026-11-05', '2026-11-30')] })).lines.some((l) => l.kind === 'season')).toBe(false)
  })

  it('F4: only one discount exists per quote; it applies to the rental only and can never make a price negative', () => {
    const extra = { id: 'x', code: 'GPS', name: 'GPS', kind: 'standard' as const, mode: 'per_rental' as const, priceMinor: 1000, maxQuantity: 1, taxable: true, active: true }
    const huge = { id: 'd', name: 'Sabit', type: 'fixed' as const, value: 1_000_000, minDays: 1, active: true }
    const q = calculateQuote(input({ extras: [extra], selectedExtras: [{ extraId: 'x', quantity: 1 }], discounts: [huge], discountId: 'd' }))
    expect(q).toMatchObject({ ok: true, baseMinor: 13_500, discountMinor: 13_500, extrasMinor: 1000, netMinor: 1000 })
    expect(q.lines.filter((l) => l.kind === 'discount')).toHaveLength(1)
    const full = { id: 'p', name: 'Yüzde 100', type: 'percent' as const, value: 10_000, minDays: 1, active: true }
    const low = { id: 'low', name: 'Kampanya', startDate: '2026-11-01', endDate: '2026-11-30', vehicleClassId: null, percentBp: -9000, priority: 0, active: true }
    const z = calculateQuote(input({ seasons: [low], discounts: [full], discountId: 'p', tax: { mode: 'exclusive', rateBp: 1700, label: 'PDV' } }))
    expect(z).toMatchObject({ ok: true, netMinor: 0, taxMinor: 0, grossMinor: 0 })
    expect(z.baseMinor + z.extrasMinor - z.discountMinor).toBe(0)
    // The engine input carries a single discount id: stacking is impossible by construction.
    expect(Object.keys(input()).filter((k) => /discount/i.test(k))).toEqual(['discounts', 'discountId'])
  })

  it('rounding: once per line, half away from zero, in the currency minor unit; tax exclusive vs inclusive', () => {
    const one = (rate: number, mode: 'exclusive' | 'inclusive', currency = 'EUR') =>
      calculateQuote(
        input({
          priceList: { id: 'pl', name: 'S', revision: 1, currency, dayMethod: 'rolling_24h', graceMinutes: 0, minDays: 1 },
          returnAt: at('2026-11-03T10:00'),
          rates: [{ id: 'r1', vehicleClassId: 'c1', rate1to6: rate, rate7to29: null, rate30plus: null }],
          tax: { mode, rateBp: 1700, label: 'PDV' },
        }),
      )
    // 0,50 × 17 % = 0,085 → 0,09 (half away from zero); gross 0,59.
    expect(one(50, 'exclusive')).toMatchObject({ netMinor: 50, taxMinor: 9, grossMinor: 59 })
    // Inclusive 1,17: tax = 1,17 × 17 / 117 = 0,17; net 1,00.
    expect(one(117, 'inclusive')).toMatchObject({ netMinor: 100, taxMinor: 17, grossMinor: 117 })
    // JPY has no minor digits: 1001 × 17 % = 170,17 → 170.
    expect(one(1001, 'exclusive', 'JPY')).toMatchObject({ currency: 'JPY', taxMinor: 170, grossMinor: 1171 })
    // KWD has three: 1,005 × 17 % = 0,17085 → 0,171.
    expect(one(1005, 'exclusive', 'KWD')).toMatchObject({ currency: 'KWD', taxMinor: 171, grossMinor: 1176 })
    expect(formatMoney(1176, 'KWD')).toBe('1,176 KWD')
  })

  it('missing tax: net only, gross and tax stay unknown (never guessed from country or currency)', () => {
    for (const currency of ['BAM', 'TRY', 'EUR']) {
      const q = calculateQuote(input({ priceList: { id: 'pl', name: 'S', revision: 1, currency, dayMethod: 'rolling_24h', graceMinutes: 0, minDays: 1 } }))
      expect(q).toMatchObject({ taxStatus: 'not_configured', taxMinor: null, grossMinor: null, netMinor: 13_500 })
      expect(q.lines.some((l) => l.kind === 'tax')).toBe(false)
    }
  })
})
