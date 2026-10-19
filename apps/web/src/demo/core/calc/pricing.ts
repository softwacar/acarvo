import { B } from '../../i18n'
import { roundHalf } from '../money'
import { addDaysYmd, dayOf, diffDaysYmd, HOUR, MIN } from '../time'
import type { Cur, Db, Id, Iso, PriceLine, PriceSnapshot, Settings, TaxLine } from '../types'

// One pricing pipeline (spec §59CR): base rate → season → length tier → corporate agreement → approved discount →
// extras → coverage → drivers → tax. Insurance, extras and fees use explicit price rows per transaction currency:
// pricing never converts between currencies. A missing row blocks the calculation instead of guessing.

/** Number of rental days under the company's day method (spec §68). Returns at least `minDays`. */
export function calculateRentalDuration(from: Iso, to: Iso, tz: string, duration: Settings['duration']): number {
  const ms = Date.parse(to) - Date.parse(from)
  if (ms <= 0) return 0
  if (duration.dayMethod === 'calendar_day') {
    const diff = diffDaysYmd(dayOf(from, tz), dayOf(to, tz))
    // Calendar-day method: the date difference in the pickup zone, at least one day (same-day return = 1).
    return Math.max(duration.minDays, Math.max(1, diff))
  }
  const graceMs = duration.graceMinutes * MIN
  return Math.max(duration.minDays, Math.ceil(Math.max(0, ms - graceMs) / (24 * HOUR)) || 1)
}

export interface QuoteInput {
  classId: Id
  from: Iso
  to: Iso
  pickupBranchId: Id
  returnBranchId: Id
  currency: Cur
  extras: { extraId: Id; qty: number }[]
  insuranceId?: Id
  corporateId?: Id
  additionalDrivers?: number
  youngDriver?: boolean
  /** Percentage granted through a formal High Discount approval that has been applied. */
  approvedDiscountPct?: number
}

const lineTotal = (qty: number, unit: number) => qty * unit

