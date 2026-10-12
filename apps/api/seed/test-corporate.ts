import { normalizeName, normalizeTaxValue } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as s from '../src/db/schema'

type OwnerDb = NodePgDatabase<typeof s>
const TEST_DATABASE = 'acarvo_test'

interface Plan {
  legal: string
  trade?: string
  country: string
  registration?: string
  authority?: string
  archived?: 'inactive'
  channels: { kind: 'phone' | 'email' | 'website'; value: string; normalized: string }[]
  taxIds: { country: string; scheme: string; value: string; validity?: 'checked_by_staff' }[]
  addresses: { kind: 'registered' | 'billing' | 'postal'; line1: string; city: string; postal?: string; country: string; primary?: boolean }[]
  people: { customer: string; roles: string[]; title?: string; ended?: 'entry_error' }[]
}

/**
 * Synthetic corporate accounts for the TEST database only (M3): invented names, "TEST-" tax and registration values,
 * example.test addresses. Ajla is linked to two accounts (one person, one record); one link has ended; one account is
 * archived; Neretva has its own account with the same synthetic tax value, never matched across companies.
 */
const PLANS: Record<string, Plan[]> = {
  Drina: [
    {
      legal: 'Örnek Lojistik d.o.o.',
      trade: 'Örnek Lojistik',
      country: 'BA',
      registration: 'TEST-REG-1001',
      authority: 'Örnek Ticaret Sicili',
      channels: [
        { kind: 'phone', value: '+387 33 000 501', normalized: '+38733000501' },
        { kind: 'email', value: 'info@ornek-lojistik.example.test', normalized: 'info@ornek-lojistik.example.test' },
        { kind: 'website', value: 'ornek-lojistik.example.test', normalized: 'ornek-lojistik.example.test' },
      ],
      taxIds: [
        { country: 'BA', scheme: 'PDV', value: 'TEST-PDV-200501', validity: 'checked_by_staff' },
        { country: 'BA', scheme: 'JIB', value: 'TEST-JIB-4200501' },
      ],
      addresses: [
        { kind: 'registered', line1: 'Örnek Caddesi 1', city: 'Sarajevo', postal: '71000', country: 'BA' },
        { kind: 'billing', line1: 'Fatura Sokak 5', city: 'Sarajevo', postal: '71000', country: 'BA', primary: true },
        { kind: 'billing', line1: 'Druga Ulica 9', city: 'Mostar', postal: '88000', country: 'BA' },
      ],
      people: [
        { customer: 'Ajla Testović', roles: ['representative', 'authorized_driver'], title: 'Filo sorumlusu' },
        { customer: 'Emir Primjerović', roles: ['authorized_driver'] },
        { customer: 'Lena Beispiel', roles: ['contact', 'billing_contact'] },
        { customer: 'Sara Probić', roles: ['authorized_driver'], ended: 'entry_error' },
      ],
    },
    {
      legal: 'Primjer Turizam d.o.o.',
      country: 'BA',
      channels: [{ kind: 'email', value: 'rezervacije@primjer-turizam.example.test', normalized: 'rezervacije@primjer-turizam.example.test' }],
      taxIds: [{ country: 'BA', scheme: 'PDV', value: 'TEST-PDV-200502' }],
      addresses: [{ kind: 'registered', line1: 'Turistička 12', city: 'Mostar', country: 'BA' }],
      people: [
        { customer: 'Ajla Testović', roles: ['booker'] },
        { customer: 'Kenan Örnek', roles: ['authorized_driver'] },
      ],
    },
    {
      legal: 'Muster Consulting GmbH',
      country: 'DE',
      registration: 'TEST-HRB-12345',
      channels: [{ kind: 'phone', value: '+49 89 0000 0301', normalized: '+4989000000301' }],
      taxIds: [{ country: 'DE', scheme: 'VAT', value: 'DETEST123456' }],
      addresses: [{ kind: 'registered', line1: 'Beispielstraße 3', city: 'München', postal: '80331', country: 'DE' }],
      people: [{ customer: 'Lena Beispiel', roles: ['authorized_driver'] }],
    },
    {
      legal: 'Stara Firma d.o.o.',
      country: 'BA',
      archived: 'inactive',
      channels: [],
      taxIds: [],
      addresses: [],
      people: [],
    },
  ],
  Neretva: [
    {
      legal: 'Neretva Örnek Trgovina d.o.o.',
      country: 'BA',
      channels: [{ kind: 'phone', value: '+387 36 000 601', normalized: '+38736000601' }],
      taxIds: [{ country: 'BA', scheme: 'PDV', value: 'TEST-PDV-200501' }],
      addresses: [{ kind: 'registered', line1: 'Obala 4', city: 'Mostar', country: 'BA' }],
      people: [{ customer: 'Dino Neretvić', roles: ['authorized_driver'] }],
    },
  ],
}

