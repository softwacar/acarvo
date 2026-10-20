import { B } from '../../i18n'
import { isRateActive } from '../calc/fx'
import { addHistory, fail, hasPerm, logEvent, meOf, need, nextId, nextNo, nowOf, notify, userName } from '../helpers'
import { CURRENCIES, fmt } from '../money'
import { ALWAYS_VISIBLE, NAV_V1, PROFILES, type WorkspaceSettings } from '../modules'
import type { Approval, ApprovalType, Cur, Db, Expense, FxRate, Id, Iso, LinkType, Money, Role, Rule } from '../types'
import { completeRefund, cashMove, findDrawer, requestRefund, voidCharge, voidPayment } from './finance'
import { repriceOf } from './rentals'
import { openSessionOf } from '../calc/finance'
import { snapshotFor } from './rentals'

// Formal approvals (exactly six types), rules (safe notification catalogue only), exceptions, expenses, policy editors
// (the single exchange-rate desk), and administration. Approved ≠ Applied; requester ≠ reviewer.

export const APPROVAL_TYPES: { type: ApprovalType; label: string; target: LinkType[]; needsAmount: boolean; applyHint: string }[] = [
  { type: 'high_discount', label: B('Yüksek İndirim', 'High Discount'), target: ['reservation', 'rental'], needsAmount: false, applyHint: B('Hedef kaydın fiyatına onaylı indirim satırı uygulanır (yeni fiyat sürümü; eskisi geçmişte kalır).', 'An approved discount line is applied to the target record\'s price (a new price version; the old one stays in the history).') },
  { type: 'deposit_exception', label: B('Depozito İstisnası', 'Deposit Exception'), target: ['rental'], needsAmount: true, applyHint: B('Teslim öncesi kiralamanın gerekli depozitosu istenen tutara indirilir.', 'The required deposit of a rental before handover is reduced to the requested amount.') },
  { type: 'refund', label: B('İade', 'Refund'), target: ['rental', 'reservation'], needsAmount: true, applyHint: B('İade tamamlanır; nakit iade ise şube kasasından çıkar.', 'The refund is completed; a cash refund leaves the branch drawer.') },
  { type: 'financial_correction', label: B('Finansal Düzeltme', 'Financial Correction'), target: ['payment', 'rental'], needsAmount: false, applyHint: B('Seçilen ödeme ters kaydedilir (silinmez; geçmiş korunur).', 'The chosen payment is reversed (not deleted; the history is kept).') },
  { type: 'corporate_credit_override', label: B('Kurumsal Kredi İstisnası', 'Corporate Credit Exception'), target: ['corporate'], needsAmount: true, applyHint: B('Kurumsal hesaba, para biriminde ek limit payı tanımlanır.', 'An extra limit allowance in that currency is defined on the corporate account.') },
  { type: 'partner_commission_adjustment', label: B('Partner Komisyon Düzeltmesi', 'Partner Commission Adjustment'), target: ['partner'], needsAmount: true, applyHint: B('Doğmuş komisyon tutarı istenen tutara düzeltilir (ödenmişse ödeme değişmez).', 'The earned commission is corrected to the requested amount (a payment already made does not change).') },
]
export const approvalLabel = (t: ApprovalType) => APPROVAL_TYPES.find((x) => x.type === t)!.label

export interface ApprovalInput {
  type: ApprovalType
  target: { type: LinkType; id: Id }
  reason: string
  requested: Money | null
  proposedPct?: number
  /** Refund of one specific advance payment. */
  paymentId?: Id
}

