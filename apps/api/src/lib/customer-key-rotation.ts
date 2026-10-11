import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '../db/schema'
import { lookupParts } from '../modules/customers/documents'
import { type CustomerCrypto, CustomerCryptoError } from './customer-crypto'
import type { Storage } from './storage'

type OwnerDb = NodePgDatabase<typeof schema>
type Row = Record<string, unknown>

export interface RotationCompanyResult {
  company: string
  numbersPending: number
  numbersDone: number
  filesPending: number
  filesDone: number
  /** Files whose new ciphertext was written but whose record still named the old key (an interrupted earlier run). */
  filesRecovered: number
}

/**
 * Re-encrypts customer document numbers and files with the active keys (M2 plan §4.5). Runs as the owner, company by
 * company inside each company's RLS context, in small batches; each batch is its own transaction, so an interrupted run
 * simply continues next time. A file is replaced atomically on disk before its record is updated; if the record update
 * fails, the next run recognises the file (its digest no longer matches, but it decrypts with the active key) and only
 * fixes the record. Nothing is printed or logged except counts. dryRun only counts.
 */
export async function rotateCustomerData(db: OwnerDb, crypto: CustomerCrypto, storage: Storage, opts: { dryRun?: boolean; batch?: number } = {}): Promise<RotationCompanyResult[]> {
  const batch = opts.batch ?? 100
  const results: RotationCompanyResult[] = []
  const companies = (await db.execute(sql`select id, name from companies order by name`)).rows as { id: string; name: string }[]
  for (const company of companies) {
    const inCompany = <T>(fn: (tx: Parameters<Parameters<OwnerDb['transaction']>[0]>[0]) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
        return fn(tx)
      })
    const counts = await inCompany(async (tx) => ({
      numbers: Number(
        ((
          await tx.execute(
            sql`select count(*)::int n from customer_documents where number_ciphertext is not null and (number_key_id <> ${crypto.dataKeyId} or number_lookup_key_id <> ${crypto.lookupKeyId})`,
          )
        ).rows[0] as Row).n,
      ),
      files: Number(((await tx.execute(sql`select count(*)::int n from customer_files where enc_key_id <> ${crypto.dataKeyId}`)).rows[0] as Row).n),
    }))
    const result: RotationCompanyResult = { company: company.name, numbersPending: counts.numbers, numbersDone: 0, filesPending: counts.files, filesDone: 0, filesRecovered: 0 }
    results.push(result)
    if (opts.dryRun || (!counts.numbers && !counts.files)) continue

    for (;;) {
      const done = await inCompany(async (tx) => {
        const rows = (
          await tx.execute(sql`
            select id, type, issuing_country, number_ciphertext, number_key_id from customer_documents
            where number_ciphertext is not null and (number_key_id <> ${crypto.dataKeyId} or number_lookup_key_id <> ${crypto.lookupKeyId})
            order by id limit ${batch} for update`)
        ).rows as Row[]
        for (const r of rows) {
          const plain = crypto.decrypt(company.id, 'number', r.id as string, r.number_ciphertext as Buffer, r.number_key_id as string)
          const enc = crypto.encrypt(company.id, 'number', r.id as string, plain)
          const lookup = crypto.lookup(company.id, lookupParts(r.type as string, (r.issuing_country as string) ?? null, plain.toString('utf8')))
          await tx.execute(sql`update customer_documents set number_ciphertext = ${enc.ciphertext}, number_key_id = ${enc.keyId}, number_lookup = ${lookup.hash}, number_lookup_key_id = ${lookup.keyId} where id = ${r.id}`)
        }
        return rows.length
      })
      result.numbersDone += done
      if (done < batch) break
    }

    for (;;) {
      const done = await inCompany(async (tx) => {
        const rows = (await tx.execute(sql`select id, storage_key, enc_key_id, ciphertext_sha256 from customer_files where enc_key_id <> ${crypto.dataKeyId} order by id limit ${batch} for update`)).rows as Row[]
        for (const r of rows) {
          const id = r.id as string
          const current = await storage.readAll(r.storage_key as string)
          const digest = createHash('sha256').update(current).digest('hex')
          if (digest !== r.ciphertext_sha256) {
            // Interrupted earlier run: the file may already be in the active key; then only the record is updated.
            try {
              crypto.decrypt(company.id, 'file', id, current, crypto.dataKeyId)
            } catch (e) {
              if (e instanceof CustomerCryptoError) throw new Error(`File ${id} does not match its record and does not decrypt with the active key; stopped (nothing changed for it).`)
              throw e
            }
            await tx.execute(sql`update customer_files set enc_key_id = ${crypto.dataKeyId}, ciphertext_sha256 = ${digest} where id = ${id}`)
            result.filesRecovered++
            continue
          }
          const plain = crypto.decrypt(company.id, 'file', id, current, r.enc_key_id as string)
          const enc = crypto.encrypt(company.id, 'file', id, plain)
          await storage.replace(r.storage_key as string, enc.ciphertext)
          await tx.execute(sql`update customer_files set enc_key_id = ${enc.keyId}, ciphertext_sha256 = ${createHash('sha256').update(enc.ciphertext).digest('hex')} where id = ${id}`)
        }
        return rows.length
      })
      result.filesDone += done
      if (done < batch) break
    }
    result.filesDone -= result.filesRecovered

    await inCompany((tx) =>
      tx.execute(sql`insert into audit_log (company_id, actor_user_id, action, entity, summary)
        values (${company.id}, null, 'customer.keys.reencrypt', 'customer_key_rotation', ${JSON.stringify({ dataKeyId: crypto.dataKeyId, lookupKeyId: crypto.lookupKeyId, numbers: result.numbersDone, files: result.filesDone, recovered: result.filesRecovered })}::jsonb)`),
    )
  }
  return results
}

/** Read-only check of every stored value: counts per key id and how many decrypt (M2 plan §4.3, restore test). */
export async function verifyCustomerData(db: OwnerDb, crypto: CustomerCrypto, storage: Storage | null) {
  const out: { company: string; numbersByKey: Record<string, number>; filesByKey: Record<string, number>; numberFailures: number; fileFailures: number }[] = []
  const companies = (await db.execute(sql`select id, name from companies order by name`)).rows as { id: string; name: string }[]
  for (const company of companies) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`select set_config('app.company_id', ${company.id}, true)`)
      const docs = (await tx.execute(sql`select id, number_ciphertext, number_key_id from customer_documents where number_ciphertext is not null`)).rows as Row[]
      const files = (await tx.execute(sql`select id, storage_key, enc_key_id from customer_files`)).rows as Row[]
      const r = { company: company.name, numbersByKey: {} as Record<string, number>, filesByKey: {} as Record<string, number>, numberFailures: 0, fileFailures: 0 }
      for (const d of docs) {
        r.numbersByKey[d.number_key_id as string] = (r.numbersByKey[d.number_key_id as string] ?? 0) + 1
        try {
          crypto.decrypt(company.id, 'number', d.id as string, d.number_ciphertext as Buffer, d.number_key_id as string)
        } catch {
          r.numberFailures++
        }
      }
      for (const f of files) {
        r.filesByKey[f.enc_key_id as string] = (r.filesByKey[f.enc_key_id as string] ?? 0) + 1
        if (!storage) continue
        try {
          crypto.decrypt(company.id, 'file', f.id as string, await storage.readAll(f.storage_key as string), f.enc_key_id as string)
        } catch {
          r.fileFailures++
        }
      }
      out.push(r)
    })
  }
  return out
}
