import { describe, expect, it } from 'vitest'
import { DemoError } from '../core/helpers'
import { inboxOf } from '../core/inbox'
import { bulkAssign, bulkComplete, cancelTask, canClaim, canSeeTask, claimTask, completeTask, createTask, postponeTask, reassignTask, releaseTask, reopenTask, startTask, type TaskInput } from '../core/ops/tasks'
import { buildSeed } from '../core/seed'
import type { Db } from '../core/types'

// Tasks (decision document D, O.C): pool visibility by branch and role, a conflict-safe claim, the full lifecycle with a
// history, bulk actions, notifications, and a completion that never touches the linked record.

const mkDb = (): Db => buildSeed(new Date('2026-10-19T08:00:00Z'))
const as = (d: Db, id: string) => {
  d.session.userId = id
}
const meOf = (d: Db) => d.users.find((u) => u.id === d.session.userId)!
const due = (d: Db, hours = 24) => new Date(Date.parse(d.clock.now) + hours * 3600_000).toISOString()
const input = (d: Db, over: Partial<TaskInput> = {}): TaskInput => ({ title: 'Test görevi', description: '', priority: 'normal', dueAt: due(d), recipientIds: [], pool: true, ...over })
const err = (fn: () => unknown): DemoError | null => {
  try {
    fn()
  } catch (e) {
    if (e instanceof DemoError) return e
    throw e
  }
  return null
}

describe('visibility and the open pool', () => {
  it('a pool task of the Sarajevo branch is visible and claimable only to people in that branch scope', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj' }))
    for (const [id, can] of [['u-ops1', true], ['u-ops2', false], ['u-ops3', false], ['u-fleet', true], ['u-owner', true]] as const) {
      const u = d.users.find((x) => x.id === id)!
      expect(canClaim(d, t, u), id).toBe(can)
    }
    // the Mostar and Dubrovnik clerks do not see it at all
    expect(canSeeTask(d, t, d.users.find((x) => x.id === 'u-ops3')!)).toBe(false)
    expect(canSeeTask(d, t, d.users.find((x) => x.id === 'u-ops1')!)).toBe(true)
  })
  it('a role filter limits who can claim a pool task', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj', poolRoleIds: ['role-fleet'] }))
    expect(canClaim(d, t, d.users.find((x) => x.id === 'u-ops1')!)).toBe(false)
    expect(canClaim(d, t, d.users.find((x) => x.id === 'u-fleet')!)).toBe(true)
  })
  it('an unassigned person never sees a task assigned to somebody else in another branch', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { pool: false, ownerId: 'u-ops2', branchId: 'b-mst' }))
    expect(canSeeTask(d, t, d.users.find((x) => x.id === 'u-ops3')!)).toBe(false)
    expect(canSeeTask(d, t, d.users.find((x) => x.id === 'u-ops2')!)).toBe(true)
    expect(canSeeTask(d, t, d.users.find((x) => x.id === 'u-mgr2')!)).toBe(true) // a manager in scope
    as(d, 'u-ops3')
    expect(err(() => claimTask(d, t.id))?.code).toBe('FORBIDDEN')
  })
})

describe('creating and assigning', () => {
  it('Operations may create a task for themselves or for the pool, but not assign it to somebody else', () => {
    const d = mkDb()
    as(d, 'u-ops1')
    expect(err(() => createTask(d, input(d, { pool: false, ownerId: 'u-ops1', branchId: 'b-sjj' })))).toBeNull()
    expect(err(() => createTask(d, input(d, { pool: true, branchId: 'b-sjj' })))).toBeNull()
    expect(err(() => createTask(d, input(d, { pool: false, ownerId: 'u-ops2', branchId: 'b-mst' })))?.code).toBe('FORBIDDEN')
  })
  it('a task cannot be assigned to somebody outside its branch scope; a title and an owner or pool are required', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    expect(err(() => createTask(d, input(d, { pool: false, ownerId: 'u-ops3', branchId: 'b-sjj' })))?.fields.owner).toBeTruthy()
    expect(err(() => createTask(d, input(d, { title: 'x' })))?.fields.title).toBeTruthy()
    expect(err(() => createTask(d, input(d, { pool: false })))?.fields.owner).toBeTruthy()
  })
  it('a task created from a record carries the link, and the record is not changed by creating or completing the task', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const rental = d.rentals.find((r) => r.status === 'delivered')!
    const before = JSON.stringify(rental)
    const t = createTask(d, input(d, { pool: false, ownerId: 'u-mgr', link: { type: 'rental', id: rental.id } }))
    expect(t.link).toEqual({ type: 'rental', id: rental.id })
    startTask(d, t.id)
    completeTask(d, t.id, 'bitti')
    expect(t.status).toBe('done')
    expect(JSON.stringify(d.rentals.find((r) => r.id === rental.id))).toBe(before)
  })
  it('creating notifies the owner, the pool members and nobody else', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const n0 = d.notifications.length
    const t = createTask(d, input(d, { pool: false, ownerId: 'u-ops1', branchId: 'b-sjj' }))
    const mine = d.notifications.slice(n0).filter((n) => n.link?.id === t.id)
    expect(mine.map((n) => n.userId)).toEqual(['u-ops1'])
    const n1 = d.notifications.length
    const p = createTask(d, input(d, { branchId: 'b-dbv' }))
    const who = d.notifications.slice(n1).filter((n) => n.link?.id === p.id).map((n) => n.userId)
    expect(who).toContain('u-ops3')
    expect(who).not.toContain('u-ops1')
    expect(who).not.toContain('u-mgr') // the creator is not notified of their own task
  })
})

