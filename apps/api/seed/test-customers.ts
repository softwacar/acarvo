import { customerDisplayName, normalizeName } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as s from '../src/db/schema'

type OwnerDb = NodePgDatabase<typeof s>

/**
 * Synthetic customers for the TEST database only (customers plan §13). Names are invented sample names,
 * e-mail addresses use the reserved example.test domain and phone numbers sit in an obvious 000 block.
 * Refuses to run against any database other than acarvo_test, so it can never add sample people to the main database.
 */
export const TEST_CUSTOMERS_DATABASE = 'acarvo_test'

interface SampleCustomer {
  given?: string
  family?: string
  phone?: string
  email?: string
  residency?: 'local' | 'foreign'
  nationality?: string
  residence?: string
  dob?: string
  city?: string
  country?: string
  branch?: string
  language?: string
  archived?: 'inactive' | 'duplicate'
}

const DRINA: SampleCustomer[] = [
  { given: 'Ajla', family: 'Testović', phone: '+38761000101', email: 'ajla.testovic@example.test', residency: 'local', nationality: 'BA', residence: 'BA', dob: '1990-04-12', city: 'Sarajevo', country: 'BA', branch: 'SJJ', language: 'bs' },
  { given: 'Emir', family: 'Primjerović', phone: '+38762000102', email: 'emir.primjerovic@example.test', residency: 'local', nationality: 'BA', dob: '1985-11-03', city: 'Sarajevo', country: 'BA', branch: 'SAC', language: 'bs' },
  { given: 'Lena', family: 'Beispiel', phone: '+4915100000103', email: 'lena.beispiel@example.test', residency: 'foreign', nationality: 'DE', residence: 'DE', dob: '1993-02-27', city: 'München', country: 'DE', branch: 'SJJ', language: 'de' },
  { given: 'Mirza', family: 'Uzorak', phone: '+38761000104', residency: 'local', nationality: 'BA', branch: 'MST', language: 'bs' },
  { given: 'Sara', family: 'Probić', email: 'sara.probic@example.test', residency: 'local', nationality: 'BA', dob: '1999-07-19', branch: 'MST' },
  { given: 'John', family: 'Sample', phone: '+447700000106', email: 'john.sample@example.test', residency: 'foreign', nationality: 'GB', residence: 'GB', city: 'London', country: 'GB', branch: 'SJJ', language: 'en' },
  { given: 'Marie', family: 'Exemple', phone: '+33600000107', residency: 'foreign', nationality: 'FR', residence: 'FR', branch: 'SAC', language: 'fr' },
  { given: 'Kenan', family: 'Örnek', phone: '+905000000108', email: 'kenan.ornek@example.test', residency: 'foreign', nationality: 'TR', dob: '1988-09-30', branch: 'SJJ', language: 'tr' },
  { given: 'Selin', family: 'Deneme', phone: '+905000000109', residency: 'foreign', nationality: 'TR', residence: 'BA', branch: 'SAC', language: 'tr' },
  { given: 'Tarik', family: 'Testić', phone: '+38761000110', email: 'tarik.testic@example.test', residency: 'local', nationality: 'BA', dob: '1979-01-08', city: 'Mostar', country: 'BA', branch: 'MST' },
  { given: 'Amra', family: 'Demović', phone: '+38763000111', residency: 'local', nationality: 'BA', branch: 'SJJ' },
  // A single-name person: only one name part is filled.
  { given: 'Testara', phone: '+38761000112', residency: 'foreign', nationality: 'ID', branch: 'SJJ' },
  { given: 'Haris', family: 'Arhivić', phone: '+38761000113', residency: 'local', nationality: 'BA', branch: 'SAC', archived: 'inactive' },
  { given: 'Nina', family: 'Probna', email: 'nina.probna@example.test', residency: 'local', nationality: 'BA', branch: 'MST' },
]

const NERETVA: SampleCustomer[] = [
  { given: 'Dino', family: 'Neretvić', phone: '+38761000201', email: 'dino.neretvic@example.test', residency: 'local', nationality: 'BA', dob: '1991-05-05', branch: 'MOC' },
  { given: 'Petra', family: 'Muster', phone: '+4369900000202', residency: 'foreign', nationality: 'AT', branch: 'MOC', language: 'de' },
  { given: 'Adna', family: 'Testkupac', email: 'adna.testkupac@example.test', residency: 'local', nationality: 'BA', branch: 'MOC' },
]

