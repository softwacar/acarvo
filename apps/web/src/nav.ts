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
      { slug: '', label: 'Ana Ekran', icon: House },
      { slug: 'komuta-merkezi', label: 'Komuta Merkezi', icon: Siren },
      { slug: 'filo-asistani', label: 'Filo Asistanı', icon: Lightbulb },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { slug: 'rezervasyonlar', label: 'Rezervasyonlar', icon: CalendarCheck },
      { slug: 'kiralamalar', label: 'Kiralamalar', icon: Key },
      { slug: 'takvim', label: 'Takvim', icon: CalendarBlank },
      { slug: 'gorevler', label: 'Görevler', icon: ClipboardText },
      { slug: 'araclar', label: 'Araçlar', icon: CarProfile, permission: 'vehicles.read', built: true },
      { slug: 'bakim-servis', label: 'Bakım & Servis', icon: Wrench },
      { slug: 'olay-merkezi', label: 'Olay Merkezi', icon: WarningOctagon },
      { slug: 'hasar-kayitlari', label: 'Hasar Kayıtları', icon: Bandaids },
      { slug: 'ceza-modulu', label: 'Ceza Modülü', icon: Gavel },
    ],
  },
  {
    label: 'Müşteri & Ticari',
    items: [
      { slug: 'musteriler', label: 'Müşteriler', icon: Users },
      { slug: 'kurumsal-hesaplar', label: 'Kurumsal Hesaplar', icon: Buildings },
      { slug: 'talep-merkezi', label: 'Talep Merkezi', icon: Tray },
      { slug: 'partnerler', label: 'Partnerler', icon: Handshake },
      { slug: 'arac-tedarikcileri', label: 'Araç Tedarikçileri', icon: Truck },
      { slug: 'fiyatlandirma', label: 'Fiyatlandırma', icon: Tag },
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
      { slug: 'finans', label: 'Finans', icon: Coins },
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
      { slug: 'ayarlar', label: 'Ayarlar', icon: GearSix },
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
  'vehicles.documents.manage': 'Araç belgelerini yönetme',
  'vehicles.photos.manage': 'Araç fotoğraflarını yönetme',
  'branches.read': 'Şubeleri görüntüleme',
  'users.read': 'Kullanıcıları görüntüleme',
  'roles.read': 'Rolleri görüntüleme',
  'audit.read': 'İşlem geçmişini görüntüleme',
}
