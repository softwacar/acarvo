import { hash, verify } from '@node-rs/argon2'

/** Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations, 1 lane). */
export const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

export const hashPassword = (plain: string) => hash(plain, ARGON2_OPTIONS)

/** A fixed dummy hash keeps response time similar whether or not the account exists. */
let dummy: string | undefined
export async function verifyPassword(hashOrNull: string | null, plain: string) {
  if (!hashOrNull) {
    dummy ??= await hashPassword('acarvo-timing-equaliser')
    await verify(dummy, plain).catch(() => false)
    return false
  }
  return verify(hashOrNull, plain).catch(() => false)
}
