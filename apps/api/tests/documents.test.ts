import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { addDays, todayIn, type VehicleDocumentDetail, type VehicleDocumentsResponse } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { PDFDocument, PDFHexString, PDFName, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { upgradePresetRoles } from '../src/db/role-upgrade'
import type { MalwareScanner, ScanResult } from '../src/lib/malware'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase, TEST_STORAGE } from './helpers'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../src/db/schema'

let data: DevData
let app: FastifyInstance
let adnan: Client
let lejla: Client
let selma: Client
const T = todayIn('Europe/Sarajevo')

// ---------------------------------------------------------------------------
// Fixtures

async function cleanPdf(pages = 1, text = 'ACARVO TEST BELGESI') {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) doc.addPage([400, 300]).drawText(`${text} ${i + 1}`, { x: 40, y: 150, size: 14, font })
  return Buffer.from(await doc.save())
}
/** JavaScript action, stored inside compressed object streams (not visible as plain text). */
async function jsPdf() {
  const doc = await PDFDocument.create()
  doc.addPage([400, 300])
  doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFHexString.fromText('app.alert(1)') }))
  return Buffer.from(await doc.save({ useObjectStreams: true }))
}
async function embeddedFilePdf() {
  const doc = await PDFDocument.create()
  doc.addPage([400, 300])
  await doc.attach(Buffer.from('MZ fake program'), 'arac.exe', { mimeType: 'application/octet-stream' })
  return Buffer.from(await doc.save())
}
function encryptedPdf() {
  return Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj',
      '2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj',
      '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>> endobj',
      '4 0 obj <</Filter/Standard/V 1/R 2/O(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)/U(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)/P -4>> endobj',
      'trailer <</Root 1 0 R/Encrypt 4 0 R/Size 5>>',
      '%%EOF',
    ].join('\n'),
    'latin1',
  )
}
async function gpsJpeg() {
  return sharp({ create: { width: 900, height: 600, channels: 3, background: '#ddd' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Gizli Sahip' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '43/1 51/1 2400/100' } })
    .toBuffer()
}

const idOf = async (c: Client, plate: string) => (await c.get(`/api/vehicles?q=${encodeURIComponent(plate)}`)).json().items[0].id as string
const list = async (c: Client, vehicleId: string) => {
  const r = await c.get(`/api/vehicles/${vehicleId}/documents`)
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as VehicleDocumentsResponse
}
const detail = async (c: Client, vehicleId: string, docId: string) => (await c.get(`/api/vehicles/${vehicleId}/documents/${docId}`)).json() as VehicleDocumentDetail
async function create(c: Client, vehicleId: string, body: Record<string, unknown>) {
  const r = await c.post(`/api/vehicles/${vehicleId}/documents`, body)
  expect(r.statusCode, r.body).toBe(201)
  return r.json() as VehicleDocumentDetail
}
const upload = (c: Client, vehicleId: string, docId: string, file: Buffer, name = 'belge.pdf', type = 'application/pdf') =>
  c.upload(`/api/vehicles/${vehicleId}/documents/${docId}/files`, file, name, type)
async function storedDocuments() {
  let n = 0
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(path.join(dir, e.name))
      else n++
    }
  }
  await walk(path.join(TEST_STORAGE, 'documents'))
  return n
}
const fakeScanner = (result: ScanResult | (() => Promise<ScanResult>), name = 'clamav'): MalwareScanner => ({
  name,
  scan: typeof result === 'function' ? result : async () => result,
})

beforeAll(async () => {
  await rm(TEST_STORAGE, { recursive: true, force: true })
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  lejla = new Client(app)
  selma = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
  await rm(TEST_STORAGE, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------

describe('types and company decisions', () => {
  it('lists the six system types; required only where the company decided so', async () => {
    const drina = await list(adnan, await idOf(adnan, 'A12-K-345'))
    expect(drina.types.map((t) => t.code)).toEqual(['registration', 'inspection', 'liability_insurance', 'comprehensive_insurance', 'roadside_assistance', 'other'])
    expect(drina.types.filter((t) => t.required).map((t) => t.code)).toEqual(['registration', 'inspection', 'liability_insurance'])
    expect(drina.types.find((t) => t.code === 'inspection')!.summary).toMatchObject({ state: 'missing', level: 'critical' })
    expect(drina.types.find((t) => t.code === 'comprehensive_insurance')!.summary).toMatchObject({ state: 'none', level: 'neutral' })
    const neretva = await list(lejla, await idOf(lejla, 'M21-O-650'))
    expect(neretva.types.every((t) => !t.required)).toBe(true)
    expect(neretva.overview.critical).toBe(0)
    expect(drina.upload).toEqual({ enabled: true, scanner: 'none', reason: null })
  })

  it('preset roles of existing companies get the read permission, safely and only once', async () => {
    const owner = drizzle(ownerPool, { schema })
    const v1Sahip = ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.documents.manage', 'vehicles.photos.manage', 'branches.read', 'users.read', 'roles.read', 'audit.read']
    // Drina as it was before this module: v1 Sahip; an edited Yönetici; a custom role with a preset-like set.
    await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Sahip'`, [v1Sahip])
    await asOwner(data.companies.drina, `update roles set permissions = array['vehicles.read','branches.read','users.read'] where name = 'Yönetici'`)
    await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Muhasebe', array['vehicles.read','vehicles.documents.manage','vehicles.photos.manage','branches.read'])`, [data.companies.drina])
    const before = (await asOwner(null, `select (select count(*) from users) u, (select count(*) from companies) c`)).rows[0]
    try {
      const first = await upgradePresetRoles(owner)
      expect(first.filter((r) => r.company === 'Drina Rent a Car')).toEqual([{ company: 'Drina Rent a Car', role: 'Sahip', added: ['vehicles.documents.read'] }])
      expect(await upgradePresetRoles(owner)).toEqual([])
      const roles = (await asOwner(data.companies.drina, `select name, permissions from roles order by name`)).rows as { name: string; permissions: string[] }[]
      expect(roles.find((r) => r.name === 'Sahip')!.permissions.sort()).toEqual([...v1Sahip, 'vehicles.documents.read'].sort())
      expect(roles.find((r) => r.name === 'Yönetici')!.permissions).toEqual(['vehicles.read', 'branches.read', 'users.read'])
      expect(roles.find((r) => r.name === 'Muhasebe')!.permissions).not.toContain('vehicles.documents.read')
      expect((await asOwner(null, `select (select count(*) from users) u, (select count(*) from companies) c`)).rows[0]).toEqual(before)
      const log = await asOwner(data.companies.drina, `select summary from audit_log where action = 'role.preset_upgrade'`)
      expect(log.rows).toHaveLength(1)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = $1 where name = 'Sahip'`, [[...v1Sahip, 'vehicles.documents.read']])
      await asOwner(data.companies.drina, `update roles set permissions = array['vehicles.read','vehicles.create','vehicles.update','vehicles.documents.read','vehicles.documents.manage','vehicles.photos.manage','branches.read','users.read'] where name = 'Yönetici'`)
    }
  })

  it('the read permission is enforced for existing roles', async () => {
    const id = await idOf(adnan, 'A12-K-345')
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'vehicles.documents.read') where name = 'Sahip'`)
    try {
      expect((await adnan.get(`/api/vehicles/${id}/documents`)).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = permissions || '{vehicles.documents.read}' where name = 'Sahip'`)
    }
    expect((await adnan.get(`/api/vehicles/${id}/documents`)).statusCode).toBe(200)
  })
})

describe('records, drafts and corrections', () => {
  it('an active period of an expiring type needs an end date; a draft does not', async () => {
    const id = await idOf(adnan, 'E45-M-218')
    const bad = await adnan.post(`/api/vehicles/${id}/documents`, { typeCode: 'inspection', state: 'active' })
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.fields.validUntil).toBeDefined()
    const draft = await create(adnan, id, { typeCode: 'inspection', state: 'draft', documentNumber: 'M-001' })
    expect(draft.status).toMatchObject({ status: 'draft', draftReason: 'missing_expiry', noFile: true })
    expect((await adnan.post(`/api/vehicles/${id}/documents/${draft.id}/activate`, { version: draft.version })).statusCode).toBe(400)
    const fixed = (await adnan.put(`/api/vehicles/${id}/documents/${draft.id}`, { documentNumber: 'M-001', validFrom: addDays(T, -10), validUntil: addDays(T, 355), version: draft.version })).json()
    const act = await adnan.post(`/api/vehicles/${id}/documents/${draft.id}/activate`, { version: fixed.version })
    expect(act.statusCode, act.body).toBe(200)
    expect(act.json()).toMatchObject({ recordState: 'active', status: { status: 'valid', noFile: true } })
  })

  it('edits use the version number and are recorded with old and new values', async () => {
    const id = await idOf(adnan, 'E45-M-218')
    const d = await create(adnan, id, { typeCode: 'registration', documentNumber: 'R-1' })
    const ok = await adnan.put(`/api/vehicles/${id}/documents/${d.id}`, { documentNumber: 'R-2', version: d.version })
    expect(ok.statusCode).toBe(200)
    const stale = await adnan.put(`/api/vehicles/${id}/documents/${d.id}`, { documentNumber: 'R-3', version: d.version })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('VERSION_CONFLICT')
    const log = await asOwner(data.companies.drina, `select summary from audit_log where action = 'vehicle.document.update' and summary->>'documentId' = $1`, [d.id])
    expect(log.rows[0].summary.changes).toEqual({ documentNumber: ['R-1', 'R-2'] })
  })
})

describe('renewal', () => {
  it('a policy starting in the future does not end the current one early', async () => {
    const id = await idOf(adnan, 'K71-J-904')
    const current = await create(adnan, id, { typeCode: 'liability_insurance', documentNumber: 'P-2025', validFrom: addDays(T, -355), validUntil: addDays(T, 10) })
    expect((await list(adnan, id)).types.find((t) => t.code === 'liability_insurance')!.summary).toMatchObject({ state: 'expiring', level: 'warning', currentId: current.id })

    const r = await adnan.post(`/api/vehicles/${id}/documents/${current.id}/renew`, { documentNumber: 'P-2026', validFrom: addDays(T, 11), validUntil: addDays(T, 376) })
    expect(r.statusCode, r.body).toBe(201)
    const next = r.json() as VehicleDocumentDetail
    expect(next).toMatchObject({ renewsId: current.id, recordState: 'active', status: { status: 'not_started' } })

    const row = (await list(adnan, id)).types.find((t) => t.code === 'liability_insurance')!.summary
    expect(row).toMatchObject({ state: 'renewed', level: 'ok', currentId: current.id, nextId: next.id, nextStartsOn: addDays(T, 11) })
    const old = await detail(adnan, id, current.id)
    expect(old).toMatchObject({ recordState: 'active', validUntil: addDays(T, 10), renewedById: next.id, status: { status: 'expiring' } })
    expect(old.chain.map((c) => c.id)).toEqual([current.id, next.id])
  })

  it('renewal is atomic: the same period cannot be renewed twice, even at the same moment', async () => {
    const id = await idOf(adnan, 'A84-O-352')
    const current = await create(adnan, id, { typeCode: 'inspection', validFrom: addDays(T, -300), validUntil: addDays(T, 60) })
    const body = { validFrom: addDays(T, 61), validUntil: addDays(T, 426) }
    const [a, b] = await Promise.all([
      adnan.post(`/api/vehicles/${id}/documents/${current.id}/renew`, body),
      adnan.post(`/api/vehicles/${id}/documents/${current.id}/renew`, body),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409])
    expect((await list(adnan, id)).documents.filter((d) => d.typeCode === 'inspection')).toHaveLength(2)
    const earlier = await adnan.post(`/api/vehicles/${id}/documents/${current.id}/renew`, { validUntil: addDays(T, 30) })
    expect(earlier.statusCode).toBe(409)
  })

  it('a renewal must end after the period it renews', async () => {
    const id = await idOf(adnan, 'A84-O-352')
    const d = await create(adnan, id, { typeCode: 'roadside_assistance', validUntil: addDays(T, 100) })
    const r = await adnan.post(`/api/vehicles/${id}/documents/${d.id}/renew`, { validFrom: addDays(T, 50), validUntil: addDays(T, 90) })
    expect(r.statusCode).toBe(400)
    expect(r.json().error.fields.validUntil).toBeDefined()
  })
})

describe('files and history', () => {
  it('stores clean PDF and image versions; images lose EXIF and GPS; earlier versions stay readable', async () => {
    const id = await idOf(adnan, 'M62-A-238')
    const d = await create(adnan, id, { typeCode: 'registration', documentNumber: 'BA-123' })
    const v1 = await upload(adnan, id, d.id, await cleanPdf(2), 'ruhsat.pdf')
    expect(v1.statusCode, v1.body).toBe(201)
    const v2 = await upload(adnan, id, d.id, await gpsJpeg(), 'ruhsat-foto.jpg', 'image/jpeg')
    expect(v2.statusCode, v2.body).toBe(201)
    const det = v2.json() as VehicleDocumentDetail
    expect(det.files.map((f) => [f.versionNo, f.mimeType, f.pageCount])).toEqual([
      [2, 'image/jpeg', null],
      [1, 'application/pdf', 2],
    ])
    const img = await adnan.get(det.files[0]!.url)
    expect(img.statusCode).toBe(200)
    const meta = await sharp(img.rawPayload).metadata()
    expect(meta.exif).toBeUndefined()
    expect(img.rawPayload.toString('latin1')).not.toContain('Gizli Sahip')
    const pdf = await adnan.get(det.files[1]!.downloadUrl)
    expect(pdf.statusCode).toBe(200)
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('serves files with no-store, nosniff, a sandbox policy and a server-made file name', async () => {
    const id = await idOf(adnan, 'M62-A-238')
    const d = (await list(adnan, id)).documents.find((x) => x.typeCode === 'registration')!
    const view = await adnan.get(d.latestFile!.url)
    expect(view.headers['cache-control']).toBe('private, no-store, max-age=0')
    expect(view.headers['x-content-type-options']).toBe('nosniff')
    expect(view.headers['content-security-policy']).toContain('sandbox')
    expect(view.headers['content-disposition']).toMatch(/^inline; filename="M62-A-238_ruhsat_\d{4}-\d{2}-\d{2}_v2\.jpg"$/)
    const dl = await adnan.get(d.latestFile!.downloadUrl)
    expect(dl.headers['content-disposition']).toMatch(/^attachment; /)
    const log = await asOwner(data.companies.drina, `select action from audit_log where action in ('vehicle.document.view','vehicle.document.download')`)
    expect(new Set(log.rows.map((r) => r.action))).toEqual(new Set(['vehicle.document.view', 'vehicle.document.download']))
  })

  it('rejects disguised, active, encrypted, embedded-file and oversized documents', async () => {
    const id = await idOf(adnan, 'M62-A-238')
    const d = (await list(adnan, id)).documents.find((x) => x.typeCode === 'registration')!
    const before = await storedDocuments()
    const html = Buffer.from('<html><script>alert(1)</script></html>')
    const cases: [Buffer, string, string, number, string][] = [
      [html, 'ruhsat.pdf', 'application/pdf', 415, 'UNSUPPORTED_DOCUMENT'],
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'a.png', 'image/png', 415, 'UNSUPPORTED_DOCUMENT'],
      [await jsPdf(), 'js.pdf', 'application/pdf', 415, 'ACTIVE_PDF'],
      [await embeddedFilePdf(), 'ek.pdf', 'application/pdf', 415, 'ACTIVE_PDF'],
      [encryptedPdf(), 'sifreli.pdf', 'application/pdf', 415, 'ENCRYPTED_PDF'],
      [await cleanPdf(51), 'uzun.pdf', 'application/pdf', 415, 'UNSUPPORTED_DOCUMENT'],
      [Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(21 * 1024 * 1024, 32)]), 'buyuk.pdf', 'application/pdf', 413, 'FILE_TOO_LARGE'],
    ]
    for (const [file, name, type, status, code] of cases) {
      const r = await upload(adnan, id, d.id, file, name, type)
      expect(r.statusCode, `${name}: ${r.body}`).toBe(status)
      expect(r.json().error.code, name).toBe(code)
    }
    expect(await storedDocuments()).toBe(before)
    expect((await detail(adnan, id, d.id)).fileCount).toBe(2)
  })

  it('a failed upload after the file was stored leaves the document and its files unchanged', async () => {
    const id = await idOf(adnan, 'E16-T-093')
    const d = await create(adnan, id, { typeCode: 'comprehensive_insurance', validFrom: addDays(T, -10), validUntil: addDays(T, 300) })
    expect((await upload(adnan, id, d.id, await cleanPdf())).statusCode).toBe(201)
    const before = await detail(adnan, id, d.id)
    const storedBefore = await storedDocuments()
    // The database step fails after the file reached storage: the scanner hook makes the version insert collide.
    const sabotage = makeApp({
      scanner: fakeScanner(async () => {
        await asOwner(data.companies.drina, `alter table vehicle_document_files add constraint tmp_block check (version_no < 2) not valid`)
        return 'clean'
      }),
    })
    const app2 = await sabotage
    const c = new Client(app2)
    await c.login(EMAILS.adnan)
    try {
      const r = await upload(c, id, d.id, await cleanPdf(1, 'YENI SURUM'))
      expect(r.statusCode).toBeGreaterThanOrEqual(400)
    } finally {
      await asOwner(null, `alter table vehicle_document_files drop constraint if exists tmp_block`)
      await app2.close()
    }
    const after = await detail(adnan, id, d.id)
    expect(after).toMatchObject({ fileCount: before.fileCount, version: before.version, recordState: 'active', status: before.status })
    expect(after.files.map((f) => f.id)).toEqual(before.files.map((f) => f.id))
    expect(await storedDocuments()).toBe(storedBefore)
    expect((await adnan.get(before.files[0]!.url)).statusCode).toBe(200)
  })

  it('voiding keeps the record and its files; a voided period cannot be changed', async () => {
    const id = await idOf(adnan, 'E16-T-093')
    const d = await create(adnan, id, { typeCode: 'other', documentNumber: 'YANLIS' })
    expect((await upload(adnan, id, d.id, await cleanPdf())).statusCode).toBe(201)
    const fresh = await detail(adnan, id, d.id)
    expect((await adnan.post(`/api/vehicles/${id}/documents/${d.id}/void`, { version: fresh.version, reason: 'x' })).statusCode).toBe(400)
    const v = await adnan.post(`/api/vehicles/${id}/documents/${d.id}/void`, { version: fresh.version, reason: 'Yanlış araca yüklendi' })
    expect(v.statusCode).toBe(200)
    expect(v.json()).toMatchObject({ recordState: 'voided', voidedReason: 'Yanlış araca yüklendi', status: { status: 'voided' }, fileCount: 1 })
    expect((await adnan.get(fresh.files[0]!.url)).statusCode).toBe(200)
    expect((await adnan.put(`/api/vehicles/${id}/documents/${d.id}`, { documentNumber: 'X', version: fresh.version + 1 })).statusCode).toBe(409)
    expect((await upload(adnan, id, d.id, await cleanPdf())).statusCode).toBe(409)
  })
})

describe('malware scanning condition', () => {
  it('production without a scanner refuses uploads; viewing still works', async () => {
    const prod = await makeApp({ nodeEnv: 'production' })
    const c = new Client(prod)
    await c.login(EMAILS.adnan)
    try {
      const id = await idOf(c, 'M62-A-238')
      const docs = (await c.get(`/api/vehicles/${id}/documents`)).json() as VehicleDocumentsResponse
      expect(docs.upload).toMatchObject({ enabled: false, scanner: 'none' })
      const d = docs.documents.find((x) => x.typeCode === 'registration')!
      const before = await storedDocuments()
      const r = await upload(c, id, d.id, await cleanPdf())
      expect(r.statusCode).toBe(503)
      expect(r.json().error.code).toBe('UPLOADS_DISABLED')
      expect(await storedDocuments()).toBe(before)
      expect((await c.get(d.latestFile!.url)).statusCode).toBe(200)
    } finally {
      await prod.close()
    }
  })

  it('an infected or unreachable scan stores nothing; a clean scan in production is accepted', async () => {
    const id = await idOf(adnan, 'M62-A-238')
    const d = (await list(adnan, id)).documents.find((x) => x.typeCode === 'registration')!
    for (const [result, status, code] of [['infected', 422, 'MALWARE_DETECTED'], ['unavailable', 503, 'SCANNER_UNAVAILABLE']] as const) {
      const a = await makeApp({ nodeEnv: 'production', scanner: fakeScanner(result) })
      const c = new Client(a)
      await c.login(EMAILS.adnan)
      const before = await storedDocuments()
      const r = await upload(c, id, d.id, await cleanPdf())
      expect(r.statusCode, result).toBe(status)
      expect(r.json().error.code).toBe(code)
      expect(await storedDocuments()).toBe(before)
      await a.close()
    }
    expect((await detail(adnan, id, d.id)).fileCount).toBe(2)
    const ok = await makeApp({ nodeEnv: 'production', scanner: fakeScanner('clean') })
    const c = new Client(ok)
    await c.login(EMAILS.adnan)
    expect((await upload(c, id, d.id, await cleanPdf())).statusCode).toBe(201)
    await ok.close()
  })
})

describe('isolation', () => {
  let nVehicle: string
  let nDoc: VehicleDocumentDetail
  beforeAll(async () => {
    nVehicle = await idOf(lejla, 'M21-O-650')
    nDoc = await create(lejla, nVehicle, { typeCode: 'inspection', validUntil: addDays(T, 200) })
    nDoc = (await upload(lejla, nVehicle, nDoc.id, await cleanPdf())).json()
  })

  it('Drina cannot see or change Neretva documents, even knowing ids and file addresses', async () => {
    const file = nDoc.files[0]!
    const attempts = [
      adnan.get(`/api/vehicles/${nVehicle}/documents`),
      adnan.get(`/api/vehicles/${nVehicle}/documents/${nDoc.id}`),
      adnan.get(file.url),
      adnan.get(file.downloadUrl),
      adnan.put(`/api/vehicles/${nVehicle}/documents/${nDoc.id}`, { documentNumber: 'X', version: nDoc.version }),
      adnan.post(`/api/vehicles/${nVehicle}/documents/${nDoc.id}/renew`, { validUntil: addDays(T, 600) }),
      adnan.post(`/api/vehicles/${nVehicle}/documents/${nDoc.id}/void`, { version: nDoc.version, reason: 'Deneme saldırısı' }),
      upload(adnan, nVehicle, nDoc.id, await cleanPdf()),
    ]
    for (const r of await Promise.all(attempts)) {
      expect(r.statusCode, r.body).toBe(404)
      expect(r.body).not.toContain('%PDF')
    }
    const own = await idOf(adnan, 'A12-K-345')
    expect((await adnan.get(`/api/vehicles/${own}/documents/${nDoc.id}`)).statusCode).toBe(404)
    expect((await detail(lejla, nVehicle, nDoc.id)).fileCount).toBe(1)
  })

  it('a branch-limited user cannot reach documents of vehicles outside their branches', async () => {
    const sac = await idOf(adnan, 'T09-A-781')
    const d = await create(adnan, sac, { typeCode: 'registration' })
    const f = (await upload(adnan, sac, d.id, await cleanPdf())).json() as VehicleDocumentDetail
    expect((await selma.get(`/api/vehicles/${sac}/documents`)).statusCode).toBe(404)
    expect((await selma.get(f.files[0]!.url)).statusCode).toBe(404)
    expect((await selma.post(`/api/vehicles/${sac}/documents`, { typeCode: 'other' })).statusCode).toBe(404)
    const sjj = await idOf(selma, 'A39-T-657')
    expect((await selma.get(`/api/vehicles/${sjj}/documents`)).statusCode).toBe(200)
    expect((await selma.post(`/api/vehicles/${sjj}/documents`, { typeCode: 'other' })).statusCode).toBe(201)
  })

  it('no session, no file; no CSRF token, no change', async () => {
    expect((await new Client(app).get(nDoc.files[0]!.url)).statusCode).toBe(401)
    const c = new Client(app)
    await c.login(EMAILS.lejla)
    c.csrf = undefined
    expect((await c.post(`/api/vehicles/${nVehicle}/documents`, { typeCode: 'other' })).statusCode).toBe(403)
  })

  it('the database role cannot delete documents or rewrite files, and voided periods are fixed', async () => {
    await expect(asApp(data.companies.neretva, (c) => c.query('delete from vehicle_documents'))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.neretva, (c) => c.query(`update document_files set storage_key = 'x'`))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.neretva, (c) => c.query(`update vehicle_document_files set version_no = 9`))).rejects.toThrow(/permission denied/)
    await expect(asApp(data.companies.neretva, (c) => c.query('delete from document_files'))).rejects.toThrow(/permission denied/)
    const voided = (await asOwner(data.companies.drina, `select id from vehicle_documents where record_state = 'voided' limit 1`)).rows[0].id
    await expect(asApp(data.companies.drina, (c) => c.query(`update vehicle_documents set notes = 'x' where id = $1`, [voided]))).rejects.toThrow(/voided document cannot be changed/)
    const other = await idOf(adnan, 'A12-K-345')
    await expect(
      asApp(data.companies.drina, (c) =>
        c.query(`insert into vehicle_documents (company_id, vehicle_id, type_code, record_state, renews_id) values ($1, $2, 'inspection', 'draft', $3)`, [data.companies.drina, other, voided]),
      ),
    ).rejects.toThrow(/renewal must follow/)
    expect(await asApp(null, async (c) => (await c.query('select count(*)::int n from vehicle_documents')).rows[0].n)).toBe(0)
  })
})
