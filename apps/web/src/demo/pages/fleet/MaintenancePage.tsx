import { Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { fmt, parseAmount, sumByCur } from '../../core/money'
import { cancelMaintenance, completeMaintenance, startMaintenance } from '../../core/ops/fleet'
import type { Maintenance } from '../../core/types'
import { L } from '../../i18n'
import { MoneyF, SelectF, TextF } from '../../ui/forms'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Empty, Facts, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Page, SearchBox, Status, Timeline } from '../../ui/kit'
import { VehicleCell } from '../../ui/domain'
import { MAINT_TYPE_LABEL, STATUS } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { MaintenanceDialog } from '../shared/FleetDialogs'
import { ActBtn, ActionRow, byCurText, DrawerSection, PromptDialog, RecordDrawer, useAct } from './common'

export function MaintenancePage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const types = MAINT_TYPE_LABEL()
  const [q, setQ] = useUrlState('q')
  const [status, setStatus] = useUrlState('durum', 'all')
  const [type, setType] = useUrlState('tur', 'all')
  const [sel, setSel] = useUrlState('kayit')
  const [adding, setAdding] = useState(false)
  const now = Date.parse(d.clock.now)
  const vOf = (m: Maintenance) => d.vehicles.find((v) => v.id === m.vehicleId)!
  const scoped = d.maintenance.filter((m) => active.includes(vOf(m).homeBranchId))
  const overdue = (m: Maintenance) => m.status === 'planned' && Date.parse(m.plannedStart) < now
  const rows = scoped
    .filter((m) => (status === 'all' ? true : m.status === status))
    .filter((m) => (type === 'all' ? true : m.type === type))
    .filter((m) => !q || `${m.no} ${vOf(m).plate} ${m.reason}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.plannedStart.localeCompare(a.plannedStart))
  const costs = sumByCur(scoped.filter((m) => m.status === 'completed'), (m) => m.cost)
  const cols: Col<Maintenance>[] = [
    { id: 'no', header: L('Kayıt', 'Record'), cell: (m) => <span className="tnum whitespace-nowrap font-medium text-blue">{m.no}</span>, sort: (m) => m.no, csv: (m) => m.no },
    { id: 'veh', header: L('Araç', 'Vehicle'), cell: (m) => <VehicleCell v={vOf(m)} sub={false} />, csv: (m) => vOf(m).plate },
    { id: 'type', header: L('Tür', 'Type'), cell: (m) => types[m.type], hideBelow: 'md', csv: (m) => types[m.type] },
    { id: 'when', header: L('Plan', 'Plan'), cell: (m) => <span className="tnum text-[13px]">{f.dt(m.plannedStart, vOf(m).homeBranchId)} → {f.dt(m.plannedEnd, vOf(m).homeBranchId)}</span>, sort: (m) => m.plannedStart, hideBelow: 'lg', csv: (m) => m.plannedStart },
    { id: 'reason', header: L('Gerekçe', 'Reason'), cell: (m) => <span className="line-clamp-1">{m.reason}</span>, hideBelow: 'lg' },
    { id: 'cost', header: L('Maliyet', 'Cost'), align: 'right', cell: (m) => (m.cost ? <span className="tnum">{fmt(m.cost.minor, m.cost.cur)}</span> : <span className="text-ink-3">—</span>), hideBelow: 'md', csv: (m) => (m.cost ? m.cost.minor : '') },
    { id: 'st', header: L('Durum', 'Status'), cell: (m) => <span className="flex flex-wrap gap-1.5"><Status kind="maintenance" value={m.status} />{overdue(m) && <span className="rounded border border-alert/40 bg-alert-soft px-1.5 py-0.5 text-[11.5px] font-medium text-alert">{L('Başlamadı', 'Not started')}</span>}</span>, sort: (m) => m.status, csv: (m) => m.status },
  ]
  const current = d.maintenance.find((m) => m.id === sel)
  return (
    <Page
      title={L('Bakım ve Servis', 'Maintenance and Service')}
      description={L('Planlanan bakım aracı o aralıkta uygunluktan düşürür. Tamamlanan bakım aracı otomatik Hazır yapmaz.', 'Planned maintenance removes the vehicle from availability in that window. Completed maintenance does not make the vehicle Ready.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('bakim', cols, rows)}>CSV</button>
          {can('maintenance:manage') && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus size={16} /> {L('Bakım planla', 'Plan maintenance')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Planlı', 'Planned'), value: scoped.filter((m) => m.status === 'planned').length, to: '/bakim-servis?durum=planned' },
          { label: L('Serviste', 'In service'), value: scoped.filter((m) => m.status === 'in_progress').length, to: '/bakim-servis?durum=in_progress' },
          { label: L('Başlaması gecikmiş', 'Late to start'), value: scoped.filter(overdue).length, tone: scoped.filter(overdue).length ? 'alert' : undefined },
          { label: L('Tamamlanan maliyet', 'Completed cost'), value: byCurText(costs, fmt), hint: L('Para birimi başına', 'Per currency') },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setStatus('all'); setType('all') }} active={q !== '' || status !== 'all' || type !== 'all'}>
        <SearchBox label={L('Bakımda ara', 'Search maintenance')} placeholder={L('Kayıt, plaka, gerekçe…', 'Record, plate, reason…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Durum', 'Status')} value={status} onChange={setStatus} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.keys(STATUS.maintenance!).map((k) => ({ id: k, label: STATUS.maintenance![k]!().label }))]} />
        <FilterSelect label={L('Tür', 'Type')} value={type} onChange={setType} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.entries(types).map(([id, label]) => ({ id, label }))]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(m) => m.id} label={L('Bakım listesi', 'Maintenance list')} urlKey="bk" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(m) => setSel(m.id)} empty={<Empty title={L('Bu filtrelerle bakım kaydı yok', 'No maintenance matches')} />} />
      {adding && <MaintenanceDialog onClose={() => setAdding(false)} />}
      {current && <Drawer m={current} onClose={() => setSel('')} />}
    </Page>
  )
}

function Drawer({ m, onClose }: { m: Maintenance; onClose: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { act, error } = useAct()
  const [dlg, setDlg] = useState<null | 'complete' | 'cancel'>(null)
  const v = d.vehicles.find((x) => x.id === m.vehicleId)!
  const damage = d.damages.find((x) => x.id === m.damageId)
  const provider = d.providers.find((p) => p.id === m.providerId)
  const types = MAINT_TYPE_LABEL()
  const manage = can('maintenance:manage')
  return (
    <RecordDrawer title={m.no} subtitle={`${v.plate} · ${types[m.type]}`} onClose={onClose} error={error}>
      <Facts
        single
        rows={[
          [L('Durum', 'Status'), <Status key="s" kind="maintenance" value={m.status} />],
          [L('Araç', 'Vehicle'), <Link2 key="v" type="vehicle" id={v.id}>{v.plate} · {v.make} {v.model}</Link2>],
          [L('Planlanan', 'Planned'), `${f.dt(m.plannedStart, v.homeBranchId)} → ${f.dt(m.plannedEnd, v.homeBranchId)}`],
          [L('Gerçekleşen', 'Actual'), m.actualStart ? `${f.dt(m.actualStart, v.homeBranchId)}${m.actualEnd ? ` → ${f.dt(m.actualEnd, v.homeBranchId)}` : ''}` : '—'],
          [L('Sağlayıcı', 'Provider'), provider?.name ?? '—'],
          [L('Gerekçe', 'Reason'), m.reason],
          [L('Maliyet', 'Cost'), m.cost ? fmt(m.cost.minor, m.cost.cur) : '—'],
          [L('Hasar', 'Damage'), damage ? <Link2 key="d" type="damage" id={damage.id}>{damage.no}</Link2> : '—'],
        ]}
      />
      {m.status === 'completed' && <p className="text-[13px] text-ink-2">{L('Bakım bitti ama araç otomatik Hazır sayılmaz: temizlik, yakıt ve belge kontrolü araç sayfasında ayrıca yapılır.', 'Service is finished but the vehicle is not automatically Ready: cleaning, fuel and document checks are done separately on the vehicle page.')}</p>}
      {manage && (m.status === 'planned' || m.status === 'in_progress') && (
        <DrawerSection title={L('İşlemler', 'Actions')}>
          <ActionRow>
            {m.status === 'planned' && <ActBtn onClick={() => act((s) => startMaintenance(s, m.id), L('Araç servise alındı.', 'Vehicle taken into service.'))}>{L('Servise al', 'Start service')}</ActBtn>}
            {m.status === 'in_progress' && <ActBtn onClick={() => setDlg('complete')}>{L('Tamamla', 'Complete')}</ActBtn>}
            <ActBtn onClick={() => setDlg('cancel')}>{L('İptal et', 'Cancel')}</ActBtn>
          </ActionRow>
        </DrawerSection>
      )}
      <DrawerSection title={L('Geçmiş', 'History')}><Timeline entries={m.history} /></DrawerSection>
      {dlg === 'complete' && <CompleteDialog m={m} onClose={() => setDlg(null)} />}
      {dlg === 'cancel' && <PromptDialog title={L('Bakımı iptal et', 'Cancel maintenance')} description={L('Araç, bu aralık için uygunluğa geri döner.', 'The vehicle returns to availability for this window.')} label={L('Gerekçe', 'Reason')} confirm={L('İptal et', 'Cancel')} danger run={(t) => act((s) => cancelMaintenance(s, m.id, t), L('Bakım iptal edildi.', 'Maintenance cancelled.')) as never} onClose={() => setDlg(null)} />}
    </RecordDrawer>
  )
}

function CompleteDialog({ m, onClose }: { m: Maintenance; onClose: () => void }) {
  const d = useDb()
  const v = d.vehicles.find((x) => x.id === m.vehicleId)!
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState(d.settings.company.baseCurrency)
  const [km, setKm] = useState(String(v.odometerKm))
  const [tire, setTire] = useState<'summer' | 'winter' | 'all_season'>('summer')
  const [tread, setTread] = useState(String(v.tire.treadMm))
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Bakımı tamamla', 'Complete maintenance')}
      description={L('Maliyet bakım kaydında tutulur; bağlı masraf satırı kilitli oluşur. Araç Hazır sayılmaz.', 'The cost is kept on the maintenance record; the linked expense row is locked. The vehicle is not Ready.')}
      confirm={L('Tamamla', 'Complete')}
      onClose={onClose}
      onSubmit={() => {
        const minor = amount.trim() === '' ? null : parseAmount(amount, cur)
        if (amount.trim() !== '' && minor === null) {
          setFields({ cost: L('Geçerli bir tutar girin', 'Enter a valid amount') })
          return L('Maliyet geçersiz.', 'The cost is invalid.')
        }
        const x = runCompleteAct(m.id, minor === null ? null : { minor, cur }, Number(km), m.type === 'tire' ? tire : undefined, Number(tread))
        if (!x.ok) {
          setFields(x.fields)
          return x.error
        }
        onClose()
      }}
    >
      <MoneyF id="cm-c" label={L('Maliyet', 'Cost')} amount={amount} onAmount={setAmount} cur={cur} onCur={setCur} currencies={d.settings.acceptedCurrencies} error={fields.cost} />
      <TextF id="cm-km" label={L('Kilometre', 'Odometer')} value={km} onChange={(x) => setKm(x.replace(/\D/g, ''))} error={fields.km} />
      {m.type === 'tire' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectF id="cm-t" label={L('Takılan lastik', 'Mounted tyres')} value={tire} onChange={(x) => setTire(x as typeof tire)} options={[{ id: 'summer', label: L('Yazlık', 'Summer') }, { id: 'winter', label: L('Kışlık', 'Winter') }, { id: 'all_season', label: L('4 mevsim', 'All-season') }]} />
          <TextF id="cm-d" label={L('Diş derinliği (mm)', 'Tread (mm)')} value={tread} onChange={(x) => setTread(x.replace(/[^\d.]/g, ''))} />
        </div>
      )}
    </FinanceDialog>
  )
}

const runCompleteAct = (id: string, cost: { minor: number; cur: string } | null, km: number, tireTo: 'summer' | 'winter' | 'all_season' | undefined, treadMm: number) =>
  runAction((s) => completeMaintenance(s, id, { cost, km, tireTo, treadMm }), L('Bakım tamamlandı; araç Hazır değil, hazırlık kontrolü gerekir.', 'Maintenance completed; the vehicle is not Ready, a readiness check is needed.'))
