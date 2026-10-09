import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appPool, asApp, asOwner, Client, type DevData, EMAILS, makeApp, ownerPool, resetDatabase, TEST_STORAGE } from './helpers'

let data: DevData
let app: FastifyInstance
let adnan: Client
let lejla: Client
let selma: Client

interface Photo {
  id: string
  position: number
  isPrimary: boolean
  width: number
  height: number
  url: string
  thumbUrl: string
  attribution: Record<string, string> | null
}

/** A camera-like JPEG: orientation flag, owner name and a GPS position in EXIF. */
async function cameraJpeg(width = 1200, height = 800, colour = '#7a8aa6') {
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .jpeg({ quality: 85 })
    .withExif({
      IFD0: { Artist: 'Gizli Sahip', Copyright: 'Gizli Sahip', Make: 'TestCam', Model: 'X1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '43/1 51/1 2400/100', GPSLongitudeRef: 'E', GPSLongitude: '18/1 24/1 3000/100' },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer()
}

const idOf = async (c: Client, plate: string) => ((await c.get(`/api/vehicles?q=${encodeURIComponent(plate)}`)).json().items[0].id as string)
const photosOf = async (c: Client, vehicleId: string) => {
  const res = await c.get(`/api/vehicles/${vehicleId}/photos`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json().items as Photo[]
}
async function storedFileCount() {
  let n = 0
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory()) await walk(path.join(dir, e.name))
      else n++
    }
  }
  await walk(TEST_STORAGE)
  return n
}

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

describe('upload', () => {
  it('stores a cleaned, re-encoded copy: no EXIF, no GPS, orientation applied', async () => {
    const input = await cameraJpeg()
    const inMeta = await sharp(input).metadata()
    expect(inMeta.exif).toBeDefined()
    expect(inMeta.exif!.toString('latin1')).toContain('Gizli Sahip')

    const id = await idOf(adnan, 'A12-K-345')
    const res = await adnan.upload(`/api/vehicles/${id}/photos`, input)
    expect(res.statusCode, res.body).toBe(201)
    const photo = res.json() as Photo
    expect(photo).toMatchObject({ position: 0, isPrimary: true, width: 800, height: 1200 })

    const file = await adnan.get(photo.url)
    expect(file.statusCode).toBe(200)
    expect(file.headers['content-type']).toBe('image/webp')
    expect(file.headers['cache-control']).toBe('private, no-store, max-age=0')
    expect(file.headers.pragma).toBe('no-cache')
    expect(file.headers.vary).toContain('Cookie')
    expect(file.headers.etag).toBeUndefined()
    const out = await sharp(file.rawPayload).metadata()
    expect(out.format).toBe('webp')
    expect(out.exif).toBeUndefined()
    expect(out.xmp).toBeUndefined()
    expect(out.orientation ?? 1).toBe(1)
    expect(file.rawPayload.toString('latin1')).not.toContain('Gizli Sahip')
    expect(file.rawPayload.toString('latin1')).not.toContain('TestCam')

    const thumb = await adnan.get(photo.thumbUrl)
    expect(thumb.statusCode).toBe(200)
    expect(await sharp(thumb.rawPayload).metadata()).toMatchObject({ width: 480, height: 360 })

    const audit = await asOwner(data.companies.drina, `select action from audit_log where entity_id = $1`, [id])
    expect(audit.rows.map((r) => r.action)).toContain('vehicle.photo.add')
  })

  it('checks content, not the file name or browser type', async () => {
    const id = await idOf(adnan, 'E45-M-218')
    const before = await storedFileCount()
    const fake = await adnan.upload(`/api/vehicles/${id}/photos`, Buffer.from('bu bir fotoğraf değil, düz metin'), 'araba.jpg', 'image/jpeg')
    expect(fake.statusCode).toBe(415)
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><script>alert(1)</script><rect width="800" height="600"/></svg>')
    expect((await adnan.upload(`/api/vehicles/${id}/photos`, svg, 'araba.png', 'image/png')).statusCode).toBe(415)
    const gif = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#000' } }).gif().toBuffer()
    expect((await adnan.upload(`/api/vehicles/${id}/photos`, gif, 'araba.jpg', 'image/jpeg')).statusCode).toBe(415)
    expect(await photosOf(adnan, id)).toEqual([])
    expect(await storedFileCount()).toBe(before)
  })

  it('accepts PNG and WebP content regardless of the extension', async () => {
    const id = await idOf(adnan, 'E45-M-218')
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#335' } }).png().toBuffer()
    expect((await adnan.upload(`/api/vehicles/${id}/photos`, png, 'foto.dat', 'application/octet-stream')).statusCode).toBe(201)
    const webp = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#533' } }).webp().toBuffer()
    expect((await adnan.upload(`/api/vehicles/${id}/photos`, webp, 'foto.webp', 'image/webp')).statusCode).toBe(201)
  })

  it('rejects images that are too small or too large', async () => {
    const id = await idOf(adnan, 'K71-J-904')
    const small = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#999' } }).jpeg().toBuffer()
    const r1 = await adnan.upload(`/api/vehicles/${id}/photos`, small)
    expect(r1.statusCode).toBe(422)
    expect(r1.json().error.code).toBe('IMAGE_TOO_SMALL')
    const big = Buffer.alloc(10 * 1024 * 1024 + 1024, 1)
    const r2 = await adnan.upload(`/api/vehicles/${id}/photos`, big)
    expect(r2.statusCode).toBe(413)
    expect(r2.json().error.code).toBe('FILE_TOO_LARGE')
    expect(await photosOf(adnan, id)).toEqual([])
  })

  it('requires the CSRF token for uploads', async () => {
    const id = await idOf(adnan, 'K71-J-904')
    const c = new Client(app)
    await c.login(EMAILS.adnan)
    c.csrf = undefined
    const res = await c.upload(`/api/vehicles/${id}/photos`, await cameraJpeg())
    expect(res.statusCode).toBe(403)
  })

  it('allows at most 6 photos per vehicle', async () => {
    const id = await idOf(adnan, 'O58-E-467')
    for (let i = 0; i < 6; i++) {
      const res = await adnan.upload(`/api/vehicles/${id}/photos`, await cameraJpeg(1000, 700, `#${(i + 2) * 111}`.slice(0, 4)))
      expect(res.statusCode, res.body).toBe(201)
    }
    const seventh = await adnan.upload(`/api/vehicles/${id}/photos`, await cameraJpeg())
    expect(seventh.statusCode).toBe(409)
    expect(seventh.json().error.code).toBe('PHOTO_LIMIT')
    const list = await photosOf(adnan, id)
    expect(list.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5])
    expect(list.filter((p) => p.isPrimary)).toHaveLength(1)
  })
})

