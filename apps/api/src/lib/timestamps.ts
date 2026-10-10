/**
 * Timestamps arrive from PostgreSQL as Date objects or as text ("2026-10-09 22:41:23.5+02", in the connection's
 * zone); the API always answers ISO 8601 UTC (docs §9.1). One place for this parsing.
 */
export const toIso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString()

export const toIsoOrNull = (v: unknown): string | null => (v == null ? null : toIso(v))
