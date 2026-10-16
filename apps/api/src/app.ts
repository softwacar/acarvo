import type { Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { sql } from 'drizzle-orm'
import type { Database } from './db/client'
import type { Env } from './env'
import { authRoutes } from './modules/auth/routes'
import { sessionStore } from './modules/auth/sessions'
import { branchRoutes } from './modules/branches/routes'
import { customerRoutes } from './modules/customers/routes'
import { customerDocumentRoutes } from './modules/customers/documents'
import { customerDocumentFileRoutes, customerFileRoutes } from './modules/customers/document-files'
import { documentRequirementRoutes } from './modules/settings/document-requirements'
import { rentalSettingsRoutes } from './modules/settings/rentals'
import { pricingRoutes, quoteRoutes } from './modules/pricing/routes'
import { contractRoutes, contractTemplateRoutes } from './modules/contracts/routes'
import { financeRoutes } from './modules/finance/routes'
import { documentFileRoutes, vehicleDocumentRoutes } from './modules/vehicles/documents'
import { vehicleHistoryRoutes } from './modules/vehicles/history'
import { fileRoutes, vehiclePhotoRoutes } from './modules/vehicles/photos'
import { createDocumentAccessGrants } from './lib/document-access'
import { errorForLog, requestForLog } from './lib/log-safety'
import { customerCryptoFromEnv } from './lib/customer-crypto'
import { createScanner, type MalwareScanner } from './lib/malware'
import { vehicleClassRoutes, vehicleRoutes } from './modules/vehicles/routes'
import { MAX_PHOTO_BYTES } from './lib/images'
import { createStorage } from './lib/storage'
import { corporateRoutes, customerCorporateLinkRoutes } from './modules/corporate/routes'
import { relatedReservationRoutes, reservationRoutes } from './modules/reservations/routes'
import { relatedRentalRoutes, rentalRoutes } from './modules/rentals/routes'
import { damageRoutes } from './modules/operations/damage'
import { maintenanceRoutes } from './modules/operations/maintenance'
import { photoAccessRoutes } from './modules/operations/photo-access'
import { dashboardRoutes } from './modules/dashboard/routes'
import { readinessRoutes } from './modules/dashboard/readiness'
import { transferRoutes } from './modules/operations/transfers'
import { vehicleOperationRoutes } from './modules/operations/vehicle-ops'
import { registerAuth } from './plugins/auth'
import { registerSecurity } from './plugins/security'

export async function buildApp({
  env,
  database,
  logger = true,
  scanner,
  documentAccessTtlMs,
  logStream,
}: {
  env: Env
  database: Database
  logger?: boolean
  scanner?: MalwareScanner
  /** Tests shorten the document access grant lifetime. */
  documentAccessTtlMs?: number
  /** Tests capture the log output to check that no personal data reaches it. */
  logStream?: Writable
}) {
  // Without a trusted proxy every request behind the web proxy would share one address (rate limits, session IPs).
  const trustProxy = env.TRUST_PROXY ?? (env.NODE_ENV === 'production' ? false : 'loopback')
  const app = Fastify({
    logger: (logger || logStream) && {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      serializers: { req: requestForLog, err: errorForLog },
      ...(logStream ? { stream: logStream } : {}),
    },
    bodyLimit: 1_000_000,
    trustProxy,
  })
  app.decorate('env', env)
  app.decorate('database', database)
  app.decorate('sessions', sessionStore(database))
  app.decorate('scanner', scanner ?? createScanner(env))
  app.decorate('documentGrants', createDocumentAccessGrants(documentAccessTtlMs))
  const keys = customerCryptoFromEnv(env)
  app.decorate('customerCrypto', keys.crypto)
  app.decorate('customerCryptoProblem', keys.problem)
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
  await app.register(vehicleHistoryRoutes, { prefix: '/api/vehicles' })
  await app.register(documentFileRoutes, { prefix: '/api/document-files' })
  await app.register(customerRoutes, { prefix: '/api/customers' })
  await app.register(customerDocumentRoutes, { prefix: '/api/customers' })
  await app.register(customerDocumentFileRoutes, { prefix: '/api/customers' })
  await app.register(customerFileRoutes, { prefix: '/api/customer-files' })
  await app.register(documentRequirementRoutes, { prefix: '/api/settings' })
  await app.register(rentalSettingsRoutes, { prefix: '/api/settings' })
  await app.register(corporateRoutes, { prefix: '/api/corporate-accounts' })
  await app.register(customerCorporateLinkRoutes, { prefix: '/api/customers' })
  await app.register(reservationRoutes, { prefix: '/api/reservations' })
  await app.register(relatedReservationRoutes, { prefix: '/api' })
  await app.register(rentalRoutes, { prefix: '/api/rentals' })
  await app.register(relatedRentalRoutes, { prefix: '/api' })
  await app.register(pricingRoutes, { prefix: '/api/pricing' })
  await app.register(quoteRoutes, { prefix: '/api' })
  await app.register(contractTemplateRoutes, { prefix: '/api/settings' })
  await app.register(contractRoutes, { prefix: '/api' })
  await app.register(maintenanceRoutes, { prefix: '/api/maintenance' })
  await app.register(photoAccessRoutes, { prefix: '/api/photo-access' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(readinessRoutes, { prefix: '/api/readiness' })
  await app.register(damageRoutes, { prefix: '/api/damages' })
  await app.register(transferRoutes, { prefix: '/api/transfers' })
  await app.register(vehicleOperationRoutes, { prefix: '/api/vehicles' })
  await app.register(financeRoutes, { prefix: '/api' })
  return app
}
