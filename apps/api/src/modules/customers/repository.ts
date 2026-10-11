import {
  type CustomerActivityItem,
  type CustomerInput,
  type CustomerDetail,
  type CustomerDuplicateMatch,
  type CustomerListItem,
  type CustomerSearch,
  type DuplicateReason,
  customerDisplayName,
  formatPhone,
  maskEmail,
  maskPhone,
  normalizeName,
  normalizePhone,
} from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { AppError } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import type { CompanyAccess } from '../auth/context'

type Row = Record<string, unknown>

export const CUSTOMER_NOT_FOUND = 'Müşteri bulunamadı veya bu müşteriye erişim yetkiniz yok.'

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)
const str = (v: unknown) => (v == null ? null : String(v))
const dateOnly = (v: unknown) => (v == null ? null : String(v).slice(0, 10))

/** Country of the active company: completes phone numbers typed without a country code. */
export async function companyCountry(tx: Tx, access: CompanyAccess): Promise<string | null> {
  const r = await tx.execute(sql`select country from companies where id = ${access.companyId}`)
  return ((r.rows[0] as Row | undefined)?.country as string) ?? null
}

/** Next customer number of this company. The upsert locks the counter row, so concurrent creations get distinct numbers. */
export async function nextCustomerNo(tx: Tx, access: CompanyAccess): Promise<string> {
  const r = await tx.execute(sql`
    insert into company_sequences (company_id, kind, next_value) values (${access.companyId}, 'customer', 2)
    on conflict (company_id, kind) do update set next_value = company_sequences.next_value + 1
    returning next_value - 1 as value`)
  const n = Number((r.rows[0] as Row).value)
  return `M-${String(n).padStart(6, '0')}`
}

/** Phone as typed → E.164, or a field error that does not repeat the value. */
export function phoneOrError(raw: string | undefined, country: string | null): { raw: string | null; e164: string | null } {
  if (!raw) return { raw: null, e164: null }
  const e164 = normalizePhone(raw, country)
  if (!e164) {
    throw new AppError(400, 'VALIDATION', 'Bazı alanlar geçersiz.', {
      phone: country ? 'Telefon numarası geçersiz. Ülke koduyla girin, örneğin +387 61 123 456' : 'Telefon numarasını ülke koduyla girin, örneğin +387 61 123 456',
    })
  }
  return { raw, e164 }
}

/** Column values for the editable fields. */
export function customerColumns(input: CustomerInput, phone: { raw: string | null; e164: string | null }) {
  const givenName = input.givenName ?? null
  const familyName = input.familyName ?? null
  return {
    givenName,
    familyName,
    displayName: customerDisplayName({ givenName, familyName }),
    nameNormalized: normalizeName(givenName, familyName),
    phoneRaw: phone.raw,
    phoneE164: phone.e164,
    email: input.email ?? null,
    // M1 classification: optional from M2 (callers keep a recorded value when an update leaves it out).
    residency: input.residency ?? null,
    nationality: input.nationality ?? null,
    residenceCountry: input.residenceCountry ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    postalCode: input.postalCode ?? null,
    region: input.region ?? null,
    addressCountry: input.addressCountry ?? null,
    preferredLanguage: input.preferredLanguage ?? null,
    contactPreference: input.contactPreference ?? null,
    operationalNote: input.operationalNote ?? null,
  }
}

const SORT_SQL: Record<CustomerSearch['sort'], string> = {
  name: 'c.name_normalized',
  customerNo: 'c.customer_no',
  created: 'c.created_at',
}

/**
 * Company customers, filtered, sorted and paged. Every authorised user of the company sees every branch's customers
 * (a customer may rent at one branch and return at another); RLS keeps other companies out.
 */
