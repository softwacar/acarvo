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

export const NOT_APPLIED_LABEL: Record<string, string> = {
  corporate_agreement: 'kurumsal anlaşma fiyatı',
  one_way: 'tek yön ücreti',
  mileage: 'km sınırı ve aşım',
  insurance_package: 'sigorta paketi',
}

/** "%17" or "%7,5" from basis points. */
export const formatPercentBp = (bp: number) => `%${(bp / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`

export const UNAVAILABLE_LABEL: Record<string, string> = {
  no_price_list: 'Bu şube ve alış günü için etkin bir fiyat listesi yok.',
  ambiguous_price_list: 'Bu şube ve gün için aynı öncelikte birden fazla etkin liste var. Listeyi seçin veya önceliklerini ayırın.',
  engine: 'Fiyat listesi bu kayıt için fiyat üretemedi.',
}

export function problemText(p: { code: string; date?: string; seasons?: string[]; max?: number; minDays?: number }): string {
  switch (p.code) {
    case 'class_not_priced':
      return 'Bu araç sınıfının listede tarifesi yok.'
    case 'season_conflict':
      return `${p.date ?? ''} günü aynı öncelikte çakışan sezonlar var (${(p.seasons ?? []).join(', ')}). Sezon önceliklerini ayırın.`
    case 'extra_unknown':
      return 'Seçilen ek hizmet listede yok veya etkin değil.'
    case 'extra_quantity':
      return `Ek hizmet adedi en fazla ${p.max ?? ''} olabilir.`
    case 'discount_unknown':
      return 'Seçilen indirim listede yok veya etkin değil.'
    case 'discount_min_days':
      return `Bu indirim en az ${p.minDays ?? ''} gün için geçerli.`
    case 'period_invalid':
      return 'Kiralama dönemi geçersiz.'
    default:
      return 'Fiyat hesaplanamadı.'
  }
}
