import Fastify from 'fastify'
import { sql } from 'drizzle-orm'
import type { Database } from './db/client'
import type { Env } from './env'
import { authRoutes } from './modules/auth/routes'
import { sessionStore } from './modules/auth/sessions'
import { branchRoutes } from './modules/branches/routes'
import { vehicleClassRoutes, vehicleRoutes } from './modules/vehicles/routes'
import { registerAuth } from './plugins/auth'
import { registerSecurity } from './plugins/security'

export async function buildApp({ env, database, logger = true }: { env: Env; database: Database; logger?: boolean }) {
  const app = Fastify({ logger: logger && { level: env.NODE_ENV === 'production' ? 'info' : 'debug' }, bodyLimit: 1_000_000 })
  app.decorate('env', env)
  app.decorate('database', database)
  app.decorate('sessions', sessionStore(database))

  await registerSecurity(app, env)
  registerAuth(app)

  app.get('/api/health', async () => {
    await database.db.execute(sql`select 1`)
    return { status: 'ok', database: 'connected' }
  })
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(branchRoutes, { prefix: '/api/branches' })
  await app.register(vehicleRoutes, { prefix: '/api/vehicles' })
  await app.register(vehicleClassRoutes, { prefix: '/api/vehicle-classes' })
  return app
}
