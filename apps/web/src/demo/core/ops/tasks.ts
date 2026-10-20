import { B, loc } from '../../i18n'
import { addHistory, fail, hasPerm, logEvent, meOf, nextId, nextNo, nowOf, notify, scopeBranches, userName } from '../helpers'
import type { Db, DemoUser, Id, Iso, LinkType, Task, TaskPriority } from '../types'

// Tasks (decision document D). A task is an owned, dated piece of work. Completing a task changes only the task: the
// linked rental, maintenance or damage record keeps its own state and still needs its own action (D.6).
//
// Concurrency: every task carries a `version` that grows with each change. A claim carries the version the user was
// looking at; a second claim, or a claim on a stale view, is refused with the CONFLICT code. That is the browser model
// of the HTTP 409 the real service will return. Inside one tab the state change is atomic (commit() works on a copy);
// across tabs it is best effort, see store.ts (BroadcastChannel adoption).

export interface TaskInput {
  title: string
  description: string
  priority: TaskPriority
  dueAt: Iso
  ownerId?: Id
  recipientIds: Id[]
  pool: boolean
  branchId?: Id
  /** Pool only: restrict who may claim by role (empty = every eligible role). */
  poolRoleIds?: Id[]
  link?: { type: LinkType; id: Id }
}

export const isOpenTask = (t: Task) => t.status === 'open' || t.status === 'in_progress'
export const isMyTask = (t: Task, userId: Id) => t.ownerId === userId || t.recipientIds.includes(userId)

const branchInScope = (d: Db, branchId: Id | undefined, user: DemoUser) => !branchId || scopeBranches(d, user).includes(branchId)

/** May this person claim the task from the open pool? Branch scope, role filter and the view permission all apply. */
export function canClaim(d: Db, t: Task, user: DemoUser): boolean {
  if (!t.pool || t.ownerId || !isOpenTask(t)) return false
  if (!hasPerm(d, 'tasks:view', user)) return false
  if (!branchInScope(d, t.branchId, user)) return false
  return !t.poolRoleIds?.length || t.poolRoleIds.includes(user.roleId)
}

/**
 * Who sees a task: the people it is assigned to, its creator, the people who may claim it from the pool, and managers
 * inside their branch scope. Everybody else (another branch, another role) does not see it at all.
 */
export function canSeeTask(d: Db, t: Task, user: DemoUser = meOf(d)): boolean {
  if (!hasPerm(d, 'tasks:view', user)) return false
  if (isMyTask(t, user.id) || t.createdBy === user.id) return true
  if (canClaim(d, t, user)) return true
  return hasPerm(d, 'tasks:manage', user) && branchInScope(d, t.branchId, user)
}

const mayManage = (d: Db) => hasPerm(d, 'tasks:manage')
const bump = (t: Task) => {
  t.version += 1
}

const find = (d: Db, id: Id): Task => {
  const t = d.tasks.find((x) => x.id === id)
  if (!t) fail(B('Görev bulunamadı.', 'Task not found.'))
  if (!canSeeTask(d, t!)) fail(B('Bu görev yetkiniz veya şube kapsamınız dışında.', 'This task is outside your permissions or branch scope.'), {}, 'FORBIDDEN')
  return t!
}

const assignable = (d: Db, userId: Id, branchId: Id | undefined): string | null => {
  const u = d.users.find((x) => x.id === userId)
  if (!u || u.status !== 'active') return B('Seçilen kullanıcı etkin değil.', 'The chosen user is not active.')
  if (!hasPerm(d, 'tasks:view', u)) return B(`${u.name} görevleri görme yetkisine sahip değil.`, `${u.name} cannot view tasks.`)
  if (!branchInScope(d, branchId, u)) return B(`${u.name} bu şubenin kapsamında değil.`, `${u.name} is not in this branch's scope.`)
  return null
}

