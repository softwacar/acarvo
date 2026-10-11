import type { Permission } from '@acarvo/shared'
import { and, eq } from 'drizzle-orm'
import type { Database, Tx } from '../../db/client'
import { branches, companies, membershipBranches, membershipRoles, memberships, roles } from '../../db/schema'

export interface CompanyAccess {
  companyId: string
  membershipId: string
  permissions: Set<Permission>
  roleNames: string[]
  allBranches: boolean
  branchIds: string[]
}

/** Loads the effective access of a user in one company. Returns null unless the company is active and they are an active member. */
export async function loadAccess(tx: Tx, companyId: string, userId: string): Promise<CompanyAccess | null> {
  // A suspended company keeps its data but nobody can use it (every company route goes through here).
  const [company] = await tx.select({ status: companies.status }).from(companies).where(eq(companies.id, companyId)).limit(1)
  if (company?.status !== 'active') return null
  const [m] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId), eq(memberships.status, 'active')))
    .limit(1)
  if (!m) return null
  const roleRows = await tx
    .select({ name: roles.name, permissions: roles.permissions })
    .from(membershipRoles)
    .innerJoin(roles, and(eq(roles.id, membershipRoles.roleId), eq(roles.companyId, membershipRoles.companyId)))
    .where(eq(membershipRoles.membershipId, m.id))
  const branchRows = await tx.select({ id: membershipBranches.branchId }).from(membershipBranches).where(eq(membershipBranches.membershipId, m.id))
  return {
    companyId,
    membershipId: m.id,
    permissions: new Set(roleRows.flatMap((r) => r.permissions) as Permission[]),
    roleNames: roleRows.map((r) => r.name),
    allBranches: m.allBranches === 'yes',
    branchIds: branchRows.map((b) => b.id),
  }
}

/** Companies the user belongs to (memberships_select_own policy lets them see their own rows). */
export async function listMemberships(database: Database, userId: string) {
  return database.withUser(userId, async (tx) => {
    const rows = await tx
      .select({ companyId: memberships.companyId, companyName: companies.name })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), eq(companies.status, 'active')))
    return rows
  })
}

export async function branchSummaries(tx: Tx, access: CompanyAccess) {
  const rows = await tx.select({ id: branches.id, name: branches.name, code: branches.code, country: branches.country }).from(branches).where(eq(branches.status, 'active'))
  return access.allBranches ? rows : rows.filter((b) => access.branchIds.includes(b.id))
}


