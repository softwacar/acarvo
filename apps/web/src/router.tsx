import { CORPORATE_TABS, type CorporateTab, CUSTOMER_TABS, RENTAL_TABS, type RentalTab, RESERVATION_TABS, type ReservationTab, type CustomerTab, VEHICLE_TABS, type VehicleTab } from '@acarvo/shared'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Outlet, redirect, useParams } from '@tanstack/react-router'
import { AppLayout } from './components/AppLayout'
import { ErrorState } from './components/states'
import { ApiRequestError } from './lib/api'
import { BranchesPage } from './pages/BranchesPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePage } from './pages/ModulePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { VehiclesPage } from './pages/vehicles/VehiclesPage'
import { validateVehicleSearch } from './pages/vehicles/search'
import { validateCustomerSearch } from './pages/customers/search'
import { validateCorporateSearch } from './pages/corporate/search'
import { validateReservationSearch } from './pages/reservations/search'
import { validateRentalSearch } from './pages/rentals/search'
import { validateFinanceSearch } from './pages/finance/search'
import { sessionQuery } from './session'

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  errorComponent: ({ error, reset }) => (
    <div className="grid min-h-dvh place-items-center bg-ground px-4">
      <ErrorState
        message={error instanceof ApiRequestError ? error.message : 'Uygulama yüklenirken bir sorun oluştu.'}
        onRetry={() => {
          reset()
          void window.location.reload()
        }}
      />
    </div>
  ),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/giris',
  validateSearch: (s: Record<string, unknown>): { next?: string } => (typeof s.next === 'string' ? { next: s.next } : {}),
  beforeLoad: async ({ context }) => {
    if (await context.queryClient.ensureQueryData(sessionQuery)) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

/** Everything below requires a session; the server enforces the same on every API call. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery)
    if (!session) throw redirect({ to: '/giris', search: location.href === '/' ? {} : { next: location.href } })
  },
  component: AppLayout,
  notFoundComponent: NotFoundPage,
})

const indexRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: () => <ModulePage slug="" /> })
const branchesRoute = createRoute({ getParentRoute: () => appRoute, path: '/subeler', component: BranchesPage })
const vehiclesRoute = createRoute({ getParentRoute: () => appRoute, path: '/araclar', validateSearch: validateVehicleSearch, component: VehiclesPage })
// Vehicle 360° (gallery, documents, history) and the vehicle form load on demand: smaller first load for sign-in and lists.
const vehicleNewRoute = createRoute({ getParentRoute: () => appRoute, path: '/araclar/yeni', component: lazyRouteComponent(() => import('./pages/vehicles/VehicleFormPage'), 'NewVehiclePage') })
const vehicle360Route = createRoute({
  getParentRoute: () => appRoute,
  path: '/araclar/$vehicleId',
  validateSearch: (s: Record<string, unknown>): { sekme?: VehicleTab } =>
    (VEHICLE_TABS as readonly string[]).includes(s.sekme as string) && s.sekme !== 'genel' ? { sekme: s.sekme as VehicleTab } : {},
  component: lazyRouteComponent(() => import('./pages/vehicles/Vehicle360Page'), 'Vehicle360Page'),
})
const vehicleEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/araclar/$vehicleId/duzenle',
  validateSearch: (s: Record<string, unknown>): { geri?: 'arac' } => (s.geri === 'arac' ? { geri: 'arac' } : {}),
  component: lazyRouteComponent(() => import('./pages/vehicles/VehicleFormPage'), 'EditVehiclePage'),
})
const customersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/musteriler',
  validateSearch: validateCustomerSearch,
  component: lazyRouteComponent(() => import('./pages/customers/CustomersPage'), 'CustomersPage'),
})
const customer360Route = createRoute({
  getParentRoute: () => appRoute,
  path: '/musteriler/$customerId',
  validateSearch: (s: Record<string, unknown>): { sekme?: CustomerTab } =>
    (CUSTOMER_TABS as readonly string[]).includes(s.sekme as string) && s.sekme !== 'genel' ? { sekme: s.sekme as CustomerTab } : {},
  component: lazyRouteComponent(() => import('./pages/customers/Customer360Page'), 'Customer360Page'),
})
const corporateRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/kurumsal-hesaplar',
  validateSearch: validateCorporateSearch,
  component: lazyRouteComponent(() => import('./pages/corporate/CorporatePage'), 'CorporatePage'),
})
const corporate360Route = createRoute({
  getParentRoute: () => appRoute,
  path: '/kurumsal-hesaplar/$accountId',
  validateSearch: (s: Record<string, unknown>): { sekme?: CorporateTab } =>
    (CORPORATE_TABS as readonly string[]).includes(s.sekme as string) && s.sekme !== 'genel' ? { sekme: s.sekme as CorporateTab } : {},
  component: lazyRouteComponent(() => import('./pages/corporate/Corporate360Page'), 'Corporate360Page'),
})
const reservationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/rezervasyonlar',
  validateSearch: validateReservationSearch,
  component: lazyRouteComponent(() => import('./pages/reservations/ReservationsPage'), 'ReservationsPage'),
})
const reservationNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/rezervasyonlar/yeni',
  component: lazyRouteComponent(() => import('./pages/reservations/ReservationRoutes'), 'NewReservationPage'),
})
const reservation360Route = createRoute({
  getParentRoute: () => appRoute,
  path: '/rezervasyonlar/$reservationId',
  validateSearch: (s: Record<string, unknown>): { sekme?: ReservationTab } =>
    (RESERVATION_TABS as readonly string[]).includes(s.sekme as string) && s.sekme !== 'genel' ? { sekme: s.sekme as ReservationTab } : {},
  component: lazyRouteComponent(() => import('./pages/reservations/Reservation360Page'), 'Reservation360Page'),
})
const reservationEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/rezervasyonlar/$reservationId/duzenle',
  component: lazyRouteComponent(() => import('./pages/reservations/ReservationRoutes'), 'EditReservationPage'),
})
const rentalsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/kiralamalar',
  validateSearch: validateRentalSearch,
  component: lazyRouteComponent(() => import('./pages/rentals/RentalsPage'), 'RentalsPage'),
})
const rentalNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/kiralamalar/yeni',
  component: lazyRouteComponent(() => import('./pages/rentals/RentalRoutes'), 'NewRentalPage'),
})
const rental360Route = createRoute({
  getParentRoute: () => appRoute,
  path: '/kiralamalar/$rentalId',
  validateSearch: (s: Record<string, unknown>): { sekme?: RentalTab } =>
    (RENTAL_TABS as readonly string[]).includes(s.sekme as string) && s.sekme !== 'genel' ? { sekme: s.sekme as RentalTab } : {},
  component: lazyRouteComponent(() => import('./pages/rentals/Rental360Page'), 'Rental360Page'),
})
const rentalEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/kiralamalar/$rentalId/duzenle',
  component: lazyRouteComponent(() => import('./pages/rentals/RentalRoutes'), 'EditRentalPage'),
})
const rentalHandoverRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/kiralamalar/$rentalId/teslim',
  component: lazyRouteComponent(() => import('./pages/rentals/InspectionPage'), 'HandoverPage'),
})
const rentalReturnRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/kiralamalar/$rentalId/iade',
  component: lazyRouteComponent(() => import('./pages/rentals/InspectionPage'), 'ReturnPage'),
})
const pricingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/fiyatlandirma',
  component: lazyRouteComponent(() => import('./pages/pricing/PricingPage'), 'PricingPage'),
})
const priceListNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/fiyatlandirma/yeni',
  component: lazyRouteComponent(() => import('./pages/pricing/PriceListEditorPage'), 'NewPriceListPage'),
})
const priceListRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/fiyatlandirma/$priceListId',
  component: lazyRouteComponent(() => import('./pages/pricing/PriceListEditorPage'), 'EditPriceListPage'),
})
const financeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/finans',
  validateSearch: validateFinanceSearch,
  component: lazyRouteComponent(() => import('./pages/finance/FinanceCenterPage'), 'FinanceCenterPage'),
})
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ayarlar',
  component: lazyRouteComponent(() => import('./pages/settings/SettingsPage'), 'SettingsPage'),
})
const profileRoute = createRoute({ getParentRoute: () => appRoute, path: '/profil', component: ProfilePage })
const moduleRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/$module',
  component: function Module() {
    const { module } = useParams({ from: '/app/$module' })
    return <ModulePage key={module} slug={module} />
  },
})

const routeTree = rootRoute.addChildren([loginRoute, appRoute.addChildren([indexRoute, branchesRoute, vehiclesRoute, vehicleNewRoute, vehicle360Route, vehicleEditRoute, customersRoute, customer360Route, corporateRoute, corporate360Route, reservationsRoute, reservationNewRoute, reservation360Route, reservationEditRoute, rentalsRoute, rentalNewRoute, rental360Route, rentalEditRoute, rentalHandoverRoute, rentalReturnRoute, pricingRoute, priceListNewRoute, priceListRoute, financeRoute, settingsRoute, profileRoute, moduleRoute])])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', scrollRestoration: true })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
