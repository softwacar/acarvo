import { type ContractDetail, type ContractSnapshot, type ContractStatus, type ContractTemplate, checkTemplateBody, formatMoney, renderTemplate, type TemplateField, utcToWallTime } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { toIso } from '../../lib/timestamps'
import type { CompanyAccess } from '../auth/context'
import { currentQuoteForRental } from '../pricing/repository'
import { rentalScopeSql } from '../rentals/repository'

type Row = Record<string, unknown>
const str = (v: unknown) => (v == null ? null : String(v))

export const CONTRACT_NOT_FOUND = 'Sözleşme bulunamadı veya bu sözleşmeye erişim yetkiniz yok.'
export const TEMPLATE_NOT_FOUND = 'Sözleşme şablonu bulunamadı.'

export async function listTemplates(tx: Tx): Promise<ContractTemplate[]> {
  const templates = (await tx.execute(sql`select * from contract_templates order by name, created_at`)).rows as Row[]
  const versions = (
    await tx.execute(sql`select v.*, u.name as created_by_name from contract_template_versions v left join users u on u.id = v.created_by order by v.version_no desc`)
  ).rows as Row[]
  return templates.map((t) => ({
    id: t.id as string,
    name: t.name as string,
    language: t.language as ContractTemplate['language'],
    country: str(t.country),
    isSample: t.is_sample as boolean,
    versions: versions
      .filter((v) => v.template_id === t.id)
      .map((v) => ({
        id: v.id as string,
        versionNo: Number(v.version_no),
        status: v.status as 'draft' | 'active' | 'retired',
        body: v.body as string,
        usedFields: checkTemplateBody(v.body as string).used,
        createdByName: str(v.created_by_name),
        createdAt: toIso(v.created_at),
        activatedAt: v.activated_at ? toIso(v.activated_at) : null,
        version: Number(v.version),
      })),
  }))
}

export async function getTemplate(tx: Tx, id: string) {
  return (await listTemplates(tx)).find((t) => t.id === id) ?? null
}

const dmy = (local: string) => `${local.slice(8, 10)}.${local.slice(5, 7)}.${local.slice(0, 4)} ${local.slice(11, 16)}`

/**
 * What a contract says, frozen at creation (spec §83.2): parties by name and number only (no identity-document
 * numbers or addresses), vehicle, planned period in the branches' own time, the current quote (or none), and the text.
 */
export async function buildSnapshot(tx: Tx, rentalId: string, templateVersionId: string, meta: { contractNo: string; revision: number; now: Date }): Promise<{ snapshot: ContractSnapshot; quoteId: string | null; reservationId: string | null }> {
  const k = (
    await tx.execute(sql`select k.*, co.name as company_name, c.customer_no, c.display_name, a.account_no, a.legal_name, vc.name as class_name, v.plate, v.make, v.model,
        pb.name as pb_name, pb.code as pb_code, rb.name as rb_name, rb.code as rb_code, rs.reservation_no
      from rentals k join companies co on co.id = k.company_id
      join customers c on c.company_id = k.company_id and c.id = k.customer_id
      left join corporate_accounts a on a.company_id = k.company_id and a.id = k.corporate_account_id
      left join reservations rs on rs.company_id = k.company_id and rs.id = k.reservation_id
      join vehicle_classes vc on vc.company_id = k.company_id and vc.id = k.vehicle_class_id
      join vehicles v on v.company_id = k.company_id and v.id = k.vehicle_id
      join branches pb on pb.company_id = k.company_id and pb.id = k.pickup_branch_id
      join branches rb on rb.company_id = k.company_id and rb.id = k.return_branch_id
      where k.id = ${rentalId}`)
  ).rows[0] as Row
  const drivers = (
    await tx.execute(sql`select c.display_name, c.customer_no, d.is_primary from rental_drivers d join customers c on c.company_id = d.company_id and c.id = d.customer_id
      where d.rental_id = ${rentalId} and d.removed_at is null order by d.is_primary desc, d.created_at`)
  ).rows as Row[]
  const tv = (
    await tx.execute(sql`select v.version_no, v.body, t.name, t.language from contract_template_versions v join contract_templates t on t.company_id = v.company_id and t.id = v.template_id
      where v.id = ${templateVersionId} and v.status = 'active'`)
  ).rows[0] as Row | undefined
  if (!tv) return Promise.reject(new Error('template_inactive'))
  const reservationId = str(k.reservation_id)
  // A quote made for another period or class is not used: the contract then says the price is not calculated.
  const standing = await currentQuoteForRental(tx, rentalId, reservationId)
  const quote = standing?.matchesPlan ? standing : null

  const pickupLocal = utcToWallTime(toIso(k.planned_pickup_at), k.pickup_timezone as string)
  const returnLocal = utcToWallTime(toIso(k.planned_return_at), k.return_timezone as string)
  const snapshot: ContractSnapshot = {
    company: { name: k.company_name as string },
    rental: { no: k.rental_no as string },
    reservation: k.reservation_no ? { no: k.reservation_no as string } : null,
    renter: { name: k.display_name as string, no: k.customer_no as string },
    corporate: k.account_no ? { name: k.legal_name as string, no: k.account_no as string } : null,
    drivers: drivers.map((d) => ({ name: d.display_name as string, no: d.customer_no as string, primary: d.is_primary as boolean })),
    vehicle: { plate: k.plate as string, make: k.make as string, model: k.model as string, className: k.class_name as string },
    pickup: { local: pickupLocal, timeZone: k.pickup_timezone as string, branch: `${k.pb_name} (${k.pb_code})` },
    return: { local: returnLocal, timeZone: k.return_timezone as string, branch: `${k.rb_name} (${k.rb_code})` },
    quote: quote && {
      no: quote.quoteNo,
      currency: quote.currency,
      lines: quote.lines.map((l) => ({ label: l.label, amountMinor: l.amountMinor })),
      netMinor: quote.netMinor,
      taxMinor: quote.taxMinor,
      grossMinor: quote.grossMinor,
      taxStatus: quote.taxStatus,
    },
    template: { name: tv.name as string, language: tv.language as string, versionNo: Number(tv.version_no) },
    renderedText: '',
  }
  snapshot.renderedText = renderTemplate(tv.body as string, templateValues(snapshot, meta))
  return { snapshot, quoteId: quote?.id ?? null, reservationId }
}

