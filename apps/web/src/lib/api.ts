import type { ApiError, SessionInfo } from '@acarvo/shared'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message)
  }
}

let csrfToken: string | null = null
async function csrf(refresh = false) {
  if (!csrfToken || refresh) {
    const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    csrfToken = ((await res.json()) as { token: string }).token
  }
  return csrfToken
}

async function toError(res: Response) {
  const body = (await res.json().catch(() => null)) as ApiError | null
  return new ApiRequestError(
    res.status,
    body?.error.code ?? 'NETWORK',
    body?.error.message ?? 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.',
    body?.error.fields,
  )
}

/** JSON request to the API. Mutations carry the CSRF token; an expired token is renewed once. */
export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const send = async (retry: boolean): Promise<Response> => {
    const headers: Record<string, string> = {}
    if (method !== 'GET') {
      headers['content-type'] = 'application/json'
      headers['x-csrf-token'] = await csrf(retry)
    }
    let res: Response
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers,
        credentials: 'same-origin',
        body: method === 'GET' ? undefined : JSON.stringify(init.body ?? {}),
      })
    } catch {
      throw new ApiRequestError(0, 'NETWORK', 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.')
    }
    if (res.status === 403 && !retry && method !== 'GET') {
      const err = await toError(res.clone())
      if (err.code === 'CSRF_INVALID') return send(true)
    }
    return res
  }
  const res = await send(false)
  if (!res.ok) throw await toError(res)
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const authApi = {
  /** Current session, or null when signed out. */
  session: async () => {
    try {
      return await api<SessionInfo>('/auth/session')
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) return null
      throw e
    }
  },
  login: (email: string, password: string) => api<SessionInfo>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  revokeAll: () => api<void>('/auth/sessions/revoke-all', { method: 'POST' }),
  switchCompany: (companyId: string) => api<SessionInfo>('/auth/switch-company', { method: 'POST', body: { companyId } }),
}

export interface BranchRow {
  id: string
  name: string
  code: string
}
export const branchesApi = {
  list: () => api<{ items: BranchRow[] }>('/branches'),
}
