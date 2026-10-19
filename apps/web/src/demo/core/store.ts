import { useSyncExternalStore } from 'react'
import { setLangGlobal } from '../i18n'
import { buildSeed } from './seed'
import type { Db } from './types'

// The demo state lives in the browser only (IndexedDB, with a localStorage fallback). Nothing here is sent to a server.
// Every mutation goes through commit(): it runs on a copy, so a failed action leaves the state untouched.

export const DB_SCHEMA = 3
const IDB_NAME = 'acarvo-demo'
const IDB_STORE = 'kv'
const KEY = 'db'
const LS_KEY = 'acarvo-demo-db-v3'

let db: Db | null = null
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let persistEnabled = true

export const getDb = (): Db => {
  if (!db) throw new Error('Demo store is not loaded yet')
  return db
}
export const isLoaded = () => db !== null

export function useDb(): Db {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getDb,
  )
}

const emit = () => listeners.forEach((l) => l())

// ------------------------------------------------------------------ persistence

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet(): Promise<Db | null> {
  const d = await openIdb()
  return new Promise((resolve, reject) => {
    const r = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(KEY)
    r.onsuccess = () => resolve((r.result as Db | undefined) ?? null)
    r.onerror = () => reject(r.error)
  })
}
async function idbPut(value: Db): Promise<void> {
  const d = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
async function idbClear(): Promise<void> {
  const d = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function readSaved(): Promise<Db | null> {
  try {
    return await idbGet()
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEY)
      return raw ? (JSON.parse(raw) as Db) : null
    } catch {
      return null
    }
  }
}
function scheduleSave() {
  if (!persistEnabled) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!db) return
    idbPut(db).catch(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(db))
      } catch {
        // storage unavailable: the demo keeps working in memory for this tab
      }
    })
  }, 250)
}

/** Loads the saved demo state. A state written by another schema version is replaced by a fresh seed (never silently reused). */
export async function loadDemo(opts: { persist?: boolean } = {}): Promise<{ migratedFrom: number | null }> {
  persistEnabled = opts.persist !== false
  let migratedFrom: number | null = null
  const saved = persistEnabled ? await readSaved() : null
  if (saved && saved.meta?.schema === DB_SCHEMA) db = saved
  else {
    if (saved) migratedFrom = saved.meta?.schema ?? 0
    db = buildSeed(new Date())
    scheduleSave()
  }
  setLangGlobal(db.session.lang)
  emit()
  return { migratedFrom }
}

/** Starts again from the initial scenario. Only the demo state is affected. */
export async function resetDemo(): Promise<void> {
  db = buildSeed(new Date())
  setLangGlobal(db.session.lang)
  try {
    await idbClear()
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    // ignore
  }
  scheduleSave()
  emit()
}

// ------------------------------------------------------------------ mutations

/** Runs an action on a copy of the state; commits only if it does not throw. */
export function commit<T>(fn: (d: Db) => T): T {
  const draft = structuredClone(getDb())
  const result = fn(draft)
  draft.meta.modified = true
  db = draft
  scheduleSave()
  emit()
  return result
}

export * from './helpers'
