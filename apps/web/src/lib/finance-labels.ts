import type { ChargeStatus, DepositMethod, DepositStatus, FinanceFileStatus, PaymentMethod, PaymentStatus, RefundStatus } from '@acarvo/shared'

// Finance V1 vocabulary: what staff recorded, what a second person verified, what ACARVO never does (move money).

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Nakit',
  bank_transfer: 'Banka transferi bildirimi',
  external_pos: 'Harici POS kaydı',
  other_external: 'Diğer harici yöntem',
}
export const PAYMENT_METHOD_HINT: Record<PaymentMethod, string> = {
  cash: 'Nakdi siz teslim aldıysanız. Kim ve ne zaman kaydedilir.',
  bank_transfer: 'Müşterinin bildirdiği havale/EFT. Hesaba geçtiği ayrıca doğrulanır.',
  external_pos: 'Şubedeki bağımsız POS cihazından geçen işlem. ACARVO kart tahsilatı yapmaz; yalnız fiş referansı yazılır.',
  other_external: 'ACARVO dışındaki başka bir ödeme yolu (referansla).',
}
export const DEPOSIT_METHOD_LABEL: Record<DepositMethod, string> = {
  cash: 'Nakit',
  bank_transfer: 'Banka transferi bildirimi',
  external_pos: 'Harici POS kaydı',
  external_card_hold: 'Harici kart blokesi (personel beyanı)',
  other_external: 'Diğer harici yöntem',
}
export const CHARGE_STATUS_LABEL: Record<ChargeStatus, string> = {
  pending: 'Onay bekliyor',
  posted: 'Kayıtlı',
  rejected: 'Reddedildi',
  reversal_requested: 'Ters kayıt onayı bekliyor',
  reversed: 'Ters kaydedildi',
}
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  recorded: 'Doğrulama bekliyor',
  verified: 'Yetkili doğruladı',
  rejected: 'Reddedildi',
  reversed: 'Ters kaydedildi',
}
export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  requested: 'Talep edildi',
  reported: 'Alındığı bildirildi',
  verified: 'Yetkili doğruladı (tutuluyor)',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
}
export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  requested: 'Onay bekliyor',
  approved: 'Onaylandı — iade bildirimi bekleniyor',
  completed: 'İade edildiği bildirildi',
  rejected: 'Reddedildi',
  cancelled: 'İptal edildi',
  reversed: 'Ters kaydedildi',
}
export const FILE_STATUS_LABEL: Record<FinanceFileStatus, string> = { open: 'Açık', closed: 'Finansal olarak kapandı', reopened: 'Yeniden açıldı' }

export type Tone = 'ok' | 'hold' | 'alert' | 'muted' | 'blue'
export const TONE_CLASS: Record<Tone, string> = {
  ok: 'border-ok/30 bg-ok-soft text-ok',
  hold: 'border-hold/30 bg-hold-soft text-hold',
  alert: 'border-alert/30 bg-alert-soft text-alert',
  muted: 'border-line bg-ground text-ink-3',
  blue: 'border-blue/25 bg-blue-soft text-blue-ink',
}
export const CHARGE_TONE: Record<ChargeStatus, Tone> = { pending: 'hold', posted: 'ok', rejected: 'muted', reversal_requested: 'hold', reversed: 'muted' }
export const PAYMENT_TONE: Record<PaymentStatus, Tone> = { recorded: 'hold', verified: 'ok', rejected: 'muted', reversed: 'muted' }
export const DEPOSIT_TONE: Record<DepositStatus, Tone> = { requested: 'blue', reported: 'hold', verified: 'ok', rejected: 'muted', cancelled: 'muted' }
export const REFUND_TONE: Record<RefundStatus, Tone> = { requested: 'hold', approved: 'blue', completed: 'ok', rejected: 'muted', cancelled: 'muted', reversed: 'muted' }

export const CLOSE_BLOCKER_LABEL: Record<string, string> = {
  no_file: 'Finans dosyası yok',
  charges_pending: 'Onay bekleyen iç hesap kalemi var',
  payments_pending: 'Doğrulama bekleyen tahsilat var',
  deposits_pending: 'Talep edilmiş veya doğrulanmamış depozito var',
  deposit_in_review: 'İncelemedeki depozito var',
  refunds_pending: 'Sonuçlanmamış depozito iadesi var',
  deposit_held: 'Hâlâ tutulan depozito var',
  outstanding: 'Kalan bakiye var',
  overpaid: 'Fazla tahsilat var (iade veya düzeltme gerekli)',
  no_posted_charges: 'Onaylanmış iç hesap kalemi yok (fiyatlandırılmamış dosya sıfır borçla kapanmaz)',
}

export const EVENT_LABEL: Record<string, string> = {
  opened: 'Finans dosyası açıldı',
  responsible_correction_requested: 'Ödeme sorumlusu düzeltme talebi',
  responsible_corrected: 'Ödeme sorumlusu düzeltildi (ikinci onay)',
  responsible_correction_rejected: 'Ödeme sorumlusu düzeltmesi reddedildi',
  responsible_correction_cancelled: 'Ödeme sorumlusu düzeltme talebi geri çekildi',
  charge_prepared: 'İç hesap kalemi hazırlandı',
  charge_approve: 'Kalem onaylandı (kayıtlı)',
  charge_reject: 'Kalem reddedildi',
  charge_reversal_request: 'Ters kayıt istendi',
  charge_reversal_approve: 'Ters kayıt onaylandı',
  charge_reversal_withdraw: 'Ters kayıt isteği geri çekildi',
  payment_recorded: 'Tahsilat kaydedildi',
  payment_verify: 'Tahsilat yetkili tarafından doğrulandı',
  payment_reject: 'Tahsilat reddedildi',
  payment_reverse: 'Tahsilat ters kaydedildi',
  deposit_requested: 'Depozito talep edildi',
  deposit_reported: 'Depozitonun alındığı bildirildi',
  deposit_report: 'Depozitonun alındığı bildirildi',
  deposit_verify: 'Depozito yetkili tarafından doğrulandı',
  deposit_reject: 'Depozito reddedildi',
  deposit_cancel: 'Depozito talebi iptal edildi',
  deposit_review_opened: 'Depozito incelemeye alındı',
  deposit_review_closed: 'Depozito incelemesi kapandı',
  refund_requested: 'Depozito iadesi talep edildi',
  refund_approve: 'İade onaylandı',
  refund_reject: 'İade reddedildi',
  refund_cancel: 'İade talebi iptal edildi',
  refund_complete: 'İadenin yapıldığı bildirildi',
  refund_reverse: 'İade ters kaydedildi',
  finance_closed: 'Finansal olarak kapatıldı',
  finance_reopened: 'Finans dosyası yeniden açıldı',
}

/** What a deposit means now: a verified deposit is shown as partly or fully returned once returns were reported. */
export function depositState(d: { status: DepositStatus; heldMinor: number; refundedMinor: number; inReview: boolean }): { label: string; tone: Tone } {
  if (d.inReview) return { label: 'İnceleme', tone: 'alert' }
  if (d.status === 'verified' && d.refundedMinor > 0) return d.heldMinor === 0 ? { label: 'Tamamen iade edildiği kaydedildi', tone: 'muted' } : { label: 'Kısmen iade edildiği kaydedildi', tone: 'blue' }
  return { label: DEPOSIT_STATUS_LABEL[d.status], tone: DEPOSIT_TONE[d.status] }
}
