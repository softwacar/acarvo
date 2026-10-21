import { L } from '../../i18n'
import { exponent, roundHalf } from '../money'
import type { Cur, FxRate, Id, Iso, RateSnapshot } from '../types'

// Business-defined manual exchange rates (spec §63). Never market, central-bank or official rates.
// A rate reads "1 base = rate quote". Converting a tender currency T into the obligation currency O:
//   - a rate base=T, quote=O is used directly: applied = tender × rate;
//   - a rate base=O, quote=T is used only when it allows an automatic inverse: applied = tender ÷ rate.
// Priority: branch rate over company rate. Two valid rates of the same scope for the same pair are a
// configuration error: nothing is picked at random.

export type RateResolution =
  | { ok: true; rate: FxRate; direction: 'direct' | 'inverse' }
  | { ok: false; code: 'AWAITING_RATE' | 'RATE_CONFLICT'; message: string }

const active = (r: FxRate, at: number) => Date.parse(r.validFrom) <= at && (r.validUntil === null || at < Date.parse(r.validUntil))

export function isRateActive(r: FxRate, at: Iso): boolean {
  return active(r, Date.parse(at))
}

export function resolveRateSnapshot(rates: FxRate[], opts: { tender: Cur; obligation: Cur; purpose: FxRate['purpose']; branchId: Id; at: Iso }): RateResolution {
  const at = Date.parse(opts.at)
  const usable = rates.filter((r) => r.purpose === opts.purpose && active(r, at))
  const candidates: { rate: FxRate; direction: 'direct' | 'inverse' }[] = []
  for (const r of usable) {
    if (r.base === opts.tender && r.quote === opts.obligation) candidates.push({ rate: r, direction: 'direct' })
    else if (r.base === opts.obligation && r.quote === opts.tender && r.autoInverse) candidates.push({ rate: r, direction: 'inverse' })
  }
  for (const scope of [opts.branchId, 'company']) {
    const here = candidates.filter((c) => c.rate.scope === scope)
    // A direct and an inverse candidate of the same scope are two different business rates: refuse to choose.
    if (here.length > 1) {
      return { ok: false, code: 'RATE_CONFLICT', message: L(`${opts.tender}/${opts.obligation} için aynı kapsamda birden fazla geçerli kur var. Ayarlar → Döviz Kurları'nda düzeltin.`, `There is more than one valid rate for ${opts.tender}/${opts.obligation} in the same scope. Correct it in Settings → Exchange Rates.`) }
    }
    if (here.length === 1) return { ok: true, ...here[0]! }
  }
  return { ok: false, code: 'AWAITING_RATE', message: L(`${opts.tender} → ${opts.obligation} için işletme kuru tanımlı değil (Kur Bekleniyor). Ayarlar → Döviz Kurları'ndan tanımlayın.`, `No business rate is defined for ${opts.tender} → ${opts.obligation} (Awaiting Rate). Define it in Settings → Exchange Rates.`) }
}

export type Conversion = { ok: true; appliedMinor: number; snapshot?: RateSnapshot } | { ok: false; code: 'AWAITING_RATE' | 'RATE_CONFLICT'; message: string }

/** Tender amount (minor) in tender currency → equivalent in the obligation currency, with a pinned rate snapshot. */
export function convertTenderToObligation(rates: FxRate[], opts: { tenderMinor: number; tender: Cur; obligation: Cur; purpose?: FxRate['purpose']; branchId: Id; at: Iso }): Conversion {
  if (opts.tender === opts.obligation) return { ok: true, appliedMinor: opts.tenderMinor }
  const res = resolveRateSnapshot(rates, { tender: opts.tender, obligation: opts.obligation, purpose: opts.purpose ?? 'tender', branchId: opts.branchId, at: opts.at })
  if (!res.ok) return res
  const tenderMajor = opts.tenderMinor / 10 ** exponent(opts.tender)
  const exactMajor = res.direction === 'direct' ? tenderMajor * res.rate.rate : tenderMajor / res.rate.rate
  const exactMinor = exactMajor * 10 ** exponent(opts.obligation)
  const appliedMinor = roundHalf(exactMinor)
  return {
    ok: true,
    appliedMinor,
    snapshot: {
      base: res.rate.base,
      quote: res.rate.quote,
      rate: res.rate.rate,
      rateId: res.rate.id,
      direction: res.direction,
      pinnedAt: opts.at,
      // The rounding difference is a concept note (in obligation minor units), not an accounting entry.
      roundingMinor: Math.round((appliedMinor - exactMinor) * 1000) / 1000,
    },
  }
}

/** The tender amount needed to cover an obligation amount (e.g. "pay the rest in BAM"). Rounds up to the next minor unit. */
export function tenderForObligation(rates: FxRate[], opts: { obligationMinor: number; tender: Cur; obligation: Cur; branchId: Id; at: Iso }): { ok: true; tenderMinor: number } | { ok: false; message: string } {
  if (opts.tender === opts.obligation) return { ok: true, tenderMinor: opts.obligationMinor }
  const res = resolveRateSnapshot(rates, { tender: opts.tender, obligation: opts.obligation, purpose: 'tender', branchId: opts.branchId, at: opts.at })
  if (!res.ok) return res
  const obligationMajor = opts.obligationMinor / 10 ** exponent(opts.obligation)
  const tenderMajor = res.direction === 'direct' ? obligationMajor / res.rate.rate : obligationMajor * res.rate.rate
  return { ok: true, tenderMinor: Math.ceil(tenderMajor * 10 ** exponent(opts.tender) - 1e-9) }
}

export function describeRate(r: FxRate): string {
  return `1 ${r.base} = ${r.rate.toLocaleString('en', { maximumFractionDigits: 6 })} ${r.quote}`
}
