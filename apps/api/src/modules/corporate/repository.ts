import {
  type ChannelKind,
  type CorporateActivityItem,
  type CorporateAddress,
  type CorporateChannel,
  type CorporateDetail,
  type CorporateDuplicateMatch,
  type CorporateDuplicateReason,
  type CorporateListItem,
  type CorporatePerson,
  type CorporateSearch,
  type CorporateTaxId,
  type CustomerCorporateLink,
  type DriverLicenceSummary,
  customerDocumentValidity,
  formatPhone,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeTaxValue,
  normalizeWebsite,
  type PersonRole,
  taxIdWarnings,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { AppError } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import type { CompanyAccess } from '../auth/context'

type Row = Record<string, unknown>

export const ACCOUNT_NOT_FOUND = 'Kurumsal hesap bulunamadı veya bu hesaba erişim yetkiniz yok.'

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)
const str = (v: unknown) => (v == null ? null : String(v))
const dateOnly = (v: unknown) => (v == null ? null : String(v).slice(0, 10))

/** Next account number of this company ("K-00042"). The upsert locks the counter row: concurrent creations get distinct numbers. */
export async function nextAccountNo(tx: Tx, access: CompanyAccess): Promise<string> {
  const r = await tx.execute(sql`
    insert into company_sequences (company_id, kind, next_value) values (${access.companyId}, 'corporate_account', 2)
    on conflict (company_id, kind) do update set next_value = company_sequences.next_value + 1
    returning next_value - 1 as value`)
  return `K-${String(Number((r.rows[0] as Row).value)).padStart(5, '0')}`
}

/** Stored and comparison forms of a channel. A phone number without a country code takes the company's country code. */
export function channelValues(kind: ChannelKind, value: string, companyCountry: string | null, field = 'value') {
  const v = value.trim()
  if (kind === 'phone') {
    const e164 = normalizePhone(v, companyCountry)
    if (!e164) throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', { [field]: 'Telefon numarası geçersiz. Ülke koduyla girin, örneğin +387 33 123 456' })
    return { value: v, valueNormalized: e164 }
  }
  if (kind === 'email') return { value: normalizeEmail(v), valueNormalized: normalizeEmail(v) }
  if (kind === 'website') return { value: v, valueNormalized: normalizeWebsite(v) }
  return { value: v, valueNormalized: v.toLowerCase() }
}

const channelDisplay = (kind: string, value: string, normalized: string) => (kind === 'phone' ? formatPhone(normalized) : value)

const SORT_SQL: Record<CorporateSearch['sort'], string> = { name: 'a.legal_name_normalized', accountNo: 'a.account_no', created: 'a.created_at' }

/**
 * Company accounts, filtered, sorted and paged, in one query (counts and primary values come from lateral subqueries,
 * not one query per row). Every authorised user of the company sees every branch's accounts; RLS keeps other companies out.
 */
