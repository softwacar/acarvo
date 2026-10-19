import { Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { userName } from '../../core/helpers'
import { claimTask, reassignTask, setTaskStatus } from '../../core/ops/fleet'
import type { Task } from '../../core/types'
import { L } from '../../i18n'
import { SelectF, userOptions } from '../../ui/forms'
import { entityHref, runAction, useBranchScope, useCan, useDb, useFmt, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Page, SearchBox, Status, Tabs, Timeline } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, RecordDrawer, useAct } from '../fleet/common'
import { TaskDialog } from '../shared/FleetDialogs'

type View = 'bana' | 'havuz' | 'ekip' | 'geciken' | 'biten'

export function TasksPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const me = useMe()
  const { active } = useBranchScope()
  const [view, setView] = useUrlState('gorunum', 'bana')
  const [q, setQ] = useUrlState('q')
  const [prio, setPrio] = useUrlState('oncelik', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const now = Date.parse(d.clock.now)
  const inScope = (t: Task) => !t.branchId || active.includes(t.branchId)
  const mine = (t: Task) => t.ownerId === me.id || t.recipientIds.includes(me.id)
  const late = (t: Task) => t.status !== 'done' && Date.parse(t.dueAt) < now
  const scoped = d.tasks.filter(inScope)
  const views: Record<View, (t: Task) => boolean> = {
    bana: (t) => mine(t) && t.status !== 'done',
    havuz: (t) => t.pool && !t.ownerId && t.status !== 'done',
    ekip: (t) => t.status !== 'done',
    geciken: late,
    biten: (t) => t.status === 'done',
  }
  const rows = scoped
    .filter(views[view as View] ?? views.bana)
    .filter((t) => (prio === 'all' ? true : t.priority === prio))
    .filter((t) => !q || `${t.no} ${t.title}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const cols: Col<Task>[] = [
    { id: 'no', header: L('Görev', 'Task'), cell: (t) => <span className="tnum whitespace-nowrap font-medium text-blue">{t.no}</span>, sort: (t) => t.no, csv: (t) => t.no },
    { id: 'title', header: L('Başlık', 'Title'), cell: (t) => <span className="line-clamp-1 font-medium">{t.title}</span>, csv: (t) => t.title },
    { id: 'prio', header: L('Öncelik', 'Priority'), cell: (t) => <Status kind="priority" value={t.priority} />, hideBelow: 'md', csv: (t) => t.priority },
    { id: 'own', header: L('Sorumlu', 'Owner'), cell: (t) => (t.ownerId ? userName(d, t.ownerId) : t.pool ? <span className="text-hold">{L('Açık havuz', 'Open pool')}</span> : '—'), hideBelow: 'md' },
    { id: 'due', header: L('Vade', 'Due'), cell: (t) => <span className={`tnum text-[13px] ${late(t) ? 'font-medium text-alert' : ''}`}>{f.dt(t.dueAt, t.branchId)}</span>, sort: (t) => t.dueAt, hideBelow: 'lg', csv: (t) => t.dueAt },
    { id: 'st', header: L('Durum', 'Status'), cell: (t) => <Status kind="task" value={t.status} />, sort: (t) => t.status, csv: (t) => t.status },
  ]
  const count = (v: View) => scoped.filter(views[v]).length
  const current = d.tasks.find((t) => t.id === sel)
  return (
    <Page
      title={L('Görevler', 'Tasks')}
      description={L('Görev bir kaydın yerine geçmez: görevi tamamlamak bağlı kiralama, bakım veya olayı kapatmaz.', 'A task does not replace a record: completing it does not close the linked rental, maintenance or incident.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('gorevler', cols, rows)}>CSV</button>
          {can('tasks:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Görev oluştur', 'Create task')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Bana atanan', 'Assigned to me'), value: count('bana') },
          { label: L('Açık havuz', 'Open pool'), value: count('havuz'), hint: L('Üstlenilebilir', 'Can be claimed') },
          { label: L('Geciken', 'Overdue'), value: count('geciken'), tone: count('geciken') ? 'alert' : undefined },
          { label: L('Tamamlanan', 'Completed'), value: count('biten') },
        ]}
      />
      <Tabs<View>
        label={L('Görev görünümleri', 'Task views')}
        value={(view as View) || 'bana'}
        onChange={setView}
        tabs={[
          { id: 'bana', label: L('Bana atanan', 'Mine'), count: count('bana') },
          { id: 'havuz', label: L('Açık havuz', 'Open pool'), count: count('havuz') },
          { id: 'ekip', label: L('Tüm açık görevler', 'All open'), count: count('ekip'), hidden: !can('tasks:manage') },
          { id: 'geciken', label: L('Geciken', 'Overdue'), count: count('geciken') },
          { id: 'biten', label: L('Tamamlanan', 'Completed') },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setPrio('all') }} active={q !== '' || prio !== 'all'}>
        <SearchBox label={L('Görevlerde ara', 'Search tasks')} placeholder={L('Görev, başlık…', 'Task, title…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Öncelik', 'Priority')} value={prio} onChange={setPrio} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'urgent', label: L('Acil', 'Urgent') }, { id: 'high', label: L('Yüksek', 'High') }, { id: 'normal', label: L('Normal', 'Normal') }]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(t) => t.id} label={L('Görev listesi', 'Task list')} urlKey="gr" defaultSort={{ id: 'due', dir: 'asc' }} onRowClick={(t) => setSel(t.id)} empty={<Empty title={view === 'havuz' ? L('Açık havuzda görev yok', 'No tasks in the open pool') : L('Bu görünümde görev yok', 'No tasks in this view')} />} />
      {adding && <TaskDialog onClose={() => setAdding(false)} />}
      {current && <Drawer t={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ t, onClose }: { t: Task; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const me = useMe()
  const { act, error } = useAct()
  const [reassign, setReassign] = useState(false)
  const mine = t.ownerId === me.id || t.recipientIds.includes(me.id)
  const link = t.link
  return (
    <RecordDrawer title={t.no} subtitle={t.title} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="task" value={t.status} />],
          [L('Öncelik', 'Priority'), <Status key="p" kind="priority" value={t.priority} />],
          [L('Sorumlu', 'Owner'), t.ownerId ? userName(d, t.ownerId) : t.pool ? L('Açık havuz (üstlenilmedi)', 'Open pool (unclaimed)') : '—'],
          [L('Alıcılar', 'Recipients'), t.recipientIds.length ? t.recipientIds.map((u) => userName(d, u)).join(', ') : '—'],
          [L('Vade', 'Due'), f.dt(t.dueAt, t.branchId)],
          [L('Şube', 'Branch'), d.branches.find((b) => b.id === t.branchId)?.name ?? L('Tüm şubeler', 'All branches')],
          [L('Açıklama', 'Description'), t.description || '—'],
          [L('Bağlı kayıt', 'Linked record'), link ? <Link key="l" to={entityHref(link.type, link.id) as never} className="text-blue hover:underline">{link.type} · {link.id}</Link> : '—'],
        ]}
      />
      {t.status !== 'done' && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {t.pool && !t.ownerId && <ActBtn onClick={() => act((s) => claimTask(s, t.id), L('Görevi üstlendiniz.', 'You claimed the task.'))}>{L('Üstlen', 'Claim')}</ActBtn>}
            {(mine || can('tasks:manage')) && t.status === 'open' && !t.pool && <ActBtn onClick={() => act((s) => setTaskStatus(s, t.id, 'in_progress'))}>{L('Başla', 'Start')}</ActBtn>}
            {(mine || can('tasks:manage')) && <ActBtn onClick={() => act((s) => setTaskStatus(s, t.id, 'done'), L('Görev tamamlandı. Bağlı kayıt ayrıca işlem gerektirir.', 'Task completed. The linked record still needs its own action.'))}>{L('Tamamla', 'Complete')}</ActBtn>}
            {can('tasks:manage') && <ActBtn onClick={() => setReassign(true)}>{L('Devret', 'Reassign')}</ActBtn>}
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={t.history} /></DrawerSection>
      {reassign && <ReassignDialog t={t} onClose={() => setReassign(false)} />}
    </RecordDrawer>
  )
}

function ReassignDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const d = useDb()
  const [owner, setOwner] = useState(t.ownerId ?? '')
  return (
    <FinanceDialog
      title={L('Görevi devret', 'Reassign task')}
      description={L('Yeni sorumluya uygulama içi bildirim düşer (e-posta veya SMS gönderilmez).', 'The new owner gets an in-app notification (no email or SMS is sent).')}
      confirm={L('Devret', 'Reassign')}
      onClose={onClose}
      onSubmit={() => {
        if (!owner) return L('Yeni sorumluyu seçin.', 'Choose the new owner.')
        const r = runAction((s) => reassignTask(s, t.id, owner), L('Görev devredildi.', 'Task reassigned.'))
        if (!r.ok) return r.error
        onClose()
      }}
    >
      <SelectF id="ra-o" label={L('Yeni sorumlu', 'New owner')} value={owner} onChange={setOwner} placeholder={L('Seçin', 'Choose')} options={userOptions(d)} />
    </FinanceDialog>
  )
}
