// Short-lived, server-side access grants for document files (docs §8.4.4).
//
// A document file is only served after the user asked for it inside ACARVO: a CSRF- and Origin-checked POST
// creates a grant bound to the session, the active company, the file and the purpose (view / download / preview).
// The GET that streams the file needs a matching, unexpired grant; the URL carries no token or secret.
// Grants are kept in this process's memory: they disappear on restart (the user simply clicks again) and are not
// shared between API instances (running several instances needs a shared store; see the night report decisions).

export const DOCUMENT_ACCESS_MODES = ['view', 'download', 'preview'] as const
export type DocumentAccessMode = (typeof DOCUMENT_ACCESS_MODES)[number]

/** Long enough for the browser (and its PDF viewer) to fetch the file, short enough that an old tab stops working. */
export const DOCUMENT_ACCESS_TTL_MS = 2 * 60 * 1000
const MAX_GRANTS = 20_000

/** Which file table a grant opens. Vehicle and customer document files and contract PDFs are separate record types. */
export type DocumentAccessKind = 'vehicle_document' | 'customer_document' | 'contract_pdf'

interface Grant {
  kind: DocumentAccessKind
  sessionId: string
  userId: string
  companyId: string
  fileId: string
  mode: DocumentAccessMode
  expiresAt: number
}

export interface DocumentAccessGrants {
  issue(g: Omit<Grant, 'expiresAt' | 'kind'> & { kind?: DocumentAccessKind }): { expiresAt: number }
  /** True only for an unexpired grant of this session, company, file kind, file and purpose. Not consumed: the PDF viewer may ask again. */
  allows(q: { sessionId: string; companyId: string; fileId: string; mode: DocumentAccessMode; kind?: DocumentAccessKind }): boolean
  revokeSession(sessionId: string): void
  revokeUser(userId: string): void
  size(): number
}

export function createDocumentAccessGrants(ttlMs = DOCUMENT_ACCESS_TTL_MS, now: () => number = Date.now): DocumentAccessGrants {
  const grants = new Map<string, Grant>()
  const key = (sessionId: string, fileId: string, mode: DocumentAccessMode, kind: DocumentAccessKind = 'vehicle_document') => `${kind}|${sessionId}|${fileId}|${mode}`
  const sweep = () => {
    const t = now()
    for (const [k, g] of grants) if (g.expiresAt <= t) grants.delete(k)
  }
  return {
    issue(g) {
      if (grants.size >= MAX_GRANTS) sweep()
      if (grants.size >= MAX_GRANTS) grants.delete(grants.keys().next().value!)
      const expiresAt = now() + ttlMs
      const kind = g.kind ?? 'vehicle_document'
      grants.set(key(g.sessionId, g.fileId, g.mode, kind), { ...g, kind, expiresAt })
      return { expiresAt }
    },
    allows(q) {
      const k = key(q.sessionId, q.fileId, q.mode, q.kind)
      const g = grants.get(k)
      if (!g) return false
      if (g.expiresAt <= now()) {
        grants.delete(k)
        return false
      }
      // A company switch keeps the session but changes the active company: the old grant no longer applies.
      return g.companyId === q.companyId
    },
    revokeSession(sessionId) {
      for (const [k, g] of grants) if (g.sessionId === sessionId) grants.delete(k)
    },
    revokeUser(userId) {
      for (const [k, g] of grants) if (g.userId === userId) grants.delete(k)
    },
    size: () => grants.size,
  }
}
