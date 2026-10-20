// Product structure of the V1 demo (decision document ACARVO_V1_URUN_MIMARISI_VE_KARARLAR.md, sections C, H, I, K).
// Pure data and pure functions: no React, no storage. The sidebar, the router, the redirect table and the unit tests
// all read this one file, so the 21-link menu, the 36 legacy links and the V1 / V1.5 / V2 scope cannot drift apart.

export type Scope = 'v1' | 'v15' | 'v2'
export type Tier = 'basic' | 'advanced'
export type Profile = 'simple' | 'standard' | 'advanced'
export type GroupKey = 'general' | 'operations' | 'commercial' | 'finance' | 'control' | 'admin'

export const PROFILES: Profile[] = ['simple', 'standard', 'advanced']

export const GROUPS: { key: GroupKey; tr: string; en: string }[] = [
  { key: 'general', tr: 'Genel', en: 'General' },
  { key: 'operations', tr: 'Operasyon', en: 'Operations' },
  { key: 'commercial', tr: 'Müşteri & Ticari', en: 'Customers & Commercial' },
  { key: 'finance', tr: 'Finans', en: 'Finance' },
  { key: 'control', tr: 'Kontrol ve Raporlar', en: 'Control & Reports' },
  { key: 'admin', tr: 'Yönetim', en: 'Administration' },
]

export interface NavDef {
  slug: string
  tr: string
  en: string
  group: GroupKey
  /** Basic = shown in every working profile; advanced = shown in Standard / Advanced (the owner can switch it). */
  tier: Tier
  /** Permission that makes the link visible (demo simulation of the server permission). */
  perm: string
}

/** The canonical V1 sidebar: 6 groups, 21 links (decision document H.2). Tasks is basic and can never be hidden. */
export const NAV_V1: NavDef[] = [
  { slug: '', tr: 'Ana Ekran', en: 'Home', group: 'general', tier: 'basic', perm: 'dashboard:view' },
  { slug: 'islerim', tr: 'İşlerim', en: 'My Work', group: 'general', tier: 'basic', perm: 'inbox:view' },
  { slug: 'rezervasyonlar', tr: 'Rezervasyonlar', en: 'Reservations', group: 'operations', tier: 'basic', perm: 'reservations:view' },
  { slug: 'kiralamalar', tr: 'Kiralamalar', en: 'Rentals', group: 'operations', tier: 'basic', perm: 'rentals:view' },
  { slug: 'takvim', tr: 'Takvim', en: 'Calendar', group: 'operations', tier: 'basic', perm: 'calendar:view' },
  { slug: 'gorevler', tr: 'Görevler', en: 'Tasks', group: 'operations', tier: 'basic', perm: 'tasks:view' },
  { slug: 'araclar', tr: 'Araçlar', en: 'Vehicles', group: 'operations', tier: 'basic', perm: 'vehicles:view' },
  { slug: 'bakim-servis', tr: 'Bakım & Servis', en: 'Maintenance & Service', group: 'operations', tier: 'basic', perm: 'maintenance:view' },
  { slug: 'hasar-ve-olaylar', tr: 'Hasar ve Olaylar', en: 'Damage & Incidents', group: 'operations', tier: 'basic', perm: 'damages:view' },
  { slug: 'musteriler', tr: 'Müşteriler', en: 'Customers', group: 'commercial', tier: 'basic', perm: 'customers:view' },
  { slug: 'kurumsal-hesaplar', tr: 'Kurumsal Hesaplar', en: 'Corporate Accounts', group: 'commercial', tier: 'advanced', perm: 'corporate:view' },
  { slug: 'fiyatlandirma', tr: 'Fiyatlandırma', en: 'Pricing', group: 'commercial', tier: 'basic', perm: 'pricing:view' },
  { slug: 'finans', tr: 'Finans', en: 'Finance', group: 'finance', tier: 'basic', perm: 'finance:view' },
  { slug: 'masraflar', tr: 'Masraflar', en: 'Expenses', group: 'finance', tier: 'basic', perm: 'expenses:view' },
  { slug: 'sube-kasalari', tr: 'Şube Kasaları', en: 'Branch Cash Registers', group: 'finance', tier: 'advanced', perm: 'cash:view' },
  { slug: 'raporlar', tr: 'Raporlar', en: 'Reports', group: 'control', tier: 'basic', perm: 'reports:view' },
  { slug: 'onay-merkezi', tr: 'Onay Merkezi', en: 'Approval Center', group: 'control', tier: 'advanced', perm: 'approvals:view' },
  { slug: 'subeler', tr: 'Şubeler', en: 'Branches', group: 'admin', tier: 'advanced', perm: 'branches:view' },
  { slug: 'kullanicilar', tr: 'Kullanıcılar ve Roller', en: 'Users & Roles', group: 'admin', tier: 'basic', perm: 'users:view' },
  { slug: 'islem-gecmisi', tr: 'İşlem Geçmişi', en: 'Audit Trail', group: 'admin', tier: 'advanced', perm: 'audit:view' },
  { slug: 'ayarlar', tr: 'Ayarlar', en: 'Settings', group: 'admin', tier: 'basic', perm: 'settings:view' },
]

