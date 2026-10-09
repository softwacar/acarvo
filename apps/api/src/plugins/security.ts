import cookie from '@fastify/cookie'
import csrf from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import type { Env } from '../env'
import { AppError } from '../lib/errors'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
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
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, fields: err.fields } })
    }
    if (err instanceof ZodError) {
      const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message]))
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Bazı alanlar geçersiz.', fields } })
    }
    const e = err as FastifyError
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

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Kaynak bulunamadı.' } })
  })
}