/** Plain-text values of the allowed fields. A missing price says so; nothing is invented. */
export function templateValues(s: ContractSnapshot, meta: { contractNo: string; revision: number; now: Date }): Record<TemplateField, string> {
  const q = s.quote
  const money = (m: number) => formatMoney(m, q!.currency)
  const primary = s.drivers.find((d) => d.primary)
  const additional = s.drivers.filter((d) => !d.primary)
  const today = utcToWallTime(meta.now, s.pickup.timeZone)
  return {
    'company.name': s.company.name,
    'branch.pickup': s.pickup.branch,
    'branch.return': s.return.branch,
    'contract.no': meta.contractNo,
    'contract.date': dmy(today).slice(0, 10),
    'contract.revision': String(meta.revision),
    'template.version': String(s.template.versionNo),
    'rental.no': s.rental.no,
    'reservation.no': s.reservation?.no ?? '—',
    'renter.name': s.renter.name,
    'renter.no': s.renter.no,
    'corporate.name': s.corporate?.name ?? '—',
    'corporate.no': s.corporate?.no ?? '—',
    'driver.primary': primary ? `${primary.name} (${primary.no})` : '—',
    'drivers.additional': additional.length ? additional.map((d) => `${d.name} (${d.no})`).join(', ') : '—',
    'vehicle.plate': s.vehicle.plate,
    'vehicle.make_model': `${s.vehicle.make} ${s.vehicle.model}`,
    'vehicle.class': s.vehicle.className,
    'period.pickup': `${dmy(s.pickup.local)} (${s.pickup.timeZone})`,
    'period.return': `${dmy(s.return.local)} (${s.return.timeZone})`,
    'price.table': q
      ? [
          `Teklif ${q.no}`,
          ...q.lines.map((l) => `${l.label}: ${money(l.amountMinor)}`),
          `Net toplam: ${money(q.netMinor)}`,
          q.taxStatus === 'complete' ? `Vergi: ${money(q.taxMinor!)}\nBrüt toplam: ${money(q.grossMinor!)}` : 'Vergi: yapılandırılmadı (brüt toplam hesaplanmadı)',
          'Bu bir fiyat teklifidir; ödeme, tahsilat veya fatura değildir.',
        ].join('\n')
      : 'Fiyat hesaplanmadı: bu kiralama için kayıtlı bir fiyat teklifi yok. Bu taslak fiyat, ödeme veya fatura içermez.',
    'price.total': q ? (q.taxStatus === 'complete' ? `${money(q.grossMinor!)} (brüt)` : `${money(q.netMinor)} (net; vergi yapılandırılmadı)`) : 'Hesaplanmadı',
    'price.currency': q?.currency ?? '—',
  }
}

