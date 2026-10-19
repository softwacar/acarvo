import { isRateActive } from '../calc/fx'
import { addHistory, fail, hasPerm, logEvent, meOf, need, nextId, nextNo, nowOf, notify, userName } from '../helpers'
import { CURRENCIES, fmt } from '../money'
import type { Approval, ApprovalType, Cur, Db, Expense, FxRate, Id, Iso, LinkType, Money, Role, Rule } from '../types'
import { completeRefund, cashMove, findDrawer, requestRefund, voidCharge, voidPayment } from './finance'
import { repriceOf } from './rentals'
import { openSessionOf } from '../calc/finance'
import { snapshotFor } from './rentals'

// Formal approvals (exactly six types), rules (safe notification catalogue only), exceptions, expenses, policy editors
// (the single exchange-rate desk), and administration. Approved ≠ Applied; requester ≠ reviewer.

export const APPROVAL_TYPES: { type: ApprovalType; label: string; target: LinkType[]; needsAmount: boolean; applyHint: string }[] = [
  { type: 'high_discount', label: 'Yüksek İndirim', target: ['reservation', 'rental'], needsAmount: false, applyHint: 'Hedef kaydın fiyatına onaylı indirim satırı uygulanır (yeni fiyat sürümü; eskisi geçmişte kalır).' },
  { type: 'deposit_exception', label: 'Depozito İstisnası', target: ['rental'], needsAmount: true, applyHint: 'Teslim öncesi kiralamanın gerekli depozitosu istenen tutara indirilir.' },
  { type: 'refund', label: 'İade', target: ['rental', 'reservation'], needsAmount: true, applyHint: 'İade tamamlanır; nakit iade ise şube kasasından çıkar.' },
  { type: 'financial_correction', label: 'Finansal Düzeltme', target: ['payment', 'rental'], needsAmount: false, applyHint: 'Seçilen ödeme ters kaydedilir (silinmez; geçmiş korunur).' },
  { type: 'corporate_credit_override', label: 'Kurumsal Kredi İstisnası', target: ['corporate'], needsAmount: true, applyHint: 'Kurumsal hesaba, para biriminde ek limit payı tanımlanır.' },
  { type: 'partner_commission_adjustment', label: 'Partner Komisyon Düzeltmesi', target: ['partner'], needsAmount: true, applyHint: 'Doğmuş komisyon tutarı istenen tutara düzeltilir (ödenmişse ödeme değişmez).' },
]
export const approvalLabel = (t: ApprovalType) => APPROVAL_TYPES.find((x) => x.type === t)!.label

export interface ApprovalInput {
  type: ApprovalType
  target: { type: LinkType; id: Id }
  reason: string
  requested: Money | null
  proposedPct?: number
}

