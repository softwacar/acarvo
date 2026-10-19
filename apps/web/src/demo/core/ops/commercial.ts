import { projectSupplierPayable } from '../calc/finance'
import { priceQuote } from '../calc/pricing'
import { addHistory, fail, logEvent, meOf, need, nextId, nextNo, nowOf } from '../helpers'
import { fmt } from '../money'
import type { Cur, Customer, Db, Engagement, FuelLevel, Id, Iso, Lead, Money, Partner, Quote, SourcingRequest } from '../types'
import { createReservation, find } from './rentals'

// Customers, corporate accounts, leads and quotes, partners, suppliers and sourcing.
// Lead ≠ quote ≠ reservation ≠ rental. Commission earned ≠ paid. Offer accepted ≠ vehicle received.

// --------------------------------------------------------------------------- customers

export interface CustomerInput {
  name: string
  phone: string
  email: string
  country: string
  residency: 'local' | 'foreign'
  dob: string
  language: 'tr' | 'en' | 'bs'
  licenseYear: number
  licenseValidUntil: string
  corporateId?: Id
}

export function findDuplicates(d: Db, input: Pick<CustomerInput, 'name' | 'phone' | 'email' | 'dob'>, exceptId?: Id): { customer: Customer; reason: string }[] {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const phone = input.phone.replace(/\D/g, '')
  const out: { customer: Customer; reason: string }[] = []
  for (const c of d.customers) {
    if (c.id === exceptId || c.archived) continue
    if (phone && c.phone.replace(/\D/g, '') === phone) out.push({ customer: c, reason: 'Aynı telefon' })
    else if (input.email && norm(c.email) === norm(input.email)) out.push({ customer: c, reason: 'Aynı e-posta' })
    else if (norm(c.name) === norm(input.name) && c.dob === input.dob) out.push({ customer: c, reason: 'Aynı ad ve doğum tarihi' })
  }
  return out
}

export function createCustomer(d: Db, input: CustomerInput, acknowledgeDuplicates = false): Customer {
  need(d, 'customers:manage', 'Müşteri kaydı')
  const fields: Record<string, string> = {}
  if (input.name.trim().length < 3) fields.name = 'Ad soyad girin'
  if (!/^\+?[0-9 ()-]{7,}$/.test(input.phone.trim())) fields.phone = 'Geçerli bir telefon girin'
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) fields.email = 'Geçerli bir e-posta girin'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob)) fields.dob = 'Doğum tarihini girin'
  if (Object.keys(fields).length) fail('Formda eksik veya geçersiz alanlar var.', fields)
  const dups = findDuplicates(d, input)
  if (dups.length && !acknowledgeDuplicates) fail(`Benzer kayıt var: ${dups.map((x) => `${x.customer.name} (${x.reason})`).join(', ')}. Yine de oluşturmak için "mükerrer uyarısını gördüm" işaretleyin.`, {}, 'DUPLICATE')
  const c: Customer = {
    id: nextId(d, 'c'),
    no: nextNo(d, 'M'),
    name: input.name.trim(),
    kind: 'individual',
    phone: input.phone.trim(),
    email: input.email.trim(),
    country: input.country,
    residency: input.residency,
    dob: input.dob,
    corporateId: input.corporateId,
    language: input.language,
    license: { issuedYear: input.licenseYear, validUntil: input.licenseValidUntil, categories: ['B'] },
    contactPref: 'phone',
    notes: [],
    restrictions: [],
    contacts: [],
    createdAt: nowOf(d),
    archived: false,
    gdpr: { requests: [] },
  }
  d.customers.push(c)
  logEvent(d, { module: 'customers', type: 'CustomerCreated', sourceType: 'customer', sourceId: c.id, summary: `${c.no} · ${c.name}` })
  return c
}

export function updateCustomer(d: Db, id: Id, patch: Partial<Pick<Customer, 'phone' | 'email' | 'language' | 'contactPref' | 'corporateId'>>): void {
  need(d, 'customers:manage', 'Müşteri düzenleme')
  const c = find.customer(d, id)
  if (!c) fail('Müşteri bulunamadı.')
  Object.assign(c!, patch)
  logEvent(d, { module: 'customers', type: 'CustomerUpdated', sourceType: 'customer', sourceId: id, summary: `${c!.no} güncellendi` })
}

