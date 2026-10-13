import { divRound } from './money'
import { utcToWallTime } from './time'

// ---------------------------------------------------------------------------
// The single pricing calculator (spec §59CR, §66, §68). Pure: the same input and the same rule revision always give
// the same result. Integers in minor units, computed with BigInt; every rounding is to the minor unit, half away
// from zero, once per line. No currency conversion. Used by the API only; screens show the API's result.

export const PRICING_ENGINE_VERSION = 'pe-1'

export type DayMethod = 'rolling_24h' | 'calendar_day'
export type TaxMode = 'not_configured' | 'exclusive' | 'inclusive'

export interface EngineRate {
  id: string
  vehicleClassId: string
  /** Per-day prices of the length tiers (F3): 1–6 days, 7–29 days, 30+ days. Missing higher tiers fall back. */
  rate1to6: number
  rate7to29: number | null
  rate30plus: number | null
}
export interface EngineSeason {
  id: string
  name: string
  /** Company calendar dates, inclusive. */
  startDate: string
  endDate: string
  vehicleClassId: string | null
  /** Basis points; 2000 = +20 %, -1500 = −15 %. */
  percentBp: number
  priority: number
  active: boolean
}
export interface EngineExtra {
  id: string
  code: string
  name: string
  kind: 'standard' | 'additional_driver'
  mode: 'per_day' | 'per_rental'
  priceMinor: number
  maxQuantity: number
  taxable: boolean
  active: boolean
}
export interface EngineDiscount {
  id: string
  name: string
  type: 'percent' | 'fixed'
  /** Basis points for percent, minor units for fixed. */
  value: number
  minDays: number
  active: boolean
}
export interface EngineInput {
  priceList: { id: string; name: string; revision: number; currency: string; dayMethod: DayMethod; graceMinutes: number; minDays: number }
  tax: { mode: TaxMode; rateBp: number | null; label: string | null }
  vehicleClassId: string
  pickupAt: string
  returnAt: string
  /** Time zone of the pickup branch: calendar days and season dates are counted there. */
  pickupTimeZone: string
  rates: EngineRate[]
  seasons: EngineSeason[]
  extras: EngineExtra[]
  discounts: EngineDiscount[]
  selectedExtras: { extraId: string; quantity: number }[]
  additionalDrivers: number
  discountId: string | null
}

export type QuoteLineKind = 'base' | 'season' | 'extra' | 'additional_driver' | 'discount' | 'tax'
export interface QuoteLine {
  kind: QuoteLineKind
  label: string
  /** Units (days, pieces, drivers) and the unit price when the line is a simple product. */
  quantity: number | null
  unitMinor: number | null
  amountMinor: number
  taxable: boolean
  /** Source records and the price-list revision (snapshot provenance). */
  source: { type: string; id: string | null; revision?: number; percentBp?: number; dates?: string[] }
}

export type EngineProblem =
  | { code: 'class_not_priced' }
  | { code: 'season_conflict'; date: string; seasons: string[] }
  | { code: 'extra_unknown'; extraId: string }
  | { code: 'extra_quantity'; extraId: string; max: number }
  | { code: 'discount_unknown' }
  | { code: 'discount_min_days'; minDays: number }
  | { code: 'period_invalid' }

export interface EngineResult {
  ok: boolean
  problems: EngineProblem[]
  currency: string
  days: number
  tier: '1-6' | '7-29' | '30+'
  dayMethod: DayMethod
  /** Minutes between pickup and return (from the instants: DST-safe). */
  minutes: number
  lines: QuoteLine[]
  baseMinor: number
  extrasMinor: number
  discountMinor: number
  /** Amount before tax when tax is exclusive; amount with tax removed when inclusive; the plain sum when not configured. */
  netMinor: number
  taxMinor: number | null
  grossMinor: number | null
  taxStatus: 'complete' | 'not_configured'
  /** What the price does not include in V1 (spec pipeline steps not built yet). */
  notApplied: ('corporate_agreement' | 'one_way' | 'mileage' | 'insurance_package')[]
  engineVersion: string
}

const dateOf = (iso: string, tz: string) => utcToWallTime(iso, tz).slice(0, 10)
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
const pct = (bp: number) => `${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp) / 100}`.replace('.', ',') + ' %'

/**
 * Billable days (§68, F1): 24-hour blocks after the grace period, or the calendar-date difference in the pickup branch's
 * zone (same local date = 1 day; 10 Oct 23:00 → 11 Oct 01:00 = 1 day; touched dates are not each charged).
 */
