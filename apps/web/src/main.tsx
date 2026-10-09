import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from './components/Toaster'
import './index.css'
import { ApiRequestError } from './lib/api'
import { createAppRouter } from './router'
import { sessionQuery } from './session'

/** Any 401 means the server ended the session (expiry, revocation): return to sign-in. */
function onApiError(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 401 && router.state.location.pathname !== '/giris') {
    queryClient.setQueryData(sessionQuery.queryKey, null)
    void router.navigate({ to: '/giris', search: { next: router.state.location.href } })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: { retry: (count, e) => !(e instanceof ApiRequestError && e.status < 500 && e.status !== 0) && count < 2, refetchOnWindowFocus: true },
  },
})
const router = createAppRouter(queryClient)

// A page restored from the back/forward cache still shows what was on screen before logout or
// a company switch. Reload it so the session and every image are checked by the server again.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
