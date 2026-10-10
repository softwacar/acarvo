import { buildApp } from './app'
import { createDatabase } from './db/client'
import { loadEnv, productionWarnings } from './env'
import { documentUploadPolicy } from './lib/malware'

const env = loadEnv()
const database = createDatabase(env.DATABASE_URL)
const app = await buildApp({ env, database })
for (const w of productionWarnings(env)) app.log.warn(`Production configuration: ${w}`)
if (app.customerCryptoProblem) app.log.warn(`Customer document numbers and files are closed: ${app.customerCryptoProblem}`)
else app.log.info(`Customer data keys loaded: ${app.customerCrypto!.fingerprints().data.map((k) => `${k.id}${k.active ? '*' : ''} ${k.fingerprint}`).join(', ')}`)
const uploads = documentUploadPolicy(env, app.scanner)
if (!uploads.enabled) app.log.error(`Document uploads are closed: ${uploads.reason}`)
else if (app.scanner.name === 'none') app.log.warn('Document uploads use content validation only (no malware scanner). Allowed in development; production requires MALWARE_SCANNER=clamav.')

const shutdown = async () => {
  await app.close()
  await database.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ host: '127.0.0.1', port: env.API_PORT })
