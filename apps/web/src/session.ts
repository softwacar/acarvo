import type { Permission, SessionInfo } from '@acarvo/shared'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { authApi } from './lib/api'

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: authApi.session,
  staleTime: 60_000,
})

/** Signed-in session. Only used under the authenticated layout, where it is guaranteed. */
export function useSession(): SessionInfo {
  const { data } = useQuery(sessionQuery)
  if (!data) throw new Error('useSession outside an authenticated route')
  return data
}

export function can(session: SessionInfo, permission?: Permission) {
  return !permission || session.permissions.includes(permission)
}
