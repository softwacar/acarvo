import type {
  DepositTotals,
  FinanceCharge,
  FinanceDeposit,
  FinanceEvent,
  FinanceFileListItem,
  FinancePayment,
  FinanceRefund,
  FinanceTotals,
  RentalFinanceView,
  ReturnFacts,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { toIso } from '../../lib/timestamps'
import type { CompanyAccess } from '../auth/context'
import { currentQuoteForRental } from '../pricing/repository'
import { loadInspection, newFindings, rentalScopeSql } from '../rentals/repository'

type Row = Record<string, unknown>
const str = (v: unknown) => (v == null ? null : String(v))
const num = (v: unknown) => (v == null ? null : Number(v))
const actor = (name: unknown, at: unknown) => ({ name: str(name), at: at ? toIso(at) : null })

export const FINANCE_NOT_FOUND = 'Finans kaydı bulunamadı veya bu kayda erişim yetkiniz yok.'

// ---------------------------------------------------------------------------
// Mapping

export const CHARGE_SELECT = sql`c.*, q.quote_no, uc.name as created_name, ua.name as approved_name, ur.name as rr_name, ux.name as reversed_name
  from finance_charges c left join price_quotes q on q.company_id = c.company_id and q.id = c.quote_id
  left join users uc on uc.id = c.created_by left join users ua on ua.id = c.approved_by
  left join users ur on ur.id = c.reversal_requested_by left join users ux on ux.id = c.reversed_by`

export function chargeOf(r: Row): FinanceCharge {
  return {
    id: r.id as string,
    chargeNo: r.charge_no as string,
    kind: r.kind as 'quote' | 'manual',
    quote: r.quote_id ? { id: r.quote_id as string, no: r.quote_no as string } : null,
    description: r.description as string,
    currency: r.currency as string,
    amountMinor: Number(r.amount_minor),
    netMinor: Number(r.net_minor),
    taxMinor: num(r.tax_minor),
    taxStatus: r.tax_status as 'complete' | 'not_configured',
    status: r.status as FinanceCharge['status'],
    reason: str(r.reason),
    reviewNote: str(r.review_note),
    created: actor(r.created_name, r.created_at),
    approved: actor(r.approved_name, r.approved_at),
    reversalReason: str(r.reversal_reason),
    reversalRequested: actor(r.rr_name, r.reversal_requested_at),
    reversed: actor(r.reversed_name, r.reversed_at),
    version: Number(r.version),
  }
}

/** Payer label: a customer or corporate record by name and number, or the third party name as typed. */
export const PAYMENT_SELECT = sql`p.*, pc.display_name as payer_c_name, pc.customer_no as payer_c_no, pa.legal_name as payer_a_name, pa.account_no as payer_a_no,
    b.code as branch_code, uc.name as created_name, uv.name as verified_name, ux.name as reversed_name
  from finance_payments p left join customers pc on pc.company_id = p.company_id and pc.id = p.payer_customer_id
  left join corporate_accounts pa on pa.company_id = p.company_id and pa.id = p.payer_corporate_id
  join branches b on b.company_id = p.company_id and b.id = p.branch_id
  left join users uc on uc.id = p.created_by left join users uv on uv.id = p.verified_by left join users ux on ux.id = p.reversed_by`

export function paymentOf(r: Row): FinancePayment {
  const type = r.payer_type as 'customer' | 'corporate' | 'other'
  return {
    id: r.id as string,
    paymentNo: r.payment_no as string,
    method: r.method as FinancePayment['method'],
    currency: r.currency as string,
    amountMinor: Number(r.amount_minor),
    payer:
      type === 'customer'
        ? { type, id: r.payer_customer_id as string, name: r.payer_c_name as string, no: str(r.payer_c_no) }
        : type === 'corporate'
          ? { type, id: r.payer_corporate_id as string, name: r.payer_a_name as string, no: str(r.payer_a_no) }
          : { type, id: null, name: r.payer_name as string, no: null },
    externalReference: str(r.external_reference),
    receivedAt: toIso(r.received_at),
    branch: { id: r.branch_id as string, code: r.branch_code as string },
    note: str(r.note),
    cashAck: r.cash_ack as boolean,
    status: r.status as FinancePayment['status'],
    reviewNote: str(r.review_note),
    created: actor(r.created_name, r.created_at),
    verified: actor(r.verified_name, r.verified_at),
    reversalReason: str(r.reversal_reason),
    reversed: actor(r.reversed_name, r.reversed_at),
    version: Number(r.version),
  }
}

export const REFUND_SELECT = sql`f.*, uc.name as created_name, ua.name as approved_name, ud.name as completed_name, ux.name as reversed_name
  from finance_deposit_refunds f left join users uc on uc.id = f.created_by left join users ua on ua.id = f.approved_by
  left join users ud on ud.id = f.completed_by left join users ux on ux.id = f.reversed_by`

export function refundOf(r: Row): FinanceRefund {
  return {
    id: r.id as string,
    refundNo: r.refund_no as string,
    currency: r.currency as string,
    amountMinor: Number(r.amount_minor),
    method: r.method as FinanceRefund['method'],
    reason: r.reason as string,
    status: r.status as FinanceRefund['status'],
    reviewNote: str(r.review_note),
    externalReference: str(r.external_reference),
    created: actor(r.created_name, r.created_at),
    approved: actor(r.approved_name, r.approved_at),
    completed: actor(r.completed_name, r.completed_at),
    reversalReason: str(r.reversal_reason),
    reversed: actor(r.reversed_name, r.reversed_at),
    version: Number(r.version),
  }
}

export const DEPOSIT_SELECT = sql`d.*, uc.name as created_name, ur.name as reported_name, uv.name as verified_name,
    coalesce((select sum(x.amount_minor) from finance_deposit_refunds x where x.company_id = d.company_id and x.deposit_id = d.id and x.status = 'completed'), 0) as refunded,
    coalesce((select sum(x.amount_minor) from finance_deposit_refunds x where x.company_id = d.company_id and x.deposit_id = d.id and x.status in ('requested', 'approved')), 0) as refund_open
  from finance_deposits d left join users uc on uc.id = d.created_by left join users ur on ur.id = d.reported_by left join users uv on uv.id = d.verified_by`

export function depositOf(r: Row, refunds: FinanceRefund[]): FinanceDeposit {
  const refunded = Number(r.refunded)
  return {
    id: r.id as string,
    depositNo: r.deposit_no as string,
    currency: r.currency as string,
    amountMinor: Number(r.amount_minor),
    method: (r.method as FinanceDeposit['method']) ?? null,
    externalReference: str(r.external_reference),
    note: str(r.note),
    status: r.status as FinanceDeposit['status'],
    inReview: r.in_review as boolean,
    reviewReason: str(r.review_reason),
    created: actor(r.created_name, r.created_at),
    reported: actor(r.reported_name, r.reported_at),
    verified: actor(r.verified_name, r.verified_at),
    heldMinor: r.status === 'verified' ? Number(r.amount_minor) - refunded : 0,
    refundOpenMinor: Number(r.refund_open),
    refundedMinor: refunded,
    refunds,
    version: Number(r.version),
  }
}

// ---------------------------------------------------------------------------
// Totals — every concept separate, one currency at a time (spec §85.6, §78.3)

export function totalsOf(currency: string, charges: FinanceCharge[], payments: FinancePayment[]): FinanceTotals {
  const sum = (xs: { amountMinor: number }[]) => xs.reduce((s, x) => s + BigInt(x.amountMinor), 0n)
  const pending = sum(charges.filter((c) => c.status === 'pending'))
  const posted = sum(charges.filter((c) => c.status === 'posted' || c.status === 'reversal_requested'))
  const recorded = sum(payments.filter((p) => p.status === 'recorded'))
  const verified = sum(payments.filter((p) => p.status === 'verified'))
  const balance = posted - verified
  return {
    currency,
    pendingChargesMinor: Number(pending),
    postedChargesMinor: Number(posted),
    recordedPaymentsMinor: Number(recorded),
    verifiedPaymentsMinor: Number(verified),
    outstandingMinor: Number(balance > 0n ? balance : 0n),
    overpaidMinor: Number(balance < 0n ? -balance : 0n),
    taxIncomplete: charges.some((c) => ['pending', 'posted', 'reversal_requested'].includes(c.status) && c.taxStatus === 'not_configured'),
  }
}

export function depositTotalsOf(deposits: FinanceDeposit[]): DepositTotals[] {
  const by = new Map<string, DepositTotals>()
  for (const d of deposits) {
    const t = by.get(d.currency) ?? { currency: d.currency, requestedMinor: 0, reportedMinor: 0, heldMinor: 0, refundOpenMinor: 0, refundedMinor: 0 }
    if (d.status === 'requested') t.requestedMinor += d.amountMinor
    if (d.status === 'reported') t.reportedMinor += d.amountMinor
    t.heldMinor += d.heldMinor
    t.refundOpenMinor += d.refundOpenMinor
    t.refundedMinor += d.refundedMinor
    by.set(d.currency, t)
  }
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

export function closeBlockers(totals: FinanceTotals | null, charges: FinanceCharge[], payments: FinancePayment[], deposits: FinanceDeposit[]): string[] {
  if (!totals) return ['no_file']
  const out: string[] = []
  if (charges.some((c) => c.status === 'pending' || c.status === 'reversal_requested')) out.push('charges_pending')
  if (payments.some((p) => p.status === 'recorded')) out.push('payments_pending')
  if (deposits.some((d) => d.status === 'requested' || d.status === 'reported')) out.push('deposits_pending')
  if (deposits.some((d) => d.inReview)) out.push('deposit_in_review')
  if (deposits.some((d) => d.refundOpenMinor > 0)) out.push('refunds_pending')
  if (deposits.some((d) => d.heldMinor > 0)) out.push('deposit_held')
  if (totals.outstandingMinor > 0) out.push('outstanding')
  if (totals.overpaidMinor > 0) out.push('overpaid')
  return out
}

// ---------------------------------------------------------------------------
// Loading

/** The rental in the user's branch scope (start, planned end or actual end in scope); locked when asked. */
export async function scopedRental(tx: Tx, access: CompanyAccess, rentalId: string, lock = false) {
  return (
    await tx.execute(sql`select k.id, k.rental_no, k.status, k.customer_id, k.corporate_account_id, k.reservation_id, k.pickup_branch_id,
        k.planned_return_at, k.returned_at, c.display_name, c.customer_no, a.legal_name, a.account_no
      from rentals k join customers c on c.company_id = k.company_id and c.id = k.customer_id
      left join corporate_accounts a on a.company_id = k.company_id and a.id = k.corporate_account_id
      where k.id = ${rentalId} and ${rentalScopeSql(access)} ${lock ? sql`for update of k` : sql``}`)
  ).rows[0] as Row | undefined
}

async function returnFacts(tx: Tx, k: Row): Promise<ReturnFacts | null> {
  if (!['delivered', 'returned', 'closed'].includes(k.status as string)) return null
  const [h, r] = [await loadInspection(tx, k.id as string, 'handover'), await loadInspection(tx, k.id as string, 'return')]
  const planned = toIso(k.planned_return_at)
  const actual = k.returned_at ? toIso(k.returned_at) : null
  const late = actual ? Math.round((Date.parse(actual) - Date.parse(planned)) / 60_000) : null
  const findings = newFindings(r)
  const fuelChanged = !!(h?.fuel && r?.fuel && h.fuel !== r.fuel)
  return {
    plannedReturnAt: planned,
    actualReturnAt: actual,
    lateMinutes: late != null && late > 0 ? late : null,
    handoverKm: h?.km ?? null,
    returnKm: r?.km ?? null,
    handoverFuel: h?.fuel ?? null,
    returnFuel: r?.fuel ?? null,
    newFindings: findings,
    reviewNeeded: !!actual && ((late ?? 0) > 0 || fuelChanged || findings > 0),
  }
}

export async function financeEvents(tx: Tx, financeId: string, limit = 200): Promise<FinanceEvent[]> {
  return (
    (
      await tx.execute(sql`select e.*, u.name as actor_name,
          coalesce(c.charge_no, p.payment_no, d.deposit_no, r.refund_no) as entity_no
        from finance_events e left join users u on u.id = e.actor_user_id
        left join finance_charges c on e.entity_type = 'charge' and c.company_id = e.company_id and c.id = e.entity_id
        left join finance_payments p on e.entity_type = 'payment' and p.company_id = e.company_id and p.id = e.entity_id
        left join finance_deposits d on e.entity_type = 'deposit' and d.company_id = e.company_id and d.id = e.entity_id
        left join finance_deposit_refunds r on e.entity_type = 'refund' and r.company_id = e.company_id and r.id = e.entity_id
        where e.finance_id = ${financeId} order by e.at desc, e.id desc limit ${limit}`)
    ).rows as Row[]
  ).map((e) => ({
    id: e.id as string,
    entityType: e.entity_type as FinanceEvent['entityType'],
    entityNo: str(e.entity_no),
    kind: e.kind as string,
    fromStatus: str(e.from_status),
    toStatus: str(e.to_status),
    amountMinor: num(e.amount_minor),
    currency: str(e.currency),
    data: (e.data as Record<string, unknown>) ?? null,
    actorName: str(e.actor_name),
    at: toIso(e.at),
  }))
}

export async function depositsOf(tx: Tx, where: SQL): Promise<FinanceDeposit[]> {
  const rows = (await tx.execute(sql`select ${DEPOSIT_SELECT} where ${where} order by d.created_at`)).rows as Row[]
  if (!rows.length) return []
  const refunds = (await tx.execute(sql`select ${REFUND_SELECT} where f.deposit_id in ${rows.map((r) => r.id as string)} order by f.created_at`)).rows as Row[]
  return rows.map((d) => depositOf(d, refunds.filter((r) => r.deposit_id === d.id).map(refundOf)))
}

/** The whole finance picture of one rental (one fixed number of queries). */
export async function rentalFinanceView(tx: Tx, access: CompanyAccess, k: Row): Promise<RentalFinanceView> {
  const p = access.permissions
  const f = (
    await tx.execute(sql`select f.*, c.display_name as rc_name, c.customer_no as rc_no, a.legal_name as ra_name, a.account_no as ra_no, uc.name as created_name, ux.name as closed_name
      from rental_finances f left join customers c on c.company_id = f.company_id and c.id = f.responsible_customer_id
      left join corporate_accounts a on a.company_id = f.company_id and a.id = f.responsible_corporate_id
      left join users uc on uc.id = f.created_by left join users ux on ux.id = f.closed_by
      where f.rental_id = ${k.id as string}`)
  ).rows[0] as Row | undefined
  const quote = await currentQuoteForRental(tx, k.id as string, str(k.reservation_id))
  const charges = f ? ((await tx.execute(sql`select ${CHARGE_SELECT} where c.finance_id = ${f.id as string} order by c.created_at`)).rows as Row[]).map(chargeOf) : []
  const payments = f ? ((await tx.execute(sql`select ${PAYMENT_SELECT} where p.finance_id = ${f.id as string} order by p.received_at, p.created_at`)).rows as Row[]).map(paymentOf) : []
  const deposits = f ? await depositsOf(tx, sql`d.finance_id = ${f.id as string}`) : []
  const totals = f ? totalsOf(f.currency as string, charges, payments) : null
  const open = !!f && f.status !== 'closed'
  const rentalOpen = ['prepared', 'delivered', 'returned', 'closed'].includes(k.status as string)
  return {
    rental: {
      id: k.id as string,
      no: k.rental_no as string,
      status: k.status as string,
      customer: { id: k.customer_id as string, name: k.display_name as string, no: k.customer_no as string },
      corporate: k.corporate_account_id ? { id: k.corporate_account_id as string, name: k.legal_name as string, no: k.account_no as string } : null,
    },
    quote: quote && {
      id: quote.id,
      no: quote.quoteNo,
      currency: quote.currency,
      amountMinor: quote.grossMinor ?? quote.netMinor,
      netMinor: quote.netMinor,
      taxStatus: quote.taxStatus,
      matchesPlan: quote.matchesPlan,
      priceList: quote.priceList.name,
      revision: quote.priceList.revision,
      charged: charges.some((c) => c.quote?.id === quote.id && !['rejected', 'reversed'].includes(c.status)),
    },
    finance: f
      ? {
          id: f.id as string,
          currency: f.currency as string,
          responsible:
            f.responsible_type === 'customer'
              ? { type: 'customer', id: f.responsible_customer_id as string, name: f.rc_name as string, no: f.rc_no as string }
              : { type: 'corporate', id: f.responsible_corporate_id as string, name: f.ra_name as string, no: f.ra_no as string },
          status: f.status as 'open' | 'closed' | 'reopened',
          closed: actor(f.closed_name, f.closed_at),
          reopenReason: str(f.reopen_reason),
          version: Number(f.version),
          created: actor(f.created_name, f.created_at),
        }
      : null,
    totals,
    depositTotals: depositTotalsOf(deposits),
    charges,
    payments,
    deposits,
    events: f ? await financeEvents(tx, f.id as string) : [],
    returnFacts: await returnFacts(tx, k),
    closeBlockers: closeBlockers(totals, charges, payments, deposits),
    can: {
      open: !f && rentalOpen && (p.has('finance.charges.manage') || p.has('finance.payments.record') || p.has('finance.deposits.record')),
      prepareCharge: open && p.has('finance.charges.manage'),
      approveCharge: open && p.has('finance.charges.approve'),
      recordPayment: open && p.has('finance.payments.record'),
      verifyPayment: open && p.has('finance.payments.verify'),
      reversePayment: open && p.has('finance.charges.approve'),
      recordDeposit: open && p.has('finance.deposits.record'),
      verifyDeposit: open && p.has('finance.deposits.verify'),
      requestRefund: open && p.has('finance.refunds.request'),
      approveRefund: open && p.has('finance.refunds.approve'),
      close: !!f && p.has('finance.close'),
    },
  }
}

// ---------------------------------------------------------------------------
// Lists (Finans merkezi): branch scope through the rental; one query per page plus a count.

export const fileScope = (access: CompanyAccess) => rentalScopeSql(access, 'k')

export async function fileItems(tx: Tx, where: SQL, limit = 200): Promise<FinanceFileListItem[]> {
  const rows = (
    await tx.execute(sql`select f.id, f.status, f.currency, f.updated_at, f.responsible_type, k.id as rental_id, k.rental_no, k.status as rental_status,
        coalesce(c.id, a.id) as resp_id, coalesce(c.display_name, a.legal_name) as resp_name, coalesce(c.customer_no, a.account_no) as resp_no,
        coalesce((select sum(x.amount_minor) from finance_charges x where x.company_id = f.company_id and x.finance_id = f.id and x.status = 'pending'), 0) as pending_c,
        coalesce((select sum(x.amount_minor) from finance_charges x where x.company_id = f.company_id and x.finance_id = f.id and x.status in ('posted', 'reversal_requested')), 0) as posted_c,
        coalesce((select sum(x.amount_minor) from finance_payments x where x.company_id = f.company_id and x.finance_id = f.id and x.status = 'recorded'), 0) as recorded_p,
        coalesce((select sum(x.amount_minor) from finance_payments x where x.company_id = f.company_id and x.finance_id = f.id and x.status = 'verified'), 0) as verified_p,
        exists (select 1 from finance_charges x where x.company_id = f.company_id and x.finance_id = f.id and x.status in ('pending', 'posted', 'reversal_requested') and x.tax_status = 'not_configured') as tax_incomplete,
        (select count(*) from finance_charges x where x.company_id = f.company_id and x.finance_id = f.id and x.status in ('pending', 'reversal_requested'))
          + (select count(*) from finance_payments x where x.company_id = f.company_id and x.finance_id = f.id and x.status = 'recorded')
          + (select count(*) from finance_deposits x where x.company_id = f.company_id and x.finance_id = f.id and x.status = 'reported') as pending_n,
        (select coalesce(json_agg(json_build_object('currency', h.currency, 'minor', h.held)), '[]'::json) from (
            select d.currency, sum(d.amount_minor - coalesce((select sum(r.amount_minor) from finance_deposit_refunds r where r.company_id = d.company_id and r.deposit_id = d.id and r.status = 'completed'), 0)) as held
            from finance_deposits d where d.company_id = f.company_id and d.finance_id = f.id and d.status = 'verified' group by d.currency) h) as held
      from rental_finances f join rentals k on k.company_id = f.company_id and k.id = f.rental_id
      left join customers c on c.company_id = f.company_id and c.id = f.responsible_customer_id
      left join corporate_accounts a on a.company_id = f.company_id and a.id = f.responsible_corporate_id
      where ${where} order by f.updated_at desc limit ${limit}`)
  ).rows as Row[]
  return rows.map((r) => {
    const posted = BigInt(r.posted_c as string)
    const verified = BigInt(r.verified_p as string)
    const balance = posted - verified
    return {
      id: r.id as string,
      rental: { id: r.rental_id as string, no: r.rental_no as string, status: r.rental_status as string },
      responsible: { type: r.responsible_type as 'customer' | 'corporate', id: r.resp_id as string, name: r.resp_name as string, no: r.resp_no as string },
      status: r.status as FinanceFileListItem['status'],
      totals: {
        currency: r.currency as string,
        pendingChargesMinor: Number(r.pending_c),
        postedChargesMinor: Number(posted),
        recordedPaymentsMinor: Number(r.recorded_p),
        verifiedPaymentsMinor: Number(verified),
        outstandingMinor: Number(balance > 0n ? balance : 0n),
        overpaidMinor: Number(balance < 0n ? -balance : 0n),
        taxIncomplete: r.tax_incomplete as boolean,
      },
      depositsHeld: ((r.held as { currency: string; minor: string | number }[]) ?? []).map((h) => ({ currency: h.currency, minor: Number(h.minor) })).filter((h) => h.minor > 0),
      pending: Number(r.pending_n),
      updatedAt: toIso(r.updated_at),
    }
  })
}

/** Payment rows with their rental (alias k, for the branch scope) and the file's responsible party. */
export const PAYMENT_LIST_SELECT = sql`p.*, pc.display_name as payer_c_name, pc.customer_no as payer_c_no, pa.legal_name as payer_a_name, pa.account_no as payer_a_no,
    b.code as branch_code, uc.name as created_name, uv.name as verified_name, ux.name as reversed_name,
    k.id as kx_id, k.rental_no as kx_no, fx.responsible_type as fx_rt, coalesce(rcx.display_name, rax.legal_name) as fx_rname
  from finance_payments p left join customers pc on pc.company_id = p.company_id and pc.id = p.payer_customer_id
  left join corporate_accounts pa on pa.company_id = p.company_id and pa.id = p.payer_corporate_id
  join branches b on b.company_id = p.company_id and b.id = p.branch_id
  left join users uc on uc.id = p.created_by left join users uv on uv.id = p.verified_by left join users ux on ux.id = p.reversed_by
  join rental_finances fx on fx.company_id = p.company_id and fx.id = p.finance_id
  join rentals k on k.company_id = fx.company_id and k.id = fx.rental_id
  left join customers rcx on rcx.company_id = fx.company_id and rcx.id = fx.responsible_customer_id
  left join corporate_accounts rax on rax.company_id = fx.company_id and rax.id = fx.responsible_corporate_id`

export function paymentListItem(r: Row) {
  return {
    ...paymentOf(r),
    rental: { id: r.kx_id as string, no: r.kx_no as string },
    responsible: { type: r.fx_rt as 'customer' | 'corporate', name: (r.fx_rname as string) ?? '' },
  }
}

/** Charge rows with their rental (alias k). */
export const CHARGE_LIST_SELECT = sql`c.*, q.quote_no, uc.name as created_name, ua.name as approved_name, ur.name as rr_name, ux.name as reversed_name, k.id as kx_id, k.rental_no as kx_no
  from finance_charges c left join price_quotes q on q.company_id = c.company_id and q.id = c.quote_id
  left join users uc on uc.id = c.created_by left join users ua on ua.id = c.approved_by
  left join users ur on ur.id = c.reversal_requested_by left join users ux on ux.id = c.reversed_by
  join rental_finances fx on fx.company_id = c.company_id and fx.id = c.finance_id
  join rentals k on k.company_id = fx.company_id and k.id = fx.rental_id`
