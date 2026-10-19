import { allocatePayment, computeCashExpected, openSessionOf, rentalFinance } from '../calc/finance'
import { convertTenderToObligation } from '../calc/fx'
import { addHistory, fail, logEvent, need, nextId, nextNo, nowOf, meOf } from '../helpers'
import { fmt } from '../money'
import type { Charge, Cur, Db, DepositRecord, Drawer, Id, Money, Payment, PaymentMethod, PriceLine, RefundRecord, Rental } from '../types'

// Finance operations. Every posted movement has an idempotency key; clicking twice never posts twice (spec §II.3).

export const findDrawer = (d: Db, branchId: Id, cur: Cur): Drawer | undefined => d.drawers.find((x) => x.branchId === branchId && x.currency === cur)

// --------------------------------------------------------------------------- charges

/** Posts a charge once per key. Returns the existing charge when the key was already used. */
export function postCharge(d: Db, input: { rentalId: Id; kind: PriceLine['kind']; label: string; amountMinor: number; taxMinor?: number; key: string; sourceType?: string; sourceId?: Id }): Charge {
  const existing = d.charges.find((c) => c.key === input.key && c.status !== 'voided')
  if (existing) return existing
  const rental = d.rentals.find((r) => r.id === input.rentalId)
  if (!rental) fail('Kiralama bulunamadı.')
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

export function voidCharge(d: Db, chargeId: Id, reason: string): void {
  const c = d.charges.find((x) => x.id === chargeId)
  if (!c) fail('Kalem bulunamadı.')
  if (c!.status === 'voided') return
  const paid = d.payments.filter((p) => p.status === 'applied').reduce((a, p) => a + p.allocations.filter((x) => x.chargeId === chargeId).reduce((s, x) => s + x.minor, 0), 0)
  if (paid > 0) fail('Bu kaleme ödeme uygulanmış. Önce ödemeyi iptal edin (ters kayıt).')
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
  need(d, 'finance:record', 'Tahsilat kaydı')
  if (input.tenderMinor <= 0) fail('Tutar sıfırdan büyük olmalı.', { amount: 'Tutarı girin' })
  const rental = input.rentalId ? d.rentals.find((r) => r.id === input.rentalId) : undefined
  const reservation = input.reservationId ? d.reservations.find((r) => r.id === input.reservationId) : undefined
  if (!rental && !reservation) fail('Tahsilat bir kiralamaya veya rezervasyona bağlı olmalı.')
  const branch = d.branches.find((b) => b.id === input.branchId)
  if (!branch) fail('Şube seçin.', { branch: 'Şube seçin' })
  const accepted = d.settings.branchTender[input.branchId] ?? d.settings.acceptedCurrencies
  if (!accepted.includes(input.tenderCur)) fail(`${branch!.name} şubesi ${input.tenderCur} tahsilat kabul etmiyor.`, { currency: 'Bu şubede kabul edilmiyor' })
  const obligationCur = (rental ?? reservation)!.currency
  const conv = convertTenderToObligation(d.fxRates, { tenderMinor: input.tenderMinor, tender: input.tenderCur, obligation: obligationCur, branchId: input.branchId, at: nowOf(d) })
  if (!conv.ok) fail(conv.message, { currency: conv.code === 'AWAITING_RATE' ? 'Kur Bekleniyor' : 'Kur çakışması' }, conv.code)
  const okConv = conv as Extract<typeof conv, { ok: true }>

  let drawerId: Id | undefined
  if (input.method === 'cash') {
    const drawer = findDrawer(d, input.branchId, input.tenderCur)
    if (!drawer) fail(`${branch!.name} şubesinde ${input.tenderCur} nakit kasası tanımlı değil (Şube Kasaları).`)
    const session = openSessionOf(d, drawer!)
    if (!session) fail(`${branch!.name} ${input.tenderCur} kasası kapalı. Nakit tahsilat için önce Şube Kasaları'ndan kasa oturumu açın.`, { method: 'Kasa kapalı' })
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
  if (drawerId) cashMove(d, drawerId, 'in', input.tenderMinor, input.kind === 'advance' ? 'Kaparo (nakit)' : 'Müşteri tahsilatı (nakit)', 'payment', p.id)
  if (rental && input.kind === 'payment') applyPayment(d, p)
  return p
}

/** Applies a recorded payment to the open posted charges of its rental (oldest first). */
export function applyPayment(d: Db, p: Payment): void {
  if (p.status !== 'recorded' || !p.rentalId) return
  const { allocations, leftoverMinor } = allocatePayment(d, p.rentalId, p.appliedMinor, d.settings.payment.allowOverpayment)
  if (!allocations.length) return
  if (leftoverMinor > 0 && !d.settings.payment.allowOverpayment) {
    // Overpayment is not allowed by policy: apply what is owed, keep the rest recorded (credit / refund candidate).
    const applied = allocations.reduce((a, x) => a + x.minor, 0)
    p.allocations = allocations
    p.status = 'applied'
    p.appliedMinor = applied
    p.note = `${p.note ? p.note + ' · ' : ''}Fazla ${fmt(leftoverMinor, p.obligationCur)} uygulanmadı (iade adayı).`.trim()
  } else {
    p.allocations = allocations
    p.status = 'applied'
  }
  logEvent(d, { module: 'finance', type: 'PaymentApplied', sourceType: 'rental', sourceId: p.rentalId, summary: `${p.no} → ${allocations.length} kaleme uygulandı`, cur: p.obligationCur, minor: p.appliedMinor, after: 'applied' })
}

/** Advances held for a reservation: moved to the rental, then applied when a charge is posted. */
export function applyHeldAdvances(d: Db, rental: Rental): void {
  for (const p of d.payments) {
    if (p.rentalId !== rental.id || p.kind !== 'advance' || p.status !== 'recorded') continue
    if (p.advanceState === 'unapplied') continue
    const { allocations } = allocatePayment(d, rental.id, p.appliedMinor, true)
    if (!allocations.length) continue
    p.allocations = allocations
    p.status = 'applied'
    p.advanceState = 'applied'
    p.appliedMinor = allocations.reduce((a, x) => a + x.minor, 0)
    logEvent(d, { module: 'finance', type: 'AdvanceApplied', sourceType: 'rental', sourceId: rental.id, summary: `Kaparo ${p.no} hesap kalemine mahsup edildi`, cur: p.obligationCur, minor: p.appliedMinor })
  }
  // Ordinary recorded payments waiting for a charge (paid before delivery) are applied as well.
  for (const p of d.payments) if (p.rentalId === rental.id && p.kind === 'payment' && p.status === 'recorded') applyPayment(d, p)
}

export function voidPayment(d: Db, paymentId: Id, reason: string): void {
  need(d, 'finance:apply', 'Ödeme iptali')
  const p = d.payments.find((x) => x.id === paymentId)
  if (!p) fail('Ödeme bulunamadı.')
  if (p!.status === 'voided') fail('Bu ödeme zaten iptal edilmiş.')
  if (reason.trim().length < 3) fail('İptal gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
  const before = p!.status
  p!.status = 'voided'
  p!.voidReason = reason
  p!.voidedAt = nowOf(d)
  // A cash line that entered the drawer leaves it again (a reversal movement, the original stays in the ledger).
  if (p!.drawerId) cashMove(d, p!.drawerId, 'out', p!.tender.minor, `Ödeme iptali ${p!.no}`, 'payment', p!.id, true)
  p!.allocations = []
  logEvent(d, { module: 'finance', type: 'PaymentVoided', sourceType: p!.rentalId ? 'rental' : 'reservation', sourceId: (p!.rentalId ?? p!.reservationId)!, summary: `${p!.no} iptal`, reason, cur: p!.tender.cur, minor: p!.tender.minor, before, after: 'voided' })
}

// --------------------------------------------------------------------------- deposits and refunds

export function holdDeposit(d: Db, rentalId: Id, method: PaymentMethod, note = '', amountOverride?: Money): DepositRecord {
  need(d, 'finance:record', 'Depozito alma')
  const rental = d.rentals.find((r) => r.id === rentalId)
  if (!rental) fail('Kiralama bulunamadı.')
  const amount = amountOverride ?? rental!.deposit.required
  if (amount.minor <= 0) fail('Depozito tutarı sıfır.')
  if (!d.settings.deposit.allowedMethods.includes(method)) fail('Bu depozito yöntemi şirket politikasında kapalı.')
  if (d.deposits.some((x) => x.rentalId === rentalId && x.state === 'held')) fail('Bu kiralama için zaten tutulan bir depozito var.')
  let drawerId: Id | undefined
  if (method === 'cash') {
    const drawer = findDrawer(d, rental!.pickupBranchId, amount.cur)
    const session = drawer && openSessionOf(d, drawer)
    if (!drawer || !session) fail(`${amount.cur} nakit kasası kapalı veya tanımsız. Depozito için önce Şube Kasaları'ndan kasa açın.`)
    drawerId = drawer!.id
  }
  const dep: DepositRecord = { id: nextId(d, 'dep'), rentalId, amount, method, state: 'held', heldAt: nowOf(d), drawerId, by: meOf(d).id, note }
  d.deposits.push(dep)
  rental!.deposit.state = 'held'
  rental!.deposit.method = method
  if (drawerId) cashMove(d, drawerId, 'in', amount.minor, `Depozito (nakit) ${rental!.no}`, 'deposit', dep.id)
  logEvent(d, { module: 'finance', type: 'DepositHeld', sourceType: 'rental', sourceId: rentalId, summary: `Depozito tutuluyor · ${fmt(amount.minor, amount.cur)} (${method})`, cur: amount.cur, minor: amount.minor })
  addHistory(d, rental!.history, 'Depozito', `${fmt(amount.minor, amount.cur)} tutuldu (${method}). Gelir değildir.`)
  return dep
}

export function releaseDeposit(d: Db, depositId: Id, kind: 'released' | 'applied'): void {
  need(d, 'finance:apply', 'Depozito çözme')
  const dep = d.deposits.find((x) => x.id === depositId)
  if (!dep) fail('Depozito bulunamadı.')
  if (dep!.state !== 'held') fail('Bu depozito zaten çözülmüş.')
  const rental = d.rentals.find((r) => r.id === dep!.rentalId)!
  if (kind === 'applied') {
    const f = rentalFinance(d, rental.id)
    if (f.outstandingMinor <= 0) fail('Mahsup edilecek açık bakiye yok.')
    // Deposit applied to the outstanding charge (same currency only; no hidden conversion).
    if (f.cur !== dep!.amount.cur) fail('Depozito yalnız aynı para birimindeki bakiyeye mahsup edilir.')
    const take = Math.min(dep!.amount.minor, f.outstandingMinor)
    const p: Payment = {
      id: nextId(d, 'pay'),
      no: nextNo(d, 'T'),
      kind: 'payment',
      status: 'applied',
      rentalId: rental.id,
      payer: { type: 'customer', id: rental.customerId, name: 'Depozito mahsubu' },
      method: 'other',
      tender: { minor: take, cur: dep!.amount.cur },
      appliedMinor: take,
      obligationCur: f.cur,
      allocations: allocatePayment(d, rental.id, take, true).allocations,
      branchId: rental.pickupBranchId,
      reference: `Depozito ${dep!.id}`,
      note: 'Depozito, açık bakiyeye mahsup edildi (gelir sayılmaz; kalan iade edilir).',
      recordedBy: meOf(d).id,
      recordedAt: nowOf(d),
    }
    d.payments.push(p)
    dep!.state = 'applied'
    if (dep!.drawerId && take < dep!.amount.minor) cashMove(d, dep!.drawerId, 'out', dep!.amount.minor - take, `Depozito kalanı iadesi ${rental.no}`, 'deposit', dep!.id)
    rental.deposit.state = 'applied'
  } else {
    dep!.state = 'released'
    dep!.releasedAt = nowOf(d)
    if (dep!.drawerId) cashMove(d, dep!.drawerId, 'out', dep!.amount.minor, `Depozito iadesi ${rental.no}`, 'deposit', dep!.id)
    rental.deposit.state = 'released'
  }
  logEvent(d, { module: 'finance', type: kind === 'released' ? 'DepositReleased' : 'DepositApplied', sourceType: 'rental', sourceId: rental.id, summary: `Depozito ${kind === 'released' ? 'iade edildi' : 'mahsup edildi'}`, cur: dep!.amount.cur, minor: dep!.amount.minor })
}

export function requestRefund(d: Db, input: { rentalId?: Id; reservationId?: Id; amount: Money; method: PaymentMethod; reason: string }): RefundRecord {
  need(d, 'finance:record', 'İade talebi')
  if (input.amount.minor <= 0) fail('İade tutarı sıfırdan büyük olmalı.')
  if (input.reason.trim().length < 3) fail('Gerekçe yazın.', { reason: 'Gerekçe zorunlu' })
  const r: RefundRecord = { id: nextId(d, 'rf'), no: nextNo(d, 'I'), rentalId: input.rentalId, reservationId: input.reservationId, amount: input.amount, method: input.method, status: 'requested', reason: input.reason, requestedBy: meOf(d).id, requestedAt: nowOf(d) }
  d.refunds.push(r)
  logEvent(d, { module: 'finance', type: 'RefundRequested', sourceType: input.rentalId ? 'rental' : 'reservation', sourceId: (input.rentalId ?? input.reservationId)!, summary: `${r.no} · ${fmt(input.amount.minor, input.amount.cur)}`, cur: input.amount.cur, minor: input.amount.minor, reason: input.reason })
  return r
}

/** Completing a refund records that it was paid out (outside ACARVO). A cash refund leaves the drawer. */
export function completeRefund(d: Db, refundId: Id): void {
  const r = d.refunds.find((x) => x.id === refundId)
  if (!r) fail('İade bulunamadı.')
  if (r!.status === 'completed') return
  if (r!.status !== 'approved') fail('İade önce Onay Merkezi\'nde onaylanıp uygulanmalı.')
  const branchId = r!.rentalId ? d.rentals.find((x) => x.id === r!.rentalId)!.pickupBranchId : d.reservations.find((x) => x.id === r!.reservationId)!.pickupBranchId
  if (r!.method === 'cash') {
    const drawer = findDrawer(d, branchId, r!.amount.cur)
    const session = drawer && openSessionOf(d, drawer)
    if (!drawer || !session) fail(`${r!.amount.cur} nakit kasası kapalı veya tanımsız; nakit iade yapılamaz.`)
    if (computeCashExpected(d, session!) < r!.amount.minor) fail('Kasada yeterli nakit yok.')
    r!.drawerId = drawer!.id
    cashMove(d, drawer!.id, 'out', r!.amount.minor, `Müşteri iadesi ${r!.no}`, 'refund', r!.id)
  }
  r!.status = 'completed'
  r!.completedAt = nowOf(d)
  logEvent(d, { module: 'finance', type: 'RefundCompleted', sourceType: r!.rentalId ? 'rental' : 'reservation', sourceId: (r!.rentalId ?? r!.reservationId)!, summary: `${r!.no} iade edildi (kayıt)`, cur: r!.amount.cur, minor: r!.amount.minor })
}

// --------------------------------------------------------------------------- cash drawers

export function openSession(d: Db, drawerId: Id, openingMinor: number): void {
  need(d, 'cash:manage', 'Kasa açma')
  const dr = d.drawers.find((x) => x.id === drawerId)
  if (!dr) fail('Kasa bulunamadı.')
  if (dr!.status === 'open') fail('Bu kasanın açık oturumu var.')
  if (openingMinor < 0) fail('Açılış bakiyesi negatif olamaz.', { opening: 'Geçersiz tutar' })
  const sid = nextId(d, 'cs')
  d.cashSessions.push({ id: sid, drawerId, openedAt: nowOf(d), openedBy: meOf(d).id, openingMinor })
  dr!.status = 'open'
  dr!.sessionId = sid
  logEvent(d, { module: 'cash', type: 'CashSessionOpened', sourceType: 'drawer', sourceId: drawerId, summary: `${dr!.name} açıldı · açılış ${fmt(openingMinor, dr!.currency)}`, cur: dr!.currency, minor: openingMinor, branchId: dr!.branchId })
}

export function cashMove(d: Db, drawerId: Id, kind: 'in' | 'out', minor: number, reason: string, sourceType: 'payment' | 'deposit' | 'refund' | 'expense' | 'manual' | 'opening', sourceId?: Id, reversal = false): void {
  const dr = d.drawers.find((x) => x.id === drawerId)
  if (!dr || !dr.sessionId) fail('Kasa kapalı.')
  if (minor <= 0) fail('Tutar sıfırdan büyük olmalı.')
  // The same source posts to the cash ledger once per direction.
  if (sourceId && d.cashMovements.some((m) => m.sourceId === sourceId && m.sourceType === sourceType && m.kind === kind && m.drawerId === drawerId && !reversal && m.reason === reason)) return
  d.cashMovements.push({ id: nextId(d, 'cm'), drawerId, sessionId: dr!.sessionId!, kind, minor, cur: dr!.currency, at: nowOf(d), by: meOf(d).id, reason, sourceType, sourceId })
}

export function manualCashMove(d: Db, drawerId: Id, kind: 'in' | 'out', minor: number, reason: string): void {
  need(d, 'cash:manage', 'Kasa hareketi')
  if (reason.trim().length < 3) fail('Gerekçe yazın.', { reason: 'Gerekçe zorunlu' })
  const dr = d.drawers.find((x) => x.id === drawerId)
  const s = dr && openSessionOf(d, dr)
  if (!dr || !s) fail('Kasa kapalı. Önce oturum açın.')
  if (kind === 'out' && computeCashExpected(d, s!) < minor) fail('Kasada yeterli nakit yok.', { amount: 'Beklenen bakiyeyi aşıyor' })
  cashMove(d, drawerId, kind, minor, reason, 'manual')
  logEvent(d, { module: 'cash', type: 'CashMovement', sourceType: 'drawer', sourceId: drawerId, summary: `${kind === 'in' ? 'Giriş' : 'Çıkış'} · ${reason}`, cur: dr!.currency, minor, branchId: dr!.branchId })
}

export function closeSession(d: Db, drawerId: Id, countedMinor: number, varianceReason: string, handoverTo?: Id, handoverNote?: string): void {
  need(d, 'cash:close', 'Kasa kapanışı')
  const dr = d.drawers.find((x) => x.id === drawerId)
  const s = dr && openSessionOf(d, dr)
  if (!dr || !s) fail('Kasa zaten kapalı.')
  if (countedMinor < 0) fail('Sayılan bakiye negatif olamaz.', { counted: 'Geçersiz tutar' })
  const expected = computeCashExpected(d, s!)
  const variance = countedMinor - expected
  const limit = d.settings.cash.varianceReason[dr!.currency] ?? 0
  if (Math.abs(variance) > limit && varianceReason.trim().length < 5) fail(`Fark ${fmt(variance, dr!.currency)}; eşiği (${fmt(limit, dr!.currency)}) aşıyor. Gerekçe yazın.`, { reason: 'Fark gerekçesi zorunlu' })
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
  logEvent(d, { module: 'cash', type: 'CashSessionClosed', sourceType: 'drawer', sourceId: drawerId, summary: `${dr!.name} kapandı · beklenen ${fmt(expected, dr!.currency)} · sayılan ${fmt(countedMinor, dr!.currency)} · fark ${fmt(variance, dr!.currency)}`, cur: dr!.currency, minor: variance, reason: varianceReason, branchId: dr!.branchId })
}