export function addCustomerNote(d: Db, id: Id, text: string, pinned: boolean): void {
  need(d, 'customers:manage', 'Not ekleme')
  const c = find.customer(d, id)
  if (!c) fail('Müşteri bulunamadı.')
  if (text.trim().length < 3) fail('Not yazın.', { text: 'Not zorunlu' })
  c!.notes.unshift({ id: nextId(d, 'nt'), at: nowOf(d), by: meOf(d).id, text, pinned })
}

export function addContactLog(d: Db, id: Id, channel: 'phone' | 'in_person' | 'email_manual' | 'note', summary: string, followUpAt?: Iso): void {
  need(d, 'customers:manage', 'İletişim kaydı')
  const c = find.customer(d, id)
  if (!c) fail('Müşteri bulunamadı.')
  if (summary.trim().length < 3) fail('İletişim özetini yazın.', { summary: 'Özet zorunlu' })
  // A manual log of a contact that already happened outside ACARVO: nothing is sent from here.
  c!.contacts.unshift({ id: nextId(d, 'cl'), at: nowOf(d), by: meOf(d).id, channel, summary, followUpAt, followUpDone: false })
  logEvent(d, { module: 'customers', type: 'ContactLogged', sourceType: 'customer', sourceId: id, summary: `${c!.no} iletişim kaydı (elle)` })
}
export function completeFollowUp(d: Db, customerId: Id, logId: Id): void {
  const c = find.customer(d, customerId)
  const l = c?.contacts.find((x) => x.id === logId)
  if (!c || !l) fail('Kayıt bulunamadı.')
  l!.followUpDone = true
}

/** Explainable operational restriction: needs a visible reason; never a hidden verdict. */
export function addRestriction(d: Db, id: Id, label: string, reason: string): void {
  need(d, 'customers:manage', 'Kısıtlama')
  const c = find.customer(d, id)
  if (!c) fail('Müşteri bulunamadı.')
  if (label.trim().length < 3 || reason.trim().length < 10) fail('Kısıtlama adı ve en az 10 karakterlik açık gerekçe gerekir (gizli hüküm yasak).', { reason: 'Açık gerekçe zorunlu' })
  c!.restrictions.push({ id: nextId(d, 'rs'), label, reason, at: nowOf(d), by: meOf(d).id })
  logEvent(d, { module: 'customers', type: 'RestrictionAdded', sourceType: 'customer', sourceId: id, summary: `${c!.no} kısıtlama: ${label}`, reason })
}
export function removeRestriction(d: Db, id: Id, restrictionId: Id): void {
  need(d, 'customers:manage', 'Kısıtlama')
  const c = find.customer(d, id)
  if (!c) fail('Müşteri bulunamadı.')
  c!.restrictions = c!.restrictions.filter((r) => r.id !== restrictionId)
}

export function addCustomerDocument(d: Db, customerId: Id, kind: string, validUntil: string): void {
  need(d, 'documents:manage', 'Belge ekleme')
  const c = find.customer(d, customerId)
  if (!c) fail('Müşteri bulunamadı.')
  if (!validUntil) fail('Geçerlilik tarihi girin.', { validUntil: 'Tarih zorunlu' })
  const version = d.documents.filter((x) => x.ownerType === 'customer' && x.ownerId === customerId && x.kind === kind).length + 1
  d.documents.push({ id: nextId(d, 'doc'), ownerType: 'customer', ownerId: customerId, kind, name: `${kind} v${version} (örnek belge)`, version, validUntil, placeholder: true, uploadedAt: nowOf(d), uploadedBy: meOf(d).id })
  logEvent(d, { module: 'documents', type: 'DocumentAdded', sourceType: 'customer', sourceId: customerId, summary: `${c!.no} · ${kind} v${version} (demo, dosya içermez)` })
}

export function createGdprRequest(d: Db, id: Id, kind: 'access' | 'erasure' | 'rectification', note: string): void {
  need(d, 'customers:manage', 'Kişisel veri talebi')
  const c = find.customer(d, id)
  if (!c) fail('Müşteri bulunamadı.')
  c!.gdpr.requests.push({ id: nextId(d, 'gd'), kind, at: nowOf(d), status: 'open', note })
  logEvent(d, { module: 'customers', type: 'PrivacyRequest', sourceType: 'customer', sourceId: id, summary: `${c!.no} kişisel veri talebi: ${kind}` })
}
export function closeGdprRequest(d: Db, id: Id, reqId: Id): void {
  need(d, 'customers:manage', 'Kişisel veri talebi')
  const c = find.customer(d, id)
  const r = c?.gdpr.requests.find((x) => x.id === reqId)
  if (!c || !r) fail('Talep bulunamadı.')
  r!.status = 'closed'
}

