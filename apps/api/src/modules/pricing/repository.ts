import {
  calculateQuote,
  type EngineInput,
  type PriceListDetail,
  type PriceListSummary,
  type PriceQuote,
  type PricingResult,
  type QuoteLine,
  utcToWallTime,
} from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { toIso } from '../../lib/timestamps'

type Row = Record<string, unknown>
const str = (v: unknown) => (v == null ? null : String(v))
const num = (v: unknown) => (v == null ? null : Number(v))
const day = (v: unknown) => (v == null ? null : String(v).slice(0, 10))

export const PRICE_LIST_NOT_FOUND = 'Fiyat listesi bulunamadı.'

export async function listPriceLists(tx: Tx): Promise<PriceListSummary[]> {
  const rows = (
    await tx.execute(sql`select p.*, b.name as b_name, b.code as b_code, r.tax_mode, u.name as updated_by_name,
        (select count(*)::int from price_list_rates x where x.company_id = p.company_id and x.price_list_id = p.id and x.revision = p.current_revision) as rate_count
      from price_lists p
      join price_list_revisions r on r.company_id = p.company_id and r.price_list_id = p.id and r.revision = p.current_revision
      left join branches b on b.company_id = p.company_id and b.id = p.branch_id
      left join users u on u.id = p.updated_by
      order by (p.status = 'active') desc, (p.status = 'draft') desc, p.priority desc, p.name`)
  ).rows as Row[]
  return rows.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    currency: p.currency as string,
    status: p.status as PriceListSummary['status'],
    branch: p.branch_id ? { id: p.branch_id as string, name: p.b_name as string, code: p.b_code as string } : null,
    validFrom: day(p.valid_from),
    validUntil: day(p.valid_until),
    priority: Number(p.priority),
    taxMode: p.tax_mode as PriceListSummary['taxMode'],
    revision: Number(p.current_revision),
    rateCount: Number(p.rate_count),
    updatedAt: toIso(p.updated_at),
    updatedByName: str(p.updated_by_name),
  }))
}

/** One list with the rules of a revision (default: the current one). */
export async function getPriceList(tx: Tx, id: string, revision?: number): Promise<PriceListDetail | null> {
  const p = (
    await tx.execute(sql`select p.*, b.name as b_name, b.code as b_code, cu.name as created_by_name, uu.name as updated_by_name,
        (select count(*)::int from price_quotes q where q.company_id = p.company_id and q.price_list_id = p.id) as quote_count
      from price_lists p left join branches b on b.company_id = p.company_id and b.id = p.branch_id
      left join users cu on cu.id = p.created_by left join users uu on uu.id = p.updated_by where p.id = ${id}`)
  ).rows[0] as Row | undefined
  if (!p) return null
  const rev = revision ?? Number(p.current_revision)
  const r = (await tx.execute(sql`select * from price_list_revisions where price_list_id = ${id} and revision = ${rev}`)).rows[0] as Row | undefined
  if (!r) return null
  const rates = (
    await tx.execute(sql`select x.*, c.name as class_name from price_list_rates x join vehicle_classes c on c.company_id = x.company_id and c.id = x.vehicle_class_id
      where x.price_list_id = ${id} and x.revision = ${rev} order by c.sort_order, c.name`)
  ).rows as Row[]
  const seasons = (await tx.execute(sql`select * from price_list_seasons where price_list_id = ${id} and revision = ${rev} order by start_date, name`)).rows as Row[]
  const extras = (await tx.execute(sql`select * from price_list_extras where price_list_id = ${id} and revision = ${rev} order by kind desc, code`)).rows as Row[]
  const discounts = (await tx.execute(sql`select * from price_list_discounts where price_list_id = ${id} and revision = ${rev} order by name`)).rows as Row[]
  return {
    id: p.id as string,
    name: p.name as string,
    currency: p.currency as string,
    status: p.status as PriceListDetail['status'],
    branch: p.branch_id ? { id: p.branch_id as string, name: p.b_name as string, code: p.b_code as string } : null,
    validFrom: day(p.valid_from),
    validUntil: day(p.valid_until),
    priority: Number(p.priority),
    taxMode: r.tax_mode as PriceListDetail['taxMode'],
    taxRateBp: num(r.tax_rate_bp),
    taxLabel: str(r.tax_label),
    note: str(r.note),
    dayMethod: r.day_method as PriceListDetail['dayMethod'],
    graceMinutes: Number(r.grace_minutes),
    minDays: Number(r.min_days),
    revision: rev,
    rates: rates.map((x) => ({
      id: x.id as string,
      vehicleClassId: x.vehicle_class_id as string,
      vehicleClassName: x.class_name as string,
      rate1to6: Number(x.rate_1_6_minor),
      rate7to29: num(x.rate_7_29_minor),
      rate30plus: num(x.rate_30_plus_minor),
    })),
    seasons: seasons.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      startDate: day(s.start_date)!,
      endDate: day(s.end_date)!,
      vehicleClassId: str(s.vehicle_class_id),
      percentBp: Number(s.percent_bp),
      priority: Number(s.priority),
      active: s.active as boolean,
    })),
    extras: extras.map((e) => ({
      id: e.id as string,
      code: e.code as string,
      name: e.name as string,
      kind: e.kind as 'standard',
      mode: e.mode as 'per_day',
      priceMinor: Number(e.price_minor),
      maxQuantity: Number(e.max_quantity),
      taxable: e.taxable as boolean,
      active: e.active as boolean,
    })),
    discounts: discounts.map((d) => ({ id: d.id as string, name: d.name as string, type: d.type as 'percent', value: Number(d.value), minDays: Number(d.min_days), active: d.active as boolean })),
    version: Number(p.version),
    createdAt: toIso(p.created_at),
    createdByName: str(p.created_by_name),
    updatedAt: toIso(p.updated_at),
    updatedByName: str(p.updated_by_name),
    quoteCount: Number(p.quote_count),
  }
}

