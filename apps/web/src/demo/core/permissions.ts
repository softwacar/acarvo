import type { Role } from './types'

// Demo permission catalogue: module × action. Used by the role matrix, the menu, search, counts and actions.
// This is a browser-side demo simulation of access; it is not server security and says so in the UI.

export interface PermModule {
  key: string
  label: string
  group: string
  perms: { id: string; label: string; sensitive?: boolean }[]
}

const v = (m: string) => ({ id: `${m}:view`, label: 'Görüntüle' })
const mg = (m: string, label = 'Yönet') => ({ id: `${m}:manage`, label })

export const PERM_MODULES: PermModule[] = [
  { key: 'dashboard', label: 'Ana Ekran', group: 'Genel', perms: [v('dashboard')] },
  { key: 'command', label: 'Komuta Merkezi', group: 'Genel', perms: [v('command')] },
  { key: 'assistant', label: 'Filo Asistanı', group: 'Genel', perms: [v('assistant')] },
  { key: 'reservations', label: 'Rezervasyonlar', group: 'Operasyon', perms: [v('reservations'), mg('reservations', 'Oluştur / düzenle / iptal'), { id: 'reservations:confirm', label: 'Onayla' }] },
  { key: 'rentals', label: 'Kiralamalar', group: 'Operasyon', perms: [v('rentals'), mg('rentals', 'Hazırla / uzat / değiştir'), { id: 'rentals:handover', label: 'Teslim ve iade' }] },
  { key: 'calendar', label: 'Takvim', group: 'Operasyon', perms: [v('calendar')] },
  { key: 'tasks', label: 'Görevler', group: 'Operasyon', perms: [v('tasks'), mg('tasks', 'Oluştur / ata')] },
  { key: 'vehicles', label: 'Araçlar', group: 'Operasyon', perms: [v('vehicles'), mg('vehicles', 'Ekle / düzenle / hazırlık')] },
  { key: 'maintenance', label: 'Bakım & Servis', group: 'Operasyon', perms: [v('maintenance'), mg('maintenance')] },
  { key: 'incidents', label: 'Olay Merkezi', group: 'Operasyon', perms: [v('incidents'), mg('incidents')] },
  { key: 'damages', label: 'Hasar Kayıtları', group: 'Operasyon', perms: [v('damages'), mg('damages'), { id: 'damages:unblock', label: 'Engel kaldır' }] },
  { key: 'fines', label: 'Ceza Modülü', group: 'Operasyon', perms: [v('fines'), mg('fines')] },
  { key: 'customers', label: 'Müşteriler', group: 'Müşteri & Ticari', perms: [v('customers'), mg('customers'), { id: 'customers:identity', label: 'Hassas kimlik verisi', sensitive: true }] },
  { key: 'corporate', label: 'Kurumsal Hesaplar', group: 'Müşteri & Ticari', perms: [v('corporate'), mg('corporate')] },
  { key: 'leads', label: 'Talep Merkezi', group: 'Müşteri & Ticari', perms: [v('leads'), mg('leads')] },
  { key: 'partners', label: 'Partnerler', group: 'Müşteri & Ticari', perms: [v('partners'), mg('partners')] },
  { key: 'suppliers', label: 'Araç Tedarikçileri', group: 'Müşteri & Ticari', perms: [v('suppliers'), mg('suppliers')] },
  { key: 'pricing', label: 'Fiyatlandırma', group: 'Müşteri & Ticari', perms: [v('pricing'), mg('pricing')] },
  { key: 'approvals', label: 'Onay Merkezi', group: 'Kontrol & Analiz', perms: [v('approvals'), { id: 'approvals:request', label: 'Talep et' }, { id: 'approvals:decide', label: 'Karar ver' }, { id: 'approvals:apply', label: 'Uygula' }] },
  { key: 'rules', label: 'Kurallar', group: 'Kontrol & Analiz', perms: [v('rules'), mg('rules')] },
  { key: 'revenue', label: 'Gelir Kontrolü', group: 'Kontrol & Analiz', perms: [v('revenue')] },
  { key: 'risks', label: 'Riskler ve İstisnalar', group: 'Kontrol & Analiz', perms: [v('risks'), mg('risks', 'İstisna incele')] },
  { key: 'capacity', label: 'Kapasite Planlama', group: 'Kontrol & Analiz', perms: [v('capacity')] },
  { key: 'fleet', label: 'Filo Analizi', group: 'Kontrol & Analiz', perms: [v('fleet')] },
  { key: 'opportunities', label: 'Fırsatlar', group: 'Kontrol & Analiz', perms: [v('opportunities')] },
  { key: 'reports', label: 'Raporlar', group: 'Kontrol & Analiz', perms: [v('reports'), { id: 'reports:finance', label: 'Finans raporları', sensitive: true }, { id: 'reports:export', label: 'Dışa aktar' }] },
  { key: 'finance', label: 'Finans', group: 'Finans', perms: [v('finance'), { id: 'finance:record', label: 'Tahsilat kaydet' }, { id: 'finance:apply', label: 'Uygula / iptal / kapat', sensitive: true }] },
  { key: 'expenses', label: 'Masraflar', group: 'Finans', perms: [v('expenses'), mg('expenses')] },
  { key: 'cash', label: 'Şube Kasaları', group: 'Finans', perms: [v('cash'), { id: 'cash:manage', label: 'Oturum aç / hareket' }, { id: 'cash:close', label: 'Kasa kapat' }] },
  { key: 'contracts', label: 'Sözleşmeler', group: 'Kayıtlar', perms: [v('contracts'), mg('contracts')] },
  { key: 'documents', label: 'Belge Merkezi', group: 'Kayıtlar', perms: [v('documents'), mg('documents', 'Belge ekle')] },
  { key: 'audit', label: 'İşlem Geçmişi', group: 'Kayıtlar', perms: [v('audit')] },
  { key: 'branches', label: 'Şubeler', group: 'Yönetim', perms: [v('branches'), mg('branches')] },
  { key: 'users', label: 'Kullanıcılar', group: 'Yönetim', perms: [v('users'), mg('users')] },
  { key: 'roles', label: 'Roller ve Yetkiler', group: 'Yönetim', perms: [v('roles'), mg('roles')] },
  { key: 'settings', label: 'Ayarlar', group: 'Yönetim', perms: [v('settings'), mg('settings'), { id: 'settings:fx', label: 'Döviz kurları', sensitive: true }] },
]