export async function listAccounts(tx: Tx, q: CorporateSearch) {
  const conds: SQL[] = []
  if (q.status !== 'all') conds.push(sql`a.status = ${q.status}`)
  if (q.country) conds.push(sql`a.country = ${q.country}`)
  if (q.people === 'with_drivers') conds.push(sql`ppl.drivers > 0`)
  if (q.people === 'without_people') conds.push(sql`ppl.people = 0`)
  if (q.q) {
    const text = q.q.trim().toLowerCase()
    const parts: SQL[] = [sql`lower(a.account_no) like ${`%${escapeLike(text)}%`}`]
    if (!/^k-?\d+$/.test(text)) {
      const name = normalizeName(q.q)
      if (name) parts.push(sql`a.legal_name_normalized like ${`%${escapeLike(name)}%`}`)
      parts.push(sql`lower(a.trade_name) like ${`%${escapeLike(text)}%`}`)
      const key = normalizeTaxValue(q.q)
      if (key.length >= 3) {
        parts.push(sql`a.registration_number_normalized like ${`%${escapeLike(key)}%`}`)
        parts.push(sql`exists (select 1 from corporate_tax_ids t where t.company_id = a.company_id and t.account_id = a.id and t.removed_at is null and t.value_normalized like ${`%${escapeLike(key)}%`})`)
      }
      if (/[a-z@]/.test(text)) parts.push(sql`exists (select 1 from corporate_contact_channels ch where ch.company_id = a.company_id and ch.account_id = a.id and ch.removed_at is null and ch.kind in ('email', 'website') and ch.value_normalized like ${`%${escapeLike(text)}%`})`)
      const digits = q.q.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '')
      if (digits.length >= 4 && /^[\d\s()+./-]+$/.test(q.q.trim())) {
        parts.push(sql`exists (select 1 from corporate_contact_channels ch where ch.company_id = a.company_id and ch.account_id = a.id and ch.removed_at is null and ch.kind = 'phone' and ch.value_normalized like ${`%${escapeLike(digits)}%`})`)
      }
    }
    conds.push(sql`(${sql.join(parts, sql` or `)})`)
  }
  const where = conds.length ? sql`where ${sql.join(conds, sql` and `)}` : sql``
  const pplJoin = sql`left join lateral (
      select count(*)::int as people, count(*) filter (where 'authorized_driver' = any(p.roles))::int as drivers
      from corporate_account_people p where p.company_id = a.company_id and p.account_id = a.id and p.ended_at is null
    ) ppl on true`
  const dir = q.dir === 'desc' ? 'desc' : 'asc'
  const order = sql.raw(`${SORT_SQL[q.sort]} ${dir}, a.account_no ${dir}`)
  const rows = (
    await tx.execute(sql`
      select a.id, a.account_no, a.legal_name, a.trade_name, a.country, a.status, a.created_at, ppl.people, ppl.drivers,
             tax.country as tax_country, tax.scheme as tax_scheme, tax.value as tax_value,
             ch.kind as ch_kind, ch.value as ch_value, ch.value_normalized as ch_norm,
             count(*) over () as total_count
      from corporate_accounts a
      ${pplJoin}
      left join lateral (
        select t.country, t.scheme, t.value from corporate_tax_ids t
        where t.company_id = a.company_id and t.account_id = a.id and t.removed_at is null
        order by t.is_primary desc, t.created_at limit 1
      ) tax on true
      left join lateral (
        select c.kind, c.value, c.value_normalized from corporate_contact_channels c
        where c.company_id = a.company_id and c.account_id = a.id and c.removed_at is null and c.kind in ('phone', 'email')
        order by c.is_primary desc, (c.kind = 'phone') desc, c.created_at limit 1
      ) ch on true
      ${where}
      order by ${order}
      limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`)
  ).rows as Row[]
  let total = rows.length ? Number(rows[0]!.total_count) : 0
  if (!rows.length && q.page > 1) total = Number(((await tx.execute(sql`select count(*) as n from corporate_accounts a ${pplJoin} ${where}`)).rows[0] as Row).n)
  const items: CorporateListItem[] = rows.map((r) => ({
    id: r.id as string,
    accountNo: r.account_no as string,
    legalName: r.legal_name as string,
    tradeName: str(r.trade_name),
    country: r.country as string,
    status: r.status as CorporateListItem['status'],
    primaryTaxId: r.tax_value ? { country: r.tax_country as string, scheme: r.tax_scheme as string, value: r.tax_value as string } : null,
    primaryContact: r.ch_kind ? { kind: r.ch_kind as ChannelKind, value: channelDisplay(r.ch_kind as string, r.ch_value as string, r.ch_norm as string) } : null,
    peopleCount: Number(r.people),
    driverCount: Number(r.drivers),
    createdAt: toIso(r.created_at),
  }))
  return { items, total, page: q.page, pageSize: q.pageSize }
}

export async function loadChannels(tx: Tx, accountId: string): Promise<CorporateChannel[]> {
  const rows = (
    await tx.execute(sql`select id, kind, value, value_normalized, label, is_primary, version from corporate_contact_channels
                         where account_id = ${accountId} and removed_at is null order by kind, is_primary desc, created_at`)
  ).rows as Row[]
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as ChannelKind,
    value: channelDisplay(r.kind as string, r.value as string, r.value_normalized as string),
    label: str(r.label),
    isPrimary: r.is_primary as boolean,
    version: r.version as number,
  }))
}

