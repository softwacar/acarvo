import { CaretRight, CheckCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { computeCashExpected } from '../../core/calc/finance'
import { readinessOf } from '../../core/calc/availability'
import { userName } from '../../core/helpers'
import { type InboxItem, type InboxKind, inboxOf, REASON_LABEL } from '../../core/inbox'
import { fmt } from '../../core/money'
import { overdueReturns, todayPickups } from '../../core/metrics'
import { claimTask, completeTask } from '../../core/ops/tasks'
import { L } from '../../i18n'
import { AlertList } from '../../ui/alerts'
import { cn } from '@/lib/utils'
import { entityHref, runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnSmall, Empty, FilterSelect, Kpis, Notice, Page, Panel, Segmented, Tabs } from '../../ui/kit'
import { DemoConcept } from '../../ui/gate'
import { ExceptionsSection } from '../control/RisksPage'
import { PrintButton } from '../shared/ContractSheet'
import { useMemo } from 'react'

// "İşlerim" (My Work): the one queue of what needs this person (decision document D.5 / K-9). It is a projection: no
// stored entity. Every row opens the screen that owns the record; the task shortcuts call the same task operations the
// Tasks screen uses. The Home counter reads the same inbox, so the two numbers always agree.

type TabId = 'bana' | 'uyarilar' | 'istisnalar' | 'devir'
const KIND_LABEL = (k: InboxKind) => (k === 'task' ? L('Görev', 'Task') : k === 'approval' ? L('Onay', 'Approval') : L('Uyarı', 'Alert'))

export function InboxPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const inbox = useMemo(() => inboxOf(d), [d])
  const [tabRaw, setTab] = useUrlState('sekme', 'bana')
  const [kind, setKind] = useUrlState('tur', 'all')
  const [sev, setSev] = useUrlState('onem', 'all')
  const [mod, setMod] = useUrlState('modul', 'all')
  const preview = d.session.preview
  const tab: TabId = tabRaw === 'uyarilar' || (preview && (tabRaw === 'istisnalar' || tabRaw === 'devir')) ? (tabRaw as TabId) : 'bana'
  const rows = inbox.mine.filter((i) => kind === 'all' || i.kind === kind)
  const modules = [...new Set(inbox.alerts.map((a) => a.module))]
  const filtered = inbox.alerts.filter((a) => (sev === 'all' ? true : a.severity === sev)).filter((a) => (mod === 'all' ? true : a.module === mod))
  const c = inbox.counts
  return (
    <Page
      title={L('İşlerim', 'My Work')}
      description={L('Size düşen görevler, bekleyen onaylar ve müdahale gerektiren kayıtlar tek listede. İşlerim yeni bir kayıt deposu değildir: her satır kendi kaynağına gider; görev, onay ve uyarı kuralları kaynak ekranda işler.', 'The tasks, approvals and records that need you, in one list. My Work is not a new store: every row opens its own source, and the task, approval and alert rules stay on the source screen.')}
    >
      <Kpis
        items={[
          { label: L('Bana atanan görev', 'Tasks assigned to me'), value: c.tasks, to: '/gorevler?gorunum=bana' },
          { label: L('Üstlenebileceğim', 'I can claim'), value: c.pool, hint: L('Açık havuz', 'Open pool'), to: '/gorevler?gorunum=havuz' },
          { label: L('Bekleyen onay', 'Approvals waiting'), value: c.approvals, tone: c.approvals ? 'hold' : undefined, ...(can('approvals:view') ? { to: '/onay-merkezi' } : {}) },
          { label: L('Müdahale gerektiren', 'Needs action'), value: inbox.mine.filter((i) => i.kind === 'alert').length, tone: inbox.mine.some((i) => i.kind === 'alert') ? 'alert' : undefined },
        ]}
      />
      <Tabs<TabId>
        label={L('İşlerim bölümleri', 'My Work sections')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'bana', label: L('Bana Düşenler', 'Assigned to me'), count: c.mine || undefined },
          { id: 'uyarilar', label: L('Uyarılar', 'Alerts'), count: c.alerts || undefined },
          { id: 'istisnalar', label: L('İstisnalar (V1.5)', 'Exceptions (V1.5)'), hidden: !preview },
          { id: 'devir', label: L('Vardiya Devri (V1.5)', 'Shift Handover (V1.5)'), hidden: !preview },
        ]}
      />

      {tab === 'bana' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label={L('Tür', 'Kind')}
              value={kind}
              onChange={setKind}
              options={[
                { id: 'all', label: L('Hepsi', 'All') },
                { id: 'task', label: L('Görevler', 'Tasks') },
                { id: 'approval', label: L('Onaylar', 'Approvals') },
                { id: 'alert', label: L('Müdahale', 'Action') },
              ]}
            />
          </div>
          <Panel flush>
            {rows.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-ink-2 sm:px-5">
                <CheckCircle size={16} className="text-ok" /> {L('Şu an size düşen iş yok.', 'Nothing needs you right now.')}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft" aria-label={L('Bana düşen işler', 'Items for me')}>
                {rows.map((i) => (
                  <Row key={i.key} item={i} when={f.dt(i.at)} />
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-[12.5px] text-ink-2">
            {L('Görevlerin tamamı için ', 'For every task open ')}
            <Link to={'/gorevler' as never} className="font-medium text-blue hover:underline">{L('Görevler', 'Tasks')}</Link>
            {can('approvals:view') && (
              <>
                {' · '}
                <Link to={'/onay-merkezi' as never} className="font-medium text-blue hover:underline">{L('Onay Merkezi', 'Approval Center')}</Link>
              </>
            )}
          </p>
        </div>
      )}

      {tab === 'uyarilar' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented label={L('Önem', 'Severity')} value={sev} onChange={setSev} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: 'critical', label: L('Kritik', 'Critical') }, { id: 'warning', label: L('Uyarı', 'Warning') }, { id: 'info', label: L('Bilgi', 'Info') }]} />
            <FilterSelect label={L('Modül', 'Module')} value={mod} onChange={setMod} options={[{ id: 'all', label: L('Tüm modüller', 'All modules') }, ...modules.map((m) => ({ id: m, label: m }))]} />
          </div>
          <Panel flush>
            <AlertList alerts={filtered} empty={L('Bu filtrede uyarı yok.', 'No alerts match this filter.')} />
          </Panel>
          <p className="text-[12.5px] text-ink-2">
            {L('Uyarılar kayıtlardan türetilir (Ana Ekran ve bildirimlerle aynı kaynak); yetkiniz ve şube kapsamınız dışındaki kayıtlar görünmez. Bildirim eşikleri ', 'Alerts are derived from records (same source as Home and the notifications); records outside your permissions and branch scope are not shown. Notification thresholds are in ')}
            <Link to={'/ayarlar?bolum=bildirim' as never} className="font-medium text-blue hover:underline">{L('Ayarlar → Bildirimler', 'Settings → Notifications')}</Link>.
          </p>
        </div>
      )}

      {tab === 'istisnalar' && (
        <div className="space-y-3">
          <DemoConcept>{L('Demo konsepti · V1.5', 'Demo concept · V1.5')}</DemoConcept>
          <ExceptionsSection />
        </div>
      )}
      {tab === 'devir' && (
        <div className="space-y-3">
          <DemoConcept>{L('Demo konsepti · V1.5', 'Demo concept · V1.5')}</DemoConcept>
          <Handover />
        </div>
      )}
      {tab === 'bana' && inbox.mine.length === 0 && <Empty title={L('Her şey yolunda', 'All clear')} />}
    </Page>
  )
}

