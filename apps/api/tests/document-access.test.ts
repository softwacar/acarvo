import { rm } from 'node:fs/promises'
import type { VehicleDocumentDetail } from '@acarvo/shared'
import type { FastifyInstance } from 'fastify'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase, TEST_STORAGE } from './helpers'

// Document files are served only after an explicit, CSRF-checked request inside ACARVO (docs §8.4.4):
// POST /api/document-files/:id/access → server-side grant (session + company + file + purpose) → GET streams the file.
// The GET never writes audit entries; the POST is audited as "requested".

let data: DevData
let app: FastifyInstance
let adnan: Client
let selma: Client
let lejla: Client
let pdf: VehicleDocumentDetail['files'][number]
let jpg: VehicleDocumentDetail['files'][number]
let vehicleId: string

async function cleanPdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([400, 300]).drawText('ACARVO TEST BELGESI', { x: 40, y: 150, size: 14, font })
  return Buffer.from(await doc.save())
}
const photo = () => sharp({ create: { width: 600, height: 400, channels: 3, background: { r: 30, g: 90, b: 160 } } }).jpeg().toBuffer()
const auditCount = async () => Number((await asOwner(data.companies.drina, `select count(*) n from audit_log where action like 'vehicle.document.%'`)).rows[0].n)
const grant = (c: Client, fileId: string, mode: string, headers?: Record<string, string>) => c.post(`/api/document-files/${fileId}/access`, { mode }, headers)

beforeAll(async () => {
  await rm(TEST_STORAGE, { recursive: true, force: true })
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  selma = new Client(app)
  lejla = new Client(app)
  for (const [c, e] of [[adnan, EMAILS.adnan], [selma, EMAILS.selma], [lejla, EMAILS.lejla]] as const) expect((await c.login(e)).statusCode).toBe(200)
  // A12-K-345 is at Sarajevo Aerodrom (SJJ), inside Selma's branch.
  vehicleId = ((await adnan.get('/api/vehicles?q=A12-K-345')).json().items as { id: string }[])[0]!.id
  const doc = (await adnan.post(`/api/vehicles/${vehicleId}/documents`, { typeCode: 'registration', state: 'active' })).json() as VehicleDocumentDetail
  expect((await adnan.upload(`/api/vehicles/${vehicleId}/documents/${doc.id}/files`, await cleanPdf(), 'ruhsat.pdf', 'application/pdf')).statusCode).toBe(201)
  const withImage = await adnan.upload(`/api/vehicles/${vehicleId}/documents/${doc.id}/files`, await photo(), 'ruhsat.jpg', 'image/jpeg')
  expect(withImage.statusCode).toBe(201)
  const files = (withImage.json() as VehicleDocumentDetail).files
  jpg = files.find((f) => f.mimeType === 'image/jpeg')!
  pdf = files.find((f) => f.mimeType === 'application/pdf')!
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
  await rm(TEST_STORAGE, { recursive: true, force: true })
})

