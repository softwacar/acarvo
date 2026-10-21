import { billableDays, calculateQuote, currencyExponent, divRound, formatMoney, minorToDecimal, parseAmount as sharedParseAmount, type EngineInput } from '@acarvo/shared'
import { describe, expect, it } from 'vitest'
import { calculateRentalDuration, demoOnlyPriceParts, priceQuote } from '../core/calc/pricing'
import { fmt, parseAmount as demoParseAmount, roundHalf, toInput, exponent } from '../core/money'
import { buildSeed } from '../core/seed'
import type { Db, Settings } from '../core/types'

// Golden vectors (decision document K-18): the same inputs go through the demo's own calculators and the shared package that the real
// application uses. The demo core stays separate (the browser is not the authority); these tests show where the two agree, so the
// demo can be trusted as a preview of the numbers, and pin down — by name — every place where they deliberately differ.
// Nothing here moves server safety into the browser: money mutations, locks, tenant isolation and approvals stay on the server.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))

describe('money: amounts parse and print the same where both accept them', () => {
  const common: [string, string, number | null][] = [
    ['1234.50', 'EUR', 123450],
    ['1234,50', 'EUR', 123450],
    ['0.5', 'EUR', 50],
    ['12', 'EUR', 1200],
    ['0,05', 'EUR', 5],
    ['500', 'JPY', 500],
    ['1.234', 'KWD', 1234],
    ['abc', 'EUR', null],
    ['', 'EUR', null],
    ['1.2345', 'EUR', null],
    ['-5', 'EUR', null],
  ]
  for (const [text, cur, want] of common)
    it(`"${text}" ${cur} → ${want}`, () => {
      expect(demoParseAmount(text, cur)).toBe(want)
      expect(sharedParseAmount(text, cur)).toBe(want)
    })
  it('ALIGNED: thousands separators are refused in both, so a demo form teaches the rule of the real form', () => {
    for (const t of ['1.234,50', '1,234.50', '1.234.567']) {
      expect(demoParseAmount(t, 'EUR'), t).toBeNull()
      expect(sharedParseAmount(t, 'EUR'), t).toBeNull()
    }
  })
  it('minor units and exponents agree for the currencies the demo lists', () => {
    for (const c of ['EUR', 'USD', 'BAM', 'GBP', 'CHF', 'TRY', 'RSD', 'JPY', 'KWD']) expect(exponent(c), c).toBe(currencyExponent(c))
    expect(toInput(123450, 'EUR').replace(',', '.')).toBe(minorToDecimal(123450, 'EUR'))
    expect(toInput(500, 'JPY')).toBe(minorToDecimal(500, 'JPY'))
    expect(toInput(1234, 'KWD').replace(',', '.')).toBe(minorToDecimal(1234, 'KWD'))
  })
  it('display agrees, negative amounts included (a true minus sign, the ISO code always shown)', () => {
    for (const [m, cur] of [[123450, 'EUR'], [5, 'EUR'], [-123450, 'EUR'], [-5, 'BAM'], [0, 'USD'], [1234, 'KWD'], [500, 'JPY']] as const)
      expect(fmt(m, cur), `${m} ${cur}`).toBe(formatMoney(m, cur, 'tr-TR'))
  })
  it('rounding is half away from zero in both', () => {
    for (const [a, b] of [[5, 2], [-5, 2], [7, 2], [-7, 2], [1, 3], [2, 3]] as const) expect(roundHalf(a / b), `${a}/${b}`).toBe(Number(divRound(BigInt(a), BigInt(b))))
  })
})

