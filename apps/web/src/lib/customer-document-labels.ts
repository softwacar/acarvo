import type { CustomerDocumentSide, CustomerDocumentType, CustomerDocumentVerification, CustomerDocumentVoidReason, DocumentValidity, NumberRevealReason, RequirementItemState } from '@acarvo/shared'
import { formatDate } from './vehicle-labels'

export const DOCUMENT_TYPE_LABELS: Record<CustomerDocumentType, string> = {
  national_id: 'Kimlik kartı',
  passport: 'Pasaport',
  driving_license: 'Sürücü belgesi',
  international_driving_permit: 'Uluslararası sürücü belgesi',
  residence_permit: 'Oturma izni',
  visa: 'Vize',
  entry_record: 'Giriş damgası',
  other: 'Diğer belge',
}

export const VERIFICATION_LABELS: Record<CustomerDocumentVerification, string> = {
  not_verified: 'Doğrulanmadı',
  original_seen: 'Aslı görüldü',
  copy_only: 'Yalnız kopyası görüldü',
}

export const VOID_REASON_LABELS: Record<CustomerDocumentVoidReason, string> = {
  entry_error: 'Hatalı giriş',
  duplicate: 'Mükerrer kayıt',
  wrong_customer: 'Yanlış müşteriye girilmiş',
  other: 'Diğer',
}

export const REVEAL_REASON_LABELS: Record<NumberRevealReason, string> = {
  contract_preparation: 'Sözleşme hazırlama',
  official_request: 'Resmi makam talebi',
  document_check: 'Belge doğrulama',
  other: 'Diğer',
}

export const SIDE_LABELS: Record<CustomerDocumentSide, string> = { front: 'Ön yüz', back: 'Arka yüz', page: 'Ek sayfa' }

export const REQUIREMENT_STATE_LABELS: Record<RequirementItemState, string> = {
  ok: 'Karşılanıyor',
  expiring: 'Süresi yaklaşıyor',
  expired: 'Süresi dolmuş',
  not_started: 'Geçerlilik başlamadı',
  missing: 'Eksik',
  unverified: 'Aslı görülmedi',
  copy_missing: 'Kopyası saklanmamış',
}

export type Tone = 'ok' | 'hold' | 'alert' | 'muted'
export const REQUIREMENT_STATE_TONE: Record<RequirementItemState, Tone> = {
  ok: 'ok',
  expiring: 'hold',
  expired: 'alert',
  not_started: 'hold',
  missing: 'alert',
  unverified: 'hold',
  copy_missing: 'hold',
}

/** One line about a document period's validity, from the server's calculation (company date). */
export function validityText(v: DocumentValidity, validUntil: string | null, validFrom: string | null): { text: string; tone: Tone } {
  switch (v.state) {
    case 'expired':
      return { text: `Süresi doldu · ${formatDate(validUntil!)}`, tone: 'alert' }
    case 'expiring':
      return { text: v.daysLeft === 0 ? 'Bugün sona eriyor' : `${v.daysLeft} gün kaldı · ${formatDate(validUntil!)}`, tone: 'hold' }
    case 'valid':
      return { text: `${formatDate(validUntil!)} tarihine kadar geçerli`, tone: 'ok' }
    case 'no_expiry':
      return { text: 'Son geçerlilik tarihi yok', tone: 'muted' }
    case 'not_started':
      return { text: `${formatDate(validFrom!)} tarihinde başlıyor`, tone: 'hold' }
    case 'superseded':
      return { text: 'Yenilendi · önceki dönem', tone: 'muted' }
    case 'voided':
      return { text: 'Geçersiz sayıldı', tone: 'muted' }
  }
}

export const TONE_TEXT: Record<Tone, string> = { ok: 'text-ok', hold: 'text-hold', alert: 'text-alert', muted: 'text-ink-3' }
