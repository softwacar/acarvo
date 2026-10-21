import { Plus } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { BUCKET_ORDER, bucketNow, checkVehicleAvailable, readinessOf } from '../../core/calc/availability'
import { COUNTED_VEHICLE } from '../../core/metrics'
import { addDaysYmd, dayOf, zonedIso } from '../../core/time'
import { L } from '../../i18n'
import { DateTimeF, branchOptions, classOptions } from '../../ui/forms'
import { useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { BranchTag, btnPrimary, btnSecondary, FilterBar, FilterSelect, Kpis, Page, Segmented, SearchBox, Status, Panel } from '../../ui/kit'
import { DataTable, type Col, downloadCsv } from '../../ui/table'
import { VehicleCell } from '../../ui/domain'
import { FUEL_LABEL, statusOf } from '../../ui/status'
import type { Vehicle } from '../../core/types'
import { fmtDateTime } from '../../core/time'

export function VehiclesPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const [q, setQ] = useUrlState('q')
  const [state, setState] = useUrlState('durum', 'all')
  const [branch, setBranch] = useUrlState('sube', 'all')
  const [cls, setCls] = useUrlState('sinif', 'all')
  const [source, setSource] = useUrlState('kaynak', 'all')
  const [ready, setReady] = useUrlState('hazir', 'all')
  const [mode, setMode] = useUrlState('gorunum', 'now')
  const tz = f.zone()
  const today = dayOf(d.clock.now, tz)
  const [from, setFrom] = useUrlState('bas', zonedIso(addDaysYmd(today, 1), '10:00', tz))
  const [to, setTo] = useUrlState('bit', zonedIso(addDaysYmd(today, 4), '10:00', tz))
  const period = mode === 'period'

  const rows = useMemo(() => {
    return d.vehicles
      .filter((v) => v.status !== 'sold' && active.includes(v.homeBranchId))
      .filter((v) => (branch === 'all' ? true : v.homeBranchId === branch))
      .filter((v) => (cls === 'all' ? true : v.classId === cls))
      .filter((v) => (source === 'all' ? true : v.source === source))
      .filter((v) => (q ? `${v.plate} ${v.make} ${v.model} ${v.vin}`.toLowerCase().includes(q.toLowerCase()) : true))
      .map((v) => {
        const bucket = bucketNow(d, v, d.clock.now)
        const r = readinessOf(d, v, d.clock.now)
        const win = period ? checkVehicleAvailable(d, v, from, to, d.clock.now) : null
        return { v, bucket, r, win }
      })
      .filter((x) => (ready === 'all' ? true : ready === 'ready' ? x.r.ready : !x.r.ready))
      .filter((x) => (state === 'all' ? true : period ? (state === 'available' ? x.win?.ok : !x.win?.ok) : x.bucket === state))
  }, [d, active, branch, cls, source, q, ready, state, period, from, to])

  const counted = d.vehicles.filter((v) => active.includes(v.homeBranchId) && COUNTED_VEHICLE(d, v))
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const v of counted) c[bucketNow(d, v, d.clock.now)] = (c[bucketNow(d, v, d.clock.now)] ?? 0) + 1
    return c
  }, [d, counted])
  const notReady = counted.filter((v) => !readinessOf(d, v, d.clock.now).ready).length

  const cols: Col<(typeof rows)[number]>[] = [
    { id: 'plate', header: L('Plaka', 'Plate'), cell: (r) => <VehicleCell v={r.v} />, sort: (r) => r.v.plate, csv: (r) => r.v.plate },
    { id: 'class', header: L('Sınıf', 'Class'), cell: (r) => d.classes.find((c) => c.id === r.v.classId)?.name, sort: (r) => r.v.classId, hideBelow: 'md', csv: (r) => d.classes.find((c) => c.id === r.v.classId)?.name ?? '' },
    {
      id: 'home',
      header: L('Ana şube', 'Home'),
      cell: (r) => <BranchTag code={d.branches.find((b) => b.id === r.v.homeBranchId)!.code} />,
      sort: (r) => r.v.homeBranchId,
      hideBelow: 'lg',
      csv: (r) => d.branches.find((b) => b.id === r.v.homeBranchId)?.code ?? '',
    },
    {
      id: 'loc',
      header: L('Fiziksel konum', 'Physical location'),
      cell: (r) => <LocationText v={r.v} />,
      hideBelow: 'lg',
    },
    {
      id: 'avail',
      header: period ? L('Seçili dönemde', 'In the window') : L('Müsaitlik (şimdi)', 'Availability (now)'),
      cell: (r) =>
        period ? (
          r.win?.ok ? (
            <Status kind="bucket" value="available" />
          ) : (
            <span className="text-[12.5px] text-alert">{r.win?.conflicts[0]?.label}</span>
          )
        ) : (
          <Status kind="bucket" value={r.bucket} />
        ),
      sort: (r) => (period ? (r.win?.ok ? 0 : 1) : BUCKET_ORDER.indexOf(r.bucket)),
      csv: (r) => (period ? (r.win?.ok ? 'available' : 'conflict') : r.bucket),
    },
    {
      id: 'ready',
      header: L('Hazırlık', 'Readiness'),
      cell: (r) => (r.r.ready ? <span className="text-[12.5px] font-medium text-ok">{L('Hazır', 'Ready')}</span> : <span className="text-[12.5px] font-medium text-alert">{L(`${r.r.blockers} engel`, `${r.r.blockers} blocker(s)`)}</span>),
      sort: (r) => r.r.blockers,
      csv: (r) => (r.r.ready ? 'ready' : 'not ready'),
    },
    { id: 'km', header: 'Km', align: 'right', cell: (r) => <span className="tnum">{r.v.odometerKm.toLocaleString('tr')}</span>, sort: (r) => r.v.odometerKm, hideBelow: 'md', csv: (r) => r.v.odometerKm },
    { id: 'fuel', header: L('Yakıt', 'Fuel'), cell: (r) => FUEL_LABEL()[r.v.fuel], hideBelow: 'lg' },
    {
      id: 'src',
      header: L('Kaynak', 'Source'),
      cell: (r) => <span className="text-[12.5px] text-ink-2">{r.v.source === 'external' ? L('Dış araç', 'External') : L('İç filo', 'Own fleet')}</span>,
      hideBelow: 'lg',
    },
  ]

  const reset = () => {
    setQ('')
    setState('all')
    setBranch('all')
    setCls('all')
    setSource('all')
    setReady('all')
    setMode('now')
  }
  const filtersOn = q !== '' || state !== 'all' || branch !== 'all' || cls !== 'all' || source !== 'all' || ready !== 'all' || mode !== 'now'

  return (
    <Page
      title={L('Araçlar', 'Vehicles')}
      description={L('Filo operasyon masası: müsaitlik, hazırlık, konum ve kilometre ayrı kolonlardır. Bir araca tıklayın: Araç 360°.', 'Fleet desk: availability, readiness, location and mileage are separate columns. Click a vehicle for Vehicle 360°.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('araclar', cols, rows)}>
            CSV
          </button>
          {can('vehicles:manage') && (
            <Link to={'/araclar/yeni' as never} className={btnPrimary}>
              <Plus size={16} /> {L('Araç ekle', 'Add vehicle')}
            </Link>
          )}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Toplam araç', 'Total vehicles'), value: counted.length, hint: L('Dış araçlar yalnız teslim alınmışsa', 'External only when received') },
          { label: L('Müsait (şimdi)', 'Available (now)'), value: counts.available ?? 0, tone: 'ok', to: '/araclar?durum=available' },
          { label: L('Kirada', 'Rented'), value: counts.rented ?? 0, to: '/araclar?durum=rented' },
          { label: L('Bakım / engel', 'Service / blocked'), value: (counts.maintenance ?? 0) + (counts.unavailable ?? 0), tone: (counts.unavailable ?? 0) > 0 ? 'alert' : undefined, to: '/araclar?durum=maintenance' },
          { label: L('Hazır değil', 'Not ready'), value: notReady, hint: L('Hazırlık ≠ müsaitlik', 'Readiness ≠ availability'), tone: notReady ? 'hold' : undefined, to: '/araclar?hazir=notready' },
        ]}
      />
      <FilterBar onReset={reset} active={filtersOn}>
        <SearchBox label={L('Araçlarda ara', 'Search vehicles')} placeholder={L('Plaka, marka, model…', 'Plate, make, model…')} value={q} onChange={setQ} />
        <Segmented label={L('Görünüm', 'View')} value={mode} onChange={setMode} options={[{ id: 'now', label: L('Şimdi', 'Now') }, { id: 'period', label: L('Seçili dönem', 'Selected period') }]} />
        <FilterSelect label={L('Durum', 'State')} value={state} onChange={setState} options={[{ id: 'all', label: L('Tüm durumlar', 'All states') }, ...(period ? [{ id: 'available', label: L('Dönemde müsait', 'Available in window') }, { id: 'conflict', label: L('Dönemde çakışma', 'Conflict in window') }] : BUCKET_ORDER.map((b) => ({ id: b, label: statusOf('bucket', b).label })))]} />
        <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
        <FilterSelect label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={[{ id: 'all', label: L('Tüm sınıflar', 'All classes') }, ...classOptions(d)]} />
        <FilterSelect label={L('Hazırlık', 'Readiness')} value={ready} onChange={setReady} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: 'ready', label: L('Hazır', 'Ready') }, { id: 'notready', label: L('Hazır değil', 'Not ready') }]} />
        <FilterSelect label={L('Kaynak', 'Source')} value={source} onChange={setSource} options={[{ id: 'all', label: L('İç + dış', 'Own + external') }, { id: 'internal', label: L('İç filo', 'Own fleet') }, { id: 'external', label: L('Dış araç', 'External') }]} />
      </FilterBar>
      {period && (
        <Panel title={L('Dönem uygunluğu', 'Window availability')} description={L('Seçilen aralık için ortak uygunluk kuralı çalışır; sonuçta nedeni görürsünüz. Şu anki durumdan farklı bir sorudur.', 'The shared availability rule runs for the chosen window. This is a different question from the state right now.')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-[720px]">
            <DateTimeF id="va-from" label={L('Başlangıç', 'From')} value={from} onChange={setFrom} tz={tz} />
            <DateTimeF id="va-to" label={L('Bitiş', 'To')} value={to} onChange={setTo} tz={tz} />
          </div>
          <p className="mt-2 text-[12.5px] text-ink-3">{L('Hazırlık bu sonuca dahil değildir: müsait ama hazır olmayan araçlar “Hazırlık” kolonunda görünür.', 'Readiness is not part of this result: vehicles that are available but not ready show it in the Readiness column.')}</p>
        </Panel>
      )}
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.v.id} label={L('Araç listesi', 'Vehicle list')} urlKey="araclar" defaultSort={{ id: 'plate', dir: 'asc' }} rowHref={(r) => `/araclar/${r.v.id}`} pageSize={15} empty={<div className="px-4 py-10 text-center text-ink-2">{L('Bu filtrelerle araç yok.', 'No vehicles match these filters.')}</div>} />
      <p className="text-[12px] text-ink-3">{L(`Son güncelleme: ${fmtDateTime(d.clock.now, tz)} (demo zamanı).`, `As of ${fmtDateTime(d.clock.now, tz)} (demo time).`)}</p>
    </Page>
  )
}

function LocationText({ v }: { v: Vehicle }) {
  const d = useDb()
  const b = d.branches.find((x) => x.id === v.location)
  const label = b ? b.name : v.location === 'customer' ? L('Müşteride', 'With customer') : v.location === 'service' ? L('Serviste', 'At service') : v.location === 'transit' ? L('Yolda', 'In transit') : (d.suppliers.find((s) => s.id === v.location)?.name ?? v.location)
  const away = b && b.id !== v.homeBranchId
  return (
    <span className="text-[13px]">
      {label}
      {away && <span className="ml-1.5 text-[11.5px] text-hold">{L('ana şube dışında', 'away from home')}</span>}
    </span>
  )
}
