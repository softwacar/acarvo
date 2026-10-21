import { B } from '../../i18n'
import { advanceLedger, allocatePayment, computeCashExpected, openSessionOf, rentalFinance } from '../calc/finance'
import { cancellationFee } from '../calc/policy'
import { convertTenderToObligation } from '../calc/fx'
import { addHistory, fail, hasPerm, logEvent, need, nextId, nextNo, nowOf, meOf, userName } from '../helpers'
import { fmt } from '../money'
import type { Charge, Cur, Db, DepositRecord, Drawer, Id, Money, Payment, PaymentMethod, PriceLine, RefundRecord, Rental } from '../types'

// Finance operations. Every posted movement has an idempotency key; clicking twice never posts twice (spec §II.3).

/** A variance above this many times the reason threshold is critical. */
export const CRITICAL_VARIANCE_FACTOR = 5

export const findDrawer = (d: Db, branchId: Id, cur: Cur): Drawer | undefined => d.drawers.find((x) => x.branchId === branchId && x.currency === cur)

// --------------------------------------------------------------------------- charges

/** Posts a charge once per key. Returns the existing charge when the key was already used. */
export function postCharge(d: Db, input: { rentalId: Id; kind: PriceLine['kind']; label: string; amountMinor: number; taxMinor?: number; key: string; sourceType?: string; sourceId?: Id }): Charge {
  const existing = d.charges.find((c) => c.key === input.key && c.status !== 'voided')
  if (existing) return existing
  const rental = d.rentals.find((r) => r.id === input.rentalId)
  if (!rental) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  const c: Charge = {
    id: nextId(d, 'ch'),
    no: nextNo(d, 'H'),
    rentalId: input.rentalId,
    kind: input.kind,
    label: input.label,
    amountMinor: input.amountMinor,
    cur: rental!.currency,
    taxMinor: input.taxMinor ?? 0,
    status: 'posted',
    key: input.key,
    postedAt: nowOf(d),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  }
  d.charges.push(c)
  logEvent(d, { module: 'finance', type: 'ChargePosted', sourceType: 'rental', sourceId: input.rentalId, summary: `${c.no} · ${input.label}`, cur: c.cur, minor: c.amountMinor, branchId: rental!.pickupBranchId, after: 'posted' })
  applyHeldAdvances(d, rental!)
  return c
}

export function voidCharge(d: Db, chargeId: Id, reason: string, approvalId?: Id): void {
  if (!approvalId) fail(B('Hesap kalemi iptali (ters kayıt) yüksek riskli bir işlemdir: yalnız onaylanıp uygulanmış bir Finansal Düzeltme ile yapılır. Onay Merkezi’nden talep açın.', 'Voiding a charge (a reversal) is a high-risk action: it is done only through an approved and applied Financial Correction. Open a request in the Approval Center.'), {}, 'NEEDS_APPROVAL')
  const c = d.charges.find((x) => x.id === chargeId)
  if (!c) fail(B('Kalem bulunamadı.', 'Charge not found.'))
  if (c!.status === 'voided') return
  const paid = d.payments.filter((p) => p.status === 'applied').reduce((a, p) => a + p.allocations.filter((x) => x.chargeId === chargeId).reduce((s, x) => s + x.minor, 0), 0)
  if (paid > 0) fail(B('Bu kaleme ödeme uygulanmış. Önce ödemeyi iptal edin (ters kayıt).', 'A payment was applied to this charge. Reverse the payment first (reversal entry).'))
  c!.status = 'voided'
  c!.voidReason = reason
  logEvent(d, { module: 'finance', type: 'ChargeVoided', sourceType: 'rental', sourceId: c!.rentalId, summary: `${c!.no} iptal edildi`, reason, cur: c!.cur, minor: c!.amountMinor, before: 'posted', after: 'voided' })
}

// --------------------------------------------------------------------------- payments

export interface PaymentInput {
  rentalId?: Id
  reservationId?: Id
  kind: 'payment' | 'advance'
  payer: Payment['payer']
  method: PaymentMethod
  tenderMinor: number
  tenderCur: Cur
  branchId: Id
  reference?: string
  note?: string
}

/** Applied-equivalent preview for a form: no state change. */
export function previewPayment(d: Db, input: Pick<PaymentInput, 'tenderMinor' | 'tenderCur' | 'branchId'> & { obligationCur: Cur }) {
  return convertTenderToObligation(d.fxRates, { tenderMinor: input.tenderMinor, tender: input.tenderCur, obligation: input.obligationCur, branchId: input.branchId, at: nowOf(d) })
}

/**
 * Records an incoming payment line. A foreign tender currency needs a business rate; without it nothing is stored
 * ("Awaiting Rate" is a form validation, not a Payment status). Cash goes into the open drawer of that currency;
 * card and bank transfer never touch physical cash. The line is applied to posted charges when there are any,
 * otherwise it stays recorded (unapplied) until a charge is posted.
 */
