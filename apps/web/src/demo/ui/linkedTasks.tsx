import { Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { userName } from '../core/helpers'
import { canSeeTask, isOpenTask } from '../core/ops/tasks'
import type { Id, LinkType, Task } from '../core/types'
import { L } from '../i18n'
import { TaskDialog } from '../pages/shared/FleetDialogs'
import { entityHref, useCan, useDb, useFmt } from './hooks'
import { btnSmall, Panel, Status } from './kit'

/** Tasks that point at one record, with "add task" that starts with the record already linked (O.C3). */
export function useLinkedTasks(type: LinkType, id: Id): Task[] {
  const d = useDb()
  return d.tasks.filter((t) => t.link?.type === type && t.link.id === id && canSeeTask(d, t))
}

export function LinkedTasks({ type, id, defaultTitle = '' }: { type: LinkType; id: Id; defaultTitle?: string }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const tasks = useLinkedTasks(type, id)
  const [adding, setAdding] = useState(false)
  const open = tasks.filter(isOpenTask).length
  const canAdd = can('tasks:create') || can('tasks:manage')
  return (
    <Panel
      title={
        <>
          {L('Görevler', 'Tasks')} <span className="tnum ml-1 rounded-md bg-ground px-1.5 text-[12px] font-normal text-ink-2" aria-label={L(`${open} açık görev`, `${open} open task(s)`)}>{open}</span>
        </>
      }
      description={L('Bu kayda bağlı görevler. Görevi tamamlamak kaydı değiştirmez.', 'Tasks linked to this record. Completing a task does not change the record.')}
      action={canAdd ? <button type="button" className={btnSmall} onClick={() => setAdding(true)}><Plus size={14} /> {L('Görev ekle', 'Add task')}</button> : undefined}
      flush
    >
      {tasks.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-2 sm:px-5">{L('Bu kayda bağlı görev yok.', 'No tasks linked to this record.')}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {tasks.map((t) => (
            <li key={t.id}>
              <Link to={entityHref('task', t.id) as never} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px] hover:bg-ground/60 sm:px-5">
                <span className="min-w-0">
                  <span className="font-medium">{t.title}</span>
                  <span className="block text-[12.5px] text-ink-2">
                    <span className="tnum">{t.no}</span> · {t.ownerId ? userName(d, t.ownerId) : t.pool ? L('Açık havuz', 'Open pool') : '—'} · <span className="tnum">{f.dt(t.dueAt, t.branchId)}</span>
                  </span>
                </span>
                <Status kind="task" value={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {adding && <TaskDialog link={{ type, id }} defaultTitle={defaultTitle} onClose={() => setAdding(false)} />}
    </Panel>
  )
}