export async function ensureTestCustomers(db: OwnerDb) {
  const name = ((await db.execute(sql`select current_database() as name`)).rows[0] as { name: string }).name
  if (name !== TEST_CUSTOMERS_DATABASE) {
    throw new Error(`Synthetic customers are only loaded into ${TEST_CUSTOMERS_DATABASE}; this connection is in "${name}". Nothing was added.`)
  }
  const companies = (await db.execute(sql`select id, name from companies order by name`)).rows as { id: string; name: string }[]
  const added: string[] = []
  for (const company of companies) {
    const list = company.name.startsWith('Drina') ? DRINA : company.name.startsWith('Neretva') ? NERETVA : []
    if (!list.length) continue
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      const existing = (await tx.execute(sql`select count(*)::int as n from customers`)).rows[0] as { n: number }
      if (existing.n > 0) return
      const branchRows = (await tx.execute(sql`select id, code from branches`)).rows as { id: string; code: string }[]
      let n = 0
      for (const c of list) {
        n++
        await tx.insert(s.customers).values({
          companyId: company.id,
          customerNo: `M-${String(n).padStart(6, '0')}`,
          givenName: c.given ?? null,
          familyName: c.family ?? null,
          displayName: customerDisplayName({ givenName: c.given, familyName: c.family }),
          nameNormalized: normalizeName(c.given, c.family),
          phoneRaw: c.phone ?? null,
          phoneE164: c.phone ?? null,
          email: c.email ?? null,
          residency: c.residency ?? null,
          residenceCountry: c.residence ?? null,
          nationality: c.nationality ?? null,
          dateOfBirth: c.dob ?? null,
          city: c.city ?? null,
          addressCountry: c.country ?? null,
          preferredLanguage: c.language ?? null,
          createdBranchId: branchRows.find((b) => b.code === c.branch)?.id ?? null,
          ...(c.archived ? { status: 'archived' as const, archivedAt: new Date(), archivedReason: c.archived } : {}),
        })
      }
      await tx.insert(s.companySequences).values({ companyId: company.id, kind: 'customer', nextValue: n + 1 })
      // Branch countries (M2) for the test company Drina only; Neretva keeps empty countries for the bulk-assignment tests.
      if (company.name.startsWith('Drina')) await tx.execute(sql`update branches set country = 'BA' where country is null`)
      added.push(`${company.name}: ${n}`)
    })
  }
  return added
}

/**
 * Synthetic identity documents for the TEST database (M2). Numbers are invented ("TEST-…"), encrypted with the
 * per-run test keys like real ones. Dates are relative to today so expiry states stay meaningful.
 */
export async function ensureTestCustomerDocuments(db: OwnerDb, crypto: import('../src/lib/customer-crypto').CustomerCrypto) {
  const name = ((await db.execute(sql`select current_database() as name`)).rows[0] as { name: string }).name
  if (name !== TEST_CUSTOMERS_DATABASE) throw new Error(`Synthetic documents are only loaded into ${TEST_CUSTOMERS_DATABASE}; nothing was added.`)
  const { numberColumns } = await import('../src/modules/customers/documents')
  const { randomUUID } = await import('node:crypto')
  const today = new Date()
  const plus = (days: number) => new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  const plan: Record<string, { customer: string; type: string; country: string; number?: string; validUntil?: string; issuedOn?: string; entryDate?: string; categories?: string[]; verification?: string }[]> = {
    Drina: [
      { customer: 'Ajla Testović', type: 'national_id', country: 'BA', number: 'TEST-BA-1001', issuedOn: plus(-700), validUntil: plus(1100), verification: 'original_seen' },
      { customer: 'Ajla Testović', type: 'driving_license', country: 'BA', number: 'TEST-DL-2001', issuedOn: plus(-3000), validUntil: plus(12), categories: ['B'] },
      { customer: 'Lena Beispiel', type: 'passport', country: 'DE', number: 'TESTC0100001', issuedOn: plus(-400), validUntil: plus(1800), verification: 'original_seen' },
      { customer: 'Lena Beispiel', type: 'driving_license', country: 'DE', number: 'TEST-DE-DL-1', validUntil: plus(700), categories: ['B', 'BE'] },
      { customer: 'Lena Beispiel', type: 'entry_record', country: 'BA', entryDate: plus(-5) },
      { customer: 'John Sample', type: 'passport', country: 'GB', number: 'TEST-GB-PP-9', validUntil: plus(-20) },
      { customer: 'Kenan Örnek', type: 'residence_permit', country: 'BA', number: 'TEST-BA-RP-7', validUntil: plus(365) },
    ],
    // The same synthetic number as Ajla's ID in another company: allowed, and never matched across companies.
    Neretva: [{ customer: 'Dino Neretvić', type: 'national_id', country: 'BA', number: 'TEST-BA-1001', validUntil: plus(900) }],
  }
  const companies = (await db.execute(sql`select id, name from companies order by name`)).rows as { id: string; name: string }[]
  for (const company of companies) {
    const list = plan[company.name.split(' ')[0]!] ?? []
    if (!list.length) continue
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      if (((await tx.execute(sql`select count(*)::int as n from customer_documents`)).rows[0] as { n: number }).n > 0) return
      for (const d of list) {
        const c = (await tx.execute(sql`select id from customers where display_name = ${d.customer}`)).rows[0] as { id: string } | undefined
        if (!c) continue
        const id = randomUUID()
        const normalized = d.number?.toUpperCase().replace(/[\s\-./]/g, '')
        await tx.insert(s.customerDocuments).values({
          id,
          companyId: company.id,
          customerId: c.id,
          type: d.type,
          issuingCountry: d.country,
          issuedOn: d.issuedOn ?? null,
          validUntil: d.validUntil ?? null,
          entryDate: d.entryDate ?? null,
          licenseCategories: d.categories ?? [],
          verification: (d.verification ?? 'not_verified') as 'not_verified',
          ...(normalized ? numberColumns(crypto, company.id, id, d.type, d.country, normalized) : {}),
        })
      }
    })
  }
}