export function priceQuote(db: Db, input: QuoteInput, now: Iso, snapshotId: Id): PriceSnapshot {
  const s = db.settings
  const blockers: string[] = []
  const pickupBranch = db.branches.find((b) => b.id === input.pickupBranchId)
  const tz = pickupBranch?.tz ?? s.company.tz
  const days = calculateRentalDuration(input.from, input.to, tz, s.duration)
  const lines: PriceLine[] = []
  const cur = input.currency

  if (days <= 0) blockers.push(B('İade zamanı teslim zamanından sonra olmalı.', 'The return time must be after the pickup time.'))

  const agreement = input.corporateId ? db.agreements.find((a) => a.id === db.corporates.find((c) => c.id === input.corporateId)?.agreementId && a.active) : undefined
  const agreementActive = agreement && agreement.validFrom <= dayOf(input.from, tz) && dayOf(input.from, tz) <= agreement.validTo
  const corpRate = agreementActive ? agreement!.classOverrides.find((o) => o.classId === input.classId && o.cur === cur) : undefined
  const baseRow = db.baseRates.find((r) => r.classId === input.classId && r.cur === cur)
  const daily = corpRate?.dailyMinor ?? baseRow?.dailyMinor
  const cls = db.classes.find((c) => c.id === input.classId)

  if (daily === undefined) {
    blockers.push(B(`${cls?.name ?? B('Sınıf', 'Class')} için ${cur} fiyat satırı tanımlı değil. Fiyatlandırma'da ${cur} satırı ekleyin (fiyatlarda kur dönüşümü yapılmaz).`, `No ${cur} price row is defined for ${cls?.name ?? B('Sınıf', 'Class')}. Add a ${cur} row in Pricing (prices are never converted between currencies).`))
  } else if (days > 0) {
    lines.push({ kind: 'base', label: B(`${cls?.name ?? B('Sınıf', 'Class')} · günlük baz tarife${corpRate ? B(' (kurumsal anlaşma)', ' (corporate agreement)') : ''}`, `${cls?.name ?? B('Sınıf', 'Class')} · daily base rate${corpRate ? B(' (kurumsal anlaşma)', ' (corporate agreement)') : ''}`), qty: days, unitMinor: daily, totalMinor: lineTotal(days, daily) })
    // Season uplift: days of the rental that fall in an active season.
    let seasonSum = 0
    let seasonDays = 0
    const seasonNames = new Set<string>()
    const startYmd = dayOf(input.from, tz)
    for (let i = 0; i < days; i++) {
      const ymd = addDaysYmd(startYmd, i)
      const season = db.seasons.find((x) => x.active && x.from <= ymd && ymd <= x.to)
      if (season) {
        seasonSum += roundHalf((daily * season.uplift) / 100)
        seasonDays++
        seasonNames.add(season.name)
      }
    }
    if (seasonSum > 0) lines.push({ kind: 'season', label: B(`Sezon farkı · ${[...seasonNames].join(', ')}`, `Season difference · ${[...seasonNames].join(', ')}`), qty: seasonDays, unitMinor: roundHalf(seasonSum / seasonDays), totalMinor: seasonSum })
    // One length tier for the whole rental.
    const sub = lines.reduce((a, l) => a + l.totalMinor, 0)
    const tier = [...s.tiers].sort((a, b) => b.fromDays - a.fromDays).find((t) => days >= t.fromDays)
    if (tier && tier.discountPct > 0) lines.push({ kind: 'tier', label: B(`Süre kademesi (${tier.fromDays}+ gün) %${tier.discountPct}`, `Length tier (${tier.fromDays}+ days) ${tier.discountPct}%`), qty: 1, unitMinor: -roundHalf((sub * tier.discountPct) / 100), totalMinor: -roundHalf((sub * tier.discountPct) / 100) })
    if (agreementActive && agreement!.discountPct > 0) {
      const base2 = lines.reduce((a, l) => a + l.totalMinor, 0)
      const d = roundHalf((base2 * agreement!.discountPct) / 100)
      lines.push({ kind: 'corporate', label: B(`Kurumsal anlaşma · ${agreement!.name} %${agreement!.discountPct}`, `Corporate agreement · ${agreement!.name} ${agreement!.discountPct}%`), qty: 1, unitMinor: -d, totalMinor: -d })
    }
    if (input.approvedDiscountPct && input.approvedDiscountPct > 0) {
      const base3 = lines.reduce((a, l) => a + l.totalMinor, 0)
      const d = roundHalf((base3 * input.approvedDiscountPct) / 100)
      lines.push({ kind: 'discount', label: B(`Onaylı indirim %${input.approvedDiscountPct} (Onay Merkezi)`, `Approved discount ${input.approvedDiscountPct}% (Approval Center)`), qty: 1, unitMinor: -d, totalMinor: -d })
    }
  }

  for (const ex of input.extras) {
    const def = db.extras.find((e) => e.id === ex.extraId)
    if (!def || ex.qty <= 0) continue
    const price = def.prices[cur]
    if (price === undefined) {
      blockers.push(B(`"${def.name}" için ${cur} fiyat satırı yok.`, `There is no ${cur} price row for "${def.name}".`))
      continue
    }
    const qty = def.kind === 'per_day' ? days * ex.qty : ex.qty
    lines.push({ kind: 'extra', label: def.name + (def.kind === 'per_day' ? B(' · günlük', ' · per day') : ''), qty, unitMinor: price, totalMinor: lineTotal(qty, price) })
  }
  if (input.insuranceId) {
    const pkg = db.insurance.find((p) => p.id === input.insuranceId)
    const price = pkg?.dailyPrice[cur]
    if (!pkg) blockers.push(B('Sigorta paketi bulunamadı.', 'Cover package not found.'))
    else if (price === undefined) blockers.push(B(`"${pkg.name}" için ${cur} günlük fiyat satırı yok (sigorta fiyatı kur ile hesaplanmaz).`, `There is no ${cur} daily price row for "${pkg.name}" (cover prices are not computed by exchange rate).`))
    else if (days > 0) lines.push({ kind: 'insurance', label: B(`${pkg.name} (${pkg.code}) · günlük`, `${pkg.name} (${pkg.code}) · per day`), qty: days, unitMinor: price, totalMinor: lineTotal(days, price) })
  }
  const addl = input.additionalDrivers ?? 0
  if (addl > 0 && days > 0) {
    const p = s.driver.additionalDriverDaily[cur]
    if (p === undefined) blockers.push(B(`Ek sürücü ücreti için ${cur} satırı yok.`, `There is no ${cur} row for the additional driver fee.`))
    else lines.push({ kind: 'driver', label: B('Ek sürücü · günlük', 'Additional driver · per day'), qty: days * addl, unitMinor: p, totalMinor: lineTotal(days * addl, p) })
  }
  if (input.youngDriver) {
    const p = s.driver.youngDriverFee[cur]
    if (p === undefined) blockers.push(B(`Genç sürücü ücreti için ${cur} satırı yok.`, `There is no ${cur} row for the young-driver fee.`))
    else lines.push({ kind: 'young_driver', label: B('Genç sürücü ücreti', 'Young-driver fee'), qty: 1, unitMinor: p, totalMinor: p })
  }
  if (input.pickupBranchId !== input.returnBranchId) {
    const p = s.duration.oneWayFee[cur]
    if (p === undefined) blockers.push(B(`Tek yön ücreti için ${cur} satırı yok.`, `There is no ${cur} row for the one-way fee.`))
    else if (p > 0) lines.push({ kind: 'oneway', label: B('Farklı şubede iade (tek yön) ücreti', 'Different-branch return (one-way) fee'), qty: 1, unitMinor: p, totalMinor: p })
  }

  const subtotal = lines.reduce((a, l) => a + l.totalMinor, 0)
  const rule = db.taxRules.find((t) => t.id === s.defaultTaxId && t.active)
  const taxLines: TaxLine[] = []
  let netMinor = subtotal
  let taxMinor = 0
  let grossMinor = subtotal
  if (rule) {
    if (rule.mode === 'inclusive') {
      taxMinor = roundHalf((subtotal * rule.ratePct) / (100 + rule.ratePct))
      netMinor = subtotal - taxMinor
      grossMinor = subtotal
    } else {
      taxMinor = roundHalf((subtotal * rule.ratePct) / 100)
      netMinor = subtotal
      grossMinor = subtotal + taxMinor
    }
    taxLines.push({ ruleId: rule.id, name: rule.name, ratePct: rule.ratePct, mode: rule.mode, baseMinor: netMinor, taxMinor })
  }
  const revision = db.priceRevisions[db.priceRevisions.length - 1]
  return { id: snapshotId, cur, days, lines, netMinor, taxLines, taxMinor, grossMinor, revisionId: revision?.id ?? 'rev-0', computedAt: now, blockers }
}
