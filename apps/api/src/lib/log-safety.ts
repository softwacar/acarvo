import type { FastifyRequest } from 'fastify'

/**
 * Request log line without the query string: search words, names, phone numbers or e-mail addresses
 * must never reach the logs (customers plan §9.5). Bodies are never logged.
 */
export function requestForLog(req: FastifyRequest) {
  return { method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip }
}

interface PgLike {
  code?: string
  message?: string
  constraint?: string
  table?: string
  routine?: string
  severity?: string
}

/**
 * Error for the log: type, PostgreSQL code and constraint, and the stack frames. Drops what can carry personal data:
 * a failed query's text and parameters (drizzle puts them in the message), PostgreSQL's `detail` ("Key (...)=(...)")
 * and the message lines of the stack (only the "at …" frames are kept).
 */
export function errorForLog(err: unknown): { type: string; message: string; stack: string; [key: string]: unknown } {
  if (!err || typeof err !== 'object') return { type: typeof err, message: 'Non-error value thrown', stack: '' }
  const e = err as Error & PgLike & { cause?: unknown }
  const cause = e.cause && typeof e.cause === 'object' ? (e.cause as PgLike) : undefined
  const pg = cause?.severity ? cause : e.severity ? e : undefined
  const failedQuery = typeof e.message === 'string' && e.message.startsWith('Failed query')
  return {
    type: e.constructor?.name ?? 'Error',
    message: String((pg ? pg.message : failedQuery ? 'Database query failed' : e.message) ?? ''),
    code: pg?.code ?? e.code,
    constraint: pg?.constraint,
    table: pg?.table,
    routine: pg?.routine,
    stack: typeof e.stack === 'string' ? e.stack.split('\n').filter((line) => /^\s+at /.test(line)).slice(0, 12).join('\n') : '',
  }
}