/**
 * The list a quote uses: the one asked for (it must be active and apply to the branch and day), otherwise the single
 * applicable active list with the highest priority. Two at the same priority is a configuration problem: no guess.
 */
export async function selectPriceList(tx: Tx, input: { priceListId?: string; branchId: string; day: string }) {
  const rows = (
    await tx.execute(sql`select id, priority from price_lists
      where status = 'active' and (branch_id is null or branch_id = ${input.branchId})
        and (valid_from is null or valid_from <= ${input.day}::date) and (valid_until is null or valid_until >= ${input.day}::date)
        ${input.priceListId ? sql`and id = ${input.priceListId}` : sql``}
      order by priority desc`)
  ).rows as Row[]
  if (!rows.length) return { id: null, ambiguous: false }
  if (!input.priceListId && rows.length > 1 && rows[0]!.priority === rows[1]!.priority) return { id: null, ambiguous: true }
  return { id: rows[0]!.id as string, ambiguous: false }
}

export interface PricingTarget {
  vehicleClassId: string
  pickupAt: string
  returnAt: string
  pickupTimeZone: string
  pickupBranchId: string
  additionalDrivers: number
}

/** Computes on the server with the current revision of the chosen list. Nothing is stored here. */
export async function priceFor(
  tx: Tx,
  target: PricingTarget,
  options: { priceListId?: string; selectedExtras: { extraId: string; quantity: number }[]; discountId?: string },
): Promise<PricingResult & { engineInput: EngineInput | null }> {
  const pickupDay = utcToWallTime(target.pickupAt, target.pickupTimeZone).slice(0, 10)
  const chosen = await selectPriceList(tx, { priceListId: options.priceListId, branchId: target.pickupBranchId, day: pickupDay })
  const unavailable = (reason: 'no_price_list' | 'ambiguous_price_list'): PricingResult & { engineInput: null } => ({
    ok: false,
    problems: [],
    currency: '',
    days: 0,
    tier: '1-6',
    dayMethod: 'rolling_24h',
    minutes: 0,
    lines: [],
    baseMinor: 0,
    extrasMinor: 0,
    discountMinor: 0,
    netMinor: 0,
    taxMinor: null,
    grossMinor: null,
    taxStatus: 'not_configured',
    notApplied: ['corporate_agreement', 'one_way', 'mileage', 'insurance_package'],
    engineVersion: '',
    priceList: null,
    unavailable: { reason },
    engineInput: null,
  })
  if (!chosen.id) return unavailable(chosen.ambiguous ? 'ambiguous_price_list' : 'no_price_list')
  const pl = (await getPriceList(tx, chosen.id))!
  const engineInput: EngineInput = {
    priceList: { id: pl.id, name: pl.name, revision: pl.revision, currency: pl.currency, dayMethod: pl.dayMethod, graceMinutes: pl.graceMinutes, minDays: pl.minDays },
    tax: { mode: pl.taxMode, rateBp: pl.taxRateBp, label: pl.taxLabel },
    vehicleClassId: target.vehicleClassId,
    pickupAt: target.pickupAt,
    returnAt: target.returnAt,
    pickupTimeZone: target.pickupTimeZone,
    rates: pl.rates.map((r) => ({ id: r.id, vehicleClassId: r.vehicleClassId, rate1to6: r.rate1to6, rate7to29: r.rate7to29, rate30plus: r.rate30plus })),
    seasons: pl.seasons,
    extras: pl.extras,
    discounts: pl.discounts,
    selectedExtras: options.selectedExtras,
    additionalDrivers: target.additionalDrivers,
    discountId: options.discountId ?? null,
  }
  const result = calculateQuote(engineInput)
  return { ...result, priceList: { id: pl.id, name: pl.name, revision: pl.revision }, unavailable: result.ok ? null : { reason: 'engine', problems: result.problems }, engineInput }
}