export function recordPayment(d: Db, input: PaymentInput): Payment {
  need(d, 'finance:record', B('Tahsilat kaydı', 'Recording a payment'))
  if (input.tenderMinor <= 0) fail(B('Tutar sıfırdan büyük olmalı.', 'The amount must be greater than zero.'), { amount: B('Tutarı girin', 'Enter the amount') })
  const rental = input.rentalId ? d.rentals.find((r) => r.id === input.rentalId) : undefined
  const reservation = input.reservationId ? d.reservations.find((r) => r.id === input.reservationId) : undefined
  if (!rental && !reservation) fail(B('Tahsilat bir kiralamaya veya rezervasyona bağlı olmalı.', 'A payment must belong to a rental or a reservation.'))
  const branch = d.branches.find((b) => b.id === input.branchId)
  if (!branch) fail(B('Şube seçin.', 'Choose a branch.'), { branch: B('Şube seçin', 'Choose a branch') })
  const accepted = d.settings.branchTender[input.branchId] ?? d.settings.acceptedCurrencies
  if (!accepted.includes(input.tenderCur)) fail(B(`${branch!.name} şubesi ${input.tenderCur} tahsilat kabul etmiyor.`, `Branch ${branch!.name} does not accept ${input.tenderCur} payments.`), { currency: B('Bu şubede kabul edilmiyor', 'Not accepted at this branch') })
  const obligationCur = (rental ?? reservation)!.currency
  const conv = convertTenderToObligation(d.fxRates, { tenderMinor: input.tenderMinor, tender: input.tenderCur, obligation: obligationCur, branchId: input.branchId, at: nowOf(d) })
  if (!conv.ok) fail(conv.message, { currency: conv.code === 'AWAITING_RATE' ? 'Kur Bekleniyor' : B('Kur çakışması', 'Rate conflict') }, conv.code)
  const okConv = conv as Extract<typeof conv, { ok: true }>

  let drawerId: Id | undefined
  if (input.method === 'cash') {
    const drawer = findDrawer(d, input.branchId, input.tenderCur)
    if (!drawer) fail(B(`${branch!.name} şubesinde ${input.tenderCur} nakit kasası tanımlı değil (Şube Kasaları).`, `Branch ${branch!.name} has no ${input.tenderCur} cash drawer defined (Branch Cash).`))
    const session = openSessionOf(d, drawer!)
    if (!session) fail(B(`${branch!.name} ${input.tenderCur} kasası kapalı. Nakit tahsilat için önce Şube Kasaları'ndan kasa oturumu açın.`, `The ${branch!.name} ${input.tenderCur} drawer is closed. Open a drawer session in Branch Cash before taking cash.`), { method: B('Kasa kapalı', 'Drawer closed') })
    drawerId = drawer!.id
  }

  const p: Payment = {
    id: nextId(d, 'pay'),
    no: nextNo(d, 'T'),
    kind: input.kind,
    status: 'recorded',
    rentalId: rental?.id,
    reservationId: reservation?.id,
    payer: input.payer,
    method: input.method,
    tender: { minor: input.tenderMinor, cur: input.tenderCur },
    rate: okConv.snapshot,
    appliedMinor: okConv.appliedMinor,
    obligationCur,
    allocations: [],
    advanceState: input.kind === 'advance' ? 'unapplied' : undefined,
    branchId: input.branchId,
    drawerId,
    reference: input.reference ?? '',
    note: input.note ?? '',
    recordedBy: meOf(d).id,
    recordedAt: nowOf(d),
  }
  d.payments.push(p)
  logEvent(d, {
    module: 'finance',
    type: 'PaymentRecorded',
    sourceType: rental ? 'rental' : 'reservation',
    sourceId: (rental ?? reservation)!.id,
    summary: `${p.no} · ${p.payer.name} · ${fmt(input.tenderMinor, input.tenderCur)} (${input.method})`,
    cur: input.tenderCur,
    minor: input.tenderMinor,
    branchId: input.branchId,
    after: 'recorded',
  })
  if (drawerId) cashMove(d, drawerId, 'in', input.tenderMinor, input.kind === 'advance' ? B('Kaparo (nakit)', 'Advance (cash)') : B('Müşteri tahsilatı (nakit)', 'Customer payment (cash)'), 'payment', p.id)
  // Recorded ≠ Verified ≠ Applied: the line does not reduce the balance until somebody else verifies it (risk level 1).
  return p
}

/**
 * Independent verification (risk level 1): somebody other than the person who recorded the line confirms it. Verifying a
 * payment applies it to the open posted charges; a verified advance is applied at delivery. The audit trail keeps both steps.
 */
export function verifyPayment(d: Db, paymentId: Id): Payment {
  need(d, 'finance:verify', B('Tahsilat doğrulama', 'Verifying a payment'))
  const p = d.payments.find((x) => x.id === paymentId)
  if (!p) fail(B('Ödeme bulunamadı.', 'Payment not found.'))
  if (p!.status === 'voided') fail(B('İptal edilmiş ödeme doğrulanamaz.', 'A reversed payment cannot be verified.'))
  if (p!.verifiedAt) fail(B('Bu ödeme zaten doğrulanmış.', 'This payment is already verified.'))
  if (p!.recordedBy === meOf(d).id) fail(B('Kaydı açan kişi doğrulayamaz: ikinci bir yetkili gerekir (bağımsız doğrulama).', 'The person who recorded it cannot verify it: a second authorized person is needed (independent verification).'), {}, 'FOUR_EYES')
  p!.verifiedBy = meOf(d).id
  p!.verifiedAt = nowOf(d)
  logEvent(d, { module: 'finance', type: 'PaymentVerified', sourceType: p!.rentalId ? 'rental' : 'reservation', sourceId: (p!.rentalId ?? p!.reservationId)!, summary: B(`${p!.no} doğrulandı (kaydeden ${userName(d, p!.recordedBy)}, doğrulayan ${userName(d, meOf(d).id)})`, `${p!.no} verified (recorded by ${userName(d, p!.recordedBy)}, verified by ${userName(d, meOf(d).id)})`), cur: p!.tender.cur, minor: p!.tender.minor, branchId: p!.branchId, before: 'recorded', after: 'verified' })
  const rental = p!.rentalId ? d.rentals.find((r) => r.id === p!.rentalId) : undefined
  if (rental && p!.kind === 'payment') applyPayment(d, p!)
  else if (rental && p!.kind === 'advance') applyHeldAdvances(d, rental)
  return p!
}

