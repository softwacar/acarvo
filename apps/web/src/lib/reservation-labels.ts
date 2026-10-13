import {
  formatUtcOffset,
  type ReservationCancelReason,
  type ReservationChangeReason,
  type ReservationMoment,
  type ReservationNoShowReason,
  type ReservationSource,
  type ReservationStatus,
  type ReservationWarningCode,
  timeZoneOffsetMs,
} from '@acarvo/shared'

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Bekleyen',
  confirmed: 'Onaylı',
  converted: 'Kiralamaya dönüştü',
  cancelled: 'İptal edildi',
  no_show: 'Gelmedi',
}

/** Text and dot colour of a status badge (colour is never the only signal: the label is always written). */
export const RESERVATION_STATUS_TONE: Record<ReservationStatus, { text: string; dot: string }> = {
  pending: { text: 'text-hold', dot: 'bg-hold' },
  confirmed: { text: 'text-ok', dot: 'bg-ok' },
  converted: { text: 'text-blue-ink', dot: 'bg-blue' },
  cancelled: { text: 'text-ink-2', dot: 'bg-ink-3' },
  no_show: { text: 'text-alert', dot: 'bg-alert' },
}

export const RESERVATION_SOURCE_LABELS: Record<ReservationSource, string> = {
  direct_walk_in: 'Doğrudan / gişe',
  phone: 'Telefon',
  website: 'Web sitesi (elle kayıt)',
  partner: 'İş ortağı',
  corporate: 'Kurumsal',
  returning_customer: 'Tekrar gelen müşteri',
  other: 'Diğer',
}

export const CANCEL_REASON_LABELS: Record<ReservationCancelReason, string> = {
  customer_request: 'Müşterinin talebi',
  no_vehicle: 'Uygun araç yok',
  duplicate: 'Mükerrer kayıt',
  entry_error: 'Hatalı kayıt',
  other: 'Diğer',
}

export const NO_SHOW_REASON_LABELS: Record<ReservationNoShowReason, string> = {
  did_not_arrive: 'Müşteri gelmedi',
  unreachable: 'Müşteriye ulaşılamadı',
  arrived_without_requirements: 'Geldi ama koşulları karşılamadı',
  other: 'Diğer',
}

export const CHANGE_REASON_LABELS: Record<ReservationChangeReason, string> = {
  customer_request: 'Müşterinin talebi',
  operational: 'Operasyonel neden',
  correction: 'Hatalı girişin düzeltilmesi',
  other: 'Diğer',
}

export const WARNING_LABELS: Record<ReservationWarningCode, string> = {
  class_only_cannot_confirm: 'Yalnız araç sınıfı seçili. Onaylamak için belirli bir araç atayın: sınıf kapasitesi henüz doğrulanamıyor.',
  vehicle_not_active: 'Seçilen araç hizmet dışı; bu araçla onay verilemez.',
  driver_not_authorized_for_account: 'Sürücü, kurumsal hesabın yetkili sürücüsü olarak kayıtlı değil.',
  booker_not_linked_to_account: 'Rezervasyonu yapan kişi kurumsal hesapta kayıtlı değil.',
  no_driver: 'Sürücü eklenmemiş. Kiralama öncesi sürücü bilgisi gerekecek.',
  pickup_passed: 'Alış zamanı geçti.',
  vehicle_at_other_branch: 'Aracın ana şubesi alış şubesinden farklı.',
  customer_archived: 'Kişi arşivde.',
}

export const NOT_CHECKED_LABELS: Record<string, string> = {
  maintenance: 'Bakım',
  transfer: 'Transfer',
  rentals: 'Kiralamalar',
  external_sourcing: 'Dış kaynak araçlar',
  vehicle_location: 'Aracın o tarihteki konumu',
}

const pad = (n: number) => String(n).padStart(2, '0')
/** "15.10.2026 10:00" from a wall-time value (no conversion). */
export const formatLocal = (local: string) => `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11, 16)}`

/** The moment in its branch's zone; the zone's offset is added when it differs from the company zone. */
export function formatMoment(m: ReservationMoment, companyZone?: string | null) {
  const text = formatLocal(m.local)
  if (!companyZone || companyZone === m.timeZone) return text
  return `${text} (${formatUtcOffset(timeZoneOffsetMs(Date.parse(m.at), m.timeZone) / 60_000)})`
}

/** "3 gün 4 saat", "18 saat 30 dk". */
export function formatDuration(minutes: number) {
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return [d && `${d} gün`, h && `${h} saat`, m && `${m} dk`].filter(Boolean).join(' ') || '0 dk'
}

export const dayLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
export { pad }
