import type { DashboardResponse, ReadinessResponse, DamageCandidate, DamageDetail, DamageListResponse, MaintenanceDetail, MaintenanceListResponse, ServiceDue, TransferDetail, TransferListResponse, VehicleOperations, FinanceDepositListItem, FinanceFileListItem, FinanceListPage, FinancePaymentListItem, FinancePendingResponse, FinanceRefundListItem, FinanceSummaryRow, PartyFinanceView, RentalFinanceView, ContractDetail, ContractTemplate, PriceListDetail, PriceListSummary, PriceQuote, PricingResult, ApiError,AvailabilityResponse, RentalActivityItem, RentalSettings, RentalDetail, RentalListItem, RentalListResponse, ReservationActivityItem, ReservationBranch, ReservationDetail, ReservationListItem, ReservationListResponse, TimelineResponse, CorporateActivityItem, CorporateDetail, CorporateDuplicateMatch, CorporateListResponse, CorporatePeopleResponse, CustomerCorporateLink, CustomerActivityItem, CustomerDocument, CustomerDocumentsResponse, CustomerDocumentStatus, RequirementItem, RequirementPolicy, CustomerDetail, CustomerDuplicateResponse, CustomerListResponse, HistoryWriteResult, SessionInfo, VehicleActivityItem, VehicleDocumentDetail, VehicleDocumentsResponse, VehiclePhoto, VehiclePhotoList, VehicleClassSummary, VehicleDetail, VehicleHistory, VehicleListResponse } from '@acarvo/shared'

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

/** Reservations V1. Search text travels in request bodies only; wall times are sent as typed with the branch. */
export const reservationsApi = {
  search: (body: Record<string, unknown>) => api<ReservationListResponse>('/reservations/search', { method: 'POST', body }),
  get: (id: string) => api<ReservationDetail>(`/reservations/${id}`),
  history: (id: string) => api<{ items: ReservationActivityItem[] }>(`/reservations/${id}/history`),
  branches: () => api<{ items: ReservationBranch[] }>('/reservations/branches'),
  availability: (body: Record<string, unknown>) => api<AvailabilityResponse>('/reservations/availability', { method: 'POST', body }),
  timeline: (body: Record<string, unknown>) => api<TimelineResponse>('/reservations/timeline', { method: 'POST', body }),
  create: (body: unknown) => api<ReservationDetail>('/reservations', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<ReservationDetail>(`/reservations/${id}`, { method: 'PUT', body }),
  confirm: (id: string, version: number) => api<ReservationDetail>(`/reservations/${id}/confirm`, { method: 'POST', body: { version } }),
  cancel: (id: string, version: number, reason: string, note?: string) => api<ReservationDetail>(`/reservations/${id}/cancel`, { method: 'POST', body: { version, reason, note } }),
  noShow: (id: string, version: number, reason: string, note?: string) => api<ReservationDetail>(`/reservations/${id}/no-show`, { method: 'POST', body: { version, reason, note } }),
  forCustomer: (id: string) => api<{ items: ReservationListItem[] }>(`/customers/${id}/reservations`),
  forAccount: (id: string) => api<{ items: ReservationListItem[] }>(`/corporate-accounts/${id}/reservations`),
  forVehicle: (id: string) => api<{ items: ReservationListItem[] }>(`/vehicles/${id}/reservations`),
}

export interface RentalBranch {
  id: string
  name: string
  code: string
  timeZone: string
  country: string | null
  inScope: boolean
}

/** Rentals, handover and return (V1). Every state change carries the version the user saw and a request id. */
export const rentalsApi = {
  search: (body: Record<string, unknown>) => api<RentalListResponse>('/rentals/search', { method: 'POST', body }),
  get: (id: string) => api<RentalDetail>(`/rentals/${id}`),
  history: (id: string) => api<{ items: RentalActivityItem[] }>(`/rentals/${id}/history`),
  branches: () => api<{ items: RentalBranch[] }>('/rentals/branches'),
  availability: (body: Record<string, unknown>) => api<AvailabilityResponse>('/rentals/availability', { method: 'POST', body }),
  create: (body: unknown) => api<RentalDetail>('/rentals', { method: 'POST', body }),
  fromReservation: (reservationId: string, version: number, requestId: string) => api<RentalDetail>(`/rentals/from-reservation/${reservationId}`, { method: 'POST', body: { version, requestId } }),
  update: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}`, { method: 'PUT', body }),
  cancel: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}/cancel`, { method: 'POST', body }),
  documentCheck: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}/document-check`, { method: 'PUT', body }),
  saveInspection: (id: string, kind: 'handover' | 'return', body: unknown) => api<RentalDetail>(`/rentals/${id}/inspections/${kind}`, { method: 'PUT', body }),
  uploadPhoto: (id: string, kind: 'handover' | 'return', angle: string, file: File, onProgress?: (f: number) => void) =>
    uploadFile<RentalDetail>(`/rentals/${id}/inspections/${kind}/photos?angle=${angle}`, file, onProgress),
  removePhoto: (id: string, kind: 'handover' | 'return', photoId: string) => api<RentalDetail>(`/rentals/${id}/inspections/${kind}/photos/${photoId}`, { method: 'DELETE' }),
  deliver: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}/deliver`, { method: 'POST', body }),
  extend: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}/extend`, { method: 'POST', body }),
  returnVehicle: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}/return`, { method: 'POST', body }),
  close: (id: string, body: unknown) => api<RentalDetail>(`/rentals/${id}/close`, { method: 'POST', body }),
  forCustomer: (id: string) => api<{ items: RentalListItem[] }>(`/customers/${id}/rentals`),
  forAccount: (id: string) => api<{ items: RentalListItem[] }>(`/corporate-accounts/${id}/rentals`),
  forVehicle: (id: string) => api<{ items: RentalListItem[] }>(`/vehicles/${id}/rentals`),
  settings: () => api<RentalSettings>('/settings/rentals'),
  saveSettings: (body: { version: number; externalTermsMode: boolean }) => api<RentalSettings>('/settings/rentals', { method: 'PUT', body }),
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