/** Links the owner can never hide: hiding them would lock the day-to-day work (decision document B.3). */
export const ALWAYS_VISIBLE = new Set(['', 'islerim', 'rezervasyonlar', 'kiralamalar', 'takvim', 'gorevler', 'araclar', 'musteriler', 'finans', 'ayarlar'])

export interface WorkspaceSettings {
  profile: Profile
  /** Links the owner switched off on top of the profile. Never contains an always-visible link. */
  hidden: string[]
  /** Advanced links the owner switched on although the profile hides them. */
  shown: string[]
}

/**
 * Which links the sidebar shows for a profile. Only visibility: permissions, routes and data are untouched, and the
 * hidden screens stay reachable (user menu "other screens", contextual links, search).
 * Standard hides the audit trail from the sidebar (it lives in the user menu and on every record's own timeline);
 * Advanced shows all 21. A single-branch company has no use for a Branches link in the sidebar.
 */
export function profileLinks(ws: WorkspaceSettings, ctx: { activeBranches: number }): string[] {
  const out: string[] = []
  for (const n of NAV_V1) {
    let on: boolean
    if (ws.profile === 'advanced') on = true
    else if (ws.profile === 'standard') on = n.tier === 'basic' || n.slug !== 'islem-gecmisi'
    else on = n.tier === 'basic'
    if (ws.shown.includes(n.slug)) on = true
    if (ws.hidden.includes(n.slug) && !ALWAYS_VISIBLE.has(n.slug)) on = false
    if (n.slug === 'subeler' && ctx.activeBranches < 2 && !ws.shown.includes('subeler')) on = false
    if (on) out.push(n.slug)
  }
  return out
}

export const DEFAULT_WORKSPACE: WorkspaceSettings = { profile: 'advanced', hidden: [], shown: [] }

// ---------------------------------------------------------------- the 36 legacy links (decision document I)

export type LegacyKind = 'same' | 'redirect' | 'deferred' | 'record-screen'
export interface Legacy {
  slug: string
  tr: string
  en: string
  kind: LegacyKind
  /** Where the old address leads (path + search) for `same` / `redirect`. */
  to?: string
  scope: Scope
  /** Short note shown on a not-active page (what replaces it today). */
  noteTr?: string
  noteEn?: string
}

