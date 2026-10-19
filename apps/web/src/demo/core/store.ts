import { useSyncExternalStore } from 'react'
import { getLang, type Lang, localize, setLangGlobal } from '../i18n'
import { buildSeed } from './seed'
import { DB_SCHEMA } from './seed-base'
import type { Db } from './types'

// The demo state lives in the browser only (IndexedDB, with a localStorage fallback). Nothing here is sent to a server.
// Every mutation goes through commit(): it runs on a copy, so a failed action leaves the state untouched.

export { DB_SCHEMA }
const IDB_NAME = 'acarvo-demo'
const IDB_STORE = 'kv'
const KEY = 'db'
const LS_KEY = 'acarvo-demo-db-v3'

let db: Db | null = null
let version = 0
let projected: { v: number; lang: Lang; value: Db } | null = null
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let persistEnabled = true

export const getDb = (): Db => {
  if (!db) throw new Error('Demo store is not loaded yet')
  return db
}
export const isLoaded = () => db !== null

/**
 * The database as the UI reads it: every bilingual string resolved to the current language. The stored state keeps both
 * languages, so a language change only re-projects it and nothing is lost. Cached per state version and language.
 */
export const getProjected = (): Db => {
  const raw = getDb()
  const lang = getLang()
  if (!projected || projected.v !== version || projected.lang !== lang) projected = { v: version, lang, value: localize(raw, lang) }
  return projected.value
}

export function useDb(): Db {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getProjected,
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
// Saving can fail (private window, blocked site data, full storage). The demo keeps working in memory for this tab and
// says so, so nobody mistakes the demo state for something durable.
let persistFailed = false
const persistListeners = new Set<() => void>()
function setPersistFailed(v: boolean) {
  if (persistFailed === v) return
  persistFailed = v
  persistListeners.forEach((l) => l())
}
export function usePersistFailed(): boolean {
  return useSyncExternalStore(
    (l) => {
      persistListeners.add(l)
      return () => persistListeners.delete(l)
    },
    () => persistFailed,
  )
}
function writeNow() {
  saveTimer = null
  if (!db) return
  idbPut(db)
    .then(() => setPersistFailed(false))
    .catch(() => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(db))
        setPersistFailed(false)
      } catch {
        setPersistFailed(true)
      }
    })
}
// A short debounce keeps rapid edits to one write; leaving the page flushes immediately so the last action is not lost.
function scheduleSave() {
  if (!persistEnabled) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(writeNow, 40)
}
if (typeof window !== 'undefined') {
  const flush = () => {
    if (saveTimer && persistEnabled) {
      clearTimeout(saveTimer)
      writeNow()
    }
  }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
}

/** Loads the saved demo state. A state written by another schema version is replaced by a fresh seed (never silently reused). */
export async function loadDemo(opts: { persist?: boolean } = {}): Promise<{ migratedFrom: number | null }> {
  persistEnabled = opts.persist !== false
  let migratedFrom: number | null = null
  const saved = persistEnabled ? await readSaved() : null
  version++
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
  version++
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
  version++
  db = draft
  scheduleSave()
  emit()
  return result
}

export * from './helpers'