export async function ensureTestCorporateAccounts(db: OwnerDb) {
  const name = ((await db.execute(sql`select current_database() as name`)).rows[0] as { name: string }).name
  if (name !== TEST_DATABASE) throw new Error(`Synthetic corporate accounts are only loaded into ${TEST_DATABASE}; this connection is in "${name}". Nothing was added.`)
  const companies = (await db.execute(sql`select id, name from companies order by name`)).rows as { id: string; name: string }[]
  for (const company of companies) {
    const plans = PLANS[company.name.split(' ')[0]!] ?? []
    if (!plans.length) continue
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      if (((await tx.execute(sql`select count(*)::int n from corporate_accounts`)).rows[0] as { n: number }).n > 0) return
      let n = 0
      for (const p of plans) {
        n++
        const account = (
          await tx.execute(sql`insert into corporate_accounts (company_id, account_no, legal_name, legal_name_normalized, trade_name, country, registration_number, registration_number_normalized, registration_authority,
              status, archived_at, archived_reason)
            values (${company.id}, ${`K-${String(n).padStart(5, '0')}`}, ${p.legal}, ${normalizeName(p.legal)}, ${p.trade ?? null}, ${p.country}, ${p.registration ?? null},
              ${p.registration ? normalizeTaxValue(p.registration) : null}, ${p.authority ?? null}, ${p.archived ? 'archived' : 'active'}, ${p.archived ? new Date() : null}, ${p.archived ?? null})
            returning id`)
        ).rows[0] as { id: string }
        const firstOfKind = new Set<string>()
        for (const c of p.channels) {
          const primary = !firstOfKind.has(c.kind)
          firstOfKind.add(c.kind)
          await tx.execute(sql`insert into corporate_contact_channels (company_id, account_id, kind, value, value_normalized, is_primary) values (${company.id}, ${account.id}, ${c.kind}, ${c.value}, ${c.normalized}, ${primary})`)
        }
        for (const [i, t] of p.taxIds.entries()) {
          await tx.execute(sql`insert into corporate_tax_ids (company_id, account_id, country, scheme, value, value_normalized, validity, is_primary)
            values (${company.id}, ${account.id}, ${t.country}, ${t.scheme}, ${t.value}, ${normalizeTaxValue(t.value)}, ${t.validity ?? 'not_checked'}, ${i === 0})`)
        }
        for (const a of p.addresses) {
          const primary = a.primary ?? !p.addresses.some((o) => o !== a && o.kind === a.kind && (o.primary || p.addresses.indexOf(o) < p.addresses.indexOf(a)))
          await tx.execute(sql`insert into corporate_addresses (company_id, account_id, kind, line1, city, postal_code, country, is_primary)
            values (${company.id}, ${account.id}, ${a.kind}, ${a.line1}, ${a.city}, ${a.postal ?? null}, ${a.country}, ${primary})`)
        }
        for (const person of p.people) {
          const c = (await tx.execute(sql`select id from customers where display_name = ${person.customer}`)).rows[0] as { id: string } | undefined
          if (!c) continue
          await tx.execute(sql`insert into corporate_account_people (company_id, account_id, customer_id, roles, job_title, ended_at, ended_reason)
            values (${company.id}, ${account.id}, ${c.id}, ${`{${person.roles.join(',')}}`}::text[], ${person.title ?? null}, ${person.ended ? new Date() : null}, ${person.ended ?? null})`)
        }
      }
      await tx.execute(sql`insert into company_sequences (company_id, kind, next_value) values (${company.id}, 'corporate_account', ${n + 1})`)
    })
  }
}
