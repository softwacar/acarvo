import { fileURLToPath } from 'node:url'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { sql } from 'drizzle-orm'
import type { Database } from './db/client'
import type { Env } from './env'
import { authRoutes } from './modules/auth/routes'
import { sessionStore } from './modules/auth/sessions'
import { branchRoutes } from './modules/branches/routes'
import { documentFileRoutes, vehicleDocumentRoutes } from './modules/vehicles/documents'
import { fileRoutes, vehiclePhotoRoutes } from './modules/vehicles/photos'
import { createScanner, type MalwareScanner } from './lib/malware'
import { vehicleClassRoutes, vehicleRoutes } from './modules/vehicles/routes'
import { MAX_PHOTO_BYTES } from './lib/images'
import { createStorage } from './lib/storage'
import { registerAuth } from './plugins/auth'
import { registerSecurity } from './plugins/security'

export async function buildApp({ env, database, logger = true, scanner }: { env: Env; database: Database; logger?: boolean; scanner?: MalwareScanner }) {
  const app = Fastify({ logger: logger && { level: env.NODE_ENV === 'production' ? 'info' : 'debug' }, bodyLimit: 1_000_000 })
  app.decorate('env', env)
  app.decorate('database', database)
  app.decorate('sessions', sessionStore(database))
  app.decorate('scanner', scanner ?? createScanner(env))
  app.decorate('storage', createStorage(env.STORAGE_DIR ?? fileURLToPath(new URL('../../../storage', import.meta.url))))

  await registerSecurity(app, env)
  registerAuth(app)
  // One file per request; anything larger than the photo limit is cut off with 413.
  await app.register(multipart, { limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0, parts: 1 } })

  app.get('/api/health', async () => {
    await database.db.execute(sql`select 1`)
    return { status: 'ok', database: 'connected' }
  })
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(branchRoutes, { prefix: '/api/branches' })
  await app.register(vehicleRoutes, { prefix: '/api/vehicles' })
  await app.register(vehiclePhotoRoutes, { prefix: '/api/vehicles' })
  await app.register(vehicleClassRoutes, { prefix: '/api/vehicle-classes' })
  await app.register(fileRoutes, { prefix: '/api/files' })
  await app.register(vehicleDocumentRoutes, { prefix: '/api/vehicles' })
  await app.register(documentFileRoutes, { prefix: '/api/document-files' })
  return app
}