export async function loadTaxIds(tx: Tx, accountId: string): Promise<CorporateTaxId[]> {
  const rows = (
    await tx.execute(sql`select id, country, scheme, value, validity, note, is_primary, version from corporate_tax_ids
                         where account_id = ${accountId} and removed_at is null order by is_primary desc, created_at`)
  ).rows as Row[]
  return rows.map((r) => ({
    id: r.id as string,
    country: r.country as string,
    scheme: r.scheme as string,
    value: r.value as string,
    validity: r.validity as CorporateTaxId['validity'],
    note: str(r.note),
    isPrimary: r.is_primary as boolean,
    warnings: taxIdWarnings(r.country as string, r.scheme as string, r.value as string),
    version: r.version as number,
  }))
}

export async function loadAddresses(tx: Tx, accountId: string): Promise<CorporateAddress[]> {
  const rows = (
    await tx.execute(sql`select id, kind, label, line1, line2, city, region, postal_code, country, is_primary, version from corporate_addresses
                         where account_id = ${accountId} and removed_at is null
                         order by array_position(array['registered', 'billing', 'postal', 'other'], kind), is_primary desc, created_at`)
  ).rows as Row[]
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as CorporateAddress['kind'],
    label: str(r.label),
    line1: r.line1 as string,
    line2: str(r.line2),
    city: r.city as string,
    region: str(r.region),
    postalCode: str(r.postal_code),
    country: r.country as string,
    isPrimary: r.is_primary as boolean,
    version: r.version as number,
  }))
}

/** One account of the active company with its channels, tax ids and addresses, or null. */
export async function getAccount(tx: Tx, id: string): Promise<CorporateDetail | null> {
  const r = (
    await tx.execute(sql`
      select a.*, b.id as branch_id, b.name as branch_name, b.code as branch_code,
             cu.name as created_by_name, uu.name as updated_by_name, au.name as archived_by_name,
             (select count(*)::int from corporate_account_people p where p.company_id = a.company_id and p.account_id = a.id and p.ended_at is null) as people,
             (select count(*)::int from corporate_account_people p where p.company_id = a.company_id and p.account_id = a.id and p.ended_at is null and 'authorized_driver' = any(p.roles)) as drivers
      from corporate_accounts a
      left join branches b on b.company_id = a.company_id and b.id = a.created_branch_id
      left join users cu on cu.id = a.created_by
      left join users uu on uu.id = a.updated_by
      left join users au on au.id = a.archived_by
      where a.id = ${id}
      limit 1`)
  ).rows[0] as Row | undefined
  if (!r) return null
  const [channels, taxIds, addresses] = [await loadChannels(tx, id), await loadTaxIds(tx, id), await loadAddresses(tx, id)]
  return {
    id: r.id as string,
    accountNo: r.account_no as string,
    legalName: r.legal_name as string,
    tradeName: str(r.trade_name),
    country: r.country as string,
    registrationNumber: str(r.registration_number),
    registrationAuthority: str(r.registration_authority),
    preferredLanguage: (r.preferred_language as CorporateDetail['preferredLanguage']) ?? null,
    note: str(r.note),
    status: r.status as CorporateDetail['status'],
    archivedAt: r.archived_at ? toIso(r.archived_at) : null,
    archivedReason: (r.archived_reason as CorporateDetail['archivedReason']) ?? null,
    archivedByName: str(r.archived_by_name),
    createdBranch: r.branch_id ? { id: r.branch_id as string, name: r.branch_name as string, code: r.branch_code as string } : null,
    channels,
    taxIds,
    addresses,
    peopleCount: Number(r.people),
    driverCount: Number(r.drivers),
    version: r.version as number,
    createdAt: toIso(r.created_at),
    createdByName: str(r.created_by_name),
    updatedAt: toIso(r.updated_at),
    updatedByName: str(r.updated_by_name),
  }
}

/**
 * Possible duplicate accounts inside the active company only (RLS; never across companies).
 * Strong: same tax id value, same e-mail or phone channel. Possible: same normalised legal name, or the same
 * registration number in the same country. A similar name is never a certain match and nothing is merged.
 */