describe('order, primary and removal', () => {
  it('reorders photos and keeps the order after reload', async () => {
    const id = await idOf(adnan, 'O58-E-467')
    const list = await photosOf(adnan, id)
    const reversed = [...list].reverse().map((p) => p.id)
    const res = await adnan.put(`/api/vehicles/${id}/photos/order`, { photoIds: reversed })
    expect(res.statusCode, res.body).toBe(200)
    expect((await photosOf(adnan, id)).map((p) => p.id)).toEqual(reversed)
    const stale = await adnan.put(`/api/vehicles/${id}/photos/order`, { photoIds: reversed.slice(1) })
    expect(stale.statusCode).toBe(409)
  })

  it('switches the primary photo; there is always exactly one', async () => {
    const id = await idOf(adnan, 'O58-E-467')
    const list = await photosOf(adnan, id)
    const target = list.find((p) => !p.isPrimary)!
    const res = await adnan.post(`/api/vehicles/${id}/photos/${target.id}/primary`)
    expect(res.statusCode).toBe(200)
    const after = await photosOf(adnan, id)
    expect(after.filter((p) => p.isPrimary).map((p) => p.id)).toEqual([target.id])
  })

  it('removing the primary promotes the first remaining photo, re-packs positions and deletes the files', async () => {
    const id = await idOf(adnan, 'O58-E-467')
    const list = await photosOf(adnan, id)
    const primary = list.find((p) => p.isPrimary)!
    const before = await storedFileCount()
    const res = await adnan.del(`/api/vehicles/${id}/photos/${primary.id}`)
    expect(res.statusCode, res.body).toBe(200)
    const after = await photosOf(adnan, id)
    expect(after).toHaveLength(5)
    expect(after.map((p) => p.position)).toEqual([0, 1, 2, 3, 4])
    expect(after[0]!.isPrimary).toBe(true)
    expect((await adnan.get(primary.url)).statusCode).toBe(404)
    expect(await storedFileCount()).toBe(before - 2)
  })
})

