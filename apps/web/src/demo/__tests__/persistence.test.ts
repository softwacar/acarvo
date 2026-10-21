import { describe, expect, it } from 'vitest'
import { buildSeed } from '../core/seed'
import { DB_SCHEMA } from '../core/seed-base'

describe('saved state versioning', () => {
  it('a fresh seed carries the current schema version, so the saved copy of it is accepted on reload', () => {
    // If these differ, every reload would discard the saved state and silently replace it with a fresh seed.
    expect(buildSeed(new Date('2026-10-20T08:00:00Z')).meta.schema).toBe(DB_SCHEMA)
  })
  it('the state survives a structured clone (what IndexedDB stores) without losing data', () => {
    const d = buildSeed(new Date('2026-10-20T08:00:00Z'))
    const copy = structuredClone(d)
    expect(JSON.stringify(copy)).toBe(JSON.stringify(d))
  })
})
