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
  /**
   * Proxies allowed to set X-Forwarded-For (proxy-addr syntax, e.g. "loopback" or "10.0.0.1,10.0.0.2").
   * Defaults to the local dev proxy outside production; in production, set it to the real reverse proxy.
   */
  TRUST_PROXY: z.string().optional(),
  /**
   * Customer identity data encryption (M2 plan §4). Key rings "k1:<base64 32 bytes>,k2:…" and the active key id.
   * Data keys encrypt document numbers and files; lookup keys build the exact-match HMAC. Both rings are required
   * together; without them numbers and files cannot be written (nothing is ever stored in plaintext).
   */
  CUSTOMER_DATA_KEYS: z.string().optional(),
  CUSTOMER_DATA_KEY_ACTIVE: z.string().optional(),
  CUSTOMER_LOOKUP_KEYS: z.string().optional(),
  CUSTOMER_LOOKUP_KEY_ACTIVE: z.string().optional(),
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

/** Settings that work in development but are unsafe or fragile in production; logged at start-up (docs §12). */
export function productionWarnings(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return []
  const w: string[] = []
  if (!env.STORAGE_DIR) w.push('STORAGE_DIR is not set: files go to <repo>/storage. Set a persistent, backed-up folder outside the code.')
  if (/localhost|127\.0\.0\.1/.test(env.WEB_ORIGIN)) w.push(`WEB_ORIGIN is ${env.WEB_ORIGIN}: set the public https address, or every change request is refused.`)
  if (!env.WEB_ORIGIN.startsWith('https://')) w.push('WEB_ORIGIN is not https: session cookies require HTTPS.')
  if (!env.TRUST_PROXY) w.push('TRUST_PROXY is not set: behind a reverse proxy all clients share one address (sign-in limits, session IPs).')
  if (env.MALWARE_SCANNER === 'none') w.push('MALWARE_SCANNER is none: document uploads stay closed until a scanner is configured.')
  if (!env.CUSTOMER_DATA_KEYS || !env.CUSTOMER_LOOKUP_KEYS) w.push('Customer data keys are not set: customer document numbers and files cannot be stored (see docs, customer key setup).')
  return w
}
