import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { capacityCell } from '../../core/calc/availability'
import { addDaysYmd, dayOf, fmtDayShort, startOfDay } from '../../core/time'
import { L } from '../../i18n'
import { branchOptions, classOptions } from '../../ui/forms'
import { useBranchScope, useDb, useUrlState } from '../../ui/hooks'
import { Empty, FilterBar, FilterSelect, Link2, Notice, Page, Panel, Segmented } from '../../ui/kit'

// Capacity = branch × class × day. Confirmed class-only demand reduces availability without pointing at a vehicle;
// pending reservations hold nothing.

export function CapacityPage() {
  const d = useDb()
  const { active } = useBranchScope()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [branch, setBranch] = useUrlState('sube', 'all')
  const [cls, setCls] = useUrlState('sinif', 'all')
  const [span, setSpan] = useUrlState('aralik', '14')
  const [from, setFrom] = useUrlState('tarih', today)
  const days = Number(span)
  const branches = d.branches.filter((b) => active.includes(b.id) && (branch === 'all' || b.id === branch))
  const classes = d.classes.filter((c) => cls === 'all' || c.id === cls)
  const dayList = Array.from({ length: days }, (_, i) => addDaysYmd(from, i))
  const grid = useMemo(() => branches.flatMap((b) => classes.map((c) => ({ b, c, cells: dayList.map((day) => capacityCell(d, b, c.id, day)) }))).filter((r) => r.cells.some((x) => x.total > 0)), [d, branches.map((b) => b.id).join(), cls, from, days]) // eslint-disable-line react-hooks/exhaustive-deps
  const pending = d.reservations.filter((r) => r.status === 'pending' && active.includes(r.pickupBranchId))
  const tone = (n: number, total: number) => (n <= 0 ? 'bg-alert-soft text-alert' : n / Math.max(1, total) <= 0.25 ? 'bg-hold-soft text-hold' : 'bg-ok-soft text-ok')
  return (
    <Page
      title={L('Kapasite Planlama', 'Capacity Planning')}
      description={L('Şube × sınıf × gün müsait araç sayısı. Onaylı yalnız-sınıf rezervasyonlar belirli bir aracı tutmadan kapasiteyi azaltır; bekleyen (Pending) rezervasyonlar kapasite tutmaz.', 'Free vehicles per branch × class × day. Confirmed class-only reservations reduce capacity without pointing at a vehicle; pending reservations hold nothing.')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label={L('Aralık', 'Range')} value={span} onChange={setSpan} options={[{ id: '7', label: L('7 gün', '7 days') }, { id: '14', label: L('14 gün', '14 days') }, { id: '30', label: L('30 gün', '30 days') }]} />
        <div className="flex items-center gap-2">
          <button type="button" className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] hover:bg-line-soft" onClick={() => setFrom(addDaysYmd(from, -days))}>←</button>
          <span className="tnum text-[13.5px] font-medium">{from} → {addDaysYmd(from, days - 1)}</span>
          <button type="button" className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] hover:bg-line-soft" onClick={() => setFrom(addDaysYmd(from, days))}>→</button>
          <button type="button" className="h-9 rounded-md border border-line bg-surface px-3 text-[13px] hover:bg-line-soft" onClick={() => setFrom(today)}>{L('Bugün', 'Today')}</button>
        </div>
      </div>
      <FilterBar onReset={() => { setBranch('all'); setCls('all') }} active={branch !== 'all' || cls !== 'all'}>
        <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
        <FilterSelect label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={[{ id: 'all', label: L('Tüm sınıflar', 'All classes') }, ...classOptions(d)]} />
      </FilterBar>
      {grid.length === 0 ? <Empty title={L('Bu filtrede araç yok', 'No vehicles match this filter')} /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full border-collapse text-[12.5px]" style={{ minWidth: 220 + days * 44 }}>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-ink-2">{L('Şube · sınıf', 'Branch · class')}</th>
                {dayList.map((day) => <th key={day} scope="col" className={cn('tnum px-1 py-2 text-center font-medium', day === today ? 'text-blue' : 'text-ink-2')}>{fmtDayShort(Date.parse(startOfDay(day, tz)) + 3_600_000, tz)}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.map(({ b, c, cells }) => (
                <tr key={b.id + c.id} className="border-b border-line-soft">
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1.5 text-left font-medium"><span className="text-ink-2">{b.code}</span> · {c.name}</th>
                  {cells.map((x) => (
                    <td key={x.day} className="p-0.5">
                      <span title={`${x.day}: ${L('müsait', 'free')} ${x.available} / ${x.total} · ${L('tahsisli', 'allocated')} ${x.allocated} · ${L('yalnız sınıf', 'class-only')} ${x.classOnly} · ${L('bloklu', 'blocked')} ${x.blocked}`} className={cn('tnum flex h-8 items-center justify-center rounded font-medium', tone(x.available, x.total))}>{x.available}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-line bg-ok-soft" />{L('Yeterli', 'Enough')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-line bg-hold-soft" />{L('Dar (≤%25)', 'Tight (≤25%)')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-line bg-alert-soft" />{L('Dolu', 'Full')}</span>
        <span>{L('Hücre = müsait araç. Üzerine gelince ayrıntı görünür.', 'Cell = free vehicles. Hover for the breakdown.')}</span>
      </div>
      <Panel title={L('Bekleyen rezervasyonlar (kapasite tutmaz)', 'Pending reservations (hold no capacity)')} description={L('Onaylanırsa kapasiteyi azaltacak talepler. Onay sırasında kapasite yeniden kontrol edilir.', 'Requests that would reduce capacity if confirmed. Capacity is re-checked on confirmation.')} flush>
        {pending.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Bekleyen rezervasyon yok.', 'No pending reservations.')}</p> : (
          <ul className="divide-y divide-line-soft">{pending.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><Link2 type="reservation" id={r.id}>{r.no}</Link2><span className="text-ink-2">{d.classes.find((c) => c.id === r.classId)?.name} · {d.branches.find((b) => b.id === r.pickupBranchId)?.code} · {dayOf(r.pickupAt, tz)} → {dayOf(r.returnAt, tz)}</span></li>)}</ul>
        )}
      </Panel>
      <Notice tone="blue">{L('Kapasite yetmiyorsa Araç Tedarikçileri’nden harici araç istenebilir; harici araç yalnız teslim alındığında kapasiteye girer.', 'If capacity falls short you can request an external vehicle from Vehicle Suppliers; an external vehicle counts only once received.')} <Link to={'/arac-tedarikcileri?sekme=talep' as never} className="font-medium text-blue hover:underline">{L('Araç talebi', 'Sourcing request')}</Link></Notice>
    </Page>
  )
}
