import { B } from '../../i18n'
import { L } from '../../i18n'
import { dayOf, DAY } from '../time'
import type { Cur, Customer, Db, Id, Iso, Money } from '../types'

// Typed policy evaluators (spec §69, §84.2, §50). Hard policies live in Settings; screens only read these results.

export const DOC_LABEL: Record<string, string> = {
  get national_id() {
    return L('Kimlik kartı', 'ID card')
  },
  get passport() {
    return L('Pasaport', 'Passport')
  },
  get driving_license() {
    return L('Sürücü belgesi', 'Driving licence')
  },
  get insurance() {
    return L('Sigorta poliçesi', 'Insurance policy')
  },
  get registration() {
    return L('Ruhsat', 'Vehicle registration')
  },
  get inspection() {
    return L('Muayene', 'Inspection')
  },
  get contract() {
    return L('Sözleşme', 'Contract')
  },
}

export type DocState = 'valid' | 'expiring' | 'expired' | 'missing'
export interface DocCheck {
  kind: string
  state: DocState
  validUntil?: string
  documentId?: Id
}

export function customerDocChecks(db: Db, c: Customer, now: Iso, until?: Iso): DocCheck[] {
  const need = c.residency === 'foreign' ? db.settings.docs.requireForForeign : db.settings.docs.requireForLocal
  const today = dayOf(now, db.settings.company.tz)
  const warn = db.settings.docs.warnDays
  return need.map((kind) => {
    const docs = db.documents.filter((d) => d.ownerType === 'customer' && d.ownerId === c.id && d.kind === kind).sort((a, b) => b.version - a.version)
    const doc = docs[0]
    if (!doc) return { kind, state: 'missing' as const }
    if (!doc.validUntil) return { kind, state: 'valid' as const, documentId: doc.id }
    const endMs = Date.parse(`${doc.validUntil}T23:59:59Z`)
    const state: DocState = endMs < Date.parse(`${today}T00:00:00Z`) ? 'expired' : until && endMs < Date.parse(until) ? 'expired' : endMs - Date.parse(now) < warn * DAY ? 'expiring' : 'valid'
    return { kind, state, validUntil: doc.validUntil, documentId: doc.id }
  })
}

export interface Eligibility {
  /** Driver rules (age, licence years, licence validity) and documents both fine. */
  ok: boolean
  /** Driver rules only (age, licence years, licence validity). */
  eligible: boolean
  youngDriver: boolean
  age: number
  licenseYears: number
  reasons: string[]
  docReasons: string[]
}

export function evaluateDriverEligibility(db: Db, c: Customer, pickupAt: Iso, returnAt: Iso): Eligibility {
  const p = db.settings.driver
  const pick = new Date(pickupAt)
  const dob = new Date(`${c.dob}T00:00:00Z`)
  let age = pick.getUTCFullYear() - dob.getUTCFullYear()
  if (pick.getUTCMonth() < dob.getUTCMonth() || (pick.getUTCMonth() === dob.getUTCMonth() && pick.getUTCDate() < dob.getUTCDate())) age--
  const licenseYears = pick.getUTCFullYear() - c.license.issuedYear
  const reasons: string[] = []
  if (age < p.minAge) reasons.push(L(`Sürücü yaşı ${age}; en az ${p.minAge} olmalı.`, `The driver's age is ${age}; it must be at least ${p.minAge}.`))
  if (licenseYears < p.minLicenseYears) reasons.push(L(`Ehliyet ${licenseYears} yıllık; en az ${p.minLicenseYears} yıl gerekli.`, `The licence is ${licenseYears} year(s) old; at least ${p.minLicenseYears} year(s) are required.`))
  if (Date.parse(`${c.license.validUntil}T23:59:59Z`) < Date.parse(returnAt)) reasons.push(L(`Sürücü belgesi ${c.license.validUntil} tarihinde bitiyor; kiralama süresini kapsamıyor.`, `The driving licence expires on ${c.license.validUntil}; it does not cover the rental period.`))
  const docReasons = customerDocChecks(db, c, pickupAt, returnAt)
    .filter((x) => x.state === 'missing' || x.state === 'expired')
    .map((x) => `${DOC_LABEL[x.kind] ?? x.kind}: ${x.state === 'missing' ? 'eksik' : L('süresi dolmuş veya kiralama bitmeden dolacak', 'expired or will expire before the rental ends')}.`)
  return { ok: reasons.length === 0 && docReasons.length === 0, eligible: reasons.length === 0, youngDriver: age >= p.minAge && age <= p.youngDriverMaxAge, age, licenseYears, reasons, docReasons }
}

