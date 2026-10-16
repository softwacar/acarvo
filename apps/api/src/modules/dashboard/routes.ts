import { type DashboardItem, type DashboardResponse, FLEET_BUCKETS, type FleetBucket, todayIn } from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { AppError } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { financeSummary } from '../finance/repository'
import { classifyServiceDue } from '../operations/vehicle-ops'
import { companyTimeZone, dayStart, nextDay } from '../reservations/repository'
import { inScope } from '../vehicles/repository'

// Ana Kontrol Paneli (spec §6, §59A, §59CE). One endpoint, a fixed set of set-based queries (no per-row queries).
// Vehicle states come from the shared allocation function (vehicle_busy) at this moment: there is no second engine,
// and "free now" is never mixed with "free later". Each part needs its own read permission; finance figures need the
// finance reports permission and are kept per currency.

type Row = Record<string, unknown>
const str = (v: unknown) => (v == null ? null : String(v))
const LIST = 12
const query = z.object({ branchId: z.uuid().optional() })

/** A vehicle's bucket from the holds active now (most binding first). Out of service without a hold = unavailable. */
export function bucketOf(status: string, holds: string[]): FleetBucket {
  const has = (k: string) => holds.some((h) => h.startsWith(`${k}:`))
  if (holds.includes('rental:delivered')) return 'rented'
  if (has('maintenance')) return 'maintenance'
  if (has('transfer')) return 'transfer'
  if (has('damage') || status !== 'active') return 'unavailable'
  if (has('reservation') || has('rental')) return 'reserved'
  return 'available'
}