export const LEGACY: Legacy[] = [
  { slug: '', tr: 'Ana Ekran', en: 'Home', kind: 'same', to: '/', scope: 'v1' },
  { slug: 'komuta-merkezi', tr: 'Komuta Merkezi', en: 'Command Center', kind: 'redirect', to: '/islerim', scope: 'v1' },
  { slug: 'filo-asistani', tr: 'Filo Asistanı', en: 'Fleet Assistant', kind: 'deferred', scope: 'v2', noteTr: 'Plaka, müşteri ve kiralama aramasını Ctrl K genel aramasından, hazır olmayan/geciken araç listelerini ilgili ekranların filtrelerinden yapabilirsiniz.', noteEn: 'Search plates, customers and rentals with Ctrl K, and use the filters of the Vehicles and Rentals screens for not-ready and overdue lists.' },
  { slug: 'rezervasyonlar', tr: 'Rezervasyonlar', en: 'Reservations', kind: 'same', to: '/rezervasyonlar', scope: 'v1' },
  { slug: 'kiralamalar', tr: 'Kiralamalar', en: 'Rentals', kind: 'same', to: '/kiralamalar', scope: 'v1' },
  { slug: 'takvim', tr: 'Takvim', en: 'Calendar', kind: 'same', to: '/takvim', scope: 'v1' },
  { slug: 'gorevler', tr: 'Görevler', en: 'Tasks', kind: 'same', to: '/gorevler', scope: 'v1' },
  { slug: 'araclar', tr: 'Araçlar', en: 'Vehicles', kind: 'same', to: '/araclar', scope: 'v1' },
  { slug: 'bakim-servis', tr: 'Bakım & Servis', en: 'Maintenance & Service', kind: 'same', to: '/bakim-servis', scope: 'v1' },
    { slug: 'olay-merkezi', tr: 'Olay Merkezi', en: 'Incident Center', kind: 'redirect', to: '/hasar-ve-olaylar?sekme=olaylar', scope: 'v15' },
  { slug: 'hasar-kayitlari', tr: 'Hasar Kayıtları', en: 'Damage Records', kind: 'redirect', to: '/hasar-ve-olaylar', scope: 'v1' },
    { slug: 'ceza-modulu', tr: 'Ceza Modülü', en: 'Fines', kind: 'redirect', to: '/hasar-ve-olaylar?sekme=cezalar', scope: 'v15' },
  { slug: 'musteriler', tr: 'Müşteriler', en: 'Customers', kind: 'same', to: '/musteriler', scope: 'v1' },
  { slug: 'kurumsal-hesaplar', tr: 'Kurumsal Hesaplar', en: 'Corporate Accounts', kind: 'same', to: '/kurumsal-hesaplar', scope: 'v1' },
  { slug: 'talep-merkezi', tr: 'Talep Merkezi', en: 'Lead Center', kind: 'deferred', scope: 'v15', noteTr: 'Talepler ve Satış Teklifleri V1.5 kapsamındadır. V1’de talep kaynağı rezervasyondaki Kaynak alanı ve müşteri notuyla korunur.', noteEn: 'Leads and Sales Offers are in V1.5. In V1 the lead source is kept in the reservation Channel field and the customer note.' },
  { slug: 'partnerler', tr: 'Partnerler', en: 'Partners', kind: 'deferred', scope: 'v2', noteTr: 'Partner ve komisyon yönetimi V2 kapsamındadır.', noteEn: 'Partner and commission management is in V2.' },
  { slug: 'arac-tedarikcileri', tr: 'Araç Tedarikçileri', en: 'Vehicle Suppliers', kind: 'deferred', scope: 'v2', noteTr: 'Tedarikçi ve alt-kiralama V2 kapsamındadır.', noteEn: 'Suppliers and sub-rental are in V2.' },
  { slug: 'fiyatlandirma', tr: 'Fiyatlandırma', en: 'Pricing', kind: 'same', to: '/fiyatlandirma', scope: 'v1' },
  { slug: 'onay-merkezi', tr: 'Onay Merkezi', en: 'Approval Center', kind: 'same', to: '/onay-merkezi', scope: 'v1' },
  { slug: 'kurallar', tr: 'Kurallar', en: 'Rules', kind: 'deferred', scope: 'v2', noteTr: 'Gelişmiş kural motoru V2 kapsamındadır. Bildirim eşikleri V1’de Ayarlar → Bildirimler altındadır.', noteEn: 'The advanced rule engine is in V2. Notification thresholds live under Settings → Notifications in V1.' },
  { slug: 'gelir-kontrolu', tr: 'Gelir Kontrolü', en: 'Revenue Control', kind: 'redirect', to: '/finans?sekme=dikkat', scope: 'v1' },
  { slug: 'riskler-ve-istisnalar', tr: 'Riskler ve İstisnalar', en: 'Risks & Exceptions', kind: 'redirect', to: '/islerim?sekme=uyarilar', scope: 'v1' },
  { slug: 'kapasite-planlama', tr: 'Kapasite Planlama', en: 'Capacity Planning', kind: 'redirect', to: '/takvim?gorunum=kapasite', scope: 'v15' },
  { slug: 'filo-analizi', tr: 'Filo Analizi', en: 'Fleet Analysis', kind: 'redirect', to: '/raporlar?rapor=filo', scope: 'v1' },
  { slug: 'firsatlar', tr: 'Fırsatlar', en: 'Opportunities', kind: 'deferred', scope: 'v2', noteTr: 'Fırsat önerileri V2 kapsamındadır; faydalı takip önerileri ilgili kaynak ekranda gösterilir.', noteEn: 'Opportunity suggestions are in V2; useful follow-up hints appear on the source screen.' },
  { slug: 'raporlar', tr: 'Raporlar', en: 'Reports', kind: 'same', to: '/raporlar', scope: 'v1' },
  { slug: 'finans', tr: 'Finans', en: 'Finance', kind: 'same', to: '/finans', scope: 'v1' },
  { slug: 'masraflar', tr: 'Masraflar', en: 'Expenses', kind: 'same', to: '/masraflar', scope: 'v1' },
  { slug: 'sube-kasalari', tr: 'Şube Kasaları', en: 'Branch Cash Registers', kind: 'same', to: '/sube-kasalari', scope: 'v1' },
  { slug: 'sozlesmeler', tr: 'Sözleşmeler', en: 'Contracts', kind: 'redirect', to: '/kiralamalar?gorunum=sozlesmeler', scope: 'v1' },
  { slug: 'belge-merkezi', tr: 'Belge Merkezi', en: 'Document Center', kind: 'record-screen', to: '/belge-merkezi', scope: 'v1', noteTr: 'Belgeler kaynak kayıtta (müşteri, araç, kiralama) tutulur; bu ekrana genel aramadan ve kayıt bağlantılarından ulaşılır.', noteEn: 'Documents live on their source record (customer, vehicle, rental); this screen is reached from search and record links.' },
  { slug: 'islem-gecmisi', tr: 'İşlem Geçmişi', en: 'Audit Trail', kind: 'same', to: '/islem-gecmisi', scope: 'v1' },
  { slug: 'subeler', tr: 'Şubeler', en: 'Branches', kind: 'same', to: '/subeler', scope: 'v1' },
  { slug: 'kullanicilar', tr: 'Kullanıcılar', en: 'Users', kind: 'same', to: '/kullanicilar', scope: 'v1' },
  { slug: 'roller-ve-yetkiler', tr: 'Roller ve Yetkiler', en: 'Roles & Permissions', kind: 'redirect', to: '/kullanicilar?sekme=roller', scope: 'v1' },
  { slug: 'ayarlar', tr: 'Ayarlar', en: 'Settings', kind: 'same', to: '/ayarlar', scope: 'v1' },
]