export function requestApproval(d: Db, input: ApprovalInput): Approval {
  need(d, 'approvals:request', B('Onay talebi', 'Approval request'))
  const def = APPROVAL_TYPES.find((x) => x.type === input.type)!
  const fields: Record<string, string> = {}
  if (input.reason.trim().length < 10) fields.reason = B('Gerekçeyi en az 10 karakterle yazın', 'Write the reason in at least 10 characters')
  if (!def.target.includes(input.target.type)) fields.target = B('Bu onay türü için uygun olmayan hedef', 'Target not suitable for this approval type')
  if (def.needsAmount && (!input.requested || input.requested.minor <= 0)) fields.amount = B('Tutar girin', 'Enter an amount')
  if (input.type === 'high_discount' && !(input.proposedPct && input.proposedPct > 0 && input.proposedPct <= 50)) fields.pct = B('İndirim yüzdesi 1–50 arasında olmalı', 'The discount percent must be between 1 and 50')
  if (Object.keys(fields).length) fail(B('Talep formunda eksik veya geçersiz alanlar var.', 'The request form has missing or invalid fields.'), fields)
  const exists = d.approvals.find((a) => a.type === input.type && a.target.id === input.target.id && (a.status === 'requested' || a.status === 'approved'))
  if (exists) fail(B(`Bu hedef için açık bir ${approvalLabel(input.type)} talebi var (${exists.no}).`, `There is already an open ${approvalLabel(input.type)} request for this target (${exists.no}).`))
  // Source-specific checks so an approval always points at something it can act on.
  if (input.type === 'high_discount') {
    const t = input.target.type === 'reservation' ? d.reservations.find((r) => r.id === input.target.id) : d.rentals.find((r) => r.id === input.target.id)
    if (!t) fail(B('Hedef kayıt bulunamadı.', 'Target record not found.'), { target: B('Hedef bulunamadı', 'Target not found') })
    if (input.target.type === 'rental' && (t as { status: string }).status !== 'prepared') fail(B('Teslim edilmiş kiralamada fiyat indirimi yapılamaz: Finansal Düzeltme kullanın.', 'A price discount cannot be applied to a delivered rental: use a Financial Correction.'))
  }
  if (input.type === 'refund' && input.requested) {
    const src = input.target.type === 'rental' ? d.rentals.find((r) => r.id === input.target.id) : d.reservations.find((r) => r.id === input.target.id)
    if (!src) fail(B('Hedef kayıt bulunamadı.', 'Target record not found.'), { target: B('Hedef bulunamadı', 'Target not found') })
    const adv = input.paymentId ? d.payments.find((x) => x.id === input.paymentId) : undefined
    if (input.paymentId) {
      if (!adv || adv.kind !== 'advance' || adv.reservationId !== input.target.id && adv.rentalId !== input.target.id) fail(B('Kaparo kaydı bu hedefe ait değil.', 'The advance does not belong to this target.'), { amount: B('Kaparo bulunamadı', 'Advance not found') })
      if (adv!.status !== 'recorded') fail(B('Yalnız tutulan (uygulanmamış) kaparo iade edilebilir.', 'Only a held (unapplied) advance can be refunded.'), { amount: B('Kaparo artık tutulmuyor', 'The advance is no longer held') })
      if (input.requested.cur !== adv!.tender.cur || input.requested.minor !== adv!.tender.minor) fail(B(`Kaparo iadesi tahsil edilen tutarın tamamı olmalı: ${fmt(adv!.tender.minor, adv!.tender.cur)}.`, `An advance refund must be the full amount that was taken: ${fmt(adv!.tender.minor, adv!.tender.cur)}.`), { amount: B('Tahsil edilen tutarın tamamı', 'The full amount taken') })
      if (d.refunds.some((x) => x.paymentId === adv!.id && (x.status === 'requested' || x.status === 'approved'))) fail(B('Bu kaparo için açık bir iade talebi var.', 'There is already an open refund request for this advance.'))
    } else if (src!.currency !== input.requested.cur) fail(B(`İade, kaydın para biriminde (${src!.currency}) olmalı; kur dönüşümü yapılmaz.`, `The refund must be in the record's currency (${src!.currency}); no conversion is made.`), { amount: 'Para birimi uyumsuz' })
  }
  const a: Approval = { id: nextId(d, 'ap'), no: nextNo(d, 'ON'), type: input.type, status: 'requested', requesterId: meOf(d).id, target: input.target, reason: input.reason, requested: input.requested, proposedPct: input.proposedPct, paymentId: input.paymentId, createdAt: nowOf(d), history: [] }
  d.approvals.push(a)
  addHistory(d, a.history, B('Talep edildi', 'Requested'), input.reason)
  if (input.type === 'refund' && input.requested) {
    const refund = requestRefund(d, { rentalId: input.target.type === 'rental' ? input.target.id : undefined, reservationId: input.target.type === 'reservation' ? input.target.id : undefined, paymentId: input.paymentId, amount: input.requested, method: input.paymentId && d.payments.find((x) => x.id === input.paymentId)?.method !== 'cash' ? 'transfer' : 'cash', reason: input.reason })
    refund.approvalId = a.id
  }
  logEvent(d, { module: 'approvals', type: 'ApprovalRequested', sourceType: 'approval', sourceId: a.id, summary: `${a.no} · ${approvalLabel(a.type)}`, reason: input.reason, cur: input.requested?.cur, minor: input.requested?.minor })
  for (const u of d.users) if (u.id !== meOf(d).id && hasPerm(d, 'approvals:decide', u)) notify(d, u.id, B(`Onay bekliyor: ${a.no} ${approvalLabel(a.type)}`, `Awaiting approval: ${a.no} ${approvalLabel(a.type)}`), { type: 'approval', id: a.id }, 'approval')
  return a
}