export type QuoteTargetKind = 'reservation' | 'rental'
const quoteBase = (kind: QuoteTargetKind, id: string) => `/${kind === 'reservation' ? 'reservations' : 'rentals'}/${id}/quotes`

export interface PriceListHistory {
  revisions: {
    revision: number
    createdAt: string
    createdByName: string | null
    dayMethod: string
    taxMode: string
    taxRateBp: number | null
    counts: { rates: number; seasons: number; extras: number; discounts: number; quotes: number }
  }[]
  events: { action: string; summary: Record<string, unknown> | null; at: string; actorName: string | null }[]
}

/** Pricing V1: price lists (each save is a new revision), previews and quotes. Totals are computed by the server only. */
export const pricingApi = {
  lists: () => api<{ items: PriceListSummary[] }>('/pricing/price-lists'),
  get: (id: string, revision?: number) => api<PriceListDetail>(`/pricing/price-lists/${id}${revision ? `?revision=${revision}` : ''}`),
  history: (id: string) => api<PriceListHistory>(`/pricing/price-lists/${id}/history`),
  create: (body: unknown) => api<PriceListDetail>('/pricing/price-lists', { method: 'POST', body }),
  save: (id: string, body: unknown) => api<PriceListDetail>(`/pricing/price-lists/${id}`, { method: 'PUT', body }),
  activate: (id: string, version: number) => api<PriceListDetail>(`/pricing/price-lists/${id}/activate`, { method: 'POST', body: { version } }),
  archive: (id: string, version: number) => api<PriceListDetail>(`/pricing/price-lists/${id}/archive`, { method: 'POST', body: { version } }),
  preview: (body: unknown) => api<PricingResult>('/pricing/preview', { method: 'POST', body }),
  quotes: (kind: QuoteTargetKind, id: string) => api<{ items: PriceQuote[] }>(quoteBase(kind, id)),
  quotePreview: (kind: QuoteTargetKind, id: string, body: unknown) => api<PricingResult>(`${quoteBase(kind, id)}/preview`, { method: 'POST', body }),
  saveQuote: (kind: QuoteTargetKind, id: string, body: unknown) => api<PriceQuote>(quoteBase(kind, id), { method: 'POST', body }),
}

export interface RentalContractsResponse {
  items: {
    id: string
    contractNo: string
    revision: number
    status: ContractDetail['status']
    createdAt: string
    createdByName: string | null
    quoteNo: string | null
    templateName: string
    templateVersionNo: number
    externalReference: string | null
  }[]
  activeTemplates: { id: string; name: string; language: string; country: string | null; versionNo: number; isSample: boolean }[]
  rentalStatus: string
}
export interface TemplateCheck {
  used: string[]
  unknown: string[]
  missingRequired: string[]
  stray: boolean
}

