import type { Tone } from '@/lib/finance-labels'
import { L } from '../i18n'

// One vocabulary for every status in the demo. Status is never colour-only: each has a word.

export interface StatusDef {
  label: string
  tone: Tone
}
type Dict = Record<string, () => StatusDef>
const s = (tr: string, en: string, tone: Tone) => () => ({ label: L(tr, en), tone })

export const STATUS: Record<string, Dict> = {
  reservation: {
    pending: s('Bekliyor', 'Pending', 'hold'),
    confirmed: s('Onaylı', 'Confirmed', 'blue'),
    converted: s('Kiralamaya dönüştü', 'Converted', 'ok'),
    cancelled: s('İptal', 'Cancelled', 'muted'),
    no_show: s('Gelmedi', 'No-show', 'alert'),
  },
  rental: {
    prepared: s('Hazırlanıyor', 'Prepared', 'hold'),
    delivered: s('Teslim edildi', 'Delivered', 'blue'),
    returned: s('İade alındı', 'Returned', 'hold'),
    closed: s('Operasyonel kapandı', 'Closed', 'ok'),
    cancelled: s('İptal', 'Cancelled', 'muted'),
    exception_closed: s('İstisnai kapandı', 'Exception closed', 'alert'),
    loss_closed: s('Kayıp kapanışı', 'Loss closed', 'alert'),
  },
  finance: { open: s('Finans açık', 'Finance open', 'hold'), closed: s('Finansal kapandı', 'Financially closed', 'ok') },
  bucket: {
    available: s('Müsait', 'Available', 'ok'),
    reserved: s('Rezerve', 'Reserved', 'blue'),
    rented: s('Kirada', 'Rented', 'blue'),
    maintenance: s('Bakımda', 'In service', 'hold'),
    transfer: s('Transferde', 'Transfer', 'muted'),
    unavailable: s('Kullanılamaz', 'Unavailable', 'alert'),
  },
  maintenance: { planned: s('Planlandı', 'Planned', 'blue'), in_progress: s('Devam ediyor', 'In progress', 'hold'), completed: s('Tamamlandı', 'Completed', 'ok'), cancelled: s('İptal', 'Cancelled', 'muted') },
  damage: { reported: s('Bildirildi', 'Reported', 'hold'), investigating: s('İnceleniyor', 'Investigating', 'blue'), liability_set: s('Sorumluluk belirlendi', 'Liability set', 'blue'), closed: s('Kapalı', 'Closed', 'ok') },
  incident: { open: s('Açık', 'Open', 'alert'), investigating: s('İnceleniyor', 'Investigating', 'hold'), resolved: s('Çözüldü', 'Resolved', 'ok'), closed: s('Kapalı', 'Closed', 'muted') },
  severity: { low: s('Düşük', 'Low', 'muted'), medium: s('Orta', 'Medium', 'hold'), high: s('Yüksek', 'High', 'alert'), critical: s('Kritik', 'Critical', 'alert'), minor: s('Hafif', 'Minor', 'muted'), moderate: s('Orta', 'Moderate', 'hold'), severe: s('Ağır', 'Severe', 'alert') },
  fine: { recorded: s('Kaydedildi', 'Recorded', 'hold'), liability_pending: s('Sorumluluk bekleniyor', 'Liability pending', 'hold'), assigned: s('Sorumlu belirlendi', 'Assigned', 'blue'), closed: s('Kapalı', 'Closed', 'ok') },
  task: { open: s('Açık', 'Open', 'hold'), in_progress: s('Devam ediyor', 'In progress', 'blue'), done: s('Tamamlandı', 'Done', 'ok') },
  priority: { urgent: s('Acil', 'Urgent', 'alert'), high: s('Yüksek', 'High', 'hold'), normal: s('Normal', 'Normal', 'muted') },
  approval: { requested: s('Talep edildi', 'Requested', 'hold'), approved: s('Onaylandı (uygulanmadı)', 'Approved (not applied)', 'blue'), rejected: s('Reddedildi', 'Rejected', 'muted'), applied: s('Uygulandı', 'Applied', 'ok') },
  payment: { recorded: s('Kaydedildi (uygulanmadı)', 'Recorded (not applied)', 'hold'), applied: s('Uygulandı', 'Applied', 'ok'), voided: s('İptal (ters kayıt)', 'Voided', 'muted') },
  charge: { pending: s('Bekliyor', 'Pending', 'hold'), posted: s('Kaydedildi', 'Posted', 'ok'), voided: s('İptal', 'Voided', 'muted') },
  deposit: { none: s('Yok', 'None', 'muted'), requested: s('İstendi', 'Requested', 'hold'), held: s('Tutuluyor', 'Held', 'blue'), released: s('İade edildi', 'Released', 'ok'), applied: s('Bakiyeye mahsup', 'Applied', 'ok'), waived: s('Muaf', 'Waived', 'muted') },
  refund: { requested: s('Onay bekliyor', 'Requested', 'hold'), approved: s('Onaylandı', 'Approved', 'blue'), completed: s('İade edildi (kayıt)', 'Completed', 'ok'), rejected: s('Reddedildi', 'Rejected', 'muted') },
  expense: { draft: s('Taslak', 'Draft', 'hold'), posted: s('Kaydedildi', 'Posted', 'ok'), voided: s('İptal', 'Voided', 'muted') },
  drawer: { open: s('Açık', 'Open', 'ok'), closed: s('Kapalı', 'Closed', 'muted') },
  lead: { new: s('Yeni', 'New', 'blue'), contacted: s('İletişimde', 'Contacted', 'hold'), quoted: s('Teklif verildi', 'Quoted', 'blue'), accepted: s('Kabul', 'Accepted', 'ok'), lost: s('Kayıp', 'Lost', 'muted'), converted: s('Rezervasyona dönüştü', 'Converted', 'ok') },
  quote: { draft: s('Taslak', 'Draft', 'hold'), sent: s('Gönderildi', 'Sent', 'blue'), accepted: s('Kabul edildi', 'Accepted', 'ok'), rejected: s('Reddedildi', 'Rejected', 'muted'), expired: s('Süresi doldu', 'Expired', 'muted'), superseded: s('Yeni sürümle değişti', 'Superseded', 'muted') },
  sourcing: { open: s('Teklif bekliyor', 'Open', 'hold'), offered: s('Teklif geldi', 'Offered', 'blue'), accepted: s('Kabul edildi', 'Accepted', 'ok'), declined: s('Reddedildi', 'Declined', 'muted'), cancelled: s('İptal', 'Cancelled', 'muted') },
  engagement: { confirmed: s('Onaylı (teslim alınmadı)', 'Confirmed (not received)', 'hold'), received: s('Teslim alındı', 'Received', 'ok'), returned: s('İade edildi', 'Returned', 'muted'), cancelled: s('İptal', 'Cancelled', 'muted') },
  settlement: { open: s('Ödenmedi', 'Open', 'hold'), paid: s('Ödendi (kayıt)', 'Paid', 'ok') },
  user: { active: s('Etkin', 'Active', 'ok'), inactive: s('Pasif', 'Inactive', 'muted'), invited: s('Davet kaydı', 'Invited', 'hold') },
  rule: { draft: s('Taslak', 'Draft', 'hold'), active: s('Aktif', 'Active', 'ok'), archived: s('Arşiv', 'Archived', 'muted') },
  exception: { open: s('Açık', 'Open', 'hold'), reviewed: s('İncelendi', 'Reviewed', 'blue'), accepted: s('Kabul', 'Accepted', 'ok'), rejected: s('Reddedildi', 'Rejected', 'muted') },
  tenant: { active: s('Etkin', 'Active', 'ok'), trial: s('Deneme', 'Trial', 'hold'), suspended: s('Askıda', 'Suspended', 'alert') },
  contract: { issued: s('Üretildi (imza bekliyor)', 'Issued (unsigned)', 'hold'), signed: s('İmzalandı', 'Signed', 'ok'), superseded: s('Yeni sürümle değişti', 'Superseded', 'muted') },
  doc: { valid: s('Geçerli', 'Valid', 'ok'), expiring: s('Süresi yaklaşıyor', 'Expiring', 'hold'), expired: s('Süresi dolmuş', 'Expired', 'alert'), missing: s('Eksik', 'Missing', 'alert') },
  plan: { planned: s('Planlandı', 'Planned', 'blue'), partially_paid: s('Kısmen ödendi', 'Partially paid', 'hold'), overdue: s('Gecikti', 'Overdue', 'alert'), completed: s('Tamamlandı', 'Completed', 'ok') },
  waitlist: { waiting: s('Bekliyor', 'Waiting', 'hold'), offered: s('Teklif edildi', 'Offered', 'blue'), converted: s('Rezervasyona dönüştü', 'Converted', 'ok'), expired: s('Süresi doldu', 'Expired', 'muted') },
  transfer: { requested: s('Talep edildi', 'Requested', 'hold'), in_transit: s('Yolda', 'In transit', 'blue'), completed: s('Tamamlandı', 'Completed', 'ok'), cancelled: s('İptal', 'Cancelled', 'muted') },
}