/** What merging two demo customers would move. The merge itself archives the dropped record; nothing is deleted. */
export function mergePreview(d: Db, keepId: Id, dropId: Id) {
  const sameId = (x: { customerId: Id }) => x.customerId === dropId
  return {
    reservations: d.reservations.filter(sameId).length,
    rentals: d.rentals.filter(sameId).length,
    documents: d.documents.filter((x) => x.ownerType === 'customer' && x.ownerId === dropId).length,
    contacts: find.customer(d, dropId)?.contacts.length ?? 0,
    notes: find.customer(d, dropId)?.notes.length ?? 0,
    leads: d.leads.filter((l) => l.customerId === dropId).length,
    keepId,
  }
}
export function mergeCustomers(d: Db, keepId: Id, dropId: Id): void {
  need(d, 'customers:manage', 'Müşteri birleştirme')
  if (keepId === dropId) fail('Aynı kaydı birleştiremezsiniz.')
  const keep = find.customer(d, keepId)
  const drop = find.customer(d, dropId)
  if (!keep || !drop) fail('Müşteri bulunamadı.')
  for (const r of d.reservations) if (r.customerId === dropId) r.customerId = keepId
  for (const r of d.rentals) if (r.customerId === dropId) r.customerId = keepId
  for (const l of d.leads) if (l.customerId === dropId) l.customerId = keepId
  for (const doc of d.documents) if (doc.ownerType === 'customer' && doc.ownerId === dropId) doc.ownerId = keepId
  keep!.contacts.push(...drop!.contacts)
  keep!.notes.push(...drop!.notes)
  drop!.archived = true
  drop!.notes = []
  drop!.contacts = []
  drop!.restrictions = []
  logEvent(d, { module: 'customers', type: 'CustomersMerged', sourceType: 'customer', sourceId: keepId, summary: `${drop!.no} → ${keep!.no} birleştirildi (demo; ${drop!.no} arşivlendi, silinmedi)` })
}

// --------------------------------------------------------------------------- corporate

export function setCreditLimit(d: Db, corporateId: Id, cur: Cur, minor: number | null): void {
  need(d, 'corporate:manage', 'Kredi limiti')
  const c = d.corporates.find((x) => x.id === corporateId)
  if (!c) fail('Kurumsal hesap bulunamadı.')
  if (minor === null) delete c!.creditLimits[cur]
  else {
    if (minor < 0) fail('Limit negatif olamaz.')
    c!.creditLimits[cur] = minor
  }
  logEvent(d, { module: 'corporate', type: 'CreditLimitSet', sourceType: 'corporate', sourceId: corporateId, summary: `${c!.name} · ${cur} limit ${minor === null ? 'kaldırıldı (tanımsız)' : fmt(minor, cur)}` })
}

export function createCorporate(d: Db, input: { name: string; taxId: string; country: string; address: string; paymentTermsDays: number }): void {
  need(d, 'corporate:manage', 'Kurumsal hesap')
  if (input.name.trim().length < 3) fail('Şirket adı girin.', { name: 'Ad zorunlu' })
  if (!input.taxId.trim()) fail('Vergi numarası girin.', { taxId: 'Vergi no zorunlu' })
  if (d.corporates.some((c) => c.taxId === input.taxId.trim())) fail('Bu vergi numarası başka bir kurumsal hesapta kayıtlı (mükerrer uyarısı).', { taxId: 'Mükerrer vergi no' }, 'DUPLICATE')
  d.corporates.push({ id: nextId(d, 'co'), no: nextNo(d, 'KH'), name: input.name.trim(), taxId: input.taxId.trim(), country: input.country, address: input.address, contacts: [], creditLimits: {}, overrides: [], driverCustomerIds: [], paymentTermsDays: input.paymentTermsDays, status: 'active' })
  logEvent(d, { module: 'corporate', type: 'CorporateCreated', sourceType: 'corporate', sourceId: d.corporates[d.corporates.length - 1]!.id, summary: `${input.name} oluşturuldu` })
}

// --------------------------------------------------------------------------- leads and quotes