describe('time: billable days agree on both day methods, including DST changes', () => {
  const tz = 'Europe/Sarajevo'
  const cases: [string, string, string][] = [
    ['same day, one hour', '2026-10-19T08:00:00Z', '2026-10-19T09:00:00Z'],
    ['23:00 → 01:00 next day', '2026-10-19T21:00:00Z', '2026-10-19T23:00:00Z'],
    ['exactly 24 h', '2026-10-19T08:00:00Z', '2026-10-20T08:00:00Z'],
    ['24 h + 30 min (inside the grace)', '2026-10-19T08:00:00Z', '2026-10-20T08:30:00Z'],
    ['24 h + 61 min (past the grace)', '2026-10-19T08:00:00Z', '2026-10-20T09:01:00Z'],
    ['three days', '2026-10-19T08:00:00Z', '2026-10-22T08:00:00Z'],
    ['across the autumn clock change (25 October)', '2026-10-24T08:00:00Z', '2026-10-26T08:00:00Z'],
    ['across the spring clock change (29 March)', '2026-03-28T08:00:00Z', '2026-03-30T08:00:00Z'],
  ]
  for (const [method, shared] of [['calendar_day', 'calendar_day'], ['hours_24', 'rolling_24h']] as const)
    for (const [label, from, to] of cases)
      it(`${method}: ${label}`, () => {
        const duration: Settings['duration'] = { dayMethod: method, graceMinutes: 59, minDays: 1, lateFeePerHourPct: 0, oneWayFee: {}, fuelFeePerQuarter: {}, kmPerDay: 0, kmOverageFee: {} }
        const demo = calculateRentalDuration(from, to, tz, duration)
        const real = billableDays({ pickupAt: from, returnAt: to, pickupTimeZone: tz, dayMethod: shared, graceMinutes: 59, minDays: 1 }).days
        expect(demo).toBe(real)
      })
})

describe('pricing: the demo pipeline and the shared engine (pe-1) agree on the common subset', () => {
  /** A demo company stripped to what the shared engine also knows: one daily rate, no season, no tier, one tax rule. */
  const demoQuote = (opts: { days: number; daily: number; tax: { mode: 'inclusive' | 'exclusive'; pct: number } | null; extraDaily?: number; drivers?: number }) => {
    const d = mkDb()
    d.settings.tiers = []
    d.seasons = []
    d.agreements = []
    d.settings.driver.additionalDriverDaily = { EUR: 500 }
    const cls = d.classes[0]!
    const row = d.baseRates.find((r) => r.classId === cls.id && r.cur === 'EUR')!
    row.dailyMinor = opts.daily
    if (opts.tax) {
      const rule = d.taxRules.find((t) => t.id === d.settings.defaultTaxId)!
      rule.mode = opts.tax.mode
      rule.ratePct = opts.tax.pct
      rule.active = true
    } else d.settings.defaultTaxId = 'none'
    d.extras = opts.extraDaily ? [{ id: 'ex-gps', name: 'GPS', kind: 'per_day', prices: { EUR: opts.extraDaily }, active: true }] : []
    const from = '2026-11-02T08:00:00Z'
    const to = new Date(Date.parse(from) + opts.days * 86_400_000).toISOString()
    const q = priceQuote(d, { classId: cls.id, from, to, pickupBranchId: 'b-sjj', returnBranchId: 'b-sjj', currency: 'EUR', extras: opts.extraDaily ? [{ extraId: 'ex-gps', qty: 1 }] : [], additionalDrivers: opts.drivers ?? 0 }, d.clock.now, 'q')
    return { q, from, to, cls: cls.id }
  }
  const sharedQuote = (opts: { days: number; daily: number; tax: { mode: 'inclusive' | 'exclusive'; pct: number } | null; extraDaily?: number; drivers?: number }, from: string, to: string, cls: string) => {
    const extras: EngineInput['extras'] = []
    if (opts.extraDaily) extras.push({ id: 'ex-gps', code: 'GPS', name: 'GPS', kind: 'standard', mode: 'per_day', priceMinor: opts.extraDaily, maxQuantity: 9, taxable: true, active: true })
    if (opts.drivers) extras.push({ id: 'ex-drv', code: 'DRV', name: 'Additional driver', kind: 'additional_driver', mode: 'per_day', priceMinor: 500, maxQuantity: 5, taxable: true, active: true })
    return calculateQuote({
      priceList: { id: 'pl', name: 'Demo', revision: 1, currency: 'EUR', dayMethod: 'calendar_day', graceMinutes: 59, minDays: 1 },
      tax: opts.tax ? { mode: opts.tax.mode, rateBp: Math.round(opts.tax.pct * 100), label: 'VAT' } : { mode: 'not_configured', rateBp: null, label: null },
      vehicleClassId: cls,
      pickupAt: from,
      returnAt: to,
      pickupTimeZone: 'Europe/Sarajevo',
      rates: [{ id: 'r1', vehicleClassId: cls, rate1to6: opts.daily, rate7to29: null, rate30plus: null }],
      seasons: [],
      extras,
      discounts: [],
      selectedExtras: opts.extraDaily ? [{ extraId: 'ex-gps', quantity: 1 }] : [],
      additionalDrivers: opts.drivers ?? 0,
      discountId: null,
    })
  }
  const vectors: { name: string; opts: Parameters<typeof demoQuote>[0] }[] = [
    { name: '3 days at 150.00, no tax', opts: { days: 3, daily: 15000, tax: null } },
    { name: '3 days at 150.00, 17 % tax exclusive', opts: { days: 3, daily: 15000, tax: { mode: 'exclusive', pct: 17 } } },
    { name: '3 days at 150.00, 17 % tax inclusive', opts: { days: 3, daily: 15000, tax: { mode: 'inclusive', pct: 17 } } },
    { name: '5 days at 49.99 with a daily extra 7.50, 20 % exclusive', opts: { days: 5, daily: 4999, extraDaily: 750, tax: { mode: 'exclusive', pct: 20 } } },
    { name: '2 days at 80.00, one additional driver at 5.00 a day, 17 % inclusive', opts: { days: 2, daily: 8000, drivers: 1, tax: { mode: 'inclusive', pct: 17 } } },
  ]
  for (const v of vectors)
    it(v.name, () => {
      const { q, from, to, cls } = demoQuote(v.opts)
      const real = sharedQuote(v.opts, from, to, cls)
      expect(real.ok).toBe(true)
      expect(q.blockers).toEqual([])
      expect(q.days).toBe(real.days)
      expect(q.netMinor).toBe(real.netMinor)
      expect(q.taxMinor).toBe(real.taxMinor ?? 0)
      expect(q.grossMinor).toBe(real.grossMinor ?? real.netMinor)
    })
  it('DIFFERENCES (documented, deliberate): length tiers are a percentage in the demo and per-day tier prices in the real engine; the demo prices insurance, one-way and young-driver fees that the real engine lists as "not applied"', () => {
    const d = mkDb()
    expect(d.settings.tiers.length).toBeGreaterThan(0) // demo: % discount from N days
    const real = sharedQuote({ days: 8, daily: 10000, tax: null }, '2026-11-02T08:00:00Z', '2026-11-10T08:00:00Z', d.classes[0]!.id)
    expect(real.tier).toBe('7-29') // real: its own tier price row, falling back to the 1–6 day price when no row exists
    expect(real.notApplied).toEqual(expect.arrayContaining(['insurance_package', 'one_way', 'corporate_agreement']))
  })
})

