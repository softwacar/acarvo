import {
  allocationConflictText,
  CHECKLIST_ITEMS,
  INSPECTION_MAX_PHOTOS,
  INSPECTION_MIN_PHOTOS,
  normalizeName,
  type RentalActivityItem,
  type RentalDamageMark,
  type RentalDetail,
  type RentalDocumentCheck,
  type RentalDocumentContext,
  type RentalEvent,
  type RentalGate,
  type RentalInspection,
  type RentalListItem,
  type RentalListResponse,
  type RentalSearch,
  utcToWallTime,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { toIso } from '../../lib/timestamps'
import { vehicleBusy } from '../../lib/vehicle-allocation'
import type { CompanyAccess } from '../auth/context'
import { currentQuoteForRental } from '../pricing/repository'
import { companyTimeZone, dayStart, moment, nextDay, people } from '../reservations/repository'

type Row = Record<string, unknown>

export const RENTAL_NOT_FOUND = 'Kiralama bulunamadı veya bu kiralamaya erişim yetkiniz yok.'

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)
const str = (v: unknown) => (v == null ? null : String(v))

/** Next rental number of this company ("K-000042"). The upsert locks the counter row: concurrent creations get distinct numbers. */
export async function nextRentalNo(tx: Tx, access: CompanyAccess): Promise<string> {
  const r = await tx.execute(sql`
    insert into company_sequences (company_id, kind, next_value) values (${access.companyId}, 'rental', 2)
    on conflict (company_id, kind) do update set next_value = company_sequences.next_value + 1
    returning next_value - 1 as value`)
  return `K-${String(Number((r.rows[0] as Row).value)).padStart(6, '0')}`
}

/** Branch scope: users limited to branches see rentals that start, are planned to end or did end in one of them. */
export function rentalScopeSql(access: CompanyAccess, alias = 'k'): SQL {
  if (access.allBranches) return sql`true`
  if (!access.branchIds.length) return sql`false`
  const a = sql.raw(alias)
  return sql`(${a}.pickup_branch_id in ${access.branchIds} or ${a}.return_branch_id in ${access.branchIds} or ${a}.actual_return_branch_id in ${access.branchIds})`
}

const LIST_SELECT = sql`
  k.id, k.rental_no, k.status, k.origin, k.planned_pickup_at, k.planned_return_at, k.pickup_timezone, k.return_timezone,
  k.delivered_at, k.returned_at, k.actual_return_timezone, k.created_at,
  rs.id as reservation_id, rs.reservation_no,
  c.id as customer_id, c.customer_no, c.display_name,
  a.id as account_id, a.account_no, a.legal_name,
  vc.id as class_id, vc.name as class_name,
  v.id as vehicle_id, v.plate, v.make, v.model,
  pb.id as pb_id, pb.name as pb_name, pb.code as pb_code,
  rb.id as rb_id, rb.name as rb_name, rb.code as rb_code,
  ab.id as ab_id, ab.name as ab_name, ab.code as ab_code`
const LIST_FROM = sql`
  from rentals k
  join customers c on c.company_id = k.company_id and c.id = k.customer_id
  left join corporate_accounts a on a.company_id = k.company_id and a.id = k.corporate_account_id
  left join reservations rs on rs.company_id = k.company_id and rs.id = k.reservation_id
  join vehicle_classes vc on vc.company_id = k.company_id and vc.id = k.vehicle_class_id
  join vehicles v on v.company_id = k.company_id and v.id = k.vehicle_id
  join branches pb on pb.company_id = k.company_id and pb.id = k.pickup_branch_id
  join branches rb on rb.company_id = k.company_id and rb.id = k.return_branch_id
  left join branches ab on ab.company_id = k.company_id and ab.id = k.actual_return_branch_id`

const overdueMinutes = (status: string, plannedReturn: string) => {
  if (status !== 'delivered') return null
  const late = Date.now() - Date.parse(plannedReturn)
  return late > 0 ? Math.floor(late / 60_000) : null
}