export function requestApproval(d: Db, input: ApprovalInput): Approval {
  need(d, 'approvals:request', 'Onay talebi')
  const def = APPROVAL_TYPES.find((x) => x.type === input.type)!
  const fields: Record<string, string> = {}
  if (input.reason.trim().length < 10) fields.reason = 'Gerekçeyi en az 10 karakterle yazın'
  if (!def.target.includes(input.target.type)) fields.target = 'Bu onay türü için uygun olmayan hedef'
  if (def.needsAmount && (!input.requested || input.requested.minor <= 0)) fields.amount = 'Tutar girin'
  if (input.type === 'high_discount' && !(input.proposedPct && input.proposedPct > 0 && input.proposedPct <= 50)) fields.pct = 'İndirim yüzdesi 1–50 arasında olmalı'
  if (Object.keys(fields).length) fail('Talep formunda eksik veya geçersiz alanlar var.', fields)
  const exists = d.approvals.find((a) => a.type === input.type && a.target.id === input.target.id && (a.status === 'requested' || a.status === 'approved'))
  if (exists) fail(`Bu hedef için açık bir ${approvalLabel(input.type)} talebi var (${exists.no}).`)
  // Source-specific checks so an approval always points at something it can act on.
  if (input.type === 'high_discount') {
    const t = input.target.type === 'reservation' ? d.reservations.find((r) => r.id === input.target.id) : d.rentals.find((r) => r.id === input.target.id)
    if (!t) fail('Hedef kayıt bulunamadı.', { target: 'Hedef bulunamadı' })
    if (input.target.type === 'rental' && (t as { status: string }).status !== 'prepared') fail('Teslim edilmiş kiralamada fiyat indirimi yapılamaz: Finansal Düzeltme kullanın.')
  }
  if (input.type === 'refund' && input.requested) {
    const src = input.target.type === 'rental' ? d.rentals.find((r) => r.id === input.target.id) : d.reservations.find((r) => r.id === input.target.id)
    if (!src) fail('Hedef kayıt bulunamadı.', { target: 'Hedef bulunamadı' })
    if (src!.currency !== input.requested.cur) fail(`İade, kaydın para biriminde (${src!.currency}) olmalı; kur dönüşümü yapılmaz.`, { amount: 'Para birimi uyumsuz' })
  }
  const a: Approval = { id: nextId(d, 'ap'), no: nextNo(d, 'ON'), type: input.type, status: 'requested', requesterId: meOf(d).id, target: input.target, reason: input.reason, requested: input.requested, proposedPct: input.proposedPct, createdAt: nowOf(d), history: [] }
  d.approvals.push(a)
  addHistory(d, a.history, 'Talep edildi', input.reason)
  if (input.type === 'refund' && input.requested) {
    const refund = requestRefund(d, { rentalId: input.target.type === 'rental' ? input.target.id : undefined, reservationId: input.target.type === 'reservation' ? input.target.id : undefined, amount: input.requested, method: 'cash', reason: input.reason })
    refund.approvalId = a.id
  }
  logEvent(d, { module: 'approvals', type: 'ApprovalRequested', sourceType: 'approval', sourceId: a.id, summary: `${a.no} · ${approvalLabel(a.type)}`, reason: input.reason, cur: input.requested?.cur, minor: input.requested?.minor })
  for (const u of d.users) if (u.id !== meOf(d).id && hasPerm(d, 'approvals:decide', u)) notify(d, u.id, `Onay bekliyor: ${a.no} ${approvalLabel(a.type)}`, { type: 'approval', id: a.id }, 'approval')
  return a
}

export function decideApproval(d: Db, id: Id, decision: 'approve' | 'reject', note: string): Approval {
  need(d, 'approvals:decide', 'Onay kararı')
  const a = d.approvals.find((x) => x.id === id)
  if (!a) fail('Onay bulunamadı.')
  if (a!.status !== 'requested') fail('Bu talep için karar zaten verilmiş.')
  // Four eyes: nobody reviews their own request.
  if (a!.requesterId === meOf(d).id) fail('Kendi talebinizi onaylayamaz veya reddedemezsiniz (dört göz). Rolü/kullanıcıyı değiştirerek ikinci kişi olarak deneyin.', {}, 'FOUR_EYES')
  if (decision === 'reject' && note.trim().length < 5) fail('Ret gerekçesini yazın.', { note: 'Ret gerekçesi zorunlu' })
  a!.status = decision === 'approve' ? 'approved' : 'rejected'
  a!.reviewerId = meOf(d).id
  a!.decidedAt = nowOf(d)
  a!.decisionNote = note
  addHistory(d, a!.history, decision === 'approve' ? 'Onaylandı' : 'Reddedildi', note || (decision === 'approve' ? 'Onaylandı (henüz uygulanmadı).' : '—'))
  logEvent(d, { module: 'approvals', type: decision === 'approve' ? 'ApprovalApproved' : 'ApprovalRejected', sourceType: 'approval', sourceId: id, summary: `${a!.no} ${decision === 'approve' ? 'onaylandı (uygulanmadı)' : 'reddedildi'}`, reason: note, before: 'requested', after: a!.status })
  notify(d, a!.requesterId, `${a!.no} ${decision === 'approve' ? 'onaylandı' : 'reddedildi'}`, { type: 'approval', id }, 'approval')
  if (decision === 'reject') {
    const rf = d.refunds.find((r) => r.approvalId === id)
    if (rf) rf.status = 'rejected'
  }
  return a!
}