export function statusOf(kind: keyof typeof STATUS, value: string): StatusDef {
  const f = STATUS[kind]?.[value]
  return f ? f() : { label: value, tone: 'muted' }
}

export const METHOD_LABEL = () => ({ cash: L('Nakit', 'Cash'), card: L('Kart (POS)', 'Card (POS)'), transfer: L('Banka havalesi', 'Bank transfer'), other: L('Diğer', 'Other') })
export const CHANNEL_LABEL = () => ({ phone: L('Telefon', 'Phone'), walk_in: L('Şubede', 'Walk-in'), web_form: L('Web formu', 'Web form'), partner: L('Partner', 'Partner'), corporate: L('Kurumsal', 'Corporate'), quote: L('Teklif', 'Quote') })
export const FUEL_LABEL = () => ({ empty: L('Boş', 'Empty'), quarter: '1/4', half: '1/2', three_quarters: '3/4', full: L('Dolu', 'Full') })
export const FUEL_TYPE_LABEL = () => ({ petrol: L('Benzin', 'Petrol'), diesel: L('Dizel', 'Diesel'), hybrid: L('Hibrit', 'Hybrid'), electric: L('Elektrik', 'Electric') })
export const MAINT_TYPE_LABEL = () => ({ periodic: L('Periyodik bakım', 'Periodic service'), repair: L('Onarım', 'Repair'), tire: L('Lastik', 'Tyres'), cleaning: L('Temizlik', 'Cleaning'), inspection: L('Muayene', 'Inspection') })
export const INCIDENT_KIND_LABEL = () => ({ accident: L('Kaza', 'Accident'), breakdown: L('Arıza', 'Breakdown'), theft: L('Hırsızlık / kayıp', 'Theft / loss'), complaint: L('Şikayet', 'Complaint'), safety: L('Güvenlik', 'Safety'), other: L('Diğer', 'Other') })
export const LIABILITY_LABEL = () => ({ undetermined: L('Belirlenmedi', 'Undetermined'), customer: L('Müşteri (muafiyet kadar)', 'Customer (up to excess)'), insurer: L('Sigorta / üçüncü taraf', 'Insurer / third party'), company: L('Şirket', 'Company') })
