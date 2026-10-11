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
