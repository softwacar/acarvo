import {
  type AvailabilityResponse,
  formatPhone,
  normalizeName,
  type ReservationActivityItem,
  type ReservationDetail,
  type ReservationListItem,
  type ReservationMoment,
  type ReservationPerson,
  type ReservationSearch,
  type ReservationStatusEvent,
  type ReservationWarning,
  type TimelineResponse,
  utcToWallTime,
  wallTimeInstant,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { toIso } from '../../lib/timestamps'
import type { CompanyAccess } from '../auth/context'

type Row = Record<string, unknown>

export const RESERVATION_NOT_FOUND = 'Rezervasyon bulunamadı veya bu rezervasyona erişim yetkiniz yok.'

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)
const str = (v: unknown) => (v == null ? null : String(v))

export const moment = (at: unknown, timeZone: string): ReservationMoment => {
  const iso = toIso(at)
  return { at: iso, local: utcToWallTime(iso, timeZone).slice(0, 16), timeZone }
}

/** Next reservation number of this company ("R-000042"). The upsert locks the counter row: concurrent creations get distinct numbers. */
export async function nextReservationNo(tx: Tx, access: CompanyAccess): Promise<string> {
  const r = await tx.execute(sql`
    insert into company_sequences (company_id, kind, next_value) values (${access.companyId}, 'reservation', 2)
    on conflict (company_id, kind) do update set next_value = company_sequences.next_value + 1
    returning next_value - 1 as value`)
  return `R-${String(Number((r.rows[0] as Row).value)).padStart(6, '0')}`
}

export async function companyTimeZone(tx: Tx, access: CompanyAccess): Promise<string> {
  return ((await tx.execute(sql`select timezone from companies where id = ${access.companyId}`)).rows[0] as Row).timezone as string
}

/** Branch scope (R10): users limited to branches see reservations that start or end in one of them. */
export function scopeSql(access: CompanyAccess, alias = 'r'): SQL {
  if (access.allBranches) return sql`true`
  if (!access.branchIds.length) return sql`false`
  return sql`(${sql.raw(alias)}.pickup_branch_id in ${access.branchIds} or ${sql.raw(alias)}.return_branch_id in ${access.branchIds})`
}

/** The instant a company calendar day starts (midnight; the next valid minute if midnight was skipped by DST). */
export function dayStart(day: string, timeZone: string): string {
  for (const t of ['00:00', '01:00', '02:00']) {
    const at = wallTimeInstant(`${day}T${t}`, timeZone, 'earlier')
    if (at) return at
  }
  return `${day}T00:00:00.000Z`
}
export const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

const LIST_SELECT = sql`
  r.id, r.reservation_no, r.status, r.source, r.pickup_at, r.return_at, r.pickup_timezone, r.return_timezone, r.created_at,
  c.id as customer_id, c.customer_no, c.display_name,
  a.id as account_id, a.account_no, a.legal_name,
  vc.id as class_id, vc.name as class_name,
  v.id as vehicle_id, v.plate, v.make, v.model,
  pb.id as pb_id, pb.name as pb_name, pb.code as pb_code,
  rb.id as rb_id, rb.name as rb_name, rb.code as rb_code`
const LIST_FROM = sql`
  from reservations r
  join customers c on c.company_id = r.company_id and c.id = r.customer_id
  left join corporate_accounts a on a.company_id = r.company_id and a.id = r.corporate_account_id
  join vehicle_classes vc on vc.company_id = r.company_id and vc.id = r.vehicle_class_id
  left join vehicles v on v.company_id = r.company_id and v.id = r.vehicle_id
  join branches pb on pb.company_id = r.company_id and pb.id = r.pickup_branch_id
  join branches rb on rb.company_id = r.company_id and rb.id = r.return_branch_id`

