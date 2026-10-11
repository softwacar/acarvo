import { createHash } from 'node:crypto'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { PDFDocument, PDFHexString, PDFName, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { customerCryptoFromEnv } from '../src/lib/customer-crypto'
import type { MalwareScanner, ScanResult } from '../src/lib/malware'
import { appPool, asOwner, Client, type DevData, EMAILS, env, makeApp, ownerPool, resetDatabase, TEST_STORAGE } from './helpers'

// M2d: encrypted customer document files, separate view / download / reveal permissions, grants and limits.

let data: DevData
let app: FastifyInstance
let adnan: Client // Drina Sahip
let selma: Client // Drina Operasyon
let lejla: Client // Neretva Sahip
let manager: Client // Drina Yönetici (synthetic extra user)
const crypto = customerCryptoFromEnv(env).crypto!
const fakeScanner = (result: ScanResult, name = 'clamav'): MalwareScanner => ({ name, scan: async () => result })

let ajla: string
let doc: { id: string; version: number }

const jpegWithExif = () =>
  sharp({ create: { width: 640, height: 400, channels: 3, background: { r: 30, g: 90, b: 200 } } })
    .jpeg({ quality: 85 })
    .withExif({ IFD0: { Copyright: 'GPS-SECRET-TEST', Artist: 'Konum Bilgisi' } })
    .toBuffer()
const png = () => sharp({ create: { width: 500, height: 320, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer()
async function pdf(pages = 1) {
  const d = await PDFDocument.create()
  const font = await d.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) d.addPage([400, 300]).drawText(`ACARVO TEST KIMLIK ${i + 1}`, { x: 40, y: 150, size: 14, font })
  return Buffer.from(await d.save())
}
async function jsPdf() {
  const d = await PDFDocument.create()
  d.addPage([400, 300])
  d.catalog.set(PDFName.of('OpenAction'), d.context.obj({ Type: 'Action', S: 'JavaScript', JS: PDFHexString.fromText('app.alert(1)') }))
  return Buffer.from(await d.save({ useObjectStreams: true }))
}
async function storedFiles() {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) await walk(p)
      else out.push(p)
    }
  }
  await walk(path.join(TEST_STORAGE, 'customers'))
  return out
}
const upload = (c: Client, body: Buffer, side = 'front', name = 'kimlik.jpg', type = 'image/jpeg', docId = doc.id) => c.upload(`/api/customers/${ajla}/documents/${docId}/files?side=${side}`, body, name, type)
const open = async (c: Client, fileId: string, mode: 'view' | 'download') => {
  const grant = await c.post(`/api/customer-files/${fileId}/access`, { mode })
  if (grant.statusCode !== 200) return grant
  return c.get(grant.json().url)
}

