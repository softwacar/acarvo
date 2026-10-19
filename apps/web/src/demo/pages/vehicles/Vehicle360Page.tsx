import { CaretDown, ClipboardText, Plus } from '@phosphor-icons/react'
import { Link, useParams } from '@tanstack/react-router'
import { DropdownMenu } from 'radix-ui'
import { useMemo, useState } from 'react'
import { Plate } from '@/components/Plate'
import { cn } from '@/lib/utils'
import { bucketNow, checkVehicleAvailable, readinessOf, vehicleHolds } from '../../core/calc/availability'
import { rentalFinance } from '../../core/calc/finance'
import { DOC_LABEL } from '../../core/calc/policy'
import { fmt, sumByCur } from '../../core/money'
import { utilisation } from '../../core/metrics'
import { markPrepared, refuelVehicle } from '../../core/ops/rentals'
import { addDaysYmd, dayOf, DAY, startOfDay } from '../../core/time'
import type { Branch, Db, FuelLevel, Vehicle, VehicleClass } from '../../core/types'
import type { Alert } from '../../core/calc/alerts'
import { L } from '../../i18n'
import { DateTimeF, SelectF } from '../../ui/forms'
import { entityHref, runAction, useAlerts, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { BackLink, BranchTag, btnPrimary, btnSecondary, btnSmall, Empty, Facts, Link2, Notice, Panel, Pill, Status, Tabs, Timeline, DemoNote } from '../../ui/kit'
import { DataTable, type Col } from '../../ui/table'
import { ChartCard, LineChart } from '../../ui/charts'
import { ReadinessList, VehicleTimeline } from '../../ui/domain'
import { FUEL_LABEL, FUEL_TYPE_LABEL, MAINT_TYPE_LABEL } from '../../ui/status'
import { DamageDialog, IncidentDialog, LocationDialog, MaintenanceDialog, OdometerDialog, TaskDialog, TransferDialog, VehicleDocDialog } from '../shared/FleetDialogs'

type Tab = 'genel' | 'musaitlik' | 'kiralamalar' | 'kontroller' | 'bakim' | 'belgeler' | 'finans' | 'gecmis'

interface Ctx {
  v: Vehicle
  data: NonNullable<ReturnType<typeof useVehicleData>>
  d: Db
  can: (perm: string) => boolean
  f: ReturnType<typeof useFmt>
  alerts: Alert[]
  now: string
  home: Branch
  cls: VehicleClass | undefined
  loc: string
  myAlerts: Alert[]
  setDlg: (x: Dlg) => void
}

function useVehicleData(v: Vehicle | undefined) {
  const d = useDb()
  const now = d.clock.now
  return useMemo(() => {
    if (!v) return null
    const holdsNow = vehicleHolds(d, v, now, new Date(Date.parse(now) + 1000).toISOString(), now)
    const ready = readinessOf(d, v, now)
    const rentals = d.rentals.filter((r) => r.vehicleId === v.id).sort((a, b) => (b.actualPickupAt ?? b.plannedPickupAt).localeCompare(a.actualPickupAt ?? a.plannedPickupAt))
    const reservations = d.reservations.filter((r) => r.vehicleId === v.id && r.status !== 'converted').sort((a, b) => b.pickupAt.localeCompare(a.pickupAt))
    const next = [...d.rentals.filter((r) => r.vehicleId === v.id && r.status === 'prepared').map((r) => ({ kind: 'rental' as const, id: r.id, no: r.no, at: r.plannedPickupAt, branch: r.pickupBranchId })), ...d.reservations.filter((r) => r.vehicleId === v.id && r.status === 'confirmed').map((r) => ({ kind: 'reservation' as const, id: r.id, no: r.no, at: r.pickupAt, branch: r.pickupBranchId }))].filter((x) => Date.parse(x.at) >= Date.parse(now) - DAY).sort((a, b) => a.at.localeCompare(b.at))[0]
    return { holdsNow, ready, rentals, reservations, next }
  }, [d, v, now])
}

type Dlg = null | 'maint' | 'damage' | 'incident' | 'transfer' | 'task' | 'doc' | 'km' | 'loc'

const menuItem = 'flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] text-ink-2 outline-none data-[highlighted]:bg-ground data-[highlighted]:text-ink'

export function Vehicle360Page() {
  const { id } = useParams({ strict: false }) as { id: string }
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const alerts = useAlerts()
  const [tab, setTab] = useUrlState('sekme', 'genel')
  const [dlg, setDlg] = useState<Dlg>(null)
  const v = d.vehicles.find((x) => x.id === id)
  const now = d.clock.now

  const data = useVehicleData(v)

  if (!v || !data) {
    return (
      <div className="px-4 py-10 sm:px-8">
        <BackLink to="/araclar" label={L('Araçlar', 'Vehicles')} />
        <Empty title={L('Araç bulunamadı', 'Vehicle not found')} />
      </div>
    )
  }
  const cls = d.classes.find((c) => c.id === v.classId)
  const home = d.branches.find((b) => b.id === v.homeBranchId)!
  const bucket = bucketNow(d, v, now)
  const currentRental = d.rentals.find((r) => r.vehicleId === v.id && r.status === 'delivered')
  const fin = currentRental ? rentalFinance(d, currentRental.id) : null
  const myAlerts = alerts.filter((a) => (a.link.type === 'vehicle' && a.link.id === v.id) || data.holdsNow.some((h) => h.refId === a.link.id))
  const loc = d.branches.find((b) => b.id === v.location)?.name ?? (v.location === 'customer' ? L('Müşteride', 'With customer') : v.location === 'service' ? L('Serviste', 'At service') : v.location === 'transit' ? L('Yolda', 'In transit') : (d.suppliers.find((s) => s.id === v.location)?.name ?? v.location))

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'genel', label: L('Genel bakış', 'Overview') },
    { id: 'musaitlik', label: L('Müsaitlik ve planlama', 'Availability & planning') },
    { id: 'kiralamalar', label: L('Kiralama geçmişi', 'Rental history'), count: data.rentals.length + data.reservations.length },
    { id: 'kontroller', label: L('Durum ve kontroller', 'Status & checks'), count: data.ready.blockers || undefined },
    { id: 'bakim', label: L('Bakım ve lastikler', 'Service & tyres') },
    { id: 'belgeler', label: L('Belgeler ve riskler', 'Documents & risks') },
    { id: 'finans', label: L('Finans ve performans', 'Finance & performance') },
    { id: 'gecmis', label: L('Konum ve geçmiş', 'Location & history') },
  ]

  const ctx: Ctx = { v, data, d, can, f, alerts, now, home, cls, loc, myAlerts, setDlg }

  return (
    <div>
      <div className="sticky top-16 z-20 border-b border-line bg-surface/95 px-4 pt-4 backdrop-blur-sm sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1240px]">
          <BackLink to="/araclar" label={L('Araçlar', 'Vehicles')} />
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-center gap-4">
              <Plate plate={v.plate} country={v.homeBranchId === 'b-dbv' ? undefined : 'BA'} size="md" />
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em]">
                  {v.make} {v.model} <span className="font-normal text-ink-3">{v.year}</span>
                </h1>
                <p className="text-[13px] text-ink-2">
                  {cls?.name} · {v.color} · {FUEL_TYPE_LABEL()[v.fuelType]} · <BranchTag code={home.code} /> {home.name}
                  {v.source === 'external' && <span className="ml-2 rounded border border-line px-1.5 text-[11.5px]">{L('Dış araç', 'External')}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {can('reservations:manage') && (
                <Link to={`/rezervasyonlar/yeni?arac=${v.id}` as never} className={btnPrimary}>
                  <Plus size={16} /> {L('Rezervasyon aç', 'New reservation')}
                </Link>
              )}
              {can('maintenance:manage') && (
                <button type="button" className={btnSecondary} onClick={() => setDlg('maint')}>
                  {L('Bakım planla', 'Plan service')}
                </button>
              )}
              {can('damages:manage') && (
                <button type="button" className={btnSecondary} onClick={() => setDlg('damage')}>
                  {L('Hasar bildir', 'Report damage')}
                </button>
              )}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className={cn(btnSecondary, 'gap-1.5')}>
                  {L('Diğer işlemler', 'More actions')} <CaretDown size={12} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[230px] rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
                    {can('incidents:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('incident')}>{L('Olay kaydı aç', 'Open incident')}</DropdownMenu.Item>}
                    {can('tasks:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('task')}>{L('Görev oluştur', 'Create task')}</DropdownMenu.Item>}
                    {can('vehicles:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('transfer')}>{L('Transfer talebi', 'Request transfer')}</DropdownMenu.Item>}
                    {can('vehicles:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('doc')}>{L('Belge ekle', 'Add document')}</DropdownMenu.Item>}
                    {can('vehicles:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('km')}>{L('Kilometre kaydı', 'Record odometer')}</DropdownMenu.Item>}
                    {can('vehicles:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('loc')}>{L('Fiziksel konum güncelle', 'Update physical location')}</DropdownMenu.Item>}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line-soft py-3 sm:grid-cols-3 lg:grid-cols-6">
            <Strip label={L('Müsaitlik (şimdi)', 'Availability (now)')}><Status kind="bucket" value={bucket} /></Strip>
            <Strip label={L('Hazırlık', 'Readiness')}>{data.ready.ready ? <Pill tone="ok">{L('Hazır', 'Ready')}</Pill> : <Pill tone="alert">{L(`${data.ready.blockers} engel`, `${data.ready.blockers} blocker(s)`)}</Pill>}</Strip>
            <Strip label={L('Kilometre', 'Odometer')}><span className="tnum font-medium">{v.odometerKm.toLocaleString('tr')} km</span></Strip>
            <Strip label={L('Fiziksel konum', 'Physical location')}><span className="font-medium">{loc}</span></Strip>
            <Strip label={L('Anahtar', 'Key')}><span className="font-medium">{v.keys.count ? `${v.keys.count} · ${v.keys.holder}` : L('Yok', 'None')}</span></Strip>
            <Strip label={L('Finans (aktif kiralama)', 'Finance (active rental)')}>{fin ? <span className={cn('tnum font-medium', fin.outstandingMinor > 0 && 'text-hold')}>{fin.outstandingMinor > 0 ? fmt(fin.outstandingMinor, fin.cur) + ' ' + L('açık', 'open') : L('Bakiye yok', 'No balance')}</span> : <span className="text-ink-3">—</span>}</Strip>
          </dl>
          <Tabs tabs={tabs} value={tab as Tab} onChange={setTab} label={L('Araç bölümleri', 'Vehicle sections')} />
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {tab === 'genel' && <Overview c={ctx} />}
        {tab === 'musaitlik' && <Availability c={ctx} />}
        {tab === 'kiralamalar' && <History c={ctx} />}
        {tab === 'kontroller' && <Checks c={ctx} />}
        {tab === 'bakim' && <Service c={ctx} />}
        {tab === 'belgeler' && <Docs c={ctx} />}
        {tab === 'finans' && <Performance c={ctx} />}
        {tab === 'gecmis' && <LocationHistory c={ctx} />}
      </div>

      {dlg === 'maint' && <MaintenanceDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
      {dlg === 'damage' && <DamageDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
      {dlg === 'incident' && <IncidentDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
      {dlg === 'task' && <TaskDialog link={{ type: 'vehicle', id: v.id }} defaultTitle={`${v.plate}: `} onClose={() => setDlg(null)} />}
      {dlg === 'transfer' && <TransferDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
      {dlg === 'doc' && <VehicleDocDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
      {dlg === 'km' && <OdometerDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
      {dlg === 'loc' && <LocationDialog vehicleId={v.id} onClose={() => setDlg(null)} />}
    </div>
  )
}
// ------------------------------------------------------------------ tabs (top-level components: their state survives re-renders)

function Overview({ c }: { c: Ctx }) {
  const { v, data, f, home, cls, loc, myAlerts } = c
  const nextCheck = data!.next ? { ready: data!.ready.ready, when: f.dt(data!.next.at, data!.next.branch) } : null
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <Panel title={L('Sonraki teslim gerçekten hazır mı?', 'Is the next pickup really ready?')} description={L('Müsaitlik ile hazırlık ayrı sorulardır; bu kutu ikisini birlikte okur.', 'Availability and readiness are separate questions; this box reads both.')}>
          {data!.next ? (
            <div className="space-y-3">
              <p className="text-[14px]">
                {L('Sonraki teslim', 'Next pickup')}: <Link2 type={data!.next.kind} id={data!.next.id}>{data!.next.no}</Link2> · <span className="tnum">{nextCheck!.when}</span>
              </p>
              {data!.ready.ready ? <Notice tone="ok">{L('Araç şu an teslime hazır: tüm engeller temiz.', 'The vehicle is ready now: no blockers.')}</Notice> : <Notice tone="alert">{L('Araç teslime hazır değil. Teslimden önce şunlar çözülmeli:', 'Not ready for pickup. To resolve before handover:')} {data!.ready.items.filter((i) => !i.ok && i.severity === 'blocker').map((i) => i.label).join(', ')}</Notice>}
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">{L('Planlı bir teslim yok.', 'No pickup is planned.')}</p>
          )}
        </Panel>
        <Panel title={L('Önümüzdeki 30 gün', 'Next 30 days')}>
          <VehicleTimeline v={v!} days={30} />
        </Panel>
        {myAlerts.length > 0 && (
          <Panel title={L('Bu araçla ilgili uyarılar', 'Alerts for this vehicle')} flush>
            <ul className="divide-y divide-line-soft">
              {myAlerts.map((a) => (
                <li key={a.id}>
                  <Link to={entityHref(a.link.type, a.link.id) as never} className="flex items-start gap-3 px-4 py-2.5 hover:bg-ground/60 sm:px-5">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-alert' : a.severity === 'warning' ? 'bg-hold' : 'bg-blue')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium">{a.title}</span>
                      <span className="block text-[12.5px] text-ink-2">{a.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
      <div className="min-w-0 space-y-5">
        <Panel title={L('Araç bilgileri', 'Vehicle facts')}>
          <Facts
            single
            rows={[
              [L('Sınıf', 'Class'), cls?.name],
              [L('Şasi no', 'VIN'), <span className="tnum">{v!.vin || '—'}</span>],
              [L('Yakıt seviyesi', 'Fuel level'), FUEL_LABEL()[v!.fuel]],
              [L('Lastik', 'Tyres'), `${v!.tire.type === 'summer' ? L('Yaz', 'Summer') : v!.tire.type === 'winter' ? L('Kış', 'Winter') : L('4 mevsim', 'All-season')} · ${v!.tire.treadMm} mm`],
              [L('Periyodik bakım', 'Periodic service'), `${(v!.service.lastKm + v!.service.intervalKm).toLocaleString('tr')} km`],
              [L('Ana şube', 'Home branch'), home.name],
              [L('Fiziksel konum', 'Physical location'), loc],
            ]}
          />
          <DemoNote>{L('Ana şube ile fiziksel konum farklı olabilir; transfer ana şubeyi değiştirmez.', 'Home branch and physical location can differ; a transfer does not change the home branch.')}</DemoNote>
        </Panel>
        <Panel title={L('Şu an bu aracı tutanlar', 'What holds this vehicle now')}>
          {data!.holdsNow.length === 0 ? (
            <p className="text-[13px] text-ink-2">{L('Şu an hiçbir kayıt aracı tutmuyor.', 'Nothing holds the vehicle right now.')}</p>
          ) : (
            <ul className="space-y-2 text-[13px]">
              {data!.holdsNow.map((h) => (
                <li key={h.kind + h.refId}>
                  {h.link ? <Link2 type={h.link} id={h.refId}>{h.label}</Link2> : h.label}
                  <span className="block text-ink-2">{h.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Availability({ c }: { c: Ctx }) {
  const { v, d, can, f, now } = c
  const tz = f.zone(v!.homeBranchId)
  const today = dayOf(now, tz)
  const [days, setDays] = useUrlState('gun', '30')
  const [from, setFrom] = useState(startOfDay(addDaysYmd(today, 1), tz))
  const [to, setTo] = useState(startOfDay(addDaysYmd(today, 3), tz))
  const check = checkVehicleAvailable(d, v!, from, to, now)
  const holds = vehicleHolds(d, { ...v!, source: 'internal' }, startOfDay(addDaysYmd(today, -30), tz), startOfDay(addDaysYmd(today, 120), tz), now)
  return (
    <div className="space-y-5">
      <Panel title={L('Zaman çizelgesi', 'Timeline')} action={<div className="flex gap-1">{['7', '30', '90'].map((x) => <button key={x} type="button" onClick={() => setDays(x)} aria-pressed={days === x} className={cn('h-8 rounded-md border px-2.5 text-[13px] font-medium', days === x ? 'border-blue bg-blue-soft text-blue-ink' : 'border-line hover:bg-ground')}>{x} {L('gün', 'd')}</button>)}</div>}>
        <VehicleTimeline v={v!} days={Number(days)} />
      </Panel>
      <Panel title={L('Bu aralıkta müsait mi?', 'Available in this window?')} description={L('Rezervasyon, kiralama, bakım, hasar ve transfer ile aynı ortak kural.', 'The same shared rule as reservations, rentals, maintenance, damage and transfers.')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-[720px]">
          <DateTimeF id="av-from" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={tz} />
          <DateTimeF id="av-to" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={tz} />
        </div>
        <div className="mt-3">
          {check.ok ? (
            <Notice tone="ok">
              <span className="flex flex-wrap items-center gap-3">
                {L('Bu aralıkta çakışan kayıt yok.', 'Nothing collides in this window.')}
                {can('reservations:manage') && <Link to={`/rezervasyonlar/yeni?arac=${v!.id}&bas=${encodeURIComponent(from)}&bit=${encodeURIComponent(to)}` as never} className={btnSmall}>{L('Bu aralıkla rezervasyon başlat', 'Start a reservation for this window')}</Link>}
              </span>
            </Notice>
          ) : (
            <Notice tone="alert">
              <p className="font-medium">{L('Uygun değil. Nedenler:', 'Not available. Reasons:')}</p>
              <ul className="mt-1 list-disc pl-5">{check.conflicts.map((c) => <li key={c.kind + c.refId}>{c.link ? <Link2 type={c.link} id={c.refId}>{c.label}</Link2> : c.label}: {c.detail}</li>)}</ul>
            </Notice>
          )}
        </div>
      </Panel>
      <Panel title={L('Planlı kayıtlar', 'Scheduled records')} flush>
        {holds.length === 0 ? <Empty title={L('Planlı kayıt yok', 'Nothing scheduled')} /> : (
          <ul className="divide-y divide-line-soft text-[13px]">
            {holds.map((h) => (
              <li key={h.kind + h.refId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                <span className="min-w-[160px] font-medium">{h.link ? <Link2 type={h.link} id={h.refId}>{h.label}</Link2> : h.label}</span>
                <span className="tnum text-ink-2">{h.from > 0 ? f.dt(new Date(h.from).toISOString(), v!.homeBranchId) : '—'} → {h.to ? f.dt(new Date(h.to).toISOString(), v!.homeBranchId) : L('belirsiz (açık uçlu)', 'open-ended')}</span>
                <span className="text-ink-3">{h.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function History({ c }: { c: Ctx }) {
  const { data, d, f } = c
  type Row = { kind: 'rental' | 'reservation'; id: string; no: string; status: string; from: string; to: string; customer: string; branch: string }
  const rows: Row[] = [
    ...data!.rentals.map((r): Row => ({ kind: 'rental', id: r.id, no: r.no, status: r.status, from: r.actualPickupAt ?? r.plannedPickupAt, to: r.actualReturnAt ?? r.plannedReturnAt, customer: d.customers.find((c) => c.id === r.customerId)?.name ?? '', branch: r.pickupBranchId })),
    ...data!.reservations.map((r): Row => ({ kind: 'reservation', id: r.id, no: r.no, status: r.status, from: r.pickupAt, to: r.returnAt, customer: d.customers.find((c) => c.id === r.customerId)?.name ?? '', branch: r.pickupBranchId })),
  ].sort((a, b) => b.from.localeCompare(a.from))
  const cols: Col<Row>[] = [
    { id: 'no', header: L('No', 'No'), cell: (r) => <Link2 type={r.kind} id={r.id}><span className="tnum">{r.no}</span></Link2>, sort: (r) => r.no },
    { id: 'type', header: L('Tür', 'Type'), cell: (r) => (r.kind === 'rental' ? L('Kiralama', 'Rental') : L('Rezervasyon', 'Reservation')), hideBelow: 'sm' },
    { id: 'cust', header: L('Müşteri', 'Customer'), cell: (r) => r.customer },
    { id: 'from', header: L('Başlangıç', 'From'), cell: (r) => <span className="tnum">{f.dt(r.from, r.branch)}</span>, sort: (r) => r.from },
    { id: 'to', header: L('Bitiş', 'To'), cell: (r) => <span className="tnum">{f.dt(r.to, r.branch)}</span>, hideBelow: 'md' },
    { id: 'st', header: L('Durum', 'Status'), cell: (r) => <Status kind={r.kind} value={r.status} /> },
  ]
  return <DataTable rows={rows} cols={cols} rowKey={(r) => r.kind + r.id} label={L('Kiralama geçmişi', 'Rental history')} urlKey="gecmis" defaultSort={{ id: 'from', dir: 'desc' }} empty={<Empty title={L('Bu araç için kayıt yok', 'No records for this vehicle')} />} />
}

function Checks({ c }: { c: Ctx }) {
  const { v, data, can, f } = c
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title={L('Hazırlık kontrol listesi', 'Readiness checklist')} description={L('Bakım veya iade tamamlamak aracı otomatik hazır yapmaz; hazırlık ayrı bir kayıttır.', 'Finishing service or a return never makes a vehicle Ready by itself; readiness is its own record.')} action={can('vehicles:manage') && !data!.ready.items.find((i) => i.key === 'clean')?.ok ? <button type="button" className={btnPrimary} onClick={() => runAction((x) => markPrepared(x, v!.id, L('Temizlik ve hazırlık kontrolü yapıldı', 'Cleaning and readiness check done')), L('Araç hazırlandı olarak işaretlendi (demo).', 'Vehicle marked as prepared (demo).'))}>{L('Hazırlandı olarak işaretle', 'Mark as prepared')}</button> : undefined}>
        <ReadinessList items={data!.ready.items} />
        {v!.readiness.checkedAt && <p className="mt-3 text-[12.5px] text-ink-3">{L('Son hazırlık kontrolü', 'Last readiness check')}: {f.dt(v!.readiness.checkedAt)}</p>}
      </Panel>
      <div className="space-y-5">
        <Panel title={L('Yakıt', 'Fuel')}>
          <SelectF id="fuel" label={L('Yakıt seviyesi', 'Fuel level')} value={v!.fuel} onChange={(x) => can('vehicles:manage') && runAction((y) => refuelVehicle(y, v!.id, x as FuelLevel), L('Yakıt güncellendi (demo).', 'Fuel updated (demo).'))} options={Object.entries(FUEL_LABEL()).map(([id, label]) => ({ id, label }))} />
        </Panel>
        <Panel title={L('Anahtar ve ekipman', 'Keys & equipment')}>
          <Facts rows={[[L('Anahtar', 'Keys'), `${v!.keys.count}`], [L('Bulunduğu yer', 'Held by'), v!.keys.holder]]} />
        </Panel>
      </div>
    </div>
  )
}

function Service({ c }: { c: Ctx }) {
  const { v, d, can, f, setDlg } = c
  const list = d.maintenance.filter((m) => m.vehicleId === v!.id).sort((a, b) => b.plannedStart.localeCompare(a.plannedStart))
  const over = v!.odometerKm - v!.service.lastKm - v!.service.intervalKm
  const types = MAINT_TYPE_LABEL()
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={L('Periyodik bakım', 'Periodic service')}>
          <Facts rows={[[L('Son bakım', 'Last service'), `${v!.service.lastKm.toLocaleString('tr')} km · ${f.date(v!.service.lastAt)}`], [L('Aralık', 'Interval'), `${v!.service.intervalKm.toLocaleString('tr')} km`], [L('Durum', 'State'), over > 0 ? <Pill tone="alert">{L(`${over.toLocaleString('tr')} km gecikti`, `${over.toLocaleString('tr')} km overdue`)}</Pill> : <Pill tone={over > -1000 ? 'hold' : 'ok'}>{L(`${(-over).toLocaleString('tr')} km kaldı`, `${(-over).toLocaleString('tr')} km left`)}</Pill>]]} />
        </Panel>
        <Panel title={L('Lastik takibi', 'Tyre tracking')}>
          <Facts rows={[[L('Takılı set', 'Mounted set'), v!.tire.type === 'summer' ? L('Yaz', 'Summer') : v!.tire.type === 'winter' ? L('Kış', 'Winter') : L('4 mevsim', 'All-season')], [L('Takılma tarihi', 'Mounted on'), f.date(v!.tire.mountedAt)], [L('Diş derinliği', 'Tread'), <span className={cn('tnum', v!.tire.treadMm < 3 && 'text-alert')}>{v!.tire.treadMm} mm</span>]]} />
        </Panel>
      </div>
      <Panel title={L('Bakım kayıtları', 'Service records')} action={can('maintenance:manage') ? <button type="button" className={btnSecondary} onClick={() => setDlg('maint')}>{L('Bakım planla', 'Plan service')}</button> : undefined} flush>
        {list.length === 0 ? <Empty title={L('Bakım kaydı yok', 'No service records')} /> : (
          <ul className="divide-y divide-line-soft text-[13px]">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                <Link2 type="maintenance" id={m.id}><span className="tnum">{m.no}</span></Link2>
                <span>{types[m.type]}</span>
                <span className="tnum text-ink-2">{f.dt(m.plannedStart, v!.homeBranchId)}</span>
                <Status kind="maintenance" value={m.status} />
                <span className="tnum ml-auto text-ink-2">{m.cost ? fmt(m.cost.minor, m.cost.cur) : '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Docs({ c }: { c: Ctx }) {
  const { v, d, can, f, alerts, now, setDlg } = c
  const docs = d.documents.filter((x) => x.ownerType === 'vehicle' && x.ownerId === v!.id)
  const today = dayOf(now, f.zone())
  const vAlerts = alerts.filter((a) => a.link.id === v!.id && (a.kind.startsWith('doc') || a.kind.startsWith('service')))
  return (
    <div className="space-y-5">
      <Panel title={L('Araç belgeleri', 'Vehicle documents')} description={L('Belgenin sahibi bu araç kaydıdır; Belge Merkezi yalnız dizin gösterir. Demo belgeleri dosya içermez.', 'This vehicle record owns its documents; the Document Center only indexes them. Demo documents carry no file.')} action={can('documents:manage') ? <button type="button" className={btnSecondary} onClick={() => setDlg('doc')}><ClipboardText size={15} /> {L('Belge ekle', 'Add document')}</button> : undefined} flush>
        {docs.length === 0 ? <Empty title={L('Belge yok', 'No documents')} /> : (
          <ul className="divide-y divide-line-soft text-[13px]">
            {docs.map((x) => {
              const left = x.validUntil ? Math.floor((Date.parse(`${x.validUntil}T23:59:59Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY) : null
              const state = left === null ? 'valid' : left < 0 ? 'expired' : left <= d.settings.docs.warnDays ? 'expiring' : 'valid'
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5">
                  <span className="min-w-[160px] font-medium">{DOC_LABEL[x.kind] ?? x.kind} <span className="font-normal text-ink-3">v{x.version}</span></span>
                  <span className="tnum text-ink-2">{x.validUntil ?? '—'}</span>
                  <Status kind="doc" value={state} />
                  <span className="text-ink-3">{left !== null ? (left < 0 ? L(`${-left} gün önce doldu`, `expired ${-left} d ago`) : L(`${left} gün kaldı`, `${left} d left`)) : ''}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <Panel title={L('Riskler', 'Risks')}>
        {vAlerts.length === 0 ? <p className="text-[13px] text-ink-2">{L('Bu araç için belge veya bakım riski yok.', 'No document or service risk for this vehicle.')}</p> : <ul className="space-y-2 text-[13px]">{vAlerts.map((a) => <li key={a.id}><span className="font-medium">{a.title}</span><span className="block text-ink-2">{a.detail}</span></li>)}</ul>}
      </Panel>
    </div>
  )
}

function Performance({ c }: { c: Ctx }) {
  const { v, d, f, now } = c
  const [range, setRange] = useUrlState('donem', '90')
  const n = Number(range)
  const to = new Date(Date.parse(now)).toISOString()
  const from = new Date(Date.parse(now) - n * DAY).toISOString()
  const u = utilisation(d, v!, from, to)
  const rs = d.rentals.filter((r) => r.vehicleId === v!.id && r.status !== 'cancelled' && r.status !== 'prepared')
  const charged: Record<string, number> = {}
  const collected: Record<string, number> = {}
  for (const r of rs) {
    const fi = rentalFinance(d, r.id)
    charged[fi.cur] = (charged[fi.cur] ?? 0) + fi.chargesMinor
    collected[fi.cur] = (collected[fi.cur] ?? 0) + fi.appliedMinor
  }
  const maintCost = sumByCur(d.maintenance.filter((m) => m.vehicleId === v!.id && m.cost), (m) => m.cost)
  const curs = [...new Set([...Object.keys(charged), ...Object.keys(maintCost)])].sort()
  const odo = d.odometer.filter((o) => o.vehicleId === v!.id).sort((a, b) => a.at.localeCompare(b.at))
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="flex gap-1">{['30', '90', '180'].map((x) => <button key={x} type="button" aria-pressed={range === x} onClick={() => setRange(x)} className={cn('h-8 rounded-md border px-2.5 text-[13px] font-medium', range === x ? 'border-blue bg-blue-soft text-blue-ink' : 'border-line hover:bg-ground')}>{x} {L('gün', 'd')}</button>)}</div>
      </div>
      <Panel title={L('Kullanım', 'Utilisation')} description={L('Gerçek kiralama, bakım ve engel kayıtlarından.', 'From real rental, service and block records.')}>
        <Facts rows={[[L('Kullanım oranı', 'Utilisation'), <span className="tnum">{(u.rate * 100).toFixed(1)}%</span>], [L('Kirada', 'Rented'), `${(u.rentedHours / 24).toFixed(1)} ${L('gün', 'days')}`], [L('Bakım', 'Service'), `${(u.maintenanceHours / 24).toFixed(1)} ${L('gün', 'days')}`], [L('Engelli', 'Blocked'), `${(u.blockedHours / 24).toFixed(1)} ${L('gün', 'days')}`], [L('Boşta', 'Idle'), `${(u.idleHours / 24).toFixed(1)} ${L('gün', 'days')}`], [L('Kiralama / km', 'Rentals / km'), `${u.rentals} · ${u.km.toLocaleString('tr')} km`]]} />
      </Panel>
      <Panel title={L('Para birimine göre', 'By currency')} description={L('Para birimleri toplanmaz. Net kâr hesaplanmaz.', 'Currencies are not added. No net profit is calculated.')} flush>
        {curs.length === 0 ? <Empty title={L('Veri yok', 'No data')} /> : (
          <table className="w-full text-[13px]"><thead><tr className="border-b border-line-soft text-left text-[12px] text-ink-2"><th scope="col" className="px-4 py-2 font-medium sm:px-5">{L('Para birimi', 'Currency')}</th><th scope="col" className="px-3 py-2 text-right font-medium">{L('Kayıtlı kalem', 'Posted')}</th><th scope="col" className="px-3 py-2 text-right font-medium">{L('Uygulanan tahsilat', 'Applied')}</th><th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">{L('Bakım maliyeti', 'Service cost')}</th></tr></thead>
            <tbody className="divide-y divide-line-soft">{curs.map((c) => <tr key={c} className="h-11"><th scope="row" className="px-4 text-left font-semibold sm:px-5">{c}</th><td className="tnum px-3 text-right">{fmt(charged[c] ?? 0, c)}</td><td className="tnum px-3 text-right text-ok">{fmt(collected[c] ?? 0, c)}</td><td className="tnum px-4 text-right sm:px-5">{fmt(maintCost[c] ?? 0, c)}</td></tr>)}</tbody></table>
        )}
      </Panel>
      <ChartCard title={L('Kilometre gelişimi', 'Odometer progress')} source={L('Kaynak: kilometre kayıtları (tek km gerçeği).', 'Source: odometer readings (the single odometer truth).')} chart={<LineChart points={odo.map((o) => ({ x: f.date(o.at).slice(0, 5), ys: [o.km] }))} series={[{ name: 'km', color: 'var(--ac-blue)' }]} format={(x) => x.toLocaleString('tr')} />} head={[L('Tarih', 'Date'), 'km', L('Kaynak', 'Source')]} rows={odo.map((o) => [f.dt(o.at), o.km.toLocaleString('tr'), o.source])} />
    </div>
  )
}

function LocationHistory({ c }: { c: Ctx }) {
  const { v, d, can, f, setDlg } = c
  const odo = d.odometer.filter((o) => o.vehicleId === v!.id).sort((a, b) => b.at.localeCompare(a.at))
  const locs = d.locations.filter((l) => l.vehicleId === v!.id).sort((a, b) => b.at.localeCompare(a.at))
  const events = d.events.filter((e) => e.sourceType === 'vehicle' && e.sourceId === v!.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={L('Kilometre geçmişi', 'Odometer history')} action={can('vehicles:manage') ? <button type="button" className={btnSmall} onClick={() => setDlg('km')}>{L('Km kaydet', 'Record km')}</button> : undefined} flush>
        <ul className="divide-y divide-line-soft text-[13px]">{odo.slice(0, 20).map((o) => <li key={o.id} className="flex items-center gap-3 px-4 py-2 sm:px-5"><span className="tnum w-[120px] text-ink-2">{f.dt(o.at)}</span><span className="tnum font-medium">{o.km.toLocaleString('tr')} km</span><span className="ml-auto text-ink-3">{o.source}</span></li>)}</ul>
      </Panel>
      <Panel title={L('Konum geçmişi', 'Location history')} description={L('Fiziksel konum; ana şube değişmedi.', 'Physical location; the home branch did not change.')} action={can('vehicles:manage') ? <button type="button" className={btnSmall} onClick={() => setDlg('loc')}>{L('Konum kaydet', 'Record location')}</button> : undefined} flush>
        <ul className="divide-y divide-line-soft text-[13px]">{locs.slice(0, 20).map((l) => <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 sm:px-5"><span className="tnum w-[120px] text-ink-2">{f.dt(l.at)}</span><span className="font-medium">{d.branches.find((b) => b.id === l.location)?.name ?? l.location}</span><span className="text-ink-3">{l.reason}</span></li>)}</ul>
      </Panel>
      <Panel title={L('İşlem geçmişi', 'Activity')} className="lg:col-span-2">
        <Timeline entries={events.map((e) => ({ id: e.id, at: e.at, by: e.actorId, action: e.summary, detail: e.reason ?? '' }))} />
      </Panel>
    </div>
  )
}

function Strip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[13.5px]">{children}</dd>
    </div>
  )
}