export const legacyOf = (slug: string) => LEGACY.find((l) => l.slug === slug)

export const SCOPE_LABEL: Record<Scope, { tr: string; en: string }> = {
  v1: { tr: 'V1', en: 'V1' },
  v15: { tr: 'V1.5', en: 'V1.5' },
  v2: { tr: 'V2', en: 'V2' },
}

/**
 * Screens that stay in the code but are not part of the V1 product: they open only as a concept preview.
 * The preview is a session choice of a permitted demo user; it never adds a sidebar link.
 */
export const DEFERRED = LEGACY.filter((l) => l.kind === 'deferred')

/** V1.5 views that live inside a V1 screen and open only under the concept preview (never a sidebar link). */
export const GATED_VIEWS: { id: string; tr: string; en: string; scope: Scope; to: string; noteTr: string; noteEn: string }[] = [
  { id: 'capacity', tr: 'Takvim › Kapasite', en: 'Calendar › Capacity', scope: 'v15', to: '/takvim?gorunum=kapasite', noteTr: 'Şube × sınıf × gün kapasitesi; sınıf kapasitesi motoru V1.5 kapsamındadır.', noteEn: 'Branch × class × day capacity; the class-capacity engine is in V1.5.' },
  { id: 'incidents', tr: 'Hasar ve Olaylar › Olaylar', en: 'Damage & Incidents › Incidents', scope: 'v15', to: '/hasar-ve-olaylar?sekme=olaylar', noteTr: 'Olay kaydı ve kanıt.', noteEn: 'Incident records and evidence.' },
  { id: 'fines', tr: 'Hasar ve Olaylar › Cezalar', en: 'Damage & Incidents › Fines', scope: 'v15', to: '/hasar-ve-olaylar?sekme=cezalar', noteTr: 'Trafik cezası ve sürücüye yansıtma.', noteEn: 'Traffic fines and charging the driver.' },
  { id: 'exceptions', tr: 'İşlerim › İstisnalar', en: 'My Work › Exceptions', scope: 'v15', to: '/islerim?sekme=istisnalar', noteTr: 'Kural dışı durumların inceleme kaydı.', noteEn: 'Review records of deviations from the rule.' },
  { id: 'handover', tr: 'İşlerim › Vardiya Devri', en: 'My Work › Shift Handover', scope: 'v15', to: '/islerim?sekme=devir', noteTr: 'Vardiya devir özeti.', noteEn: 'Shift handover summary.' },
]

/** Detail/record paths of a deferred module share the first segment of its slug. */
export function deferredOf(pathname: string): Legacy | undefined {
  const first = pathname.replace(/^\//, '').split('/')[0] ?? ''
  return DEFERRED.find((l) => l.slug === first)
}