beforeAll(async () => {
  await rm(TEST_STORAGE, { recursive: true, force: true })
  data = await resetDatabase()
  app = await makeApp()
  adnan = new Client(app)
  selma = new Client(app)
  lejla = new Client(app)
  manager = new Client(app)
  expect((await adnan.login(EMAILS.adnan)).statusCode).toBe(200)
  expect((await selma.login(EMAILS.selma)).statusCode).toBe(200)
  expect((await lejla.login(EMAILS.lejla)).statusCode).toBe(200)
  // A synthetic Yönetici of Drina (same run password).
  const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'yonetici@drina-demo.ba', 'Test Yönetici', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
  const role = (await asOwner(data.companies.drina, `select id from roles where name = 'Yönetici'`)).rows[0].id
  const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
  await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
  expect((await manager.login('yonetici@drina-demo.ba')).statusCode).toBe(200)
  ajla = ((await adnan.post('/api/customers/search', { q: 'Ajla Testović' })).json().items as { id: string }[])[0]!.id
  const docs = (await adnan.get(`/api/customers/${ajla}/documents`)).json().items as { id: string; type: string; version: number }[]
  doc = docs.find((d) => d.type === 'national_id')!
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('upload and storage', () => {
  it('an Operasyon user uploads; the file is stored encrypted, without EXIF, and listed as a version', async () => {
    const original = await jpegWithExif()
    const res = await upload(selma, original)
    expect(res.statusCode, res.body).toBe(201)
    const f = res.json().files[0]
    expect(f).toMatchObject({ side: 'front', versionNo: 1, kind: 'jpeg', current: true, uploadedByName: 'Selma Karić' })
    expect(res.body).not.toContain('kimlik.jpg')
    const [stored] = await storedFiles()
    expect(stored).toMatch(/customers[\\/][0-9a-f-]{36}[\\/]\d{4}[\\/][0-9a-f-]{36}\.bin$/)
    const bytes = await readFile(stored!)
    // Encrypted at rest: no JPEG signature, no plaintext slice, and the record holds only the ciphertext's digest.
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false)
    expect(bytes.includes(original.subarray(200, 260))).toBe(false)
    const rec = (await asOwner(data.companies.drina, `select * from customer_files where id = $1`, [f.id])).rows[0]
    expect(rec.ciphertext_sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const plain = crypto.decrypt(data.companies.drina, 'file', f.id, bytes, rec.enc_key_id)
    expect(plain.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
    expect(plain.includes(Buffer.from('GPS-SECRET-TEST'))).toBe(false)
    expect(original.includes(Buffer.from('GPS-SECRET-TEST'))).toBe(true)
    // No plaintext copy anywhere in the storage folder.
    for (const p of await storedFiles()) expect((await readFile(p)).includes(Buffer.from('GPS-SECRET'))).toBe(false)
  })

  it('back side, extra PDF page and a new front version keep every earlier version', async () => {
    expect((await upload(adnan, await png(), 'back', 'arka.png', 'image/png')).statusCode).toBe(201)
    expect((await upload(adnan, await pdf(2), 'page', 'ek.pdf', 'application/pdf')).statusCode).toBe(201)
    const res = await upload(adnan, await jpegWithExif(), 'front')
    const files = res.json().files as { side: string; versionNo: number; current: boolean; pages: number | null }[]
    expect(files.map((f) => [f.side, f.versionNo, f.current])).toEqual([
      ['front', 4, true],
      ['page', 3, true],
      ['back', 2, true],
      ['front', 1, false],
    ])
    expect(files.find((f) => f.side === 'page')!.pages).toBe(2)
    expect((await storedFiles()).length).toBe(4)
  })

  it('refuses wrong content, active PDFs, oversized files, voided documents and archived customers', async () => {
    expect((await upload(adnan, Buffer.from('MZ not an image'), 'front', 'kimlik.jpg')).statusCode).toBe(415)
    const active = await upload(adnan, await jsPdf(), 'page', 'x.pdf', 'application/pdf')
    expect(active.json().error.code).toBe('ACTIVE_PDF')
    const big = await upload(adnan, Buffer.concat([await pdf(), Buffer.alloc(11 * 1024 * 1024)]), 'page', 'buyuk.pdf', 'application/pdf')
    expect(big.statusCode).toBe(413)
    const visa = (await adnan.post(`/api/customers/${ajla}/documents`, { type: 'visa', issuingCountry: 'BA' })).json()
    await adnan.post(`/api/customers/${ajla}/documents/${visa.id}/void`, { version: visa.version, reason: 'entry_error' })
    expect((await upload(adnan, await png(), 'front', 'v.png', 'image/png', visa.id)).json().error.code).toBe('DOCUMENT_VOIDED')
    expect((await storedFiles()).length).toBe(4)
  })

  it('a malware finding or an unavailable scanner stores nothing; production without a scanner keeps uploads closed', async () => {
    for (const [scanner, code] of [
      [fakeScanner('infected'), 'MALWARE_DETECTED'],
      [fakeScanner('unavailable'), 'SCANNER_UNAVAILABLE'],
    ] as const) {
      const scanned = await makeApp({ scanner })
      try {
        const c = new Client(scanned)
        await c.login(EMAILS.adnan)
        expect((await c.upload(`/api/customers/${ajla}/documents/${doc.id}/files?side=back`, await png(), 'a.png', 'image/png')).json().error.code).toBe(code)
      } finally {
        await scanned.close()
      }
    }
    const prod = await makeApp({ nodeEnv: 'production' })
    try {
      const c = new Client(prod)
      await c.login(EMAILS.adnan)
      expect((await c.get(`/api/customers/${ajla}/documents`)).json().uploadsEnabled).toBe(false)
      expect((await c.upload(`/api/customers/${ajla}/documents/${doc.id}/files?side=back`, await png(), 'a.png', 'image/png')).json().error.code).toBe('UPLOADS_DISABLED')
    } finally {
      await prod.close()
    }
    expect((await storedFiles()).length).toBe(4)
  })
})

describe('viewing and downloading', () => {
  let fileId: string
  beforeAll(async () => {
    fileId = ((await adnan.get(`/api/customers/${ajla}/documents`)).json().items as { id: string; files: { id: string; side: string; current: boolean }[] }[])
      .find((d) => d.id === doc.id)!
      .files.find((f) => f.side === 'front' && f.current)!.id
  })

  it('Operasyon may neither view nor download; Yönetici may view but not download; Sahip may do both', async () => {
    expect((await selma.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).statusCode).toBe(403)
    expect((await selma.post(`/api/customer-files/${fileId}/access`, { mode: 'download' })).statusCode).toBe(403)
    const viewed = await open(manager, fileId, 'view')
    expect(viewed.statusCode).toBe(200)
    expect(viewed.headers['content-type']).toBe('image/jpeg')
    expect(viewed.headers['content-disposition']).toMatch(/^inline; filename="kimlik_front_v4\.jpg"$/)
    expect(viewed.headers['cache-control']).toContain('no-store')
    expect(viewed.headers['x-content-type-options']).toBe('nosniff')
    expect(viewed.headers['content-security-policy']).toContain('sandbox')
    expect(viewed.rawPayload.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
    expect((await manager.post(`/api/customer-files/${fileId}/access`, { mode: 'download' })).statusCode).toBe(403)
    const downloaded = await open(adnan, fileId, 'download')
    expect(downloaded.statusCode).toBe(200)
    expect(downloaded.headers['content-disposition']).toMatch(/^attachment;/)
    const pdfFile = ((await adnan.get(`/api/customers/${ajla}/documents`)).json().items as { id: string; files: { id: string; kind: string }[] }[]).find((d) => d.id === doc.id)!.files.find((f) => f.kind === 'pdf')!
    const pdfRes = await open(adnan, pdfFile.id, 'view')
    expect(pdfRes.headers['content-type']).toBe('application/pdf')
    expect(pdfRes.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('both requests are audited without file names or contents', async () => {
    const log = (await asOwner(data.companies.drina, `select action, summary from audit_log where entity = 'customer_document' and entity_id = $1 and action like '%request'`, [doc.id])).rows
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['customer.document.view_request', 'customer.document.download_request']))
    expect(JSON.stringify(log)).not.toMatch(/kimlik\.jpg|GPS|TEST-BA/)
  })

  it('a grant is needed, belongs to the session and purpose, and only same-origin requests are served', async () => {
    // A fresh session holds no grants from the earlier tests.
    const owner = new Client(app)
    expect((await owner.login(EMAILS.adnan)).statusCode).toBe(200)
    expect((await owner.get(`/api/customer-files/${fileId}`)).json().error.code).toBe('ACCESS_GRANT_REQUIRED')
    const grant = (await owner.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).json()
    expect(grant.url).not.toMatch(/token|key|sig/i)
    // A view grant does not allow downloading.
    expect((await owner.get(`/api/customer-files/${fileId}?indir=1`)).json().error.code).toBe('ACCESS_GRANT_REQUIRED')
    expect((await owner.request('GET', grant.url, undefined, { 'sec-fetch-site': 'cross-site' })).json().error.code).toBe('CROSS_SITE_REQUEST')
    // Another session (even with the view permission) cannot use this session's grant.
    const otherSession = new Client(app)
    expect((await otherSession.login('yonetici@drina-demo.ba')).statusCode).toBe(200)
    expect((await otherSession.get(grant.url)).json().error.code).toBe('ACCESS_GRANT_REQUIRED')
    // A vehicle document grant cannot open a customer file and the other way round.
    expect((await owner.get(`/api/document-files/${fileId}`)).statusCode).toBe(404)
  })

  it('company switch, sign-out and a removed permission end access at once', async () => {
    let grant = (await adnan.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).json()
    expect((await adnan.post('/api/auth/switch-company', { companyId: data.companies.neretva })).statusCode).toBe(200)
    expect((await adnan.get(grant.url)).statusCode).toBe(404)
    expect((await adnan.post('/api/auth/switch-company', { companyId: data.companies.drina })).statusCode).toBe(200)
    expect((await adnan.get(grant.url)).json().error.code).toBe('ACCESS_GRANT_REQUIRED')

    grant = (await manager.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).json()
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'customers.documents.view') where name = 'Yönetici'`)
    try {
      expect((await manager.get(grant.url)).statusCode).toBe(403)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = array_append(permissions, 'customers.documents.view') where name = 'Yönetici'`)
    }
    const other = new Client(app)
    await other.login('yonetici@drina-demo.ba')
    grant = (await other.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).json()
    await other.post('/api/auth/logout')
    expect((await other.get(grant.url)).statusCode).toBe(401)
  })

  it('another company cannot open the file even with its id', async () => {
    expect((await lejla.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).statusCode).toBe(404)
  })

  it('a ciphertext moved onto another file record is refused (integrity) and does not decrypt', async () => {
    const files = (await asOwner(data.companies.drina, `select id, storage_key, enc_key_id from customer_files order by created_at limit 2`)).rows
    const a = await readFile(path.join(TEST_STORAGE, files[0].storage_key))
    expect(() => crypto.decrypt(data.companies.drina, 'file', files[1].id, a, files[0].enc_key_id)).toThrow(/Decryption failed/)
    const targetPath = path.join(TEST_STORAGE, files[1].storage_key)
    const original = await readFile(targetPath)
    await writeFile(targetPath, a)
    try {
      const res = await open(adnan, files[1].id, 'view')
      expect(res.statusCode).toBe(500)
      expect(res.json().error.code).toBe('FILE_INTEGRITY')
    } finally {
      await writeFile(targetPath, original)
    }
  })
})

describe('full number reveal', () => {
  it('only the owner role, with a reason; the number is returned once, uncached, and never written to the audit log', async () => {
    expect((await selma.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })).statusCode).toBe(403)
    expect((await manager.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })).statusCode).toBe(403)
    expect((await adnan.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, {})).statusCode).toBe(400)
    const res = await adnan.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'contract_preparation' })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ number: 'TESTBA1001', visibleSeconds: 30 })
    expect(res.headers['cache-control']).toContain('no-store')
    const log = (await asOwner(data.companies.drina, `select summary from audit_log where action = 'customer.document.number_reveal'`)).rows
    expect(log).toEqual([{ summary: expect.objectContaining({ reason: 'contract_preparation', type: 'national_id' }) }])
    expect(JSON.stringify(log)).not.toMatch(/TESTBA|1001/)
    const entry = (await adnan.post(`/api/customers/${ajla}/documents`, { type: 'entry_record', issuingCountry: 'BA', entryDate: '2026-10-01' })).json()
    expect((await adnan.post(`/api/customers/${ajla}/documents/${entry.id}/reveal-number`, { reason: 'other' })).json().error.code).toBe('NO_NUMBER')
  })

  it('at most 30 per user per hour, kept in the database: a new session or a restarted server does not reset it', async () => {
    const userId = (await asOwner(null, `select id from users where email = $1`, [EMAILS.adnan])).rows[0].id
    // One reveal is already counted; add 28 more as if done earlier this hour.
    await asOwner(null, `insert into user_sensitive_actions (user_id, action) select $1, 'document_number_reveal' from generate_series(1, 28)`, [userId])
    const last = await adnan.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })
    expect(last.statusCode).toBe(200)
    expect(last.json().remainingThisHour).toBe(0)
    expect((await adnan.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })).json().error.code).toBe('REVEAL_LIMIT')
    const restarted = await makeApp()
    try {
      const fresh = new Client(restarted)
      expect((await fresh.login(EMAILS.adnan)).statusCode).toBe(200)
      expect((await fresh.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })).json().error.code).toBe('REVEAL_LIMIT')
    } finally {
      await restarted.close()
    }
    // Reveals older than an hour no longer count.
    await asOwner(null, `update user_sensitive_actions set at = now() - interval '2 hours' where user_id = $1`, [userId])
    expect((await adnan.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })).statusCode).toBe(200)
  })
})

