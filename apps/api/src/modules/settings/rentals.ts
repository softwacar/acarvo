import { type RentalSettings, rentalSettingsSchema } from '@acarvo/shared'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Tx } from '../../db/client'
import { audit } from '../../lib/audit'
import { AppError, forbidden } from '../../lib/errors'
import { toIso } from '../../lib/timestamps'
import { withCompany } from '../../plugins/auth'

async function load(tx: Tx): Promise<RentalSettings> {
  const r = (
    await tx.execute(sql`select s.external_terms_mode, s.version, s.updated_at, u.name as updated_by_name
      from company_rental_settings s left join users u on u.id = s.updated_by`)
  ).rows[0] as Record<string, unknown> | undefined
  return r
    ? { externalTermsMode: r.external_terms_mode === true, version: Number(r.version), updatedAt: toIso(r.updated_at), updatedByName: (r.updated_by_name as string) ?? null }
    : { externalTermsMode: false, version: 0, updatedAt: null, updatedByName: null }
}

/**
 * K1: the company's rental operating mode (external contract and pricing). Off by default; only a user with
 * settings.rentals.manage (the Sahip preset) changes it; RLS keeps each company to its own row; every change is audited.
 */
export async function rentalSettingsRoutes(app: FastifyInstance) {
  app.get('/rentals', async (req) =>
    withCompany(req, null, async (tx, access) => {
      if (!access.permissions.has('rentals.read') && !access.permissions.has('settings.rentals.manage')) throw forbidden()
      return load(tx)
    }),
  )

  app.put('/rentals', async (req) =>
    withCompany(req, 'settings.rentals.manage', async (tx, access) => {
      const input = rentalSettingsSchema.parse(req.body)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rental-settings:${access.companyId}`}, 0))`)
      const before = await load(tx)
      if (before.version !== input.version) throw new AppError(409, 'VERSION_CONFLICT', 'Bu ayar siz bakarken değişti. Sayfayı yenileyin.', undefined, { current: before })
      if (before.externalTermsMode === input.externalTermsMode) return before
      const userId = req.auth!.user.id
      await tx.execute(sql`insert into company_rental_settings (company_id, external_terms_mode, version, updated_by, updated_at)
        values (${access.companyId}, ${input.externalTermsMode}, 1, ${userId}, now())
        on conflict (company_id) do update set external_terms_mode = excluded.external_terms_mode, version = company_rental_settings.version + 1,
          updated_by = excluded.updated_by, updated_at = now()`)
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'settings.rental_mode_update',
        entity: 'company',
        entityId: access.companyId,
        summary: { externalTermsMode: [before.externalTermsMode, input.externalTermsMode] },
      })
      return load(tx)
    }),
  )
}