function Row({ item: i, when }: { item: InboxItem; when: string }) {
  const d = useDb()
  const can = useCan()
  const task = i.kind === 'task' ? d.tasks.find((t) => t.id === i.link.id) : undefined
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 hover:bg-ground/60 sm:px-5">
      <Link to={entityHref(i.link.type, i.link.id) as never} className="group flex min-w-0 flex-1 items-start gap-3">
        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.severity === 'critical' ? 'bg-alert' : i.severity === 'warning' ? 'bg-hold' : 'bg-blue')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="rounded border border-line px-1.5 text-[11.5px] font-medium text-ink-2">{KIND_LABEL(i.kind)}</span>
            <span className="text-[13.5px] font-medium">{i.title}</span>
            {i.overdue && <span className="rounded bg-alert-soft px-1.5 text-[11.5px] font-medium text-alert">{L('Gecikti', 'Overdue')}</span>}
          </span>
          <span className="block truncate text-[12.5px] text-ink-2">
            {REASON_LABEL[i.reason]()} · {i.detail}
            {i.kind === 'task' && <> · <span className="tnum">{when}</span></>}
          </span>
        </span>
        <CaretRight size={14} className="mt-1 text-ink-3 transition-transform group-hover:translate-x-0.5" />
      </Link>
      {task && i.reason === 'pool' && can('tasks:view') && (
        <button type="button" className={btnSmall} onClick={() => runAction((s) => claimTask(s, task.id, task.version), L('Görevi üstlendiniz.', 'You claimed the task.'))}>
          {L('Üstlen', 'Claim')}
        </button>
      )}
      {task && i.reason === 'assigned' && (
        <button type="button" className={btnSmall} onClick={() => runAction((s) => completeTask(s, task.id), L('Görev tamamlandı. Bağlı kayıt ayrıca işlem gerektirir.', 'Task completed. The linked record still needs its own action.'))}>
          {L('Tamamla', 'Complete')}
        </button>
      )}
    </li>
  )
}