/** Contracts V1: templates (owner), contract drafts per rental, lifecycle and the draft PDF (separate permission). */
export const contractsApi = {
  templates: () => api<{ items: ContractTemplate[]; fields: Record<string, string> }>('/settings/contract-templates'),
  createTemplate: (body: unknown) => api<ContractTemplate>('/settings/contract-templates', { method: 'POST', body }),
  saveDraft: (id: string, version: number, body: string) => api<ContractTemplate>(`/settings/contract-templates/${id}/draft`, { method: 'PUT', body: { version, body } }),
  newDraft: (id: string) => api<ContractTemplate>(`/settings/contract-templates/${id}/draft`, { method: 'POST' }),
  activateTemplate: (id: string, version: number) => api<ContractTemplate>(`/settings/contract-templates/${id}/activate`, { method: 'POST', body: { version } }),
  previewTemplate: (body: string) => api<{ text: string; check: TemplateCheck }>('/settings/contract-templates/preview', { method: 'POST', body: { body } }),
  forRental: (rentalId: string) => api<RentalContractsResponse>(`/rentals/${rentalId}/contracts`),
  create: (rentalId: string, templateVersionId: string, requestId: string) => api<ContractDetail>(`/rentals/${rentalId}/contracts`, { method: 'POST', body: { templateVersionId, requestId } }),
  get: (id: string) => api<ContractDetail>(`/contracts/${id}`),
  revise: (id: string, body: { version: number; templateVersionId: string; requestId: string }) => api<ContractDetail>(`/contracts/${id}/revise`, { method: 'POST', body }),
  review: (id: string, version: number, requestId: string) => api<ContractDetail>(`/contracts/${id}/review`, { method: 'POST', body: { version, requestId } }),
  external: (id: string, body: { version: number; requestId: string; externalAck: true; externalReference: string }) => api<ContractDetail>(`/contracts/${id}/external`, { method: 'POST', body }),
  archive: (id: string, body: { version: number; requestId: string; reason: string }) => api<ContractDetail>(`/contracts/${id}/archive`, { method: 'POST', body }),
  /** Asks for a short-lived, session-bound grant to view or download the draft PDF (recorded once, on this POST). */
  access: (id: string, mode: 'view' | 'download') => api<{ url: string; expiresAt: string }>(`/contracts/${id}/access`, { method: 'POST', body: { mode } }),
}

export interface FinanceEventListItem {
  id: string
  rental: { id: string; no: string }
  entityType: string
  entityNo: string | null
  kind: string
  fromStatus: string | null
  toStatus: string | null
  amountMinor: number | null
  currency: string | null
  actorName: string | null
  at: string
}

/** Finance V1: internal records only. Every change carries the version seen and a request id (safe to retry). */
export const financeApi = {
  rental: (rentalId: string) => api<RentalFinanceView>(`/rentals/${rentalId}/finance`),
  open: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/open`, { method: 'POST', body }),
  close: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/close`, { method: 'POST', body }),
  reopen: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/reopen`, { method: 'POST', body }),
  requestCorrection: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/responsible-corrections`, { method: 'POST', body }),
  correctionAction: (id: string, action: 'approve' | 'reject' | 'cancel', body: unknown) => api<RentalFinanceView>(`/finance/responsible-corrections/${id}/${action}`, { method: 'POST', body }),
  createCharge: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/charges`, { method: 'POST', body }),
  chargeAction: (id: string, action: string, body: unknown) => api<RentalFinanceView>(`/finance/charges/${id}/${action}`, { method: 'POST', body }),
  createPayment: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/payments`, { method: 'POST', body }),
  paymentAction: (id: string, action: string, body: unknown) => api<RentalFinanceView>(`/finance/payments/${id}/${action}`, { method: 'POST', body }),
  createDeposit: (rentalId: string, body: unknown) => api<RentalFinanceView>(`/rentals/${rentalId}/finance/deposits`, { method: 'POST', body }),
  depositAction: (id: string, action: string, body: unknown) => api<RentalFinanceView>(`/finance/deposits/${id}/${action}`, { method: 'POST', body }),
  createRefund: (depositId: string, body: unknown) => api<RentalFinanceView>(`/finance/deposits/${depositId}/refunds`, { method: 'POST', body }),
  refundAction: (id: string, action: string, body: unknown) => api<RentalFinanceView>(`/finance/refunds/${id}/${action}`, { method: 'POST', body }),
  payments: (body: unknown) => api<FinanceListPage<FinancePaymentListItem>>('/finance/payments/search', { method: 'POST', body }),
  deposits: (body: unknown) => api<FinanceListPage<FinanceDepositListItem>>('/finance/deposits/search', { method: 'POST', body }),
  refunds: (body: unknown) => api<FinanceListPage<FinanceRefundListItem>>('/finance/refunds/search', { method: 'POST', body }),
  files: (body: unknown) => api<FinanceListPage<FinanceFileListItem>>('/finance/files/search', { method: 'POST', body }),
  events: (body: unknown) => api<FinanceListPage<FinanceEventListItem>>('/finance/events/search', { method: 'POST', body }),
  pending: () => api<FinancePendingResponse>('/finance/pending'),
  summary: (body: unknown) => api<{ rows: FinanceSummaryRow[] }>('/finance/summary', { method: 'POST', body }),
  customer: (id: string) => api<PartyFinanceView>(`/customers/${id}/finance`),
  corporate: (id: string) => api<PartyFinanceView>(`/corporate-accounts/${id}/finance`),
}