export interface LeadInput {
  source: Lead['source']
  partnerId?: Id
  name: string
  phone: string
  email: string
  customerId?: Id
  classId: Id
  from: Iso
  to: Iso
  branchId: Id
  ownerId: Id
  notes: string
}

export function createLead(d: Db, input: LeadInput): Lead {
  need(d, 'leads:manage', 'Talep kaydı')
  if (input.name.trim().length < 3) fail('Ad soyad girin.', { name: 'Ad zorunlu' })
  if (Date.parse(input.to) <= Date.parse(input.from)) fail('Bitiş başlangıçtan sonra olmalı.', { to: 'Tarih aralığı geçersiz' })
  const l: Lead = { id: nextId(d, 'ld'), no: nextNo(d, 'TL'), ...input, status: 'new', reminders: [], quoteIds: [], createdAt: nowOf(d) }
  d.leads.push(l)
  logEvent(d, { module: 'leads', type: 'LeadCreated', sourceType: 'lead', sourceId: l.id, summary: `${l.no} · ${l.name}` })
  return l
}

export function setLeadStatus(d: Db, id: Id, status: Lead['status'], lostReason = ''): void {
  need(d, 'leads:manage', 'Talep durumu')
  const l = d.leads.find((x) => x.id === id)
  if (!l) fail('Talep bulunamadı.')
  if (status === 'lost' && lostReason.trim().length < 3) fail('Kayıp nedenini yazın.', { reason: 'Neden zorunlu' })
  if (status === 'converted') fail('Dönüştürme yalnız kabul edilmiş tekliften yapılır.')
  l!.status = status
  l!.lostReason = status === 'lost' ? lostReason : undefined
  logEvent(d, { module: 'leads', type: 'LeadStatus', sourceType: 'lead', sourceId: id, summary: `${l!.no} → ${status}`, reason: lostReason })
}

export function addLeadReminder(d: Db, id: Id, at: Iso, text: string): void {
  need(d, 'leads:manage', 'Hatırlatma')
  const l = d.leads.find((x) => x.id === id)
  if (!l) fail('Talep bulunamadı.')
  if (text.trim().length < 3) fail('Hatırlatma metni yazın.', { text: 'Metin zorunlu' })
  l!.reminders.push({ id: nextId(d, 'rm'), at, text, done: false })
}
export function doneLeadReminder(d: Db, id: Id, rid: Id): void {
  const l = d.leads.find((x) => x.id === id)
  const r = l?.reminders.find((x) => x.id === rid)
  if (r) r.done = true
}

export function createQuote(d: Db, leadId: Id, input: { classId: Id; from: Iso; to: Iso; insuranceId?: Id; extras: { extraId: Id; qty: number }[]; currency: Cur; validUntil: Iso; note: string }): Quote {
  need(d, 'leads:manage', 'Teklif hazırlama')
  const l = d.leads.find((x) => x.id === leadId)
  if (!l) fail('Talep bulunamadı.')
  const snap = priceQuote(d, { classId: input.classId, from: input.from, to: input.to, pickupBranchId: l!.branchId, returnBranchId: l!.branchId, currency: input.currency, extras: input.extras, insuranceId: input.insuranceId }, nowOf(d), nextId(d, 'ps'))
  if (snap.blockers.length) fail(`Teklif fiyatı hesaplanamadı: ${snap.blockers[0]}`)
  // A new price version never overwrites an older one: earlier quotes stay readable and are marked superseded.
  const prev = d.quotes.filter((q) => q.leadId === leadId)
  for (const q of prev) if (q.status === 'draft' || q.status === 'sent') q.status = 'superseded'
  const q: Quote = { id: nextId(d, 'q'), no: nextNo(d, 'TK'), leadId, version: prev.length + 1, status: 'sent', validUntil: input.validUntil, price: snap, classId: input.classId, from: input.from, to: input.to, insuranceId: input.insuranceId, extras: input.extras, createdAt: nowOf(d), createdBy: meOf(d).id, note: input.note }
  d.quotes.push(q)
  l!.quoteIds.push(q.id)
  if (l!.status === 'new' || l!.status === 'contacted') l!.status = 'quoted'
  logEvent(d, { module: 'leads', type: 'QuoteCreated', sourceType: 'quote', sourceId: q.id, summary: `${q.no} v${q.version} · ${fmt(snap.grossMinor, snap.cur)}`, cur: snap.cur, minor: snap.grossMinor })
  return q
}