function Handover() {
  const d = useDb()
  const f = useFmt()
  const { active } = useBranchScope()
  const late = overdueReturns(d, active)
  const sessions = d.drawers.filter((x) => x.status === 'open' && active.includes(x.branchId)).map((x) => ({ drawer: x, s: d.cashSessions.find((cs) => cs.id === x.sessionId) })).filter((x) => x.s)
  const notReady = d.rentals.filter((r) => r.status === 'prepared' && active.includes(r.pickupBranchId) && Date.parse(r.plannedPickupAt) < Date.parse(d.clock.now) + 24 * 3600_000).filter((r) => !readinessOf(d, d.vehicles.find((v) => v.id === r.vehicleId)!, d.clock.now).ready)
  const tasks = d.tasks.filter((t) => (t.status === 'open' || t.status === 'in_progress') && (!t.branchId || active.includes(t.branchId)))
  const incidents = d.incidents.filter((i) => i.status === 'open' || i.status === 'investigating')
  const approvals = d.approvals.filter((a) => a.status === 'requested')
  const pickupsLeft = todayPickups(d, active).filter((x) => Date.parse(x.at) >= Date.parse(d.clock.now))
  const Line = ({ label, value, to }: { label: string; value: string | number; to?: string }) => (
    <li className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
      <span>{label}</span>
      {to ? <Link to={to as never} className="tnum font-medium text-blue hover:underline">{value}</Link> : <span className="tnum font-medium">{value}</span>}
    </li>
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-2">{L(`Vardiya devir özeti · ${f.dt(d.clock.now)} (demo saati). Sayılar canlı kayıtlardan türetilir; ayrı bir devir notu saklanmaz.`, `Shift handover summary · ${f.dt(d.clock.now)} (demo clock). Numbers are derived from live records; no separate handover note is stored.`)}</p>
        <PrintButton label={L('Yazdır', 'Print')} />
      </div>
      <div className="contract-print grid gap-5 md:grid-cols-2">
        <Panel title={L('Operasyon', 'Operations')}>
          <ul className="divide-y divide-line-soft">
            <Line label={L('Geciken iade', 'Overdue returns')} value={late.length} to="/kiralamalar?gecikme=1" />
            <Line label={L('Bugün kalan teslim', 'Pickups remaining today')} value={pickupsLeft.length} to="/kiralamalar?durum=prepared" />
            <Line label={L('24 saat içinde teslim, araç hazır değil', 'Pickup within 24 h, vehicle not ready')} value={notReady.length} />
            <Line label={L('Açık görev', 'Open tasks')} value={tasks.length} to="/gorevler?gorunum=ekip" />
            <Line label={L('Açık olay', 'Open incidents')} value={incidents.length} to="/olay-merkezi?durum=open" />
          </ul>
        </Panel>
        <Panel title={L('Kasa ve onaylar', 'Cash and approvals')}>
          <ul className="divide-y divide-line-soft">
            {sessions.length === 0 && <li className="py-2.5 text-[13.5px] text-ink-2">{L('Açık kasa oturumu yok.', 'No open cash sessions.')}</li>}
            {sessions.map(({ drawer, s }) => (
              <li key={drawer.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span>{drawer.name} <span className="text-ink-2">· {userName(d, s!.openedBy)}</span></span>
                <span className="tnum font-medium">{fmt(computeCashExpected(d, s!), drawer.currency)} <span className="font-normal text-ink-2">{L('beklenen', 'expected')}</span></span>
              </li>
            ))}
            <Line label={L('Bekleyen onay', 'Pending approvals')} value={approvals.length} to="/onay-merkezi" />
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-2">{L('Kasa devrinde sayım ve fark gerekçesi Şube Kasaları ekranında yapılır.', 'Counting and variance reasons for a cash handover are done on the Branch Cash screen.')}</p>
        </Panel>
      </div>
      <Notice tone="blue">{L('Vardiya devri V1.5 kapsamındadır; V1’de kasa kapanışı ve gün sonu Şube Kasaları ve Raporlar üzerinden yapılır.', 'Shift handover is in V1.5; in V1 cash closing and the end of day are done through Branch Cash and Reports.')}</Notice>
    </div>
  )
}
