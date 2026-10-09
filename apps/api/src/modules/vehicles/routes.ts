import { vehicleCreateSchema, vehicleListQuerySchema, vehicleUpdateSchema } from '@acarvo/shared'
import { asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { odometerReadings, vehicleClasses, vehicleLocationEvents, vehicles } from '../../db/schema'
import { audit } from '../../lib/audit'
import { AppError, notFound } from '../../lib/errors'
import { withCompany } from '../../plugins/auth'
import { assertReferences, assertUnique, getVehicle, inScope, listVehicles, mapUniqueViolation, vehicleColumns } from './repository'

const idParams = z.object({ id: z.uuid() })
const VEHICLE_NOT_FOUND = 'Araç bulunamadı veya bu araca erişim yetkiniz yok.'

export async function vehicleRoutes(app: FastifyInstance) {
  app.get('/', async (req) =>
    withCompany(req, 'vehicles.read', (tx, access) => listVehicles(tx, access, vehicleListQuerySchema.parse(req.query))),
  )

  app.get('/:id', async (req) => {
    const parsed = idParams.safeParse(req.params)
    if (!parsed.success) throw notFound(VEHICLE_NOT_FOUND)
    return withCompany(req, 'vehicles.read', async (tx, access) => (await getVehicle(tx, access, parsed.data.id)) ?? Promise.reject(notFound(VEHICLE_NOT_FOUND)))
  })

  app.post('/', async (req, reply) => {
    const created = await withCompany(req, 'vehicles.create', async (tx, access) => {
      const input = vehicleCreateSchema.parse(req.body)
      const locationBranchId = input.initialLocationBranchId ?? input.homeBranchId
      await assertReferences(tx, access, input, { field: 'initialLocationBranchId', id: locationBranchId })
      await assertUnique(tx, access, input)
      const userId = req.auth!.user.id
      const now = new Date()
      const [row] = await tx
        .insert(vehicles)
        .values({ ...vehicleColumns(input), companyId: access.companyId, source: 'internal', createdBy: userId, updatedBy: userId })
        .returning({ id: vehicles.id, plate: vehicles.plate })
        .catch(mapUniqueViolation)
      if (input.initialOdometerKm !== undefined) {
        await tx.insert(odometerReadings).values({
          companyId: access.companyId,
          vehicleId: row!.id,
          km: input.initialOdometerKm,
          eventType: 'initial',
          occurredAt: now,
          note: 'Araç kaydında girilen başlangıç kilometresi',
          recordedBy: userId,
        })
      }
      await tx.insert(vehicleLocationEvents).values({
        companyId: access.companyId,
        vehicleId: row!.id,
        locationType: 'branch',
        branchId: locationBranchId,
        eventType: 'initial',
        description: 'Araç kaydında girilen başlangıç konumu',
        occurredAt: now,
        recordedBy: userId,
      })
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.create',
        entity: 'vehicle',
        entityId: row!.id,
        summary: { plate: row!.plate, initialOdometerKm: input.initialOdometerKm ?? null, initialLocationBranchId: locationBranchId },
      })
      return getVehicle(tx, access, row!.id)
    })
    return reply.code(201).send(created)
  })

  app.put('/:id', async (req) => {
    const parsed = idParams.safeParse(req.params)
    if (!parsed.success) throw notFound(VEHICLE_NOT_FOUND)
    const id = parsed.data.id
    return withCompany(req, 'vehicles.update', async (tx, access) => {
      const input = vehicleUpdateSchema.parse(req.body)
      // Lock the row so the version check and the update cannot interleave with another save.
      const [current] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for('update')
      if (!current || !inScope(access, current.homeBranchId)) throw notFound(VEHICLE_NOT_FOUND)
      if (current.version !== input.version) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Bu araç siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, {
          current: await getVehicle(tx, access, id),
        })
      }
      if (current.status === 'sold' || current.status === 'disposed') {
        throw new AppError(409, 'VEHICLE_EXITED', 'Filodan çıkmış araçların ana bilgileri düzenlenemez.')
      }
      await assertReferences(tx, access, input)
      await assertUnique(tx, access, input, id)

      const next = vehicleColumns(input)
      const changes: Record<string, [unknown, unknown]> = {}
      for (const [key, value] of Object.entries(next) as [keyof typeof next, unknown][]) {
        const before = current[key] ?? null
        if (String(before) !== String(value ?? null)) changes[key] = [before, value ?? null]
      }
      delete changes.plateNormalized
      if (Object.keys(changes).length === 0 && current.plate === next.plate) return getVehicle(tx, access, id)

      const userId = req.auth!.user.id
      const updated = await tx
        .update(vehicles)
        .set({ ...next, version: sql`${vehicles.version} + 1`, updatedAt: new Date(), updatedBy: userId })
        .where(sql`${vehicles.id} = ${id} and ${vehicles.version} = ${input.version}`)
        .returning({ id: vehicles.id })
        .catch(mapUniqueViolation)
      if (!updated.length) {
        throw new AppError(409, 'VERSION_CONFLICT', 'Bu araç siz düzenlerken başka bir kullanıcı tarafından güncellendi.', undefined, {
          current: await getVehicle(tx, access, id),
        })
      }
      await audit(tx, {
        companyId: access.companyId,
        actorUserId: userId,
        action: 'vehicle.update',
        entity: 'vehicle',
        entityId: id,
        summary: { plate: next.plate, fromVersion: input.version, changes },
      })
      return getVehicle(tx, access, id)
    })
  })
}

export async function vehicleClassRoutes(app: FastifyInstance) {
  app.get('/', async (req) =>
    withCompany(req, 'vehicles.read', async (tx) => ({
      items: await tx
        .select({ id: vehicleClasses.id, name: vehicleClasses.name })
        .from(vehicleClasses)
        .orderBy(asc(vehicleClasses.sortOrder), asc(vehicleClasses.name)),
    })),
  )
}
