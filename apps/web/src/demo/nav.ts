import { NAV, type NavItem } from '@/nav'
import { L } from './i18n'

// The company sidebar is the canonical 36-link list of spec §4 (same slugs and icons as the application). The demo only
// adds English labels and the permission that makes a link visible. Platform Console and the Partner Portal are
// separate contexts and never appear here.

const EN: Record<string, string> = {
  '': 'Home',
  'komuta-merkezi': 'Command Center',
  'filo-asistani': 'Fleet Assistant',
  rezervasyonlar: 'Reservations',
  kiralamalar: 'Rentals',
  takvim: 'Calendar',
  gorevler: 'Tasks',
  araclar: 'Vehicles',
  'bakim-servis': 'Maintenance & Service',
  'olay-merkezi': 'Incident Center',
  'hasar-kayitlari': 'Damage Records',
  'ceza-modulu': 'Fines',
  musteriler: 'Customers',
  'kurumsal-hesaplar': 'Corporate Accounts',
  'talep-merkezi': 'Lead Center',
  partnerler: 'Partners',
  'arac-tedarikcileri': 'Vehicle Suppliers',
  fiyatlandirma: 'Pricing',
  'onay-merkezi': 'Approval Center',
  kurallar: 'Rules',
  'gelir-kontrolu': 'Revenue Control',
  'riskler-ve-istisnalar': 'Risks & Exceptions',
  'kapasite-planlama': 'Capacity Planning',
  'filo-analizi': 'Fleet Analysis',
  firsatlar: 'Opportunities',
  raporlar: 'Reports',
  finans: 'Finance',
  masraflar: 'Expenses',
  'sube-kasalari': 'Branch Cash Registers',
  sozlesmeler: 'Contracts',
  'belge-merkezi': 'Document Center',
  'islem-gecmisi': 'Audit Trail',
  subeler: 'Branches',
  kullanicilar: 'Users',
  'roller-ve-yetkiler': 'Roles & Permissions',
  ayarlar: 'Settings',
}
const GROUP_EN: Record<string, string> = { Genel: 'General', Operasyon: 'Operations', 'Müşteri & Ticari': 'Customers & Commercial', 'Kontrol & Analiz': 'Control & Analysis', Finans: 'Finance', Kayıtlar: 'Records', Yönetim: 'Administration' }

export const PERM_OF: Record<string, string> = {
  '': 'dashboard:view',
  'komuta-merkezi': 'command:view',
  'filo-asistani': 'assistant:view',
  rezervasyonlar: 'reservations:view',
  kiralamalar: 'rentals:view',
  takvim: 'calendar:view',
  gorevler: 'tasks:view',
  araclar: 'vehicles:view',
  'bakim-servis': 'maintenance:view',
  'olay-merkezi': 'incidents:view',
  'hasar-kayitlari': 'damages:view',
  'ceza-modulu': 'fines:view',
  musteriler: 'customers:view',
  'kurumsal-hesaplar': 'corporate:view',
  'talep-merkezi': 'leads:view',
  partnerler: 'partners:view',
  'arac-tedarikcileri': 'suppliers:view',
  fiyatlandirma: 'pricing:view',
  'onay-merkezi': 'approvals:view',
  kurallar: 'rules:view',
  'gelir-kontrolu': 'revenue:view',
  'riskler-ve-istisnalar': 'risks:view',
  'kapasite-planlama': 'capacity:view',
  'filo-analizi': 'fleet:view',
  firsatlar: 'opportunities:view',
  raporlar: 'reports:view',
  finans: 'finance:view',
  masraflar: 'expenses:view',
  'sube-kasalari': 'cash:view',
  sozlesmeler: 'contracts:view',
  'belge-merkezi': 'documents:view',
  'islem-gecmisi': 'audit:view',
  subeler: 'branches:view',
  kullanicilar: 'users:view',
  'roller-ve-yetkiler': 'roles:view',
  ayarlar: 'settings:view',
}

export interface DemoNavItem {
  slug: string
  label: string
  icon: NavItem['icon']
  perm: string
  group: string
}
export interface DemoNavGroup {
  key: string
  label: string
  items: DemoNavItem[]
}

export function demoNav(): DemoNavGroup[] {
  return NAV.map((g) => ({
    key: g.label,
    label: L(g.label, GROUP_EN[g.label] ?? g.label),
    items: g.items.map((i) => ({ slug: i.slug, label: L(i.label, EN[i.slug] ?? i.label), icon: i.icon, perm: PERM_OF[i.slug] ?? '', group: g.label })),
  }))
}
export const navItemOf = (slug: string) => demoNav().flatMap((g) => g.items).find((i) => i.slug === slug)