describe('isolation', () => {
  let neretvaVehicle: string
  let neretvaPhoto: Photo
  beforeAll(async () => {
    neretvaVehicle = await idOf(lejla, 'M21-O-650')
    neretvaPhoto = (await lejla.upload(`/api/vehicles/${neretvaVehicle}/photos`, await cameraJpeg())).json()
  })

  it('another company cannot list, view, upload, reorder or remove, even with the file address', async () => {
    expect((await adnan.get(`/api/vehicles/${neretvaVehicle}/photos`)).statusCode).toBe(404)
    const file = await adnan.get(neretvaPhoto.url)
    expect(file.statusCode).toBe(404)
    expect(file.headers['content-type']).toContain('application/json')
    expect(file.headers['cache-control']).toBe('no-store')
    expect((await adnan.get(neretvaPhoto.thumbUrl)).statusCode).toBe(404)
    expect((await adnan.upload(`/api/vehicles/${neretvaVehicle}/photos`, await cameraJpeg())).statusCode).toBe(404)
    expect((await adnan.put(`/api/vehicles/${neretvaVehicle}/photos/order`, { photoIds: [neretvaPhoto.id] })).statusCode).toBe(404)
    expect((await adnan.post(`/api/vehicles/${neretvaVehicle}/photos/${neretvaPhoto.id}/primary`)).statusCode).toBe(404)
    expect((await adnan.del(`/api/vehicles/${neretvaVehicle}/photos/${neretvaPhoto.id}`)).statusCode).toBe(404)
    expect(await photosOf(lejla, neretvaVehicle)).toHaveLength(1)
    expect((await lejla.get(neretvaPhoto.url)).statusCode).toBe(200)
  })

  it('never answers 304 and checks access on every request, whatever validators the browser sends', async () => {
    const conditional = { 'if-none-match': '*', 'if-modified-since': new Date().toUTCString() }
    const own = await lejla.request('GET', neretvaPhoto.url, undefined, conditional)
    expect(own.statusCode).toBe(200)
    expect(own.headers['cache-control']).toContain('no-store')
    expect((await adnan.request('GET', neretvaPhoto.url, undefined, conditional)).statusCode).toBe(404)
    expect((await new Client(app).request('GET', neretvaPhoto.url, undefined, conditional)).statusCode).toBe(401)
  })

  it('access ends with logout and with a company switch', async () => {
    const c = new Client(app)
    await c.login(EMAILS.adnan)
    const own = await idOf(c, 'A12-K-345')
    const photo = (await photosOf(c, own))[0]!
    expect((await c.get(photo.url)).statusCode).toBe(200)
    expect((await c.post('/api/auth/switch-company', { companyId: data.companies.neretva })).statusCode).toBe(200)
    expect((await c.get(photo.url)).statusCode).toBe(404)
    expect((await c.get(photo.thumbUrl)).statusCode).toBe(404)
    expect((await c.post('/api/auth/switch-company', { companyId: data.companies.drina })).statusCode).toBe(200)
    expect((await c.get(photo.url)).statusCode).toBe(200)
    expect((await c.post('/api/auth/logout')).statusCode).toBe(204)
    expect((await c.get(photo.url)).statusCode).toBe(401)
  })

  it('returns the attribution stored with a photo', async () => {
    const own = await idOf(adnan, 'A12-K-345')
    const photo = (await photosOf(adnan, own))[0]!
    expect(photo.attribution).toBeNull()
    const credit = { author: 'Mike-fiesta', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', changes: 'boyutlandırıldı' }
    await asOwner(data.companies.drina, `update vehicle_promo_photos set attribution = $1 where id = $2`, [JSON.stringify(credit), photo.id])
    expect((await photosOf(adnan, own))[0]!.attribution).toEqual(credit)
  })

  it('a photo id of another company cannot be used through an own vehicle', async () => {
    const own = await idOf(adnan, 'A12-K-345')
    expect((await adnan.del(`/api/vehicles/${own}/photos/${neretvaPhoto.id}`)).statusCode).toBe(404)
    expect((await adnan.post(`/api/vehicles/${own}/photos/${neretvaPhoto.id}/primary`)).statusCode).toBe(404)
  })

  it('branch scope applies to viewing files and to managing photos', async () => {
    const sac = await idOf(adnan, 'T09-A-781')
    const sacPhoto = (await adnan.upload(`/api/vehicles/${sac}/photos`, await cameraJpeg())).json() as Photo
    expect((await selma.get(sacPhoto.url)).statusCode).toBe(404)
    expect((await selma.get(`/api/vehicles/${sac}/photos`)).statusCode).toBe(404)
    expect((await selma.upload(`/api/vehicles/${sac}/photos`, await cameraJpeg())).statusCode).toBe(404)
    expect((await selma.del(`/api/vehicles/${sac}/photos/${sacPhoto.id}`)).statusCode).toBe(404)
    const sjj = await idOf(selma, 'A39-T-657')
    expect((await selma.upload(`/api/vehicles/${sjj}/photos`, await cameraJpeg())).statusCode).toBe(201)
  })

  it('needs a session and the photo permission', async () => {
    const own = await idOf(adnan, 'A12-K-345')
    const photo = (await photosOf(adnan, own))[0]!
    expect((await new Client(app).get(photo.url)).statusCode).toBe(401)
    // Neretva "Yönetici" (Adnan there) has photo rights; remove them to check the guard.
    await asOwner(data.companies.drina, `update roles set permissions = array_remove(permissions, 'vehicles.photos.manage') where name = 'Sahip'`)
    try {
      expect((await adnan.upload(`/api/vehicles/${own}/photos`, await cameraJpeg())).statusCode).toBe(403)
      expect((await adnan.del(`/api/vehicles/${own}/photos/${photo.id}`)).statusCode).toBe(403)
      expect((await adnan.get(photo.url)).statusCode).toBe(200)
    } finally {
      await asOwner(data.companies.drina, `update roles set permissions = permissions || '{vehicles.photos.manage}' where name = 'Sahip'`)
    }
  })

  it('files are not reachable outside the API and the stored copy sits under the company folder', async () => {
    expect((await adnan.get('/storage')).statusCode).toBe(404)
    const rows = await asOwner(data.companies.drina, `select storage_key from files limit 1`)
    const key = rows.rows[0].storage_key as string
    expect(key.startsWith(`${data.companies.drina}/`)).toBe(true)
    expect((await adnan.get(`/${key}`)).statusCode).toBe(404)
    expect((await adnan.get(`/storage/${key}`)).statusCode).toBe(404)
    expect((await stat(path.join(TEST_STORAGE, key))).isFile()).toBe(true)
  })

  it('the database role cannot rewrite file records and sees no rows without a company', async () => {
    await expect(asApp(data.companies.drina, (c) => c.query(`update files set storage_key = 'x'`))).rejects.toThrow(/permission denied/)
    const n = await asApp(null, async (c) => (await c.query('select count(*)::int n from vehicle_promo_photos')).rows[0].n)
    expect(n).toBe(0)
  })
})
