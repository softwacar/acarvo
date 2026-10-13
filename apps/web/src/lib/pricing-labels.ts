import type { ContractStatus } from '@acarvo/shared'

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: 'Taslak',
  under_review: 'Kontrol bekliyor',
  externally_processed: 'Dışarıda işleme alındı',
  archived: 'Arşivlendi',
  superseded: 'Yeni sürümle değiştirildi',
}

export const CONTRACT_ARCHIVE_REASON_LABEL: Record<string, string> = {
  entry_error: 'Hatalı giriş',
  replaced_outside: 'Dışarıda başka sözleşme yapıldı',
  rental_cancelled: 'Kiralama iptal edildi',
  other: 'Diğer',
}

export const PRICE_LIST_STATUS_LABEL: Record<string, string> = { draft: 'Taslak', active: 'Etkin', archived: 'Arşivde' }
export const DAY_METHOD_LABEL: Record<string, string> = { rolling_24h: '24 saatlik dönem', calendar_day: 'Takvim günü' }
export const TAX_MODE_LABEL: Record<string, string> = { not_configured: 'Vergi yapılandırılmadı', exclusive: 'Fiyatlara vergi hariç', inclusive: 'Fiyatlara vergi dahil' }
export const TIER_LABEL: Record<string, string> = { '1-6': '1–6 gün', '7-29': '7–29 gün', '30+': '30+ gün' }
export const LANGUAGE_LABEL: Record<string, string> = { tr: 'Türkçe', bs: 'Boşnakça', en: 'İngilizce', de: 'Almanca', hr: 'Hırvatça', sr: 'Sırpça' }