export async function listCustomers(tx: Tx, q: CustomerSearch) {
  const conds: SQL[] = [sql`c.status in ('active', 'archived')`]
  if (q.status !== 'all') conds.push(sql`c.status = ${q.status}`)
  if (q.residency) conds.push(sql`c.residency = ${q.residency}`)
  if (q.residenceCountry) conds.push(sql`c.residence_country = ${q.residenceCountry}`)
  if (q.branchId) conds.push(sql`c.created_branch_id = ${q.branchId}`)
  if (q.q) {
    const text = q.q.trim().toLowerCase()
    const parts: SQL[] = [sql`lower(c.customer_no) like ${`%${escapeLike(text)}%`}`]
    // A customer number ("M-000123", "m000123") is looked up by number only.
    if (!/^m-?\d+$/.test(text)) {
      const name = normalizeName(q.q)
      if (name) parts.push(sql`c.name_normalized like ${`%${escapeLike(name)}%`}`)
      if (/[a-z@]/.test(text)) parts.push(sql`c.email like ${`%${escapeLike(text)}%`}`)
      // Phone: digits as typed, without an international "00" or a national trunk "0"; at least 4 digits.
      const digits = q.q.replace(/\D/g, '').replace(/^00/, '').replace(/^0/, '')
      if (digits.length >= 4 && /^[\d\s()+./-]+$/.test(q.q.trim())) parts.push(sql`c.phone_e164 like ${`%${escapeLike(digits)}%`}`)
    }
    conds.push(sql`(${sql.join(parts, sql` or `)})`)
  }
  const dir = q.dir === 'desc' ? 'desc' : 'asc'
  const order = sql.raw(`${SORT_SQL[q.sort]} ${dir}, c.customer_no ${dir}`)
  const offset = (q.page - 1) * q.pageSize
  const rows = (
    await tx.execute(sql`
      select c.id, c.customer_no, c.display_name, c.phone_e164, c.email, c.residency, c.nationality, c.residence_country, c.status, c.created_at,
             b.id as branch_id, b.name as branch_name, b.code as branch_code, count(*) over () as total_count
      from customers c
      left join branches b on b.company_id = c.company_id and b.id = c.created_branch_id
      where ${sql.join(conds, sql` and `)}
      order by ${order}
      limit ${q.pageSize} offset ${offset}`)
  ).rows as Row[]
  let total = rows.length ? Number(rows[0]!.total_count) : 0
  if (!rows.length && q.page > 1) {
    total = Number(((await tx.execute(sql`select count(*) as n from customers c where ${sql.join(conds, sql` and `)}`)).rows[0] as Row).n)
  }
  const items: CustomerListItem[] = rows.map((r) => ({
    id: r.id as string,
    customerNo: r.customer_no as string,
    displayName: r.display_name as string,
    phone: r.phone_e164 ? formatPhone(r.phone_e164 as string) : null,
    email: str(r.email),
    residency: (r.residency as CustomerListItem['residency']) ?? null,
    nationality: str(r.nationality),
    residenceCountry: str(r.residence_country),
    status: r.status as CustomerListItem['status'],
    createdBranch: r.branch_id ? { id: r.branch_id as string, name: r.branch_name as string, code: r.branch_code as string } : null,
    createdAt: toIso(r.created_at),
  }))
  return { items, total, page: q.page, pageSize: q.pageSize }
}

