import type { Permission } from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { PHOTO_ACCESS_TTL_MS } from '../../lib/document-access'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import { rentalScopeSql } from '../rentals/repository'
import { branchScopeSql } from './common'

// Evidence photo access (docs/OPERASYONEL_HAZIRLIK_DASHBOARD_PLANI.md §4), on the existing document grant model:
// a CSRF- and Origin-checked POST, after company, permission and branch-scope checks, issues a short session-bound grant
// for all evidence photos of ONE record and records once that access was granted (not that anyone looked at them).
// The photo GETs need that grant, re-check permission and scope on every request, and never write history.

export const PHOTO_RECORD_KINDS = ['rental', 'maintenance', 'damage', 'transfer'] as const
export type PhotoRecordKind = (typeof PHOTO_RECORD_KINDS)[number]

const READ: Record<PhotoRecordKind, Permission> = { rental: 'rentals.read', maintenance: 'maintenance.read', damage: 'damage.read', transfer: 'transfers.read' }

/** The record (in this company, visible to the user) and its number of active evidence photos; null when not visible. */
async function visibleRecord(tx: Tx, access: CompanyAccess, kind: PhotoRecordKind, id: string): Promise<{ no: string; photos: number } | null> {
  let q: SQL
  if (kind === 'rental') {
    q = sql`select k.rental_no as no, (select count(*)::int from rental_inspection_photos p join rental_inspections i on i.company_id = p.company_id and i.id = p.inspection_id
        where i.rental_id = k.id and p.removed_at is null) as photos from rentals k where k.id = ${id} and ${rentalScopeSql(access, 'k')}`
  } else if (kind === 'maintenance') {
    q = sql`select m.maintenance_no as no, (select count(*)::int from maintenance_photos p where p.maintenance_id = m.id and p.removed_at is null) as photos
      from maintenance_records m join vehicles v on v.company_id = m.company_id and v.id = m.vehicle_id where m.id = ${id} and ${branchScopeSql(access, sql`m.branch_id`, sql`v.home_branch_id`)}`
  } else if (kind === 'damage') {
    q = sql`select d.damage_no as no, (select count(*)::int from damage_photos p where p.damage_id = d.id and p.removed_at is null) as photos
      from damage_files d join vehicles v on v.company_id = d.company_id and v.id = d.vehicle_id where d.id = ${id} and ${branchScopeSql(access, sql`d.branch_id`, sql`v.home_branch_id`)}`
  } else {
    q = sql`select t.transfer_no as no, (select count(*)::int from transfer_photos p where p.transfer_id = t.id and p.removed_at is null) as photos
      from vehicle_transfers t where t.id = ${id} and ${branchScopeSql(access, sql`t.from_branch_id`, sql`t.to_branch_id`)}`
  }
  const r = (await tx.execute(q)).rows[0] as { no: string; photos: number } | undefined
  return r ?? null
}

const grantKey = (kind: PhotoRecordKind, id: string) => `${kind}:${id}`

/** For photo GETs: the session must hold an unexpired grant for this record in the active company. */
export function requirePhotoGrant(app: FastifyInstance, req: FastifyRequest, companyId: string, kind: PhotoRecordKind, id: string) {
  if (!app.documentGrants.allows({ kind: 'evidence_photos', sessionId: req.auth!.session.id, companyId, fileId: grantKey(kind, id), mode: 'view' })) {
    throw new AppError(403, 'PHOTO_ACCESS_REQUIRED', 'Fotoğrafları görmek için önce ACARVO içinden erişim izni isteyin.')
  }
}

const body = z.object({ kind: z.enum(PHOTO_RECORD_KINDS), id: z.uuid() })

export async function photoAccessRoutes(app: FastifyInstance) {
  /**
   * POST /api/photo-access: grants this session access to the evidence photos of one record for 10 minutes. A grant still
   * valid is reused without a new history row; a new grant writes one "photo access granted" row (no personal data).
   */
  app.post('/', async (req) => {
    const p = body.safeParse(req.body)
    if (!p.success) throw notFound()
    const { kind, id } = p.data
    return withCompany(req, null, async (tx, access) => {
      if (!access.permissions.has(READ[kind])) throw forbidden()
      const rec = await visibleRecord(tx, access, kind, id)
      if (!rec) throw notFound()
      const auth = req.auth!
      const q = { kind: 'evidence_photos' as const, sessionId: auth.session.id, companyId: access.companyId, fileId: grantKey(kind, id), mode: 'view' as const }
      const existing = app.documentGrants.expiry(q)
      if (existing) return { expiresAt: new Date(existing).toISOString(), photos: rec.photos, reused: true }
      const { expiresAt } = app.documentGrants.issue({ ...q, userId: auth.user.id }, PHOTO_ACCESS_TTL_MS)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: auth.user.id,
        action: 'photo.access_granted',
        entity: kind,
        entityId: id,
        summary: { recordNo: rec.no, photos: rec.photos, minutes: PHOTO_ACCESS_TTL_MS / 60_000 },
      })
      return { expiresAt: new Date(expiresAt).toISOString(), photos: rec.photos, reused: false }
    })
  })
}
