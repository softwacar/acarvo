import { and, asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { files, MAX_PROMO_PHOTOS, vehiclePromoPhotos, vehicles } from '../../db/schema'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { MAX_PHOTO_BYTES, processPromoPhoto } from '../../lib/images'
import { withCompany } from '../../plugins/auth'
import type { CompanyAccess } from '../auth/context'
import type { VehiclePhotoAttribution } from '@acarvo/shared'
import { inScope } from './repository'

const VEHICLE_NOT_FOUND = 'Araç bulunamadı veya bu araca erişim yetkiniz yok.'
const PHOTO_NOT_FOUND = 'Fotoğraf bulunamadı.'
const vehicleParams = z.object({ id: z.uuid() })
const photoParams = z.object({ id: z.uuid(), photoId: z.uuid() })
const orderBody = z.object({ photoIds: z.array(z.uuid()).min(1).max(MAX_PROMO_PHOTOS) })

function parse<T>(schema: z.ZodType<T>, value: unknown, message = VEHICLE_NOT_FOUND): T {
  const r = schema.safeParse(value)
  if (!r.success) throw notFound(message)
  return r.data
}

/** The vehicle row, locked when we are about to change its photos; 404 outside company or branch scope. */
async function visibleVehicle(tx: Tx, access: CompanyAccess, vehicleId: string, lock = false) {
  const q = tx.select({ id: vehicles.id, homeBranchId: vehicles.homeBranchId, plate: vehicles.plate }).from(vehicles).where(eq(vehicles.id, vehicleId))
  const [v] = lock ? await q.for('update') : await q
  if (!v || !inScope(access, v.homeBranchId)) throw notFound(VEHICLE_NOT_FOUND)
  return v
}

async function listPhotos(tx: Tx, vehicleId: string) {
  const rows = await tx.execute(sql`
    select p.id, p.position, p.is_primary, p.attribution, p.created_at, f.id as file_id, f.width, f.height, f.size_bytes, u.name as uploaded_by_name
    from vehicle_promo_photos p
    join files f on f.company_id = p.company_id and f.id = p.file_id
    left join users u on u.id = p.created_by
    where p.vehicle_id = ${vehicleId}
    order by p.position asc`)
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    position: Number(r.position),
    isPrimary: r.is_primary as boolean,
    width: Number(r.width),
    height: Number(r.height),
    sizeBytes: Number(r.size_bytes),
    createdAt: new Date(String(r.created_at).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString(),
    uploadedByName: (r.uploaded_by_name as string) ?? null,
    attribution: (r.attribution as VehiclePhotoAttribution | null) ?? null,
    url: `/api/files/${r.file_id as string}`,
    thumbUrl: `/api/files/${r.file_id as string}?variant=thumb`,
  }))
}

/** Positions 0..n-1 in the given order; the deferred unique constraint allows the swap. */
async function writeOrder(tx: Tx, ids: string[]) {
  for (const [i, id] of ids.entries()) await tx.update(vehiclePromoPhotos).set({ position: i }).where(eq(vehiclePromoPhotos.id, id))
}