export function decideApproval(d: Db, id: Id, decision: 'approve' | 'reject', note: string): Approval {
  need(d, 'approvals:decide', B('Onay kararı', 'Approval decision'))
  const a = d.approvals.find((x) => x.id === id)
  if (!a) fail(B('Onay bulunamadı.', 'Approval not found.'))
  if (a!.status !== 'requested') fail(B('Bu talep için karar zaten verilmiş.', 'A decision was already made on this request.'))
  // Four eyes: nobody reviews their own request.
  if (a!.requesterId === meOf(d).id) fail(B('Kendi talebinizi onaylayamaz veya reddedemezsiniz (dört göz). Rolü/kullanıcıyı değiştirerek ikinci kişi olarak deneyin.', 'You cannot approve or reject your own request (four eyes). Switch the role/user to act as the second person.'), {}, 'FOUR_EYES')
  if (decision === 'reject' && note.trim().length < 5) fail(B('Ret gerekçesini yazın.', 'Enter the rejection reason.'), { note: B('Ret gerekçesi zorunlu', 'A rejection reason is required') })
  a!.status = decision === 'approve' ? 'approved' : 'rejected'
  a!.reviewerId = meOf(d).id
  a!.decidedAt = nowOf(d)
  a!.decisionNote = note
  addHistory(d, a!.history, decision === 'approve' ? B('Onaylandı', 'Approved') : 'Reddedildi', note || (decision === 'approve' ? B('Onaylandı (henüz uygulanmadı).', 'Approved (not applied yet).') : '—'))
  logEvent(d, { module: 'approvals', type: decision === 'approve' ? 'ApprovalApproved' : 'ApprovalRejected', sourceType: 'approval', sourceId: id, summary: `${a!.no} ${decision === 'approve' ? B('onaylandı (uygulanmadı)', 'approved (not applied)') : 'reddedildi'}`, reason: note, before: 'requested', after: a!.status })
  notify(d, a!.requesterId, `${a!.no} ${decision === 'approve' ? B('onaylandı', 'approved') : 'reddedildi'}`, { type: 'approval', id }, 'approval')
  if (decision === 'reject') {
    const rf = d.refunds.find((r) => r.approvalId === id)
    if (rf) rf.status = 'rejected'
  }
  return a!
}

/** Applies the approved decision to its source exactly once. */
export function applyApproval(d: Db, id: Id): Approval {
  need(d, 'approvals:apply', B('Onayı uygulama', 'Applying an approval'))
  const a = d.approvals.find((x) => x.id === id)
  if (!a) fail(B('Onay bulunamadı.', 'Approval not found.'))
  if (a!.status === 'applied') fail(B('Bu onay zaten uygulanmış (tek seferlik).', 'This approval was already applied (one time only).'))
  if (a!.status !== 'approved') fail(B('Yalnız onaylanmış talep uygulanır. Approved ve Applied farklı adımlardır.', 'Only an approved request can be applied. Approved and Applied are separate steps.'))
  if (a!.requesterId === meOf(d).id) fail(B('Talebi açan kişi uygulayamaz.', 'The requester cannot apply it.'), {}, 'FOUR_EYES')
  const now = nowOf(d)
  switch (a!.type) {
    case 'high_discount': {
      const pct = a!.proposedPct!
      if (a!.target.type === 'reservation') {
        const r = d.reservations.find((x) => x.id === a!.target.id)!
        if (r.status === 'converted' || r.status === 'cancelled') fail(B('Hedef rezervasyon artık indirim alamaz.', 'The target reservation can no longer receive a discount.'))
        r.approvedDiscountPct = pct
        const old = r.price
        r.price = repriceOf(d, r)
        addHistory(d, r.history, B('Onaylı indirim', 'Approved discount'), B(`%${pct} indirim uygulandı (${a!.no}): ${old ? fmt(old.grossMinor, old.cur) : '—'} → ${fmt(r.price.grossMinor, r.price.cur)}.`, `${pct}% discount applied (${a!.no}): ${old ? fmt(old.grossMinor, old.cur) : '—'} → ${fmt(r.price.grossMinor, r.price.cur)}.`))
      } else {
        const r = d.rentals.find((x) => x.id === a!.target.id)!
        if (r.status !== 'prepared') fail(B('Teslim edilmiş kiralamada indirim uygulanamaz.', 'A discount cannot be applied to a delivered rental.'))
        r.approvedDiscountPct = pct
        const old = r.price
        r.price = snapshotFor(d, { classId: r.classId, from: r.plannedPickupAt, to: r.plannedReturnAt, pickupBranchId: r.pickupBranchId, returnBranchId: r.returnBranchId, currency: r.currency, extras: r.extras, insuranceId: r.insuranceId, corporateId: r.corporateId, approvedDiscountPct: pct }, { drivers: r.drivers.map((x) => x.customerId), customerId: r.customerId })
        addHistory(d, r.history, B('Onaylı indirim', 'Approved discount'), B(`%${pct} indirim uygulandı (${a!.no}): ${old ? fmt(old.grossMinor, old.cur) : '—'} → ${fmt(r.price.grossMinor, r.price.cur)}.`, `${pct}% discount applied (${a!.no}): ${old ? fmt(old.grossMinor, old.cur) : '—'} → ${fmt(r.price.grossMinor, r.price.cur)}.`))
      }
      break
    }
    case 'deposit_exception': {
      const r = d.rentals.find((x) => x.id === a!.target.id)!
      if (r.status !== 'prepared') fail(B('Teslim sonrası depozito istisnası uygulanamaz.', 'A deposit exception cannot be applied after handover.'))
      if (a!.requested!.cur !== r.deposit.required.cur) fail(B('Depozito para birimi uyumsuz.', 'The deposit currency does not match.'))
      const before = r.deposit.required
      r.deposit.required = a!.requested!
      if (r.deposit.state === 'none' && a!.requested!.minor > 0) r.deposit.state = 'requested'
      if (a!.requested!.minor === 0) r.deposit.state = 'waived'
      addHistory(d, r.history, B('Depozito istisnası', 'Deposit exception'), B(`${fmt(before.minor, before.cur)} → ${fmt(a!.requested!.minor, a!.requested!.cur)} (${a!.no} uygulandı).`, `${fmt(before.minor, before.cur)} → ${fmt(a!.requested!.minor, a!.requested!.cur)} (${a!.no} applied).`))
      break
    }
    case 'refund': {
      const rf = d.refunds.find((x) => x.approvalId === id)
      if (!rf) fail(B('Bağlı iade kaydı bulunamadı.', 'The linked refund record was not found.'))
      rf!.status = 'approved'
      completeRefund(d, rf!.id)
      break
    }
    case 'financial_correction': {
      const pay = d.payments.find((x) => x.id === a!.target.id)
      if (pay) voidPayment(d, pay.id, B(`Finansal düzeltme ${a!.no}: ${a!.reason}`, `Financial correction ${a!.no}: ${a!.reason}`))
      else {
        const ch = d.charges.find((x) => x.id === a!.target.id)
        if (!ch) fail(B('Düzeltilecek ödeme/kalem bulunamadı.', 'The payment/charge to correct was not found.'))
        voidCharge(d, ch!.id, B(`Finansal düzeltme ${a!.no}: ${a!.reason}`, `Financial correction ${a!.no}: ${a!.reason}`))
      }
      break
    }
    case 'corporate_credit_override': {
      const c = d.corporates.find((x) => x.id === a!.target.id)!
      c.overrides.push({ approvalId: a!.id, cur: a!.requested!.cur, minor: a!.requested!.minor })
      break
    }
    case 'partner_commission_adjustment': {
      const cm = d.commissions.find((x) => x.id === a!.target.id)
      if (!cm) fail(B('Komisyon kaydı bulunamadı.', 'Commission record not found.'))
      cm!.adjustedFrom = cm!.amount.minor
      cm!.amount = { minor: a!.requested!.minor, cur: a!.requested!.cur }
      cm!.status = 'adjusted'
      break
    }
  }
  a!.status = 'applied'
  a!.appliedBy = meOf(d).id
  a!.appliedAt = now
  addHistory(d, a!.history, B('Uygulandı', 'Applied'), APPROVAL_TYPES.find((x) => x.type === a!.type)!.applyHint)
  logEvent(d, { module: 'approvals', type: 'ApprovalApplied', sourceType: 'approval', sourceId: id, summary: B(`${a!.no} uygulandı · ${approvalLabel(a!.type)}`, `${a!.no} applied · ${approvalLabel(a!.type)}`), before: 'approved', after: 'applied', cur: a!.requested?.cur, minor: a!.requested?.minor })
  return a!
}