export function createTask(d: Db, input: TaskInput): Task {
  const me = meOf(d)
  if (!hasPerm(d, 'tasks:create') && !mayManage(d)) fail(B('Görev oluşturma için yetkiniz yok (tasks:create). Demo rolünü değiştirerek deneyebilirsiniz.', 'You do not have permission to create tasks (tasks:create). Try switching the demo role.'), {}, 'FORBIDDEN')
  const fields: Record<string, string> = {}
  if (input.title.trim().length < 3) fields.title = B('Başlık zorunlu', 'A title is required')
  if (Number.isNaN(Date.parse(input.dueAt))) fields.due = B('Son tarihi girin', 'Enter a due date')
  if (!input.pool && !input.ownerId && input.recipientIds.length === 0) fields.owner = B('Sorumlu veya havuz seçin', 'Choose an owner or the pool')
  if (Object.keys(fields).length) fail(B('Görev formunda eksik veya geçersiz alanlar var.', 'The task form has missing or invalid fields.'), fields)
  if (!branchInScope(d, input.branchId, me)) fail(B('Şubenizin kapsamı dışında görev oluşturamazsınız.', 'You cannot create a task outside your branch scope.'), { branch: B('Şube kapsamı dışında', 'Outside your branch scope') }, 'FORBIDDEN')
  for (const uid of new Set([input.ownerId, ...input.recipientIds].filter(Boolean) as Id[])) {
    if (uid !== me.id && !mayManage(d)) fail(B('Başkasına görev atamak için yetkiniz yok (tasks:manage). Görevi açık havuza koyabilir veya kendinize atayabilirsiniz.', 'You cannot assign a task to somebody else (tasks:manage). Put it in the open pool or assign it to yourself.'), { owner: B('Atama yetkisi yok', 'No assignment permission') }, 'FORBIDDEN')
    const problem = assignable(d, uid, input.branchId)
    if (problem) fail(problem, { owner: problem })
  }
  const t: Task = {
    id: nextId(d, 'tk'),
    no: nextNo(d, 'GR'),
    title: input.title.trim(),
    description: input.description,
    priority: input.priority,
    status: 'open',
    dueAt: input.dueAt,
    createdBy: me.id,
    createdAt: nowOf(d),
    ownerId: input.pool ? undefined : input.ownerId,
    recipientIds: input.pool ? [] : input.recipientIds,
    pool: input.pool,
    branchId: input.branchId,
    poolRoleIds: input.pool ? input.poolRoleIds : undefined,
    link: input.link,
    version: 1,
    history: [],
  }
  d.tasks.push(t)
  const who = [t.ownerId, ...t.recipientIds].filter(Boolean).map((u) => userName(d, u as Id)).join(', ')
  addHistory(d, t.history, B('Oluşturuldu', 'Created'), B(`${userName(d, me.id)} oluşturdu.`, `Created by ${userName(d, me.id)}.`))
  if (t.pool) addHistory(d, t.history, B('Havuza eklendi', 'Added to the pool'), B('Uygun personel görevi üstlenebilir.', 'An eligible employee can claim it.'))
  else addHistory(d, t.history, B('Atandı', 'Assigned'), B(`${userName(d, me.id)} → ${who}`, `${userName(d, me.id)} → ${who}`))
  logEvent(d, { module: 'tasks', type: 'TaskCreated', sourceType: 'task', sourceId: t.id, summary: `${t.no} · ${t.title}`, branchId: t.branchId })
  for (const u of new Set([t.ownerId, ...t.recipientIds].filter(Boolean) as Id[])) if (u !== me.id) notify(d, u, B(`Size görev atandı: ${t.title}`, `A task was assigned to you: ${t.title}`), { type: 'task', id: t.id }, 'task')
  if (t.pool) for (const u of d.users) if (u.id !== me.id && u.status === 'active' && canClaim(d, t, u)) notify(d, u.id, B(`Havuza yeni görev düştü: ${t.title}`, `A new task is in the pool: ${t.title}`), { type: 'task', id: t.id }, 'task')
  return t
}

