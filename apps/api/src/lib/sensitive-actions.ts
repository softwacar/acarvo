import { sql } from 'drizzle-orm'
import type { Tx } from '../db/client'
import { AppError } from './errors'

export type SensitiveAction = 'document_number_reveal' | 'document_number_check' | 'corporate_duplicate_check'

/** One window of a limit: per user in the active company, or per user across all companies. */
export interface SensitiveLimit {
  scope: 'user' | 'user_company'
  minutes: number
  max: number
}

/**
 * Typed document numbers (create, correct, renew with a new number, exact lookup). Each one is compared with the
 * company's other customers, so a user could otherwise learn which numbers are on file by trying many. A busy desk
 * enters a few numbered documents per customer; these windows leave room for that and stop systematic sweeps.
 */
export const DOCUMENT_NUMBER_CHECK_LIMITS: SensitiveLimit[] = [
  { scope: 'user_company', minutes: 10, max: 30 },
  { scope: 'user_company', minutes: 60, max: 120 },
  { scope: 'user', minutes: 24 * 60, max: 600 },
]

/**
 * Live duplicate suggestions while a corporate account form is typed in (debounced in the browser). Each check compares
 * tax ids, e-mail addresses and phone numbers with the company's accounts, so it is limited like typed document numbers:
 * in the database, per user in the company and per user overall, so new sessions and restarts do not reset it. Typing
 * a whole form produces a few dozen checks; these windows leave ample room for that and stop sweeps.
 */
export const CORPORATE_DUPLICATE_CHECK_LIMITS: SensitiveLimit[] = [
  { scope: 'user_company', minutes: 10, max: 150 },
  { scope: 'user_company', minutes: 60, max: 500 },
  { scope: 'user', minutes: 24 * 60, max: 2000 },
]

/**
 * Counts an action against its limits and records it, in the database (sessions and server restarts do not reset it).
 * Serialized per user with a transaction lock, so concurrent requests cannot slip past a limit. The row holds only who,
 * where, what kind and when. Over a limit nothing is recorded and a 429 with the wait time is raised.
 */
export async function consumeSensitiveAction(
  tx: Tx,
  input: { userId: string; companyId: string; action: SensitiveAction; limits: SensitiveLimit[]; code: string; message: (minutes: number) => string },
): Promise<{ remaining: number }> {
  const { userId, companyId, action, limits } = input
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`sensitive-action:${userId}`}, 0))`)
  let remaining = Number.POSITIVE_INFINITY
  for (const l of limits) {
    const r = (
      await tx.execute(sql`
        select count(*)::int as n, extract(epoch from (min(at) + make_interval(mins => ${l.minutes}) - now()))::int as wait
        from user_sensitive_actions
        where user_id = ${userId} and action = ${action} and at > now() - make_interval(mins => ${l.minutes})
          ${l.scope === 'user_company' ? sql`and company_id = ${companyId}` : sql``}`)
    ).rows[0] as { n: number; wait: number | null }
    if (r.n >= l.max) {
      const retryAfterSeconds = Math.max(1, r.wait ?? l.minutes * 60)
      throw new AppError(429, input.code, input.message(Math.ceil(retryAfterSeconds / 60)), undefined, { retryAfterSeconds })
    }
    remaining = Math.min(remaining, l.max - r.n - 1)
  }
  await tx.execute(sql`insert into user_sensitive_actions (user_id, company_id, action) values (${userId}, ${companyId}, ${action})`)
  return { remaining }
}
