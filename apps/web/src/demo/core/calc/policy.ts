import { dayOf, DAY } from '../time'
import type { Cur, Customer, Db, Id, Iso, Money } from '../types'

// Typed policy evaluators (spec §69, §84.2, §50). Hard policies live in Settings; screens only read these results.

export const DOC_LABEL: Record<string, string> = { national_id: 'Kimlik kartı', passport: 'Pasaport', driving_license: 'Sürücü belgesi', insurance: 'Sigorta poliçesi', registration: 'Ruhsat', inspection: 'Muayene', contract: 'Sözleşme' }

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
  if (age < p.minAge) reasons.push(`Sürücü yaşı ${age}; en az ${p.minAge} olmalı.`)
  if (licenseYears < p.minLicenseYears) reasons.push(`Ehliyet ${licenseYears} yıllık; en az ${p.minLicenseYears} yıl gerekli.`)
  if (Date.parse(`${c.license.validUntil}T23:59:59Z`) < Date.parse(returnAt)) reasons.push(`Sürücü belgesi ${c.license.validUntil} tarihinde bitiyor; kiralama süresini kapsamıyor.`)
  const docReasons = customerDocChecks(db, c, pickupAt, returnAt)
    .filter((x) => x.state === 'missing' || x.state === 'expired')
    .map((x) => `${DOC_LABEL[x.kind] ?? x.kind}: ${x.state === 'missing' ? 'eksik' : 'süresi dolmuş veya kiralama bitmeden dolacak'}.`)
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
  if (row === undefined) return { ok: false, required: { minor: 0, cur }, message: `Bu sınıf için ${cur} depozito satırı tanımlı değil (Ayarlar → Depozito).` }
  const pkg = insuranceId ? db.insurance.find((p) => p.id === insuranceId) : undefined
  const effect = pkg?.depositEffect[cur] ?? 0
  return { ok: true, required: { minor: Math.max(0, row + effect), cur } }
}
