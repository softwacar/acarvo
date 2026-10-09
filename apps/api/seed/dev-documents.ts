import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as s from '../src/db/schema'

type OwnerDb = NodePgDatabase<typeof s>

/**
 * Development only: an example company decision that some document types are required.
 * Drina marks registration, inspection and liability insurance as required; Neretva keeps the
 * defaults (nothing required) so both behaviours can be seen. Inserts only, never overwrites
 * an existing setting, and refuses to run in production.
 */
const DEV_REQUIRED: Record<string, string[]> = {
  'Drina Rent a Car': ['registration', 'inspection', 'liability_insurance'],
}

export async function ensureDevDocumentSettings(db: OwnerDb, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv === 'production') throw new Error('Development document settings must not be created in production')
  const added: string[] = []
  for (const [companyName, codes] of Object.entries(DEV_REQUIRED)) {
    const [company] = await db.select({ id: s.companies.id }).from(s.companies).where(eq(s.companies.name, companyName))
    if (!company) continue
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      for (const code of codes) {
        const r = await tx
          .insert(s.companyDocumentTypeSettings)
          .values({ companyId: company.id, typeCode: code, required: true })
          .onConflictDoNothing()
          .returning({ code: s.companyDocumentTypeSettings.typeCode })
        if (r.length) added.push(`${companyName}: ${code}`)
      }
    })
  }
  return added
}