describe('claiming: only one person wins', () => {
  it('the second claim is refused with a CONFLICT that names the first claimer', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj' }))
    as(d, 'u-ops1')
    claimTask(d, t.id, t.version)
    expect(t.ownerId).toBe('u-ops1')
    expect(t.pool).toBe(false)
    as(d, 'u-fleet')
    const e = err(() => claimTask(d, t.id))
    expect(e?.code).toBe('CONFLICT')
    expect(e?.message).toContain('Haris Mehić')
    expect(t.ownerId).toBe('u-ops1')
  })
  it('a claim on a stale view is refused even if the task looks free (version check)', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj' }))
    const seen = t.version
    postponeTask(d, t.id, due(d, 48), 'plan değişti') // somebody changed it meanwhile
    as(d, 'u-ops1')
    expect(err(() => claimTask(d, t.id, seen))?.code).toBe('CONFLICT')
    expect(err(() => claimTask(d, t.id, t.version))).toBeNull()
  })
  it('a claim through the committed state is atomic: a failed action leaves the task untouched', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj' }))
    const before = JSON.stringify(t)
    as(d, 'u-ops2')
    expect(err(() => claimTask(d, t.id))).not.toBeNull()
    expect(JSON.stringify(d.tasks.find((x) => x.id === t.id))).toBe(before)
  })
})

describe('lifecycle and history', () => {
  it('claim → start → complete is recorded with who did what', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj' }))
    as(d, 'u-ops1')
    claimTask(d, t.id)
    startTask(d, t.id)
    completeTask(d, t.id)
    const actions = t.history.map((h) => h.action)
    expect(actions.length).toBeGreaterThanOrEqual(5)
    expect(t.history.every((h) => h.by === 'u-mgr' || h.by === 'u-ops1')).toBe(true)
    expect(t.status).toBe('done')
    expect(t.doneAt).toBeTruthy()
    expect(t.version).toBeGreaterThanOrEqual(4)
  })
  it('only the owner or a manager can start or complete; an unclaimed pool task must be claimed first', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { branchId: 'b-sjj' }))
    as(d, 'u-ops1')
    expect(err(() => completeTask(d, t.id))?.message).toMatch(/üstlen|Claim/i)
    claimTask(d, t.id)
    as(d, 'u-fleet')
    expect(err(() => completeTask(d, t.id))?.code).toBe('FORBIDDEN')
  })
  it('reassign, release to the pool, postpone and cancel all keep a reasoned history', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { pool: false, ownerId: 'u-ops1', branchId: 'b-sjj' }))
    reassignTask(d, t.id, 'u-fleet', 'vardiya devri')
    expect(t.ownerId).toBe('u-fleet')
    as(d, 'u-fleet')
    releaseTask(d, t.id)
    expect(t.pool).toBe(true)
    expect(t.ownerId).toBeUndefined()
    as(d, 'u-mgr')
    expect(err(() => postponeTask(d, t.id, due(d, 48), ''))?.fields.reason).toBeTruthy()
    postponeTask(d, t.id, due(d, 48), 'müşteri ertelendi')
    expect(err(() => cancelTask(d, t.id, 'x'))?.fields.reason).toBeTruthy()
    cancelTask(d, t.id, 'artık gerekmiyor')
    expect(t.status).toBe('cancelled')
    expect(t.history.map((h) => h.action).join('|')).toMatch(/Devredildi|Reassigned/)
  })
  it('a completed or cancelled task is reopened only with a reason by its creator or a manager', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const t = createTask(d, input(d, { pool: false, ownerId: 'u-ops1', branchId: 'b-sjj' }))
    as(d, 'u-ops1')
    completeTask(d, t.id)
    expect(err(() => reopenTask(d, t.id, 'tekrar lazım'))?.code).toBe('FORBIDDEN') // the assignee is neither creator nor manager
    as(d, 'u-mgr')
    expect(err(() => reopenTask(d, t.id, 'ya'))?.fields.reason).toBeTruthy()
    reopenTask(d, t.id, 'iş tam bitmemişti')
    expect(t.status).toBe('open')
    expect(t.doneAt).toBeUndefined()
    expect(t.history.map((h) => h.action).join('|')).toMatch(/Yeniden açıldı|Reopened/)
  })
})