export function listItem(r: Row, showAccount: boolean): RentalListItem {
  const plannedReturn = moment(r.planned_return_at, r.return_timezone as string)
  return {
    id: r.id as string,
    rentalNo: r.rental_no as string,
    status: r.status as RentalListItem['status'],
    origin: r.origin as RentalListItem['origin'],
    reservation: r.reservation_id ? { id: r.reservation_id as string, reservationNo: r.reservation_no as string } : null,
    customer: { id: r.customer_id as string, customerNo: r.customer_no as string, displayName: r.display_name as string },
    corporateAccount: showAccount && r.account_id ? { id: r.account_id as string, accountNo: r.account_no as string, legalName: r.legal_name as string } : null,
    vehicleClass: { id: r.class_id as string, name: r.class_name as string },
    vehicle: { id: r.vehicle_id as string, plate: r.plate as string, make: r.make as string, model: r.model as string },
    pickupBranch: { id: r.pb_id as string, name: r.pb_name as string, code: r.pb_code as string },
    returnBranch: { id: r.rb_id as string, name: r.rb_name as string, code: r.rb_code as string },
    actualReturnBranch: r.ab_id ? { id: r.ab_id as string, name: r.ab_name as string, code: r.ab_code as string } : null,
    plannedPickup: moment(r.planned_pickup_at, r.pickup_timezone as string),
    plannedReturn,
    delivered: r.delivered_at ? moment(r.delivered_at, r.pickup_timezone as string) : null,
    returned: r.returned_at ? moment(r.returned_at, r.actual_return_timezone as string) : null,
    overdueMinutes: overdueMinutes(r.status as string, plannedReturn.at),
    createdAt: toIso(r.created_at),
  }
}

const SORT_SQL: Record<RentalSearch['sort'], string> = { pickup: 'k.planned_pickup_at', return: 'k.planned_return_at', created: 'k.created_at', number: 'k.rental_no' }

const VIEW_SQL: Record<RentalSearch['view'], SQL> = {
  active: sql`k.status in ('prepared', 'delivered')`,
  prepared: sql`k.status = 'prepared'`,
  delivered: sql`k.status = 'delivered'`,
  overdue: sql`k.status = 'delivered' and k.planned_return_at < now()`,
  returned: sql`k.status = 'returned'`,
  closed: sql`k.status = 'closed'`,
  cancelled: sql`k.status = 'cancelled'`,
  all: sql`true`,
}