describe('defence in depth (final security review)', () => {
  it('file access and number reveal also require the document read permission; a custom role without it gets nothing', async () => {
    // A custom role with the view and reveal permissions but WITHOUT customers.documents.read.
    const role = (
      await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Eksik okuma', array['customers.read','customers.documents.view','customers.documents.download','customers.identity.reveal']) returning id`, [
        data.companies.drina,
      ])
    ).rows[0].id
    const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'eksik@drina-demo.ba', 'Eksik Okuma', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
    const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
    await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
    const c = new Client(app)
    expect((await c.login('eksik@drina-demo.ba')).statusCode).toBe(200)
    const fileId = (await asOwner(data.companies.drina, `select id from customer_files limit 1`)).rows[0].id
    expect((await c.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).statusCode).toBe(403)
    expect((await c.post(`/api/customer-files/${fileId}/access`, { mode: 'download' })).statusCode).toBe(403)
    expect((await c.post(`/api/customers/${ajla}/documents/${doc.id}/reveal-number`, { reason: 'document_check' })).statusCode).toBe(403)
  })

  it('the "number already used" answer names the other customer only to users who may see customers', async () => {
    const role = (
      await asOwner(data.companies.drina, `insert into roles (company_id, name, permissions) values ($1, 'Yalnız belge', array['customers.documents.read','customers.documents.manage']) returning id`, [data.companies.drina])
    ).rows[0].id
    const user = (await asOwner(null, `insert into users (email, name, password_hash) select 'yalnizbelge@drina-demo.ba', 'Yalnız Belge', password_hash from users where email = $1 returning id`, [EMAILS.adnan])).rows[0].id
    const m = (await asOwner(data.companies.drina, `insert into memberships (company_id, user_id, all_branches) values ($1, $2, 'yes') returning id`, [data.companies.drina, user])).rows[0].id
    await asOwner(data.companies.drina, `insert into membership_roles (company_id, membership_id, role_id) values ($1, $2, $3)`, [data.companies.drina, m, role])
    const c = new Client(app)
    expect((await c.login('yalnizbelge@drina-demo.ba')).statusCode).toBe(200)
    const emir = (await asOwner(data.companies.drina, `select id from customers where display_name = 'Emir Primjerović'`)).rows[0].id
    const res = await c.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DOCUMENT_NUMBER_IN_USE')
    expect(res.json().error.details).toBeNull()
    expect(res.body).not.toContain('Ajla')
    // An owner (who can see customers) gets the name.
    const owner = await adnan.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })
    expect(owner.json().error.details.otherCustomer.displayName).toBe('Ajla Testović')
  })
})
