import type {
  ChecklistAnswer,
  ChecklistItem,
  Cleanliness,
  DamageCategory,
  DamageView,
  ExtensionChannel,
  FuelLevel,
  PhotoAngle,
  RentalCancelReason,
  RentalGateCode,
  RentalStatus,
  VehicleCondition,
} from '@acarvo/shared'

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  prepared: 'Teslim bekliyor',
  delivered: 'Aktif',
  returned: 'İade alındı, kontrol bekliyor',
  closed: 'Kapandı',
  cancelled: 'İptal edildi',
}

/** Text and dot colour (colour is never the only signal: the label is always written). */
export const RENTAL_STATUS_TONE: Record<RentalStatus, { text: string; dot: string }> = {
  prepared: { text: 'text-hold', dot: 'bg-hold' },
  delivered: { text: 'text-blue-ink', dot: 'bg-blue' },
  returned: { text: 'text-hold', dot: 'bg-hold' },
  closed: { text: 'text-ok', dot: 'bg-ok' },
  cancelled: { text: 'text-ink-2', dot: 'bg-ink-3' },
}

export const FUEL_LEVEL_LABELS: Record<FuelLevel, string> = { empty: 'Boş', quarter: '1/4', half: '1/2', three_quarters: '3/4', full: 'Dolu' }
export const FUEL_FRACTION: Record<FuelLevel, number> = { empty: 0, quarter: 0.25, half: 0.5, three_quarters: 0.75, full: 1 }
export const CLEANLINESS_LABELS: Record<Cleanliness, string> = { clean: 'Temiz', acceptable: 'Kabul edilebilir', dirty: 'Kirli' }
export const CONDITION_LABELS: Record<VehicleCondition, string> = { good: 'İyi', minor_issues: 'Küçük kusurlar var', needs_attention: 'İlgilenilmeli' }
export const CHECKLIST_LABELS: Record<ChecklistItem, string> = {
  keys: 'Anahtar',
  registration: 'Ruhsat ve araç belgeleri',
  spare_wheel: 'Stepne / lastik tamir seti',
  warning_triangle: 'Reflektör (üçgen)',
  first_aid_kit: 'İlk yardım çantası',
  lights: 'Farlar ve sinyaller',
  tyres: 'Lastikler',
  windscreen: 'Ön cam',
}
export const CHECKLIST_ANSWER_LABELS: Record<ChecklistAnswer, string> = { ok: 'Tamam', issue: 'Sorun var', not_applicable: 'Yok / uygulanmaz' }
export const PHOTO_ANGLE_LABELS: Record<PhotoAngle, string> = { front: 'Ön', rear: 'Arka', left: 'Sol', right: 'Sağ', interior: 'İç', other: 'Diğer' }
export const DAMAGE_VIEW_LABELS: Record<DamageView, string> = { front: 'Ön', rear: 'Arka', left: 'Sol yan', right: 'Sağ yan', top: 'Üst' }
export const DAMAGE_CATEGORY_LABELS: Record<DamageCategory, string> = { scratch: 'Çizik', dent: 'Göçük', crack: 'Çatlak / kırık', stain: 'Leke', missing_part: 'Eksik parça', other: 'Diğer' }
export const RENTAL_CANCEL_REASON_LABELS: Record<RentalCancelReason, string> = {
  customer_request: 'Müşterinin talebi',
  vehicle_problem: 'Araçla ilgili sorun',
  documents_missing: 'Belgeler eksik veya uygun değil',
  entry_error: 'Hatalı kayıt',
  other: 'Diğer',
}
export const EXTENSION_CHANNEL_LABELS: Record<ExtensionChannel, string> = { phone: 'Telefon', branch: 'Şubede', email: 'E-posta', corporate: 'Kurumsal hesap', other: 'Diğer' }

/** Handover desk / close gates: title, and what the state means. Facts only; nothing here is a legal verdict. */
export const GATE_LABELS: Record<RentalGateCode, string> = {
  drivers: 'Ana sürücü',
  branch_country: 'Başlangıç şubesinin ülkesi',
  documents: 'Belge kontrolü (her sürücü)',
  vehicle_active: 'Araç hizmette',
  availability: 'Araç bu dönemde boş',
  previous_return_open: 'Aracın önceki iade kontrolü',
  vehicle_location: 'Aracın kayıtlı konumu',
  handover_record: 'Teslim kaydı (km, yakıt, kontrol listesi, teslim alan)',
  photos: 'Teslim fotoğrafları (4–5)',
  external_terms: 'Sözleşme ve fiyat',
  return_record: 'İade kontrolü (temizlik, durum, kontrol listesi)',
  findings: 'Yeni hasar bulguları',
  pricing: 'Fiyat',
  contract: 'Sözleşme',
}