/**
 * Seed and scenario helper: the money line is verified by somebody other than the person who recorded it, exactly as in real
 * use, and the acting user is restored afterwards. Not used by any screen.
 */
export function verifyByAnother(d: Db, what: { payment?: Payment; deposit?: DepositRecord }): void {
  const me = d.session.userId
  const recordedBy = what.payment?.recordedBy ?? what.deposit?.by
  d.session.userId = ['u-acc', 'u-owner', 'u-mgr'].find((u) => u !== recordedBy)!
  try {
    if (what.payment) verifyPayment(d, what.payment.id)
    else if (what.deposit) verifyDeposit(d, what.deposit.id)
  } finally {
    d.session.userId = me
  }
}

/** Reconciliation is its own track: an applied payment is matched against the drawer count, the POS slip or the bank statement. It does not change any balance. */
export function reconcilePayments(d: Db, ids: Id[], ref: string): number {
  need(d, 'finance:reconcile', B('Mutabakat', 'Reconciliation'))
  if (ref.trim().length < 3) fail(B('Mutabakat referansını yazın (kasa sayımı, POS özeti veya ekstre).', 'Enter the reconciliation reference (drawer count, POS slip or statement).'), { ref: B('Referans zorunlu', 'A reference is required') })
  let n = 0
  for (const id of ids) {
    const p = d.payments.find((x) => x.id === id)
    if (!p || p.status !== 'applied' || p.reconciledAt) continue
    p.reconciledAt = nowOf(d)
    p.reconciledBy = meOf(d).id
    p.reconcileRef = ref
    n += 1
    logEvent(d, { module: 'finance', type: 'PaymentReconciled', sourceType: p.rentalId ? 'rental' : 'reservation', sourceId: (p.rentalId ?? p.reservationId)!, summary: B(`${p.no} mutabık (${ref})`, `${p.no} reconciled (${ref})`), cur: p.tender.cur, minor: p.tender.minor, branchId: p.branchId })
  }
  if (!n) fail(B('Mutabakata uygun (uygulanmış, henüz mutabık olmayan) ödeme yok.', 'There is no payment ready for reconciliation (applied and not yet reconciled).'))
  return n
}

/** Deposits follow the same two-person rule: recorded by one person, verified by another. Releasing or offsetting needs a verified deposit. */
export function verifyDeposit(d: Db, depositId: Id): DepositRecord {
  need(d, 'finance:verify', B('Depozito doğrulama', 'Verifying a deposit'))
  const dep = d.deposits.find((x) => x.id === depositId)
  if (!dep) fail(B('Depozito bulunamadı.', 'Deposit not found.'))
  if (dep!.verifiedAt) fail(B('Bu depozito zaten doğrulanmış.', 'This deposit is already verified.'))
  if (dep!.by === meOf(d).id) fail(B('Depoziti kaydeden kişi doğrulayamaz: ikinci bir yetkili gerekir.', 'The person who recorded the deposit cannot verify it: a second authorized person is needed.'), {}, 'FOUR_EYES')
  dep!.verifiedBy = meOf(d).id
  dep!.verifiedAt = nowOf(d)
  logEvent(d, { module: 'finance', type: 'DepositVerified', sourceType: 'rental', sourceId: dep!.rentalId, summary: B(`Depozito doğrulandı (${fmt(dep!.amount.minor, dep!.amount.cur)})`, `Deposit verified (${fmt(dep!.amount.minor, dep!.amount.cur)})`), cur: dep!.amount.cur, minor: dep!.amount.minor })
  return dep!
}

/** Applies a recorded payment to the open posted charges of its rental (oldest first). */
export function applyPayment(d: Db, p: Payment): void {
  if (p.status !== 'recorded' || !p.rentalId || !p.verifiedAt) return
  const { allocations, leftoverMinor } = allocatePayment(d, p.rentalId, p.appliedMinor, d.settings.payment.allowOverpayment)
  if (!allocations.length) return
  if (leftoverMinor > 0 && !d.settings.payment.allowOverpayment) {
    // Overpayment is not allowed by policy: apply what is owed, keep the rest recorded (credit / refund candidate).
    const applied = allocations.reduce((a, x) => a + x.minor, 0)
    p.allocations = allocations
    p.status = 'applied'
    p.appliedMinor = applied
    p.note = B(`${p.note ? p.note + ' · ' : ''}Fazla ${fmt(leftoverMinor, p.obligationCur)} uygulanmadı (iade adayı).`, `${p.note ? p.note + ' · ' : ''}Excess ${fmt(leftoverMinor, p.obligationCur)} was not applied (refund candidate).`).trim()
  } else {
    p.allocations = allocations
    p.status = 'applied'
  }
  logEvent(d, { module: 'finance', type: 'PaymentApplied', sourceType: 'rental', sourceId: p.rentalId, summary: B(`${p.no} → ${allocations.length} kaleme uygulandı`, `${p.no} → applied to ${allocations.length} charge(s)`), cur: p.obligationCur, minor: p.appliedMinor, after: 'applied' })
}