export async function findAccountDuplicates(
  tx: Tx,
  input: { legalNameNormalized: string | null; country: string | null; registrationNormalized: string | null; taxValueNormalized: string | null; email: string | null; phoneE164: string | null; excludeId?: string },
): Promise<CorporateDuplicateMatch[]> {
  const tests: SQL[] = []
  if (input.taxValueNormalized) tests.push(sql`exists (select 1 from corporate_tax_ids t where t.company_id = a.company_id and t.account_id = a.id and t.removed_at is null and t.value_normalized = ${input.taxValueNormalized})`)
  if (input.email) tests.push(sql`exists (select 1 from corporate_contact_channels c where c.company_id = a.company_id and c.account_id = a.id and c.removed_at is null and c.kind = 'email' and c.value_normalized = ${input.email})`)
  if (input.phoneE164) tests.push(sql`exists (select 1 from corporate_contact_channels c where c.company_id = a.company_id and c.account_id = a.id and c.removed_at is null and c.kind = 'phone' and c.value_normalized = ${input.phoneE164})`)
  if (input.legalNameNormalized) tests.push(sql`a.legal_name_normalized = ${input.legalNameNormalized}`)
  if (input.registrationNormalized && input.country) tests.push(sql`(a.registration_number_normalized = ${input.registrationNormalized} and a.country = ${input.country})`)
  if (!tests.length) return []
  const rows = (
    await tx.execute(sql`
      select a.id, a.account_no, a.legal_name, a.legal_name_normalized, a.country, a.status, a.registration_number_normalized,
        ${input.taxValueNormalized ? sql`exists (select 1 from corporate_tax_ids t where t.company_id = a.company_id and t.account_id = a.id and t.removed_at is null and t.value_normalized = ${input.taxValueNormalized})` : sql`false`} as m_tax,
        ${input.email ? sql`exists (select 1 from corporate_contact_channels c where c.company_id = a.company_id and c.account_id = a.id and c.removed_at is null and c.kind = 'email' and c.value_normalized = ${input.email})` : sql`false`} as m_email,
        ${input.phoneE164 ? sql`exists (select 1 from corporate_contact_channels c where c.company_id = a.company_id and c.account_id = a.id and c.removed_at is null and c.kind = 'phone' and c.value_normalized = ${input.phoneE164})` : sql`false`} as m_phone
      from corporate_accounts a
      where (${sql.join(tests, sql` or `)}) ${input.excludeId ? sql`and a.id <> ${input.excludeId}` : sql``}
      order by a.status, a.account_no
      limit 6`)
  ).rows as Row[]
  return rows.map((r) => {
    const reasons: CorporateDuplicateReason[] = []
    if (r.m_tax) reasons.push('tax_id')
    if (r.m_email) reasons.push('email')
    if (r.m_phone) reasons.push('phone')
    if (input.legalNameNormalized && r.legal_name_normalized === input.legalNameNormalized) reasons.push('name')
    if (input.registrationNormalized && input.country && r.registration_number_normalized === input.registrationNormalized && r.country === input.country) reasons.push('registration')
    return {
      id: r.id as string,
      accountNo: r.account_no as string,
      legalName: r.legal_name as string,
      country: r.country as string,
      status: r.status as CorporateDuplicateMatch['status'],
      strength: reasons.some((x) => x === 'tax_id' || x === 'email' || x === 'phone') ? 'strong' : 'possible',
      reasons,
    }
  })
}

/** Audit entries about one account and its records, newest first. */
export async function accountActivity(tx: Tx, accountId: string): Promise<CorporateActivityItem[]> {
  const rows = (
    await tx.execute(sql`
      select a.id, a.action, a.summary, a.created_at, u.name as actor_name
      from audit_log a left join users u on u.id = a.actor_user_id
      where (a.entity = 'corporate_account' and a.entity_id = ${accountId})
         or (a.entity in ('corporate_channel', 'corporate_tax_id', 'corporate_address', 'corporate_person') and a.summary->>'accountId' = ${accountId})
      order by a.created_at desc limit 300`)
  ).rows as Row[]
  return rows.map((r) => ({ id: r.id as string, action: r.action as string, summary: (r.summary as Record<string, unknown>) ?? null, at: toIso(r.created_at), actorName: str(r.actor_name) }))
}

/**
 * Licence summary of authorised drivers (D11): the current driving licence period with the latest validity, as a date
 * and a state. One query for all drivers; never a number or a file.
 */
