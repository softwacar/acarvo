import type { OperationEvent, OperationPhoto, Permission, ReservationRef } from '@acarvo/shared'
import { type SQL, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Tx } from '../../db/client'
import { type BranchRow, branchRow } from '../../lib/branch-time'
import { AppError, forbidden, notFound } from '../../lib/errors'
import { processPromoPhoto } from '../../lib/images'
import { documentUploadPolicy } from '../../lib/malware'
import { toIso } from '../../lib/timestamps'
import type { CompanyAccess } from '../auth/context'
import { inScope } from '../vehicles/repository'

// Shared building blocks of the maintenance, damage and transfer modules (docs/BAKIM_HASAR_TRANSFER_V1_PLANI.md).

export type Row = Record<string, unknown>
export const str = (v: unknown) => (v == null ? null : String(v))
export const num = (v: unknown) => (v == null ? null : Number(v))
export const isoOrNull = (v: unknown) => (v == null ? null : toIso(v))
export const invalid = (fields: Record<string, string>, message = 'Bazı alanlar geçersiz.') => new AppError(400, 'VALIDATION', message, fields)
export const VEHICLE_NOT_FOUND = 'Araç bulunamadı veya bu araca erişim yetkiniz yok.'

export function need(access: CompanyAccess, ...permissions: Permission[]) {
  if (!permissions.every((p) => access.permissions.has(p))) throw forbidden()
}

const idParams = z.object({ id: z.uuid() })
const photoParams = z.object({ id: z.uuid(), photoId: z.uuid() })
export function parseId(req: FastifyRequest, message: string) {
  const p = idParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data.id
}
export function parsePhoto(req: FastifyRequest, message: string) {
  const p = photoParams.safeParse(req.params)
  if (!p.success) throw notFound(message)
  return p.data
}

/** SQL: the user's branches contain one of these columns (all branches: always). */
export function branchScopeSql(access: CompanyAccess, ...columns: SQL[]): SQL {
  if (access.allBranches) return sql`true`
  if (!access.branchIds.length) return sql`false`
  return sql`(${sql.join(
    columns.map((c) => sql`${c} in ${access.branchIds}`),
    sql` or `,
  )})`
}

/** Latest effective location of a vehicle (append-only history; corrections respected). */
export async function currentLocation(tx: Tx, vehicleId: string) {
  const r = (
    await tx.execute(sql`select e.location_type, e.branch_id, b.code, e.description, e.occurred_at from vehicle_location_events e
      left join branches b on b.company_id = e.company_id and b.id = e.branch_id
      where e.vehicle_id = ${vehicleId} and not exists (select 1 from vehicle_location_corrections c where c.company_id = e.company_id and c.event_id = e.id)
      order by e.occurred_at desc, e.created_at desc limit 1`)
  ).rows[0] as Row | undefined
  return r ? { type: r.location_type as string, branchId: str(r.branch_id), branchCode: str(r.code), description: str(r.description), at: toIso(r.occurred_at) } : null
}

export interface OpVehicle {
  id: string
  plate: string
  make: string
  model: string
  className: string
  status: string
  homeBranchId: string
}

/**
 * The vehicle as far as this user may work with it: its home branch or its current branch location is in the user's
 * scope (staff handle the vehicles physically at their branch). Otherwise it does not exist for them.
 */
export async function operationalVehicle(tx: Tx, access: CompanyAccess, id: string, field = 'vehicleId'): Promise<OpVehicle> {
  const r = (
    await tx.execute(sql`select v.id, v.plate, v.make, v.model, v.status, v.home_branch_id, vc.name as class_name from vehicles v
      join vehicle_classes vc on vc.company_id = v.company_id and vc.id = v.class_id where v.id = ${id}`)
  ).rows[0] as Row | undefined
  if (!r) throw new AppError(404, 'NOT_FOUND', VEHICLE_NOT_FOUND, { [field]: 'Araç bulunamadı' })
  if (!inScope(access, r.home_branch_id as string)) {
    const loc = await currentLocation(tx, id)
    if (!(loc?.type === 'branch' && loc.branchId && inScope(access, loc.branchId))) throw new AppError(404, 'NOT_FOUND', VEHICLE_NOT_FOUND, { [field]: 'Araç bulunamadı' })
  }
  return {
    id: r.id as string,
    plate: r.plate as string,
    make: r.make as string,
    model: r.model as string,
    className: r.class_name as string,
    status: r.status as string,
    homeBranchId: r.home_branch_id as string,
  }
}