// --------------------------------------------------------------------------- rules (safe notification / review catalogue)

export const RULE_FIELDS: { field: string; label: string; unit: string }[] = [
  { field: 'rental.overdueHours', label: B('Kiralama iade gecikmesi', 'Rental return delay'), unit: B('saat', 'hours') },
  { field: 'reservation.pendingHours', label: B('Bekleyen rezervasyon yaşı', 'Pending reservation age'), unit: B('saat', 'hours') },
  { field: 'rental.outstandingMinor', label: B('Kiralama açık bakiyesi', 'Rental open balance'), unit: 'minor (para biriminde)' },
  { field: 'vehicle.serviceKmOver', label: B('Periyodik bakım aşımı', 'Periodic service overrun'), unit: 'km' },
  { field: 'customer.docDaysLeft', label: B('Müşteri belgesi kalan gün', 'Customer document days left'), unit: B('gün', 'days') },
  { field: 'vehicle.docDaysLeft', label: B('Araç belgesi kalan gün', 'Vehicle document days left'), unit: B('gün', 'days') },
  { field: 'cash.varianceMinor', label: B('Kasa farkı (mutlak)', 'Cash variance (absolute)'), unit: 'minor' },
]

export function saveRule(d: Db, input: { id?: Id; name: string; conditions: Rule['conditions']; join: Rule['join']; action: Rule['action']; severity: Rule['severity']; message: string; status: Rule['status'] }): Rule {
  need(d, 'rules:manage', B('Kural düzenleme', 'Editing a rule'))
  if (input.name.trim().length < 3) fail(B('Kural adı yazın.', 'Enter a rule name.'), { name: B('Ad zorunlu', 'A name is required') })
  if (!input.conditions.length) fail(B('En az bir koşul ekleyin.', 'Add at least one condition.'), { conditions: B('Koşul gerekli', 'A condition is required') })
  if (input.conditions.some((c) => !RULE_FIELDS.some((f) => f.field === c.field))) fail(B('Kural yalnız güvenli bildirim/inceleme alanlarını kullanabilir (vergi, kur, fiyat, depozito politikaları buradan değiştirilemez).', 'A rule may use only safe notification/review fields (tax, rate, price and deposit policies cannot be changed from here).'))
  if (input.message.trim().length < 5) fail(B('Uyarı mesajını yazın.', 'Enter the alert message.'), { message: B('Mesaj zorunlu', 'A message is required') })
  let r = input.id ? d.rules.find((x) => x.id === input.id) : undefined
  if (r) {
    r.versions.push({ version: r.version, at: nowOf(d), by: meOf(d).id, summary: B(`v${r.version}: ${r.conditions.length} koşul · ${r.status}`, `v${r.version}: ${r.conditions.length} condition(s) · ${r.status}`) })
    Object.assign(r, { name: input.name, conditions: input.conditions, join: input.join, action: input.action, severity: input.severity, message: input.message, status: input.status, version: r.version + 1 })
  } else {
    r = { id: nextId(d, 'ru'), name: input.name, status: input.status, version: 1, conditions: input.conditions, join: input.join, action: input.action, severity: input.severity, message: input.message, versions: [] }
    d.rules.push(r)
  }
  logEvent(d, { module: 'rules', type: 'RuleSaved', sourceType: 'rule', sourceId: r.id, summary: `${r.name} v${r.version} (${r.status})` })
  return r
}
export function setRuleStatus(d: Db, id: Id, status: Rule['status']): void {
  need(d, 'rules:manage', 'Kural durumu')
  const r = d.rules.find((x) => x.id === id)
  if (!r) fail(B('Kural bulunamadı.', 'Rule not found.'))
  r!.versions.push({ version: r!.version, at: nowOf(d), by: meOf(d).id, summary: `${r!.status} → ${status}` })
  r!.status = status
  r!.version += 1
}