/** Claims a pool task. `expectedVersion` is the version the person was looking at (optional). */
export function claimTask(d: Db, id: Id, expectedVersion?: number): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isOpenTask(t)) fail(B('Tamamlanmış veya iptal edilmiş görev üstlenilemez.', 'A completed or cancelled task cannot be claimed.'))
  if (t.ownerId && t.ownerId !== me.id) fail(B(`Bu görevi az önce ${userName(d, t.ownerId)} üstlendi. Listeyi yenileyin.`, `${userName(d, t.ownerId)} has just claimed this task. Refresh the list.`), { owner: userName(d, t.ownerId) }, 'CONFLICT')
  if (t.ownerId === me.id) fail(B('Bu görevi zaten siz üstlendiniz.', 'You have already claimed this task.'), {}, 'CONFLICT')
  if (expectedVersion !== undefined && expectedVersion !== t.version) fail(B('Görev siz bakarken değişti. Listeyi yenileyip tekrar deneyin.', 'The task changed while you were looking at it. Refresh and try again.'), {}, 'CONFLICT')
  if (!t.pool) fail(B('Bu görev açık havuzda değil.', 'This task is not in the open pool.'))
  if (!canClaim(d, t, me)) fail(B('Bu görevi üstlenme yetkiniz yok: şube kapsamı veya rol filtresi uygun değil.', 'You cannot claim this task: your branch scope or role does not match.'), {}, 'FORBIDDEN')
  t.ownerId = me.id
  t.pool = false
  bump(t)
  addHistory(d, t.history, B('Üstlenildi', 'Claimed'), B(`${me.name} görevi üstlendi.`, `${me.name} claimed the task.`))
  logEvent(d, { module: 'tasks', type: 'TaskClaimed', sourceType: 'task', sourceId: id, summary: B(`${t.no} üstlenildi`, `${t.no} claimed`), branchId: t.branchId })
  return t
}

export function startTask(d: Db, id: Id): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isMyTask(t, me.id) && !mayManage(d)) fail(B('Görevi yalnız sorumlusu veya yönetici başlatabilir.', 'Only the owner or a manager can start the task.'), {}, 'FORBIDDEN')
  if (t.pool && !t.ownerId) fail(B('Önce görevi üstlenin.', 'Claim the task first.'))
  if (t.status !== 'open') fail(B('Yalnız açık görev başlatılır.', 'Only an open task can be started.'))
  t.status = 'in_progress'
  bump(t)
  addHistory(d, t.history, B('Başlatıldı', 'Started'), B(`${me.name} görevi başlattı.`, `${me.name} started the task.`))
  logEvent(d, { module: 'tasks', type: 'TaskStarted', sourceType: 'task', sourceId: id, summary: B(`${t.no} başlatıldı`, `${t.no} started`), branchId: t.branchId })
  return t
}

export function completeTask(d: Db, id: Id, note = ''): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isMyTask(t, me.id) && !mayManage(d)) fail(B('Görevi yalnız sorumlusu veya yönetici tamamlayabilir.', 'Only the owner or a manager can complete the task.'), {}, 'FORBIDDEN')
  if (t.pool && !t.ownerId) fail(B('Havuzdaki görevi tamamlamadan önce üstlenin.', 'Claim a pool task before completing it.'))
  if (!isOpenTask(t)) fail(B('Bu görev zaten kapalı.', 'This task is already closed.'))
  t.status = 'done'
  t.doneAt = nowOf(d)
  bump(t)
  // Only the task changes. The linked rental / maintenance / damage record is untouched on purpose (decision D.6).
  addHistory(d, t.history, B('Tamamlandı', 'Completed'), `${note ? note + ' · ' : ''}${B('Görev tamamlandı. Bağlı kayıt ayrıca işlem gerektirir.', 'Task completed. The linked record still needs its own action.')}`)
  logEvent(d, { module: 'tasks', type: 'TaskCompleted', sourceType: 'task', sourceId: id, summary: `${t.no} → ${B('tamamlandı', 'completed')}`, branchId: t.branchId })
  if (t.createdBy !== me.id) notify(d, t.createdBy, B(`Görev tamamlandı: ${t.title}`, `Task completed: ${t.title}`), { type: 'task', id }, 'task')
  return t
}