/** An active branch of this company (RLS hides others); `scoped`: the user must work there. */
export async function activeBranch(tx: Tx, access: CompanyAccess, id: string, field: string, scoped: boolean, what = 'bu işlem'): Promise<BranchRow> {
  const b = await branchRow(tx, id)
  if (!b || b.status !== 'active') throw invalid({ [field]: 'Şube bulunamadı' })
  if (scoped && !inScope(access, b.id)) throw new AppError(403, 'BRANCH_FORBIDDEN', `${b.name} şubesinde ${what} için yetkiniz yok.`, { [field]: 'Bu şube için yetkiniz yok' })
  return b
}

export const branchRef = (r: Row, prefix: string): ReservationRef => ({ id: r[`${prefix}_id`] as string, name: r[`${prefix}_name`] as string, code: r[`${prefix}_code`] as string })

/** Branches for the forms: active ones, with their time zones and whether the user works there. */
export async function operationBranches(tx: Tx, access: CompanyAccess) {
  const rows = (await tx.execute(sql`select id, name, code, timezone from branches where status = 'active' order by name`)).rows as Row[]
  return { branches: rows.map((b) => ({ id: b.id as string, name: b.name as string, code: b.code as string, timeZone: b.timezone as string, inScope: inScope(access, b.id as string) })) }
}

// ---------------------------------------------------------------------------
// Events (append-only) and replays

export interface EventTable {
  table: 'maintenance_events' | 'damage_events' | 'transfer_events'
  fk: 'maintenance_id' | 'damage_id' | 'transfer_id'
}
export const MAINTENANCE_EVENTS: EventTable = { table: 'maintenance_events', fk: 'maintenance_id' }
export const DAMAGE_EVENTS: EventTable = { table: 'damage_events', fk: 'damage_id' }
export const TRANSFER_EVENTS: EventTable = { table: 'transfer_events', fk: 'transfer_id' }

export async function addEvent(
  tx: Tx,
  t: EventTable,
  companyId: string,
  recordId: string,
  kind: string,
  userId: string,
  extra: { from?: string | null; to?: string | null; reason?: string | null; data?: Record<string, unknown>; requestId?: string | null } = {},
) {
  await tx.execute(sql`insert into ${sql.identifier(t.table)} (company_id, ${sql.identifier(t.fk)}, kind, from_status, to_status, reason, data, client_request_id, actor_user_id)
    values (${companyId}, ${recordId}, ${kind}, ${extra.from ?? null}, ${extra.to ?? null}, ${extra.reason ?? null}, ${extra.data ? JSON.stringify(extra.data) : null}::jsonb,
      ${extra.requestId ?? null}, ${userId})`)
}

/** A request id already used: the same record returns its current state; another record is a client error. */
export async function replayOf(tx: Tx, t: EventTable, requestId: string, recordId: string) {
  const r = (await tx.execute(sql`select ${sql.identifier(t.fk)} as rid from ${sql.identifier(t.table)} where client_request_id = ${requestId}`)).rows[0] as Row | undefined
  if (!r) return false
  if (r.rid !== recordId) throw new AppError(409, 'REQUEST_REUSED', 'Bu gönderim başka bir kayıt için kullanıldı. Sayfayı yenileyin.')
  return true
}

export async function loadEvents(tx: Tx, t: EventTable, recordId: string): Promise<OperationEvent[]> {
  const rows = (
    await tx.execute(sql`select e.id, e.kind, e.from_status, e.to_status, e.reason, e.data, e.at, u.name as actor_name from ${sql.identifier(t.table)} e
      left join users u on u.id = e.actor_user_id where e.${sql.identifier(t.fk)} = ${recordId} order by e.at desc, e.id limit 300`)
  ).rows as Row[]
  return rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    fromStatus: str(r.from_status),
    toStatus: str(r.to_status),
    reason: str(r.reason),
    data: (r.data as Record<string, unknown>) ?? null,
    at: toIso(r.at),
    actorName: str(r.actor_name),
  }))
}

