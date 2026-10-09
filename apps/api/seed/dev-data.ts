import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as s from '../src/db/schema'
import { ROLE_PRESETS } from '../src/modules/auth/roles'

type OwnerDb = NodePgDatabase<typeof s>

/**
 * Development data: two companies sharing nothing, plus one user who belongs to both.
 * Runs as the owner role; RLS is forced for the owner too, so every company's rows
 * are written inside that company's context. Also used by the API tests.
 */
export async function loadDevData(db: OwnerDb, passwordHash: string) {
  const [drina, neretva] = await db
    .insert(s.companies)
    .values([
      { name: 'Drina Rent a Car', country: 'BA', timezone: 'Europe/Sarajevo', currency: 'EUR' },
      { name: 'Neretva Rent', country: 'BA', timezone: 'Europe/Sarajevo', currency: 'BAM' },
    ])
    .returning()

  const [adnan, selma, lejla] = await db
    .insert(s.users)
    .values([
      { email: 'adnan.kovac@drina-demo.ba', name: 'Adnan Kovač', passwordHash },
      { email: 'selma.karic@drina-demo.ba', name: 'Selma Karić', passwordHash },
      { email: 'lejla.begic@neretva-demo.ba', name: 'Lejla Begić', passwordHash },
    ])
    .returning()

  async function setupCompany(
    companyId: string,
    branchRows: { name: string; code: string }[],
    members: { userId: string; role: keyof typeof ROLE_PRESETS; allBranches: boolean; branches?: string[] }[],
  ) {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`)
      const br = await tx
        .insert(s.branches)
        .values(branchRows.map((b) => ({ ...b, companyId, timezone: 'Europe/Sarajevo' })))
        .returning()
      const roleRows = await tx
        .insert(s.roles)
        .values(Object.entries(ROLE_PRESETS).map(([name, permissions]) => ({ companyId, name, permissions: [...permissions] })))
        .returning()
      const membershipIds: Record<string, string> = {}
      for (const m of members) {
        const [ms] = await tx
          .insert(s.memberships)
          .values({ companyId, userId: m.userId, allBranches: m.allBranches ? 'yes' : 'no' })
          .returning()
        membershipIds[m.userId] = ms.id
        const role = roleRows.find((r) => r.name === m.role)!
        await tx.insert(s.membershipRoles).values({ companyId, membershipId: ms.id, roleId: role.id })
        for (const code of m.branches ?? []) {
          const b = br.find((x) => x.code === code)!
          await tx.insert(s.membershipBranches).values({ companyId, membershipId: ms.id, branchId: b.id })
        }
      }
      return { branches: Object.fromEntries(br.map((b) => [b.code, b.id])), memberships: membershipIds }
    })
  }

  const drinaRows = await setupCompany(
    drina.id,
    [
      { name: 'Sarajevo Aerodrom', code: 'SJJ' },
      { name: 'Sarajevo Centar', code: 'SAC' },
      { name: 'Mostar', code: 'MST' },
    ],
    [
      { userId: adnan.id, role: 'Sahip', allBranches: true },
      { userId: selma.id, role: 'Operasyon', allBranches: false, branches: ['SJJ'] },
    ],
  )
  const neretvaRows = await setupCompany(
    neretva.id,
    [{ name: 'Mostar Centar', code: 'MOC' }],
    [
      { userId: lejla.id, role: 'Sahip', allBranches: true },
      // Adnan is also a member here, to exercise company switching
      { userId: adnan.id, role: 'Yönetici', allBranches: true },
    ],
  )

  return {
    companies: { drina: drina.id, neretva: neretva.id },
    users: { adnan, selma, lejla },
    drina: drinaRows,
    neretva: neretvaRows,
  }
}
