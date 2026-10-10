import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCustomerCrypto, CustomerCryptoError, customerCryptoFromEnv, fingerprint, generateTestKeyEnv, parseKeyRing } from '../src/lib/customer-crypto'

// Unit tests of the customer data encryption (M2a). Synthetic keys only; no database.

const companyA = randomUUID()
const companyB = randomUUID()
const recordA = randomUUID()
const recordB = randomUUID()
const fromEnv = (env = generateTestKeyEnv()) => customerCryptoFromEnv(env).crypto!

describe('key rings', () => {
  it('reads versioned rings and the active key', () => {
    const env = generateTestKeyEnv({ data: ['k1', 'k2'] })
    const ring = parseKeyRing(env.CUSTOMER_DATA_KEYS, env.CUSTOMER_DATA_KEY_ACTIVE, 'CUSTOMER_DATA_KEYS')
    expect([...ring.keys.keys()]).toEqual(['k1', 'k2'])
    expect(ring.active).toBe('k2')
  })

  it('rejects bad rings with messages that never contain key material', () => {
    const key = randomBytes(32).toString('base64')
    const cases: [string | undefined, string | undefined, RegExp][] = [
      [undefined, 'k1', /not set/],
      [`k1:${key}`, 'k2', /active key id/],
      [`x1:${key}`, 'x1', /k<number>/],
      [`k1:${key},k1:${key}`, 'k1', /appears twice/],
      [`k1:${randomBytes(16).toString('base64')}`, 'k1', /32 bytes/],
      [`k1:not*base64`, 'k1', /not base64/],
    ]
    for (const [spec, active, message] of cases) {
      let error: unknown
      try {
        parseKeyRing(spec, active, 'CUSTOMER_DATA_KEYS')
      } catch (e) {
        error = e
      }
      expect(error).toBeInstanceOf(CustomerCryptoError)
      expect((error as Error).message).toMatch(message)
      expect((error as Error).message).not.toContain(key)
    }
  })

  it('is closed (no crypto) when keys are missing or invalid, and data and lookup keys must differ', () => {
    expect(customerCryptoFromEnv({}).crypto).toBeNull()
    expect(customerCryptoFromEnv({}).problem).toMatch(/not configured/)
    const env = generateTestKeyEnv()
    expect(customerCryptoFromEnv({ ...env, CUSTOMER_LOOKUP_KEYS: undefined }).crypto).toBeNull()
    expect(customerCryptoFromEnv({ ...env, CUSTOMER_LOOKUP_KEYS: env.CUSTOMER_DATA_KEYS, CUSTOMER_LOOKUP_KEY_ACTIVE: env.CUSTOMER_DATA_KEY_ACTIVE }).problem).toMatch(/must be different/)
  })

  it('fingerprints identify a key without revealing it', () => {
    const key = randomBytes(32)
    expect(fingerprint(key)).toMatch(/^[0-9a-f]{8}$/)
    expect(fingerprint(key)).toBe(fingerprint(Buffer.from(key)))
    expect(fingerprint(key)).not.toBe(fingerprint(randomBytes(32)))
    expect(key.toString('hex')).not.toContain(fingerprint(key))
  })
})