export function rejectQuote(d: Db, id: Id): void {
  need(d, 'leads:manage', 'Teklif')
  const q = d.quotes.find((x) => x.id === id)
  if (!q || (q.status !== 'sent' && q.status !== 'draft')) fail('Bu teklif reddedilemez.')
  q!.status = 'rejected'
}

/** Accepting a quote creates a pending reservation linked to this exact quote version. The lead itself is no rental or commission. */
export function acceptQuoteToReservation(d: Db, quoteId: Id): Id {
  need(d, 'leads:manage', 'Teklif kabulü')
  const q = d.quotes.find((x) => x.id === quoteId)
  if (!q) fail('Teklif bulunamadı.')
  if (q!.status !== 'sent') fail('Yalnız gönderilmiş (güncel) teklif kabul edilir.')
  if (Date.parse(q!.validUntil) < Date.parse(nowOf(d))) fail('Teklifin geçerlilik süresi dolmuş.')
  const l = d.leads.find((x) => x.id === q!.leadId)!
  let customerId = l.customerId
  if (!customerId) {
    const c = createCustomer(d, { name: l.name, phone: l.phone, email: l.email, country: 'BA', residency: 'foreign', dob: '1990-01-01', language: 'en', licenseYear: 2012, licenseValidUntil: '2030-01-01' }, true)
    customerId = c.id
    l.customerId = c.id
    addHistoryNote(d, c, 'Talepten oluşturuldu; doğum tarihi ve ehliyet bilgileri teslimden önce tamamlanmalı (örnek değerlerle açıldı).')
  }
  const res = createReservation(d, { customerId, classId: q!.classId, pickupBranchId: l.branchId, returnBranchId: l.branchId, pickupAt: q!.from, returnAt: q!.to, currency: q!.price.cur, extras: q!.extras, insuranceId: q!.insuranceId, channel: l.partnerId ? 'partner' : 'quote', partnerId: l.partnerId, leadId: l.id, quoteId: q!.id, notes: `Teklif ${q!.no} v${q!.version}` })
  q!.status = 'accepted'
  l.status = 'converted'
  l.reservationId = res.id
  logEvent(d, { module: 'leads', type: 'QuoteAccepted', sourceType: 'quote', sourceId: quoteId, summary: `${q!.no} kabul → ${res.no}` })
  return res.id
}
function addHistoryNote(d: Db, c: Customer, text: string) {
  c.notes.unshift({ id: nextId(d, 'nt'), at: nowOf(d), by: meOf(d).id, text, pinned: true })
}

export function addWaitlist(d: Db, input: { customerId: Id; classId: Id; branchId: Id; from: Iso; to: Iso; note: string }): void {
  need(d, 'reservations:manage', 'Bekleme listesi')
  if (Date.parse(input.to) <= Date.parse(input.from)) fail('Tarih aralığı geçersiz.')
  d.waitlist.push({ id: nextId(d, 'wl'), ...input, status: 'waiting', createdAt: nowOf(d) })
}
export function setWaitlistStatus(d: Db, id: Id, status: 'offered' | 'expired'): void {
  need(d, 'reservations:manage', 'Bekleme listesi')
  const w = d.waitlist.find((x) => x.id === id)
  if (!w) fail('Kayıt bulunamadı.')
  w!.status = status
}
export function convertWaitlist(d: Db, id: Id): Id {
  need(d, 'reservations:manage', 'Bekleme listesi')
  const w = d.waitlist.find((x) => x.id === id)
  if (!w) fail('Kayıt bulunamadı.')
  const cur = d.branches.find((b) => b.id === w!.branchId)?.currency ?? d.settings.company.baseCurrency
  const useCur = d.baseRates.some((r) => r.classId === w!.classId && r.cur === cur) ? cur : d.settings.company.baseCurrency
  const res = createReservation(d, { customerId: w!.customerId, classId: w!.classId, pickupBranchId: w!.branchId, returnBranchId: w!.branchId, pickupAt: w!.from, returnAt: w!.to, currency: useCur, extras: [], channel: 'phone', notes: 'Bekleme listesinden' })
  w!.status = 'converted'
  return res.id
}

// --------------------------------------------------------------------------- partners

