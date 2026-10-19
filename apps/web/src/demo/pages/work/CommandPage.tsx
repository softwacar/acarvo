import { Link } from '@tanstack/react-router'
import { computeCashExpected } from '../../core/calc/finance'
import { readinessOf } from '../../core/calc/availability'
import { fmt } from '../../core/money'
import { overdueReturns, todayPickups, todayReturns } from '../../core/metrics'
import { L } from '../../i18n'
import { AlertList } from '../../ui/alerts'
import { useAlerts, useBranchScope, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { Empty, FilterSelect, Kpis, Page, Panel, Segmented, Tabs } from '../../ui/kit'
import { userName } from '../../core/helpers'
import { ItemRows } from '../home/DashboardPage'
import { PrintButton } from '../shared/ContractSheet'

type TabId = 'acil' | 'bugun' | 'uyarilar' | 'devir'

export function CommandPage() {
  const d = useDb()
  const { active } = useBranchScope()
  const alerts = useAlerts()
  const [tab, setTab] = useUrlState('sekme', 'acil')
  const [sev, setSev] = useUrlState('onem', 'all')
  const [mod, setMod] = useUrlState('modul', 'all')
  const critical = alerts.filter((a) => a.severity === 'critical')
  const pickups = todayPickups(d, active)
  const returns = todayReturns(d, active)
  const late = overdueReturns(d, active)
  const modules = [...new Set(alerts.map((a) => a.module))]
  const filtered = alerts.filter((a) => (sev === 'all' ? true : a.severity === sev)).filter((a) => (mod === 'all' ? true : a.module === mod))
  return (
    <Page
      title={L('Komuta Merkezi', 'Command Center')}
      description={L('Şu an müdahale gerektirenler. Uyarılar tek kaynaktan türetilir (Ana Ekran ve bildirimlerle aynı); her satır kaynak kayda gider.', 'What needs action now. Alerts are derived from one source (same as Home and notifications); every row opens its source record.')}
    >
      <Kpis
        items={[
          { label: L('Kritik uyarı', 'Critical alerts'), value: critical.length, tone: critical.length ? 'alert' : undefined },
          { label: L('Geciken iade', 'Overdue returns'), value: late.length, tone: late.length ? 'alert' : undefined, to: '/kiralamalar?gecikme=1' },
          { label: L('Bugün teslim', 'Pickups today'), value: pickups.length },
          { label: L('Bugün iade', 'Returns today'), value: returns.length },
        ]}
      />
      <Tabs<TabId>
        label={L('Komuta Merkezi bölümleri', 'Command Center sections')}
        value={(tab as TabId) || 'acil'}
        onChange={setTab}
        tabs={[
          { id: 'acil', label: L('Acil', 'Urgent'), count: critical.length + late.length || undefined },
          { id: 'bugun', label: L('Bugün', 'Today'), count: pickups.length + returns.length || undefined },
          { id: 'uyarilar', label: L('Uyarılar', 'Alerts'), count: alerts.length || undefined },
          { id: 'devir', label: L('Vardiya Devri', 'Shift Handover') },
        ]}
      />
      {tab === 'acil' && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel title={L('Kritik uyarılar', 'Critical alerts')} flush>
            <AlertList alerts={critical} empty={L('Kritik uyarı yok.', 'No critical alerts.')} />
          </Panel>
          <Panel title={L('Geciken iadeler', 'Overdue returns')} description={L('Araç hâlâ müşteride, planlanan iade zamanı geçti.', 'The vehicle is still with the customer past the planned return time.')} flush>
            <ItemRows items={late.map((r) => ({ kind: 'rental' as const, id: r.id, no: r.no, at: r.plannedReturnAt, vehicleId: r.vehicleId, customerId: r.customerId, classId: r.classId, branchId: r.returnBranchId, note: L('İade gecikti', 'Overdue') }))} showTime={false} empty={L('Geciken iade yok.', 'No overdue returns.')} />
          </Panel>
        </div>
      )}
      {tab === 'bugun' && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Panel title={`${L('Bugünkü teslimler', "Today's pickups")} (${pickups.length})`} flush>
            <ItemRows items={pickups} empty={L('Bugün teslim yok.', 'No pickups today.')} />
          </Panel>
          <Panel title={`${L('Bugünkü iadeler', "Today's returns")} (${returns.length})`} flush>
            <ItemRows items={returns} empty={L('Bugün iade yok.', 'No returns today.')} />
          </Panel>
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
          <p className="text-[12.5px] text-ink-2">{L('Kural motoru yalnız güvenli bildirim/inceleme kataloğundan çalışır; kurallar Kontrol → Kurallar ekranında yönetilir.', 'The rule engine runs only from a safe notification/review catalogue; rules are managed under Control → Rules.')} <Link to={'/kurallar' as never} className="font-medium text-blue hover:underline">{L('Kurallara git', 'Open Rules')}</Link></p>
        </div>
      )}
      {tab === 'devir' && <Handover />}
      {tab === 'acil' && late.length === 0 && critical.length === 0 && <Empty title={L('Acil durum yok', 'Nothing urgent')} />}
    </Page>
  )
}

function Handover() {
  const d = useDb()
  const f = useFmt()
  const { active } = useBranchScope()
  const late = overdueReturns(d, active)
  const sessions = d.drawers.filter((x) => x.status === 'open' && active.includes(x.branchId)).map((x) => ({ drawer: x, s: d.cashSessions.find((c) => c.id === x.sessionId) })).filter((x) => x.s)
  const notReady = d.rentals.filter((r) => r.status === 'prepared' && active.includes(r.pickupBranchId) && Date.parse(r.plannedPickupAt) < Date.parse(d.clock.now) + 24 * 3600_000).filter((r) => !readinessOf(d, d.vehicles.find((v) => v.id === r.vehicleId)!, d.clock.now).ready)
  const tasks = d.tasks.filter((t) => t.status !== 'done' && (!t.branchId || active.includes(t.branchId)))
  const incidents = d.incidents.filter((i) => i.status === 'open' || i.status === 'investigating')
  const approvals = d.approvals.filter((a) => a.status === 'requested')
  const pickupsLeft = todayPickups(d, active).filter((x) => Date.parse(x.at) >= Date.parse(d.clock.now))
  const Row = ({ label, value, to }: { label: string; value: string | number; to?: string }) => (
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
            <Row label={L('Geciken iade', 'Overdue returns')} value={late.length} to="/kiralamalar?gecikme=1" />
            <Row label={L('Bugün kalan teslim', 'Pickups remaining today')} value={pickupsLeft.length} to="/kiralamalar?durum=prepared" />
            <Row label={L('24 saat içinde teslim, araç hazır değil', 'Pickup within 24 h, vehicle not ready')} value={notReady.length} />
            <Row label={L('Açık görev', 'Open tasks')} value={tasks.length} to="/gorevler?gorunum=ekip" />
            <Row label={L('Açık olay', 'Open incidents')} value={incidents.length} to="/olay-merkezi?durum=open" />
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
            <Row label={L('Bekleyen onay', 'Pending approvals')} value={approvals.length} to="/onay-merkezi" />
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-2">{L('Kasa devrinde sayım ve fark gerekçesi Şube Kasaları ekranında yapılır.', 'Counting and variance reasons for a cash handover are done on the Branch Cash screen.')}</p>
        </Panel>
      </div>
    </div>
  )
}
