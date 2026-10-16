import type { ServiceDueState } from './operations'

// Ana Kontrol Paneli (spec §6, §59A, §59CE) and Operasyonel Hazırlık — docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md.
// Every number comes from real records; nothing is estimated, converted between currencies or invented.

/** Mutually exclusive state of a vehicle at this moment (shared allocation truth, vehicle_busy). */
export const FLEET_BUCKETS = ['available', 'reserved', 'rented', 'maintenance', 'transfer', 'unavailable'] as const
export type FleetBucket = (typeof FLEET_BUCKETS)[number]

export interface DashboardItem {
  kind: 'reservation' | 'rental' | 'maintenance' | 'damage' | 'transfer'
  id: string
  no: string
  /** ISO instant the item is about (pickup, return, planned end, departure...). */
  at: string
  branchCode: string | null
  plate: string | null
  /** Short, non-personal description (e.g. "Teslim", "İade", vehicle model). */
  label: string
  /** Customer display name, only for users who may read reservations or rentals. */
  customer: string | null
  overdueMinutes: number | null
}

export interface DashboardBranchRow {
  id: string
  code: string
  name: string
  fleet: Record<FleetBucket, number>
  pickupsToday: number
  returnsToday: number
  overdue: number
}

export interface DashboardFinanceRow {
  currency: string
  recordedPaymentsMinor: number
  verifiedPaymentsMinor: number
  postedChargesMinor: number
  pendingChargesMinor: number
  outstandingMinor: number
  depositsHeldMinor: number
  depositsReportedMinor: number
  refundsOpenMinor: number
}

export interface DashboardResponse {
  generatedAt: string
  timeZone: string
  /** Company day used for "today" (YYYY-MM-DD in the company time zone). */
  today: string
  scope: { allBranches: boolean; branchId: string | null; branches: { id: string; code: string; name: string }[] }
  /** Which parts this user may see; a part without permission is absent, not zero. */
  sections: { fleet: boolean; reservations: boolean; rentals: boolean; maintenance: boolean; damage: boolean; transfers: boolean; finance: boolean }
  fleet: { total: number; buckets: Record<FleetBucket, number>; outOfService: number } | null
  counts: {
    pickupsToday: number | null
    returnsToday: number | null
    activeRentals: number | null
    overdueReturns: number | null
    overduePickups: number | null
    pendingReservations: number | null
    confirmedUpcoming: number | null
    inMaintenance: number | null
    maintenancePendingApproval: number | null
    maintenanceOverdue: number | null
    blockedVehicles: number | null
    openDamages: number | null
    releasesPending: number | null
    inTransit: number | null
    incomingTransfers: number | null
    lateTransfers: number | null
    serviceDueSoon: number | null
    serviceOverdue: number | null
    financePending: number | null
    refundsPending: number | null
  }
  todayItems: { pickups: DashboardItem[]; returns: DashboardItem[] }
  overdue: DashboardItem[]
  attention: DashboardItem[]
  upcoming: DashboardItem[]
  serviceDue: { vehicleId: string; plate: string; state: ServiceDueState; kmLeft: number | null; daysLeft: number | null }[]
  branches: DashboardBranchRow[]
  finance: { rows: DashboardFinanceRow[]; pending: { payments: number; charges: number; deposits: number; refunds: number } } | null
}

export type ReadinessState = 'ready' | 'missing' | 'working' | 'configured' | 'unavailable' | 'not_verified' | 'decision_required'

export interface ReadinessCheck {
  key: string
  group: 'branches' | 'security' | 'documents' | 'rentals' | 'pricing' | 'contracts' | 'approvals' | 'decisions'
  title: string
  state: ReadinessState
  /** Facts only: counts, codes, names of settings. Never key values, fingerprints or personal data. */
  detail: string
  /** Who must act and where (a human decision is never taken by the system). */
  action: string | null
  link: string | null
}

export interface ReadinessResponse {
  generatedAt: string
  checks: ReadinessCheck[]
  summary: Record<ReadinessState, number>
}