export function reassignTask(d: Db, id: Id, toUserId: Id, note = ''): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isOpenTask(t)) fail(B('Kapalı görev devredilemez.', 'A closed task cannot be reassigned.'))
  if (!(t.ownerId === me.id || t.createdBy === me.id || mayManage(d))) fail(B('Görevi yalnız sorumlusu, oluşturanı veya yönetici devredebilir.', 'Only the owner, the creator or a manager can reassign the task.'), {}, 'FORBIDDEN')
  if (t.ownerId === toUserId) fail(B('Görev zaten bu kişide.', 'The task is already with this person.'))
  const problem = assignable(d, toUserId, t.branchId)
  if (problem) fail(problem, { owner: problem })
  const from = t.ownerId
  t.ownerId = toUserId
  t.recipientIds = t.recipientIds.filter((u) => u !== toUserId)
  t.pool = false
  bump(t)
  addHistory(d, t.history, B('Devredildi', 'Reassigned'), `${from ? userName(d, from) : B('Havuz', 'Pool')} → ${userName(d, toUserId)}${note ? ` · ${note}` : ''}`)
  logEvent(d, { module: 'tasks', type: 'TaskReassigned', sourceType: 'task', sourceId: id, summary: `${t.no} → ${userName(d, toUserId)}`, branchId: t.branchId })
  if (toUserId !== me.id) notify(d, toUserId, B(`Görev size devredildi: ${t.title}`, `A task was reassigned to you: ${t.title}`), { type: 'task', id }, 'task')
  return t
}

/** The owner hands the task back to the open pool (the history says who released it). */
export function releaseTask(d: Db, id: Id): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isOpenTask(t) || t.ownerId !== me.id) fail(B('Yalnız üstlendiğiniz açık görevi havuza bırakabilirsiniz.', 'You can release only an open task that you own.'))
  t.ownerId = undefined
  t.pool = true
  t.status = 'open'
  bump(t)
  addHistory(d, t.history, B('Havuza bırakıldı', 'Released to the pool'), B(`${me.name} görevi havuza geri bıraktı.`, `${me.name} released the task back to the pool.`))
  logEvent(d, { module: 'tasks', type: 'TaskReleased', sourceType: 'task', sourceId: id, summary: B(`${t.no} havuza bırakıldı`, `${t.no} released`), branchId: t.branchId })
  return t
}

