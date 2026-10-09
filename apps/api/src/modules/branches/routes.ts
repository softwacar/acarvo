import type { FastifyInstance } from 'fastify'
import { withCompany } from '../../plugins/auth'
import { branchSummaries } from '../auth/context'

export async function branchRoutes(app: FastifyInstance) {
  /** Branches of the active company that the user may see (all, or only assigned ones). */
  app.get('/', async (req) => withCompany(req, 'branches.read', async (tx, access) => ({ items: await branchSummaries(tx, access) })))
}