export function createPartner(d: Db, input: { name: string; kind: Partner['kind']; country: string; contactName: string; email: string; phone: string; pct: number; trigger: Partner['commission']['trigger'] }): Partner {
  need(d, 'partners:manage', 'Partner kaydı')
  if (input.name.trim().length < 3) fail('Partner adı girin.', { name: 'Ad zorunlu' })
  if (!(input.pct >= 0 && input.pct <= 50)) fail('Komisyon oranı 0–50 arasında olmalı.', { pct: 'Geçersiz oran' })
  const p: Partner = { id: nextId(d, 'pt'), no: nextNo(d, 'P'), name: input.name.trim(), kind: input.kind, country: input.country, contact: { name: input.contactName, email: input.email, phone: input.phone }, commission: { type: 'percent', pct: input.pct, trigger: input.trigger, version: 1 }, status: 'active', portalAccess: false }
  d.partners.push(p)
  logEvent(d, { module: 'partners', type: 'PartnerCreated', sourceType: 'partner', sourceId: p.id, summary: p.name })
  return p
}
export function updateCommissionTerms(d: Db, id: Id, pct: number, trigger: Partner['commission']['trigger']): void {
  need(d, 'partners:manage', 'Komisyon koşulu')
  const p = d.partners.find((x) => x.id === id)
  if (!p) fail('Partner bulunamadı.')
  if (!(pct >= 0 && pct <= 50)) fail('Komisyon oranı 0–50 arasında olmalı.', { pct: 'Geçersiz oran' })
  // New terms apply to rentals that earn from now on; commissions already earned keep their stated amount.
  p!.commission = { type: 'percent', pct, trigger, version: p!.commission.version + 1 }
  logEvent(d, { module: 'partners', type: 'CommissionTermsChanged', sourceType: 'partner', sourceId: id, summary: `${p!.name} komisyon sürümü ${p!.commission.version}: %${pct} · ${trigger}` })
}
export function setPortalAccess(d: Db, id: Id, on: boolean): void {
  need(d, 'partners:manage', 'Portal erişimi')
  const p = d.partners.find((x) => x.id === id)
  if (!p) fail('Partner bulunamadı.')
  p!.portalAccess = on
  logEvent(d, { module: 'partners', type: 'PortalAccess', sourceType: 'partner', sourceId: id, summary: `${p!.name} portal erişimi ${on ? 'açıldı' : 'kapatıldı'} (demo; gerçek davet gönderilmez)` })
}

/** Paying commission is a finance movement (partner payment) that references earned commissions; earning never pays. */
export function payPartnerCommission(d: Db, partnerId: Id, commissionIds: Id[], reference: string): void {
  need(d, 'finance:apply', 'Komisyon ödemesi')
  const p = d.partners.find((x) => x.id === partnerId)
  if (!p) fail('Partner bulunamadı.')
  if (!reference.trim()) fail('Ödeme referansı girin.', { reference: 'Referans zorunlu' })
  const paid = new Set(d.partnerPayments.flatMap((x) => x.commissionIds))
  const list = d.commissions.filter((c) => commissionIds.includes(c.id) && c.partnerId === partnerId && !paid.has(c.id))
  if (!list.length) fail('Ödenecek (ödenmemiş) komisyon seçin.')
  const cur = list[0]!.amount.cur
  if (list.some((c) => c.amount.cur !== cur)) fail('Tek ödemede yalnız aynı para birimindeki komisyonlar toplanır.')
  const amount: Money = { minor: list.reduce((a, c) => a + c.amount.minor, 0), cur }
  d.partnerPayments.push({ id: nextId(d, 'pp'), partnerId, commissionIds: list.map((c) => c.id), amount, paidAt: nowOf(d), reference })
  logEvent(d, { module: 'partners', type: 'CommissionPaid', sourceType: 'partner', sourceId: partnerId, summary: `${p!.name} komisyon ödemesi ${fmt(amount.minor, cur)} (kayıt)`, cur, minor: amount.minor })
}

// --------------------------------------------------------------------------- suppliers and sourcing

export function createSupplier(d: Db, input: { name: string; country: string; contactName: string; email: string; phone: string; terms: string }): void {
  need(d, 'suppliers:manage', 'Tedarikçi')
  if (input.name.trim().length < 3) fail('Tedarikçi adı girin.', { name: 'Ad zorunlu' })
  d.suppliers.push({ id: nextId(d, 'su'), no: nextNo(d, 'TD'), name: input.name.trim(), country: input.country, contact: { name: input.contactName, email: input.email, phone: input.phone }, status: 'active', depositHeld: { minor: 0, cur: d.settings.company.baseCurrency }, terms: input.terms })
}