// --------------------------------------------------------------------------- exceptions

export function createException(d: Db, source: { type: LinkType; id: Id }, title: string, severity: 'low' | 'medium' | 'high'): void {
  need(d, 'risks:manage', B('İstisna kaydı', 'Exception record'))
  if (title.trim().length < 5) fail(B('İstisna başlığını yazın.', 'Enter the exception title.'), { title: B('Başlık zorunlu', 'A title is required') })
  d.exceptions.push({ id: nextId(d, 'xc'), no: nextNo(d, 'IS'), source, title, severity, status: 'open', createdAt: nowOf(d) })
}
export function reviewException(d: Db, id: Id, status: 'reviewed' | 'accepted' | 'rejected', decision: string): void {
  need(d, 'risks:manage', B('İstisna incelemesi', 'Exception review'))
  const x = d.exceptions.find((e) => e.id === id)
  if (!x) fail(B('İstisna bulunamadı.', 'Exception not found.'))
  if (decision.trim().length < 5) fail(B('Karar gerekçesini yazın.', 'Enter the reasoning for the decision.'), { decision: B('Gerekçe zorunlu', 'A reason is required') })
  x!.status = status
  x!.decision = decision
  x!.reviewerId = meOf(d).id
  // The decision is a review record; the source action (e.g. closing, charging) is still done on the source itself.
  logEvent(d, { module: 'risks', type: 'ExceptionReviewed', sourceType: 'exception', sourceId: id, summary: `${x!.no} → ${status}`, reason: decision })
}

// --------------------------------------------------------------------------- expenses

export const EXPENSE_CATEGORIES = ['Bakım ve servis', 'Yakıt', 'Temizlik', 'Sigorta primi', 'Kira ve işletme', 'Personel dışı genel gider', 'Ceza (otorite ödemesi)', 'Yol yardım / çekici', 'Diğer']

