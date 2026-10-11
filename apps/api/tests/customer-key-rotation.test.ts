import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../src/db/schema'
import { customerCryptoFromEnv } from '../src/lib/customer-crypto'
import { rotateCustomerData, verifyCustomerData } from '../src/lib/customer-key-rotation'
import { createStorage } from '../src/lib/storage'
import { appPool, asOwner, Client, type DevData, EMAILS, env, makeApp, ownerPool, resetDatabase, TEST_STORAGE } from './helpers'

// M2d: key rotation of customer document numbers and files. Synthetic keys only.

let data: DevData
let app: FastifyInstance
const owner = drizzle(ownerPool, { schema })
const storage = createStorage(TEST_STORAGE)
const k = () => randomBytes(32).toString('base64')
const k2 = k()
const l2 = k()
const k3 = k()
const rotatedEnv = {
  CUSTOMER_DATA_KEYS: `${env.CUSTOMER_DATA_KEYS},k2:${k2}`,
  CUSTOMER_DATA_KEY_ACTIVE: 'k2',
  CUSTOMER_LOOKUP_KEYS: `${env.CUSTOMER_LOOKUP_KEYS},k2:${l2}`,
  CUSTOMER_LOOKUP_KEY_ACTIVE: 'k2',
}
const retiredEnv = { CUSTOMER_DATA_KEYS: `k2:${k2}`, CUSTOMER_DATA_KEY_ACTIVE: 'k2', CUSTOMER_LOOKUP_KEYS: `k2:${l2}`, CUSTOMER_LOOKUP_KEY_ACTIVE: 'k2' }
let ajla: string
let idDoc: string
let fileId: string

beforeAll(async () => {
  await rm(TEST_STORAGE, { recursive: true, force: true })
  data = await resetDatabase()
  app = await makeApp()
  const c = new Client(app)
  await c.login(EMAILS.adnan)
  ajla = ((await c.post('/api/customers/search', { q: 'Ajla Testović' })).json().items as { id: string }[])[0]!.id
  const docs = (await c.get(`/api/customers/${ajla}/documents`)).json().items as { id: string; type: string; version: number }[]
  idDoc = docs.find((d) => d.type === 'national_id')!.id
  const img = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 60 } } }).jpeg().toBuffer()
  fileId = (await c.upload(`/api/customers/${ajla}/documents/${idDoc}/files?side=front`, img, 'k.jpg', 'image/jpeg')).json().files[0].id
  // A voided period with a number must be re-encrypted too.
  const lic = docs.find((d) => d.type === 'driving_license')!
  expect((await c.post(`/api/customers/${ajla}/documents/${lic.id}/void`, { version: lic.version, reason: 'entry_error' })).statusCode).toBe(200)
})
afterAll(async () => {
  await app.close()
  await appPool.end()
  await ownerPool.end()
})

describe('key rotation', () => {
  it('a dry run only counts', async () => {
    const crypto = customerCryptoFromEnv(rotatedEnv).crypto!
    const res = await rotateCustomerData(owner, crypto, storage, { dryRun: true })
    expect(res.find((r) => r.company === 'Drina Rent a Car')).toMatchObject({ numbersPending: 6, filesPending: 1, numbersDone: 0, filesDone: 0 })
    expect((await asOwner(data.companies.drina, `select count(*)::int n from customer_documents where number_key_id = 'k2'`)).rows[0].n).toBe(0)
  })

  it('re-encrypts every number (voided ones included) and file with the new keys, in batches, with an audit entry', async () => {
    const crypto = customerCryptoFromEnv(rotatedEnv).crypto!
    const res = await rotateCustomerData(owner, crypto, storage, { batch: 2 })
    expect(res).toEqual([
      expect.objectContaining({ company: 'Drina Rent a Car', numbersDone: 6, filesDone: 1, filesRecovered: 0 }),
      expect.objectContaining({ company: 'Neretva Rent', numbersDone: 1, filesDone: 0 }),
    ])
    const keys = (await asOwner(data.companies.drina, `select distinct number_key_id, number_lookup_key_id from customer_documents where number_ciphertext is not null`)).rows
    expect(keys).toEqual([{ number_key_id: 'k2', number_lookup_key_id: 'k2' }])
    const log = (await asOwner(data.companies.drina, `select summary from audit_log where action = 'customer.keys.reencrypt'`)).rows
    expect(log[0].summary).toMatchObject({ dataKeyId: 'k2', numbers: 6, files: 1 })
    // Running again finds nothing to do.
    expect((await rotateCustomerData(owner, crypto, storage)).every((r) => r.numbersPending === 0 && r.filesPending === 0)).toBe(true)
  })

  it('after retiring the old key everything still opens: reveal, file view, exact lookup and the one-number rule', async () => {
    const crypto = customerCryptoFromEnv(retiredEnv).crypto!
    expect((await verifyCustomerData(owner, crypto, storage)).every((r) => r.numberFailures === 0 && r.fileFailures === 0)).toBe(true)
    const retired = await makeApp({ envOverride: retiredEnv })
    try {
      const c = new Client(retired)
      expect((await c.login(EMAILS.adnan)).statusCode).toBe(200)
      expect((await c.post(`/api/customers/${ajla}/documents/${idDoc}/reveal-number`, { reason: 'document_check' })).json().number).toBe('TESTBA1001')
      const grant = (await c.post(`/api/customer-files/${fileId}/access`, { mode: 'view' })).json()
      const file = await c.get(grant.url)
      expect(file.statusCode).toBe(200)
      expect(file.rawPayload.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
      expect((await c.post('/api/customers/document-lookup', { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })).json().matches).toHaveLength(1)
      const emir = ((await c.post('/api/customers/search', { q: 'Emir Primjerović' })).json().items as { id: string }[])[0]!.id
      expect((await c.post(`/api/customers/${emir}/documents`, { type: 'national_id', issuingCountry: 'BA', number: 'TEST-BA-1001' })).json().error.code).toBe('DOCUMENT_NUMBER_IN_USE')
    } finally {
      await retired.close()
    }
  })

  it('the old keys alone can no longer open the rotated data', async () => {
    const old = customerCryptoFromEnv(env).crypto!
    const res = await verifyCustomerData(owner, old, storage)
    expect(res.find((r) => r.company === 'Drina Rent a Car')!.numberFailures).toBe(6)
  })

  it('an interrupted file re-encryption is recovered on the next run without losing the file', async () => {
    const next = { ...retiredEnv, CUSTOMER_DATA_KEYS: `k2:${k2},k3:${k3}`, CUSTOMER_DATA_KEY_ACTIVE: 'k3' }
    const crypto = customerCryptoFromEnv(next).crypto!
    // Simulate a crash after the file was replaced with the k3 ciphertext but before its record was updated.
    const rec = (await asOwner(data.companies.drina, `select storage_key, enc_key_id from customer_files where id = $1`, [fileId])).rows[0]
    const plain = crypto.decrypt(data.companies.drina, 'file', fileId, await storage.readAll(rec.storage_key), rec.enc_key_id)
    await storage.replace(rec.storage_key, crypto.encrypt(data.companies.drina, 'file', fileId, plain).ciphertext)
    const res = await rotateCustomerData(owner, crypto, storage)
    expect(res.find((r) => r.company === 'Drina Rent a Car')).toMatchObject({ filesRecovered: 1, filesDone: 0, numbersDone: 6 })
    expect((await verifyCustomerData(owner, crypto, storage)).every((r) => r.numberFailures === 0 && r.fileFailures === 0)).toBe(true)
  })
})
