import type { ApiError, CorporateActivityItem, CorporateDetail, CorporateDuplicateMatch, CorporateListResponse, CorporatePeopleResponse, CustomerCorporateLink, CustomerActivityItem, CustomerDocument, CustomerDocumentsResponse, CustomerDocumentStatus, RequirementItem, RequirementPolicy, CustomerDetail, CustomerDuplicateResponse, CustomerListResponse, HistoryWriteResult, SessionInfo, VehicleActivityItem, VehicleDocumentDetail, VehicleDocumentsResponse, VehiclePhoto, VehiclePhotoList, VehicleClassSummary, VehicleDetail, VehicleHistory, VehicleListResponse } from '@acarvo/shared'

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
  /** ISO country of the branch (M2); null until the owner sets it. */
  country: string | null
}
export const branchesApi = {
  list: () => api<{ items: BranchRow[] }>('/branches'),
  setCountry: (id: string, country: string | null) => api<{ items: BranchRow[] }>(`/branches/${id}/country`, { method: 'PUT', body: { country } }),
  previewCountry: (country: string) => api<{ country: string; branches: { id: string; name: string; code: string }[] }>('/branches/country/preview', { method: 'POST', body: { country } }),
  applyCountry: (country: string, branchIds: string[]) =>
    api<{ changed: string[]; skipped: string[]; items: BranchRow[] }>('/branches/country/apply', { method: 'POST', body: { country, branchIds, confirm: true } }),
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

/** Odometer and location records (docs §8.5). Each call carries expectedVersion and a clientRequestId. */
export const historyApi = {
  recordOdometer: (id: string, body: unknown) => api<HistoryWriteResult>(`/vehicles/${id}/odometer`, { method: 'POST', body }),
  correctOdometer: (id: string, readingId: string, body: unknown) => api<HistoryWriteResult>(`/vehicles/${id}/odometer/${readingId}/correct`, { method: 'POST', body }),
  recordLocation: (id: string, body: unknown) => api<HistoryWriteResult>(`/vehicles/${id}/location`, { method: 'POST', body }),
  correctLocation: (id: string, eventId: string, body: unknown) => api<HistoryWriteResult>(`/vehicles/${id}/location/${eventId}/correct`, { method: 'POST', body }),
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

/** Asks for a short-lived, session-bound grant before a document file can be opened (docs §8.4.4). */
export type DocumentAccessMode = 'view' | 'download' | 'preview'

export const documentsApi = {
  access: (fileId: string, mode: DocumentAccessMode) => api<{ url: string; expiresAt: string }>(`/document-files/${fileId}/access`, { method: 'POST', body: { mode } }),
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

/**
 * Customers (M1). The list is read with POST so that names, phone numbers and e-mail addresses
 * never appear in a URL, the browser history or server logs.
 */
export const customersApi = {
  search: (body: Record<string, unknown>) => api<CustomerListResponse>('/customers/search', { method: 'POST', body }),
  get: (id: string) => api<CustomerDetail>(`/customers/${id}`),
  history: (id: string) => api<{ items: CustomerActivityItem[] }>(`/customers/${id}/history`),
  create: (body: unknown) => api<CustomerDetail>('/customers', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<CustomerDetail>(`/customers/${id}`, { method: 'PUT', body }),
  archive: (id: string, version: number, reason: string) => api<CustomerDetail>(`/customers/${id}/archive`, { method: 'POST', body: { version, reason } }),
  restore: (id: string, version: number) => api<CustomerDetail>(`/customers/${id}/restore`, { method: 'POST', body: { version } }),
  duplicates: (body: Record<string, unknown>) => api<CustomerDuplicateResponse>('/customers/duplicate-check', { method: 'POST', body }),
}

type SubKind = 'channels' | 'tax-ids' | 'addresses'

/** Corporate accounts (M3). Search text, tax ids and contacts travel in request bodies only. */
export const corporateApi = {
  search: (body: Record<string, unknown>) => api<CorporateListResponse>('/corporate-accounts/search', { method: 'POST', body }),
  get: (id: string) => api<CorporateDetail>(`/corporate-accounts/${id}`),
  history: (id: string) => api<{ items: CorporateActivityItem[] }>(`/corporate-accounts/${id}/history`),
  create: (body: unknown) => api<CorporateDetail>('/corporate-accounts', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<CorporateDetail>(`/corporate-accounts/${id}`, { method: 'PUT', body }),
  archive: (id: string, version: number, reason: string) => api<CorporateDetail>(`/corporate-accounts/${id}/archive`, { method: 'POST', body: { version, reason } }),
  restore: (id: string, version: number, reason: string) => api<CorporateDetail>(`/corporate-accounts/${id}/restore`, { method: 'POST', body: { version, reason } }),
  duplicates: (body: Record<string, unknown>) => api<{ matches: CorporateDuplicateMatch[] }>('/corporate-accounts/duplicate-check', { method: 'POST', body }),
  addRecord: (id: string, kind: SubKind, body: unknown) => api<CorporateDetail>(`/corporate-accounts/${id}/${kind}`, { method: 'POST', body }),
  updateRecord: (id: string, kind: SubKind, recordId: string, body: unknown) => api<CorporateDetail>(`/corporate-accounts/${id}/${kind}/${recordId}`, { method: 'PUT', body }),
  removeRecord: (id: string, kind: SubKind, recordId: string, version: number) =>
    api<CorporateDetail & { promotedAddressId?: string | null }>(`/corporate-accounts/${id}/${kind}/${recordId}/remove`, { method: 'POST', body: { version } }),
  people: (id: string) => api<CorporatePeopleResponse>(`/corporate-accounts/${id}/people`),
  link: (id: string, body: unknown) => api<{ id: string }>(`/corporate-accounts/${id}/people`, { method: 'POST', body }),
  updateLink: (id: string, linkId: string, body: unknown) => api<{ id: string }>(`/corporate-accounts/${id}/people/${linkId}`, { method: 'PUT', body }),
  endLink: (id: string, linkId: string, version: number, reason: string) => api<{ id: string }>(`/corporate-accounts/${id}/people/${linkId}/end`, { method: 'POST', body: { version, reason } }),
  customerLinks: (customerId: string) => api<{ items: CustomerCorporateLink[] }>(`/customers/${customerId}/corporate-links`),
}

/** Customer documents (M2). Numbers are sent in bodies only and come back masked; the full number only from reveal. */
export const customerDocumentsApi = {
  list: (customerId: string) => api<CustomerDocumentsResponse>(`/customers/${customerId}/documents`),
  status: (customerId: string) => api<CustomerDocumentStatus>(`/customers/${customerId}/document-status`),
  create: (customerId: string, body: unknown) => api<CustomerDocument>(`/customers/${customerId}/documents`, { method: 'POST', body }),
  update: (customerId: string, docId: string, body: unknown) => api<CustomerDocument>(`/customers/${customerId}/documents/${docId}`, { method: 'PUT', body }),
  renew: (customerId: string, docId: string, body: unknown) => api<CustomerDocument>(`/customers/${customerId}/documents/${docId}/renew`, { method: 'POST', body }),
  verify: (customerId: string, docId: string, version: number, verification: 'original_seen' | 'copy_only') =>
    api<CustomerDocument>(`/customers/${customerId}/documents/${docId}/verify`, { method: 'POST', body: { version, verification } }),
  void: (customerId: string, docId: string, body: { version: number; reason: string; note?: string }) =>
    api<CustomerDocument>(`/customers/${customerId}/documents/${docId}/void`, { method: 'POST', body }),
  history: (customerId: string, docId: string) => api<{ items: CustomerActivityItem[] }>(`/customers/${customerId}/documents/${docId}/history`),
  upload: (customerId: string, docId: string, side: string, file: File, onProgress?: (f: number) => void) =>
    uploadFile<CustomerDocument>(`/customers/${customerId}/documents/${docId}/files?side=${side}`, file, onProgress),
  reveal: (customerId: string, docId: string, reason: string) =>
    api<{ number: string; visibleSeconds: number; remainingThisHour: number }>(`/customers/${customerId}/documents/${docId}/reveal-number`, { method: 'POST', body: { reason } }),
  access: (fileId: string, mode: 'view' | 'download') => api<{ url: string; expiresAt: string }>(`/customer-files/${fileId}/access`, { method: 'POST', body: { mode } }),
}

export interface DocumentSettingsOverview {
  warningDays: number
  policies: RequirementPolicy[]
  branchCountries: { country: string; branchCount: number }[]
  branchesWithoutCountry: number
  templates: { code: string; residencyClass: 'local' | 'foreign'; title: string; items: RequirementItem[] }[]
}
export const settingsApi = {
  customerDocuments: () => api<DocumentSettingsOverview>('/settings/customer-documents'),
  setWarningDays: (warningDays: number) => api<DocumentSettingsOverview>('/settings/customer-documents', { method: 'PUT', body: { warningDays } }),
  createDraft: (body: { country: string; residencyClass: 'local' | 'foreign'; templateCode?: string; copyFromPolicyId?: string }) =>
    api<DocumentSettingsOverview>('/settings/document-requirements/drafts', { method: 'POST', body }),
  saveItems: (policyId: string, items: RequirementItem[]) => api<DocumentSettingsOverview>(`/settings/document-requirements/${policyId}/items`, { method: 'PUT', body: { items } }),
  activate: (policyId: string) => api<DocumentSettingsOverview>(`/settings/document-requirements/${policyId}/activate`, { method: 'POST', body: { confirm: true } }),
  retire: (policyId: string) => api<DocumentSettingsOverview>(`/settings/document-requirements/${policyId}/retire`, { method: 'POST' }),
}