export function reopenTask(d: Db, id: Id, reason: string): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (t.status !== 'done' && t.status !== 'cancelled') fail(B('Yalnız tamamlanmış veya iptal edilmiş görev yeniden açılır.', 'Only a completed or cancelled task can be reopened.'))
  if (!(mayManage(d) || t.createdBy === me.id)) fail(B('Görevi yalnız oluşturanı veya yönetici yeniden açabilir.', 'Only the creator or a manager can reopen the task.'), {}, 'FORBIDDEN')
  if (reason.trim().length < 5) fail(B('Yeniden açma gerekçesini yazın.', 'Enter the reason for reopening.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  t.status = 'open'
  t.doneAt = undefined
  bump(t)
  addHistory(d, t.history, B('Yeniden açıldı', 'Reopened'), `${me.name}: ${reason}`)
  logEvent(d, { module: 'tasks', type: 'TaskReopened', sourceType: 'task', sourceId: id, summary: B(`${t.no} yeniden açıldı`, `${t.no} reopened`), reason, branchId: t.branchId })
  if (t.ownerId && t.ownerId !== me.id) notify(d, t.ownerId, B(`Görev yeniden açıldı: ${t.title}`, `Task reopened: ${t.title}`), { type: 'task', id }, 'task')
  return t
}

export function cancelTask(d: Db, id: Id, reason: string): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isOpenTask(t)) fail(B('Kapalı görev iptal edilemez.', 'A closed task cannot be cancelled.'))
  if (!(mayManage(d) || t.createdBy === me.id)) fail(B('Görevi yalnız oluşturanı veya yönetici iptal edebilir.', 'Only the creator or a manager can cancel the task.'), {}, 'FORBIDDEN')
  if (reason.trim().length < 5) fail(B('İptal gerekçesini yazın.', 'Enter the reason for cancelling.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  t.status = 'cancelled'
  bump(t)
  addHistory(d, t.history, B('İptal edildi', 'Cancelled'), `${me.name}: ${reason}`)
  logEvent(d, { module: 'tasks', type: 'TaskCancelled', sourceType: 'task', sourceId: id, summary: B(`${t.no} iptal edildi`, `${t.no} cancelled`), reason, branchId: t.branchId })
  return t
}

export function postponeTask(d: Db, id: Id, newDue: Iso, reason: string): Task {
  const t = find(d, id)
  const me = meOf(d)
  if (!isOpenTask(t)) fail(B('Kapalı görev ertelenemez.', 'A closed task cannot be postponed.'))
  if (!(isMyTask(t, me.id) || t.createdBy === me.id || mayManage(d))) fail(B('Görevi yalnız sorumlusu, oluşturanı veya yönetici erteleyebilir.', 'Only the owner, the creator or a manager can postpone the task.'), {}, 'FORBIDDEN')
  if (Number.isNaN(Date.parse(newDue)) || Date.parse(newDue) <= Date.parse(nowOf(d))) fail(B('Yeni son tarih gelecekte olmalı.', 'The new due date must be in the future.'), { due: B('Gelecek bir tarih girin', 'Enter a future date') })
  if (reason.trim().length < 3) fail(B('Erteleme gerekçesini yazın.', 'Enter the reason for postponing.'), { reason: B('Gerekçe zorunlu', 'A reason is required') })
  const old = t.dueAt
  t.dueAt = newDue
  bump(t)
  addHistory(d, t.history, B('Ertelendi', 'Postponed'), `${old.slice(0, 16).replace('T', ' ')} → ${newDue.slice(0, 16).replace('T', ' ')} · ${reason}`)
  logEvent(d, { module: 'tasks', type: 'TaskPostponed', sourceType: 'task', sourceId: id, summary: B(`${t.no} ertelendi`, `${t.no} postponed`), reason, branchId: t.branchId })
  return t
}

// --------------------------------------------------------------------------- bulk (select several, then act)

export interface BulkResult {
  done: Id[]
  skipped: { id: Id; no: string; reason: string }[]
}

/** Assigns every eligible selected task to one person. Tasks that cannot be assigned are skipped with the reason. */
export function bulkAssign(d: Db, ids: Id[], toUserId: Id): BulkResult {
  if (!ids.length) fail(B('Önce görev seçin.', 'Select tasks first.'))
  if (!mayManage(d)) fail(B('Toplu atama için yetkiniz yok (tasks:manage).', 'You cannot bulk-assign tasks (tasks:manage).'), {}, 'FORBIDDEN')
  const res: BulkResult = { done: [], skipped: [] }
  for (const id of ids) {
    const t = d.tasks.find((x) => x.id === id)
    if (!t) continue
    try {
      if (!canSeeTask(d, t)) throw new Error(B('Şube kapsamı dışında', 'Outside your branch scope'))
      if (!isOpenTask(t)) throw new Error(B('Görev kapalı', 'The task is closed'))
      const problem = assignable(d, toUserId, t.branchId)
      if (problem) throw new Error(problem)
      if (t.ownerId === toUserId) throw new Error(B('Zaten bu kişide', 'Already with this person'))
      reassignTask(d, id, toUserId, B('Toplu atama', 'Bulk assignment'))
      res.done.push(id)
    } catch (e) {
      res.skipped.push({ id, no: t.no, reason: loc((e as Error).message) })
    }
  }
  if (!res.done.length) fail(B(`Hiçbir görev atanamadı: ${res.skipped.map((s) => `${s.no} (${s.reason})`).join('; ')}`, `No task could be assigned: ${res.skipped.map((s) => `${s.no} (${s.reason})`).join('; ')}`))
  return res
}

/** Completes every eligible selected task; the others are skipped with the reason. */
export function bulkComplete(d: Db, ids: Id[]): BulkResult {
  if (!ids.length) fail(B('Önce görev seçin.', 'Select tasks first.'))
  const res: BulkResult = { done: [], skipped: [] }
  for (const id of ids) {
    const t = d.tasks.find((x) => x.id === id)
    if (!t) continue
    try {
      completeTask(d, id, B('Toplu tamamlama', 'Bulk completion'))
      res.done.push(id)
    } catch (e) {
      res.skipped.push({ id, no: t.no, reason: loc((e as Error).message) })
    }
  }
  if (!res.done.length) fail(B(`Hiçbir görev tamamlanamadı: ${res.skipped.map((s) => `${s.no} (${s.reason})`).join('; ')}`, `No task could be completed: ${res.skipped.map((s) => `${s.no} (${s.reason})`).join('; ')}`))
  return res
}
