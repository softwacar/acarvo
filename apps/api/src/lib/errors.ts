/** Expected failures. The error handler turns them into `{ error: { code, message, fields? } }`. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
    /** Extra machine-readable context, e.g. the conflicting record. */
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const unauthorized = () => new AppError(401, 'UNAUTHENTICATED', 'Oturumunuz sona erdi. Lütfen yeniden giriş yapın.')
export const forbidden = (message = 'Bu işlem için yetkiniz yok.') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Kayıt bulunamadı.') => new AppError(404, 'NOT_FOUND', message)