export interface DepositRequirement {
  ok: boolean
  required: Money
  message?: string
}

/** Deposit = class policy row in the transaction currency + the coverage package's deposit effect. No FX. */
export function evaluateDepositPolicy(db: Db, classId: Id, insuranceId: Id | undefined, cur: Cur): DepositRequirement {
  const row = db.settings.deposit.byClass[classId]?.[cur]
  if (row === undefined) return { ok: false, required: { minor: 0, cur }, message: L(`Bu sınıf için ${cur} depozito satırı tanımlı değil (Ayarlar → Depozito).`, `No ${cur} deposit row is defined for this class (Settings → Deposit).`) }
  const pkg = insuranceId ? db.insurance.find((p) => p.id === insuranceId) : undefined
  const effect = pkg?.depositEffect[cur] ?? 0
  return { ok: true, required: { minor: Math.max(0, row + effect), cur } }
}

// --------------------------------------------------------------------------- cancellation / no-show fee (company policy)

export interface PolicyFee {
  kind: 'free' | 'late' | 'no_show'
  /** Fee in the reservation currency (minor units). */
  feeMinor: number
  cur: string
  hoursBefore: number
  /** The rule that applied, in words (shown next to the amount). */
  rule: string
}

/**
 * The cancellation fee of a reservation, computed from the company policy. Staff cannot type another amount: a deviation is
 * a Financial Correction that an independent authorizer approves. A cancellation at least `freeHoursBefore` hours before pickup is free.
 */
export function cancellationFee(d: Db, r: { currency: string; pickupAt: string; price: { grossMinor: number; days: number } | null }, at: string, kind: 'cancel' | 'no_show'): PolicyFee {
  const pol = d.settings.cancellation
  const hoursBefore = Math.floor((Date.parse(r.pickupAt) - Date.parse(at)) / 3_600_000)
  const gross = r.price?.grossMinor ?? 0
  const days = Math.max(1, r.price?.days ?? 1)
  const rule = kind === 'no_show' ? pol.noShowFee : pol.lateFee
  if (kind === 'cancel' && hoursBefore >= pol.freeHoursBefore)
    return { kind: 'free', feeMinor: 0, cur: r.currency, hoursBefore, rule: B(`Teslime ${pol.freeHoursBefore} saatten fazla var: ücretsiz iptal.`, `More than ${pol.freeHoursBefore} hours before pickup: free cancellation.`) }
  const feeMinor = rule.kind === 'percent_of_total' ? Math.round((gross * rule.value) / 100) : rule.kind === 'first_day' ? Math.round(gross / days) : (rule.fixed[r.currency] ?? 0)
  const ruleText = rule.kind === 'percent_of_total' ? B(`Toplamın %${rule.value}'i`, `${rule.value}% of the total`) : rule.kind === 'first_day' ? B('Bir günlük bedel', 'One day of the rental') : B('Sabit bedel', 'Fixed fee')
  return { kind: kind === 'no_show' ? 'no_show' : 'late', feeMinor, cur: r.currency, hoursBefore, rule: kind === 'no_show' ? B(`Gelmedi: ${ruleText}`, `No-show: ${ruleText}`) : B(`Teslime ${Math.max(0, hoursBefore)} saat kala iptal (ücretsiz süre ${pol.freeHoursBefore} saat): ${ruleText}`, `Cancelled ${Math.max(0, hoursBefore)} h before pickup (free period ${pol.freeHoursBefore} h): ${ruleText}`) }
}
