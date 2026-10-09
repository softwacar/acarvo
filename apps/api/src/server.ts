import { buildApp } from './app'
import { createDatabase } from './db/client'
import { loadEnv } from './env'

const env = loadEnv()
const database = createDatabase(env.DATABASE_URL)
const app = await buildApp({ env, database })

const shutdown = async () => {
  await app.close()
  await database.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ host: '127.0.0.1', port: env.API_PORT })