describe('AES-256-GCM encryption', () => {
  it('round-trips and never repeats a nonce or ciphertext for the same value', () => {
    const c = fromEnv()
    const plain = Buffer.from('TEST-A1234567')
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const { ciphertext, keyId } = c.encrypt(companyA, 'number', recordA, plain)
      expect(keyId).toBe('k1')
      expect(ciphertext.includes(plain)).toBe(false)
      seen.add(ciphertext.subarray(1, 13).toString('hex'))
      expect(c.decrypt(companyA, 'number', recordA, ciphertext, keyId).equals(plain)).toBe(true)
    }
    expect(seen.size).toBe(200)
  })

  it('a value moved to another record, kind or company does not decrypt', () => {
    const c = fromEnv()
    const { ciphertext, keyId } = c.encrypt(companyA, 'number', recordA, Buffer.from('TEST-MOVE-1'))
    expect(() => c.decrypt(companyA, 'number', recordB, ciphertext, keyId)).toThrow(CustomerCryptoError)
    expect(() => c.decrypt(companyA, 'file', recordA, ciphertext, keyId)).toThrow(CustomerCryptoError)
    expect(() => c.decrypt(companyB, 'number', recordA, ciphertext, keyId)).toThrow(CustomerCryptoError)
  })

  it('any change to the ciphertext is detected', () => {
    const c = fromEnv()
    const { ciphertext, keyId } = c.encrypt(companyA, 'file', recordA, randomBytes(4096))
    for (const at of [0, 5, 20, ciphertext.length - 1]) {
      const bad = Buffer.from(ciphertext)
      bad[at] = bad[at]! ^ 0x01
      expect(() => c.decrypt(companyA, 'file', recordA, bad, keyId)).toThrow(CustomerCryptoError)
    }
    expect(() => c.decrypt(companyA, 'file', recordA, ciphertext.subarray(0, 20), keyId)).toThrow(/format/)
  })

  it('the wrong key fails; an unknown key id is reported without details', () => {
    const a = fromEnv()
    const b = fromEnv()
    const { ciphertext, keyId } = a.encrypt(companyA, 'number', recordA, Buffer.from('TEST-KEY-1'))
    expect(() => b.decrypt(companyA, 'number', recordA, ciphertext, keyId)).toThrow(/Decryption failed/)
    expect(() => a.decrypt(companyA, 'number', recordA, ciphertext, 'k9')).toThrow(/not configured/)
  })

  it('after rotation new values use the new key and old values stay readable until re-encrypted', () => {
    const old = generateTestKeyEnv()
    const before = fromEnv(old)
    const stored = before.encrypt(companyA, 'number', recordA, Buffer.from('TEST-ROTATE-1'))
    const k2 = `k2:${randomBytes(32).toString('base64')}`
    const after = fromEnv({ ...old, CUSTOMER_DATA_KEYS: `${old.CUSTOMER_DATA_KEYS},${k2}`, CUSTOMER_DATA_KEY_ACTIVE: 'k2' })
    expect(after.decrypt(companyA, 'number', recordA, stored.ciphertext, stored.keyId).toString()).toBe('TEST-ROTATE-1')
    const re = after.encrypt(companyA, 'number', recordA, after.decrypt(companyA, 'number', recordA, stored.ciphertext, stored.keyId))
    expect(re.keyId).toBe('k2')
    // Once k1 is retired from the ring, only re-encrypted values remain readable.
    const retired = fromEnv({ ...old, CUSTOMER_DATA_KEYS: k2, CUSTOMER_DATA_KEY_ACTIVE: 'k2' })
    expect(retired.decrypt(companyA, 'number', recordA, re.ciphertext, 'k2').toString()).toBe('TEST-ROTATE-1')
    expect(() => retired.decrypt(companyA, 'number', recordA, stored.ciphertext, 'k1')).toThrow(/not configured/)
  })
})