// ---------------------------------------------------------------------------
// Database guards end as clear answers (concurrent saves, direct changes)

/** "...(R-000006)" → "R-000006": the record number the guard named (numbers only, never people). */
const refIn = (e: { message?: string }) => /\(([A-Z]-\d{6,})\)/.exec(e.message ?? '')?.[1] ?? null

export function mapOperationGuard(e: unknown): never {
  if (e instanceof AppError) throw e
  const pg = ((e as { cause?: unknown }).cause ?? e) as { code?: string; constraint?: string; message?: string }
  const c = pg.constraint ?? ''
  const ref = refIn(pg)
  const at = ref ? ` (${ref})` : ''
  const busy = (message: string) => new AppError(409, 'VEHICLE_UNAVAILABLE', message, undefined, ref ? { refNo: ref } : undefined)
  if (c === 'maintenance_vehicle_reserved') throw busy(`Bu dönemde araç için onaylı rezervasyon var${at}. Bakım çakışan bir taahhüt oluşturamaz; tarihi değiştirin veya planı onay bekleyen olarak kaydedin.`)
  if (c === 'maintenance_vehicle_rented') throw busy(`Araç bu dönemde kirada veya kiralama için ayrılmış${at}.`)
  if (c === 'maintenance_vehicle_overlap') throw busy(`Araç için bu dönemde başka bir bakım var${at}.`)
  if (c === 'maintenance_vehicle_transfer') throw busy(`Araç bu dönemde şubeler arası transferde${at}.`)
  if (c === 'transfers_vehicle_reserved') throw busy(`Transfer süresince araç için onaylı rezervasyon var${at}. Rezervasyon otomatik iptal edilmez.`)
  if (c === 'transfers_vehicle_rented') throw busy(`Araç bu dönemde kirada veya kiralama için ayrılmış${at}; transfer edilemez.`)
  if (c === 'transfers_vehicle_maintenance') throw busy(`Araç bu dönemde bakımda${at}; transfer edilemez.`)
  if (c === 'transfers_vehicle_overlap') throw busy(`Araç için bu dönemde başka bir transfer var${at}.`)
  if (c === 'transfers_vehicle_damaged')
    throw new AppError(409, 'VEHICLE_NOT_USABLE', `Araç kullanılamaz olarak işaretli${at}; normal transferle yola çıkarılamaz. Onarım için yalnız onarım amaçlı taşıma kullanılabilir.`, undefined, ref ? { refNo: ref } : undefined)
  if (c === 'vehicle_transfers_repair_damage') throw invalid({ damageFileId: 'Bu aracın açık bir hasar dosyasını seçin' })
  if (c === 'vehicle_transfers_transport_ack') throw invalid({ transportAck: 'Taşıma beyanı gerekli' }, 'Onarım amaçlı taşıma yalnız taşıma beyanıyla yola çıkar.')
  if (c === 'vehicle_transfers_purpose_check') throw invalid({ transportMethod: 'Onarım taşımasında hasar dosyası ve taşıma yöntemi zorunludur' })
  if (c === 'transfers_next_commitment_branch')
    throw new AppError(409, 'NEXT_COMMITMENT_ELSEWHERE', `Aracın varıştan sonraki ilk kaydı${at} başka bir şubeden başlıyor. Transfer bu kaydı sessizce geçersiz kılamaz; rezervasyon otomatik iptal edilmez.`, undefined, ref ? { refNo: ref } : undefined)
  if (c.endsWith('_lifecycle') || c.endsWith('_final')) throw new AppError(409, 'INVALID_TRANSITION', 'Kaydın durumu bu işleme izin vermiyor.')
  if (c.endsWith('_immutable') || c === 'vehicle_transfers_plan_frozen') throw new AppError(409, 'IMMUTABLE', 'Bu bilgi bu aşamada değiştirilemez.')
  if (c.endsWith('_vehicle_retired')) throw new AppError(409, 'VEHICLE_RETIRED', 'Araç artık filoda değil.', { vehicleId: 'Araç filoda değil' })
  if (c === 'maintenance_records_damage') throw invalid({ damageFileId: 'Hasar dosyası başka bir araca ait' })
  if (c === 'maintenance_records_plan_check' || c === 'vehicle_transfers_plan_check') throw invalid({ plannedEndLocal: 'Bitiş başlangıçtan sonra olmalı (en fazla 180 gün bakım, 30 gün transfer)' })
  if (c === 'maintenance_photos_limit' || c === 'damage_photos_limit') throw new AppError(409, 'PHOTO_LIMIT', 'Bir kayıtta en fazla 10 fotoğraf olabilir.')
  if (c === 'maintenance_photos_frozen' || c === 'damage_photos_frozen') throw new AppError(409, 'RECORD_CLOSED', 'Kapanmış kayda fotoğraf eklenemez veya kaldırılamaz.')
  if (c === 'damage_files_close_blocked') throw new AppError(409, 'CLOSE_BLOCKED', 'Engel açıkken hasar dosyası kapatılamaz. Önce yetkili kişi engeli gerekçesiyle kaldırmalı.')
  if (c === 'damage_files_source') throw invalid({ sourceMarkId: 'Bulgu bu kiralamanın kesinleşmiş bir kontrolüne ait değil' })
  if (c === 'damage_files_source_mark_key') throw new AppError(409, 'DUPLICATE_FINDING', 'Bu bulgu için zaten bir hasar dosyası var.')
  if (c === 'damage_files_future') throw invalid({ detectedLocal: 'Tespit zamanı gelecekte olamaz' })
  if (c === 'damage_blocks_four_eyes' || c.endsWith('_four_eyes')) throw new AppError(403, 'FOUR_EYES', 'Bu işlem ikinci bir yetkilinin onayını gerektirir; kendi talebinizi onaylayamazsınız.')
  if (c === 'damage_block_release_requests_open_key') throw new AppError(409, 'RELEASE_PENDING', 'Bu engel için zaten onay bekleyen bir kaldırma talebi var.')
  if (c === 'damage_block_release_requests_block') throw new AppError(409, 'NOT_BLOCKED', 'Engel artık açık değil.')
  if (c === 'vehicle_transfers_carrier_required') throw invalid({ carrierName: 'Taşıyıcı adını ve dış taşıma referansını girin' }, 'Onarım amaçlı taşımada taşıyıcı ve dış referans zorunludur.')
  if (c === 'transfer_photos_limit') throw new AppError(409, 'PHOTO_LIMIT', 'Bir kayıtta en fazla 10 fotoğraf olabilir.')
  if (c === 'transfer_photos_frozen') throw new AppError(409, 'RECORD_CLOSED', 'Yalnız açık onarım taşımasına fotoğraf eklenebilir.')
  if (c === 'damage_blocks_open_key') throw new AppError(409, 'ALREADY_BLOCKED', 'Bu hasar dosyası aracı zaten engelliyor.')
  if (c === 'damage_blocks_file') throw new AppError(409, 'RECORD_CLOSED', 'Kapanmış hasar dosyası aracı engelleyemez.')
  if (c === 'odometer_chronology') throw new AppError(422, 'ODOMETER_OUT_OF_ORDER', 'Kilometre aracın kayıtlı km geçmişiyle çelişiyor (geriye gidemez).', { km: 'Kilometre geçmişle çelişiyor' })
  if (c === 'transfer_arrival_km' || c === 'vehicle_transfers_km_check' || c === 'maintenance_records_km_check') throw invalid({ km: 'Varış veya bitiş kilometresi başlangıç kilometresinden düşük olamaz' })
  if (c === 'odometer_future' || c === 'location_future') throw invalid({ time: 'Gerçekleşen zaman gelecekte olamaz' })
  if (c.endsWith('_request_key')) throw new AppError(409, 'REQUEST_REPLAY', 'Bu istek zaten işlendi.')
  throw e
}
export const guarded = <T>(p: Promise<T>) => p.catch(mapOperationGuard)

