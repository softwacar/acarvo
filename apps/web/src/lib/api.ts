import type { ApiError, SessionInfo, VehicleActivityItem, VehicleDocumentDetail, VehicleDocumentsResponse, VehiclePhoto, VehiclePhotoList, VehicleClassSummary, VehicleDetail, VehicleHistory, VehicleListResponse } from '@acarvo/shared'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    readonly details?: unknown,
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
    body?.error.details,
  )
}

/** JSON request to the API. Mutations carry the CSRF token; an expired token is renewed once. */
export async function api<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<T> {
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

export const vehiclesApi = {
  list: (search: Record<string, string | number | undefined>) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(search)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return api<VehicleListResponse>(`/vehicles?${qs}`)
  },
  get: (id: string) => api<VehicleDetail>(`/vehicles/${id}`),
  create: (body: unknown) => api<VehicleDetail>('/vehicles', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<VehicleDetail>(`/vehicles/${id}`, { method: 'PUT', body }),
  classes: () => api<{ items: VehicleClassSummary[] }>('/vehicle-classes'),
}

export const vehicle360Api = {
  history: (id: string) => api<VehicleHistory>(`/vehicles/${id}/history`),
  activity: (id: string) => api<{ items: VehicleActivityItem[] }>(`/vehicles/${id}/activity`),
}

/** Multipart upload with progress (fetch has no upload progress). Same CSRF and error rules as api(). */
export function uploadFile<T>(path: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  const send = (token: string, retry: boolean): Promise<T> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `/api${path}`)
      xhr.withCredentials = true
      xhr.setRequestHeader('x-csrf-token', token)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
      xhr.onload = () => {
        let body: ApiError | T | null = null
        try {
          body = JSON.parse(xhr.responseText)
        } catch {
          body = null
        }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(body as T)
        const err = (body as ApiError | null)?.error
        if (xhr.status === 403 && err?.code === 'CSRF_INVALID' && !retry) {
          return void csrf(true).then((t) => send(t, true).then(resolve, reject), reject)
        }
        reject(new ApiRequestError(xhr.status, err?.code ?? 'NETWORK', err?.message ?? 'Yükleme tamamlanamadı.', err?.fields, err?.details))
      }
      xhr.onerror = () => reject(new ApiRequestError(0, 'NETWORK', 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.'))
      const form = new FormData()
      form.append('file', file)
      xhr.send(form)
    })
  return csrf().then((t) => send(t, false))
}

export const photosApi = {
  list: (vehicleId: string) => api<VehiclePhotoList>(`/vehicles/${vehicleId}/photos`),
  upload: (vehicleId: string, file: File, onProgress?: (f: number) => void) => uploadFile<VehiclePhoto>(`/vehicles/${vehicleId}/photos`, file, onProgress),
  reorder: (vehicleId: string, photoIds: string[]) => api<VehiclePhotoList>(`/vehicles/${vehicleId}/photos/order`, { method: 'PUT', body: { photoIds } }),
  makePrimary: (vehicleId: string, photoId: string) => api<VehiclePhotoList>(`/vehicles/${vehicleId}/photos/${photoId}/primary`, { method: 'POST' }),
  remove: (vehicleId: string, photoId: string) => api<VehiclePhotoList>(`/vehicles/${vehicleId}/photos/${photoId}`, { method: 'DELETE' }),
}

export const documentsApi = {
  list: (vehicleId: string) => api<VehicleDocumentsResponse>(`/vehicles/${vehicleId}/documents`),
  get: (vehicleId: string, docId: string) => api<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${docId}`),
  create: (vehicleId: string, body: unknown) => api<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents`, { method: 'POST', body }),
  update: (vehicleId: string, docId: string, body: unknown) => api<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${docId}`, { method: 'PUT', body }),
  activate: (vehicleId: string, docId: string, version: number) =>
    api<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${docId}/activate`, { method: 'POST', body: { version } }),
  renew: (vehicleId: string, docId: string, body: unknown) => api<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${docId}/renew`, { method: 'POST', body }),
  void: (vehicleId: string, docId: string, version: number, reason: string) =>
    api<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${docId}/void`, { method: 'POST', body: { version, reason } }),
  upload: (vehicleId: string, docId: string, file: File, onProgress?: (f: number) => void) =>
    uploadFile<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${docId}/files`, file, onProgress),
}
