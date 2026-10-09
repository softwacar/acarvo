import type { Permission } from '@acarvo/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Database, Tx } from '../db/client'
import type { Env } from '../env'
import type { MalwareScanner } from '../lib/malware'
import type { Storage } from '../lib/storage'
import { AppError, forbidden, unauthorized } from '../lib/errors'
import { loadAccess, type CompanyAccess } from '../modules/auth/context'
import { SESSION_COOKIE, type SessionStore } from '../modules/auth/sessions'

type ValidSession = NonNullable<Awaited<ReturnType<SessionStore['validate']>>>

declare module 'fastify' {
  interface FastifyInstance {
    env: Env
    database: Database
    sessions: SessionStore
    storage: Storage
    scanner: MalwareScanner
  }
  interface FastifyRequest {
    auth: ValidSession | null
  }
}

/** Resolves the session cookie on every request. Routes decide whether a session is required. */
export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE]
    req.auth = token ? await app.sessions.validate(token) : null
  })
}

export function requireUser(req: FastifyRequest): ValidSession {
  if (!req.auth) throw unauthorized()
  return req.auth
}

/**
 * Runs `fn` in one transaction bound to the session's active company. RLS limits every
 * query to that company; membership and permission are re-checked on each request,
 * so a suspended membership loses access immediately.
 */
export async function withCompany<T>(
  req: FastifyRequest,
  permission: Permission | null,
  fn: (tx: Tx, access: CompanyAccess) => Promise<T>,
): Promise<T> {
  const auth = requireUser(req)
  const companyId = auth.session.activeCompanyId
  if (!companyId) throw new AppError(403, 'NO_COMPANY', 'Aktif şirket seçili değil.')
  return req.server.database.withTenant({ companyId, userId: auth.user.id }, async (tx) => {
    const access = await loadAccess(tx, companyId, auth.user.id)
    if (!access) throw new AppError(403, 'NO_COMPANY_ACCESS', 'Bu şirkete erişiminiz yok.')
    if (permission && !access.permissions.has(permission)) throw forbidden()
    return fn(tx, access)
  })
}
