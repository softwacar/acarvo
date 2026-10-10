import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'

// Encryption of customer identity data (M2 plan §3–4): document numbers and document files.
//
// - AES-256-GCM with a fresh 96-bit random nonce for every encryption and a 128-bit authentication tag.
// - The key used is derived per company from the master key (HKDF-SHA256, salt = company id), so a value
//   encrypted for one company cannot be decrypted with another company's derived key.
// - Additional authenticated data binds the ciphertext to its company, its kind (number / file) and its record id:
//   a value copied into another row, another customer or another company fails authentication.
// - Keys are versioned ("k1", "k2" …). The key id is stored next to every ciphertext; old keys stay readable after
//   rotation until every record has been re-encrypted with the active key.
// - Exact matching of document numbers uses HMAC-SHA256 with a separate lookup key, again derived per company.
//
// Key material never leaves this module: errors and fingerprints carry no key or plaintext bytes.

export const KEY_ID_PATTERN = /^k[0-9]{1,4}$/
const FORMAT_V1 = 0x01
const IV_BYTES = 12
const TAG_BYTES = 16

export class CustomerCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CustomerCryptoError'
  }
}

export interface KeyRing {
  active: string
  keys: Map<string, Buffer>
}

/** "k1:<base64>,k2:<base64>" → key ring. Messages name the variable and the problem, never a value. */
export function parseKeyRing(spec: string | undefined, active: string | undefined, label: string): KeyRing {
  if (!spec || !spec.trim()) throw new CustomerCryptoError(`${label} is not set`)
  const keys = new Map<string, Buffer>()
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const sep = part.indexOf(':')
    const id = sep > 0 ? part.slice(0, sep) : ''
    if (!KEY_ID_PATTERN.test(id)) throw new CustomerCryptoError(`${label}: every entry must look like k<number>:<base64 key>`)
    if (keys.has(id)) throw new CustomerCryptoError(`${label}: key id ${id} appears twice`)
    const raw = part.slice(sep + 1)
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new CustomerCryptoError(`${label}: key ${id} is not base64`)
    const key = Buffer.from(raw, 'base64')
    if (key.length !== 32) throw new CustomerCryptoError(`${label}: key ${id} must be 32 bytes (256 bits)`)
    keys.set(id, key)
  }
  if (!keys.size) throw new CustomerCryptoError(`${label} has no keys`)
  const activeId = (active ?? '').trim()
  if (!keys.has(activeId)) throw new CustomerCryptoError(`${label}: the active key id is missing or not in the ring`)
  return { active: activeId, keys }
}

/** Short, non-reversible label of a key, safe to print and to compare across machines: "3f9a1c22". */
export const fingerprint = (key: Buffer) => createHash('sha256').update('acarvo-key-fingerprint|').update(key).digest('hex').slice(0, 8)

export type CipherKind = 'number' | 'file'

export interface CustomerCrypto {
  readonly dataKeyId: string
  readonly lookupKeyId: string
  /** Encrypts with the active data key. */
  encrypt(companyId: string, kind: CipherKind, recordId: string, plaintext: Buffer): { ciphertext: Buffer; keyId: string }
  /** Decrypts with the stored key id; fails on any change of ciphertext, company, kind or record. */
  decrypt(companyId: string, kind: CipherKind, recordId: string, ciphertext: Buffer, keyId: string): Buffer
  /** HMAC of the normalised parts with the active lookup key, derived for this company. */
  lookup(companyId: string, parts: string[]): { hash: string; keyId: string }
  /** The same HMAC with every lookup key in the ring (exact matches stay findable during a lookup-key rotation). */
  lookupCandidates(companyId: string, parts: string[]): { hash: string; keyId: string }[]
  hasDataKey(id: string): boolean
  fingerprints(): { data: { id: string; fingerprint: string; active: boolean }[]; lookup: { id: string; fingerprint: string; active: boolean }[] }
}