describe('bulk actions', () => {
  it('bulk complete finishes the eligible tasks and lists the skipped ones with the reason', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const a = createTask(d, input(d, { pool: false, ownerId: 'u-mgr', title: 'Toplu A' }))
    const b = createTask(d, input(d, { pool: false, ownerId: 'u-mgr', title: 'Toplu B' }))
    const c = createTask(d, input(d, { branchId: 'b-sjj', title: 'Toplu havuz' })) // still unclaimed
    cancelTask(d, b.id, 'iptal edildi')
    const r = bulkComplete(d, [a.id, b.id, c.id])
    expect(r.done).toEqual([a.id])
    expect(r.skipped.map((s) => s.id).sort()).toEqual([b.id, c.id].sort())
    expect(r.skipped.every((s) => s.reason.length > 3)).toBe(true)
  })
  it('bulk assign needs the manager permission and skips tasks the person cannot take', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const a = createTask(d, input(d, { branchId: 'b-sjj', title: 'Atama A' }))
    const b = createTask(d, input(d, { branchId: 'b-dbv', title: 'Atama B' }))
    const r = bulkAssign(d, [a.id, b.id], 'u-ops1')
    expect(r.done).toEqual([a.id])
    expect(r.skipped.map((s) => s.id)).toEqual([b.id]) // Dubrovnik is outside the Sarajevo clerk's scope
    as(d, 'u-ops1')
    expect(err(() => bulkAssign(d, [a.id], 'u-fleet'))?.code).toBe('FORBIDDEN')
    expect(err(() => bulkComplete(d, []))).not.toBeNull()
  })
  it('when nothing in the selection can be done the action is refused as a whole', () => {
    const d = mkDb()
    as(d, 'u-mgr')
    const b = createTask(d, input(d, { branchId: 'b-dbv', title: 'Sadece DBV' }))
    expect(err(() => bulkAssign(d, [b.id], 'u-ops1'))?.message).toMatch(/atanamadı|could be assigned/)
  })
})

describe('My Work (the inbox projection)', () => {
  it('lists my tasks, the pool tasks I can claim and approvals waiting for me, and reads the same numbers the Home counter reads', () => {
    const d = mkDb()
    as(d, 'u-ops1')
    const inbox = inboxOf(d)
    const mineTasks = d.tasks.filter((t) => (t.ownerId === 'u-ops1' || t.recipientIds.includes('u-ops1')) && (t.status === 'open' || t.status === 'in_progress'))
    expect(inbox.counts.tasks).toBe(mineTasks.length)
    expect(inbox.mine.filter((i) => i.kind === 'task' && i.reason === 'assigned').length).toBe(inbox.counts.tasks)
    expect(inbox.counts.mine).toBe(inbox.mine.length)
    // a Dubrovnik pool task never shows up for the Sarajevo clerk
    const dbvPool = d.tasks.find((t) => t.pool && t.branchId === 'b-dbv')!
    expect(inbox.mine.some((i) => i.link.id === dbvPool.id)).toBe(false)
  })
  it('does not leak unauthorized sources: a role without approval permission sees no approval rows', () => {
    const d = mkDb()
    as(d, 'u-fleet')
    const inbox = inboxOf(d)
    expect(inbox.mine.some((i) => i.kind === 'approval')).toBe(false)
    expect(inbox.counts.approvals).toBe(0)
  })
  it('an approval waits in the inbox of the person who may decide it, and not of the requester as "decide"', () => {
    const d = mkDb()
    const open = d.approvals.find((a) => a.status === 'requested')
    expect(open).toBeTruthy()
    as(d, open!.requesterId)
    const mine = inboxOf(d).mine.find((i) => i.link.id === open!.id)
    expect(mine?.reason ?? 'waiting').not.toBe('decide')
    const decider = d.users.find((u) => u.id !== open!.requesterId && u.status === 'active' && ['u-owner', 'u-mgr'].includes(u.id))!
    as(d, decider.id)
    expect(inboxOf(d).mine.some((i) => i.link.id === open!.id && i.reason === 'decide')).toBe(true)
    expect(meOf(d).id).toBe(decider.id)
  })
})