/** Advances held for a reservation: moved to the rental, then applied when a charge is posted. */
export function applyHeldAdvances(d: Db, rental: Rental): void {
  for (const p of d.payments) {
    if (p.rentalId !== rental.id || p.kind !== 'advance' || p.status !== 'recorded' || !p.verifiedAt) continue
    if (p.advanceState === 'unapplied') continue
    const remainingTender = p.tender.minor - Math.min(p.tender.minor, p.retainedMinor ?? 0) - (p.refundedMinor ?? 0)
    if (remainingTender <= 0) continue
    const usable = remainingTender === p.tender.minor ? p.appliedMinor : Math.round((p.appliedMinor * remainingTender) / p.tender.minor)
    const { allocations } = allocatePayment(d, rental.id, usable, true)
    if (!allocations.length) continue
    p.allocations = allocations
    p.status = 'applied'
    p.advanceState = 'applied'
    p.appliedMinor = allocations.reduce((a, x) => a + x.minor, 0)
    logEvent(d, { module: 'finance', type: 'AdvanceApplied', sourceType: 'rental', sourceId: rental.id, summary: B(`Kaparo ${p.no} hesap kalemine mahsup edildi`, `Advance ${p.no} was applied to the charge`), cur: p.obligationCur, minor: p.appliedMinor })
  }
  // Ordinary recorded payments waiting for a charge (paid before delivery) are applied as well.
  for (const p of d.payments) if (p.rentalId === rental.id && p.kind === 'payment' && p.status === 'recorded' && p.verifiedAt) applyPayment(d, p)
}