describe('exact-match HMAC', () => {
  it('is stable within a company, different per company, and changes with every part', () => {
    const c = fromEnv()
    const parts = ['passport', 'DE', 'TESTC01234567']
    expect(c.lookup(companyA, parts)).toEqual(c.lookup(companyA, parts))
    expect(c.lookup(companyA, parts).hash).not.toBe(c.lookup(companyB, parts).hash)
    expect(c.lookup(companyA, parts).hash).not.toBe(c.lookup(companyA, ['passport', 'AT', 'TESTC01234567']).hash)
    expect(c.lookup(companyA, parts).hash).not.toBe(c.lookup(companyA, ['national_id', 'DE', 'TESTC01234567']).hash)
    expect(c.lookup(companyA, parts).hash).toMatch(/^[0-9a-f]{64}$/)
    expect(c.lookup(companyA, parts).hash).not.toContain('TESTC01234567')
  })

  it('stays findable with every lookup key during a lookup-key rotation', () => {
    const old = generateTestKeyEnv()
    const before = fromEnv(old)
    const stored = before.lookup(companyA, ['driving_license', 'BA', 'TESTDL1'])
    const after = fromEnv({ ...old, CUSTOMER_LOOKUP_KEYS: `${old.CUSTOMER_LOOKUP_KEYS},k2:${randomBytes(32).toString('base64')}`, CUSTOMER_LOOKUP_KEY_ACTIVE: 'k2' })
    expect(after.lookup(companyA, ['driving_license', 'BA', 'TESTDL1']).keyId).toBe('k2')
    expect(after.lookupCandidates(companyA, ['driving_license', 'BA', 'TESTDL1'])).toContainEqual(stored)
  })

  it('data and lookup derivations are independent', () => {
    const env = generateTestKeyEnv()
    const c = createCustomerCrypto(
      parseKeyRing(env.CUSTOMER_DATA_KEYS, env.CUSTOMER_DATA_KEY_ACTIVE, 'd'),
      parseKeyRing(env.CUSTOMER_LOOKUP_KEYS, env.CUSTOMER_LOOKUP_KEY_ACTIVE, 'l'),
    )
    expect(c.fingerprints().data[0]!.fingerprint).not.toBe(c.fingerprints().lookup[0]!.fingerprint)
  })
})

describe('key file script (scripts/customer-keys.mjs)', () => {
  const run = async (args: string[]) => {
    const { spawnSync } = await import('node:child_process')
    const path = await import('node:path')
    const r = spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../../../scripts/customer-keys.mjs'), ...args], { encoding: 'utf8' })
    return { code: r.status, out: `${r.stdout}${r.stderr}` }
  }

  it('generates a usable key file outside the project, prints only fingerprints, refuses the project folder and overwrites', async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    const dir = mkdtempSync(path.join(os.tmpdir(), 'acarvo-keytest-'))
    try {
      const file = path.join(dir, 'customer-keys.env')
      const gen = await run(['generate', '--out', file])
      expect(gen.code, gen.out).toBe(0)
      const text = readFileSync(file, 'utf8')
      const env = Object.fromEntries(text.split(/\r?\n/).filter((l) => l.startsWith('CUSTOMER_')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
      const { crypto, problem } = customerCryptoFromEnv(env)
      expect(problem).toBeNull()
      // The screen never shows key material, only ids and fingerprints.
      for (const value of [env.CUSTOMER_DATA_KEYS!, env.CUSTOMER_LOOKUP_KEYS!]) for (const part of value.split(',')) expect(gen.out).not.toContain(part.split(':')[1]!)
      expect(gen.out).toContain(crypto!.fingerprints().data[0]!.fingerprint)

      expect((await run(['generate', '--out', file])).code).toBe(1)
      const inside = await run(['generate', '--out', path.resolve(import.meta.dirname, 'customer-keys.env')])
      expect(inside.code).toBe(1)
      expect(inside.out).toMatch(/inside the project/)

      const rotated = path.join(dir, 'customer-keys-2.env')
      const rot = await run(['rotate', '--from', file, '--out', rotated, '--lookup'])
      expect(rot.code, rot.out).toBe(0)
      const env2 = Object.fromEntries(readFileSync(rotated, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('CUSTOMER_')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
      expect(env2.CUSTOMER_DATA_KEY_ACTIVE).toBe('k2')
      expect(env2.CUSTOMER_LOOKUP_KEY_ACTIVE).toBe('k2')
      expect(env2.CUSTOMER_DATA_KEYS!.startsWith(env.CUSTOMER_DATA_KEYS!)).toBe(true)
      // Values encrypted with the first file stay readable with the rotated one.
      const company = randomUUID()
      const record = randomUUID()
      const stored = crypto!.encrypt(company, 'number', record, Buffer.from('TEST-FILE-ROT'))
      expect(customerCryptoFromEnv(env2).crypto!.decrypt(company, 'number', record, stored.ciphertext, stored.keyId).toString()).toBe('TEST-FILE-ROT')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