async function licenceSummaries(tx: Tx, customerIds: string[], today: string, warningDays: number): Promise<Map<string, DriverLicenceSummary>> {
  const out = new Map<string, DriverLicenceSummary>()
  if (!customerIds.length) return out
  const rows = (
    await tx.execute(sql`
      select distinct on (d.customer_id) d.customer_id, d.valid_from, d.valid_until
      from customer_documents d
      where d.customer_id in ${customerIds} and d.type = 'driving_license' and d.record_state = 'active'
        and not exists (select 1 from customer_documents n where n.company_id = d.company_id and n.renews_id = d.id and n.record_state <> 'voided')
      order by d.customer_id, d.valid_until desc nulls first`)
  ).rows as Row[]
  for (const id of customerIds) out.set(id, { state: 'missing', validUntil: null })
  for (const r of rows) {
    const v = customerDocumentValidity({ recordState: 'active', superseded: false, validFrom: dateOnly(r.valid_from), validUntil: dateOnly(r.valid_until) }, today, warningDays)
    const state: DriverLicenceSummary['state'] = v.state === 'expired' ? 'expired' : v.state === 'expiring' ? 'expiring' : v.state === 'not_started' ? 'missing' : 'valid'
    out.set(r.customer_id as string, { state, validUntil: dateOnly(r.valid_until) })
  }
  return out
}

/** People linked to an account: active links first, then ended ones (history). */
export async function loadPeople(tx: Tx, accountId: string, licence: { today: string; warningDays: number } | null): Promise<CorporatePerson[]> {
  const rows = (
    await tx.execute(sql`
      select p.*, c.customer_no, c.display_name, c.status as customer_status, c.phone_e164, c.email,
             eu.name as ended_by_name, cu.name as created_by_name
      from corporate_account_people p
      join customers c on c.company_id = p.company_id and c.id = p.customer_id
      left join users eu on eu.id = p.ended_by
      left join users cu on cu.id = p.created_by
      where p.account_id = ${accountId}
      order by (p.ended_at is null) desc, p.ended_at desc nulls last, c.name_normalized`)
  ).rows as Row[]
  const drivers = [...new Set(rows.filter((r) => r.ended_at == null && (r.roles as string[]).includes('authorized_driver')).map((r) => r.customer_id as string))]
  const licences = licence ? await licenceSummaries(tx, drivers, licence.today, licence.warningDays) : new Map<string, DriverLicenceSummary>()
  return rows.map((r) => ({
    id: r.id as string,
    customer: {
      id: r.customer_id as string,
      customerNo: r.customer_no as string,
      displayName: r.display_name as string,
      status: r.customer_status as CorporatePerson['customer']['status'],
      phone: r.phone_e164 ? formatPhone(r.phone_e164 as string) : null,
      email: str(r.email),
    },
    roles: r.roles as PersonRole[],
    jobTitle: str(r.job_title),
    note: str(r.note),
    validFrom: dateOnly(r.valid_from),
    validUntil: dateOnly(r.valid_until),
    active: r.ended_at == null,
    endedAt: r.ended_at ? toIso(r.ended_at) : null,
    endedReason: (r.ended_reason as CorporatePerson['endedReason']) ?? null,
    endedByName: str(r.ended_by_name),
    version: r.version as number,
    createdAt: toIso(r.created_at),
    createdByName: str(r.created_by_name),
    licence: licences.get(r.customer_id as string) && r.ended_at == null ? licences.get(r.customer_id as string)! : null,
  }))
}

/** The corporate links of one person (Müşteri 360°), active first. */
export async function customerLinks(tx: Tx, customerId: string): Promise<CustomerCorporateLink[]> {
  const rows = (
    await tx.execute(sql`
      select p.id, p.roles, p.job_title, p.valid_from, p.valid_until, p.ended_at, a.id as account_id, a.account_no, a.legal_name, a.status
      from corporate_account_people p join corporate_accounts a on a.company_id = p.company_id and a.id = p.account_id
      where p.customer_id = ${customerId}
      order by (p.ended_at is null) desc, a.legal_name_normalized`)
  ).rows as Row[]
  return rows.map((r) => ({
    id: r.id as string,
    account: { id: r.account_id as string, accountNo: r.account_no as string, legalName: r.legal_name as string, status: r.status as CustomerCorporateLink['account']['status'] },
    roles: r.roles as PersonRole[],
    jobTitle: str(r.job_title),
    validFrom: dateOnly(r.valid_from),
    validUntil: dateOnly(r.valid_until),
    active: r.ended_at == null,
    endedAt: r.ended_at ? toIso(r.ended_at) : null,
  }))
}