// Maintenance, damage and vehicle transfers (docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md). Lists are POST: plates and notes
// never travel in a URL.
export interface OperationBranch {
  id: string
  name: string
  code: string
  timeZone: string
  inScope: boolean
}
export const maintenanceApi = {
  branches: () => api<{ branches: OperationBranch[] }>('/maintenance/branches'),
  search: (body: Record<string, unknown>) => api<MaintenanceListResponse>('/maintenance/search', { method: 'POST', body }),
  get: (id: string) => api<MaintenanceDetail>(`/maintenance/${id}`),
  create: (body: unknown) => api<MaintenanceDetail>('/maintenance', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<MaintenanceDetail>(`/maintenance/${id}`, { method: 'PUT', body }),
  step: (id: string, step: 'approve' | 'start' | 'work-done' | 'return-to-work' | 'complete' | 'cancel', body: unknown) => api<MaintenanceDetail>(`/maintenance/${id}/${step}`, { method: 'POST', body }),
  uploadPhoto: (id: string, file: File, onProgress?: (f: number) => void) => uploadFile<MaintenanceDetail>(`/maintenance/${id}/photos`, file, onProgress),
  removePhoto: (id: string, photoId: string) => api<MaintenanceDetail>(`/maintenance/${id}/photos/${photoId}`, { method: 'DELETE' }),
}
export const damagesApi = {
  branches: () => api<{ branches: OperationBranch[] }>('/damages/branches'),
  search: (body: Record<string, unknown>) => api<DamageListResponse>('/damages/search', { method: 'POST', body }),
  get: (id: string) => api<DamageDetail>(`/damages/${id}`),
  candidates: (rentalId: string) => api<{ items: DamageCandidate[] }>(`/damages/candidates?rentalId=${rentalId}`),
  create: (body: unknown) => api<DamageDetail>('/damages', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<DamageDetail>(`/damages/${id}`, { method: 'PUT', body }),
  step: (id: string, step: 'review' | 'repair' | 'block' | 'unblock-request', body: unknown) => api<DamageDetail>(`/damages/${id}/${step}`, { method: 'POST', body }),
  release: (requestId: string, decision: 'approve' | 'reject' | 'cancel', body: unknown) => api<DamageDetail>(`/damages/release-requests/${requestId}/${decision}`, { method: 'POST', body }),
  uploadPhoto: (id: string, file: File, onProgress?: (f: number) => void) => uploadFile<DamageDetail>(`/damages/${id}/photos`, file, onProgress),
  removePhoto: (id: string, photoId: string) => api<DamageDetail>(`/damages/${id}/photos/${photoId}`, { method: 'DELETE' }),
}
export const transfersApi = {
  branches: () => api<{ branches: OperationBranch[] }>('/transfers/branches'),
  search: (body: Record<string, unknown>) => api<TransferListResponse>('/transfers/search', { method: 'POST', body }),
  get: (id: string) => api<TransferDetail>(`/transfers/${id}`),
  create: (body: unknown) => api<TransferDetail>('/transfers', { method: 'POST', body }),
  update: (id: string, body: unknown) => api<TransferDetail>(`/transfers/${id}`, { method: 'PUT', body }),
  step: (id: string, step: 'approve' | 'depart' | 'receive' | 'cancel', body: unknown) => api<TransferDetail>(`/transfers/${id}/${step}`, { method: 'POST', body }),
  uploadPhoto: (id: string, file: File, onProgress?: (f: number) => void) => uploadFile<TransferDetail>(`/transfers/${id}/photos`, file, onProgress),
  removePhoto: (id: string, photoId: string) => api<TransferDetail>(`/transfers/${id}/photos/${photoId}`, { method: 'DELETE' }),
}
export const vehicleOpsApi = {
  get: (vehicleId: string) => api<VehicleOperations>(`/vehicles/${vehicleId}/operations`),
  saveSchedule: (vehicleId: string, body: unknown) => api<ServiceDue>(`/vehicles/${vehicleId}/maintenance-schedule`, { method: 'PUT', body }),
}

// Ana Kontrol Paneli, Operasyonel Hazırlık, evidence photo access (docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md).
export const dashboardApi = {
  get: (branchId?: string) => api<DashboardResponse>(`/dashboard${branchId ? `?branchId=${branchId}` : ''}`),
  readiness: () => api<ReadinessResponse>('/readiness'),
}
export type PhotoRecordKind = 'rental' | 'maintenance' | 'damage' | 'transfer'
export const photoAccessApi = {
  /** Asks ACARVO for access to the evidence photos of one record (recorded once per grant; the GETs record nothing). */
  grant: (kind: PhotoRecordKind, id: string) => api<{ expiresAt: string; photos: number; reused: boolean }>('/photo-access', { method: 'POST', body: { kind, id } }),
}
