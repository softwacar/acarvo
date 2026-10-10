// ACARVO customer data keys: create and rotate key files (M2 plan §4).
//
//   node scripts/customer-keys.mjs generate --out "C:\Users\<you>\Documents\acarvo-keys\customer-keys.env"
//   node scripts/customer-keys.mjs rotate --from <current key file> --out <new key file> [--lookup]
//
// - Keys come from the operating system's secure random source (crypto.randomBytes, 32 bytes = AES-256).
// - The key file is written OUTSIDE the project folder only (the script refuses paths inside it), never overwrites an
//   existing file, and on Windows is restricted to the current user. Nothing is added to .env: you copy the lines
//   yourself. Key values are never printed; the screen shows key ids and short fingerprints only.
// - rotate keeps every existing key (old data stays readable) and adds the next id as the active one. Re-encrypt the
//   stored data afterwards with `npm run keys:reencrypt --workspace @acarvo/api` (see docs/TEKNIK_UYGULAMA.md §8.7).
import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [command, ...rest] = process.argv.slice(2)
const arg = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const flag = (name) => rest.includes(`--${name}`)
const say = (m) => console.log(`[customer-keys] ${m}`)
const fail = (m) => {
  console.error(`[customer-keys] STOPPED: ${m}`)
  process.exit(1)
}

export const fingerprint = (key) => createHash('sha256').update('acarvo-key-fingerprint|').update(key).digest('hex').slice(0, 8)
const newKey = () => randomBytes(32)

function insideRepo(target) {
  const resolved = path.resolve(target)
  const real = (p) => {
    try {
      return realpathSync(p)
    } catch {
      return p
    }
  }
  const root = real(repoRoot).toLowerCase()
  const dir = real(path.dirname(resolved)).toLowerCase()
  return dir === root || dir.startsWith(root + path.sep)
}

function checkOut(out) {
  if (!out) fail('give the key file path with --out (a folder outside the project, e.g. your Documents folder)')
  const resolved = path.resolve(out)
  if (insideRepo(resolved)) fail('the key file must not be inside the project folder (it could end up in Git or in a code backup)')
  if (existsSync(resolved)) fail('that file already exists; choose a new file name (key files are never overwritten)')
  return resolved
}

function parseFile(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const get = (name) => lines.find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1).trim()
  const ring = (spec) =>
    (spec ?? '')
      .split(',')
      .filter(Boolean)
      .map((p) => {
        const [id, b64] = p.split(':')
        const key = Buffer.from(b64 ?? '', 'base64')
        if (!/^k\d{1,4}$/.test(id ?? '') || key.length !== 32) fail('the existing key file is not in the expected format')
        return { id, key }
      })
  return { data: ring(get('CUSTOMER_DATA_KEYS')), lookup: ring(get('CUSTOMER_LOOKUP_KEYS')), dataActive: get('CUSTOMER_DATA_KEY_ACTIVE'), lookupActive: get('CUSTOMER_LOOKUP_KEY_ACTIVE') }
}

function writeKeyFile(out, { data, lookup, dataActive, lookupActive }) {
  const fp = (ring, active) => ring.map((k) => `${k.id}${k.id === active ? ' (etkin)' : ''} ${fingerprint(k.key)}`).join(', ')
  const body = [
    '# ACARVO müşteri verisi şifreleme anahtarları — GİZLİDİR.',
    '# Proje klasörüne, Git deposuna, e-postaya veya sohbete koymayın. Veritabanı yedeğinden AYRI, iki güvenli yerde saklayın.',
    `# Oluşturma: ${new Date().toISOString()}`,
    `# Veri anahtarları: ${fp(data, dataActive)}`,
    `# Arama anahtarları: ${fp(lookup, lookupActive)}`,
    '# Aşağıdaki dört satırı ACARVO .env dosyasına kendiniz ekleyin; ardından API sunucusunu yeniden başlatın.',
    `CUSTOMER_DATA_KEYS=${data.map((k) => `${k.id}:${k.key.toString('base64')}`).join(',')}`,
    `CUSTOMER_DATA_KEY_ACTIVE=${dataActive}`,
    `CUSTOMER_LOOKUP_KEYS=${lookup.map((k) => `${k.id}:${k.key.toString('base64')}`).join(',')}`,
    `CUSTOMER_LOOKUP_KEY_ACTIVE=${lookupActive}`,
    '',
  ].join(os.EOL)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, body, { flag: 'wx', mode: 0o600 })
  if (process.platform === 'win32') {
    // Only the current Windows user may read the file (inherited permissions removed).
    try {
      execFileSync('icacls', [out, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:F`], { stdio: 'ignore' })
    } catch {
      say('WARNING: could not restrict the file permissions; restrict them manually (only your user).')
    }
  }
  say(`key file written: ${out}`)
  say(`data keys:   ${fp(data, dataActive)}`)
  say(`lookup keys: ${fp(lookup, lookupActive)}`)
  say('next: copy the four CUSTOMER_* lines into .env yourself, back the key file up in two places separate from database backups,')
  say('then run: npm run keys:check --workspace @acarvo/api')
}

if (command === 'generate') {
  const out = checkOut(arg('out'))
  writeKeyFile(out, { data: [{ id: 'k1', key: newKey() }], lookup: [{ id: 'k1', key: newKey() }], dataActive: 'k1', lookupActive: 'k1' })
} else if (command === 'rotate') {
  const from = arg('from')
  if (!from || !existsSync(from)) fail('give the current key file with --from')
  const out = checkOut(arg('out'))
  const current = parseFile(from)
  if (!current.data.length || !current.lookup.length) fail('the existing key file has no keys')
  const next = (ring) => `k${Math.max(...ring.map((k) => Number(k.id.slice(1)))) + 1}`
  const dataId = next(current.data)
  const data = [...current.data, { id: dataId, key: newKey() }]
  const rotateLookup = flag('lookup')
  const lookupId = rotateLookup ? next(current.lookup) : current.lookupActive
  const lookup = rotateLookup ? [...current.lookup, { id: lookupId, key: newKey() }] : current.lookup
  writeKeyFile(out, { data, lookup, dataActive: dataId, lookupActive: lookupId })
  say(`old keys are kept in the new file. After updating .env and restarting the API, re-encrypt stored data, then keep ${from} in your backups until no backup needs it.`)
} else {
  console.log('usage: node scripts/customer-keys.mjs generate --out <file outside the project>')
  console.log('       node scripts/customer-keys.mjs rotate --from <current key file> --out <new key file> [--lookup]')
  process.exit(command ? 1 : 0)
}