export function createSourcingRequest(d: Db, input: { classId: Id; from: Iso; to: Iso; branchId: Id; reason: string }): SourcingRequest {
  need(d, 'suppliers:manage', 'Tedarik talebi')
  if (Date.parse(input.to) <= Date.parse(input.from)) fail('Tarih aralığı geçersiz.')
  if (input.reason.trim().length < 3) fail('Neden yazın.', { reason: 'Neden zorunlu' })
  const r: SourcingRequest = { id: nextId(d, 'sr'), no: nextNo(d, 'TT'), classId: input.classId, from: input.from, to: input.to, branchId: input.branchId, reason: input.reason, status: 'open', offers: [], createdAt: nowOf(d) }
  d.sourcing.push(r)
  logEvent(d, { module: 'suppliers', type: 'SourcingRequested', sourceType: 'supplier', sourceId: r.id, summary: `${r.no} tedarik talebi` })
  return r
}
export function addSupplierOffer(d: Db, requestId: Id, input: { supplierId: Id; vehicle: string; dailyRate: Money; validUntil: Iso }): void {
  need(d, 'suppliers:manage', 'Teklif')
  const r = d.sourcing.find((x) => x.id === requestId)
  if (!r || (r.status !== 'open' && r.status !== 'offered')) fail('Talep teklife açık değil.')
  if (input.dailyRate.minor <= 0) fail('Günlük bedel girin.')
  r!.offers.push({ id: nextId(d, 'of'), ...input, status: 'open' })
  r!.status = 'offered'
}
/** Accepting an offer confirms a future window. The vehicle is NOT received: delivery needs Received + Ready. */
export function acceptOffer(d: Db, requestId: Id, offerId: Id, plate: string, make: string, model: string): Engagement {
  need(d, 'suppliers:manage', 'Teklif kabulü')
  const r = d.sourcing.find((x) => x.id === requestId)
  const o = r?.offers.find((x) => x.id === offerId)
  if (!r || !o || o.status !== 'open') fail('Teklif kabul edilemez.')
  const pl = plate.trim().toUpperCase()
  if (pl.length < 4) fail('Plaka girin.', { plate: 'Plaka zorunlu' })
  let ev = d.externalVehicles.find((x) => x.plate === pl)
  if (!ev) {
    ev = { id: nextId(d, 'xv'), supplierId: o!.supplierId, plate: pl, make, model, classId: r!.classId, year: 2024 }
    d.externalVehicles.push(ev)
  }
  const clash = d.engagements.find((e) => e.externalVehicleId === ev!.id && (e.status === 'confirmed' || e.status === 'received') && Date.parse(e.from) < Date.parse(r!.to) && Date.parse(r!.from) < Date.parse(e.to))
  if (clash) fail(`Bu dış araç ${clash.no} anlaşmasıyla çakışıyor: aynı araç iki anlaşmada olamaz.`, {}, 'CONFLICT')
  const eng: Engagement = { id: nextId(d, 'eg'), no: nextNo(d, 'AN'), supplierId: o!.supplierId, externalVehicleId: ev.id, requestId, from: r!.from, to: r!.to, dailyCost: o!.dailyRate, status: 'confirmed' }
  d.engagements.push(eng)
  o!.status = 'accepted'
  for (const x of r!.offers) if (x.id !== offerId && x.status === 'open') x.status = 'declined'
  r!.status = 'accepted'
  r!.engagementId = eng.id
  if (!d.vehicles.some((v) => v.externalVehicleId === ev!.id)) {
    d.vehicles.push({
      id: nextId(d, 'v'),
      plate: pl,
      make,
      model,
      year: ev.year,
      color: '—',
      classId: r!.classId,
      homeBranchId: r!.branchId,
      location: o!.supplierId,
      status: 'active',
      odometerKm: 0,
      fuelType: 'petrol',
      fuel: 'full',
      vin: '',
      source: 'external',
      externalVehicleId: ev.id,
      readiness: { clean: false, fuelOk: true, checkedAt: null, checkedBy: null, note: 'Tedarikçiden teslim alınmadı' },
      tire: { type: 'all_season', mountedAt: nowOf(d), treadMm: 7 },
      service: { intervalKm: 15000, lastKm: 0, lastAt: nowOf(d) },
      keys: { count: 0, holder: 'Tedarikçi' },
    })
  }
  logEvent(d, { module: 'suppliers', type: 'OfferAccepted', sourceType: 'engagement', sourceId: eng.id, summary: `${eng.no} onaylandı (araç henüz teslim alınmadı)` })
  return eng
}
export function receiveEngagement(d: Db, id: Id, km: number, fuel: FuelLevel, photos: number, note: string): void {
  need(d, 'suppliers:manage', 'Teslim alma')
  const e = d.engagements.find((x) => x.id === id)
  if (!e || e.status !== 'confirmed') fail('Yalnız onaylı anlaşma teslim alınır.')
  if (photos < 4) fail('Teslim alma kanıtı için en az 4 fotoğraf gerekir.', { photos: 'En az 4 fotoğraf' })
  e!.status = 'received'
  e!.receivedAt = nowOf(d)
  e!.receiveInspection = { km, fuel, photos, note, at: nowOf(d) }
  const v = d.vehicles.find((x) => x.externalVehicleId === e!.externalVehicleId)
  if (v) {
    v.odometerKm = km
    v.fuel = fuel
    v.location = v.homeBranchId
    v.keys = { count: 1, holder: 'Şube anahtar dolabı' }
  }
  logEvent(d, { module: 'suppliers', type: 'EngagementReceived', sourceType: 'engagement', sourceId: id, summary: `${e!.no} araç teslim alındı` })
}
export function returnEngagement(d: Db, id: Id, km: number, fuel: FuelLevel, photos: number, note: string): void {
  need(d, 'suppliers:manage', 'Tedarikçiye iade')
  const e = d.engagements.find((x) => x.id === id)
  if (!e || e.status !== 'received') fail('Yalnız teslim alınmış araç iade edilir.')
  if (photos < 4) fail('İade kanıtı için en az 4 fotoğraf gerekir.', { photos: 'En az 4 fotoğraf' })
  e!.status = 'returned'
  e!.returnedAt = nowOf(d)
  e!.returnInspection = { km, fuel, photos, note, at: nowOf(d) }
  const v = d.vehicles.find((x) => x.externalVehicleId === e!.externalVehicleId)
  if (v) {
    v.location = e!.supplierId
    v.keys = { count: 0, holder: 'Tedarikçi' }
  }
  logEvent(d, { module: 'suppliers', type: 'EngagementReturned', sourceType: 'engagement', sourceId: id, summary: `${e!.no} tedarikçiye iade edildi` })
}
/** Supplier payable (settlement). Paying the supplier is a separate cash event; neither is an Expense duplicate. */
export function createSettlement(d: Db, engagementId: Id): void {
  need(d, 'finance:apply', 'Tedarikçi mutabakatı')
  const e = d.engagements.find((x) => x.id === engagementId)
  if (!e || e.status !== 'returned') fail('Mutabakat iade edilmiş anlaşma için yapılır.')
  if (e!.settlementId) fail('Bu anlaşma için mutabakat zaten var.')
  const payable = projectSupplierPayable(e!.dailyCost, e!.receivedAt ?? e!.from, e!.returnedAt ?? e!.to)
  const s = { id: nextId(d, 'st'), supplierId: e!.supplierId, engagementId, payable, status: 'open' as const }
  d.settlements.push(s)
  e!.settlementId = s.id
  logEvent(d, { module: 'suppliers', type: 'SettlementCreated', sourceType: 'engagement', sourceId: engagementId, summary: `${e!.no} tedarikçi borcu ${fmt(payable.minor, payable.cur)}`, cur: payable.cur, minor: payable.minor })
}
export function paySettlement(d: Db, settlementId: Id, reference: string): void {
  need(d, 'finance:apply', 'Tedarikçi ödemesi')
  const s = d.settlements.find((x) => x.id === settlementId)
  if (!s || s.status !== 'open') fail('Mutabakat ödemeye açık değil.')
  if (!reference.trim()) fail('Ödeme referansı girin.', { reference: 'Referans zorunlu' })
  s!.status = 'paid'
  s!.paidAt = nowOf(d)
  s!.paymentRef = reference
  logEvent(d, { module: 'suppliers', type: 'SupplierPaid', sourceType: 'supplier', sourceId: s!.supplierId, summary: `Tedarikçi ödemesi kaydedildi (${reference})`, cur: s!.payable.cur, minor: s!.payable.minor })
}

export { addHistory }