describe('demo price parts that the real engine lacks are named (never shown as real)', () => {
  const quote = (days: number, extra: Partial<Parameters<typeof priceQuote>[1]> = {}) => {
    const d = mkDb()
    const cls = d.classes[0]!
    const from = '2026-11-02T08:00:00Z'
    const to = new Date(Date.parse(from) + days * 86_400_000).toISOString()
    return priceQuote(d, { classId: cls.id, from, to, pickupBranchId: 'b-sjj', returnBranchId: 'b-sjj', currency: 'EUR', extras: [], ...extra }, d.clock.now, 'q')
  }
  it('a short plain rental has no demo-only part, so its number is the real number', () => {
    expect(demoOnlyPriceParts(quote(2))).toEqual([])
  })
  it('a long rental carries a percentage tier: named as demo-only', () => {
    expect(demoOnlyPriceParts(quote(10)).map((p) => p.kind)).toContain('tier')
  })
  it('insurance, a different return branch and a young driver are named as demo-only', () => {
    const d = mkDb()
    const ins = d.insurance[0]
    const parts = demoOnlyPriceParts(quote(3, { insuranceId: ins?.id, returnBranchId: 'b-mst', youngDriver: true })).map((p) => p.kind)
    if (ins) expect(parts).toContain('insurance')
    expect(parts).toEqual(expect.arrayContaining(['oneway', 'young_driver']))
  })
})
