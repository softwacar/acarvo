import { type AnyRoute, createRootRoute, createRoute, createRouter, Link, Outlet, redirect } from '@tanstack/react-router'
import { type ComponentType, lazy, Suspense } from 'react'
import { L } from './i18n'
import { LEGACY, legacyOf } from './core/modules'
import { ModuleGate } from './ui/gate'
import { Guard, DemoShell } from './ui/shell'

// Demo routes: the 21 V1 menu screens (decision document H.2), their detail pages, one redirect per legacy link of the
// old 36-link menu (I.3: an old address keeps working and lands on the screen that now holds it), the deferred V1.5 / V2
// screens (kept in the code, behind a not-active page or the concept preview) and two separate contexts (Platform
// Console, Partner Portal) that are reached from the Demo menu, never from the sidebar.

const passthrough = (s: Record<string, unknown>): Record<string, string> => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => [k, String(v)]))

function PageSkeleton() {
  return <div aria-busy="true" aria-label={L('Sayfa yükleniyor', 'Loading page')} className="h-64 animate-pulse rounded-xl bg-line-soft/60" />
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[520px] rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <h1 className="text-[17px] font-semibold">{L('Sayfa bulunamadı', 'Page not found')}</h1>
      <p className="mt-1.5 text-ink-2">{L('Bu adreste bir demo ekranı yok.', 'There is no demo screen at this address.')}</p>
      <Link to={'/' as never} className="mt-4 inline-flex h-10 items-center rounded-lg bg-blue px-4 font-medium text-white hover:bg-blue-ink">
        {L('Ana Ekran', 'Home')}
      </Link>
    </div>
  )
}

type Loader = () => Promise<{ default: ComponentType }>

export function createDemoRouter() {
  const root = createRootRoute({ component: Outlet, notFoundComponent: NotFound })
  const shell = createRoute({ getParentRoute: () => root, id: 'company', component: DemoShell })
  const redirectRoute = (slug: string, to: string) =>
    createRoute({
      getParentRoute: () => shell,
      path: '/' + slug,
      validateSearch: passthrough,
      beforeLoad: ({ search }) => {
        const [target, query] = to.split('?') as [string, string | undefined]
        const extra = Object.fromEntries(new URLSearchParams(query ?? ''))
        throw redirect({ to: target as never, search: { ...(search as Record<string, string>), ...extra } as never })
      },
    })
  const page = (path: string, perm: string, load: Loader, gate?: ReturnType<typeof legacyOf>) => {
    const Lazy = lazy(load)
    return createRoute({
      getParentRoute: () => shell,
      path,
      validateSearch: passthrough,
      component: () => (
        <Guard perm={perm}>
          <ModuleGate legacy={gate}>
            <Suspense fallback={<PageSkeleton />}>
              <Lazy />
            </Suspense>
          </ModuleGate>
        </Guard>
      ),
    })
  }
  const pages = [...ROUTES.map(([path, perm, load]) => page(path, perm, load)), ...DEFERRED_ROUTES.map(([path, perm, load]) => page(path, perm, load, legacyOf(path.slice(1)))), ...REDIRECTS.map((l) => redirectRoute(l.slug, l.to!))]
  const tree = root.addChildren([shell.addChildren(pages), ...CONTEXT_ROUTES(root)])
  return createRouter({ routeTree: tree, defaultPreload: false, scrollRestoration: true })
}

function CONTEXT_ROUTES(root: AnyRoute): AnyRoute[] {
  // Platform Console and Partner Portal are separate contexts: their own layout, no company sidebar.
  const ctx = (path: string, load: Loader) => {
    const Lazy = lazy(load)
    return createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: passthrough,
      component: () => (
        <Suspense fallback={<PageSkeleton />}>
          <Lazy />
        </Suspense>
      ),
    })
  }
  return [
    ctx('/platform', () => import('./pages/contexts/PlatformConsole').then((m) => ({ default: m.PlatformConsole }))),
    ctx('/partner', () => import('./pages/contexts/PartnerPortal').then((m) => ({ default: m.PartnerPortal }))),
  ]
}