/** Header lines of the PDF: identifiers and status only. */
export const pdfHeader = (s: ContractSnapshot, contractNo: string, revision: number): [string, string][] => [
  ['Sözleşme no', `${contractNo} · sürüm ${revision}`],
  ['Kiralama', s.rental.no],
  ['Şablon', `${s.template.name} · şablon sürümü ${s.template.versionNo}`],
  ['Fiyat', s.quote ? `Teklif ${s.quote.no} (${s.quote.currency})` : 'Hesaplanmadı'],
  ['Durum', 'Taslak — imzalı sözleşme değildir'],
]

export async function contractRow(tx: Tx, access: CompanyAccess, id: string) {
  return (
    await tx.execute(sql`select c.*, k.rental_no, k.pickup_branch_id, q.quote_no, t.id as template_id, t.name as template_name, v.version_no,
        f.size_bytes, f.sha256, f.storage_key, ua.name as ack_by_name, uc.name as created_by_name
      from contracts c join rentals k on k.company_id = c.company_id and k.id = c.rental_id
      join contract_template_versions v on v.company_id = c.company_id and v.id = c.template_version_id
      join contract_templates t on t.company_id = v.company_id and t.id = v.template_id
      left join price_quotes q on q.company_id = c.company_id and q.id = c.quote_id
      left join contract_files f on f.company_id = c.company_id and f.contract_id = c.id
      left join users ua on ua.id = c.external_ack_by left join users uc on uc.id = c.created_by
      where c.id = ${id} and ${rentalScopeSql(access)}`)
  ).rows[0] as Row | undefined
}

export async function contractDetail(tx: Tx, access: CompanyAccess, r: Row): Promise<ContractDetail> {
  const events = (
    await tx.execute(sql`select e.*, u.name as actor_name from contract_events e left join users u on u.id = e.actor_user_id where e.contract_id = ${r.id as string} order by e.at desc, e.id limit 200`)
  ).rows as Row[]
  return {
    id: r.id as string,
    contractNo: r.contract_no as string,
    revision: Number(r.revision),
    status: r.status as ContractStatus,
    rental: { id: r.rental_id as string, no: r.rental_no as string },
    quote: r.quote_id ? { id: r.quote_id as string, no: r.quote_no as string } : null,
    template: { id: r.template_id as string, name: r.template_name as string, versionNo: Number(r.version_no) },
    snapshot: r.content as unknown as ContractSnapshot,
    externalReference: str(r.external_reference),
    externalAckAt: r.external_ack_at ? toIso(r.external_ack_at) : null,
    externalAckByName: str(r.ack_by_name),
    pdf: { available: !!r.storage_key, sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes), sha256: str(r.sha256) },
    canDownload: access.permissions.has('contracts.download') && !!r.storage_key,
    createdAt: toIso(r.created_at),
    createdByName: str(r.created_by_name),
    events: events.map((e) => ({
      id: e.id as string,
      kind: e.kind as string,
      fromStatus: (e.from_status as ContractStatus) ?? null,
      toStatus: (e.to_status as ContractStatus) ?? null,
      data: (e.data as Record<string, unknown>) ?? null,
      actorName: str(e.actor_name),
      at: toIso(e.at),
    })),
    version: Number(r.version),
  }
}

/** Contracts of a rental (all revisions), newest first. */
export async function rentalContracts(tx: Tx, rentalId: string) {
  return (
    (
      await tx.execute(sql`select c.id, c.contract_no, c.revision, c.status, c.created_at, c.external_reference, q.quote_no, t.name as template_name, v.version_no, u.name as created_by_name
        from contracts c join contract_template_versions v on v.company_id = c.company_id and v.id = c.template_version_id
        join contract_templates t on t.company_id = v.company_id and t.id = v.template_id
        left join price_quotes q on q.company_id = c.company_id and q.id = c.quote_id left join users u on u.id = c.created_by
        where c.rental_id = ${rentalId} order by c.created_at desc limit 100`)
    ).rows as Row[]
  ).map((c) => ({
    id: c.id as string,
    contractNo: c.contract_no as string,
    revision: Number(c.revision),
    status: c.status as ContractStatus,
    createdAt: toIso(c.created_at),
    createdByName: str(c.created_by_name),
    quoteNo: str(c.quote_no),
    templateName: c.template_name as string,
    templateVersionNo: Number(c.version_no),
    externalReference: str(c.external_reference),
  }))
}
