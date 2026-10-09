import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface TenantContext {
  companyId: string
  userId: string
}

export interface Database {
  pool: pg.Pool
  db: Db
  /**
   * Runs `fn` in a transaction whose RLS context is this company and user.
   * `set_config(..., true)` makes the values transaction-local, so they never
   * leak to the next request that borrows the same pooled connection.
   */
  withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T>
  /** Transaction with only the user context: the user's own memberships, no company data. */
  withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export function createDatabase(url: string): Database {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  const db = drizzle(pool, { schema })
  return {
    pool,
    db,
    withTenant: (ctx, fn) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.company_id', ${ctx.companyId}, true), set_config('app.user_id', ${ctx.userId}, true)`)
        return fn(tx)
      }),
    withUser: (userId, fn) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`)
        return fn(tx)
      }),
    close: () => pool.end(),
  }
}
