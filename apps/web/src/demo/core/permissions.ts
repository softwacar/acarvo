import { B } from '../i18n'
import type { Role } from './types'

// Demo permission catalogue: module × action. Used by the role matrix, the menu, search, counts and actions.
// This is a browser-side demo simulation of access; it is not server security and says so in the UI.

export interface PermModule {
  key: string
  label: string
  group: string
  perms: { id: string; label: string; sensitive?: boolean }[]
}

const v = (m: string) => ({ id: `${m}:view`, label: B('Görüntüle', 'View') })
const mg = (m: string, label = B('Yönet', 'Manage')) => ({ id: `${m}:manage`, label })

export const PERM_MODULES: PermModule[] = [
  { key: 'dashboard', label: B('Ana Ekran', 'Home'), group: B('Genel', 'General'), perms: [v('dashboard')] },
  { key: 'command', label: B('Komuta Merkezi', 'Command Center'), group: B('Genel', 'General'), perms: [v('command')] },
  { key: 'assistant', label: B('Filo Asistanı', 'Fleet Assistant'), group: B('Genel', 'General'), perms: [v('assistant')] },
  { key: 'reservations', label: B('Rezervasyonlar', 'Reservations'), group: B('Operasyon', 'Operations'), perms: [v('reservations'), mg('reservations', B('Oluştur / düzenle / iptal', 'Create / edit / cancel')), { id: 'reservations:confirm', label: B('Onayla', 'Confirm') }] },
  { key: 'rentals', label: B('Kiralamalar', 'Rentals'), group: B('Operasyon', 'Operations'), perms: [v('rentals'), mg('rentals', B('Hazırla / uzat / değiştir', 'Prepare / extend / swap')), { id: 'rentals:handover', label: B('Teslim ve iade', 'Handover and return') }] },
  { key: 'calendar', label: B('Takvim', 'Calendar'), group: B('Operasyon', 'Operations'), perms: [v('calendar')] },
  { key: 'tasks', label: B('Görevler', 'Tasks'), group: B('Operasyon', 'Operations'), perms: [v('tasks'), mg('tasks', B('Oluştur / ata', 'Create / assign'))] },
  { key: 'vehicles', label: B('Araçlar', 'Vehicles'), group: B('Operasyon', 'Operations'), perms: [v('vehicles'), mg('vehicles', B('Ekle / düzenle / hazırlık', 'Add / edit / readiness'))] },
  { key: 'maintenance', label: B('Bakım & Servis', 'Maintenance & Service'), group: B('Operasyon', 'Operations'), perms: [v('maintenance'), mg('maintenance')] },
  { key: 'incidents', label: B('Olay Merkezi', 'Incident Center'), group: B('Operasyon', 'Operations'), perms: [v('incidents'), mg('incidents')] },
  { key: 'damages', label: B('Hasar Kayıtları', 'Damage Records'), group: B('Operasyon', 'Operations'), perms: [v('damages'), mg('damages'), { id: 'damages:unblock', label: B('Engel kaldır', 'Lift block') }] },
  { key: 'fines', label: B('Ceza Modülü', 'Fines'), group: B('Operasyon', 'Operations'), perms: [v('fines'), mg('fines')] },
  { key: 'customers', label: B('Müşteriler', 'Customers'), group: B('Müşteri & Ticari', 'Customers & Commercial'), perms: [v('customers'), mg('customers'), { id: 'customers:identity', label: B('Hassas kimlik verisi', 'Sensitive identity data'), sensitive: true }] },
  { key: 'corporate', label: B('Kurumsal Hesaplar', 'Corporate Accounts'), group: B('Müşteri & Ticari', 'Customers & Commercial'), perms: [v('corporate'), mg('corporate')] },
  { key: 'leads', label: B('Talep Merkezi', 'Lead Center'), group: B('Müşteri & Ticari', 'Customers & Commercial'), perms: [v('leads'), mg('leads')] },
  { key: 'partners', label: B('Partnerler', 'Partners'), group: B('Müşteri & Ticari', 'Customers & Commercial'), perms: [v('partners'), mg('partners')] },
  { key: 'suppliers', label: B('Araç Tedarikçileri', 'Vehicle Suppliers'), group: B('Müşteri & Ticari', 'Customers & Commercial'), perms: [v('suppliers'), mg('suppliers')] },
  { key: 'pricing', label: B('Fiyatlandırma', 'Pricing'), group: B('Müşteri & Ticari', 'Customers & Commercial'), perms: [v('pricing'), mg('pricing')] },
  { key: 'approvals', label: B('Onay Merkezi', 'Approval Center'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('approvals'), { id: 'approvals:request', label: B('Talep et', 'Request') }, { id: 'approvals:decide', label: B('Karar ver', 'Decide') }, { id: 'approvals:apply', label: B('Uygula', 'Apply') }] },
  { key: 'rules', label: B('Kurallar', 'Rules'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('rules'), mg('rules')] },
  { key: 'revenue', label: B('Gelir Kontrolü', 'Revenue Control'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('revenue')] },
  { key: 'risks', label: B('Riskler ve İstisnalar', 'Risks and Exceptions'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('risks'), mg('risks', B('İstisna incele', 'Review exceptions'))] },
  { key: 'capacity', label: B('Kapasite Planlama', 'Capacity Planning'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('capacity')] },
  { key: 'fleet', label: B('Filo Analizi', 'Fleet Analysis'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('fleet')] },
  { key: 'opportunities', label: B('Fırsatlar', 'Opportunities'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('opportunities')] },
  { key: 'reports', label: B('Raporlar', 'Reports'), group: B('Kontrol & Analiz', 'Control & Analysis'), perms: [v('reports'), { id: 'reports:finance', label: B('Finans raporları', 'Finance reports'), sensitive: true }, { id: 'reports:export', label: B('Dışa aktar', 'Export') }] },
  { key: 'finance', label: B('Finans', 'Finance'), group: B('Finans', 'Finance'), perms: [v('finance'), { id: 'finance:record', label: B('Tahsilat kaydet', 'Record payments') }, { id: 'finance:apply', label: B('Uygula / iptal / kapat', 'Apply / void / close'), sensitive: true }] },
  { key: 'expenses', label: B('Masraflar', 'Expenses'), group: B('Finans', 'Finance'), perms: [v('expenses'), mg('expenses')] },
  { key: 'cash', label: B('Şube Kasaları', 'Branch Cash'), group: B('Finans', 'Finance'), perms: [v('cash'), { id: 'cash:manage', label: B('Oturum aç / hareket', 'Open session / movements') }, { id: 'cash:close', label: B('Kasa kapat', 'Close drawer') }] },
  { key: 'contracts', label: B('Sözleşmeler', 'Contracts'), group: B('Kayıtlar', 'Records'), perms: [v('contracts'), mg('contracts')] },
  { key: 'documents', label: B('Belge Merkezi', 'Document Center'), group: B('Kayıtlar', 'Records'), perms: [v('documents'), mg('documents', B('Belge ekle', 'Add document'))] },
  { key: 'audit', label: B('İşlem Geçmişi', 'Audit Trail'), group: B('Kayıtlar', 'Records'), perms: [v('audit')] },
  { key: 'branches', label: B('Şubeler', 'Branches'), group: B('Yönetim', 'Administration'), perms: [v('branches'), mg('branches')] },
  { key: 'users', label: B('Kullanıcılar', 'Users'), group: B('Yönetim', 'Administration'), perms: [v('users'), mg('users')] },
  { key: 'roles', label: B('Roller ve Yetkiler', 'Roles and Permissions'), group: B('Yönetim', 'Administration'), perms: [v('roles'), mg('roles')] },
  { key: 'settings', label: B('Ayarlar', 'Settings'), group: B('Yönetim', 'Administration'), perms: [v('settings'), mg('settings'), { id: 'settings:fx', label: B('Döviz kurları', 'Exchange rates'), sensitive: true }] },
]