// [path, permission, lazy page]. Detail routes share the permission of their list.
const ROUTES: [string, string, Loader][] = [
  ['/', 'dashboard:view', () => import('./pages/home/DashboardPage').then((m) => ({ default: m.DashboardPage }))],
  ['/islerim', 'inbox:view', () => import('./pages/work/InboxPage').then((m) => ({ default: m.InboxPage }))],
  ['/araclar', 'vehicles:view', () => import('./pages/vehicles/VehiclesPage').then((m) => ({ default: m.VehiclesPage }))],
  ['/araclar/yeni', 'vehicles:manage', () => import('./pages/vehicles/VehicleFormPage').then((m) => ({ default: m.VehicleFormPage }))],
  ['/araclar/$id', 'vehicles:view', () => import('./pages/vehicles/Vehicle360Page').then((m) => ({ default: m.Vehicle360Page }))],
  ['/rezervasyonlar', 'reservations:view', () => import('./pages/reservations/ReservationsPage').then((m) => ({ default: m.ReservationsPage }))],
  ['/rezervasyonlar/yeni', 'reservations:manage', () => import('./pages/reservations/ReservationFormPage').then((m) => ({ default: m.ReservationFormPage }))],
  ['/rezervasyonlar/$id', 'reservations:view', () => import('./pages/reservations/Reservation360Page').then((m) => ({ default: m.Reservation360Page }))],
  ['/rezervasyonlar/$id/duzenle', 'reservations:manage', () => import('./pages/reservations/ReservationFormPage').then((m) => ({ default: m.ReservationFormPage }))],
  ['/kiralamalar', 'rentals:view', () => import('./pages/rentals/RentalsPage').then((m) => ({ default: m.RentalsPage }))],
  ['/kiralamalar/yeni', 'rentals:manage', () => import('./pages/rentals/RentalFormPage').then((m) => ({ default: m.RentalFormPage }))],
  ['/kiralamalar/$id', 'rentals:view', () => import('./pages/rentals/Rental360Page').then((m) => ({ default: m.Rental360Page }))],
  ['/takvim', 'calendar:view', () => import('./pages/work/CalendarPage').then((m) => ({ default: m.CalendarPage }))],
  ['/gorevler', 'tasks:view', () => import('./pages/work/TasksPage').then((m) => ({ default: m.TasksPage }))],
  ['/bakim-servis', 'maintenance:view', () => import('./pages/fleet/MaintenancePage').then((m) => ({ default: m.MaintenancePage }))],
  ['/hasar-ve-olaylar', 'damages:view', () => import('./pages/fleet/DamageIncidentsPage').then((m) => ({ default: m.DamageIncidentsPage }))],
  ['/musteriler', 'customers:view', () => import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage }))],
  ['/musteriler/$id', 'customers:view', () => import('./pages/customers/Customer360Page').then((m) => ({ default: m.Customer360Page }))],
  ['/kurumsal-hesaplar', 'corporate:view', () => import('./pages/customers/CorporatePages').then((m) => ({ default: m.CorporateListPage }))],
  ['/kurumsal-hesaplar/$id', 'corporate:view', () => import('./pages/customers/CorporatePages').then((m) => ({ default: m.Corporate360Page }))],
  ['/fiyatlandirma', 'pricing:view', () => import('./pages/customers/PricingPage').then((m) => ({ default: m.PricingPage }))],
  ['/finans', 'finance:view', () => import('./pages/finance/FinancePage').then((m) => ({ default: m.FinancePage }))],
  ['/masraflar', 'expenses:view', () => import('./pages/finance/ExpensesPage').then((m) => ({ default: m.ExpensesPage }))],
  ['/sube-kasalari', 'cash:view', () => import('./pages/finance/CashPage').then((m) => ({ default: m.CashPage }))],
  ['/raporlar', 'reports:view', () => import('./pages/analytics/ReportsPage').then((m) => ({ default: m.ReportsPage }))],
  ['/onay-merkezi', 'approvals:view', () => import('./pages/control/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage }))],
  ['/subeler', 'branches:view', () => import('./pages/admin/BranchesPage').then((m) => ({ default: m.BranchesPage }))],
  ['/kullanicilar', 'users:view', () => import('./pages/admin/UsersRolesPage').then((m) => ({ default: m.UsersRolesPage }))],
  ['/islem-gecmisi', 'audit:view', () => import('./pages/records/AuditPage').then((m) => ({ default: m.AuditPage }))],
  ['/ayarlar', 'settings:view', () => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage }))],
  ['/kurulum', 'settings:view', () => import('./pages/admin/SetupWizardPage').then((m) => ({ default: m.SetupWizardPage }))],
  // Not in the menu: the document list is reached from search and record links (documents live on their source record).
  ['/belge-merkezi', 'documents:view', () => import('./pages/records/DocumentsPage').then((m) => ({ default: m.DocumentsPage }))],
]

// V1.5 / V2 screens: the code stays, the address shows a not-active page unless the concept preview is on.
const DEFERRED_ROUTES: [string, string, Loader][] = [
  ['/filo-asistani', 'assistant:view', () => import('./pages/work/AssistantPage').then((m) => ({ default: m.AssistantPage }))],
  ['/talep-merkezi', 'leads:view', () => import('./pages/customers/LeadsPage').then((m) => ({ default: m.LeadsPage }))],
  ['/partnerler', 'partners:view', () => import('./pages/customers/PartnersPage').then((m) => ({ default: m.PartnersPage }))],
  ['/arac-tedarikcileri', 'suppliers:view', () => import('./pages/customers/SuppliersPage').then((m) => ({ default: m.SuppliersPage }))],
  ['/kurallar', 'rules:view', () => import('./pages/control/RulesPage').then((m) => ({ default: m.RulesPage }))],
  ['/firsatlar', 'opportunities:view', () => import('./pages/analytics/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage }))],
]

// One redirect per legacy link that moved (decision document I.3).
const REDIRECTS = LEGACY.filter((l) => l.kind === 'redirect')