// ---------------------------------------------------------------------------
// Evidence photos: content-checked, re-encoded without metadata, scanned, private, streamed after checks.

export function uploadPolicy(app: FastifyInstance) {
  const p = documentUploadPolicy(app.env, app.scanner)
  return { enabled: p.enabled, reason: p.enabled ? null : 'Fotoğraf yükleme kapalı: zararlı dosya taraması yapılandırılmamış.' }
}

/** Reads, cleans and scans the uploaded image outside any transaction, then stores it under the module's prefix. */
export async function receivePhoto(app: FastifyInstance, req: FastifyRequest, kind: 'maintenance' | 'damages' | 'transfers') {
  const policy = uploadPolicy(app)
  if (!policy.enabled) throw new AppError(409, 'UPLOADS_CLOSED', policy.reason!)
  if (!req.isMultipart()) throw new AppError(400, 'NO_FILE', 'Yüklenecek fotoğraf bulunamadı.')
  const part = await req.file()
  if (!part) throw new AppError(400, 'NO_FILE', 'Yüklenecek fotoğraf bulunamadı.')
  const image = await processPromoPhoto(await part.toBuffer())
  const scan = await app.scanner.scan(image.main)
  if (scan === 'infected') throw new AppError(422, 'MALWARE_DETECTED', 'Dosyada zararlı içerik bulundu; yükleme reddedildi.')
  if (scan !== 'clean') throw new AppError(503, 'SCANNER_UNAVAILABLE', 'Zararlı dosya taraması şu an yapılamıyor; yükleme yapılmadı. Daha sonra tekrar deneyin.')
  const keys = app.storage.newOperationPhotoKeys(req.auth!.session.activeCompanyId!, kind)
  await app.storage.put(keys.main, image.main)
  await app.storage.put(keys.thumb, image.thumb)
  return { image, keys }
}