export function listItem(r: Row, showAccount: boolean): ReservationListItem {
  return {
    id: r.id as string,
    reservationNo: r.reservation_no as string,
    status: r.status as ReservationListItem['status'],
    source: r.source as ReservationListItem['source'],
    customer: { id: r.customer_id as string, customerNo: r.customer_no as string, displayName: r.display_name as string },
    corporateAccount: showAccount && r.account_id ? { id: r.account_id as string, accountNo: r.account_no as string, legalName: r.legal_name as string } : null,
    vehicleClass: { id: r.class_id as string, name: r.class_name as string },
    vehicle: r.vehicle_id ? { id: r.vehicle_id as string, plate: r.plate as string, make: r.make as string, model: r.model as string } : null,
    pickupBranch: { id: r.pb_id as string, name: r.pb_name as string, code: r.pb_code as string },
    returnBranch: { id: r.rb_id as string, name: r.rb_name as string, code: r.rb_code as string },
    pickup: moment(r.pickup_at, r.pickup_timezone as string),
    return: moment(r.return_at, r.return_timezone as string),
    createdAt: toIso(r.created_at),
  }
}

const SORT_SQL: Record<ReservationSearch['sort'], string> = { pickup: 'r.pickup_at', created: 'r.created_at', number: 'r.reservation_no' }

