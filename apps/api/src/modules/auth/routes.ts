import { loginSchema, switchCompanySchema } from '@acarvo/shared'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { users } from '../../db/schema'
import { audit } from '../../lib/audit'
import { AppError } from '../../lib/errors'
import { requireUser } from '../../plugins/auth'
import { listMemberships, loadAccess } from './context'
import { verifyPassword } from './password'
import { buildSessionInfo } from './session-info'
import { ABSOLUTE_TIMEOUT_MS, SESSION_COOKIE } from './sessions'

const cookieOptions = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' as const }

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: ABSOLUTE_TIMEOUT_MS / 1000 })
}
function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, cookieOptions)
}

/** Failed sign-ins per client address within a window, across all e-mail addresses (credential stuffing). */
const FAILED_LOGIN_LIMIT = 30
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000
const failedLogins = new Map<string, { count: number; resetAt: number }>()
function failedLoginGuard(ip: string) {
  const now = Date.now()
  const entry = failedLogins.get(ip)
  if (entry && entry.resetAt <= now) failedLogins.delete(ip)
  const current = failedLogins.get(ip)
  if (current && current.count >= FAILED_LOGIN_LIMIT) {
    const minutes = Math.max(1, Math.ceil((current.resetAt - now) / 60000))
    throw new AppError(429, 'RATE_LIMITED', `Çok fazla deneme yapıldı. Yaklaşık ${minutes} dakika sonra tekrar deneyin.`)
  }
  return () => {
    const e = failedLogins.get(ip) ?? { count: 0, resetAt: now + FAILED_LOGIN_WINDOW_MS }
    e.count += 1
    failedLogins.set(ip, e)
    if (failedLogins.size > 10_000) for (const [k, v] of failedLogins) if (v.resetAt <= now) failedLogins.delete(k)
  }
}
export const resetFailedLogins = () => failedLogins.clear()

export async function authRoutes(app: FastifyInstance) {
  const { database, sessions } = app

  /** Issues the CSRF token; the web app sends it back in `x-csrf-token`. */
  app.get('/csrf', async (_req, reply) => ({ token: reply.generateCsrf() }))

  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator: (req) => {
            const email = (req.body as { email?: unknown } | undefined)?.email
            return `${req.ip}|${typeof email === 'string' ? email.trim().toLowerCase() : ''}`
          },
        },
      },
    },
    async (req, reply) => {
      const input = loginSchema.parse(req.body)
      const recordFailure = failedLoginGuard(req.ip)
      const [user] = await database.db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${input.email}`)
        .limit(1)
      const ok = await verifyPassword(user?.status === 'active' ? user.passwordHash : null, input.password)
      if (!user || !ok) {
        recordFailure()
        throw new AppError(401, 'INVALID_CREDENTIALS', 'E-posta veya parola hatalı.')
      }

      const memberships = (await listMemberships(database, user.id)).sort((a, b) => a.companyName.localeCompare(b.companyName))
      const companyId = memberships[0]?.companyId ?? null
      const session = await sessions.create({ userId: user.id, companyId, ip: req.ip, userAgent: req.headers['user-agent'] })
      await database.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
      if (companyId) {
        await database.withTenant({ companyId, userId: user.id }, (tx) =>
          audit(tx, { companyId, actorUserId: user.id, action: 'auth.login', entity: 'session', entityId: session.id }),
        )
      }
      setSessionCookie(reply, session.token)
      return buildSessionInfo(app, user, companyId)
    },
  )

  app.get('/session', async (req) => {
    const auth = requireUser(req)
    return buildSessionInfo(app, auth.user, auth.session.activeCompanyId)
  })

  app.post('/logout', async (req, reply) => {
    if (req.auth) await sessions.revoke(req.auth.session.id)
    clearSessionCookie(reply)
    return reply.code(204).send()
  })

  /** "Close all sessions": revokes every session of the user, including this one. */
  app.post('/sessions/revoke-all', async (req, reply) => {
    const auth = requireUser(req)
    await sessions.revokeAllForUser(auth.user.id)
    clearSessionCookie(reply)
    return reply.code(204).send()
  })

  app.post('/switch-company', async (req) => {
    const auth = requireUser(req)
    const { companyId } = switchCompanySchema.parse(req.body)
    const allowed = await database.withTenant({ companyId, userId: auth.user.id }, async (tx) => {
      const access = await loadAccess(tx, companyId, auth.user.id)
      if (access) await audit(tx, { companyId, actorUserId: auth.user.id, action: 'auth.switch_company', entity: 'session', entityId: auth.session.id })
      return access !== null
    })
    if (!allowed) throw new AppError(403, 'NO_COMPANY_ACCESS', 'Bu şirkete erişiminiz yok.')
    await sessions.setCompany(auth.session.id, companyId)
    return buildSessionInfo(app, auth.user, companyId)
  })
}