/** One customer of the active company, or null (also for merged and anonymized records, which M1 does not show). */
export async function getCustomer(tx: Tx, id: string): Promise<CustomerDetail | null> {
  const r = (
    await tx.execute(sql`
      select c.*, b.id as branch_id, b.name as branch_name, b.code as branch_code,
             cu.name as created_by_name, uu.name as updated_by_name, au.name as archived_by_name
      from customers c
      left join branches b on b.company_id = c.company_id and b.id = c.created_branch_id
      left join users cu on cu.id = c.created_by
      left join users uu on uu.id = c.updated_by
      left join users au on au.id = c.archived_by
      where c.id = ${id} and c.status in ('active', 'archived')
      limit 1`)
  ).rows[0] as Row | undefined
  if (!r) return null
  return {
    id: r.id as string,
    customerNo: r.customer_no as string,
    givenName: str(r.given_name),
    familyName: str(r.family_name),
    displayName: r.display_name as string,
    phone: r.phone_e164 ? formatPhone(r.phone_e164 as string) : null,
    phoneRaw: str(r.phone_raw),
    email: str(r.email),
    residency: (r.residency as CustomerDetail['residency']) ?? null,
    nationality: str(r.nationality),
    residenceCountry: str(r.residence_country),
    dateOfBirth: dateOnly(r.date_of_birth),
    addressLine1: str(r.address_line1),
    addressLine2: str(r.address_line2),
    city: str(r.city),
    postalCode: str(r.postal_code),
    region: str(r.region),
    addressCountry: str(r.address_country),
    preferredLanguage: (r.preferred_language as CustomerDetail['preferredLanguage']) ?? null,
    contactPreference: (r.contact_preference as CustomerDetail['contactPreference']) ?? null,
    operationalNote: str(r.operational_note),
    status: r.status as CustomerDetail['status'],
    archivedAt: r.archived_at ? toIso(r.archived_at) : null,
    archivedReason: (r.archived_reason as CustomerDetail['archivedReason']) ?? null,
    archivedByName: str(r.archived_by_name),
    createdBranch: r.branch_id ? { id: r.branch_id as string, name: r.branch_name as string, code: r.branch_code as string } : null,
    version: r.version as number,
    createdAt: toIso(r.created_at),
    createdByName: str(r.created_by_name),
    updatedAt: toIso(r.updated_at),
    updatedByName: str(r.updated_by_name),
  }
}

/**
 * Possible duplicates inside the active company only (RLS; there is no cross-company matching).
 * Strong: same phone or same e-mail. Possible: same normalised name AND same date of birth.
 * A similar name alone never produces a suggestion. The answer is a masked summary.
 */
export async function findDuplicates(
  tx: Tx,
  input: { phoneE164: string | null; email: string | null; nameNormalized: string | null; dateOfBirth: string | null; excludeId?: string },
): Promise<CustomerDuplicateMatch[]> {
  const tests: SQL[] = []
  if (input.phoneE164) tests.push(sql`c.phone_e164 = ${input.phoneE164}`)
  if (input.email) tests.push(sql`c.email = ${input.email}`)
  if (input.nameNormalized && input.dateOfBirth) tests.push(sql`(c.name_normalized = ${input.nameNormalized} and c.date_of_birth = ${input.dateOfBirth})`)
  if (!tests.length) return []
  const rows = (
    await tx.execute(sql`
      select c.id, c.customer_no, c.display_name, c.phone_e164, c.email, c.status, c.name_normalized, c.date_of_birth
      from customers c
      where c.status in ('active', 'archived') and (${sql.join(tests, sql` or `)})
        ${input.excludeId ? sql`and c.id <> ${input.excludeId}` : sql``}
      order by c.status, c.customer_no
      limit 6`)
  ).rows as Row[]
  return rows.map((r) => {
    const reasons: DuplicateReason[] = []
    if (input.phoneE164 && r.phone_e164 === input.phoneE164) reasons.push('phone')
    if (input.email && r.email === input.email) reasons.push('email')
    if (input.nameNormalized && input.dateOfBirth && r.name_normalized === input.nameNormalized && dateOnly(r.date_of_birth) === input.dateOfBirth) reasons.push('name_dob')
    return {
      id: r.id as string,
      customerNo: r.customer_no as string,
      displayName: r.display_name as string,
      maskedPhone: maskPhone(str(r.phone_e164)),
      maskedEmail: maskEmail(str(r.email)),
      status: r.status as CustomerDuplicateMatch['status'],
      strength: reasons.includes('phone') || reasons.includes('email') ? 'strong' : 'possible',
      reasons,
    }
  })
}

/** Audit entries about one customer, newest first. */
export async function customerActivity(tx: Tx, customerId: string): Promise<CustomerActivityItem[]> {
  const result = await tx.execute(sql`
    select a.id, a.action, a.summary, a.created_at, u.name as actor_name
    from audit_log a left join users u on u.id = a.actor_user_id
    where a.entity = 'customer' and a.entity_id = ${customerId}
    order by a.created_at desc limit 200`)
  return (result.rows as Row[]).map((r) => ({
    id: r.id as string,
    action: r.action as string,
    summary: (r.summary as Record<string, unknown>) ?? null,
    at: toIso(r.created_at),
    actorName: str(r.actor_name),
  }))
}