export async function vehiclePhotoRoutes(app: FastifyInstance) {
  const storage = app.storage

  app.get('/:id/photos', async (req) => {
    const { id } = parse(vehicleParams, req.params)
    return withCompany(req, 'vehicles.read', async (tx, access) => {
      await visibleVehicle(tx, access, id)
      return { items: await listPhotos(tx, id), max: MAX_PROMO_PHOTOS }
    })
  })

  app.post('/:id/photos', async (req, reply) => {
    const { id } = parse(vehicleParams, req.params)
    // 1. Cheap checks before accepting the upload body.
    await withCompany(req, 'vehicles.photos.manage', async (tx, access) => {
      await visibleVehicle(tx, access, id)
      const [{ n }] = (await tx.execute(sql`select count(*)::int as n from vehicle_promo_photos where vehicle_id = ${id}`)).rows as { n: number }[]
      if (n >= MAX_PROMO_PHOTOS) throw new AppError(409, 'PHOTO_LIMIT', `Bir araçta en fazla ${MAX_PROMO_PHOTOS} tanıtım fotoğrafı olabilir.`)
    })

    // 2. Read, validate and clean the image outside any transaction.
    if (!req.isMultipart()) throw new AppError(400, 'NO_FILE', 'Yüklenecek fotoğraf bulunamadı.')
    const part = await req.file()
    if (!part) throw new AppError(400, 'NO_FILE', 'Yüklenecek fotoğraf bulunamadı.')
    const input = await part.toBuffer()
    const image = await processPromoPhoto(input)

    // 3. Store, then link in one transaction; on any failure the stored files are removed.
    const keys = storage.newKeys(req.auth!.session.activeCompanyId!)
    await storage.put(keys.main, image.main)
    await storage.put(keys.thumb, image.thumb)
    try {
      const created = await withCompany(req, 'vehicles.photos.manage', async (tx, access) => {
        const v = await visibleVehicle(tx, access, id, true)
        const [{ n }] = (await tx.execute(sql`select count(*)::int as n from vehicle_promo_photos where vehicle_id = ${id}`)).rows as { n: number }[]
        if (n >= MAX_PROMO_PHOTOS) throw new AppError(409, 'PHOTO_LIMIT', `Bir araçta en fazla ${MAX_PROMO_PHOTOS} tanıtım fotoğrafı olabilir.`)
        const userId = req.auth!.user.id
        const [file] = await tx
          .insert(files)
          .values({
            companyId: access.companyId,
            kind: 'vehicle_promo_photo',
            storageKey: keys.main,
            thumbKey: keys.thumb,
            mimeType: 'image/webp',
            sizeBytes: image.main.length,
            width: image.width,
            height: image.height,
            sha256: image.sha256,
            uploadedBy: userId,
          })
          .returning({ id: files.id })
        const [photo] = await tx
          .insert(vehiclePromoPhotos)
          .values({ companyId: access.companyId, vehicleId: id, fileId: file!.id, position: n, isPrimary: n === 0, createdBy: userId })
          .returning({ id: vehiclePromoPhotos.id })
        await audit(tx, {
          companyId: access.companyId,
          actorUserId: userId,
          action: 'vehicle.photo.add',
          entity: 'vehicle',
          entityId: id,
          summary: { plate: v.plate, photoId: photo!.id, primary: n === 0, width: image.width, height: image.height },
        })
        return (await listPhotos(tx, id)).find((p) => p.id === photo!.id)
      })
      return reply.code(201).send(created)
    } catch (e) {
      await storage.remove(keys.main, keys.thumb)
      throw e
    }
  })

  app.put('/:id/photos/order', async (req) => {
    const { id } = parse(vehicleParams, req.params)
    const body = orderBody.safeParse(req.body)
    if (!body.success) throw new AppError(400, 'VALIDATION', 'Fotoğraf sırası geçersiz.')
    return withCompany(req, 'vehicles.photos.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id, true)
      const current = await tx.select({ id: vehiclePromoPhotos.id }).from(vehiclePromoPhotos).where(eq(vehiclePromoPhotos.vehicleId, id)).orderBy(asc(vehiclePromoPhotos.position))
      const ids = body.data.photoIds
      const same = ids.length === current.length && new Set(ids).size === ids.length && current.every((c) => ids.includes(c.id))
      if (!same) throw new AppError(409, 'PHOTOS_CHANGED', 'Fotoğraflar bu arada değişmiş. Sayfayı yenileyip tekrar deneyin.')
      await writeOrder(tx, ids)
      await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'vehicle.photo.reorder', entity: 'vehicle', entityId: id, summary: { plate: v.plate, order: ids } })
      return { items: await listPhotos(tx, id), max: MAX_PROMO_PHOTOS }
    })
  })

  app.post('/:id/photos/:photoId/primary', async (req) => {
    const { id, photoId } = parse(photoParams, req.params)
    return withCompany(req, 'vehicles.photos.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id, true)
      const [photo] = await tx.select().from(vehiclePromoPhotos).where(and(eq(vehiclePromoPhotos.id, photoId), eq(vehiclePromoPhotos.vehicleId, id)))
      if (!photo) throw notFound(PHOTO_NOT_FOUND)
      if (!photo.isPrimary) {
        // Two statements: the one-primary index is checked row by row.
        await tx.update(vehiclePromoPhotos).set({ isPrimary: false }).where(eq(vehiclePromoPhotos.vehicleId, id))
        await tx.update(vehiclePromoPhotos).set({ isPrimary: true }).where(eq(vehiclePromoPhotos.id, photoId))
        await audit(tx, { companyId: access.companyId, actorUserId: req.auth!.user.id, action: 'vehicle.photo.primary', entity: 'vehicle', entityId: id, summary: { plate: v.plate, photoId } })
      }
      return { items: await listPhotos(tx, id), max: MAX_PROMO_PHOTOS }
    })
  })

  app.delete('/:id/photos/:photoId', async (req) => {
    const { id, photoId } = parse(photoParams, req.params)
    const removedKeys: string[] = []
    const result = await withCompany(req, 'vehicles.photos.manage', async (tx, access) => {
      const v = await visibleVehicle(tx, access, id, true)
      const [photo] = await tx.select().from(vehiclePromoPhotos).where(and(eq(vehiclePromoPhotos.id, photoId), eq(vehiclePromoPhotos.vehicleId, id)))
      if (!photo) throw notFound(PHOTO_NOT_FOUND)
      const [file] = await tx.select({ storageKey: files.storageKey, thumbKey: files.thumbKey }).from(files).where(eq(files.id, photo.fileId))
      await tx.delete(vehiclePromoPhotos).where(eq(vehiclePromoPhotos.id, photoId))
      await tx.delete(files).where(eq(files.id, photo.fileId))
      const rest = await tx.select({ id: vehiclePromoPhotos.id }).from(vehiclePromoPhotos).where(eq(vehiclePromoPhotos.vehicleId, id)).orderBy(asc(vehiclePromoPhotos.position))
      await writeOrder(tx, rest.map((r) => r.id))
      if (photo.isPrimary && rest[0]) await tx.update(vehiclePromoPhotos).set({ isPrimary: true }).where(eq(vehiclePromoPhotos.id, rest[0].id))
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: req.auth!.user.id,
        action: 'vehicle.photo.remove',
        entity: 'vehicle',
        entityId: id,
        summary: { plate: v.plate, photoId, wasPrimary: photo.isPrimary },
      })
      if (file) removedKeys.push(file.storageKey, file.thumbKey)
      return { items: await listPhotos(tx, id), max: MAX_PROMO_PHOTOS }
    })
    // Only after the database change is committed.
    await storage.remove(...removedKeys)
    return result
  })
}

