import type { Permission } from '@acarvo/shared'
import {
  Bandaids,
  Buildings,
  CalendarBlank,
  CalendarCheck,
  CarProfile,
  ChartBar,
  ChartLineUp,
  ChartPieSlice,
  ClipboardText,
  ClockCounterClockwise,
  Coins,
  FileText,
  Files,
  GearSix,
  Gavel,
  Handshake,
  House,
  type Icon,
  Key,
  Lightbulb,
  ListChecks,
  MapPin,
  Receipt,
  SealCheck,
  ShieldCheck,
  ShieldWarning,
  Signature,
  Siren,
  Tag,
  Tray,
  TrendUp,
  Truck,
  UserList,
  Users,
  Vault,
  WarningOctagon,
  Wrench,
} from '@phosphor-icons/react'

export interface NavItem {
  slug: string
  label: string
  icon: Icon
  /** Hidden from users without this permission. Links without one are visible to every member. */
  permission?: Permission
  /** True once the module works end to end with real data. */
  built?: boolean
}
export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Spec §4: the single canonical sidebar. 7 groups, 36 links. */
export const NAV: NavGroup[] = [
  {
    label: 'Genel',
    items: [
      { slug: '', label: 'Ana Ekran', icon: House, built: true },
      { slug: 'komuta-merkezi', label: 'Komuta Merkezi', icon: Siren },
      { slug: 'filo-asistani', label: 'Filo Asistanı', icon: Lightbulb },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { slug: 'rezervasyonlar', label: 'Rezervasyonlar', icon: CalendarCheck, permission: 'reservations.read', built: true },
      { slug: 'kiralamalar', label: 'Kiralamalar', icon: Key, permission: 'rentals.read', built: true },
      { slug: 'takvim', label: 'Takvim', icon: CalendarBlank },
      { slug: 'gorevler', label: 'Görevler', icon: ClipboardText },
      { slug: 'araclar', label: 'Araçlar', icon: CarProfile, permission: 'vehicles.read', built: true },
      { slug: 'bakim-servis', label: 'Bakım & Servis', icon: Wrench, permission: 'maintenance.read', built: true },
      { slug: 'olay-merkezi', label: 'Olay Merkezi', icon: WarningOctagon },
      { slug: 'hasar-kayitlari', label: 'Hasar Kayıtları', icon: Bandaids, permission: 'damage.read', built: true },
      { slug: 'ceza-modulu', label: 'Ceza Modülü', icon: Gavel },
    ],
  },
  {
    label: 'Müşteri & Ticari',
    items: [
      { slug: 'musteriler', label: 'Müşteriler', icon: Users, permission: 'customers.read', built: true },
      { slug: 'kurumsal-hesaplar', label: 'Kurumsal Hesaplar', icon: Buildings, permission: 'corporate.read', built: true },
      { slug: 'talep-merkezi', label: 'Talep Merkezi', icon: Tray },
      { slug: 'partnerler', label: 'Partnerler', icon: Handshake },
      { slug: 'arac-tedarikcileri', label: 'Araç Tedarikçileri', icon: Truck },
      { slug: 'fiyatlandirma', label: 'Fiyatlandırma', icon: Tag, permission: 'pricing.read', built: true },
    ],
  },
  {
    label: 'Kontrol & Analiz',
    items: [
      { slug: 'onay-merkezi', label: 'Onay Merkezi', icon: SealCheck },
      { slug: 'kurallar', label: 'Kurallar', icon: ListChecks },
      { slug: 'gelir-kontrolu', label: 'Gelir Kontrolü', icon: ChartLineUp },
      { slug: 'riskler-ve-istisnalar', label: 'Riskler ve İstisnalar', icon: ShieldWarning },
      { slug: 'kapasite-planlama', label: 'Kapasite Planlama', icon: ChartBar },
      { slug: 'filo-analizi', label: 'Filo Analizi', icon: ChartPieSlice },
      { slug: 'firsatlar', label: 'Fırsatlar', icon: TrendUp },
      { slug: 'raporlar', label: 'Raporlar', icon: FileText },
    ],
  },
  {
    label: 'Finans',
    items: [
      { slug: 'finans', label: 'Finans', icon: Coins, permission: 'finance.read', built: true },
      { slug: 'masraflar', label: 'Masraflar', icon: Receipt },
      { slug: 'sube-kasalari', label: 'Şube Kasaları', icon: Vault },
    ],
  },
  {
    label: 'Kayıtlar',
    items: [
      { slug: 'sozlesmeler', label: 'Sözleşmeler', icon: Signature },
      { slug: 'belge-merkezi', label: 'Belge Merkezi', icon: Files },
      { slug: 'islem-gecmisi', label: 'İşlem Geçmişi', icon: ClockCounterClockwise, permission: 'audit.read' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { slug: 'subeler', label: 'Şubeler', icon: MapPin, permission: 'branches.read', built: true },
      { slug: 'kullanicilar', label: 'Kullanıcılar', icon: UserList, permission: 'users.read' },
      { slug: 'roller-ve-yetkiler', label: 'Roller ve Yetkiler', icon: ShieldCheck, permission: 'roles.read' },
      { slug: 'ayarlar', label: 'Ayarlar', icon: GearSix, built: true },
    ],
  },
]

export const NAV_ITEMS = NAV.flatMap((g) => g.items.map((item) => ({ ...item, group: g.label })))

export function findNavItem(slug: string) {
  return NAV_ITEMS.find((i) => i.slug === slug)
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  'vehicles.read': 'Araçları görüntüleme',
  'vehicles.create': 'Araç ekleme',
  'vehicles.update': 'Araç düzenleme',
  'vehicles.documents.read': 'Araç belgelerini görüntüleme',
  'vehicles.documents.manage': 'Araç belgelerini yönetme',
  'vehicles.photos.manage': 'Araç fotoğraflarını yönetme',
  'vehicles.odometer.record': 'Kilometre okuması girme',
  'vehicles.location.record': 'Araç konumunu güncelleme',
  'vehicles.history.correct': 'Kilometre ve konum kayıtlarını düzeltme',
  'customers.read': 'Müşterileri görüntüleme',
  'customers.manage': 'Müşteri ekleme, düzenleme ve arşivleme',
  'customers.documents.read': 'Müşteri belgelerini görüntüleme (maskeli)',
  'customers.documents.manage': 'Müşteri belgesi ekleme ve düzeltme',
  'customers.documents.view': 'Müşteri belge görüntüsünü açma',
  'customers.documents.download': 'Müşteri belge dosyasını indirme',
  'customers.identity.reveal': 'Tam belge numarasını açma (gerekçeyle)',
  'corporate.read': 'Kurumsal hesapları görüntüleme',
  'corporate.manage': 'Kurumsal hesap ekleme, düzenleme ve kişi bağlama',
  'reservations.read': 'Rezervasyonları görüntüleme',
  'reservations.manage': 'Rezervasyon oluşturma, düzenleme ve iptal',
  'reservations.confirm': 'Rezervasyon onaylama',
  'rentals.read': 'Kiralamaları görüntüleme',
  'rentals.manage': 'Kiralama hazırlama, düzenleme, uzatma, iptal ve belge kararı',
  'rentals.handover': 'Araç teslimi, iadesi, kontrolü ve kapanışı',
  'pricing.read': 'Fiyat listelerini ve teklifleri görüntüleme',
  'pricing.quote': 'Rezervasyon ve kiralama için fiyat teklifi oluşturma',
  'pricing.manage': 'Fiyat listelerini, tarifeleri, sezonları, ek hizmetleri, indirimleri ve vergi ayarını yönetme',
  'contracts.read': 'Sözleşmeleri görüntüleme',
  'contracts.manage': 'Sözleşme taslağı oluşturma ve durumunu yönetme',
  'contracts.download': 'Sözleşme PDF dosyasını indirme',
  'branches.read': 'Şubeleri görüntüleme',
  'branches.manage': 'Şube ülkesini yönetme',
  'settings.documents.manage': 'Müşteri belge gereksinimlerini yönetme',
  'settings.contracts.manage': 'Sözleşme şablonlarını yönetme',
  'finance.read': 'Finans görüntüleme (kiralama ve cari)',
  'finance.payments.record': 'Tahsilat kaydı oluşturma',
  'finance.payments.verify': 'Tahsilat doğrulama',
  'finance.charges.manage': 'İç hesap kalemi hazırlama ve ters kayıt isteme',
  'finance.charges.approve': 'İç hesap kalemi ve ters kayıt onaylama',
  'finance.deposits.record': 'Depozito kaydı oluşturma',
  'finance.deposits.verify': 'Depozito doğrulama ve inceleme',
  'finance.refunds.request': 'Depozito iadesi talep etme',
  'finance.refunds.approve': 'Depozito iadesi onaylama ve tamamlandı bildirimi',
  'finance.reports.read': 'Finans merkezi listeleri ve raporları',
  'finance.close': 'Finansal kapanış ve yeniden açma',
  'maintenance.read': 'Bakım kayıtlarını görüntüleme',
  'maintenance.manage': 'Bakım planlama, servise alma ve iş kaydı',
  'maintenance.approve': 'Bakım planı onayı ve bakım tamamlama',
  'damage.read': 'Hasar dosyalarını görüntüleme',
  'damage.report': 'Hasar bildirme ve aracı kullanılamaz işaretleme',
  'damage.review': 'Hasar inceleme, onarım durumu ve kapatma',
  'damage.unblock': 'Hasar engelini kaldırma',
  'transfers.read': 'Araç transferlerini görüntüleme',
  'transfers.request': 'Transfer talebi oluşturma ve iptal',
  'transfers.approve': 'Transfer onaylama',
  'transfers.execute': 'Transfer çıkışı ve varışta teslim alma',
  'transfers.repair': 'Kullanılamaz aracın onarım amaçlı taşınması (çekici / taşıyıcı)',
  'readiness.read': 'Operasyonel hazırlık durumunu görüntüleme',
  'settings.rentals.manage': 'Kiralama çalışma modunu (dış sözleşme ve fiyat) yönetme',
  'users.read': 'Kullanıcıları görüntüleme',
  'roles.read': 'Rolleri görüntüleme',
  'audit.read': 'İşlem geçmişini görüntüleme',
}
