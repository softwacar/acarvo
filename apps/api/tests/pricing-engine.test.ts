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