const plural = (n: unknown, word: string) => `${n} ${word}`
/** One line explaining the gate's state, from its detail (numbers, plates and record numbers only). */
export function gateText(code: RentalGateCode, state: string, d: Record<string, string | number | null> = {}, kind: 'handover' | 'return' = 'handover'): string {
  switch (code) {
    case 'drivers':
      return state === 'ok' ? 'Ana sürücü seçildi.' : 'Ana sürücü seçilmedi. Kiralamayı düzenleyip ana sürücüyü belirleyin.'
    case 'branch_country':
      return state === 'ok' ? 'Belge kuralı bu ülkeye göre uygulanır.' : 'Şubenin ülkesi tanımlı değil. Yetkili kişi Şubeler ekranından ülkeyi girmeli; ülke tahmin edilmez.'
    case 'documents':
      if (state === 'ok') return 'Her sürücü için personel kararı verildi.'
      if (state === 'attention') return `Karar verildi. ${plural(d.staffOnly, 'sürücü')} için ülke belge kuralı tanımlı değil: personel kontrolüne dayanıyor, sistem doğrulaması değil.`
      return [d.missing ? `${plural(d.missing, 'sürücü')} için belge kararı yok` : '', d.notEligible ? `${plural(d.notEligible, 'sürücü')} uygun değil olarak işaretli` : ''].filter(Boolean).join(' · ') || 'Belge kararı gerekli.'
    case 'vehicle_active':
      return state === 'ok' ? 'Araç hizmette.' : `${d.plate ?? 'Araç'} hizmet dışı; teslim edilemez.`
    case 'availability':
      if (state === 'ok') return 'Teslimden planlanan iadeye kadar başka rezervasyon veya kiralama yok.'
      if (d.reason === 'return_passed') return 'Planlanan iade zamanı geçti. Önce iade zamanını güncelleyin.'
      return `Bu sürede araç dolu: ${d.refs ?? ''}.`
    case 'previous_return_open':
      return state === 'ok' ? 'Aracın açık iade kontrolü yok.' : `Aracın önceki kiralamasının (${d.rentalNo}) iade kontrolü tamamlanmadı.`
    case 'vehicle_location':
      if (state === 'ok') return 'Araç başlangıç şubesinde kayıtlı.'
      if (!d.locationType) return 'Aracın konum kaydı yok. Teslimden önce aracın şubede olduğunu kontrol edin.'
      return d.locationType === 'branch' ? `Araç ${d.branchCode} şubesinde kayıtlı. Teslimden önce aracın burada olduğunu kontrol edin; otomatik transfer yapılmaz.` : 'Araç şubede kayıtlı değil. Teslimden önce aracın yerini kontrol edin.'
    case 'handover_record':
      return state === 'ok' ? 'Km, yakıt, temizlik, genel durum, kontrol listesi ve teslim alan kişi girildi.' : `${plural(d.missing, 'alan')} eksik. Kontrol listesindeki her madde açıkça yanıtlanmalı.`
    case 'photos':
      return state === 'ok' ? `${d.count} fotoğraf yüklendi.` : `${d.count ?? 0} fotoğraf var; ${kind === 'handover' ? 'teslim' : 'iade'} için en az 4, en fazla 5 gerçek fotoğraf gerekli.`
    case 'external_terms':
      return state === 'blocked' ? 'Sözleşme ve fiyat modülleri hazır olana kadar teslim kapalı.' : 'ACARVO’da sözleşme ve fiyat yok. Teslimde, bunların ACARVO dışında yönetildiğini açıkça onaylamanız istenir.'
    case 'return_record':
      return state === 'ok' ? 'Temizlik, genel durum ve kontrol listesi girildi.' : `${plural(d.missing, 'alan')} eksik.`
    case 'findings':
      return state === 'ok' ? 'Teslimde olmayan yeni işaret yok.' : `${plural(d.count, 'yeni bulgu')} var. Kapatırken gördüğünüzü onaylayın; hasar dosyası, sorumluluk veya ücret oluşturulmaz.`
    case 'pricing':
      return 'Hesaplanmadı. Fiyatlandırma ve Finans modülleri henüz yok; ödeme, depozito veya borç kaydı oluşturulmaz.'
    case 'contract':
      return 'ACARVO’da sözleşme yok. İmza veya hukuki geçerlilik iddiası yoktur.'
  }
}

/** "3 sa 20 dk" for overdue minutes. */
export function formatLate(minutes: number) {
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return [d && `${d} gün`, h && `${h} sa`, !d && m && `${m} dk`].filter(Boolean).join(' ') || '1 dk'
}