export function createCustomerCrypto(data: KeyRing, lookupRing: KeyRing): CustomerCrypto {
  const derived = new Map<string, Buffer>()
  const derive = (ring: 'data' | 'lookup', id: string, master: Buffer, companyId: string) => {
    const cacheKey = `${ring}|${id}|${companyId}`
    let key = derived.get(cacheKey)
    if (!key) {
      key = Buffer.from(hkdfSync('sha256', master, Buffer.from(companyId, 'utf8'), `acarvo-customer-${ring}-v1`, 32))
      if (derived.size > 2000) derived.clear()
      derived.set(cacheKey, key)
    }
    return key
  }
  const aad = (companyId: string, kind: CipherKind, recordId: string) => Buffer.from(`acarvo|v1|${kind}|${companyId}|${recordId}`, 'utf8')
  const hmac = (id: string, master: Buffer, companyId: string, parts: string[]) =>
    createHmac('sha256', derive('lookup', id, master, companyId)).update(parts.join('\u001f'), 'utf8').digest('hex')

  return {
    dataKeyId: data.active,
    lookupKeyId: lookupRing.active,
    encrypt(companyId, kind, recordId, plaintext) {
      const key = derive('data', data.active, data.keys.get(data.active)!, companyId)
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
      cipher.setAAD(aad(companyId, kind, recordId))
      const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
      return { ciphertext: Buffer.concat([Buffer.from([FORMAT_V1]), iv, cipher.getAuthTag(), body]), keyId: data.active }
    },
    decrypt(companyId, kind, recordId, ciphertext, keyId) {
      const master = data.keys.get(keyId)
      if (!master) throw new CustomerCryptoError('The key this value was encrypted with is not configured')
      if (ciphertext.length < 1 + IV_BYTES + TAG_BYTES || ciphertext[0] !== FORMAT_V1) throw new CustomerCryptoError('Unknown ciphertext format')
      const iv = ciphertext.subarray(1, 1 + IV_BYTES)
      const tag = ciphertext.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES)
      const decipher = createDecipheriv('aes-256-gcm', derive('data', keyId, master, companyId), iv, { authTagLength: TAG_BYTES })
      decipher.setAAD(aad(companyId, kind, recordId))
      decipher.setAuthTag(tag)
      try {
        return Buffer.concat([decipher.update(ciphertext.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()])
      } catch {
        throw new CustomerCryptoError('Decryption failed: wrong key, or the value was changed or moved')
      }
    },
    lookup(companyId, parts) {
      return { hash: hmac(lookupRing.active, lookupRing.keys.get(lookupRing.active)!, companyId, parts), keyId: lookupRing.active }
    },
    lookupCandidates(companyId, parts) {
      return [...lookupRing.keys].map(([id, master]) => ({ hash: hmac(id, master, companyId, parts), keyId: id }))
    },
    hasDataKey: (id) => data.keys.has(id),
    fingerprints: () => ({
      data: [...data.keys].map(([id, k]) => ({ id, fingerprint: fingerprint(k), active: id === data.active })),
      lookup: [...lookupRing.keys].map(([id, k]) => ({ id, fingerprint: fingerprint(k), active: id === lookupRing.active })),
    }),
  }
}

export interface CustomerKeyEnv {
  CUSTOMER_DATA_KEYS?: string
  CUSTOMER_DATA_KEY_ACTIVE?: string
  CUSTOMER_LOOKUP_KEYS?: string
  CUSTOMER_LOOKUP_KEY_ACTIVE?: string
}

/**
 * Crypto from the environment. Not configured at all → { crypto: null, problem: 'not configured' };
 * misconfigured → { crypto: null, problem: <what is wrong, without values> }. Writes of numbers and files are refused
 * while crypto is null; nothing falls back to storing plaintext.
 */
export function customerCryptoFromEnv(env: CustomerKeyEnv): { crypto: CustomerCrypto | null; problem: string | null } {
  const any = env.CUSTOMER_DATA_KEYS || env.CUSTOMER_DATA_KEY_ACTIVE || env.CUSTOMER_LOOKUP_KEYS || env.CUSTOMER_LOOKUP_KEY_ACTIVE
  if (!any) return { crypto: null, problem: 'Customer data keys are not configured (CUSTOMER_DATA_KEYS, CUSTOMER_LOOKUP_KEYS)' }
  try {
    const data = parseKeyRing(env.CUSTOMER_DATA_KEYS, env.CUSTOMER_DATA_KEY_ACTIVE, 'CUSTOMER_DATA_KEYS')
    const lookup = parseKeyRing(env.CUSTOMER_LOOKUP_KEYS, env.CUSTOMER_LOOKUP_KEY_ACTIVE, 'CUSTOMER_LOOKUP_KEYS')
    for (const [id, key] of data.keys) for (const [lid, lkey] of lookup.keys) if (key.equals(lkey)) throw new CustomerCryptoError(`Data key ${id} and lookup key ${lid} must be different keys`)
    return { crypto: createCustomerCrypto(data, lookup), problem: null }
  } catch (e) {
    return { crypto: null, problem: e instanceof CustomerCryptoError ? e.message : 'Customer data keys could not be read' }
  }
}

/** Fresh key material for tests (never written anywhere). */
export function generateTestKeyEnv(ids: { data?: string[]; lookup?: string[] } = {}): Required<CustomerKeyEnv> {
  const ring = (list: string[]) => list.map((id) => `${id}:${randomBytes(32).toString('base64')}`).join(',')
  const data = ids.data ?? ['k1']
  const lookup = ids.lookup ?? ['k1']
  return { CUSTOMER_DATA_KEYS: ring(data), CUSTOMER_DATA_KEY_ACTIVE: data.at(-1)!, CUSTOMER_LOOKUP_KEYS: ring(lookup), CUSTOMER_LOOKUP_KEY_ACTIVE: lookup.at(-1)! }
}
