import { z } from 'zod'

/** Runtime configuration. Secrets come only from the environment (local .env), never from source. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** Runtime connection as the restricted `acarvo_app` role (no superuser, no BYPASSRLS, not owner). */
  DATABASE_URL: z.string().min(1),
  /** Migration/seed connection as `acarvo_owner`. Not used by the running API. */
  DATABASE_OWNER_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  TEST_DATABASE_OWNER_URL: z.string().min(1).optional(),
  /** Private file storage root. Defaults to <repo>/storage (ignored by Git, never served directly). */
  STORAGE_DIR: z.string().min(1).optional(),
  /** Malware scanner for document uploads. In production, uploads stay closed while this is 'none'. */
  MALWARE_SCANNER: z.enum(['none', 'clamav']).default('none'),
  CLAMAV_HOST: z.string().default('127.0.0.1'),
  CLAMAV_PORT: z.coerce.number().int().default(3310),
  /** Signs the CSRF secret cookie. */
  COOKIE_SECRET: z.string().min(32),
})

export type Env = z.infer<typeof schema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration: ${missing}. Run scripts/setup-db.ps1 to create .env.`)
  }
  return parsed.data
}
