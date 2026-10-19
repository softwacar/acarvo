import { roundHalf } from '../money'
import type { Charge, Cur, CashSession, Db, Drawer, Id, Money, Payment } from '../types'

// Finance calculators (spec §64–67, §72). Charge ≠ Payment; Recorded ≠ Applied; Deposit is not revenue; Refund is not
// an expense. Outstanding comes only from posted charges minus applied allocations, in the rental's own currency.

export interface RentalFinance {
  cur: Cur
  chargesMinor: number
  appliedMinor: number
  outstandingMinor: number
  /** Payments recorded against the rental but not (yet) applied to a posted charge. */
  unappliedMinor: number
  /** Applied more than owed: shown as a credit / refund candidate, never hidden as a negative balance. */
  overpaidMinor: number
  charges: Charge[]
  payments: Payment[]
}

export function rentalFinance(db: Db, rentalId: Id): RentalFinance {
  const rental = db.rentals.find((r) => r.id === rentalId)
  const cur = rental?.currency ?? db.settings.company.baseCurrency
  const charges = db.charges.filter((c) => c.rentalId === rentalId)
  const posted = charges.filter((c) => c.status === 'posted')
  const payments = db.payments.filter((p) => p.rentalId === rentalId && p.status !== 'voided')
  const chargesMinor = posted.reduce((a, c) => a + c.amountMinor, 0)
  const appliedMinor = payments.filter((p) => p.status === 'applied').reduce((a, p) => a + p.allocations.reduce((x, al) => x + al.minor, 0), 0)
  const unappliedMinor = payments.filter((p) => p.status === 'recorded').reduce((a, p) => a + p.appliedMinor, 0)
  const outstanding = chargesMinor - appliedMinor
  return { cur, chargesMinor, appliedMinor, outstandingMinor: Math.max(0, outstanding), unappliedMinor, overpaidMinor: Math.max(0, -outstanding), charges, payments }
}

/** Oldest-first allocation of an applied amount onto the open posted charges of a rental. */
export function allocatePayment(db: Db, rentalId: Id, appliedMinor: number, allowOverpayment: boolean): { allocations: { chargeId: Id; minor: number }[]; leftoverMinor: number } {
  const open: { chargeId: Id; open: number }[] = []
  const paidByCharge = new Map<Id, number>()
  for (const p of db.payments) {
    if (p.rentalId !== rentalId || p.status !== 'applied') continue
    for (const a of p.allocations) paidByCharge.set(a.chargeId, (paidByCharge.get(a.chargeId) ?? 0) + a.minor)
  }
  for (const c of db.charges.filter((x) => x.rentalId === rentalId && x.status === 'posted').sort((a, b) => (a.postedAt ?? '').localeCompare(b.postedAt ?? ''))) {
    const left = c.amountMinor - (paidByCharge.get(c.id) ?? 0)
    if (left > 0) open.push({ chargeId: c.id, open: left })
  }
  const allocations: { chargeId: Id; minor: number }[] = []
  let rest = appliedMinor
  for (const o of open) {
    if (rest <= 0) break
    const take = Math.min(rest, o.open)
    allocations.push({ chargeId: o.chargeId, minor: take })
    rest -= take
  }
  void allowOverpayment
  return { allocations, leftoverMinor: rest }
}

// --------------------------------------------------------------------------- cash drawers

/** Expected balance of a cash session: opening + cash in − cash out. Native currency only. */
export function computeCashExpected(db: Db, session: CashSession): number {
  const moves = db.cashMovements.filter((m) => m.sessionId === session.id)
  return session.openingMinor + moves.reduce((a, m) => a + (m.kind === 'in' ? m.minor : -m.minor), 0)
}
export const openSessionOf = (db: Db, d: Drawer) => (d.sessionId ? db.cashSessions.find((s) => s.id === d.sessionId) : undefined)

/** Physical cash held per currency across all drawers with an open session. */
export function cashByCurrency(db: Db, branchId?: Id): Record<Cur, number> {
  const out: Record<Cur, number> = {}
  for (const d of db.drawers) {
    if (branchId && d.branchId !== branchId) continue
    const s = openSessionOf(db, d)
    if (s) out[d.currency] = (out[d.currency] ?? 0) + computeCashExpected(db, s)
  }
  return out
}

// --------------------------------------------------------------------------- corporate exposure (per currency)

export interface Exposure {
  cur: Cur
  limitMinor: number | null
  committedMinor: number
  postedReceivableMinor: number
  exposureMinor: number
  overrideMinor: number
  headroomMinor: number | null
}

/**
 * committed = confirmed reservations and prepared rentals not yet delivered (no posted charge yet);
 * receivable = outstanding of posted charges (delivered rentals, closed or not). A delivered rental is counted once,
 * as receivable, never also as committed. No credit limit means "not defined", not "unlimited".
 */
export function projectCorporateExposure(db: Db, corporateId: Id): Exposure[] {
  const corp = db.corporates.find((c) => c.id === corporateId)
  if (!corp) return []
  const curs = new Set<Cur>(Object.keys(corp.creditLimits))
  const committed: Record<Cur, number> = {}
  const receivable: Record<Cur, number> = {}
  for (const r of db.reservations) {
    if (r.corporateId !== corporateId || r.status !== 'confirmed' || !r.price) continue
    committed[r.currency] = (committed[r.currency] ?? 0) + r.price.grossMinor
    curs.add(r.currency)
  }
  for (const r of db.rentals) {
    if (r.corporateId !== corporateId) continue
    if (r.status === 'prepared' && r.price) {
      committed[r.currency] = (committed[r.currency] ?? 0) + r.price.grossMinor
      curs.add(r.currency)
    } else if (r.status !== 'cancelled' && r.status !== 'prepared') {
      const f = rentalFinance(db, r.id)
      if (f.outstandingMinor > 0) {
        receivable[r.currency] = (receivable[r.currency] ?? 0) + f.outstandingMinor
        curs.add(r.currency)
      }
    }
  }
  return [...curs].sort().map((cur) => {
    const limit = corp.creditLimits[cur] ?? null
    const ov = corp.overrides.filter((o) => o.cur === cur).reduce((a, o) => a + o.minor, 0)
    const c = committed[cur] ?? 0
    const rcv = receivable[cur] ?? 0
    return { cur, limitMinor: limit, committedMinor: c, postedReceivableMinor: rcv, exposureMinor: c + rcv, overrideMinor: ov, headroomMinor: limit === null ? null : limit + ov - (c + rcv) }
  })
}

// --------------------------------------------------------------------------- commission & supplier payable

export function projectCommission(pct: number, baseNetMinor: number): number {
  return roundHalf((baseNetMinor * pct) / 100)
}
export function projectSupplierPayable(dailyCost: Money, from: string, to: string): Money {
  const days = Math.max(1, Math.ceil((Date.parse(to) - Date.parse(from)) / 86_400_000))
  return { minor: days * dailyCost.minor, cur: dailyCost.cur }
}