/** Company reservations in the user's branch scope, filtered, sorted and paged in one query. */
export async function listReservations(tx: Tx, access: CompanyAccess, q: ReservationSearch) {
  const conds: SQL[] = [scopeSql(access)]
  if (q.status === 'active') conds.push(sql`r.status in ('pending', 'confirmed')`)
  else if (q.status !== 'all') conds.push(sql`r.status = ${q.status}`)
  if (q.from || q.to) {
    const tz = await companyTimeZone(tx, access)
    // Reservations overlapping the chosen company days.
    if (q.from) conds.push(sql`r.return_at > ${dayStart(q.from, tz)}`)
    if (q.to) conds.push(sql`r.pickup_at < ${dayStart(nextDay(q.to), tz)}`)
  }
  if (q.branchId) conds.push(sql`(r.pickup_branch_id = ${q.branchId} or r.return_branch_id = ${q.branchId})`)
  if (q.vehicleClassId) conds.push(sql`r.vehicle_class_id = ${q.vehicleClassId}`)
  if (q.vehicleId) conds.push(sql`r.vehicle_id = ${q.vehicleId}`)
  if (q.customerId) conds.push(sql`(r.customer_id = ${q.customerId} or r.booker_customer_id = ${q.customerId} or exists (select 1 from reservation_drivers d where d.company_id = r.company_id and d.reservation_id = r.id and d.customer_id = ${q.customerId} and d.removed_at is null))`)
  if (q.corporateAccountId) conds.push(sql`r.corporate_account_id = ${q.corporateAccountId}`)
  if (q.assigned === 'yes') conds.push(sql`r.vehicle_id is not null`)
  if (q.assigned === 'no') conds.push(sql`r.vehicle_id is null`)
  if (q.q) {
    const text = q.q.trim().toLowerCase()
    const parts: SQL[] = [sql`lower(r.reservation_no) like ${`%${escapeLike(text)}%`}`]
    if (!/^r-?\d+$/.test(text)) {
      const name = normalizeName(q.q)
      if (name) parts.push(sql`c.name_normalized like ${`%${escapeLike(name)}%`}`)
      parts.push(sql`lower(c.customer_no) like ${`%${escapeLike(text)}%`}`)
      const plate = q.q.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (plate.length >= 3) parts.push(sql`v.plate_normalized like ${`%${escapeLike(plate)}%`}`)
      const digits = q.q.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '')
      if (digits.length >= 4 && /^[\d\s()+./-]+$/.test(q.q.trim())) parts.push(sql`c.phone_e164 like ${`%${escapeLike(digits)}%`}`)
      if (/[a-z@]/.test(text) && text.includes('@')) parts.push(sql`c.email like ${`%${escapeLike(text)}%`}`)
    }
    conds.push(sql`(${sql.join(parts, sql` or `)})`)
  }
  const where = sql`where ${sql.join(conds, sql` and `)}`
  const dir = q.dir === 'desc' ? 'desc' : 'asc'
  const rows = (
    await tx.execute(sql`select ${LIST_SELECT}, count(*) over () as total_count ${LIST_FROM} ${where}
      order by ${sql.raw(`${SORT_SQL[q.sort]} ${dir}, r.reservation_no ${dir}`)} limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)
  ).rows as Row[]
  let total = rows.length ? Number(rows[0]!.total_count) : 0
  if (!rows.length && q.page > 1) total = Number(((await tx.execute(sql`select count(*) as n ${LIST_FROM} ${where}`)).rows[0] as Row).n)
  const showAccount = access.permissions.has('corporate.read')
  return { items: rows.map((r) => listItem(r, showAccount)), total, page: q.page, pageSize: q.pageSize }
}

/** Reservations of one customer, corporate account or vehicle (360° tabs), newest pickup first. */
export async function relatedReservations(tx: Tx, access: CompanyAccess, filter: SQL) {
  const rows = (await tx.execute(sql`select ${LIST_SELECT} ${LIST_FROM} where ${scopeSql(access)} and ${filter} order by r.pickup_at desc limit 200`)).rows as Row[]
  return rows.map((r) => listItem(r, access.permissions.has('corporate.read')))
}

export async function people(tx: Tx, ids: string[], access: CompanyAccess, today: { day: string; warningUntil: string } | null): Promise<Map<string, ReservationPerson>> {
  const out = new Map<string, ReservationPerson>()
  if (!ids.length) return out
  const contact = access.permissions.has('customers.read')
  const rows = (
    await tx.execute(sql`
      select c.id, c.customer_no, c.display_name, c.status, c.phone_e164, c.email, c.residence_country
        ${
          today
            ? sql`, (select count(*)::int from customer_documents d where d.company_id = c.company_id and d.customer_id = c.id and d.record_state = 'active'
                   and not exists (select 1 from customer_documents n where n.company_id = d.company_id and n.renews_id = d.id and n.record_state <> 'voided')) as docs_total,
                 (select count(*)::int from customer_documents d where d.company_id = c.company_id and d.customer_id = c.id and d.record_state = 'active' and d.valid_until < ${today.day}
                   and not exists (select 1 from customer_documents n where n.company_id = d.company_id and n.renews_id = d.id and n.record_state <> 'voided')) as docs_expired,
                 (select count(*)::int from customer_documents d where d.company_id = c.company_id and d.customer_id = c.id and d.record_state = 'active'
                   and d.valid_until >= ${today.day} and d.valid_until <= ${today.warningUntil}
                   and not exists (select 1 from customer_documents n where n.company_id = d.company_id and n.renews_id = d.id and n.record_state <> 'voided')) as docs_expiring`
            : sql``
        }
      from customers c where c.id in ${ids}`)
  ).rows as Row[]
  for (const r of rows) {
    out.set(r.id as string, {
      id: r.id as string,
      customerNo: r.customer_no as string,
      displayName: r.display_name as string,
      status: r.status as string,
      phone: contact && r.phone_e164 ? formatPhone(r.phone_e164 as string) : null,
      email: contact ? str(r.email) : null,
      residenceCountry: contact ? str(r.residence_country) : null,
      documents: today ? { total: Number(r.docs_total), expired: Number(r.docs_expired), expiring: Number(r.docs_expiring) } : null,
    })
  }
  return out
}

/** One reservation in the user's scope, with people, vehicle, status events and warnings; or null. */
export async function getReservation(tx: Tx, access: CompanyAccess, id: string, docs: { day: string; warningUntil: string } | null): Promise<ReservationDetail | null> {
  const r = (
    await tx.execute(sql`
      select ${LIST_SELECT}, r.booker_customer_id, r.note, r.version, r.updated_at, r.corporate_account_id,
             r.confirmed_at, r.cancel_reason, r.cancel_note, r.cancelled_at, r.no_show_reason, r.no_show_note, r.no_show_at,
             v.status as vehicle_status, hb.id as hb_id, hb.name as hb_name, hb.code as hb_code,
             cu.name as created_by_name, uu.name as updated_by_name, co.name as confirmed_by_name, ca.name as cancelled_by_name, ns.name as no_show_by_name
      ${LIST_FROM}
      left join branches hb on hb.company_id = v.company_id and hb.id = v.home_branch_id
      left join users cu on cu.id = r.created_by
      left join users uu on uu.id = r.updated_by
      left join users co on co.id = r.confirmed_by
      left join users ca on ca.id = r.cancelled_by
      left join users ns on ns.id = r.no_show_by
      where r.id = ${id} and ${scopeSql(access)}
      limit 1`)
  ).rows[0] as Row | undefined
  if (!r) return null
  const drivers = (
    await tx.execute(sql`select customer_id, is_primary from reservation_drivers where reservation_id = ${id} and removed_at is null order by is_primary desc, created_at`)
  ).rows as Row[]
  const ids = [...new Set([r.customer_id as string, ...(r.booker_customer_id ? [r.booker_customer_id as string] : []), ...drivers.map((d) => d.customer_id as string)])]
  const persons = await people(tx, ids, access, docs)
  const events = (
    await tx.execute(sql`select e.id, e.from_status, e.to_status, e.reason, e.note, e.at, u.name as actor_name
      from reservation_status_events e left join users u on u.id = e.actor_user_id where e.reservation_id = ${id} order by e.at, e.id`)
  ).rows as Row[]
  const base = listItem(r, access.permissions.has('corporate.read'))
  const detail: ReservationDetail = {
    ...base,
    customer: persons.get(r.customer_id as string)!,
    booker: r.booker_customer_id ? (persons.get(r.booker_customer_id as string) ?? null) : null,
    drivers: drivers.map((d) => ({ ...persons.get(d.customer_id as string)!, isPrimary: d.is_primary as boolean })),
    vehicle: r.vehicle_id
      ? { id: r.vehicle_id as string, plate: r.plate as string, make: r.make as string, model: r.model as string, status: r.vehicle_status as string, homeBranch: { id: r.hb_id as string, name: r.hb_name as string, code: r.hb_code as string } }
      : null,
    note: str(r.note),
    confirmedAt: r.confirmed_at ? toIso(r.confirmed_at) : null,
    confirmedByName: str(r.confirmed_by_name),
    cancelReason: (r.cancel_reason as ReservationDetail['cancelReason']) ?? null,
    cancelNote: str(r.cancel_note),
    cancelledAt: r.cancelled_at ? toIso(r.cancelled_at) : null,
    cancelledByName: str(r.cancelled_by_name),
    noShowReason: (r.no_show_reason as ReservationDetail['noShowReason']) ?? null,
    noShowNote: str(r.no_show_note),
    noShowAt: r.no_show_at ? toIso(r.no_show_at) : null,
    noShowByName: str(r.no_show_by_name),
    statusEvents: events.map(
      (e): ReservationStatusEvent => ({
        id: e.id as string,
        fromStatus: (e.from_status as ReservationStatusEvent['fromStatus']) ?? null,
        toStatus: e.to_status as ReservationStatusEvent['toStatus'],
        reason: str(e.reason),
        note: str(e.note),
        actorName: str(e.actor_name),
        at: toIso(e.at),
      }),
    ),
    warnings: [],
    durationMinutes: Math.round((Date.parse(base.return.at) - Date.parse(base.pickup.at)) / 60_000),
    version: r.version as number,
    createdByName: str(r.created_by_name),
    updatedAt: toIso(r.updated_at),
    updatedByName: str(r.updated_by_name),
  }
  detail.warnings = await warningsFor(tx, detail, r.corporate_account_id as string | null)
  return detail
}

/** Facts staff should see; none of them blocks (R1, R2, R11). Subjects are numbers or plates, never names. */
async function warningsFor(tx: Tx, d: ReservationDetail, accountId: string | null): Promise<ReservationWarning[]> {
  const out: ReservationWarning[] = []
  const active = d.status === 'pending' || d.status === 'confirmed'
  if (!active) return out
  if (!d.vehicle && d.status === 'pending') out.push({ code: 'class_only_cannot_confirm' })
  if (d.vehicle && d.vehicle.status !== 'active') out.push({ code: 'vehicle_not_active', subject: d.vehicle.plate })
  if (d.vehicle && d.vehicle.homeBranch.id !== d.pickupBranch.id) out.push({ code: 'vehicle_at_other_branch', subject: d.vehicle.plate })
  if (!d.drivers.length) out.push({ code: 'no_driver' })
  if (Date.parse(d.pickup.at) < Date.now()) out.push({ code: 'pickup_passed' })
  for (const p of [d.customer, d.booker, ...d.drivers]) if (p && p.status !== 'active') out.push({ code: 'customer_archived', subject: p.customerNo })
  if (accountId) {
    const links = (
      await tx.execute(sql`select customer_id, roles from corporate_account_people where account_id = ${accountId} and ended_at is null`)
    ).rows as { customer_id: string; roles: string[] }[]
    for (const driver of d.drivers) {
      if (!links.some((l) => l.customer_id === driver.id && l.roles.includes('authorized_driver'))) out.push({ code: 'driver_not_authorized_for_account', subject: driver.customerNo })
    }
    if (d.booker && !links.some((l) => l.customer_id === d.booker!.id)) out.push({ code: 'booker_not_linked_to_account', subject: d.booker.customerNo })
  }
  return out
}

/**
 * Vehicles of a class for a period, as far as ACARVO can tell (R1, R2): status, confirmed reservations and rentals, from
 * the database function the guards use (vehicle_busy), so reservations and rentals never disagree about a vehicle.
 */
export async function availability(
  tx: Tx,
  access: CompanyAccess,
  input: { vehicleClassId: string; pickupBranchId: string; pickupAt: string; returnAt: string; excludeReservationId?: string; excludeRentalId?: string },
): Promise<Pick<AvailabilityResponse, 'vehicles' | 'classSummary' | 'notChecked'>> {
  const scope = access.allBranches ? sql`true` : access.branchIds.length ? sql`v.home_branch_id in ${access.branchIds}` : sql`false`
  const rows = (
    await tx.execute(sql`
      select v.id, v.plate, v.make, v.model, v.status, b.id as b_id, b.name as b_name, b.code as b_code,
        coalesce((select json_agg(json_build_object('kind', x.kind, 'refNo', x.ref_no, 'startsAt', x.starts_at, 'endsAt', x.ends_at) order by x.starts_at)
          from vehicle_busy(v.company_id, v.id, ${input.pickupAt}::timestamptz, ${input.returnAt}::timestamptz,
            ${input.excludeReservationId ?? null}::uuid, ${input.excludeRentalId ?? null}::uuid) x), '[]') as conflicts
      from vehicles v
      join branches b on b.company_id = v.company_id and b.id = v.home_branch_id
      where v.class_id = ${input.vehicleClassId} and v.status in ('active', 'out_of_service') and ${scope}
      order by (v.status = 'active') desc, (v.home_branch_id = ${input.pickupBranchId}) desc, v.plate`)
  ).rows as Row[]
  const summary = (
    await tx.execute(sql`
      select (select count(*)::int from vehicles where class_id = ${input.vehicleClassId} and status = 'active') as active_vehicles,
             (select count(*)::int from reservations where vehicle_class_id = ${input.vehicleClassId} and status = 'confirmed'
               ${input.excludeReservationId ? sql`and id <> ${input.excludeReservationId}` : sql``}
               and tstzrange(pickup_at, return_at, '[)') && tstzrange(${input.pickupAt}::timestamptz, ${input.returnAt}::timestamptz, '[)')) as overlapping`)
  ).rows[0] as Row
  return {
    vehicles: rows.map((r) => {
      const conflicts = (r.conflicts as { kind: 'reservation' | 'rental'; refNo: string; startsAt: string; endsAt: string | null }[]).map((c) => ({
        ...c,
        startsAt: toIso(c.startsAt),
        endsAt: c.endsAt == null ? null : toIso(c.endsAt),
      }))
      return {
        id: r.id as string,
        plate: r.plate as string,
        make: r.make as string,
        model: r.model as string,
        status: r.status as string,
        homeBranch: { id: r.b_id as string, name: r.b_name as string, code: r.b_code as string },
        available: r.status === 'active' && conflicts.length === 0,
        atOtherBranch: r.b_id !== input.pickupBranchId,
        conflicts,
      }
    }),
    classSummary: { activeVehicles: Number(summary.active_vehicles), overlappingConfirmed: Number(summary.overlapping), estimateOnly: true },
    notChecked: ['maintenance', 'transfer', 'external_sourcing', 'vehicle_location'],
  }
}

/** Vehicles (in scope) and their reservations in a window of company days. */
export async function timeline(tx: Tx, access: CompanyAccess, input: { from: string; days: number; branchId?: string; vehicleClassId?: string }): Promise<TimelineResponse> {
  const tz = await companyTimeZone(tx, access)
  let end = input.from
  for (let i = 0; i < input.days; i++) end = nextDay(end)
  const start = dayStart(input.from, tz)
  const stop = dayStart(end, tz)
  const vConds: SQL[] = [sql`v.status in ('active', 'out_of_service')`]
  if (!access.allBranches) vConds.push(access.branchIds.length ? sql`v.home_branch_id in ${access.branchIds}` : sql`false`)
  if (input.branchId) vConds.push(sql`v.home_branch_id = ${input.branchId}`)
  if (input.vehicleClassId) vConds.push(sql`v.class_id = ${input.vehicleClassId}`)
  const vehicles = (
    await tx.execute(sql`select v.id, v.plate, v.make, v.model, v.status, vc.name as class_name from vehicles v
      join vehicle_classes vc on vc.company_id = v.company_id and vc.id = v.class_id
      where ${sql.join(vConds, sql` and `)} order by vc.sort_order, vc.name, v.plate limit 300`)
  ).rows as Row[]
  const ids = vehicles.map((v) => v.id as string)
  const bars = ids.length
    ? ((
        await tx.execute(sql`select r.id, r.reservation_no, r.vehicle_id, r.status, r.pickup_at, r.return_at from reservations r
          where r.vehicle_id in ${ids} and r.status in ('pending', 'confirmed') and r.return_at > ${start} and r.pickup_at < ${stop} and ${scopeSql(access)}
          order by r.pickup_at`)
      ).rows as Row[])
    : []
  // Rentals hold the vehicle too (same rule as vehicle_busy; an overdue rental runs to the window's end).
  const rentalBars = ids.length
    ? ((
        await tx.execute(sql`select k.id, k.rental_no, k.vehicle_id, k.status, lower(o.span) as starts_at, upper(o.span) as ends_at from rentals k
          cross join lateral (select rental_occupancy(k.status, k.planned_pickup_at, k.planned_return_at, k.delivered_at, k.returned_at) as span) o
          where k.vehicle_id in ${ids} and k.status in ('prepared', 'delivered', 'returned', 'closed') and o.span && tstzrange(${start}::timestamptz, ${stop}::timestamptz, '[)')
            and (${access.allBranches ? sql`true` : access.branchIds.length ? sql`(k.pickup_branch_id in ${access.branchIds} or k.return_branch_id in ${access.branchIds} or k.actual_return_branch_id in ${access.branchIds})` : sql`false`})
          order by 5`)
      ).rows as Row[])
    : []
  const unassigned = (
    await tx.execute(sql`select count(*)::int n from reservations r where r.vehicle_id is null and r.status = 'pending' and r.return_at > ${start} and r.pickup_at < ${stop} and ${scopeSql(access)}
      ${input.vehicleClassId ? sql`and r.vehicle_class_id = ${input.vehicleClassId}` : sql``}`)
  ).rows[0] as Row
  return {
    from: input.from,
    days: input.days,
    timeZone: tz,
    windowStart: start,
    windowEnd: stop,
    vehicles: vehicles.map((v) => ({ id: v.id as string, plate: v.plate as string, make: v.make as string, model: v.model as string, className: v.class_name as string, status: v.status as string })),
    bars: bars.map((b) => ({ id: b.id as string, reservationNo: b.reservation_no as string, vehicleId: b.vehicle_id as string, status: b.status as TimelineResponse['bars'][number]['status'], pickupAt: toIso(b.pickup_at), returnAt: toIso(b.return_at) })),
    rentalBars: rentalBars.map((b) => ({
      id: b.id as string,
      rentalNo: b.rental_no as string,
      vehicleId: b.vehicle_id as string,
      status: b.status as TimelineResponse['rentalBars'][number]['status'],
      startsAt: toIso(b.starts_at),
      endsAt: b.ends_at == null ? null : toIso(b.ends_at),
    })),
    unassigned: Number(unassigned.n),
  }
}

export async function reservationActivity(tx: Tx, id: string): Promise<ReservationActivityItem[]> {
  const rows = (
    await tx.execute(sql`select a.id, a.action, a.summary, a.created_at, u.name as actor_name
      from audit_log a left join users u on u.id = a.actor_user_id
      where a.entity = 'reservation' and a.entity_id = ${id} order by a.created_at desc limit 300`)
  ).rows as Row[]
  return rows.map((r) => ({ id: r.id as string, action: r.action as string, summary: (r.summary as Record<string, unknown>) ?? null, at: toIso(r.created_at), actorName: str(r.actor_name) }))
}
