import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  checkCurrentState,
  checkMigration,
  checkMigrationCount,
  checkRowCounts,
  checkSensitiveActions,
  KNOWN_GLOBAL_TABLES,
  type SecurityState,
  snapshotSecurity,
} from '../../../scripts/lib/migration-checks.mjs'
import { appPool, ensureTestDatabase, ownerPool } from './helpers'

// The security checks of scripts/safe-migrate.mjs (after a migration and in --verify).

const journal = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../migrations/meta/_journal.json'), 'utf8')).entries as { tag: string }[]
const forced = { enabled: true, forced: true }
const global = { enabled: false, forced: false }

/** A healthy database in the shape snapshotSecurity() returns. */
function healthy(): SecurityState {
  return {
    rls: { companies: global, users: global, sessions: global, document_types: global, customers: forced, audit_log: forced, user_sensitive_actions: forced },
    sensitive: {
      columns: [
        { name: 'id', type: 'uuid' },
        { name: 'user_id', type: 'uuid' },
        { name: 'action', type: 'text' },
        { name: 'at', type: 'timestamp with time zone' },
        { name: 'company_id', type: 'uuid' },
      ],
      privileges: ['INSERT', 'SELECT'],
      policies: [
        { name: 'user_sensitive_actions_insert', cmd: 'INSERT' },
        { name: 'user_sensitive_actions_select', cmd: 'SELECT' },
      ],
    },
    migrations: journal.length,
  }
}

afterAll(async () => {
  await ownerPool.end()
  await appPool.end()
})

