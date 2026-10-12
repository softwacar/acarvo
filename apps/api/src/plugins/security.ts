import cookie from '@fastify/cookie'
import csrf from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import type { Env } from '../env'
import { AppError } from '../lib/errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Photo and document uploads decode images and parse PDFs: capped per signed-in user (or address). */
export const UPLOAD_RATE_LIMIT = {
  rateLimit: {
    max: 40,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => `upload|${req.auth?.user.id ?? req.ip}`,
  },
}
export const CSRF_COOKIE = '__Host-acarvo_csrf'

/**
 * Security baseline: headers, signed CSRF secret cookie + header token on every
 * state-changing request, Origin check, opt-in rate limiting, uniform error format.
 */
export async function registerSecurity(app: FastifyInstance, env: Env) {
  await app.register(helmet)
  await app.register(cookie, { secret: env.COOKIE_SECRET })
  await app.register(csrf, {
    sessionPlugin: '@fastify/cookie',
    cookieKey: CSRF_COOKIE,
    cookieOpts: { path: '/', httpOnly: true, secure: true, sameSite: 'strict', signed: true },
    getToken: (req) => req.headers['x-csrf-token'] as string | undefined,
  })
  // Routes opt in with `config.rateLimit`; preHandler so the key can use the parsed body.
  await app.register(rateLimit, {
    global: false,
    hook: 'preHandler',
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: `Çok fazla deneme yapıldı. Yaklaşık ${Math.max(1, Math.ceil(ctx.ttl / 60000))} dakika sonra tekrar deneyin.`,
    }),
  })

  app.addHook('onRequest', (req, reply, done) => {
    if (SAFE_METHODS.has(req.method)) return done()
    const origin = req.headers.origin
    if (origin && origin !== env.WEB_ORIGIN) {
      return done(new AppError(403, 'BAD_ORIGIN', 'İstek kaynağı doğrulanamadı.'))
    }
    app.csrfProtection(req, reply, done)
  })

  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    if (err instanceof AppError) {
      const retry = (err.details as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds
      if (err.status === 429 && typeof retry === 'number') reply.header('retry-after', String(retry))
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields, details: err.details } })
    }
    if (err instanceof ZodError) {
      const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message]))
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Bazı alanlar geçersiz.', fields } })
    }
    const e = err as FastifyError
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.statusCode === 413) {
      return reply.code(413).send({ error: { code: 'FILE_TOO_LARGE', message: 'Fotoğraf en fazla 10 MB olabilir.' } })
    }
    if (e.code === 'FST_FILES_LIMIT' || e.code === 'FST_PARTS_LIMIT' || e.code === 'FST_FIELDS_LIMIT') {
      return reply.code(400).send({ error: { code: 'ONE_FILE', message: 'Her istekte tek fotoğraf yüklenebilir.' } })
    }
    if (e.statusCode === 429) {
      return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: e.message } })
    }
    if (e.code?.startsWith('FST_CSRF')) {
      return reply.code(403).send({ error: { code: 'CSRF_INVALID', message: 'Güvenlik doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin.' } })
    }
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: { code: 'BAD_REQUEST', message: 'İstek işlenemedi.' } })
    }
    req.log.error(err)
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Beklenmeyen bir hata oluştu.' } })
  })

  // API answers carry company data: never keep them in browser or proxy caches (including errors).
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/') && !reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store')
    return payload
  })

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı.' } })
  })
}
