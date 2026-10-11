import { COUNTRY_CODES } from '@acarvo/shared'
import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { branches } from '../../db/schema'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import { branchSummaries } from '../auth/context'
import { inScope } from '../vehicles/repository'

const country = z
  .string({ error: 'Ülke seçin' })
  .trim()
  .toUpperCase()
  .refine((c) => COUNTRY_CODES.includes(c), 'Listeden bir ülke seçin')
const idParams = z.object({ id: z.uuid() })
const setCountrySchema = z.object({ country: z.union([country, z.null()]) })
const previewSchema = z.object({ country })
const applySchema = z.object({
  country,
  /** Exactly the branches shown in the preview. Only those still without a country are changed. */
  branchIds: z.array(z.uuid()).min(1).max(200),
  confirm: z.literal(true, { error: 'Önizlemeyi onaylayın' }),
})
const BRANCH_NOT_FOUND = 'Şube bulunamadı veya bu şubeye erişim yetkiniz yok.'

/**
 * Branches of the active company. The country (M2) is the reference for the rental-time residency classification
 * later; it is entered by the owner and never filled in automatically.
 */
export async function branchRoutes(app: FastifyInstance) {
  /** Branches of the active company that the user may see (all, or only assigned ones). */
  app.get('/', async (req) => withCompany(req, 'branches.read', async (tx, access) => ({ items: await branchSummaries(tx, access) })))

  /** Sets (or clears) one branch's country. */
  app.put('/:id/country', async (req) => {
    const parsed = idParams.safeParse(req.params)
    if (!parsed.success) throw notFound(BRANCH_NOT_FOUND)
    return withCompany(req, 'branches.manage', async (tx, access) => {
      const input = setCountrySchema.parse(req.body)
      const [b] = await tx.select().from(branches).where(eq(branches.id, parsed.data.id)).for('update')
      if (!b || !inScope(access, b.id)) throw notFound(BRANCH_NOT_FOUND)
      if (b.country === input.country) return { items: await branchSummaries(tx, access) }
      await tx.update(branches).set({ country: input.country }).where(eq(branches.id, b.id))
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: req.auth!.user.id,
        action: 'branch.country_set',
        entity: 'branch',
        entityId: b.id,
        summary: { code: b.code, from: b.country, to: input.country },
      })
      return { items: await branchSummaries(tx, access) }
    })
  })

  /** Which branches a bulk assignment would change: active branches in the user's scope without a country. Changes nothing. */
  app.post('/country/preview', async (req) =>
    withCompany(req, 'branches.manage', async (tx, access) => {
      const input = previewSchema.parse(req.body)
      const rows = (
        await tx.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches).where(sql`${branches.status} = 'active' and ${branches.country} is null`)
      ).filter((b) => inScope(access, b.id))
      return { country: input.country, branches: rows.sort((a, b) => a.code.localeCompare(b.code)) }
    }),
  )

  /** Applies the previewed assignment after explicit confirmation. A branch that got a country meanwhile is left alone. */
  app.post('/country/apply', async (req) =>
    withCompany(req, 'branches.manage', async (tx, access) => {
      const input = applySchema.parse(req.body)
      const ids = [...new Set(input.branchIds)]
      const rows = await tx
        .select()
        .from(branches)
        .where(sql`${branches.id} in (select unnest(${`{${ids.join(',')}}`}::uuid[]))`)
        .for('update')
      if (rows.length !== ids.length || rows.some((b) => !inScope(access, b.id))) throw new AppError(409, 'PREVIEW_STALE', 'Şube listesi değişti. Önizlemeyi yenileyin.')
      const changed: string[] = []
      for (const b of rows) {
        if (b.country !== null || b.status !== 'active') continue
        await tx.update(branches).set({ country: input.country }).where(eq(branches.id, b.id))
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: req.auth!.user.id,
          action: 'branch.country_set',
          entity: 'branch',
          entityId: b.id,
          summary: { code: b.code, from: null, to: input.country, bulk: true },
        })
        changed.push(b.code)
      }
      return { changed, skipped: rows.filter((b) => !changed.includes(b.code)).map((b) => b.code), items: await branchSummaries(tx, access) }
    }),
  )
}
