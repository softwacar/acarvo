import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect, useParams } from '@tanstack/react-router'
import { AppLayout } from './components/AppLayout'
import { ErrorState } from './components/states'
import { ApiRequestError } from './lib/api'
import { BranchesPage } from './pages/BranchesPage'
import { LoginPage } from './pages/LoginPage'
import { ModulePage } from './pages/ModulePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { VehicleFormPage } from './pages/vehicles/VehicleFormPage'
import { VehiclesPage } from './pages/vehicles/VehiclesPage'
import { validateVehicleSearch } from './pages/vehicles/search'
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
const vehicleNewRoute = createRoute({ getParentRoute: () => appRoute, path: '/araclar/yeni', component: () => <VehicleFormPage mode="create" /> })
const vehicleEditRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/araclar/$vehicleId/duzenle',
  component: function EditVehicle() {
    const { vehicleId } = useParams({ from: '/app/araclar/$vehicleId/duzenle' })
    return <VehicleFormPage key={vehicleId} mode="edit" />
  },
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

const routeTree = rootRoute.addChildren([loginRoute, appRoute.addChildren([indexRoute, branchesRoute, vehiclesRoute, vehicleNewRoute, vehicleEditRoute, profileRoute, moduleRoute])])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', scrollRestoration: true })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
