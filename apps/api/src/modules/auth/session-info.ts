import type { SessionInfo } from '@acarvo/shared'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { companies } from '../../db/schema'
import { branchSummaries, listMemberships, loadAccess } from './context'

/** What the web app needs after login or reload: who, which company, what they may do. */
export async function buildSessionInfo(
  app: FastifyInstance,
  user: { id: string; email: string; name: string },
  activeCompanyId: string | null,
): Promise<SessionInfo> {
  const memberships = (await listMemberships(app.database, user.id)).sort((a, b) => a.companyName.localeCompare(b.companyName))
  const base: SessionInfo = {
    user: { id: user.id, email: user.email, name: user.name },
    company: null,
    memberships,
    permissions: [],
    branches: [],
    allBranches: false,
    environment: app.env.NODE_ENV,
  }
  if (!activeCompanyId) return base

  const current = await app.database.withTenant({ companyId: activeCompanyId, userId: user.id }, async (tx) => {
    const access = await loadAccess(tx, activeCompanyId, user.id)
    if (!access) return null
    const [company] = await tx.select().from(companies).where(eq(companies.id, activeCompanyId))
    if (!company || company.status !== 'active') return null
    return { access, company, branches: await branchSummaries(tx, access) }
  })
  if (!current) return base

  const { access, company, branches } = current
  return {
    ...base,
    company: { id: company.id, name: company.name, country: company.country, timezone: company.timezone, currency: company.currency, roles: access.roleNames },
    permissions: [...access.permissions].sort(),
    branches,
    allBranches: access.allBranches,
  }
}