export function voidPayment(d: Db, paymentId: Id, reason: string, approvalId?: Id): void {
  if (!approvalId) fail(B('Ödeme iptali (ters kayıt) yüksek riskli bir işlemdir: yalnız onaylanıp uygulanmış bir Finansal Düzeltme ile yapılır. Onay Merkezi’nden talep açın.', 'Reversing a payment is a high-risk action: it is done only through an approved and applied Financial Correction. Open a request in the Approval Center.'), {}, 'NEEDS_APPROVAL')
  need(d, 'approvals:apply', B('Ödeme iptali', 'Payment reversal'))
  const p = d.payments.find((x) => x.id === paymentId)
  if (!p) fail(B('Ödeme bulunamadı.', 'Payment not found.'))
  if (p!.status === 'voided') fail(B('Bu ödeme zaten iptal edilmiş.', 'This payment was already reversed.'))
  if (p!.status === 'refunded' || p!.status === 'forfeited') fail(B('İade edilmiş veya politika bedeli olarak tutulmuş kaparo iptal edilemez.', 'An advance that was refunded or kept as a policy fee cannot be reversed.'))
  if (reason.trim().length < 3) fail(B('İptal gerekçesi yazın.', 'Enter a reason for the cancellation.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  const before = p!.status
  p!.status = 'voided'
  p!.voidReason = reason
  p!.voidedAt = nowOf(d)
  // A cash line that entered the drawer leaves it again (a reversal movement, the original stays in the ledger).
  if (p!.drawerId) cashMove(d, p!.drawerId, 'out', p!.tender.minor, B(`Ödeme iptali ${p!.no}`, `Payment reversal ${p!.no}`), 'payment', p!.id, true)
  p!.allocations = []
  logEvent(d, { module: 'finance', type: 'PaymentVoided', sourceType: p!.rentalId ? 'rental' : 'reservation', sourceId: (p!.rentalId ?? p!.reservationId)!, summary: `${p!.no} iptal`, reason, cur: p!.tender.cur, minor: p!.tender.minor, before, after: 'voided' })
}

// --------------------------------------------------------------------------- deposits and refunds

export function holdDeposit(d: Db, rentalId: Id, method: PaymentMethod, note = '', amountOverride?: Money): DepositRecord {
  need(d, 'finance:record', B('Depozito alma', 'Taking a deposit'))
  const rental = d.rentals.find((r) => r.id === rentalId)
  if (!rental) fail(B('Kiralama bulunamadı.', 'Rental not found.'))
  const amount = amountOverride ?? rental!.deposit.required
  if (amount.minor <= 0) fail(B('Depozito tutarı sıfır.', 'The deposit amount is zero.'))
  if (!d.settings.deposit.allowedMethods.includes(method)) fail(B('Bu depozito yöntemi şirket politikasında kapalı.', 'This deposit method is turned off in the company policy.'))
  if (d.deposits.some((x) => x.rentalId === rentalId && x.state === 'held')) fail(B('Bu kiralama için zaten tutulan bir depozito var.', 'A deposit is already held for this rental.'))
  let drawerId: Id | undefined
  if (method === 'cash') {
    const drawer = findDrawer(d, rental!.pickupBranchId, amount.cur)
    const session = drawer && openSessionOf(d, drawer)
    if (!drawer || !session) fail(B(`${amount.cur} nakit kasası kapalı veya tanımsız. Depozito için önce Şube Kasaları'ndan kasa açın.`, `The ${amount.cur} cash drawer is closed or undefined. Open a drawer in Branch Cash before taking a deposit.`))
    drawerId = drawer!.id
  }
  const dep: DepositRecord = { id: nextId(d, 'dep'), rentalId, amount, method, state: 'held', heldAt: nowOf(d), drawerId, by: meOf(d).id, note }
  d.deposits.push(dep)
  rental!.deposit.state = 'held'
  rental!.deposit.method = method
  if (drawerId) cashMove(d, drawerId, 'in', amount.minor, B(`Depozito (nakit) ${rental!.no}`, `Deposit (cash) ${rental!.no}`), 'deposit', dep.id)
  logEvent(d, { module: 'finance', type: 'DepositHeld', sourceType: 'rental', sourceId: rentalId, summary: B(`Depozito tutuluyor · ${fmt(amount.minor, amount.cur)} (${method})`, `Deposit held · ${fmt(amount.minor, amount.cur)} (${method})`), cur: amount.cur, minor: amount.minor })
  addHistory(d, rental!.history, B('Depozito', 'Deposit'), B(`${fmt(amount.minor, amount.cur)} tutuldu (${method}). Gelir değildir.`, `${fmt(amount.minor, amount.cur)} held (${method}). It is not revenue.`))
  return dep
}

export function releaseDeposit(d: Db, depositId: Id, kind: 'released' | 'applied'): void {
  need(d, 'finance:apply', B('Depozito çözme', 'Resolving a deposit'))
  const dep = d.deposits.find((x) => x.id === depositId)
  if (!dep) fail(B('Depozito bulunamadı.', 'Deposit not found.'))
  if (dep!.state !== 'held') fail(B('Bu depozito zaten çözülmüş.', 'This deposit was already resolved.'))
  if (!dep!.verifiedAt) fail(B('Depozito henüz doğrulanmadı: ikinci bir yetkili doğrulamadan iade veya mahsup edilemez.', 'The deposit is not verified yet: it cannot be released or offset before a second authorized person verifies it.'), {}, 'NOT_VERIFIED')
  const rental = d.rentals.find((r) => r.id === dep!.rentalId)!
  if (kind === 'applied') {
    const f = rentalFinance(d, rental.id)
    if (f.outstandingMinor <= 0) fail(B('Mahsup edilecek açık bakiye yok.', 'There is no open balance to apply it to.'))
    // Deposit applied to the outstanding charge (same currency only; no hidden conversion).
    if (f.cur !== dep!.amount.cur) fail(B('Depozito yalnız aynı para birimindeki bakiyeye mahsup edilir.', 'A deposit is applied only to a balance in the same currency.'))
    const take = Math.min(dep!.amount.minor, f.outstandingMinor)
    const p: Payment = {
      id: nextId(d, 'pay'),
      no: nextNo(d, 'T'),
      kind: 'payment',
      status: 'applied',
      rentalId: rental.id,
      payer: { type: 'customer', id: rental.customerId, name: B('Depozito mahsubu', 'Deposit offset') },
      method: 'other',
      tender: { minor: take, cur: dep!.amount.cur },
      appliedMinor: take,
      obligationCur: f.cur,
      allocations: allocatePayment(d, rental.id, take, true).allocations,
      branchId: rental.pickupBranchId,
      reference: B(`Depozito ${dep!.id}`, `Deposit ${dep!.id}`),
      note: B('Depozito, açık bakiyeye mahsup edildi (gelir sayılmaz; kalan iade edilir).', 'The deposit was applied to the open balance (not counted as revenue; the remainder is returned).'),
      recordedBy: meOf(d).id,
      recordedAt: nowOf(d),
    }
    d.payments.push(p)
    dep!.state = 'applied'
    if (dep!.drawerId && take < dep!.amount.minor) cashMove(d, dep!.drawerId, 'out', dep!.amount.minor - take, B(`Depozito kalanı iadesi ${rental.no}`, `Deposit remainder refund ${rental.no}`), 'deposit', dep!.id)
    rental.deposit.state = 'applied'
  } else {
    dep!.state = 'released'
    dep!.releasedAt = nowOf(d)
    if (dep!.drawerId) cashMove(d, dep!.drawerId, 'out', dep!.amount.minor, B(`Depozito iadesi ${rental.no}`, `Deposit refund ${rental.no}`), 'deposit', dep!.id)
    rental.deposit.state = 'released'
  }
  logEvent(d, { module: 'finance', type: kind === 'released' ? 'DepositReleased' : 'DepositApplied', sourceType: 'rental', sourceId: rental.id, summary: B(`Depozito ${kind === 'released' ? B('iade edildi', 'released') : 'mahsup edildi'}`, `Deposit ${kind === 'released' ? B('iade edildi', 'released') : 'mahsup edildi'}`), cur: dep!.amount.cur, minor: dep!.amount.minor })
}

export function requestRefund(d: Db, input: { rentalId?: Id; reservationId?: Id; paymentId?: Id; amount: Money; method: PaymentMethod; reason: string }): RefundRecord {
  need(d, 'finance:record', B('İade talebi', 'Refund request'))
  if (input.amount.minor <= 0) fail(B('İade tutarı sıfırdan büyük olmalı.', 'The refund amount must be greater than zero.'))
  if (input.reason.trim().length < 3) fail(B('Gerekçe yazın.', 'Enter a reason.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  const r: RefundRecord = { id: nextId(d, 'rf'), no: nextNo(d, 'I'), rentalId: input.rentalId, reservationId: input.reservationId, paymentId: input.paymentId, amount: input.amount, method: input.method, status: 'requested', reason: input.reason, requestedBy: meOf(d).id, requestedAt: nowOf(d) }
  d.refunds.push(r)
  logEvent(d, { module: 'finance', type: 'RefundRequested', sourceType: input.rentalId ? 'rental' : 'reservation', sourceId: (input.rentalId ?? input.reservationId)!, summary: `${r.no} · ${fmt(input.amount.minor, input.amount.cur)}`, cur: input.amount.cur, minor: input.amount.minor, reason: input.reason })
  return r
}

/** Completing a refund records that it was paid out (outside ACARVO). A cash refund leaves the drawer. */
export function completeRefund(d: Db, refundId: Id): void {
  const r = d.refunds.find((x) => x.id === refundId)
  if (!r) fail(B('İade bulunamadı.', 'Refund not found.'))
  if (r!.status === 'completed') return
  if (r!.status !== 'approved') fail(B('İade önce Onay Merkezi\'nde onaylanıp uygulanmalı.', 'The refund must first be approved and applied in the Approval Center.'))
  const advance = r!.paymentId ? d.payments.find((x) => x.id === r!.paymentId) : undefined
  if (r!.paymentId && (!advance || advance.kind !== 'advance' || advance.status !== 'recorded')) fail(B('Bu kaparo artık iade edilemez (uygulanmış, iade edilmiş veya iptal).', 'This advance can no longer be refunded (applied, refunded or reversed).'))
  if (advance) {
    const room = advance.tender.minor - Math.min(advance.tender.minor, advance.retainedMinor ?? 0) - (advance.refundedMinor ?? 0)
    if (r!.amount.minor > room) fail(B('İade tutarı kalan kullanılabilir kaparoyu aşıyor; aynı kaparo ikinci kez iade edilemez.', 'The refund exceeds the remaining usable advance; the same advance cannot be refunded twice.'), {}, 'OVER_REFUND')
  }
  const branchId = advance ? advance.branchId : r!.rentalId ? d.rentals.find((x) => x.id === r!.rentalId)!.pickupBranchId : d.reservations.find((x) => x.id === r!.reservationId)!.pickupBranchId
  if (r!.method === 'cash') {
    const drawer = findDrawer(d, branchId, r!.amount.cur)
    const session = drawer && openSessionOf(d, drawer)
    if (!drawer || !session) fail(B(`${r!.amount.cur} nakit kasası kapalı veya tanımsız; nakit iade yapılamaz.`, `The ${r!.amount.cur} cash drawer is closed or undefined; a cash refund is not possible.`))
    if (computeCashExpected(d, session!) < r!.amount.minor) fail(B('Kasada yeterli nakit yok.', 'There is not enough cash in the drawer.'))
    r!.drawerId = drawer!.id
    cashMove(d, drawer!.id, 'out', r!.amount.minor, B(`Müşteri iadesi ${r!.no}`, `Customer refund ${r!.no}`), 'refund', r!.id)
  }
  r!.status = 'completed'
  r!.completedAt = nowOf(d)
  if (advance) {
    // A partial refund leaves the remaining advance held and usable; only when nothing remains is the advance closed. It is never refunded twice.
    advance.refundedMinor = (advance.refundedMinor ?? 0) + r!.amount.minor
    const left = advance.tender.minor - Math.min(advance.tender.minor, advance.retainedMinor ?? 0) - advance.refundedMinor
    if (left <= 0) {
      advance.status = 'refunded'
      advance.advanceState = 'refunded'
      advance.allocations = []
    }
  }
  logEvent(d, { module: 'finance', type: 'RefundCompleted', sourceType: r!.rentalId ? 'rental' : 'reservation', sourceId: (r!.rentalId ?? r!.reservationId)!, summary: B(`${r!.no} iade edildi (kayıt)`, `${r!.no} refunded (record)`), cur: r!.amount.cur, minor: r!.amount.minor })
}

// --------------------------------------------------------------------------- cash drawers

export function openSession(d: Db, drawerId: Id, openingMinor: number): void {
  need(d, 'cash:manage', B('Kasa açma', 'Opening a drawer'))
  const dr = d.drawers.find((x) => x.id === drawerId)
  if (!dr) fail(B('Kasa bulunamadı.', 'Drawer not found.'))
  if (dr!.status === 'open') fail(B('Bu kasanın açık oturumu var.', 'This drawer already has an open session.'))
  if (openingMinor < 0) fail(B('Açılış bakiyesi negatif olamaz.', 'The opening balance cannot be negative.'), { opening: B('Geçersiz tutar', 'Invalid amount') })
  const sid = nextId(d, 'cs')
  d.cashSessions.push({ id: sid, drawerId, openedAt: nowOf(d), openedBy: meOf(d).id, openingMinor })
  dr!.status = 'open'
  dr!.sessionId = sid
  logEvent(d, { module: 'cash', type: 'CashSessionOpened', sourceType: 'drawer', sourceId: drawerId, summary: B(`${dr!.name} açıldı · açılış ${fmt(openingMinor, dr!.currency)}`, `${dr!.name} opened · opening ${fmt(openingMinor, dr!.currency)}`), cur: dr!.currency, minor: openingMinor, branchId: dr!.branchId })
}

export function cashMove(d: Db, drawerId: Id, kind: 'in' | 'out', minor: number, reason: string, sourceType: 'payment' | 'deposit' | 'refund' | 'expense' | 'manual' | 'opening', sourceId?: Id, reversal = false): void {
  const dr = d.drawers.find((x) => x.id === drawerId)
  if (!dr || !dr.sessionId) fail(B('Kasa kapalı.', 'The drawer is closed.'))
  if (minor <= 0) fail(B('Tutar sıfırdan büyük olmalı.', 'The amount must be greater than zero.'))
  // The same source posts to the cash ledger once per direction.
  if (sourceId && d.cashMovements.some((m) => m.sourceId === sourceId && m.sourceType === sourceType && m.kind === kind && m.drawerId === drawerId && !reversal && m.reason === reason)) return
  d.cashMovements.push({ id: nextId(d, 'cm'), drawerId, sessionId: dr!.sessionId!, kind, minor, cur: dr!.currency, at: nowOf(d), by: meOf(d).id, reason, sourceType, sourceId })
}

export function manualCashMove(d: Db, drawerId: Id, kind: 'in' | 'out', minor: number, reason: string): void {
  need(d, 'cash:manage', B('Kasa hareketi', 'Cash movement'))
  if (reason.trim().length < 3) fail(B('Gerekçe yazın.', 'Enter a reason.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  const dr = d.drawers.find((x) => x.id === drawerId)
  const s = dr && openSessionOf(d, dr)
  if (!dr || !s) fail(B('Kasa kapalı. Önce oturum açın.', 'The drawer is closed. Open a session first.'))
  if (kind === 'out' && computeCashExpected(d, s!) < minor) fail(B('Kasada yeterli nakit yok.', 'There is not enough cash in the drawer.'), { amount: B('Beklenen bakiyeyi aşıyor', 'Exceeds the expected balance') })
  cashMove(d, drawerId, kind, minor, reason, 'manual')
  logEvent(d, { module: 'cash', type: 'CashMovement', sourceType: 'drawer', sourceId: drawerId, summary: `${kind === 'in' ? B('Giriş', 'In') : B('Çıkış', 'Out')} · ${reason}`, cur: dr!.currency, minor, branchId: dr!.branchId })
}

export function closeSession(d: Db, drawerId: Id, countedMinor: number, varianceReason: string, handoverTo?: Id, handoverNote?: string): void {
  need(d, 'cash:close', B('Kasa kapanışı', 'Closing a drawer'))
  const dr = d.drawers.find((x) => x.id === drawerId)
  const s = dr && openSessionOf(d, dr)
  if (!dr || !s) fail(B('Kasa zaten kapalı.', 'The drawer is already closed.'))
  if (countedMinor < 0) fail(B('Sayılan bakiye negatif olamaz.', 'The counted balance cannot be negative.'), { counted: B('Geçersiz tutar', 'Invalid amount') })
  const expected = computeCashExpected(d, s!)
  const variance = countedMinor - expected
  const limit = d.settings.cash.varianceReason[dr!.currency] ?? 0
  if (Math.abs(variance) > limit && varianceReason.trim().length < 5) fail(B(`Fark ${fmt(variance, dr!.currency)}; eşiği (${fmt(limit, dr!.currency)}) aşıyor. Gerekçe yazın.`, `Variance ${fmt(variance, dr!.currency)}; it exceeds the threshold (${fmt(limit, dr!.currency)}). Enter a reason.`), { reason: B('Fark gerekçesi zorunlu', 'A variance reason is required') })
  // A critical variance (far above the reason threshold) is not closed by a cashier alone: a person with approval authority closes it.
  if (Math.abs(variance) > limit * CRITICAL_VARIANCE_FACTOR && limit > 0 && !hasPerm(d, 'approvals:decide')) fail(B(`Kasa farkı ${fmt(variance, dr!.currency)} kritik eşiği (${fmt(limit * CRITICAL_VARIANCE_FACTOR, dr!.currency)}) aşıyor: kasayı yalnız onay yetkisi olan kişi (Sahip/Yönetici) kapatabilir.`, `The drawer variance ${fmt(variance, dr!.currency)} exceeds the critical threshold (${fmt(limit * CRITICAL_VARIANCE_FACTOR, dr!.currency)}): only a person with approval authority (Owner/Manager) can close the drawer.`), { counted: B('Kritik fark: yönetici kapanışı gerekir', 'Critical variance: a manager must close it') }, 'CRITICAL_VARIANCE')
  s!.closedAt = nowOf(d)
  s!.closedBy = meOf(d).id
  s!.countedMinor = countedMinor
  s!.expectedMinor = expected
  s!.varianceMinor = variance
  s!.varianceReason = varianceReason
  s!.handoverTo = handoverTo
  s!.handoverNote = handoverNote
  dr!.status = 'closed'
  dr!.sessionId = undefined
  logEvent(d, { module: 'cash', type: 'CashSessionClosed', sourceType: 'drawer', sourceId: drawerId, summary: B(`${dr!.name} kapandı · beklenen ${fmt(expected, dr!.currency)} · sayılan ${fmt(countedMinor, dr!.currency)} · fark ${fmt(variance, dr!.currency)}`, `${dr!.name} closed · expected ${fmt(expected, dr!.currency)} · counted ${fmt(countedMinor, dr!.currency)} · variance ${fmt(variance, dr!.currency)}`), cur: dr!.currency, minor: variance, reason: varianceReason, branchId: dr!.branchId })
}

/**
 * Applies the company's cancellation policy to the advances held on a cancelled / no-show reservation (risk level 0: the fee is
 * computed by the system from the policy, nobody types an amount, and no formal approval is needed for the standard fee).
 * The fee is kept from the advance; what remains is refundable in whole or in part. A fee above the advance is a customer receivable.
 */
export function applyCancellationPolicy(d: Db, reservationId: Id, kind: 'cancel' | 'no_show'): Payment[] {
  const r = d.reservations.find((x) => x.id === reservationId)
  if (!r) fail(B('Rezervasyon bulunamadı.', 'Reservation not found.'))
  const settled: Payment[] = []
  for (const p of d.payments.filter((x) => x.reservationId === reservationId && x.kind === 'advance' && x.status === 'recorded' && x.advanceState === 'unapplied' && x.policyFeeMinor === undefined)) {
    const fee = cancellationFee(d, r!, nowOf(d), kind)
    // the fee is in the reservation currency; the advance may have been taken in another currency at the recorded business rate
    const ratio = p.appliedMinor > 0 ? p.tender.minor / p.appliedMinor : 1
    const feeTender = p.tender.cur === r!.currency ? fee.feeMinor : Math.round(fee.feeMinor * ratio)
    const open = d.refunds.some((x) => x.paymentId === p.id && (x.status === 'requested' || x.status === 'approved'))
    p.policyFeeMinor = feeTender
    p.policyFeeRule = fee.rule
    p.retainedMinor = open ? 0 : Math.min(feeTender, p.tender.minor)
    if (p.retainedMinor >= p.tender.minor && p.tender.minor > 0) {
      p.status = 'forfeited'
      p.advanceState = 'forfeited'
      p.forfeitedAt = nowOf(d)
      p.forfeitReason = fee.rule
    }
    const l = advanceLedger(d, p)
    logEvent(d, { module: 'finance', type: 'AdvancePolicyFee', sourceType: 'reservation', sourceId: r!.id, summary: B(`Kaparo ${p.no}: politika bedeli ${fmt(feeTender, p.tender.cur)} otomatik hesaplandı; iade edilebilir ${fmt(l.refundableMinor, p.tender.cur)}`, `Advance ${p.no}: policy fee ${fmt(feeTender, p.tender.cur)} computed automatically; refundable ${fmt(l.refundableMinor, p.tender.cur)}`), reason: fee.rule, cur: p.tender.cur, minor: feeTender, branchId: p.branchId })
    addHistory(d, r!.history, B('Kaparo politika bedeli', 'Advance policy fee'), B(`${p.no} · kaparo ${fmt(p.tender.minor, p.tender.cur)} · politika bedeli ${fmt(l.retainedMinor, p.tender.cur)}${l.receivableMinor ? ` · müşteri alacağı ${fmt(l.receivableMinor, p.tender.cur)}` : ''} · iade edilebilir ${fmt(l.refundableMinor, p.tender.cur)} (${fee.rule})`, `${p.no} · advance ${fmt(p.tender.minor, p.tender.cur)} · policy fee ${fmt(l.retainedMinor, p.tender.cur)}${l.receivableMinor ? ` · customer receivable ${fmt(l.receivableMinor, p.tender.cur)}` : ''} · refundable ${fmt(l.refundableMinor, p.tender.cur)} (${fee.rule})`))
    settled.push(p)
  }
  return settled
}

/** Settles an advance whose reservation was cancelled before the policy existed (or whose fee was never computed): the same automatic computation, no typed amount. */
export function settleAdvance(d: Db, paymentId: Id): Payment {
  need(d, 'finance:apply', B('Kaparo politikası', 'Advance policy'))
  const p = d.payments.find((x) => x.id === paymentId)
  if (!p || p.kind !== 'advance') fail(B('Kaparo kaydı bulunamadı.', 'Advance record not found.'))
  const r = d.reservations.find((x) => x.id === p!.reservationId)
  if (!r || (r.status !== 'cancelled' && r.status !== 'no_show')) return fail(B('Politika bedeli yalnız iptal edilen veya gelmeyen rezervasyonda uygulanır.', 'The policy fee applies only to a cancelled or no-show reservation.'))
  if (p!.policyFeeMinor !== undefined) fail(B('Bu kaparo için politika bedeli zaten hesaplanmış.', 'The policy fee was already computed for this advance.'))
  const done = applyCancellationPolicy(d, r.id, r.status === 'no_show' ? 'no_show' : 'cancel')
  if (!done.length) fail(B('Bu kaparo artık tutulan durumda değil.', 'This advance is no longer held.'))
  return p!
}
