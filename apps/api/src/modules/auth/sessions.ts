import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { sessions, users } from '../../db/schema'

export const SESSION_COOKIE = '__Host-acarvo_session'
export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000 // 8 hours without activity
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000 // 7 days at most
const TOUCH_EVERY_MS = 5 * 60 * 1000

/** Only the SHA-256 of the token is stored; a leaked table does not yield usable sessions. */
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

export function sessionStore(database: Database) {
  const { db } = database
  return {
    async create(input: { userId: string; companyId: string | null; ip?: string; userAgent?: string }) {
      const token = randomBytes(32).toString('base64url')
      const [row] = await db
        .insert(sessions)
        .values({
          tokenHash: digest(token),
          userId: input.userId,
          activeCompanyId: input.companyId,
          expiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS),
          ip: input.ip,
          userAgent: input.userAgent?.slice(0, 300),
        })
        .returning({ id: sessions.id })
      return { token, id: row.id }
    },

    async validate(token: string) {
      const now = new Date()
      const [row] = await db
        .select({ session: sessions, user: { id: users.id, email: users.email, name: users.name, status: users.status } })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.tokenHash, digest(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
        .limit(1)
      if (!row || row.user.status !== 'active') return null
      if (now.getTime() - row.session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
        await this.revoke(row.session.id)
        return null
      }
      if (now.getTime() - row.session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
        await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.session.id))
      }
      return row
    },

    async setCompany(sessionId: string, companyId: string | null) {
      await db.update(sessions).set({ activeCompanyId: companyId }).where(eq(sessions.id, sessionId))
    },

    async revoke(sessionId: string) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    },

    async revokeAllForUser(userId: string) {
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    },
  }
}
export type SessionStore = ReturnType<typeof sessionStore>