/** Streams a stored file after checking company (RLS), permission and branch scope of the owning vehicle. */
export async function fileRoutes(app: FastifyInstance) {
  app.get('/:id', async (req, reply) => {
    const parsed = z.object({ id: z.uuid() }).safeParse(req.params)
    if (!parsed.success) throw notFound()
    const variant = (req.query as { variant?: string }).variant === 'thumb' ? 'thumb' : 'main'
    const file = await withCompany(req, 'vehicles.read', async (tx, access) => {
      const rows = await tx.execute(sql`
        select f.storage_key, f.thumb_key, v.home_branch_id
        from files f
        join vehicle_promo_photos p on p.company_id = f.company_id and p.file_id = f.id
        join vehicles v on v.company_id = p.company_id and v.id = p.vehicle_id
        where f.id = ${parsed.data.id}`)
      const r = rows.rows[0] as { storage_key: string; thumb_key: string; home_branch_id: string } | undefined
      if (!r || !inScope(access, r.home_branch_id)) throw notFound()
      return r
    })
    const { stream, size } = await app.storage.open(variant === 'thumb' ? file.thumb_key : file.storage_key)
    return reply
      .header('content-type', 'image/webp')
      .header('content-length', size)
      // Never stored by the browser or any proxy: every display is a new request that passes
      // the session, company and branch checks above, so logout or a company switch cuts access.
      .header('cache-control', 'private, no-store, max-age=0')
      .header('pragma', 'no-cache')
      .header('vary', 'Cookie')
      .header('content-disposition', 'inline')
      .send(stream)
  })
}

export { MAX_PHOTO_BYTES }