export function createExpense(d: Db, input: { category: string; vendor: string; branchId: Id; date: string; amount: Money; note: string; post: boolean; cashDrawerId?: Id; link?: Expense['link']; vehicleId?: Id }): Expense {
  need(d, 'expenses:manage', B('Masraf kaydı', 'Expense record'))
  const fields: Record<string, string> = {}
  if (!input.vendor.trim()) fields.vendor = B('Tedarikçi / alıcı yazın', 'Enter the vendor / payee')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fields.date = B('Tarih girin', 'Enter a date')
  if (input.amount.minor <= 0) fields.amount = B('Tutar sıfırdan büyük olmalı', 'The amount must be greater than zero')
  if (/iade|depozito|komisyon/i.test(input.category)) fields.category = B('İade, depozito ve komisyon masraf türü değildir', 'Refunds, deposits and commissions are not expense types')
  if (Object.keys(fields).length) fail(B('Formda eksik veya geçersiz alanlar var.', 'The form has missing or invalid fields.'), fields)
  const e: Expense = { id: nextId(d, 'ex'), no: nextNo(d, 'G'), category: input.category, vendor: input.vendor, branchId: input.branchId, date: input.date, amount: input.amount, status: input.post ? 'posted' : 'draft', link: input.vehicleId ? 'vehicle' : (input.link ?? 'branch'), vehicleId: input.vehicleId, note: input.note, createdBy: meOf(d).id }
  d.expenses.push(e)
  if (input.post && input.cashDrawerId) {
    const dr = d.drawers.find((x) => x.id === input.cashDrawerId)
    const s = dr && openSessionOf(d, dr)
    if (!dr || !s) fail(B('Kasa kapalı; nakit masraf çıkışı yapılamaz.', 'The drawer is closed; a cash expense outflow is not possible.'))
    if (dr!.currency !== input.amount.cur) fail(B('Kasa para birimi masraf para biriminden farklı.', 'The drawer currency differs from the expense currency.'))
    cashMove(d, dr!.id, 'out', input.amount.minor, B(`Masraf ${e.no}`, `Expense ${e.no}`), 'expense', e.id)
  }
  logEvent(d, { module: 'expenses', type: 'ExpenseCreated', sourceType: 'expense', sourceId: e.id, summary: `${e.no} · ${input.vendor}`, cur: input.amount.cur, minor: input.amount.minor })
  return e
}
export function postExpense(d: Db, id: Id): void {
  need(d, 'expenses:manage', B('Masraf kaydı', 'Expense record'))
  const e = d.expenses.find((x) => x.id === id)
  if (!e || e.status !== 'draft') fail(B('Yalnız taslak masraf kaydedilir.', 'Only a draft expense can be posted.'))
  e!.status = 'posted'
  logEvent(d, { module: 'expenses', type: 'ExpensePosted', sourceType: 'expense', sourceId: id, summary: `${e!.no} kaydedildi` })
}
export function voidExpense(d: Db, id: Id, reason: string): void {
  need(d, 'expenses:manage', B('Masraf iptali', 'Voiding an expense'))
  const e = d.expenses.find((x) => x.id === id)
  if (!e || e.status === 'voided') fail(B('Masraf iptal edilemez.', 'This expense cannot be voided.'))
  if (e!.sourceType) fail(B('Kaynağa bağlı masraf buradan iptal edilmez: kaynak kaydı (bakım, ceza) düzeltilir.', 'A source-linked expense is not voided here: correct the source record (maintenance, fine).'))
  if (reason.trim().length < 3) fail(B('İptal gerekçesi yazın.', 'Enter a reason for the cancellation.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  e!.status = 'voided'
  e!.voidReason = reason
  logEvent(d, { module: 'expenses', type: 'ExpenseVoided', sourceType: 'expense', sourceId: id, summary: `${e!.no} iptal`, reason })
}

// --------------------------------------------------------------------------- exchange-rate desk (the single editor)

export interface FxInput {
  base: Cur
  quote: Cur
  rate: number
  purpose: FxRate['purpose']
  scope: 'company' | Id
  validFrom: Iso
  validUntil: Iso | null
  autoInverse: boolean
  note: string
}

export function addFxRate(d: Db, input: FxInput): FxRate {
  need(d, 'settings:fx', B('Döviz kuru tanımlama', 'Defining an exchange rate'))
  const fields: Record<string, string> = {}
  if (!CURRENCIES.some((c) => c.code === input.base)) fields.base = B('Geçersiz para birimi', 'Invalid currency')
  if (!CURRENCIES.some((c) => c.code === input.quote)) fields.quote = B('Geçersiz para birimi', 'Invalid currency')
  if (input.base === input.quote) fields.quote = B('Aynı para birimi için kur tanımlanamaz', 'A rate cannot be defined for the same currency')
  if (!Number.isFinite(input.rate) || input.rate <= 0) fields.rate = B('Kur sıfırdan büyük, sonlu bir sayı olmalı', 'The rate must be a finite number greater than zero')
  if (input.validUntil && Date.parse(input.validUntil) <= Date.parse(input.validFrom)) fields.validUntil = B('Bitiş, başlangıçtan sonra olmalı', 'The end must be after the start')
  if (input.note.trim().length < 3) fields.note = B('Açıklama yazın', 'Enter a note')
  if (Object.keys(fields).length) fail(B('Kur formunda eksik veya geçersiz alanlar var.', 'The rate form has missing or invalid fields.'), fields)
  const start = Date.parse(input.validFrom)
  const clash = d.fxRates.find((r) => r.base === input.base && r.quote === input.quote && r.purpose === input.purpose && r.scope === input.scope && (r.validUntil === null || Date.parse(r.validUntil) > start) && (input.validUntil === null || Date.parse(input.validUntil) > Date.parse(r.validFrom)))
  if (clash) fail(B(`Aynı kapsamda bu çift için geçerli bir kur zaten var (1 ${clash.base} = ${clash.rate} ${clash.quote}). Önce onu sonlandırın: iki eş geçerli kur yapılandırma hatasıdır.`, `A valid rate already exists for this pair in the same scope (1 ${clash.base} = ${clash.rate} ${clash.quote}). End it first: two equally valid rates are a configuration error.`), { rate: B('Çakışan kur', 'Conflicting rate') }, 'RATE_CONFLICT')
  const r: FxRate = { id: nextId(d, 'fx'), ...input, enteredBy: meOf(d).id, enteredAt: nowOf(d) }
  d.fxRates.push(r)
  logEvent(d, { module: 'settings', type: 'FxRateSet', sourceType: 'fx', sourceId: r.id, summary: B(`Kur: 1 ${r.base} = ${r.rate} ${r.quote} (${r.purpose}${r.scope === 'company' ? '' : B(', şube', ', branch')}) — yeni işlemlerde kullanılır, eski tahsilatlar değişmez`, `Rate: 1 ${r.base} = ${r.rate} ${r.quote} (${r.purpose}${r.scope === 'company' ? '' : B(', şube', ', branch')}) — used for new transactions; earlier collections do not change`), reason: r.note, after: String(r.rate) })
  return r
}
export function endFxRate(d: Db, id: Id): void {
  need(d, 'settings:fx', B('Kur sonlandırma', 'Ending a rate'))
  const r = d.fxRates.find((x) => x.id === id)
  if (!r || !isRateActive(r, nowOf(d))) fail(B('Bu kur şu an geçerli değil.', 'This rate is not valid right now.'))
  r!.validUntil = nowOf(d)
  logEvent(d, { module: 'settings', type: 'FxRateEnded', sourceType: 'fx', sourceId: id, summary: B(`Kur sonlandırıldı: 1 ${r!.base} = ${r!.rate} ${r!.quote}`, `Rate ended: 1 ${r!.base} = ${r!.rate} ${r!.quote}`) })
}

// --------------------------------------------------------------------------- policy and pricing editors (versioned; snapshots are never rewritten)

export function savePricing(d: Db, summary: string, mutate: (d: Db) => void): void {
  need(d, 'pricing:manage', B('Fiyat düzenleme', 'Editing prices'))
  mutate(d)
  d.priceRevisions.push({ id: nextId(d, 'rev'), at: nowOf(d), by: meOf(d).id, summary })
  logEvent(d, { module: 'pricing', type: 'PriceRevision', sourceType: 'pricing', sourceId: d.priceRevisions[d.priceRevisions.length - 1]!.id, summary: B(`Fiyat revizyonu: ${summary}. Mevcut teklif/rezervasyon/kiralama fiyatları değişmez.`, `Price revision: ${summary}. Existing quote/reservation/rental prices do not change.`) })
}
export function saveSettings(d: Db, summary: string, mutate: (d: Db) => void): void {
  need(d, 'settings:manage', B('Ayar düzenleme', 'Editing settings'))
  mutate(d)
  logEvent(d, { module: 'settings', type: 'SettingsChanged', sourceType: 'settings', sourceId: 'settings', summary: B(`Ayar: ${summary}. Gelecekteki işlemleri etkiler; geçmiş snapshot'lar değişmez.`, `Setting: ${summary}. It affects future transactions; past snapshots do not change.`) })
}

// --------------------------------------------------------------------------- administration

export function updateBranch(d: Db, id: Id, patch: { name?: string; phone?: string; address?: string; active?: boolean }): void {
  need(d, 'branches:manage', B('Şube düzenleme', 'Editing a branch'))
  const b = d.branches.find((x) => x.id === id)
  if (!b) fail(B('Şube bulunamadı.', 'Branch not found.'))
  if (patch.active === false && d.rentals.some((r) => (r.pickupBranchId === id || r.returnBranchId === id) && (r.status === 'prepared' || r.status === 'delivered'))) fail(B('Aktif kiralaması olan şube pasif yapılamaz.', 'A branch with active rentals cannot be deactivated.'))
  Object.assign(b!, patch)
  logEvent(d, { module: 'branches', type: 'BranchUpdated', sourceType: 'branch', sourceId: id, summary: B(`${b!.name} güncellendi`, `${b!.name} updated`) })
}

export function inviteUser(d: Db, input: { name: string; email: string; roleId: Id; branchIds: Id[]; title: string }): void {
  need(d, 'users:manage', B('Kullanıcı daveti', 'Inviting a user'))
  if (input.name.trim().length < 3) fail(B('Ad soyad girin.', 'Enter a full name.'), { name: B('Ad zorunlu', 'A name is required') })
  if (!/^\S+@\S+\.\S+$/.test(input.email)) fail(B('Geçerli bir e-posta girin.', 'Enter a valid email.'), { email: B('Geçersiz e-posta', 'Invalid email') })
  if (d.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) fail(B('Bu e-posta zaten kayıtlı.', 'This email is already registered.'), { email: B('Mükerrer e-posta', 'Duplicate email') })
  d.users.push({ id: nextId(d, 'u'), ...input, status: 'invited', grant: [], deny: [] })
  // Nothing is sent: the invitation is a demo record, not an e-mail.
  logEvent(d, { module: 'users', type: 'UserInvited', sourceType: 'user', sourceId: d.users[d.users.length - 1]!.id, summary: B(`${input.email} için davet kaydı (demo; e-posta gönderilmedi)`, `Invitation record for ${input.email} (demo; no email was sent)`) })
}
export function updateUser(d: Db, id: Id, patch: { roleId?: Id; branchIds?: Id[]; status?: 'active' | 'inactive' | 'invited'; grant?: string[]; deny?: string[]; title?: string }): void {
  need(d, 'users:manage', B('Kullanıcı düzenleme', 'Editing a user'))
  const u = d.users.find((x) => x.id === id)
  if (!u) fail(B('Kullanıcı bulunamadı.', 'User not found.'))
  const owners = d.users.filter((x) => x.roleId === 'role-owner' && x.status === 'active')
  if (u!.roleId === 'role-owner' && owners.length === 1 && ((patch.roleId && patch.roleId !== 'role-owner') || patch.status === 'inactive')) fail(B('Son aktif Sahip kullanıcı pasifleştirilemez veya rolü değiştirilemez.', 'The last active Owner cannot be deactivated or have their role changed.'))
  Object.assign(u!, patch)
  logEvent(d, { module: 'users', type: 'UserUpdated', sourceType: 'user', sourceId: id, summary: B(`${u!.name} güncellendi`, `${u!.name} updated`) })
}

export function saveRole(d: Db, input: { id?: Id; name: string; description: string; perms: string[] }): Role {
  need(d, 'roles:manage', B('Rol düzenleme', 'Editing a role'))
  if (input.name.trim().length < 3) fail(B('Rol adı yazın.', 'Enter a role name.'), { name: B('Ad zorunlu', 'A name is required') })
  let r = input.id ? d.roles.find((x) => x.id === input.id) : undefined
  if (r) {
    if (r.system && r.id === 'role-owner') fail(B('Sahip rolü değiştirilemez.', 'The Owner role cannot be changed.'))
    r.name = input.name
    r.description = input.description
    r.perms = input.perms
  } else {
    if (d.roles.some((x) => x.name.toLowerCase() === input.name.trim().toLowerCase())) fail(B('Bu adla bir rol var.', 'A role with this name already exists.'), { name: B('Mükerrer ad', 'Duplicate name') })
    r = { id: nextId(d, 'role'), name: input.name.trim(), description: input.description, system: false, perms: input.perms }
    d.roles.push(r)
  }
  logEvent(d, { module: 'roles', type: 'RoleSaved', sourceType: 'role', sourceId: r.id, summary: `${r.name} · ${r.perms.length} izin` })
  return r
}

// --------------------------------------------------------------------------- demo session controls (not business records)

export function switchUser(d: Db, userId: Id): void {
  const u = d.users.find((x) => x.id === userId)
  if (!u || u.status !== 'active') fail(B('Bu kullanıcı etkin değil.', 'This user is not active.'))
  d.session.userId = userId
  if (d.session.branchId !== 'all' && u!.branchIds.length && !u!.branchIds.includes(d.session.branchId)) d.session.branchId = 'all'
}
export function setBranchFilter(d: Db, branchId: Id | 'all'): void {
  d.session.branchId = branchId
}
export function setClock(d: Db, now: Iso): void {
  d.clock.now = now
}
export function setLanguage(d: Db, lang: 'tr' | 'en'): void {
  d.session.lang = lang
}
/** Working profile and optional per-link switches: visibility only, never a permission or data change. */
export function setWorkspace(d: Db, patch: { profile: WorkspaceSettings['profile']; hidden: string[]; shown: string[] }): void {
  need(d, 'settings:manage', B('Çalışma profili', 'Working profile'))
  if (!PROFILES.includes(patch.profile)) fail(B('Geçersiz çalışma profili.', 'Invalid working profile.'))
  const known = new Set(NAV_V1.map((n) => n.slug))
  if ([...patch.hidden, ...patch.shown].some((s) => !known.has(s))) fail(B('Bilinmeyen menü bağlantısı.', 'Unknown menu link.'))
  const locked = patch.hidden.filter((s) => ALWAYS_VISIBLE.has(s))
  if (locked.length) fail(B('Bu bağlantılar günlük işi kilitleyeceği için gizlenemez: Ana Ekran, İşlerim, Rezervasyonlar, Kiralamalar, Takvim, Görevler, Araçlar, Müşteriler, Finans, Ayarlar.', 'These links cannot be hidden because they would lock the daily work: Home, My Work, Reservations, Rentals, Calendar, Tasks, Vehicles, Customers, Finance, Settings.'))
  const before = d.settings.workspace
  d.settings.workspace = { profile: patch.profile, hidden: [...patch.hidden], shown: [...patch.shown] }
  logEvent(d, { module: 'settings', type: 'WorkspaceChanged', sourceType: 'settings', sourceId: 'workspace', summary: B(`Çalışma profili: ${before.profile} → ${patch.profile}. Yalnız menü görünürlüğü değişti; yetki ve veri değişmedi.`, `Working profile: ${before.profile} → ${patch.profile}. Only menu visibility changed; permissions and data did not.`), before: before.profile, after: patch.profile })
}
export function setConceptPreview(d: Db, on: boolean): void {
  need(d, 'preview:use', B('Gelişmiş konsept ön izlemesi', 'Advanced concept preview'))
  d.session.preview = on
}
export function markNotificationsRead(d: Db): void {
  for (const n of d.notifications) if (!n.userId || n.userId === meOf(d).id) n.read = true
}
export { findDrawer, userName }

// --------------------------------------------------------------------------- platform console (tenant metadata only)

/** The platform console changes tenant status and plan. It never reads or writes a tenant's business records. */
export function setTenantStatus(d: Db, id: Id, status: 'active' | 'trial' | 'suspended'): void {
  const t = d.tenants.find((x) => x.id === id)
  if (!t) fail(B('Şirket bulunamadı.', 'Company not found.'))
  if (t!.id === d.tenants[0]!.id && status === 'suspended') fail(B('Demo şirketi askıya alınamaz: bu demo onun üzerinde çalışır.', 'The demo company cannot be suspended: this demo runs on it.'))
  t!.status = status
}
export function setTenantPlan(d: Db, id: Id, plan: 'starter' | 'professional' | 'enterprise'): void {
  const t = d.tenants.find((x) => x.id === id)
  if (!t) fail(B('Şirket bulunamadı.', 'Company not found.'))
  t!.plan = plan
}
