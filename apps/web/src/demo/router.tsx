import { type AnyRoute, createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router'
import { type ComponentType, lazy, Suspense } from 'react'
import { L } from './i18n'
import { Guard, DemoShell } from './ui/shell'

// Demo routes: the 36 canonical company links of spec §4 (same URLs as the application), their detail pages, and two
// separate contexts (Platform Console, Partner Portal) that are reached from the Demo menu, never from the sidebar.

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
  const page = (path: string, perm: string, load: Loader) => {
    const Lazy = lazy(load)
    return createRoute({
      getParentRoute: () => shell,
      path,
      validateSearch: passthrough,
      component: () => (
        <Guard perm={perm}>
          <Suspense fallback={<PageSkeleton />}>
            <Lazy />
          </Suspense>
        </Guard>
      ),
    })
  }
  const pages = ROUTES.map(([path, perm, load]) => page(path, perm, load))
  const tree = root.addChildren([shell.addChildren(pages), ...CONTEXT_ROUTES(root)])
  return createRouter({ routeTree: tree, defaultPreload: false, scrollRestoration: true })
}

function CONTEXT_ROUTES(root: AnyRoute): AnyRoute[] {
  void root
  return []
}

// [path, permission, lazy page]. Detail routes share the permission of their list.
const ROUTES: [string, string, Loader][] = [
  ['/', 'dashboard:view', () => import('./pages/home/DashboardPage').then((m) => ({ default: m.DashboardPage }))],
  ['/araclar', 'vehicles:view', () => import('./pages/vehicles/VehiclesPage').then((m) => ({ default: m.VehiclesPage }))],
  ['/araclar/yeni', 'vehicles:manage', () => import('./pages/vehicles/VehicleFormPage').then((m) => ({ default: m.VehicleFormPage }))],
  ['/araclar/$id', 'vehicles:view', () => import('./pages/vehicles/Vehicle360Page').then((m) => ({ default: m.Vehicle360Page }))],
  ['/rezervasyonlar', 'reservations:view', () => import('./pages/reservations/ReservationsPage').then((m) => ({ default: m.ReservationsPage }))],
  ['/rezervasyonlar/yeni', 'reservations:manage', () => import('./pages/reservations/ReservationFormPage').then((m) => ({ default: m.ReservationFormPage }))],
  ['/rezervasyonlar/$id', 'reservations:view', () => import('./pages/reservations/Reservation360Page').then((m) => ({ default: m.Reservation360Page }))],
  ['/kiralamalar', 'rentals:view', () => import('./pages/rentals/RentalsPage').then((m) => ({ default: m.RentalsPage }))],
  ['/kiralamalar/yeni', 'rentals:manage', () => import('./pages/rentals/RentalFormPage').then((m) => ({ default: m.RentalFormPage }))],
  ['/kiralamalar/$id', 'rentals:view', () => import('./pages/rentals/Rental360Page').then((m) => ({ default: m.Rental360Page }))],
  ['/bakim-servis', 'maintenance:view', () => import('./pages/fleet/MaintenancePage').then((m) => ({ default: m.MaintenancePage }))],
  ['/hasar-kayitlari', 'damages:view', () => import('./pages/fleet/DamagesPage').then((m) => ({ default: m.DamagesPage }))],
  ['/olay-merkezi', 'incidents:view', () => import('./pages/fleet/IncidentsPage').then((m) => ({ default: m.IncidentsPage }))],
  ['/ceza-modulu', 'fines:view', () => import('./pages/fleet/FinesPage').then((m) => ({ default: m.FinesPage }))],
  ['/filo-asistani', 'assistant:view', () => import('./pages/work/AssistantPage').then((m) => ({ default: m.AssistantPage }))],
  ['/musteriler', 'customers:view', () => import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage }))],
  ['/musteriler/$id', 'customers:view', () => import('./pages/customers/Customer360Page').then((m) => ({ default: m.Customer360Page }))],
  ['/kurumsal-hesaplar', 'corporate:view', () => import('./pages/customers/CorporatePages').then((m) => ({ default: m.CorporateListPage }))],
  ['/kurumsal-hesaplar/$id', 'corporate:view', () => import('./pages/customers/CorporatePages').then((m) => ({ default: m.Corporate360Page }))],
  ['/talep-merkezi', 'leads:view', () => import('./pages/customers/LeadsPage').then((m) => ({ default: m.LeadsPage }))],
  ['/partnerler', 'partners:view', () => import('./pages/customers/PartnersPage').then((m) => ({ default: m.PartnersPage }))],
  ['/arac-tedarikcileri', 'suppliers:view', () => import('./pages/customers/SuppliersPage').then((m) => ({ default: m.SuppliersPage }))],
  ['/fiyatlandirma', 'pricing:view', () => import('./pages/customers/PricingPage').then((m) => ({ default: m.PricingPage }))],
  ['/finans', 'finance:view', () => import('./pages/finance/FinancePage').then((m) => ({ default: m.FinancePage }))],
  ['/sube-kasalari', 'cash:view', () => import('./pages/finance/CashPage').then((m) => ({ default: m.CashPage }))],
  ['/masraflar', 'expenses:view', () => import('./pages/finance/ExpensesPage').then((m) => ({ default: m.ExpensesPage }))],
  ['/onay-merkezi', 'approvals:view', () => import('./pages/control/ApprovalsPage').then((m) => ({ default: m.ApprovalsPage }))],
  ['/kurallar', 'rules:view', () => import('./pages/control/RulesPage').then((m) => ({ default: m.RulesPage }))],
  ['/riskler-ve-istisnalar', 'risks:view', () => import('./pages/control/RisksPage').then((m) => ({ default: m.RisksPage }))],
  ['/gelir-kontrolu', 'revenue:view', () => import('./pages/analytics/RevenuePage').then((m) => ({ default: m.RevenuePage }))],
  ['/kapasite-planlama', 'capacity:view', () => import('./pages/analytics/CapacityPage').then((m) => ({ default: m.CapacityPage }))],
  ['/takvim', 'calendar:view', () => import('./pages/work/CalendarPage').then((m) => ({ default: m.CalendarPage }))],
  ['/gorevler', 'tasks:view', () => import('./pages/work/TasksPage').then((m) => ({ default: m.TasksPage }))],
  ['/komuta-merkezi', 'command:view', () => import('./pages/work/CommandPage').then((m) => ({ default: m.CommandPage }))],
  ['/rezervasyonlar/$id/duzenle', 'reservations:manage', () => import('./pages/reservations/ReservationFormPage').then((m) => ({ default: m.ReservationFormPage }))],
]