export async function insertFile(tx: Tx, companyId: string, kind: 'maintenance_photo' | 'damage_photo' | 'transfer_photo', p: Awaited<ReturnType<typeof receivePhoto>>, userId: string) {
  const r = (
    await tx.execute(sql`insert into files (company_id, kind, storage_key, thumb_key, mime_type, size_bytes, width, height, sha256, uploaded_by)
      values (${companyId}, ${kind}, ${p.keys.main}, ${p.keys.thumb}, 'image/webp', ${p.image.main.length}, ${p.image.width}, ${p.image.height}, ${p.image.sha256}, ${userId}) returning id`)
  ).rows[0] as Row
  return r.id as string
}

export async function loadPhotos(tx: Tx, table: 'maintenance_photos' | 'damage_photos' | 'transfer_photos', fk: 'maintenance_id' | 'damage_id' | 'transfer_id', recordId: string, base: string): Promise<OperationPhoto[]> {
  const rows = (
    await tx.execute(sql`select p.id, p.created_at, u.name as by_name from ${sql.identifier(table)} p left join users u on u.id = p.created_by
      where p.${sql.identifier(fk)} = ${recordId} and p.removed_at is null order by p.created_at`)
  ).rows as Row[]
  return rows.map((r) => ({
    id: r.id as string,
    url: `${base}/${r.id as string}`,
    thumbUrl: `${base}/${r.id as string}?variant=thumb`,
    createdAt: toIso(r.created_at),
    createdByName: str(r.by_name),
  }))
}

export async function streamFile(app: FastifyInstance, reply: FastifyReply, file: Row, variant: 'main' | 'thumb') {
  const { stream, size } = await app.storage.open(variant === 'thumb' ? (file.thumb_key as string) : (file.storage_key as string))
  return reply
    .header('content-type', 'image/webp')
    .header('content-length', size)
    .header('cache-control', 'private, no-store, max-age=0')
    .header('pragma', 'no-cache')
    .header('vary', 'Cookie')
    .header('content-disposition', 'inline')
    .send(stream)
}