/** Applies the approved decision to its source exactly once. */
export function applyApproval(d: Db, id: Id): Approval {
  need(d, 'approvals:apply', 'Onayı uygulama')
  const a = d.approvals.find((x) => x.id === id)
  if (!a) fail('Onay bulunamadı.')
  if (a!.status === 'applied') fail('Bu onay zaten uygulanmış (tek seferlik).')
  if (a!.status !== 'approved') fail('Yalnız onaylanmış talep uygulanır. Approved ve Applied farklı adımlardır.')
  if (a!.requesterId === meOf(d).id) fail('Talebi açan kişi uygulayamaz.', {}, 'FOUR_EYES')
  const now = nowOf(d)
  switch (a!.type) {
    case 'high_discount': {
      const pct = a!.proposedPct!
      if (a!.target.type === 'reservation') {
        const r = d.reservations.find((x) => x.id === a!.target.id)!
        if (r.status === 'converted' || r.status === 'cancelled') fail('Hedef rezervasyon artık indirim alamaz.')
        r.approvedDiscountPct = pct
        const old = r.price
        r.price = repriceOf(d, r)
        addHistory(d, r.history, 'Onaylı indirim', `%${pct} indirim uygulandı (${a!.no}): ${old ? fmt(old.grossMinor, old.cur) : '—'} → ${fmt(r.price.grossMinor, r.price.cur)}.`)
      } else {
        const r = d.rentals.find((x) => x.id === a!.target.id)!
        if (r.status !== 'prepared') fail('Teslim edilmiş kiralamada indirim uygulanamaz.')
        r.approvedDiscountPct = pct
        const old = r.price
        r.price = snapshotFor(d, { classId: r.classId, from: r.plannedPickupAt, to: r.plannedReturnAt, pickupBranchId: r.pickupBranchId, returnBranchId: r.returnBranchId, currency: r.currency, extras: r.extras, insuranceId: r.insuranceId, corporateId: r.corporateId, approvedDiscountPct: pct }, { drivers: r.drivers.map((x) => x.customerId), customerId: r.customerId })
        addHistory(d, r.history, 'Onaylı indirim', `%${pct} indirim uygulandı (${a!.no}): ${old ? fmt(old.grossMinor, old.cur) : '—'} → ${fmt(r.price.grossMinor, r.price.cur)}.`)
      }
      break
    }
    case 'deposit_exception': {
      const r = d.rentals.find((x) => x.id === a!.target.id)!
      if (r.status !== 'prepared') fail('Teslim sonrası depozito istisnası uygulanamaz.')
      if (a!.requested!.cur !== r.deposit.required.cur) fail('Depozito para birimi uyumsuz.')
      const before = r.deposit.required
      r.deposit.required = a!.requested!
      if (r.deposit.state === 'none' && a!.requested!.minor > 0) r.deposit.state = 'requested'
      if (a!.requested!.minor === 0) r.deposit.state = 'waived'
      addHistory(d, r.history, 'Depozito istisnası', `${fmt(before.minor, before.cur)} → ${fmt(a!.requested!.minor, a!.requested!.cur)} (${a!.no} uygulandı).`)
      break
    }
    case 'refund': {
      const rf = d.refunds.find((x) => x.approvalId === id)
      if (!rf) fail('Bağlı iade kaydı bulunamadı.')
      rf!.status = 'approved'
      completeRefund(d, rf!.id)
      break
    }
    case 'financial_correction': {
      const pay = d.payments.find((x) => x.id === a!.target.id)
      if (pay) voidPayment(d, pay.id, `Finansal düzeltme ${a!.no}: ${a!.reason}`)
      else {
        const ch = d.charges.find((x) => x.id === a!.target.id)
        if (!ch) fail('Düzeltilecek ödeme/kalem bulunamadı.')
        voidCharge(d, ch!.id, `Finansal düzeltme ${a!.no}: ${a!.reason}`)
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
      if (!cm) fail('Komisyon kaydı bulunamadı.')
      cm!.adjustedFrom = cm!.amount.minor
      cm!.amount = { minor: a!.requested!.minor, cur: a!.requested!.cur }
      cm!.status = 'adjusted'
      break
    }
  }
  a!.status = 'applied'
  a!.appliedBy = meOf(d).id
  a!.appliedAt = now
  addHistory(d, a!.history, 'Uygulandı', APPROVAL_TYPES.find((x) => x.type === a!.type)!.applyHint)
  logEvent(d, { module: 'approvals', type: 'ApprovalApplied', sourceType: 'approval', sourceId: id, summary: `${a!.no} uygulandı · ${approvalLabel(a!.type)}`, before: 'approved', after: 'applied', cur: a!.requested?.cur, minor: a!.requested?.minor })
  return a!
}

// --------------------------------------------------------------------------- rules (safe notification / review catalogue)

export const RULE_FIELDS: { field: string; label: string; unit: string }[] = [
  { field: 'rental.overdueHours', label: 'Kiralama iade gecikmesi', unit: 'saat' },
  { field: 'reservation.pendingHours', label: 'Bekleyen rezervasyon yaşı', unit: 'saat' },
  { field: 'rental.outstandingMinor', label: 'Kiralama açık bakiyesi', unit: 'minor (para biriminde)' },
  { field: 'vehicle.serviceKmOver', label: 'Periyodik bakım aşımı', unit: 'km' },
  { field: 'customer.docDaysLeft', label: 'Müşteri belgesi kalan gün', unit: 'gün' },
  { field: 'vehicle.docDaysLeft', label: 'Araç belgesi kalan gün', unit: 'gün' },
  { field: 'cash.varianceMinor', label: 'Kasa farkı (mutlak)', unit: 'minor' },
]

export function saveRule(d: Db, input: { id?: Id; name: string; conditions: Rule['conditions']; join: Rule['join']; action: Rule['action']; severity: Rule['severity']; message: string; status: Rule['status'] }): Rule {
  need(d, 'rules:manage', 'Kural düzenleme')
  if (input.name.trim().length < 3) fail('Kural adı yazın.', { name: 'Ad zorunlu' })
  if (!input.conditions.length) fail('En az bir koşul ekleyin.', { conditions: 'Koşul gerekli' })
  if (input.conditions.some((c) => !RULE_FIELDS.some((f) => f.field === c.field))) fail('Kural yalnız güvenli bildirim/inceleme alanlarını kullanabilir (vergi, kur, fiyat, depozito politikaları buradan değiştirilemez).')
  if (input.message.trim().length < 5) fail('Uyarı mesajını yazın.', { message: 'Mesaj zorunlu' })
  let r = input.id ? d.rules.find((x) => x.id === input.id) : undefined
  if (r) {
    r.versions.push({ version: r.version, at: nowOf(d), by: meOf(d).id, summary: `v${r.version}: ${r.conditions.length} koşul · ${r.status}` })
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
  if (!r) fail('Kural bulunamadı.')
  r!.versions.push({ version: r!.version, at: nowOf(d), by: meOf(d).id, summary: `${r!.status} → ${status}` })
  r!.status = status
  r!.version += 1
}

// --------------------------------------------------------------------------- exceptions

export function createException(d: Db, source: { type: LinkType; id: Id }, title: string, severity: 'low' | 'medium' | 'high'): void {
  need(d, 'risks:manage', 'İstisna kaydı')
  if (title.trim().length < 5) fail('İstisna başlığını yazın.', { title: 'Başlık zorunlu' })
  d.exceptions.push({ id: nextId(d, 'xc'), no: nextNo(d, 'IS'), source, title, severity, status: 'open', createdAt: nowOf(d) })
}
export function reviewException(d: Db, id: Id, status: 'reviewed' | 'accepted' | 'rejected', decision: string): void {
  need(d, 'risks:manage', 'İstisna incelemesi')
  const x = d.exceptions.find((e) => e.id === id)
  if (!x) fail('İstisna bulunamadı.')
  if (decision.trim().length < 5) fail('Karar gerekçesini yazın.', { decision: 'Gerekçe zorunlu' })
  x!.status = status
  x!.decision = decision
  x!.reviewerId = meOf(d).id
  // The decision is a review record; the source action (e.g. closing, charging) is still done on the source itself.
  logEvent(d, { module: 'risks', type: 'ExceptionReviewed', sourceType: 'exception', sourceId: id, summary: `${x!.no} → ${status}`, reason: decision })
}

// --------------------------------------------------------------------------- expenses

export const EXPENSE_CATEGORIES = ['Bakım ve servis', 'Yakıt', 'Temizlik', 'Sigorta primi', 'Kira ve işletme', 'Personel dışı genel gider', 'Ceza (otorite ödemesi)', 'Yol yardım / çekici', 'Diğer']

export function createExpense(d: Db, input: { category: string; vendor: string; branchId: Id; date: string; amount: Money; note: string; post: boolean; cashDrawerId?: Id }): Expense {
  need(d, 'expenses:manage', 'Masraf kaydı')
  const fields: Record<string, string> = {}
  if (!input.vendor.trim()) fields.vendor = 'Tedarikçi / alıcı yazın'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fields.date = 'Tarih girin'
  if (input.amount.minor <= 0) fields.amount = 'Tutar sıfırdan büyük olmalı'
  if (/iade|depozito|komisyon/i.test(input.category)) fields.category = 'İade, depozito ve komisyon masraf türü değildir'
  if (Object.keys(fields).length) fail('Formda eksik veya geçersiz alanlar var.', fields)
  const e: Expense = { id: nextId(d, 'ex'), no: nextNo(d, 'G'), category: input.category, vendor: input.vendor, branchId: input.branchId, date: input.date, amount: input.amount, status: input.post ? 'posted' : 'draft', note: input.note, createdBy: meOf(d).id }
  d.expenses.push(e)
  if (input.post && input.cashDrawerId) {
    const dr = d.drawers.find((x) => x.id === input.cashDrawerId)
    const s = dr && openSessionOf(d, dr)
    if (!dr || !s) fail('Kasa kapalı; nakit masraf çıkışı yapılamaz.')
    if (dr!.currency !== input.amount.cur) fail('Kasa para birimi masraf para biriminden farklı.')
    cashMove(d, dr!.id, 'out', input.amount.minor, `Masraf ${e.no}`, 'expense', e.id)
  }
  logEvent(d, { module: 'expenses', type: 'ExpenseCreated', sourceType: 'expense', sourceId: e.id, summary: `${e.no} · ${input.vendor}`, cur: input.amount.cur, minor: input.amount.minor })
  return e
}
export function postExpense(d: Db, id: Id): void {
  need(d, 'expenses:manage', 'Masraf kaydı')
  const e = d.expenses.find((x) => x.id === id)
  if (!e || e.status !== 'draft') fail('Yalnız taslak masraf kaydedilir.')
  e!.status = 'posted'
  logEvent(d, { module: 'expenses', type: 'ExpensePosted', sourceType: 'expense', sourceId: id, summary: `${e!.no} kaydedildi` })
}
export function voidExpense(d: Db, id: Id, reason: string): void {
  need(d, 'expenses:manage', 'Masraf iptali')
  const e = d.expenses.find((x) => x.id === id)
  if (!e || e.status === 'voided') fail('Masraf iptal edilemez.')
  if (e!.sourceType) fail('Kaynağa bağlı masraf buradan iptal edilmez: kaynak kaydı (bakım, ceza) düzeltilir.')
  if (reason.trim().length < 3) fail('İptal gerekçesi yazın.', { reason: 'Gerekçe zorunlu' })
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
  need(d, 'settings:fx', 'Döviz kuru tanımlama')
  const fields: Record<string, string> = {}
  if (!CURRENCIES.some((c) => c.code === input.base)) fields.base = 'Geçersiz para birimi'
  if (!CURRENCIES.some((c) => c.code === input.quote)) fields.quote = 'Geçersiz para birimi'
  if (input.base === input.quote) fields.quote = 'Aynı para birimi için kur tanımlanamaz'
  if (!Number.isFinite(input.rate) || input.rate <= 0) fields.rate = 'Kur sıfırdan büyük, sonlu bir sayı olmalı'
  if (input.validUntil && Date.parse(input.validUntil) <= Date.parse(input.validFrom)) fields.validUntil = 'Bitiş, başlangıçtan sonra olmalı'
  if (input.note.trim().length < 3) fields.note = 'Açıklama yazın'
  if (Object.keys(fields).length) fail('Kur formunda eksik veya geçersiz alanlar var.', fields)
  const start = Date.parse(input.validFrom)
  const clash = d.fxRates.find((r) => r.base === input.base && r.quote === input.quote && r.purpose === input.purpose && r.scope === input.scope && (r.validUntil === null || Date.parse(r.validUntil) > start) && (input.validUntil === null || Date.parse(input.validUntil) > Date.parse(r.validFrom)))
  if (clash) fail(`Aynı kapsamda bu çift için geçerli bir kur zaten var (1 ${clash.base} = ${clash.rate} ${clash.quote}). Önce onu sonlandırın: iki eş geçerli kur yapılandırma hatasıdır.`, { rate: 'Çakışan kur' }, 'RATE_CONFLICT')
  const r: FxRate = { id: nextId(d, 'fx'), ...input, enteredBy: meOf(d).id, enteredAt: nowOf(d) }
  d.fxRates.push(r)
  logEvent(d, { module: 'settings', type: 'FxRateSet', sourceType: 'fx', sourceId: r.id, summary: `Kur: 1 ${r.base} = ${r.rate} ${r.quote} (${r.purpose}${r.scope === 'company' ? '' : ', şube'}) — yeni işlemlerde kullanılır, eski tahsilatlar değişmez`, reason: r.note, after: String(r.rate) })
  return r
}
export function endFxRate(d: Db, id: Id): void {
  need(d, 'settings:fx', 'Kur sonlandırma')
  const r = d.fxRates.find((x) => x.id === id)
  if (!r || !isRateActive(r, nowOf(d))) fail('Bu kur şu an geçerli değil.')
  r!.validUntil = nowOf(d)
  logEvent(d, { module: 'settings', type: 'FxRateEnded', sourceType: 'fx', sourceId: id, summary: `Kur sonlandırıldı: 1 ${r!.base} = ${r!.rate} ${r!.quote}` })
}

// --------------------------------------------------------------------------- policy and pricing editors (versioned; snapshots are never rewritten)

export function savePricing(d: Db, summary: string, mutate: (d: Db) => void): void {
  need(d, 'pricing:manage', 'Fiyat düzenleme')
  mutate(d)
  d.priceRevisions.push({ id: nextId(d, 'rev'), at: nowOf(d), by: meOf(d).id, summary })
  logEvent(d, { module: 'pricing', type: 'PriceRevision', sourceType: 'pricing', sourceId: d.priceRevisions[d.priceRevisions.length - 1]!.id, summary: `Fiyat revizyonu: ${summary}. Mevcut teklif/rezervasyon/kiralama fiyatları değişmez.` })
}
export function saveSettings(d: Db, summary: string, mutate: (d: Db) => void): void {
  need(d, 'settings:manage', 'Ayar düzenleme')
  mutate(d)
  logEvent(d, { module: 'settings', type: 'SettingsChanged', sourceType: 'settings', sourceId: 'settings', summary: `Ayar: ${summary}. Gelecekteki işlemleri etkiler; geçmiş snapshot'lar değişmez.` })
}

// --------------------------------------------------------------------------- administration

export function updateBranch(d: Db, id: Id, patch: { name?: string; phone?: string; address?: string; active?: boolean }): void {
  need(d, 'branches:manage', 'Şube düzenleme')
  const b = d.branches.find((x) => x.id === id)
  if (!b) fail('Şube bulunamadı.')
  if (patch.active === false && d.rentals.some((r) => (r.pickupBranchId === id || r.returnBranchId === id) && (r.status === 'prepared' || r.status === 'delivered'))) fail('Aktif kiralaması olan şube pasif yapılamaz.')
  Object.assign(b!, patch)
  logEvent(d, { module: 'branches', type: 'BranchUpdated', sourceType: 'branch', sourceId: id, summary: `${b!.name} güncellendi` })
}

export function inviteUser(d: Db, input: { name: string; email: string; roleId: Id; branchIds: Id[]; title: string }): void {
  need(d, 'users:manage', 'Kullanıcı daveti')
  if (input.name.trim().length < 3) fail('Ad soyad girin.', { name: 'Ad zorunlu' })
  if (!/^\S+@\S+\.\S+$/.test(input.email)) fail('Geçerli bir e-posta girin.', { email: 'Geçersiz e-posta' })
  if (d.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) fail('Bu e-posta zaten kayıtlı.', { email: 'Mükerrer e-posta' })
  d.users.push({ id: nextId(d, 'u'), ...input, status: 'invited', grant: [], deny: [] })
  // Nothing is sent: the invitation is a demo record, not an e-mail.
  logEvent(d, { module: 'users', type: 'UserInvited', sourceType: 'user', sourceId: d.users[d.users.length - 1]!.id, summary: `${input.email} için davet kaydı (demo; e-posta gönderilmedi)` })
}
export function updateUser(d: Db, id: Id, patch: { roleId?: Id; branchIds?: Id[]; status?: 'active' | 'inactive' | 'invited'; grant?: string[]; deny?: string[]; title?: string }): void {
  need(d, 'users:manage', 'Kullanıcı düzenleme')
  const u = d.users.find((x) => x.id === id)
  if (!u) fail('Kullanıcı bulunamadı.')
  const owners = d.users.filter((x) => x.roleId === 'role-owner' && x.status === 'active')
  if (u!.roleId === 'role-owner' && owners.length === 1 && ((patch.roleId && patch.roleId !== 'role-owner') || patch.status === 'inactive')) fail('Son aktif Sahip kullanıcı pasifleştirilemez veya rolü değiştirilemez.')
  Object.assign(u!, patch)
  logEvent(d, { module: 'users', type: 'UserUpdated', sourceType: 'user', sourceId: id, summary: `${u!.name} güncellendi` })
}

export function saveRole(d: Db, input: { id?: Id; name: string; description: string; perms: string[] }): Role {
  need(d, 'roles:manage', 'Rol düzenleme')
  if (input.name.trim().length < 3) fail('Rol adı yazın.', { name: 'Ad zorunlu' })
  let r = input.id ? d.roles.find((x) => x.id === input.id) : undefined
  if (r) {
    if (r.system && r.id === 'role-owner') fail('Sahip rolü değiştirilemez.')
    r.name = input.name
    r.description = input.description
    r.perms = input.perms
  } else {
    if (d.roles.some((x) => x.name.toLowerCase() === input.name.trim().toLowerCase())) fail('Bu adla bir rol var.', { name: 'Mükerrer ad' })
    r = { id: nextId(d, 'role'), name: input.name.trim(), description: input.description, system: false, perms: input.perms }
    d.roles.push(r)
  }
  logEvent(d, { module: 'roles', type: 'RoleSaved', sourceType: 'role', sourceId: r.id, summary: `${r.name} · ${r.perms.length} izin` })
  return r
}

// --------------------------------------------------------------------------- demo session controls (not business records)

export function switchUser(d: Db, userId: Id): void {
  const u = d.users.find((x) => x.id === userId)
  if (!u || u.status !== 'active') fail('Bu kullanıcı etkin değil.')
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
export function markNotificationsRead(d: Db): void {
  for (const n of d.notifications) if (!n.userId || n.userId === meOf(d).id) n.read = true
}
export { findDrawer, userName }

// --------------------------------------------------------------------------- platform console (tenant metadata only)

/** The platform console changes tenant status and plan. It never reads or writes a tenant's business records. */
export function setTenantStatus(d: Db, id: Id, status: 'active' | 'trial' | 'suspended'): void {
  const t = d.tenants.find((x) => x.id === id)
  if (!t) fail('Şirket bulunamadı.')
  if (t!.id === d.tenants[0]!.id && status === 'suspended') fail('Demo şirketi askıya alınamaz: bu demo onun üzerinde çalışır.')
  t!.status = status
}
export function setTenantPlan(d: Db, id: Id, plan: 'starter' | 'professional' | 'enterprise'): void {
  const t = d.tenants.find((x) => x.id === id)
  if (!t) fail('Şirket bulunamadı.')
  t!.plan = plan
}