/** Company rentals in the user's branch scope, filtered, sorted and paged in one query; tab counts in a second. */
export async function listRentals(tx: Tx, access: CompanyAccess, q: RentalSearch): Promise<RentalListResponse> {
  const conds: SQL[] = [rentalScopeSql(access), VIEW_SQL[q.view]]
  if (q.from || q.to) {
    const tz = await companyTimeZone(tx, access)
    // Rentals overlapping the chosen company days (planned or real times, whichever is wider).
    if (q.from) conds.push(sql`coalesce(k.returned_at, greatest(k.planned_return_at, case when k.status = 'delivered' then now() end)) > ${dayStart(q.from, tz)}`)
    if (q.to) conds.push(sql`least(k.planned_pickup_at, coalesce(k.delivered_at, k.planned_pickup_at)) < ${dayStart(nextDay(q.to), tz)}`)
  }
  if (q.branchId) conds.push(sql`(k.pickup_branch_id = ${q.branchId} or k.return_branch_id = ${q.branchId} or k.actual_return_branch_id = ${q.branchId})`)
  if (q.vehicleId) conds.push(sql`k.vehicle_id = ${q.vehicleId}`)
  if (q.customerId) conds.push(sql`(k.customer_id = ${q.customerId} or exists (select 1 from rental_drivers d where d.company_id = k.company_id and d.rental_id = k.id and d.customer_id = ${q.customerId} and d.removed_at is null))`)
  if (q.corporateAccountId) conds.push(sql`k.corporate_account_id = ${q.corporateAccountId}`)
  if (q.q) {
    const text = q.q.trim().toLowerCase()
    const parts: SQL[] = [sql`lower(k.rental_no) like ${`%${escapeLike(text)}%`}`, sql`lower(rs.reservation_no) like ${`%${escapeLike(text)}%`}`]
    if (!/^[kr]-?\d+$/.test(text)) {
      const name = normalizeName(q.q)
      if (name) parts.push(sql`c.name_normalized like ${`%${escapeLike(name)}%`}`)
      parts.push(sql`lower(c.customer_no) like ${`%${escapeLike(text)}%`}`)
      const plate = q.q.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (plate.length >= 3) parts.push(sql`v.plate_normalized like ${`%${escapeLike(plate)}%`}`)
      const digits = q.q.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '')
      if (digits.length >= 4 && /^[\d\s()+./-]+$/.test(q.q.trim())) parts.push(sql`c.phone_e164 like ${`%${escapeLike(digits)}%`}`)
    }
    conds.push(sql`(${sql.join(parts, sql` or `)})`)
  }
  const where = sql`where ${sql.join(conds, sql` and `)}`
  const dir = q.dir === 'desc' ? 'desc' : 'asc'
  const rows = (
    await tx.execute(sql`select ${LIST_SELECT}, count(*) over () as total_count ${LIST_FROM} ${where}
      order by ${sql.raw(`${SORT_SQL[q.sort]} ${dir}, k.rental_no ${dir}`)} limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)
  ).rows as Row[]
  let total = rows.length ? Number(rows[0]!.total_count) : 0
  if (!rows.length && q.page > 1) total = Number(((await tx.execute(sql`select count(*) as n ${LIST_FROM} ${where}`)).rows[0] as Row).n)
  const c = (
    await tx.execute(sql`select
        count(*) filter (where k.status in ('prepared', 'delivered'))::int as active,
        count(*) filter (where k.status = 'prepared')::int as prepared,
        count(*) filter (where k.status = 'delivered')::int as delivered,
        count(*) filter (where k.status = 'delivered' and k.planned_return_at < now())::int as overdue,
        count(*) filter (where k.status = 'returned')::int as returned
      from rentals k where k.status in ('prepared', 'delivered', 'returned') and ${rentalScopeSql(access)}`)
  ).rows[0] as Row
  const showAccount = access.permissions.has('corporate.read')
  return {
    items: rows.map((r) => listItem(r, showAccount)),
    total,
    page: q.page,
    pageSize: q.pageSize,
    counts: { active: Number(c.active), prepared: Number(c.prepared), delivered: Number(c.delivered), overdue: Number(c.overdue), returned: Number(c.returned) },
  }
}

/** Rentals of one customer, corporate account or vehicle (360° tabs), newest first. */
export async function relatedRentals(tx: Tx, access: CompanyAccess, filter: SQL) {
  const rows = (await tx.execute(sql`select ${LIST_SELECT} ${LIST_FROM} where ${rentalScopeSql(access)} and ${filter} order by k.planned_pickup_at desc limit 200`)).rows as Row[]
  return rows.map((r) => listItem(r, access.permissions.has('corporate.read')))
}

// ---------------------------------------------------------------------------
// Inspections

const photoUrl = (rentalId: string, photoId: string, thumb = false) => `/api/rentals/${rentalId}/photos/${photoId}${thumb ? '?variant=thumb' : ''}`

export function markOf(m: Row): RentalDamageMark {
  return {
    id: m.id as string,
    view: m.view as RentalDamageMark['view'],
    x: Number(m.x_permille),
    y: Number(m.y_permille),
    category: m.category as RentalDamageMark['category'],
    note: str(m.note),
    photoId: str(m.photo_id),
    existingMarkId: str(m.existing_mark_id),
  }
}

export async function loadInspection(tx: Tx, rentalId: string, kind: 'handover' | 'return'): Promise<RentalInspection | null> {
  const i = (
    await tx.execute(sql`select i.*, b.name as b_name, b.code as b_code, b.timezone as b_tz, u.name as performed_by_name,
        c.customer_no as cp_no, c.display_name as cp_name
      from rental_inspections i
      left join branches b on b.company_id = i.company_id and b.id = i.branch_id
      left join users u on u.id = i.performed_by
      left join customers c on c.company_id = i.company_id and c.id = i.counterpart_customer_id
      where i.rental_id = ${rentalId} and i.kind = ${kind}`)
  ).rows[0] as Row | undefined
  if (!i) return null
  const photos = (
    await tx.execute(sql`select p.id, p.angle, p.created_at, f.width, f.height, u.name as created_by_name from rental_inspection_photos p
      join files f on f.company_id = p.company_id and f.id = p.file_id left join users u on u.id = p.created_by
      where p.inspection_id = ${i.id as string} and p.removed_at is null order by p.created_at, p.id`)
  ).rows as Row[]
  const marks = (await tx.execute(sql`select * from rental_damage_marks where inspection_id = ${i.id as string} and removed_at is null order by created_at, id`)).rows as Row[]
  return {
    id: i.id as string,
    kind,
    state: i.state as RentalInspection['state'],
    km: i.km == null ? null : Number(i.km),
    fuel: (i.fuel as RentalInspection['fuel']) ?? null,
    cleanliness: (i.cleanliness as RentalInspection['cleanliness']) ?? null,
    condition: (i.condition as RentalInspection['condition']) ?? null,
    checklist: (i.checklist as RentalInspection['checklist']) ?? {},
    notes: str(i.notes),
    counterpart: i.counterpart_customer_id ? { id: i.counterpart_customer_id as string, customerNo: i.cp_no as string, displayName: i.cp_name as string } : null,
    occurred: i.occurred_at ? moment(i.occurred_at, (i.b_tz as string) ?? 'UTC') : null,
    branch: i.branch_id ? { id: i.branch_id as string, name: i.b_name as string, code: i.b_code as string } : null,
    performedByName: str(i.performed_by_name),
    photos: photos.map((p) => ({
      id: p.id as string,
      angle: p.angle as RentalInspection['photos'][number]['angle'],
      url: photoUrl(rentalId, p.id as string),
      thumbUrl: photoUrl(rentalId, p.id as string, true),
      width: Number(p.width),
      height: Number(p.height),
      createdAt: toIso(p.created_at),
      createdByName: str(p.created_by_name),
    })),
    marks: marks.map(markOf),
    findingsAcknowledgedAt: i.findings_acknowledged_at ? toIso(i.findings_acknowledged_at) : null,
    finalizedAt: i.finalized_at ? toIso(i.finalized_at) : null,
    version: Number(i.version),
  }
}

/** Unanswered checklist items, empty fields: what still blocks finishing an inspection. */
export function missingRecordFields(i: RentalInspection | null, kind: 'handover' | 'return'): string[] {
  const out: string[] = []
  if (kind === 'handover') {
    if (i?.km == null) out.push('km')
    if (!i?.fuel) out.push('fuel')
    if (!i?.counterpart) out.push('counterpart')
  }
  if (!i?.cleanliness) out.push('cleanliness')
  if (!i?.condition) out.push('condition')
  for (const item of CHECKLIST_ITEMS) if (!i?.checklist[item]) out.push(`checklist.${item}`)
  return out
}

// ---------------------------------------------------------------------------
// Documents (K3, K4): context for staff's decision, and the recorded decisions.

const dayIn = (at: string, tz: string) => utcToWallTime(at, tz).slice(0, 10)

/** Active, current (not renewed) customer documents valid for the whole period; and those ending within it. */
export async function periodDocuments(tx: Tx, customerIds: string[], pickupDay: string, returnDay: string) {
  if (!customerIds.length) return new Map<string, { valid: { id: string; type: string }[]; expiring: string[] }>()
  const rows = (
    await tx.execute(sql`select d.id, d.customer_id, d.type, d.valid_from, d.valid_until from customer_documents d
      where d.customer_id in ${customerIds} and d.record_state = 'active'
        and not exists (select 1 from customer_documents n where n.company_id = d.company_id and n.renews_id = d.id and n.record_state <> 'voided')
        and (d.valid_from is null or d.valid_from <= ${pickupDay}::date)`)
  ).rows as Row[]
  const out = new Map<string, { valid: { id: string; type: string }[]; expiring: string[] }>()
  for (const id of customerIds) out.set(id, { valid: [], expiring: [] })
  for (const r of rows) {
    const e = out.get(r.customer_id as string)!
    const until = r.valid_until == null ? null : String(r.valid_until).slice(0, 10)
    if (until == null || until >= returnDay) e.valid.push({ id: r.id as string, type: r.type as string })
    else if (until >= pickupDay) e.expiring.push(r.type as string)
  }
  return out
}

export async function activePolicy(tx: Tx, country: string | null, residency: 'local' | 'foreign') {
  if (!country) return null
  const p = (await tx.execute(sql`select id, version from document_requirement_policies where country = ${country} and residency_class = ${residency} and status = 'active'`)).rows[0] as Row | undefined
  if (!p) return null
  const items = (await tx.execute(sql`select accepted_types from document_requirement_items where policy_id = ${p.id as string} order by position`)).rows as Row[]
  return { id: p.id as string, version: Number(p.version), items: items.map((i) => ({ acceptedTypes: i.accepted_types as string[] })) }
}

/** Policy items not covered by the driver's valid document types. */
export const uncoveredItems = (items: { acceptedTypes: string[] }[], validTypes: string[]) => items.filter((i) => !i.acceptedTypes.some((t) => validTypes.includes(t)))

interface RentalCore {
  id: string
  status: string
  vehicleId: string
  vehicleStatus: string
  plate: string
  reservationId: string | null
  pickupBranchId: string
  pickupCountry: string | null
  plannedPickupAt: string
  plannedReturnAt: string
  pickupTimezone: string
  returnTimezone: string
  planChangedAt: string | null
}

async function latestChecks(tx: Tx, rentalId: string, since: string | null) {
  const rows = (
    await tx.execute(sql`select distinct on (dc.customer_id) dc.*, u.name as checked_by_name from rental_document_checks dc left join users u on u.id = dc.checked_by
      where dc.rental_id = ${rentalId} ${since ? sql`and dc.checked_at >= ${since}` : sql``}
      order by dc.customer_id, dc.checked_at desc, dc.id desc`)
  ).rows as Row[]
  return new Map(
    rows.map((r): [string, RentalDocumentCheck] => [
      r.customer_id as string,
      {
        customerId: r.customer_id as string,
        driverRole: r.driver_role as RentalDocumentCheck['driverRole'],
        residencyClass: r.residency_class as RentalDocumentCheck['residencyClass'],
        referenceCountry: str(r.reference_country),
        ruleStatus: r.rule_status as RentalDocumentCheck['ruleStatus'],
        policyVersion: r.policy_version == null ? null : Number(r.policy_version),
        requiredItems: (r.required_items as RentalDocumentCheck['requiredItems']) ?? [],
        documentCount: (r.document_ids as string[] | null)?.length ?? 0,
        decision: r.decision as RentalDocumentCheck['decision'],
        note: str(r.note),
        checkedByName: str(r.checked_by_name),
        checkedAt: toIso(r.checked_at),
      },
    ]),
  )
}

/** K1: the company rental operating mode; off when no row exists (RLS: only the active company). */
export async function externalTermsMode(tx: Tx): Promise<boolean> {
  const r = (await tx.execute(sql`select external_terms_mode from company_rental_settings`)).rows[0] as Row | undefined
  return r?.external_terms_mode === true
}

// ---------------------------------------------------------------------------
// Gates (spec §85.4 Teslim Masası, §10.3 closing). Re-evaluated by the server right before the action.

export async function deliveryGates(
  tx: Tx,
  companyId: string,
  k: RentalCore,
  drivers: { id: string; isPrimary: boolean }[],
  handover: RentalInspection | null,
  at: string,
): Promise<RentalGate[]> {
  const gates: RentalGate[] = []
  gates.push({ code: 'drivers', state: drivers.some((d) => d.isPrimary) ? 'ok' : 'blocked' })
  gates.push({ code: 'branch_country', state: k.pickupCountry ? 'ok' : 'blocked' })
  const checks = await latestChecks(tx, k.id, k.planChangedAt)
  const missing = drivers.filter((d) => !checks.has(d.id)).length
  const notEligible = drivers.filter((d) => checks.get(d.id)?.decision === 'not_eligible').length
  const staffOnly = drivers.filter((d) => checks.get(d.id)?.ruleStatus === 'no_policy').length
  gates.push({
    code: 'documents',
    state: missing || notEligible || !drivers.length ? 'blocked' : staffOnly ? 'attention' : 'ok',
    detail: { missing, notEligible, staffOnly },
  })
  gates.push({ code: 'vehicle_active', state: k.vehicleStatus === 'active' ? 'ok' : 'blocked', detail: { plate: k.plate } })
  if (Date.parse(k.plannedReturnAt) <= Date.parse(at)) {
    gates.push({ code: 'availability', state: 'blocked', detail: { reason: 'return_passed' } })
  } else {
    const conflicts = await vehicleBusy(tx, companyId, k.vehicleId, at, k.plannedReturnAt, { reservationId: k.reservationId, rentalId: k.id })
    gates.push({ code: 'availability', state: conflicts.length ? 'blocked' : 'ok', detail: conflicts.length ? { refs: conflicts.map((c) => (c.kind === 'reservation' || c.kind === 'rental' ? c.refNo : allocationConflictText(c))).join(', ') } : undefined })
  }
  // Maintenance and damage facts that do not block on their own: a finished maintenance is not "ready for handover"
  // (spec §59N), and an open, non-blocking damage file is shown to the staff handing the vehicle over.
  const ops = (
    await tx.execute(sql`select
        (select count(*)::int from damage_files d where d.vehicle_id = ${k.vehicleId} and d.review_status <> 'closed') as open_damages,
        (select m.maintenance_no from maintenance_records m where m.vehicle_id = ${k.vehicleId} and m.status = 'completed'
           and m.completed_at > coalesce((select max(x.delivered_at) from rentals x where x.vehicle_id = ${k.vehicleId} and x.delivered_at is not null), '-infinity')
           order by m.completed_at desc limit 1) as after_maintenance`)
  ).rows[0] as Row
  gates.push({
    code: 'vehicle_operations',
    state: Number(ops.open_damages) || ops.after_maintenance ? 'attention' : 'ok',
    detail: { openDamages: Number(ops.open_damages), maintenanceNo: str(ops.after_maintenance) },
  })
  const open = (await tx.execute(sql`select rental_no from rentals where vehicle_id = ${k.vehicleId} and status = 'returned' and id <> ${k.id} limit 1`)).rows[0] as Row | undefined
  gates.push({ code: 'previous_return_open', state: open ? 'blocked' : 'ok', detail: open ? { rentalNo: open.rental_no as string } : undefined })
  const loc = (
    await tx.execute(sql`select e.location_type, e.branch_id, b.code from vehicle_location_events e left join branches b on b.company_id = e.company_id and b.id = e.branch_id
      where e.vehicle_id = ${k.vehicleId} and not exists (select 1 from vehicle_location_corrections c where c.company_id = e.company_id and c.event_id = e.id)
      order by e.occurred_at desc, e.created_at desc limit 1`)
  ).rows[0] as Row | undefined
  gates.push({
    code: 'vehicle_location',
    state: loc && loc.location_type === 'branch' && loc.branch_id === k.pickupBranchId ? 'ok' : 'attention',
    detail: { locationType: str(loc?.location_type), branchCode: str(loc?.code) },
  })
  const missingFields = missingRecordFields(handover, 'handover')
  gates.push({ code: 'handover_record', state: missingFields.length ? 'blocked' : 'ok', detail: missingFields.length ? { missing: missingFields.length } : undefined })
  const photos = handover?.photos.length ?? 0
  gates.push({ code: 'photos', state: photos >= INSPECTION_MIN_PHOTOS && photos <= INSPECTION_MAX_PHOTOS ? 'ok' : 'blocked', detail: { count: photos } })
  // K1: without a contract or pricing module, only the company's external mode (owner's choice) allows a handover.
  gates.push({ code: 'external_terms', state: (await externalTermsMode(tx)) ? 'attention' : 'blocked' })
  // F8: a quote and a contract draft are shown, but they never release the handover on their own (no legal approval,
  // signature or payment exists in ACARVO); both stay 'attention' and the K1 gates above decide.
  const quote = await currentQuoteForRental(tx, k.id, k.reservationId)
  gates.push({
    code: 'pricing',
    state: 'attention',
    detail: quote ? { quoteNo: quote.quoteNo, currency: quote.currency, netMinor: quote.netMinor, grossMinor: quote.grossMinor, matchesPlan: quote.matchesPlan ? 1 : 0 } : undefined,
  })
  const contract = (await tx.execute(sql`select contract_no, revision, status from contracts where rental_id = ${k.id} and status in ('draft', 'under_review', 'externally_processed') limit 1`)).rows[0] as Row | undefined
  gates.push({ code: 'contract', state: 'attention', detail: contract ? { contractNo: contract.contract_no as string, revision: Number(contract.revision), status: contract.status as string } : undefined })
  return gates
}

export function newFindings(ret: RentalInspection | null) {
  return ret ? ret.marks.filter((m) => !m.existingMarkId).length : 0
}

export function closeGates(ret: RentalInspection | null): RentalGate[] {
  const missingFields = missingRecordFields(ret, 'return')
  const photos = ret?.photos.length ?? 0
  const findings = newFindings(ret)
  return [
    { code: 'return_record', state: missingFields.length ? 'blocked' : 'ok', detail: missingFields.length ? { missing: missingFields.length } : undefined },
    { code: 'photos', state: photos >= INSPECTION_MIN_PHOTOS && photos <= INSPECTION_MAX_PHOTOS ? 'ok' : 'blocked', detail: { count: photos } },
    { code: 'findings', state: findings ? 'attention' : 'ok', detail: { count: findings } },
  ]
}

// ---------------------------------------------------------------------------
// Detail

export async function rentalCore(tx: Tx, id: string): Promise<RentalCore & { row: Row }> {
  const r = (
    await tx.execute(sql`select k.*, v.status as vehicle_status, v.plate, pb.country as pickup_country,
        (select max(e.at) from rental_events e where e.company_id = k.company_id and e.rental_id = k.id and e.kind = 'updated' and (e.data ->> 'planChanged')::boolean) as plan_changed_at
      from rentals k join vehicles v on v.company_id = k.company_id and v.id = k.vehicle_id join branches pb on pb.company_id = k.company_id and pb.id = k.pickup_branch_id
      where k.id = ${id}`)
  ).rows[0] as Row
  return {
    row: r,
    id: r.id as string,
    status: r.status as string,
    vehicleId: r.vehicle_id as string,
    vehicleStatus: r.vehicle_status as string,
    plate: r.plate as string,
    reservationId: str(r.reservation_id),
    pickupBranchId: r.pickup_branch_id as string,
    pickupCountry: str(r.pickup_country),
    plannedPickupAt: toIso(r.planned_pickup_at),
    plannedReturnAt: toIso(r.planned_return_at),
    pickupTimezone: r.pickup_timezone as string,
    returnTimezone: r.return_timezone as string,
    planChangedAt: r.plan_changed_at ? toIso(r.plan_changed_at) : null,
  }
}

export async function activeDrivers(tx: Tx, rentalId: string) {
  return ((await tx.execute(sql`select customer_id, is_primary from rental_drivers where rental_id = ${rentalId} and removed_at is null order by is_primary desc, created_at`)).rows as Row[]).map((d) => ({
    id: d.customer_id as string,
    isPrimary: d.is_primary as boolean,
  }))
}

export async function documentContext(tx: Tx, k: RentalCore, driverIds: string[]): Promise<RentalDocumentContext> {
  const pickupDay = dayIn(k.plannedPickupAt, k.pickupTimezone)
  const returnDay = dayIn(k.plannedReturnAt, k.returnTimezone)
  const docs = await periodDocuments(tx, driverIds, pickupDay, returnDay)
  const residence = driverIds.length
    ? new Map(((await tx.execute(sql`select id, residence_country from customers where id in ${driverIds}`)).rows as Row[]).map((r) => [r.id as string, str(r.residence_country)]))
    : new Map<string, string | null>()
  const [local, foreign] = [await activePolicy(tx, k.pickupCountry, 'local'), await activePolicy(tx, k.pickupCountry, 'foreign')]
  return {
    referenceCountry: k.pickupCountry,
    policies: { local: local && { version: local.version, items: local.items }, foreign: foreign && { version: foreign.version, items: foreign.items } },
    drivers: driverIds.map((id) => {
      const home = residence.get(id) ?? null
      const d = docs.get(id)!
      return {
        customerId: id,
        suggestedResidency: home && k.pickupCountry ? (home === k.pickupCountry ? 'local' : 'foreign') : null,
        validTypes: [...new Set(d.valid.map((x) => x.type))],
        expiringInPeriod: [...new Set(d.expiring)],
      }
    }),
  }
}

/** One rental in the user's scope, with people, inspections, gates, document decisions and events; or null. */
export async function getRental(tx: Tx, access: CompanyAccess, id: string, opts: { uploadPolicy: { enabled: boolean; reason: string | null } }): Promise<RentalDetail | null> {
  const r = (
    await tx.execute(sql`
      select ${LIST_SELECT}, k.note, k.version, k.updated_at, k.external_terms_ack_at, k.external_pricing_ack_at, k.external_reference, k.closed_at, k.cancel_reason, k.cancel_note, k.cancelled_at,
             v.status as vehicle_status, hb.id as hb_id, hb.name as hb_name, hb.code as hb_code,
             cu.name as created_by_name, uu.name as updated_by_name, db.name as delivered_by_name, rt.name as returned_by_name, cl.name as closed_by_name, ca.name as cancelled_by_name,
             (select r2.km from odometer_readings r2 where r2.company_id = v.company_id and r2.vehicle_id = v.id
                and not exists (select 1 from odometer_corrections oc where oc.company_id = r2.company_id and oc.reading_id = r2.id)
              order by r2.occurred_at desc, r2.created_at desc limit 1) as current_km
      ${LIST_FROM}
      left join branches hb on hb.company_id = v.company_id and hb.id = v.home_branch_id
      left join users cu on cu.id = k.created_by
      left join users uu on uu.id = k.updated_by
      left join users db on db.id = k.delivered_by
      left join users rt on rt.id = k.returned_by
      left join users cl on cl.id = k.closed_by
      left join users ca on ca.id = k.cancelled_by
      where k.id = ${id} and ${rentalScopeSql(access)}
      limit 1`)
  ).rows[0] as Row | undefined
  if (!r) return null
  const core = await rentalCore(tx, id)
  const drivers = await activeDrivers(tx, id)
  const canDocs = access.permissions.has('customers.documents.read')
  const docsDay = canDocs ? { day: dayIn(new Date().toISOString(), core.pickupTimezone), warningUntil: dayIn(core.plannedReturnAt, core.returnTimezone) } : null
  const persons = await people(tx, [...new Set([r.customer_id as string, ...drivers.map((d) => d.id)])], access, docsDay)
  const handover = await loadInspection(tx, id, 'handover')
  const ret = await loadInspection(tx, id, 'return')
  const checks = core.status === 'prepared' ? await latestChecks(tx, id, core.planChangedAt) : await latestChecks(tx, id, null)
  const events = (
    await tx.execute(sql`select e.id, e.kind, e.from_status, e.to_status, e.reason, e.data, e.at, u.name as actor_name
      from rental_events e left join users u on u.id = e.actor_user_id where e.rental_id = ${id} order by e.at, e.id`)
  ).rows as Row[]
  const previous = (
    await tx.execute(sql`select m.* from rental_damage_marks m join rental_inspections i on i.company_id = m.company_id and i.id = m.inspection_id
      where i.id = (select i2.id from rental_inspections i2 where i2.vehicle_id = ${core.vehicleId} and i2.kind = 'return' and i2.state = 'final' and i2.rental_id <> ${id}
                    order by i2.finalized_at desc limit 1)
        and m.removed_at is null order by m.created_at`)
  ).rows as Row[]
  const base = listItem(r, access.permissions.has('corporate.read'))
  const overdue = base.overdueMinutes != null
  const affected = overdue
    ? ((
        await tx.execute(sql`select reservation_no, pickup_at, return_at from reservations where vehicle_id = ${core.vehicleId} and status = 'confirmed' and return_at > now() order by pickup_at limit 10`)
      ).rows as Row[])
    : []
  return {
    ...base,
    customer: persons.get(r.customer_id as string)!,
    drivers: drivers.map((d) => ({ ...persons.get(d.id)!, isPrimary: d.isPrimary })),
    vehicle: {
      id: r.vehicle_id as string,
      plate: r.plate as string,
      make: r.make as string,
      model: r.model as string,
      status: r.vehicle_status as string,
      homeBranch: { id: r.hb_id as string, name: r.hb_name as string, code: r.hb_code as string },
      currentKm: r.current_km == null ? null : Number(r.current_km),
    },
    note: str(r.note),
    deliveredByName: str(r.delivered_by_name),
    externalTerms:
      r.external_terms_ack_at && r.external_pricing_ack_at && r.external_reference
        ? { contractAckAt: toIso(r.external_terms_ack_at), pricingAckAt: toIso(r.external_pricing_ack_at), reference: r.external_reference as string, byName: str(r.delivered_by_name) }
        : null,
    externalTermsMode: await externalTermsMode(tx),
    returnedByName: str(r.returned_by_name),
    closedAt: r.closed_at ? toIso(r.closed_at) : null,
    closedByName: str(r.closed_by_name),
    cancelReason: (r.cancel_reason as RentalDetail['cancelReason']) ?? null,
    cancelNote: str(r.cancel_note),
    cancelledAt: r.cancelled_at ? toIso(r.cancelled_at) : null,
    cancelledByName: str(r.cancelled_by_name),
    documentChecks: [...checks.values()],
    documentContext:
      canDocs && core.status === 'prepared'
        ? await documentContext(
            tx,
            core,
            drivers.map((d) => d.id),
          )
        : null,
    handover,
    return: ret,
    previousReturnMarks: previous.map(markOf),
    deliveryGates: core.status === 'prepared' ? await deliveryGates(tx, access.companyId, core, drivers, handover, new Date().toISOString()) : [],
    closeGates: core.status === 'returned' ? closeGates(ret) : [],
    affectedReservations: affected.map((a) => ({ reservationNo: a.reservation_no as string, pickupAt: toIso(a.pickup_at), returnAt: toIso(a.return_at) })),
    events: events.map(
      (e): RentalEvent => ({
        id: e.id as string,
        kind: e.kind as string,
        fromStatus: (e.from_status as RentalEvent['fromStatus']) ?? null,
        toStatus: e.to_status as RentalEvent['toStatus'],
        reason: str(e.reason),
        data: (e.data as Record<string, unknown>) ?? null,
        actorName: str(e.actor_name),
        at: toIso(e.at),
      }),
    ),
    uploadPolicy: opts.uploadPolicy,
    version: Number(r.version),
    createdByName: str(r.created_by_name),
    updatedAt: toIso(r.updated_at),
    updatedByName: str(r.updated_by_name),
  }
}

export async function rentalActivity(tx: Tx, id: string): Promise<RentalActivityItem[]> {
  const rows = (
    await tx.execute(sql`select a.id, a.action, a.summary, a.created_at, u.name as actor_name
      from audit_log a left join users u on u.id = a.actor_user_id
      where a.entity = 'rental' and a.entity_id = ${id} order by a.created_at desc limit 300`)
  ).rows as Row[]
  return rows.map((r) => ({ id: r.id as string, action: r.action as string, summary: (r.summary as Record<string, unknown>) ?? null, at: toIso(r.created_at), actorName: str(r.actor_name) }))
}