export function quoteOf(q: Row): PriceQuote {
  return {
    id: q.id as string,
    quoteNo: q.quote_no as string,
    status: q.status as PriceQuote['status'],
    target: q.reservation_id ? { kind: 'reservation', id: q.reservation_id as string, no: (q.target_no as string) ?? '' } : { kind: 'rental', id: q.rental_id as string, no: (q.target_no as string) ?? '' },
    currency: q.currency as string,
    priceList: { id: q.price_list_id as string, name: (q.price_list_name as string) ?? '', revision: Number(q.price_list_revision) },
    pickupAt: toIso(q.pickup_at),
    returnAt: toIso(q.return_at),
    days: Number(q.days),
    tier: q.tier as string,
    dayMethod: q.day_method as string,
    lines: q.lines as QuoteLine[],
    netMinor: Number(q.net_minor),
    taxMinor: num(q.tax_minor),
    grossMinor: num(q.gross_minor),
    taxStatus: q.tax_status as PriceQuote['taxStatus'],
    engineVersion: q.engine_version as string,
    calculatedAt: toIso(q.calculated_at),
    createdByName: str(q.created_by_name),
    supersededAt: q.superseded_at ? toIso(q.superseded_at) : null,
    matchesPlan: q.matches_plan !== false,
  }
}

/**
 * `matches_plan`: the quote's period, class and number of additional drivers are still those of its reservation / rental
 * (any change makes it outdated; nothing is recomputed silently).
 */
export const QUOTE_SELECT = sql`q.*, pl.name as price_list_name, u.name as created_by_name, coalesce(rs.reservation_no, k.rental_no) as target_no,
  case when q.reservation_id is not null
    then q.pickup_at = rs.pickup_at and q.return_at = rs.return_at and q.vehicle_class_id = rs.vehicle_class_id
      and (q.inputs ->> 'additionalDrivers')::int = greatest(0, (select count(*) from reservation_drivers d where d.company_id = rs.company_id and d.reservation_id = rs.id and d.removed_at is null) - 1)
    else q.pickup_at = k.planned_pickup_at and q.return_at = k.planned_return_at and q.vehicle_class_id = k.vehicle_class_id
      and (q.inputs ->> 'additionalDrivers')::int = greatest(0, (select count(*) from rental_drivers d where d.company_id = k.company_id and d.rental_id = k.id and d.removed_at is null) - 1)
  end as matches_plan
  from price_quotes q join price_lists pl on pl.company_id = q.company_id and pl.id = q.price_list_id
  left join users u on u.id = q.created_by
  left join reservations rs on rs.company_id = q.company_id and rs.id = q.reservation_id
  left join rentals k on k.company_id = q.company_id and k.id = q.rental_id`

/**
 * The quote currently standing for a rental: its own, otherwise its reservation's. `matchesPlan` is judged against the
 * rental's own plan (a reservation quote only counts while the rental keeps the same period, class and drivers).
 */
export async function currentQuoteForRental(tx: Tx, rentalId: string, reservationId: string | null) {
  const r = (
    await tx.execute(sql`select (select q.pickup_at = cur.planned_pickup_at and q.return_at = cur.planned_return_at and q.vehicle_class_id = cur.vehicle_class_id
            and (q.inputs ->> 'additionalDrivers')::int = greatest(0, (select count(*) from rental_drivers d where d.company_id = cur.company_id and d.rental_id = cur.id and d.removed_at is null) - 1)
          from rentals cur where cur.company_id = q.company_id and cur.id = ${rentalId}) as rental_match,
        ${QUOTE_SELECT}
      where q.status = 'quoted' and (q.rental_id = ${rentalId} ${reservationId ? sql`or q.reservation_id = ${reservationId}` : sql``})
      order by (q.rental_id is not null) desc, q.created_at desc limit 1`)
  ).rows[0] as Row | undefined
  return r ? { ...quoteOf(r), matchesPlan: r.rental_match === true } : null
}

export async function nextNo(tx: Tx, companyId: string, kind: 'price_quote' | 'contract' | 'finance_charge' | 'finance_payment' | 'finance_deposit' | 'finance_refund', prefix: string) {
  const r = await tx.execute(sql`insert into company_sequences (company_id, kind, next_value) values (${companyId}, ${kind}, 2)
    on conflict (company_id, kind) do update set next_value = company_sequences.next_value + 1 returning next_value - 1 as value`)
  return `${prefix}-${String(Number((r.rows[0] as Row).value)).padStart(6, '0')}`
}