export async function dashboard(tx: Tx, access: CompanyAccess, branchId: string | undefined): Promise<DashboardResponse> {
  const p = access.permissions
  if (branchId && !inScope(access, branchId)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin verilerini görme yetkiniz yok.')
  const B: string[] | null = branchId ? [branchId] : access.allBranches ? null : access.branchIds
  const inB = (...cols: SQL[]): SQL =>
    B === null
      ? sql`true`
      : B.length
        ? sql`(${sql.join(
            cols.map((c) => sql`${c} in ${B}`),
            sql` or `,
          )})`
        : sql`false`
  const tz = await companyTimeZone(tx, access)
  const today = todayIn(tz)
  const start = dayStart(today, tz)
  const stop = dayStart(nextDay(today), tz)
  const soon = dayStart(nextDay(nextDay(nextDay(nextDay(today)))), tz) // three days after today
  const sections = {
    fleet: p.has('vehicles.read'),
    reservations: p.has('reservations.read'),
    rentals: p.has('rentals.read'),
    maintenance: p.has('maintenance.read'),
    damage: p.has('damage.read'),
    transfers: p.has('transfers.read'),
    finance: p.has('finance.reports.read'),
  }
  // Branches the user may choose from (their whole scope); the figures below use only the chosen one (B).
  const scopeB = access.allBranches ? null : access.branchIds
  const allowed = ((await tx.execute(sql`select id, code, name from branches where status = 'active' and ${scopeB === null ? sql`true` : scopeB.length ? sql`id in ${scopeB}` : sql`false`} order by name`)).rows as Row[]).map((b) => ({
    id: b.id as string,
    code: b.code as string,
    name: b.name as string,
  }))
  // A branch id that is not an active branch of this company (row level security hides other companies) is refused.
  if (branchId && !allowed.some((b) => b.id === branchId)) throw new AppError(403, 'BRANCH_FORBIDDEN', 'Bu şubenin verilerini görme yetkiniz yok.')
  const branches = B === null ? allowed : allowed.filter((b) => B.includes(b.id))
  const counts: DashboardResponse['counts'] = {
    pickupsToday: null,
    returnsToday: null,
    activeRentals: null,
    overdueReturns: null,
    overduePickups: null,
    pendingReservations: null,
    confirmedUpcoming: null,
    inMaintenance: null,
    maintenancePendingApproval: null,
    maintenanceOverdue: null,
    blockedVehicles: null,
    openDamages: null,
    releasesPending: null,
    inTransit: null,
    incomingTransfers: null,
    lateTransfers: null,
    serviceDueSoon: null,
    serviceOverdue: null,
    financePending: null,
    refundsPending: null,
  }
  const now = Date.now()
  const overdue = (at: unknown) => Math.max(0, Math.round((now - Date.parse(toIso(at))) / 60_000))
  const item = (r: Row, kind: DashboardItem['kind'], label: string, late = false, showCustomer = true): DashboardItem => ({
    kind,
    id: r.id as string,
    no: r.no as string,
    at: toIso(r.at),
    branchCode: str(r.code),
    plate: str(r.plate),
    label,
    customer: showCustomer ? str(r.customer) : null,
    overdueMinutes: late ? overdue(r.at) : null,
  })
  const pickups: DashboardItem[] = []
  const returns: DashboardItem[] = []
  const overdueItems: DashboardItem[] = []
  const attention: DashboardItem[] = []
  const upcoming: DashboardItem[] = []
  const serviceDue: DashboardResponse['serviceDue'] = []
  const perBranch = new Map<string, { pickups: number; returns: number; overdue: number }>(branches.map((b) => [b.id, { pickups: 0, returns: 0, overdue: 0 }]))
  const addBranch = (rows: Row[], key: 'pickups' | 'returns' | 'overdue') => {
    for (const r of rows) {
      const b = perBranch.get(r.branch_id as string)
      if (b) b[key] += Number(r.n)
    }
  }

  // Fleet: every vehicle in scope with the kinds of holds active right now (one statement).
  let fleet: DashboardResponse['fleet'] = null
  const fleetByBranch = new Map<string, Record<FleetBucket, number>>()
  if (sections.fleet) {
    const rows = (
      await tx.execute(sql`select v.id, v.status, v.home_branch_id,
          coalesce((select array_agg(b.kind || ':' || b.status) from vehicle_busy(v.company_id, v.id, now(), now() + interval '1 second', null, null) b), '{}') as holds
        from vehicles v where v.status in ('active', 'out_of_service') and ${inB(sql`v.home_branch_id`)}`)
    ).rows as Row[]
    const buckets = Object.fromEntries(FLEET_BUCKETS.map((k) => [k, 0])) as Record<FleetBucket, number>
    for (const r of rows) {
      const k = bucketOf(r.status as string, r.holds as string[])
      buckets[k]++
      const per = fleetByBranch.get(r.home_branch_id as string) ?? (Object.fromEntries(FLEET_BUCKETS.map((x) => [x, 0])) as Record<FleetBucket, number>)
      per[k]++
      fleetByBranch.set(r.home_branch_id as string, per)
    }
    fleet = { total: rows.length, buckets, outOfService: rows.filter((r) => r.status !== 'active').length }
  }

  if (sections.reservations) {
    const scope = inB(sql`r.pickup_branch_id`, sql`r.return_branch_id`)
    const base = sql`from reservations r join branches b on b.company_id = r.company_id and b.id = r.pickup_branch_id
      left join vehicles v on v.company_id = r.company_id and v.id = r.vehicle_id join customers c on c.company_id = r.company_id and c.id = r.customer_id`
    const sel = sql`select r.id, r.reservation_no as no, r.pickup_at as at, b.code, v.plate, c.display_name as customer, count(*) over () as total`
    const pickRows = (await tx.execute(sql`${sel} ${base} where r.status = 'confirmed' and r.pickup_at >= ${start} and r.pickup_at < ${stop} and ${inB(sql`r.pickup_branch_id`)} order by r.pickup_at limit ${LIST}`)).rows as Row[]
    pickups.push(...pickRows.map((r) => item(r, 'reservation', 'Teslim (onaylı rezervasyon)')))
    const latePick = (await tx.execute(sql`${sel} ${base} where r.status = 'confirmed' and r.pickup_at < now() and ${inB(sql`r.pickup_branch_id`)} order by r.pickup_at limit ${LIST}`)).rows as Row[]
    overdueItems.push(...latePick.map((r) => item(r, 'reservation', 'Teslim gecikti (rezervasyon kiralamaya dönüşmedi)', true)))
    const upPick = (await tx.execute(sql`${sel} ${base} where r.status = 'confirmed' and r.pickup_at >= ${stop} and r.pickup_at < ${soon} and ${inB(sql`r.pickup_branch_id`)} order by r.pickup_at limit ${LIST}`)).rows as Row[]
    upcoming.push(...upPick.map((r) => item(r, 'reservation', 'Teslim (onaylı rezervasyon)')))
    const c = (
      await tx.execute(sql`select
          count(*) filter (where r.status = 'confirmed' and r.pickup_at >= ${start} and r.pickup_at < ${stop} and ${inB(sql`r.pickup_branch_id`)})::int as pick_today,
          count(*) filter (where r.status = 'confirmed' and r.pickup_at < now() and ${inB(sql`r.pickup_branch_id`)})::int as late_pick,
          count(*) filter (where r.status = 'pending')::int as pending,
          count(*) filter (where r.status = 'confirmed' and r.pickup_at >= now())::int as upcoming
        from reservations r where ${scope}`)
    ).rows[0] as Row
    counts.pickupsToday = Number(c.pick_today)
    counts.overduePickups = Number(c.late_pick)
    counts.pendingReservations = Number(c.pending)
    counts.confirmedUpcoming = Number(c.upcoming)
    addBranch((await tx.execute(sql`select pickup_branch_id as branch_id, count(*)::int n from reservations r where r.status = 'confirmed' and r.pickup_at >= ${start} and r.pickup_at < ${stop} group by 1`)).rows as Row[], 'pickups')
    addBranch((await tx.execute(sql`select pickup_branch_id as branch_id, count(*)::int n from reservations r where r.status = 'confirmed' and r.pickup_at < now() group by 1`)).rows as Row[], 'overdue')
  }

  if (sections.rentals) {
    const base = sql`from rentals k join vehicles v on v.company_id = k.company_id and v.id = k.vehicle_id join customers c on c.company_id = k.company_id and c.id = k.customer_id`
    const pick = sql`select k.id, k.rental_no as no, k.planned_pickup_at as at, b.code, v.plate, c.display_name as customer ${base} join branches b on b.company_id = k.company_id and b.id = k.pickup_branch_id`
    const ret = sql`select k.id, k.rental_no as no, k.planned_return_at as at, b.code, v.plate, c.display_name as customer ${base} join branches b on b.company_id = k.company_id and b.id = k.return_branch_id`
    pickups.push(...((await tx.execute(sql`${pick} where k.status = 'prepared' and k.planned_pickup_at >= ${start} and k.planned_pickup_at < ${stop} and ${inB(sql`k.pickup_branch_id`)} order by k.planned_pickup_at limit ${LIST}`)).rows as Row[]).map((r) => item(r, 'rental', 'Teslim (hazır kiralama)')))
    returns.push(...((await tx.execute(sql`${ret} where k.status = 'delivered' and k.planned_return_at >= ${start} and k.planned_return_at < ${stop} and ${inB(sql`k.return_branch_id`)} order by k.planned_return_at limit ${LIST}`)).rows as Row[]).map((r) => item(r, 'rental', 'İade')))
    overdueItems.push(...((await tx.execute(sql`${ret} where k.status = 'delivered' and k.planned_return_at < now() and ${inB(sql`k.pickup_branch_id`, sql`k.return_branch_id`)} order by k.planned_return_at limit ${LIST}`)).rows as Row[]).map((r) => item(r, 'rental', 'İade gecikti (araç müşteride)', true)))
    overdueItems.push(...((await tx.execute(sql`${pick} where k.status = 'prepared' and k.planned_pickup_at < now() and ${inB(sql`k.pickup_branch_id`)} order by k.planned_pickup_at limit ${LIST}`)).rows as Row[]).map((r) => item(r, 'rental', 'Teslim gecikti (kiralama hazır, araç verilmedi)', true)))
    upcoming.push(...((await tx.execute(sql`${ret} where k.status = 'delivered' and k.planned_return_at >= ${stop} and k.planned_return_at < ${soon} and ${inB(sql`k.return_branch_id`)} order by k.planned_return_at limit ${LIST}`)).rows as Row[]).map((r) => item(r, 'rental', 'İade')))
    upcoming.push(...((await tx.execute(sql`${pick} where k.status = 'prepared' and k.planned_pickup_at >= ${stop} and k.planned_pickup_at < ${soon} and ${inB(sql`k.pickup_branch_id`)} order by k.planned_pickup_at limit ${LIST}`)).rows as Row[]).map((r) => item(r, 'rental', 'Teslim (hazır kiralama)')))
    const c = (
      await tx.execute(sql`select
          count(*) filter (where k.status = 'prepared' and k.planned_pickup_at >= ${start} and k.planned_pickup_at < ${stop} and ${inB(sql`k.pickup_branch_id`)})::int as pick_today,
          count(*) filter (where k.status = 'delivered' and k.planned_return_at >= ${start} and k.planned_return_at < ${stop} and ${inB(sql`k.return_branch_id`)})::int as ret_today,
          count(*) filter (where k.status = 'delivered' and ${inB(sql`k.pickup_branch_id`, sql`k.return_branch_id`)})::int as active,
          count(*) filter (where k.status = 'delivered' and k.planned_return_at < now() and ${inB(sql`k.pickup_branch_id`, sql`k.return_branch_id`)})::int as late_ret,
          count(*) filter (where k.status = 'prepared' and k.planned_pickup_at < now() and ${inB(sql`k.pickup_branch_id`)})::int as late_pick
        from rentals k`)
    ).rows[0] as Row
    counts.pickupsToday = (counts.pickupsToday ?? 0) + Number(c.pick_today)
    counts.returnsToday = Number(c.ret_today)
    counts.activeRentals = Number(c.active)
    counts.overdueReturns = Number(c.late_ret)
    counts.overduePickups = (counts.overduePickups ?? 0) + Number(c.late_pick)
    addBranch((await tx.execute(sql`select pickup_branch_id as branch_id, count(*)::int n from rentals k where k.status = 'prepared' and k.planned_pickup_at >= ${start} and k.planned_pickup_at < ${stop} group by 1`)).rows as Row[], 'pickups')
    addBranch((await tx.execute(sql`select return_branch_id as branch_id, count(*)::int n from rentals k where k.status = 'delivered' and k.planned_return_at >= ${start} and k.planned_return_at < ${stop} group by 1`)).rows as Row[], 'returns')
    addBranch((await tx.execute(sql`select return_branch_id as branch_id, count(*)::int n from rentals k where k.status = 'delivered' and k.planned_return_at < now() group by 1`)).rows as Row[], 'overdue')
  }

  if (sections.maintenance) {
    const base = sql`from maintenance_records m join vehicles v on v.company_id = m.company_id and v.id = m.vehicle_id join branches b on b.company_id = m.company_id and b.id = m.branch_id
      where ${inB(sql`m.branch_id`, sql`v.home_branch_id`)}`
    const c = (
      await tx.execute(sql`select count(*) filter (where m.status in ('in_service', 'awaiting_check'))::int as active,
          count(*) filter (where m.status = 'pending_approval')::int as pending,
          count(*) filter (where m.status in ('planned', 'in_service', 'awaiting_check') and m.planned_end_at < now())::int as late ${base}`)
    ).rows[0] as Row
    counts.inMaintenance = Number(c.active)
    counts.maintenancePendingApproval = Number(c.pending)
    counts.maintenanceOverdue = Number(c.late)
    const rows = (
      await tx.execute(sql`select m.id, m.maintenance_no as no, m.planned_end_at as at, b.code, v.plate, m.status, (m.status in ('planned', 'in_service', 'awaiting_check') and m.planned_end_at < now()) as late
        ${base} and (m.status in ('pending_approval', 'awaiting_check') or (m.status in ('planned', 'in_service', 'awaiting_check') and m.planned_end_at < now()))
        order by m.planned_end_at limit ${LIST}`)
    ).rows as Row[]
    attention.push(
      ...rows.map((r) =>
        item(r, 'maintenance', r.late ? 'Bakım gecikti (planlanan bitiş geçti)' : r.status === 'pending_approval' ? 'Bakım planı onay bekliyor' : 'Bakım kontrol bekliyor', r.late === true, false),
      ),
    )
    // Periodic service from real records, in one statement (shared rule: classifyServiceDue).
    const due = (
      await tx.execute(sql`select v.id, v.plate, s.interval_km, s.interval_months, s.version, l.maintenance_no, l.completed_at, l.end_km, cur.km
        from maintenance_schedules s join vehicles v on v.company_id = s.company_id and v.id = s.vehicle_id
        left join lateral (select m.maintenance_no, m.completed_at, m.end_km from maintenance_records m where m.company_id = v.company_id and m.vehicle_id = v.id and m.type = 'periodic' and m.status = 'completed'
          order by m.completed_at desc limit 1) l on true
        left join lateral (select r.km from odometer_readings r where r.company_id = v.company_id and r.vehicle_id = v.id
          and not exists (select 1 from odometer_corrections oc where oc.company_id = r.company_id and oc.reading_id = r.id) order by r.occurred_at desc, r.created_at desc limit 1) cur on true
        where v.status in ('active', 'out_of_service') and ${inB(sql`v.home_branch_id`)}`)
    ).rows as Row[]
    const classified = due.map((r) => ({
      vehicleId: r.id as string,
      plate: r.plate as string,
      ...classifyServiceDue(
        { intervalKm: r.interval_km == null ? null : Number(r.interval_km), intervalMonths: r.interval_months == null ? null : Number(r.interval_months), version: Number(r.version) },
        r.maintenance_no ? { maintenanceNo: r.maintenance_no as string, completedAt: toIso(r.completed_at), km: Number(r.end_km) } : null,
        r.km == null ? null : Number(r.km),
      ),
    }))
    counts.serviceDueSoon = classified.filter((d) => d.state === 'due_soon').length
    counts.serviceOverdue = classified.filter((d) => d.state === 'overdue').length
    serviceDue.push(
      ...classified
        .filter((d) => d.state === 'due_soon' || d.state === 'overdue')
        .sort((a, b) => (a.state === b.state ? (a.kmLeft ?? a.daysLeft ?? 0) - (b.kmLeft ?? b.daysLeft ?? 0) : a.state === 'overdue' ? -1 : 1))
        .slice(0, LIST)
        .map((d) => ({ vehicleId: d.vehicleId, plate: d.plate, state: d.state, kmLeft: d.kmLeft, daysLeft: d.daysLeft })),
    )
  }

  if (sections.damage) {
    const scope = inB(sql`d.branch_id`, sql`v.home_branch_id`)
    const c = (
      await tx.execute(sql`select count(distinct d.vehicle_id) filter (where exists (select 1 from damage_blocks x where x.company_id = d.company_id and x.damage_id = d.id and x.ended_at is null))::int as blocked,
          count(*) filter (where d.review_status <> 'closed')::int as open,
          (select count(*)::int from damage_block_release_requests rr join damage_files dd on dd.company_id = rr.company_id and dd.id = rr.damage_id
             join vehicles vv on vv.company_id = dd.company_id and vv.id = dd.vehicle_id where rr.status = 'requested' and ${inB(sql`dd.branch_id`, sql`vv.home_branch_id`)}) as releases
        from damage_files d join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id where ${scope}`)
    ).rows[0] as Row
    counts.blockedVehicles = Number(c.blocked)
    counts.openDamages = Number(c.open)
    counts.releasesPending = Number(c.releases)
    const rows = (
      await tx.execute(sql`select d.id, d.damage_no as no, coalesce(rr.requested_at, x.started_at) as at, b.code, v.plate, rr.id is not null as release
        from damage_files d join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id join branches b on b.company_id = d.company_id and b.id = d.branch_id
        join damage_blocks x on x.company_id = d.company_id and x.damage_id = d.id and x.ended_at is null
        left join damage_block_release_requests rr on rr.company_id = x.company_id and rr.block_id = x.id and rr.status = 'requested'
        where ${scope} order by (rr.id is null), at limit ${LIST}`)
    ).rows as Row[]
    attention.push(...rows.map((r) => item(r, 'damage', r.release ? 'Engel kaldırma ikinci onay bekliyor' : 'Araç hasar nedeniyle kullanılamaz', false, false)))
  }

  if (sections.transfers) {
    const scope = inB(sql`t.from_branch_id`, sql`t.to_branch_id`)
    const c = (
      await tx.execute(sql`select count(*) filter (where t.status = 'in_transit')::int as transit,
          count(*) filter (where t.status = 'in_transit' and ${inB(sql`t.to_branch_id`)})::int as incoming,
          count(*) filter (where t.status = 'in_transit' and t.planned_arrival_at < now())::int as late
        from vehicle_transfers t where ${scope}`)
    ).rows[0] as Row
    counts.inTransit = Number(c.transit)
    counts.incomingTransfers = Number(c.incoming)
    counts.lateTransfers = Number(c.late)
    const rows = (
      await tx.execute(sql`select t.id, t.transfer_no as no, t.planned_arrival_at as at, tb.code, v.plate, t.planned_arrival_at < now() as late
        from vehicle_transfers t join vehicles v on v.company_id = t.company_id and v.id = t.vehicle_id join branches tb on tb.company_id = t.company_id and tb.id = t.to_branch_id
        where t.status = 'in_transit' and ${scope} order by t.planned_arrival_at limit ${LIST}`)
    ).rows as Row[]
    attention.push(...rows.map((r) => item(r, 'transfer', r.late ? 'Transfer gecikti (araç yolda, teslim alınmadı)' : 'Varış bekleniyor (araç yolda)', r.late === true, false)))
  }

  let finance: DashboardResponse['finance'] = null
  if (sections.finance) {
    const scope = sql`exists (select 1 from rentals k where k.company_id = f.company_id and k.id = f.rental_id and ${inB(sql`k.pickup_branch_id`, sql`k.return_branch_id`, sql`k.actual_return_branch_id`)})`
    const pend = (
      await tx.execute(sql`select
          (select count(*)::int from finance_payments x join rental_finances f on f.company_id = x.company_id and f.id = x.finance_id where x.status = 'recorded' and ${scope}) as payments,
          (select count(*)::int from finance_charges x join rental_finances f on f.company_id = x.company_id and f.id = x.finance_id where x.status in ('pending', 'reversal_requested') and ${scope}) as charges,
          (select count(*)::int from finance_deposits x join rental_finances f on f.company_id = x.company_id and f.id = x.finance_id where (x.status = 'reported' or x.in_review) and ${scope}) as deposits,
          (select count(*)::int from finance_deposit_refunds r join finance_deposits x on x.company_id = r.company_id and x.id = r.deposit_id join rental_finances f on f.company_id = x.company_id and f.id = x.finance_id
             where r.status in ('requested', 'approved') and ${scope}) as refunds`)
    ).rows[0] as Row
    const summary = await financeSummary(tx, { ...access, allBranches: B === null, branchIds: B ?? [] }, {})
    finance = {
      rows: summary.rows.map((r) => ({
        currency: r.currency,
        recordedPaymentsMinor: r.recordedPaymentsMinor,
        verifiedPaymentsMinor: r.verifiedPaymentsMinor,
        postedChargesMinor: r.postedChargesMinor,
        pendingChargesMinor: r.pendingChargesMinor,
        outstandingMinor: r.outstandingMinor,
        depositsHeldMinor: r.depositsHeldMinor,
        depositsReportedMinor: r.depositsReportedMinor,
        refundsOpenMinor: r.refundsOpenMinor,
      })),
      pending: { payments: Number(pend.payments), charges: Number(pend.charges), deposits: Number(pend.deposits), refunds: Number(pend.refunds) },
    }
    counts.financePending = Number(pend.payments) + Number(pend.charges) + Number(pend.deposits)
    counts.refundsPending = Number(pend.refunds)
  }

  const byTime = (a: DashboardItem, b: DashboardItem) => a.at.localeCompare(b.at)
  return {
    generatedAt: new Date().toISOString(),
    timeZone: tz,
    today,
    scope: { allBranches: access.allBranches, branchId: branchId ?? null, branches: allowed },
    sections,
    fleet,
    counts,
    todayItems: { pickups: pickups.sort(byTime), returns: returns.sort(byTime) },
    overdue: overdueItems.sort(byTime),
    attention,
    upcoming: upcoming.sort(byTime).slice(0, LIST),
    serviceDue,
    branches: branches.map((b) => ({
      ...b,
      fleet: fleetByBranch.get(b.id) ?? (Object.fromEntries(FLEET_BUCKETS.map((k) => [k, 0])) as Record<FleetBucket, number>),
      pickupsToday: perBranch.get(b.id)!.pickups,
      returnsToday: perBranch.get(b.id)!.returns,
      overdue: perBranch.get(b.id)!.overdue,
    })),
    finance,
  }
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const q = query.safeParse(req.query ?? {})
    if (!q.success) throw new AppError(400, 'VALIDATION', 'Geçersiz şube.')
    return withCompany(req, null, (tx, access) => dashboard(tx, access, q.data.branchId))
  })
}
