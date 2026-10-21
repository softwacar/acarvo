import { vehicleCost } from '../../core/calc/cost'
import { useMemo } from 'react'
import { COUNTED_VEHICLE, rangeOfDays, utilisation, type Utilisation } from '../../core/metrics'
import { fmt, sumByCur } from '../../core/money'
import type { Vehicle } from '../../core/types'
import { L } from '../../i18n'
import { BarsH, ChartCard } from '../../ui/charts'
import { useBranchScope, useDb, useUrlState } from '../../ui/hooks'
import { btnSecondary, Empty, FilterBar, FilterSelect, Kpis, Page, Segmented } from '../../ui/kit'
import { VehicleCell } from '../../ui/domain'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { branchOptions, classOptions } from '../../ui/forms'
import { byCurText } from '../fleet/common'

interface Row {
  v: Vehicle
  u: Utilisation
  revenue: Record<string, number>
}

export function FleetAnalysisPage() {
  const d = useDb()
  const { active } = useBranchScope()
  const [days, setDays] = useUrlState('donem', '30')
  const [branch, setBranch] = useUrlState('sube', 'all')
  const [cls, setCls] = useUrlState('sinif', 'all')
  const range = rangeOfDays(d, Number(days))
  const rows: Row[] = useMemo(
    () =>
      d.vehicles
        .filter((v) => COUNTED_VEHICLE(d, v) && active.includes(v.homeBranchId) && (branch === 'all' || v.homeBranchId === branch) && (cls === 'all' || v.classId === cls))
        .map((v) => {
          const u = utilisation(d, v, range.from, range.to)
          const revenue = sumByCur(d.charges.filter((c) => c.status === 'posted' && c.kind === 'base' && d.rentals.find((r) => r.id === c.rentalId)?.vehicleId === v.id && (c.postedAt ?? '') >= range.from), (c) => ({ minor: c.amountMinor, cur: c.cur }))
          return { v, u, revenue }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, active.join(), days, branch, cls],
  )
  const avg = rows.length ? rows.reduce((a, r) => a + r.u.rate, 0) / rows.length : 0
  const byClass = d.classes.map((c) => { const rs = rows.filter((r) => r.v.classId === c.id); return { label: c.name, value: rs.length ? Math.round((rs.reduce((a, r) => a + r.u.rate, 0) / rs.length) * 100) : 0, sub: `${rs.length} ${L('araç', 'vehicles')}` } }).filter((x) => x.sub !== `0 ${L('araç', 'vehicles')}`)
  const cols: Col<Row>[] = [
    { id: 'veh', header: L('Araç', 'Vehicle'), cell: (r) => <VehicleCell v={r.v} />, sort: (r) => r.v.plate, csv: (r) => r.v.plate },
    { id: 'rate', header: L('Kiralanma %', 'Rented %'), align: 'right', cell: (r) => <span className="tnum">%{Math.round(r.u.rate * 100)}</span>, sort: (r) => r.u.rate, csv: (r) => Math.round(r.u.rate * 100) },
    { id: 'n', header: L('Kiralama', 'Rentals'), align: 'right', cell: (r) => r.u.rentals, sort: (r) => r.u.rentals, csv: (r) => r.u.rentals, hideBelow: 'md' },
    { id: 'km', header: L('Km', 'Km'), align: 'right', cell: (r) => <span className="tnum">{r.u.km.toLocaleString(L('tr-TR', 'en-GB'))}</span>, sort: (r) => r.u.km, csv: (r) => r.u.km, hideBelow: 'md' },
    { id: 'maint', header: L('Bakım saati', 'Maintenance h'), align: 'right', cell: (r) => <span className="tnum">{Math.round(r.u.maintenanceHours)}</span>, sort: (r) => r.u.maintenanceHours, csv: (r) => Math.round(r.u.maintenanceHours), hideBelow: 'lg' },
    { id: 'blk', header: L('Hasar bloğu saati', 'Damage block h'), align: 'right', cell: (r) => <span className="tnum">{Math.round(r.u.blockedHours)}</span>, sort: (r) => r.u.blockedHours, csv: (r) => Math.round(r.u.blockedHours), hideBelow: 'lg' },
    { id: 'idle', header: L('Boşta saat', 'Idle h'), align: 'right', cell: (r) => <span className="tnum">{Math.round(r.u.idleHours)}</span>, sort: (r) => r.u.idleHours, csv: (r) => Math.round(r.u.idleHours), hideBelow: 'lg' },
    { id: 'cost', header: L('Tanımlı maliyet', 'Defined cost'), align: 'right', cell: (r) => { const t = Object.entries(vehicleCost(d, r.v.id, range.from, range.to).byCur); return t.length ? <span className="tnum whitespace-nowrap">{t.map(([c, x]) => fmt(x.total, c)).join(' · ')}</span> : <span className="text-ink-3" title={L('Tanımlı maliyet verisi yok', 'No defined cost data')}>—</span> }, csv: (r) => Object.entries(vehicleCost(d, r.v.id, range.from, range.to).byCur).map(([c, x]) => fmt(x.total, c)).join(' · '), hideBelow: 'md' },
    { id: 'rev', header: L('Kiralama geliri', 'Rental revenue'), align: 'right', cell: (r) => <span className="tnum whitespace-nowrap">{byCurText(r.revenue, fmt).replace(/\n/g, ' · ')}</span>, hideBelow: 'md' },
  ]
  return (
    <Page
      title={L('Filo Analizi', 'Fleet Analysis')}
      description={L('Araç bazında kullanım: kiralanan, bakımda, hasar bloğunda ve boşta geçen süre — gerçek teslim–iade, bakım ve hasar kayıtlarından. Gelir yalnız kiralama bedeli kalemidir, para birimi başına.', 'Per-vehicle utilisation: time rented, in maintenance, damage-blocked and idle — from actual handover–return, maintenance and damage records. Revenue is the rental charge only, per currency.')}
      actions={<button type="button" className={btnSecondary} onClick={() => downloadCsv('filo-analizi', cols, rows)}>CSV</button>}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label={L('Dönem', 'Period')} value={days} onChange={setDays} options={[{ id: '7', label: L('7 gün', '7 days') }, { id: '30', label: L('30 gün', '30 days') }, { id: '90', label: L('90 gün', '90 days') }]} />
      </div>
      <FilterBar onReset={() => { setBranch('all'); setCls('all') }} active={branch !== 'all' || cls !== 'all'}>
        <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
        <FilterSelect label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={[{ id: 'all', label: L('Tüm sınıflar', 'All classes') }, ...classOptions(d)]} />
      </FilterBar>
      <Kpis items={[{ label: L('Ortalama kiralanma', 'Average rented share'), value: `%${Math.round(avg * 100)}` }, { label: L('Araç', 'Vehicles'), value: rows.length }, { label: L('Toplam km', 'Total km'), value: rows.reduce((a, r) => a + r.u.km, 0).toLocaleString(L('tr-TR', 'en-GB')) }, { label: L('Hiç kiralanmayan', 'Never rented'), value: rows.filter((r) => r.u.rentals === 0).length, tone: rows.some((r) => r.u.rentals === 0) ? 'hold' : undefined }]} />
      {rows.length === 0 ? <Empty title={L('Bu filtrede araç yok', 'No vehicles match this filter')} /> : (
        <>
          <ChartCard title={L('Sınıfa göre ortalama kiralanma (%)', 'Average rented share by class (%)')} source={L('Kaynak: kiralama, bakım ve hasar bloğu süreleri', 'Source: rental, maintenance and damage-block durations')} chart={<BarsH rows={byClass} format={(n) => `%${n}`} max={100} />} head={[L('Sınıf', 'Class'), '%']} rows={byClass.map((x) => [x.label, `%${x.value}`])} />
          <DataTable rows={rows} cols={cols} rowKey={(r) => r.v.id} label={L('Araç kullanım tablosu', 'Vehicle utilisation table')} urlKey="fa" defaultSort={{ id: 'rate', dir: 'desc' }} />
        </>
      )}
    </Page>
  )
}