export function billableDays(input: Pick<EngineInput, 'pickupAt' | 'returnAt' | 'pickupTimeZone'> & { dayMethod: DayMethod; graceMinutes: number; minDays: number }) {
  const minutes = Math.round((Date.parse(input.returnAt) - Date.parse(input.pickupAt)) / 60_000)
  let days: number
  if (input.dayMethod === 'rolling_24h') days = Math.ceil(Math.max(0, minutes - input.graceMinutes) / 1440)
  else days = Math.max(1, daysBetween(dateOf(input.pickupAt, input.pickupTimeZone), dateOf(input.returnAt, input.pickupTimeZone)))
  return { minutes, days: Math.max(input.minDays, days, 1) }
}

export function calculateQuote(input: EngineInput): EngineResult {
  const problems: EngineProblem[] = []
  const pl = input.priceList
  const { minutes, days } = billableDays({ ...input, dayMethod: pl.dayMethod, graceMinutes: pl.graceMinutes, minDays: pl.minDays })
  const tier: EngineResult['tier'] = days >= 30 ? '30+' : days >= 7 ? '7-29' : '1-6'
  const result = (lines: QuoteLine[], parts: Pick<EngineResult, 'baseMinor' | 'extrasMinor' | 'discountMinor' | 'netMinor' | 'taxMinor' | 'grossMinor'>): EngineResult => ({
    ok: problems.length === 0,
    problems,
    currency: pl.currency,
    days,
    tier,
    dayMethod: pl.dayMethod,
    minutes,
    lines,
    ...parts,
    taxStatus: input.tax.mode === 'not_configured' || input.tax.rateBp == null ? 'not_configured' : 'complete',
    notApplied: ['corporate_agreement', 'one_way', 'mileage', 'insurance_package'],
    engineVersion: PRICING_ENGINE_VERSION,
  })
  const empty = { baseMinor: 0, extrasMinor: 0, discountMinor: 0, netMinor: 0, taxMinor: null, grossMinor: null }
  if (!(minutes > 0)) {
    problems.push({ code: 'period_invalid' })
    return result([], empty)
  }
  const rate = input.rates.find((r) => r.vehicleClassId === input.vehicleClassId)
  if (!rate) {
    problems.push({ code: 'class_not_priced' })
    return result([], empty)
  }
  const unit = tier === '30+' ? (rate.rate30plus ?? rate.rate7to29 ?? rate.rate1to6) : tier === '7-29' ? (rate.rate7to29 ?? rate.rate1to6) : rate.rate1to6
  // The label names the tier whose price was really used (a missing higher tier falls back to a lower one).
  const usedTier = tier === '30+' && rate.rate30plus != null ? '30+ gün' : tier !== '1-6' && rate.rate7to29 != null ? '7–29 gün' : '1–6 gün'

  // 1–2. Base and seasons: each billable day is dated in the pickup branch's calendar; a season changes that day.
  const start = dateOf(input.pickupAt, input.pickupTimeZone)
  const groups = new Map<string, { season: EngineSeason | null; dates: string[] }>()
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    const matching = input.seasons.filter((s) => s.active && s.startDate <= d && d <= s.endDate && (!s.vehicleClassId || s.vehicleClassId === input.vehicleClassId))
    const top = matching.length ? Math.max(...matching.map((s) => s.priority)) : null
    const winners = matching.filter((s) => s.priority === top)
    if (winners.length > 1) {
      problems.push({ code: 'season_conflict', date: d, seasons: winners.map((s) => s.name) })
      continue
    }
    const season = winners[0] ?? null
    const key = season?.id ?? 'base'
    const g = groups.get(key) ?? { season, dates: [] }
    g.dates.push(d)
    groups.set(key, g)
  }
  if (problems.length) return result([], empty)
  const lines: QuoteLine[] = []
  lines.push({
    kind: 'base',
    label: `Kiralama · ${usedTier} kademesi · ${days} gün`,
    quantity: days,
    unitMinor: unit,
    amountMinor: unit * days,
    taxable: true,
    source: { type: 'price_list_rate', id: rate.id, revision: pl.revision },
  })
  let base = BigInt(unit) * BigInt(days)
  for (const g of groups.values()) {
    if (!g.season || g.season.percentBp === 0) continue
    const amount = divRound(BigInt(unit) * BigInt(g.dates.length) * BigInt(g.season.percentBp), 10_000n)
    base += amount
    lines.push({
      kind: 'season',
      label: `${g.season.name} · ${pct(g.season.percentBp)} · ${g.dates.length} gün`,
      quantity: g.dates.length,
      unitMinor: null,
      amountMinor: Number(amount),
      taxable: true,
      source: { type: 'price_list_season', id: g.season.id, revision: pl.revision, percentBp: g.season.percentBp, dates: [g.dates[0]!, g.dates.at(-1)!] },
    })
  }

  // 3. Extras (and the additional-driver fee, one unit per additional driver).
  let extras = 0n
  const chosen = [...input.selectedExtras.filter((s) => s.quantity > 0)]
  for (const x of input.extras.filter((e) => e.active && e.kind === 'additional_driver')) {
    if (input.additionalDrivers > 0 && !chosen.some((c) => c.extraId === x.id)) chosen.push({ extraId: x.id, quantity: input.additionalDrivers })
  }
  for (const c of chosen) {
    const x = input.extras.find((e) => e.id === c.extraId && e.active)
    if (!x) {
      problems.push({ code: 'extra_unknown', extraId: c.extraId })
      continue
    }
    if (!Number.isInteger(c.quantity) || c.quantity < 1 || c.quantity > x.maxQuantity) {
      problems.push({ code: 'extra_quantity', extraId: x.id, max: x.maxQuantity })
      continue
    }
    const perUnit = x.mode === 'per_day' ? BigInt(x.priceMinor) * BigInt(days) : BigInt(x.priceMinor)
    const amount = perUnit * BigInt(c.quantity)
    extras += amount
    lines.push({
      kind: x.kind === 'additional_driver' ? 'additional_driver' : 'extra',
      label: `${x.name}${x.mode === 'per_day' ? ` · ${days} gün` : ' · kiralama başına'}${c.quantity > 1 ? ` × ${c.quantity}` : ''}`,
      quantity: c.quantity,
      unitMinor: Number(perUnit),
      amountMinor: Number(amount),
      taxable: x.taxable,
      source: { type: 'price_list_extra', id: x.id, revision: pl.revision },
    })
  }

  // 4. Discount on the rental (base + seasons) only, never below zero; at most one (F4).
  let discount = 0n
  if (input.discountId) {
    const d = input.discounts.find((x) => x.id === input.discountId && x.active)
    if (!d) problems.push({ code: 'discount_unknown' })
    else if (days < d.minDays) problems.push({ code: 'discount_min_days', minDays: d.minDays })
    else {
      discount = d.type === 'percent' ? divRound(base * BigInt(d.value), 10_000n) : BigInt(d.value)
      if (discount > base) discount = base
      lines.push({
        kind: 'discount',
        label: d.type === 'percent' ? `${d.name} · ${pct(-d.value)}` : d.name,
        quantity: null,
        unitMinor: null,
        amountMinor: -Number(discount),
        taxable: true,
        source: { type: 'price_list_discount', id: d.id, revision: pl.revision },
      })
    }
  }
  if (problems.length) return result([], empty)

  // 5. Tax (§66): only with an explicit configuration; never a guessed rate (F2).
  const total = base + extras - discount
  const taxableSum = base - discount + lines.filter((l) => (l.kind === 'extra' || l.kind === 'additional_driver') && l.taxable).reduce((s, l) => s + BigInt(l.amountMinor), 0n)
  let tax: bigint | null = null
  let net = total
  let gross: bigint | null = null
  if (input.tax.mode !== 'not_configured' && input.tax.rateBp != null) {
    const r = BigInt(input.tax.rateBp)
    if (input.tax.mode === 'exclusive') {
      tax = divRound(taxableSum * r, 10_000n)
      gross = total + tax
    } else {
      tax = divRound(taxableSum * r, 10_000n + r)
      net = total - tax
      gross = total
    }
    lines.push({
      kind: 'tax',
      label: `${input.tax.label ?? 'Vergi'} · %${(input.tax.rateBp / 100).toString().replace('.', ',')} · ${input.tax.mode === 'exclusive' ? 'fiyatlara eklenir' : 'fiyatların içinde'}`,
      quantity: null,
      unitMinor: null,
      amountMinor: Number(tax),
      taxable: false,
      source: { type: 'price_list_tax', id: pl.id, revision: pl.revision, percentBp: input.tax.rateBp },
    })
  }
  return result(lines, { baseMinor: Number(base), extrasMinor: Number(extras), discountMinor: Number(discount), netMinor: Number(net), taxMinor: tax == null ? null : Number(tax), grossMinor: gross == null ? null : Number(gross) })
}