describe('document file access grants', () => {
  it('a direct file address without a grant is refused and writes nothing', async () => {
    const before = await auditCount()
    for (const url of [pdf.url, pdf.downloadUrl, `${jpg.url}?onizleme=1`]) {
      const res = await adnan.get(url)
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('ACCESS_GRANT_REQUIRED')
    }
    expect(await auditCount()).toBe(before)
  })

  it('the grant request is audited as requested and returns an address without any token', async () => {
    const before = await auditCount()
    const g = await grant(adnan, pdf.id, 'view')
    expect(g.statusCode).toBe(200)
    expect(g.json().url).toBe(`/api/document-files/${pdf.id}`)
    expect(Date.parse(g.json().expiresAt)).toBeGreaterThan(Date.now())
    expect((await grant(adnan, pdf.id, 'download')).json().url).toBe(`/api/document-files/${pdf.id}?indir=1`)
    const log = await asOwner(data.companies.drina, `select action, summary from audit_log where action like 'vehicle.document.%' order by created_at desc limit 2`)
    expect(log.rows.map((r) => r.action).sort()).toEqual(['vehicle.document.download_request', 'vehicle.document.view_request'])
    expect(log.rows[0].summary).toMatchObject({ fileId: pdf.id, plate: 'A12-K-345' })
    expect(await auditCount()).toBe(before + 2)
  })

  it('the PDF viewer may ask again: every GET is served, no GET adds an audit entry', async () => {
    await grant(adnan, pdf.id, 'view')
    const before = await auditCount()
    for (let i = 0; i < 3; i++) {
      const res = await adnan.get(pdf.url)
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/pdf')
      expect(res.headers['cache-control']).toBe('private, no-store, max-age=0')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toContain('sandbox')
      expect(res.headers['content-disposition']).toMatch(/^inline; filename="A12-K-345_ruhsat_/)
    }
    expect(await auditCount()).toBe(before)
  })

  it('a grant is bound to its purpose: view does not allow download; previews are for images only', async () => {
    // Selma (same branch, read permission) has no grants yet. Sign-in is rate limited, so existing sessions are reused.
    const fresh = selma
    await grant(fresh, pdf.id, 'view')
    expect((await fresh.get(pdf.downloadUrl)).statusCode).toBe(403)
    expect((await fresh.get(`${pdf.url}?onizleme=1`)).statusCode).toBe(403)
    const noPreview = await grant(fresh, pdf.id, 'preview')
    expect(noPreview.statusCode).toBe(400)
    const p = await grant(fresh, jpg.id, 'preview')
    expect(p.json().url).toBe(`/api/document-files/${jpg.id}?onizleme=1`)
    expect((await fresh.get(p.json().url)).statusCode).toBe(200)
    expect((await fresh.get(jpg.url)).statusCode).toBe(403)
    const log = await asOwner(data.companies.drina, `select action from audit_log where action like 'vehicle.document.%' order by created_at desc limit 1`)
    expect(log.rows[0].action).toBe('vehicle.document.preview_request')
  })

  it('a link from another site is refused by Fetch Metadata and cannot create an audit entry', async () => {
    await grant(adnan, pdf.id, 'view')
    const before = await auditCount()
    for (const site of ['cross-site', 'same-site']) {
      const res = await adnan.request('GET', pdf.url, undefined, { 'sec-fetch-site': site, 'sec-fetch-mode': 'navigate' })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('CROSS_SITE_REQUEST')
    }
    // The grant request itself cannot be forged from another site: CSRF token and Origin are required.
    const forged = new Client(app, 'https://kotu-site.example')
    forged.jar = new Map(adnan.jar)
    forged.csrf = adnan.csrf
    expect((await grant(forged, pdf.id, 'view')).statusCode).toBe(403)
    const noToken = new Client(app)
    noToken.jar = new Map(adnan.jar)
    expect((await grant(noToken, pdf.id, 'view')).statusCode).toBe(403)
    expect(await auditCount()).toBe(before)
    // The same browser's own request still works.
    expect((await adnan.request('GET', pdf.url, undefined, { 'sec-fetch-site': 'same-origin' })).statusCode).toBe(200)
  })

  it("another user's or another session's grant cannot be used", async () => {
    await grant(adnan, jpg.id, 'view')
    expect((await selma.get(jpg.url)).statusCode).toBe(403)
    const secondSession = new Client(app)
    await secondSession.login(EMAILS.adnan)
    expect((await secondSession.get(jpg.url)).statusCode).toBe(403)
  })

  it('other companies and branches get 404 for the grant and the file', async () => {
    expect((await grant(lejla, pdf.id, 'view')).statusCode).toBe(404)
    expect((await lejla.get(pdf.url)).statusCode).toBe(404)
    const sac = ((await adnan.get('/api/vehicles?q=K71-J-904')).json().items as { id: string }[])[0]!.id
    const doc = (await adnan.post(`/api/vehicles/${sac}/documents`, { typeCode: 'other', state: 'active' })).json() as VehicleDocumentDetail
    const up = await adnan.upload(`/api/vehicles/${sac}/documents/${doc.id}/files`, await cleanPdf(), 'diger.pdf', 'application/pdf')
    const file = (up.json() as VehicleDocumentDetail).files[0]!
    expect((await grant(selma, file.id, 'view')).statusCode).toBe(404)
    expect((await selma.get(file.url)).statusCode).toBe(404)
  })

  it('switching company revokes earlier grants; switching back does not bring them back', async () => {
    const c = new Client(app)
    await c.login(EMAILS.adnan)
    await grant(c, pdf.id, 'view')
    expect((await c.get(pdf.url)).statusCode).toBe(200)
    expect((await c.post('/api/auth/switch-company', { companyId: data.companies.neretva })).statusCode).toBe(200)
    expect((await c.get(pdf.url)).statusCode).toBe(404)
    expect((await c.post('/api/auth/switch-company', { companyId: data.companies.drina })).statusCode).toBe(200)
    expect((await c.get(pdf.url)).statusCode).toBe(403)
  })

  it('signing out or closing all sessions ends the grant', async () => {
    const c = new Client(app)
    await c.login(EMAILS.adnan)
    await grant(c, pdf.id, 'view')
    const cookies = new Map(c.jar)
    expect((await c.post('/api/auth/logout')).statusCode).toBe(204)
    const stale = new Client(app)
    stale.jar = cookies
    expect((await stale.get(pdf.url)).statusCode).toBe(401)
    await c.login(EMAILS.adnan)
    expect((await c.get(pdf.url)).statusCode).toBe(403)
    await grant(c, pdf.id, 'view')
    expect((await c.post('/api/auth/sessions/revoke-all')).statusCode).toBe(204)
    expect(app.documentGrants.allows({ sessionId: 'x', companyId: 'y', fileId: pdf.id, mode: 'view' })).toBe(false)
    expect((await c.get(pdf.url)).statusCode).toBe(401)
  })

  it('the GET re-checks permissions: removing the read permission blocks an existing grant', async () => {
    const c = new Client(app)
    await c.login(EMAILS.selma)
    await grant(c, pdf.id, 'view')
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'vehicles.documents.read') where name = 'Operasyon'`)
    try {
      expect((await c.get(pdf.url)).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = permissions || array['vehicles.documents.read'] where name = 'Operasyon'`)
    }
    expect((await c.get(pdf.url)).statusCode).toBe(200)
  })
})

describe('grant lifetime', () => {
  it('an expired grant is refused', async () => {
    const short = await makeApp({ documentAccessTtlMs: 300 })
    try {
      const c = new Client(short)
      await c.login(EMAILS.adnan)
      await grant(c, pdf.id, 'view')
      expect((await c.get(pdf.url)).statusCode).toBe(200)
      await new Promise((r) => setTimeout(r, 450))
      const res = await c.get(pdf.url)
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('ACCESS_GRANT_REQUIRED')
    } finally {
      await short.close()
    }
  })
})