export const ALL_PERMS = PERM_MODULES.flatMap((m) => m.perms.map((p) => p.id))

const without = (...ids: string[]) => ALL_PERMS.filter((p) => !ids.includes(p))
const only = (...ids: string[]) => ids.filter((p) => ALL_PERMS.includes(p))

export const DEMO_ROLES: Role[] = [
  { id: 'role-owner', name: 'Sahip', description: 'Şirket sahibi: tüm ekranlar ve tüm işlemler.', system: true, perms: ['*'] },
  {
    id: 'role-manager',
    name: 'Yönetici',
    description: 'Operasyon ve finans yönetimi. Kullanıcı, rol, ayar ve döviz kuru yönetimi yok.',
    system: true,
    perms: without('roles:manage', 'users:manage', 'settings:manage', 'settings:fx', 'branches:manage', 'roles:view'),
  },
  {
    id: 'role-accountant',
    name: 'Muhasebe',
    description: 'Finans, masraf, kasa ve finansal raporlar. Operasyon kayıtlarını yönetmez.',
    system: true,
    perms: only('dashboard:view', 'rentals:view', 'reservations:view', 'vehicles:view', 'customers:view', 'corporate:view', 'pricing:view', 'finance:view', 'finance:record', 'finance:apply', 'expenses:view', 'expenses:manage', 'cash:view', 'cash:manage', 'cash:close', 'reports:view', 'reports:finance', 'reports:export', 'revenue:view', 'approvals:view', 'approvals:request', 'approvals:apply', 'contracts:view', 'documents:view', 'audit:view', 'fines:view', 'partners:view', 'suppliers:view'),
  },
  {
    id: 'role-ops',
    name: 'Operasyon',
    description: 'Resepsiyon ve şube operasyonu. Finans raporu, onay kararı ve ayar yok.',
    system: true,
    perms: only('dashboard:view', 'command:view', 'assistant:view', 'reservations:view', 'reservations:manage', 'reservations:confirm', 'rentals:view', 'rentals:manage', 'rentals:handover', 'calendar:view', 'tasks:view', 'tasks:manage', 'vehicles:view', 'vehicles:manage', 'maintenance:view', 'maintenance:manage', 'incidents:view', 'incidents:manage', 'damages:view', 'damages:manage', 'fines:view', 'customers:view', 'customers:manage', 'corporate:view', 'leads:view', 'leads:manage', 'pricing:view', 'approvals:view', 'approvals:request', 'finance:view', 'finance:record', 'cash:view', 'cash:manage', 'contracts:view', 'contracts:manage', 'documents:view', 'documents:manage', 'capacity:view'),
  },
  {
    id: 'role-fleet',
    name: 'Filo Sorumlusu',
    description: 'Özel rol örneği: yalnız filo, bakım ve hasar.',
    system: false,
    perms: only('dashboard:view', 'assistant:view', 'calendar:view', 'tasks:view', 'vehicles:view', 'vehicles:manage', 'maintenance:view', 'maintenance:manage', 'damages:view', 'damages:manage', 'incidents:view', 'fleet:view', 'capacity:view', 'documents:view', 'documents:manage'),
  },
]
