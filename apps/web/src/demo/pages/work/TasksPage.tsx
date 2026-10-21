import { Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { userName } from '../../core/helpers'
import { recordLabel, bulkAssign, bulkComplete, canClaim, canSeeTask, cancelTask, claimTask, completeTask, isMyTask, isOpenTask, postponeTask, reassignTask, releaseTask, reopenTask, startTask } from '../../core/ops/tasks'
import type { Task } from '../../core/types'
import { L } from '../../i18n'
import { DateTimeF, SelectF, userOptions } from '../../ui/forms'
import { entityHref, runAction, useBranchScope, useCan, useDb, useFmt, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Notice, Page, SearchBox, Status, Tabs, Timeline } from '../../ui/kit'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { ActBtn, ActionRow, DrawerSection, PromptDialog, RecordDrawer, useAct } from '../fleet/common'
import { TaskDialog } from '../shared/FleetDialogs'

// Tasks (decision document D): create, assign, open pool, claim, start, complete, hand over, reopen, bulk actions,
// history, branch and role visibility. A task never completes the record it points at.

type View = 'bana' | 'havuz' | 'ekip' | 'geciken' | 'biten'
const LINK_LABEL = (): Record<string, string> => ({ vehicle: L('Araç', 'Vehicle'), rental: L('Kiralama', 'Rental'), reservation: L('Rezervasyon', 'Reservation'), customer: L('Müşteri', 'Customer'), maintenance: L('Bakım', 'Maintenance'), damage: L('Hasar', 'Damage'), incident: L('Olay', 'Incident'), fine: L('Ceza', 'Fine'), corporate: L('Kurumsal hesap', 'Corporate account') })

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
  const [picked, setPicked] = useState<string[]>([])
  const [bulk, setBulk] = useState<null | 'assign'>(null)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const now = Date.parse(d.clock.now)
  // Visibility is decided by the task rules (assignment, pool eligibility, manager scope); the header branch filter narrows it further.
  const inFilter = (t: Task) => !t.branchId || active.includes(t.branchId)
  const late = (t: Task) => isOpenTask(t) && Date.parse(t.dueAt) < now
  const scoped = useMemo(() => d.tasks.filter((t) => canSeeTask(d, t, me) && inFilter(t)), [d, me, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const views: Record<View, (t: Task) => boolean> = {
    bana: (t) => isMyTask(t, me.id) && isOpenTask(t),
    havuz: (t) => canClaim(d, t, me),
    ekip: (t) => isOpenTask(t),
    geciken: late,
    biten: (t) => t.status === 'done' || t.status === 'cancelled',
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
    { id: 'own', header: L('Sorumlu', 'Owner'), cell: (t) => (t.ownerId ? userName(d, t.ownerId) : t.pool ? <span className="text-hold">{L('Açık havuz', 'Open pool')}</span> : t.recipientIds.length ? t.recipientIds.map((u) => userName(d, u)).join(', ') : '—'), hideBelow: 'md' },
    { id: 'due', header: L('Vade', 'Due'), cell: (t) => <span className={`tnum text-[13px] ${late(t) ? 'font-medium text-alert' : ''}`}>{f.dt(t.dueAt, t.branchId)}{late(t) && <span className="ml-1.5 rounded bg-alert-soft px-1.5 text-[11.5px]">{L('Gecikti', 'Overdue')}</span>}</span>, sort: (t) => t.dueAt, hideBelow: 'lg', csv: (t) => t.dueAt },
    { id: 'st', header: L('Durum', 'Status'), cell: (t) => <Status kind="task" value={t.status} />, sort: (t) => t.status, csv: (t) => t.status },
  ]
  const count = (v: View) => scoped.filter(views[v]).length
  const current = d.tasks.find((t) => t.id === sel && canSeeTask(d, t, me))
  const manage = can('tasks:manage')
  const canAdd = can('tasks:create') || manage
  const togglePick = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  const selectCol: Col<Task> = {
    id: 'pick',
    header: L('Seç', 'Select'),
    cell: (t) => <input type="checkbox" aria-label={`${L('Seç', 'Select')} ${t.no}`} checked={picked.includes(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePick(t.id)} className="size-4 accent-[var(--ac-blue)]" />,
  }
  const doBulkComplete = () => {
    const r = runAction((s) => bulkComplete(s, picked))
    if (!r.ok) return setBulkMsg(r.error)
    setBulkMsg(L(`${r.value.done.length} görev tamamlandı${r.value.skipped.length ? `; ${r.value.skipped.length} görev atlandı: ${r.value.skipped.map((x) => `${x.no} (${x.reason})`).join('; ')}` : ''}.`, `${r.value.done.length} task(s) completed${r.value.skipped.length ? `; ${r.value.skipped.length} skipped: ${r.value.skipped.map((x) => `${x.no} (${x.reason})`).join('; ')}` : ''}.`))
    setPicked([])
  }
  return (
    <Page
      title={L('Görevler', 'Tasks')}
      description={L('Görev bir kaydın yerine geçmez: görevi tamamlamak bağlı kiralama, bakım veya hasarı kapatmaz. Görevler yetkinize, şube kapsamınıza ve rolünüze göre görünür.', 'A task does not replace a record: completing it does not close the linked rental, maintenance or damage. Tasks follow your permissions, branch scope and role.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('gorevler', cols, rows)}>CSV</button>
          {canAdd && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Görev oluştur', 'Create task')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Bana atanan', 'Assigned to me'), value: count('bana') },
          { label: L('Açık havuz', 'Open pool'), value: count('havuz'), hint: L('Üstlenebilirsiniz', 'You can claim') },
          { label: L('Geciken', 'Overdue'), value: count('geciken'), tone: count('geciken') ? 'alert' : undefined },
          { label: L('Kapanan', 'Closed'), value: count('biten') },
        ]}
      />
      <Tabs<View>
        label={L('Görev görünümleri', 'Task views')}
        value={(view as View) || 'bana'}
        onChange={(v) => { setView(v); setPicked([]); setBulkMsg(null) }}
        tabs={[
          { id: 'bana', label: L('Bana atanan', 'Mine'), count: count('bana') },
          { id: 'havuz', label: L('Açık havuz', 'Open pool'), count: count('havuz') },
          { id: 'ekip', label: L('Tüm açık görevler', 'All open'), count: count('ekip'), hidden: !manage },
          { id: 'geciken', label: L('Geciken', 'Overdue'), count: count('geciken') },
          { id: 'biten', label: L('Kapanan', 'Closed') },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setPrio('all') }} active={q !== '' || prio !== 'all'}>
        <SearchBox label={L('Görevlerde ara', 'Search tasks')} placeholder={L('Görev, başlık…', 'Task, title…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Öncelik', 'Priority')} value={prio} onChange={setPrio} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'urgent', label: L('Acil', 'Urgent') }, { id: 'high', label: L('Yüksek', 'High') }, { id: 'normal', label: L('Normal', 'Normal') }]} />
      </FilterBar>
      {picked.length > 0 && (
        <div role="region" aria-label={L('Toplu işlemler', 'Bulk actions')} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-[13px] font-medium">{picked.length} {L('görev seçili', 'selected')}</span>
          <button type="button" className={btnSmall} onClick={doBulkComplete}>{L('Seçilenleri tamamla', 'Complete selected')}</button>
          {manage && <button type="button" className={btnSmall} onClick={() => setBulk('assign')}>{L('Seçilenleri ata', 'Assign selected')}</button>}
          <button type="button" className={btnSmall} onClick={() => setPicked([])}>{L('Seçimi temizle', 'Clear selection')}</button>
        </div>
      )}
      {bulkMsg && <Notice tone="blue">{bulkMsg}</Notice>}
      <DataTable rows={rows} cols={[selectCol, ...cols]} rowKey={(t) => t.id} label={L('Görev listesi', 'Task list')} urlKey="gr" defaultSort={{ id: 'due', dir: 'asc' }} onRowClick={(t) => setSel(t.id)} empty={<Empty title={view === 'havuz' ? L('Açık havuzda görev yok', 'No tasks in the open pool') : L('Bu görünümde görev yok', 'No tasks in this view')} />} />
      {adding && <TaskDialog onClose={() => setAdding(false)} />}
      {bulk === 'assign' && <BulkAssignDialog ids={picked} onDone={(msg) => { setBulkMsg(msg); setPicked([]) }} onClose={() => setBulk(null)} />}
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
  const [dlg, setDlg] = useState<null | 'reassign' | 'reopen' | 'cancel' | 'postpone'>(null)
  const mine = isMyTask(t, me.id)
  const manage = can('tasks:manage')
  const open = isOpenTask(t)
  const claimable = canClaim(d, t, me)
  const link = t.link
  const created = d.users.find((u) => u.id === t.createdBy)
  return (
    <RecordDrawer title={t.no} subtitle={t.title} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="task" value={t.status} />],
          [L('Öncelik', 'Priority'), <Status key="p" kind="priority" value={t.priority} />],
          [L('Sorumlu', 'Owner'), t.ownerId ? userName(d, t.ownerId) : t.pool ? L('Açık havuz (üstlenilmedi)', 'Open pool (unclaimed)') : '—'],
          [L('Alıcılar', 'Recipients'), t.recipientIds.length ? t.recipientIds.map((u) => userName(d, u)).join(', ') : '—'],
          [L('Oluşturan', 'Created by'), created?.name ?? '—'],
          [L('Vade', 'Due'), f.dt(t.dueAt, t.branchId)],
          [L('Şube', 'Branch'), d.branches.find((b) => b.id === t.branchId)?.name ?? L('Tüm şubeler', 'All branches')],
          [L('Havuz rolü', 'Pool role'), t.pool ? (t.poolRoleIds?.length ? t.poolRoleIds.map((r) => d.roles.find((x) => x.id === r)?.name ?? r).join(', ') : L('Her uygun rol', 'Every eligible role')) : '—'],
          [L('Açıklama', 'Description'), t.description || '—'],
          [L('Bağlı kayıt', 'Linked record'), link ? <Link key="l" to={entityHref(link.type, link.id) as never} className="text-blue hover:underline">{LINK_LABEL()[link.type] ?? link.type} · {recordLabel(d, link)}</Link> : '—'],
        ]}
      />
      {open && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {claimable && <ActBtn onClick={() => act((s) => claimTask(s, t.id, t.version), L('Görevi üstlendiniz.', 'You claimed the task.'))}>{L('Üstlen', 'Claim')}</ActBtn>}
            {(mine || manage) && t.status === 'open' && !t.pool && <ActBtn onClick={() => act((s) => startTask(s, t.id), L('Görev başlatıldı.', 'Task started.'))}>{L('Başlat', 'Start')}</ActBtn>}
            {(mine || manage) && !(t.pool && !t.ownerId) && <ActBtn onClick={() => act((s) => completeTask(s, t.id), L('Görev tamamlandı. Bağlı kayıt ayrıca işlem gerektirir.', 'Task completed. The linked record still needs its own action.'))}>{L('Tamamla', 'Complete')}</ActBtn>}
            {(t.ownerId === me.id || t.createdBy === me.id || manage) && <ActBtn onClick={() => setDlg('reassign')}>{L('Devret', 'Reassign')}</ActBtn>}
            {t.ownerId === me.id && <ActBtn onClick={() => act((s) => releaseTask(s, t.id), L('Görev havuza bırakıldı.', 'Task released to the pool.'))}>{L('Havuza bırak', 'Release to pool')}</ActBtn>}
            {(mine || t.createdBy === me.id || manage) && <ActBtn onClick={() => setDlg('postpone')}>{L('Ertele', 'Postpone')}</ActBtn>}
            {(t.createdBy === me.id || manage) && <ActBtn onClick={() => setDlg('cancel')}>{L('İptal et', 'Cancel')}</ActBtn>}
          </ActionRow>
        </DrawerSection>
      )}
      {!open && (t.createdBy === me.id || manage) && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            <ActBtn onClick={() => setDlg('reopen')}>{L('Yeniden aç', 'Reopen')}</ActBtn>
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={t.history} /></DrawerSection>
      {dlg === 'reassign' && <ReassignDialog t={t} onClose={() => setDlg(null)} />}
      {dlg === 'reopen' && <PromptDialog title={L('Görevi yeniden aç', 'Reopen the task')} description={L('Gerekçe görev geçmişine yazılır.', 'The reason is written to the task history.')} label={L('Gerekçe', 'Reason')} confirm={L('Yeniden aç', 'Reopen')} min={5} run={(text) => runAction((s) => reopenTask(s, t.id, text), L('Görev yeniden açıldı.', 'Task reopened.'))} onClose={() => setDlg(null)} />}
      {dlg === 'cancel' && <PromptDialog title={L('Görevi iptal et', 'Cancel the task')} description={L('Görev silinmez; iptal gerekçesiyle geçmişte kalır.', 'The task is not deleted; it stays in the history with the reason.')} label={L('Gerekçe', 'Reason')} confirm={L('İptal et', 'Cancel task')} danger min={5} run={(text) => runAction((s) => cancelTask(s, t.id, text), L('Görev iptal edildi.', 'Task cancelled.'))} onClose={() => setDlg(null)} />}
      {dlg === 'postpone' && <PostponeDialog t={t} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function ReassignDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const d = useDb()
  const [owner, setOwner] = useState(t.ownerId ?? '')
  return (
    <FinanceDialog
      title={L('Görevi devret', 'Reassign task')}
      description={L('Yeni sorumluya uygulama içi bildirim düşer (e-posta veya SMS gönderilmez). Kişi, görevin şube kapsamında olmalıdır.', 'The new owner gets an in-app notification (no email or SMS is sent). The person must be in the task’s branch scope.')}
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

function PostponeDialog({ t, onClose }: { t: Task; onClose: () => void }) {
  const f = useFmt()
  const [due, setDue] = useState(t.dueAt)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Görevi ertele', 'Postpone the task')}
      description={L('Yeni son tarih ve gerekçe görev geçmişine yazılır.', 'The new due date and the reason are written to the task history.')}
      confirm={L('Ertele', 'Postpone')}
      onClose={onClose}
      onSubmit={() => {
        const r = runAction((s) => postponeTask(s, t.id, due, reason), L('Görev ertelendi.', 'Task postponed.'))
        if (!r.ok) {
          setErr(r.fields)
          return r.error
        }
        onClose()
      }}
    >
      <DateTimeF id="pp-d" label={L('Yeni son tarih', 'New due date')} value={due} onChange={setDue} tz={f.zone(t.branchId)} error={err.due} />
      <label className="block text-[13px] font-medium">
        {L('Gerekçe', 'Reason')}
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px]" />
        {err.reason && <span className="text-[12.5px] text-alert">{err.reason}</span>}
      </label>
    </FinanceDialog>
  )
}

function BulkAssignDialog({ ids, onDone, onClose }: { ids: string[]; onDone: (msg: string) => void; onClose: () => void }) {
  const d = useDb()
  const [owner, setOwner] = useState('')
  return (
    <FinanceDialog
      title={L('Seçilen görevleri ata', 'Assign the selected tasks')}
      description={L('Kapalı görevler, şube kapsamı dışındaki görevler ve zaten bu kişide olanlar atlanır; atlananlar nedeniyle listelenir.', 'Closed tasks, tasks outside the person’s branch scope and tasks already with them are skipped and listed with the reason.')}
      confirm={L('Ata', 'Assign')}
      onClose={onClose}
      onSubmit={() => {
        if (!owner) return L('Kişiyi seçin.', 'Choose the person.')
        const r = runAction((s) => bulkAssign(s, ids, owner))
        if (!r.ok) return r.error
        onDone(L(`${r.value.done.length} görev atandı${r.value.skipped.length ? `; ${r.value.skipped.length} görev atlandı: ${r.value.skipped.map((x) => `${x.no} (${x.reason})`).join('; ')}` : ''}.`, `${r.value.done.length} task(s) assigned${r.value.skipped.length ? `; ${r.value.skipped.length} skipped: ${r.value.skipped.map((x) => `${x.no} (${x.reason})`).join('; ')}` : ''}.`))
        onClose()
      }}
    >
      <SelectF id="ba-o" label={L('Atanacak kişi', 'Assign to')} value={owner} onChange={setOwner} placeholder={L('Seçin', 'Choose')} options={userOptions(d)} />
    </FinanceDialog>
  )
}