describe('safe-migrate security checks', () => {
  it('a healthy database passes, before and after a migration', () => {
    expect(checkCurrentState(healthy())).toEqual([])
    expect(checkMigration(healthy(), healthy())).toEqual([])
  })

  it('the global tables are fixed by name; there is no pattern or automatic exemption', () => {
    expect([...KNOWN_GLOBAL_TABLES]).toEqual(['companies', 'document_types', 'sessions', 'users'])
    expect(KNOWN_GLOBAL_TABLES).not.toContain('user_sensitive_actions')
  })

  it('a new company table without RLS is reported', () => {
    const after = healthy()
    after.rls.rental_contracts = global
    expect(checkMigration(healthy(), after)).toEqual(['new table without RLS: rental_contracts'])
    expect(checkCurrentState(after)).toEqual(['table without RLS: rental_contracts (not one of the known global tables)'])
  })

  it('an unrelated table cannot borrow the counter table’s or the global tables’ standing', () => {
    for (const name of ['user_sensitive_actions_copy', 'users_backup', 'sensitive_actions', 'session_notes']) {
      const s = healthy()
      s.rls[name] = global
      expect(checkCurrentState(s), name).toEqual([`table without RLS: ${name} (not one of the known global tables)`])
    }
  })

  it('RLS turned off or no longer forced on an existing table is reported', () => {
    const off = healthy()
    off.rls.customers = global
    expect(checkMigration(healthy(), off)).toContain('RLS weakened on customers')
    const notForced = healthy()
    notForced.rls.audit_log = { enabled: true, forced: false }
    expect(checkMigration(healthy(), notForced)).toEqual(expect.arrayContaining(['RLS weakened on audit_log', 'RLS not forced on audit_log']))
  })

  it('the counter table without RLS (as after 0015–0019) is reported, not exempted', () => {
    const s = healthy()
    s.rls.user_sensitive_actions = global
    s.sensitive.policies = []
    expect(checkCurrentState(s)).toEqual(
      expect.arrayContaining([
        'table without RLS: user_sensitive_actions (not one of the known global tables)',
        'user_sensitive_actions: row level security must be enabled and forced',
        'user_sensitive_actions: policy "user_sensitive_actions_select" (SELECT) is missing',
      ]),
    )
  })

  it('a customer or document column added to the counter table is reported', () => {
    for (const name of ['customer_id', 'document_number', 'note']) {
      const s = healthy()
      s.sensitive.columns.push({ name, type: 'text' })
      expect(checkSensitiveActions(s), name).toEqual([`user_sensitive_actions: unexpected column "${name}" (the counter table holds no customer, document or other data)`])
    }
    const retyped = healthy()
    retyped.sensitive.columns[2] = { name: 'action', type: 'jsonb' }
    expect(checkSensitiveActions(retyped)).toEqual(['user_sensitive_actions: column "action" is jsonb, expected text'])
  })

  it('wider privileges or extra policies on the counter table are reported', () => {
    for (const p of ['UPDATE', 'DELETE', 'TRUNCATE']) {
      const s = healthy()
      s.sensitive.privileges.push(p)
      expect(checkSensitiveActions(s), p).toEqual([`user_sensitive_actions: acarvo_app must not have ${p} (only SELECT and INSERT)`])
    }
    const policy = healthy()
    policy.sensitive.policies.push({ name: 'user_sensitive_actions_delete', cmd: 'DELETE' })
    expect(checkSensitiveActions(policy)).toEqual(['user_sensitive_actions: unexpected policy "user_sensitive_actions_delete" for DELETE (only the reviewed SELECT and INSERT policies)'])
    const all = healthy()
    all.sensitive.policies = [{ name: 'open', cmd: 'ALL' }]
    expect(checkSensitiveActions(all)).toEqual(
      expect.arrayContaining(['user_sensitive_actions: unexpected policy "open" for ALL (only the reviewed SELECT and INSERT policies)']),
    )
  })

  it('a database before the counter table existed is not a problem', () => {
    const s = healthy()
    delete s.rls.user_sensitive_actions
    s.sensitive = { columns: [], privileges: [], policies: [] }
    expect(checkCurrentState(s)).toEqual([])
  })

  it('migration counts: pending, matching and more than the project', () => {
    expect(checkMigrationCount(journal.length, journal.length)).toEqual([])
    expect(checkMigrationCount(20, 22)).toEqual(['2 migration(s) pending (20 applied, 22 in the project)'])
    expect(checkMigrationCount(23, 22)).toEqual(['the database has 23 migrations, the project 22 (wrong branch?)'])
  })

  it('row counts: a table that gains RLS is compared with the sum over companies; losses are reported', () => {
    const before = { users: 3, user_sensitive_actions: 4, 'Drina / customers': 2 }
    expect(checkRowCounts(before, { users: 3, 'Drina / user_sensitive_actions': 3, 'Neretva / user_sensitive_actions': 1, 'Drina / customers': 2 })).toEqual([])
    expect(checkRowCounts(before, { users: 3, 'Drina / user_sensitive_actions': 3, 'Drina / customers': 2 })).toEqual(['rows lost: user_sensitive_actions 4 → 3'])
    expect(checkRowCounts(before, { users: 2, 'Drina / customers': 2 })).toEqual(['rows lost: users 3 → 2', 'table disappeared: user_sensitive_actions'])
  })
})

describe('the test database as it is now', () => {
  it('all project migrations are applied, the first twenty are the reviewed M1/M2 ones, and no security problem is found', async () => {
    await ensureTestDatabase()
    const c = await ownerPool.connect()
    try {
      await c.query('begin read only')
      const state = await snapshotSecurity(c)
      await c.query('rollback')
      expect(journal.slice(0, 20).map((e) => e.tag.slice(0, 4))).toEqual(Array.from({ length: 20 }, (_, i) => String(i).padStart(4, '0')))
      expect(journal[19]!.tag).toBe('0019_document_requirements_rls')
      expect(checkMigrationCount(state.migrations, journal.length)).toEqual([])
      expect(checkCurrentState(state)).toEqual([])
      expect(Object.entries(state.rls).filter(([, r]) => !r.enabled).map(([t]) => t).sort()).toEqual([...KNOWN_GLOBAL_TABLES])
    } finally {
      c.release()
    }
  })
})
