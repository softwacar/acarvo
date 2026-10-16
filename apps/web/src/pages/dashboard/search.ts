/** Ana Ekran: the branch filter lives in the URL (?sube=<id>); anything else is dropped. */
export const validateDashboardSearch = (s: Record<string, unknown>): { sube?: string } => (typeof s.sube === 'string' && /^[0-9a-f-]{36}$/.test(s.sube) ? { sube: s.sube } : {})
