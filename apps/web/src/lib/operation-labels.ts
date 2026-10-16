import type {
  AllocationConflict,
  DamageFileView,
  DamageRepairStatus,
  DamageReviewStatus,
  DamageSeverity,
  DamageType,
  DamageUsability,
  MaintenanceStatus,
  MaintenanceType,
  OperationEvent,
  ServiceDueState,
  TransferPurpose,
  TransferStatus,
  TransportMethod,
} from '@acarvo/shared'
import type { Tone } from './finance-labels'

// Maintenance, damage and transfer labels (docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md). Facts only: no liability, fault,
// charge or insurance wording.

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  periodic: 'Periyodik bakım',
  repair: 'Onarım',
  tire: 'Lastik',
  inspection: 'Muayene / kontrol',
  other: 'Diğer',
}
export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  pending_approval: 'Onay bekliyor',
  planned: 'Planlandı',
  in_service: 'Bakımda',
  awaiting_check: 'Kontrol bekliyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
}
export const MAINTENANCE_STATUS_TONE: Record<MaintenanceStatus, Tone> = {
  pending_approval: 'hold',
  planned: 'blue',
  in_service: 'hold',
  awaiting_check: 'hold',
  completed: 'ok',
  cancelled: 'muted',
}
/** What each state means for the vehicle (shown next to the state, so nobody reads "planned" as "in the workshop"). */
export const MAINTENANCE_STATUS_HINT: Record<MaintenanceStatus, string> = {
  pending_approval: 'Aracı tutmaz; çakışmalar çözülüp onaylanınca planlanır.',
  planned: 'Araç planlanan aralıkta bakım için ayrıldı; henüz servise alınmadı.',
  in_service: 'Araç serviste; bitene kadar kiralanamaz.',
  awaiting_check: 'İş bitti, kontrol bekliyor; araç hâlâ kiralanamaz.',
  completed: 'Bakım tamamlandı. Bu, aracın teslime hazır olduğu anlamına gelmez.',
  cancelled: 'İptal edildi; aracı tutmaz.',
}

export const DAMAGE_VIEW_LABELS: Record<DamageFileView, string> = { front: 'Ön', rear: 'Arka', left: 'Sol', right: 'Sağ', top: 'Üst / tavan', interior: 'İç' }
export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  scratch: 'Çizik',
  dent: 'Göçük',
  crack: 'Çatlak',
  glass: 'Cam',
  tire: 'Lastik / jant',
  mechanical: 'Mekanik',
  interior: 'İç mekân',
  missing_part: 'Eksik parça',
  other: 'Diğer',
}
export const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = { minor: 'Hafif', moderate: 'Orta', severe: 'Ağır' }
export const DAMAGE_SEVERITY_TONE: Record<DamageSeverity, Tone> = { minor: 'muted', moderate: 'hold', severe: 'alert' }
export const DAMAGE_USABILITY_LABELS: Record<DamageUsability, string> = { usable: 'Kullanılabilir', restricted: 'Kısıtlı kullanılabilir', not_usable: 'Kullanılamaz' }
export const DAMAGE_REVIEW_LABELS: Record<DamageReviewStatus, string> = { reported: 'Bildirildi', under_review: 'İnceleniyor', assessed: 'Değerlendirildi', closed: 'Kapatıldı' }
export const DAMAGE_REVIEW_TONE: Record<DamageReviewStatus, Tone> = { reported: 'hold', under_review: 'blue', assessed: 'blue', closed: 'muted' }
export const DAMAGE_REPAIR_LABELS: Record<DamageRepairStatus, string> = { not_needed: 'Onarım gerekmiyor', pending: 'Onarım bekliyor', in_repair: 'Onarımda', repaired: 'Onarıldı' }

export const TRANSFER_PURPOSE_LABELS: Record<TransferPurpose, string> = { operational: 'Normal transfer', repair: 'Onarım amaçlı taşıma' }
export const TRANSPORT_METHOD_LABELS: Record<TransportMethod, string> = { tow_truck: 'Çekici', car_carrier: 'Araç taşıyıcı' }
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = { requested: 'Talep edildi', approved: 'Onaylandı', in_transit: 'Yolda', completed: 'Teslim alındı', cancelled: 'İptal' }
export const TRANSFER_STATUS_TONE: Record<TransferStatus, Tone> = { requested: 'hold', approved: 'blue', in_transit: 'hold', completed: 'ok', cancelled: 'muted' }
export const TRANSFER_STATUS_HINT: Record<TransferStatus, string> = {
  requested: 'Aracı tutmaz; çıkış şubesinde onay bekliyor.',
  approved: 'Araç planlanan aralıkta transfer için ayrıldı.',
  in_transit: 'Araç yolda; varış şubesi teslim alana kadar orada sayılmaz.',
  completed: 'Varış şubesinde teslim alındı. Aracın ana şubesi değişmedi.',
  cancelled: 'İptal edildi; aracı tutmaz.',
}

export const SERVICE_DUE_LABELS: Record<ServiceDueState, string> = {
  no_schedule: 'Bakım aralığı tanımlı değil',
  no_history: 'Tamamlanmış periyodik bakım kaydı yok',
  ok: 'Zamanı gelmedi',
  due_soon: 'Yaklaşıyor',
  overdue: 'Zamanı geçti',
}
export const SERVICE_DUE_TONE: Record<ServiceDueState, Tone> = { no_schedule: 'muted', no_history: 'muted', ok: 'ok', due_soon: 'hold', overdue: 'alert' }

export const HOLD_KIND_LABELS: Record<AllocationConflict['kind'], string> = {
  reservation: 'Onaylı rezervasyon',
  rental: 'Kiralama',
  maintenance: 'Bakım',
  damage: 'Hasar engeli',
  transfer: 'Transfer',
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Oluşturuldu',
  updated: 'Güncellendi',
  approved: 'Onaylandı',
  started: 'Servise alındı',
  work_done: 'İş bitti, kontrol bekliyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal edildi',
  photo_added: 'Fotoğraf eklendi',
  photo_removed: 'Fotoğraf kaldırıldı',
  review: 'İnceleme durumu değişti',
  repair: 'Onarım durumu değişti',
  blocked: 'Araç kullanılamaz işaretlendi',
  unblocked: 'Engel kaldırıldı',
  release_requested: 'Engel kaldırma talebi (ikinci onay bekliyor)',
  release_rejected: 'Engel kaldırma talebi reddedildi',
  release_cancelled: 'Engel kaldırma talebi geri çekildi',
  closed: 'Kapatıldı',
  departed: 'Yola çıktı',
  received: 'Varış şubesinde teslim alındı',
}
/** One line per history event; a maintenance sent back from the check reads as such. */
export function eventLabel(e: OperationEvent) {
  if (e.kind === 'started' && e.fromStatus === 'awaiting_check') return 'Kontrolden işe geri gönderildi'
  return EVENT_LABELS[e.kind] ?? e.kind
}