export const ALL_PERMS = PERM_MODULES.flatMap((m) => m.perms.map((p) => p.id))

const without = (...ids: string[]) => ALL_PERMS.filter((p) => !ids.includes(p))
const only = (...ids: string[]) => ids.filter((p) => ALL_PERMS.includes(p))

export const DEMO_ROLES: Role[] = [
  { id: 'role-owner', name: B('Sahip', 'Owner'), description: B('Şirket sahibi: tüm ekranlar ve tüm işlemler.', 'Company owner: all screens and all actions.'), system: true, perms: ['*'] },
  {
    id: 'role-manager',
    name: B('Yönetici', 'Manager'),
    description: B('Operasyon ve finans yönetimi. Kullanıcı, rol, ayar ve döviz kuru yönetimi yok.', 'Operations and finance management. No user, role, settings or exchange-rate management.'),
    system: true,
    perms: without('roles:manage', 'users:manage', 'settings:manage', 'settings:fx', 'branches:manage', 'roles:view'),
  },
  {
    id: 'role-accountant',
    name: B('Muhasebe', 'Accounting'),
    description: B('Finans, masraf, kasa ve finansal raporlar. Operasyon kayıtlarını yönetmez.', 'Finance, expenses, cash and financial reports. Does not manage operational records.'),
    system: true,
    perms: only('dashboard:view', 'rentals:view', 'reservations:view', 'vehicles:view', 'customers:view', 'corporate:view', 'pricing:view', 'finance:view', 'finance:record', 'finance:apply', 'expenses:view', 'expenses:manage', 'cash:view', 'cash:manage', 'cash:close', 'reports:view', 'reports:finance', 'reports:export', 'revenue:view', 'approvals:view', 'approvals:request', 'approvals:apply', 'contracts:view', 'documents:view', 'audit:view', 'fines:view', 'partners:view', 'suppliers:view'),
  },
  {
    id: 'role-ops',
    name: B('Operasyon', 'Operations'),
    description: B('Resepsiyon ve şube operasyonu. Finans raporu, onay kararı ve ayar yok.', 'Front desk and branch operations. No finance reports, approval decisions or settings.'),
    system: true,
    perms: only('dashboard:view', 'command:view', 'assistant:view', 'reservations:view', 'reservations:manage', 'reservations:confirm', 'rentals:view', 'rentals:manage', 'rentals:handover', 'calendar:view', 'tasks:view', 'tasks:manage', 'vehicles:view', 'vehicles:manage', 'maintenance:view', 'maintenance:manage', 'incidents:view', 'incidents:manage', 'damages:view', 'damages:manage', 'fines:view', 'customers:view', 'customers:manage', 'corporate:view', 'leads:view', 'leads:manage', 'pricing:view', 'approvals:view', 'approvals:request', 'finance:view', 'finance:record', 'cash:view', 'cash:manage', 'contracts:view', 'contracts:manage', 'documents:view', 'documents:manage', 'capacity:view'),
  },
  {
    id: 'role-fleet',
    name: B('Filo Sorumlusu', 'Fleet Officer'),
    description: B('Özel rol örneği: yalnız filo, bakım ve hasar.', 'Custom role example: fleet, maintenance and damage only.'),
    system: false,
    perms: only('dashboard:view', 'assistant:view', 'calendar:view', 'tasks:view', 'vehicles:view', 'vehicles:manage', 'maintenance:view', 'maintenance:manage', 'damages:view', 'damages:manage', 'incidents:view', 'fleet:view', 'capacity:view', 'documents:view', 'documents:manage'),
  },
]
