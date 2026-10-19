import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { vehicleHolds } from '../../core/calc/availability'
import { addDaysYmd, dayOf, fmtDayShort, startOfDay } from '../../core/time'
import type { Db, Id, Iso, LinkType } from '../../core/types'
import { L, locale } from '../../i18n'
import { branchOptions, classOptions } from '../../ui/forms'
import { entityHref, useBranchScope, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnSecondary, Empty, FilterBar, FilterSelect, Page, Panel, Segmented } from '../../ui/kit'
import { DayAxis, HoldBars, TimelineLegend, VehicleCell } from '../../ui/domain'

// Calendar views are projections of the same records the lists use: pickups, returns, maintenance and transfers.

type Kind = 'pickup' | 'return' | 'maintenance' | 'transfer'
interface CalEvent {
  id: string
  at: Iso
  kind: Kind
  title: string
  sub: string
  link: { type: LinkType; id: Id }
  branchId: Id
}

const KIND_LABEL = (): Record<Kind, string> => ({ pickup: L('Teslim', 'Pickup'), return: L('İade', 'Return'), maintenance: L('Bakım', 'Maintenance'), transfer: L('Transfer', 'Transfer') })
const KIND_STYLE: Record<Kind, string> = { pickup: 'bg-blue-soft text-blue-ink border-blue/30', return: 'bg-line-soft text-ink border-line', maintenance: 'bg-hold-soft text-hold border-hold/30', transfer: 'bg-ground text-ink-2 border-line' }

function eventsOf(d: Db, branches: Id[], classId: string): CalEvent[] {
  const out: CalEvent[] = []
  const vehicle = (id?: Id) => d.vehicles.find((v) => v.id === id)
  const cust = (id: Id) => d.customers.find((c) => c.id === id)?.name ?? '—'
  const okClass = (vid?: Id, cid?: Id) => classId === 'all' || (vid ? vehicle(vid)?.classId === classId : cid === classId)
  for (const r of d.reservations) {
    if (r.status !== 'confirmed' || !branches.includes(r.pickupBranchId) || !okClass(r.vehicleId, r.classId)) continue
    out.push({ id: `rp-${r.id}`, at: r.pickupAt, kind: 'pickup', title: `${r.no} · ${cust(r.customerId)}`, sub: `${vehicle(r.vehicleId)?.plate ?? d.classes.find((c) => c.id === r.classId)?.name} · ${L('rezervasyon', 'reservation')}`, link: { type: 'reservation', id: r.id }, branchId: r.pickupBranchId })
  }
  for (const r of d.rentals) {
    if (r.status === 'prepared' && branches.includes(r.pickupBranchId) && okClass(r.vehicleId)) out.push({ id: `kp-${r.id}`, at: r.plannedPickupAt, kind: 'pickup', title: `${r.no} · ${cust(r.customerId)}`, sub: `${vehicle(r.vehicleId)?.plate} · ${L('kiralama', 'rental')}`, link: { type: 'rental', id: r.id }, branchId: r.pickupBranchId })
    if ((r.status === 'prepared' || r.status === 'delivered') && branches.includes(r.returnBranchId) && okClass(r.vehicleId)) out.push({ id: `kr-${r.id}`, at: r.plannedReturnAt, kind: 'return', title: `${r.no} · ${cust(r.customerId)}`, sub: `${vehicle(r.vehicleId)?.plate}`, link: { type: 'rental', id: r.id }, branchId: r.returnBranchId })
  }
  for (const m of d.maintenance) {
    const v = vehicle(m.vehicleId)
    if (!v || (m.status !== 'planned' && m.status !== 'in_progress') || !branches.includes(v.homeBranchId) || !okClass(v.id)) continue
    out.push({ id: `mn-${m.id}`, at: m.plannedStart, kind: 'maintenance', title: `${m.no} · ${v.plate}`, sub: m.reason, link: { type: 'maintenance', id: m.id }, branchId: v.homeBranchId })
  }
  for (const t of d.transfers) {
    const v = vehicle(t.vehicleId)
    if (!v || t.status === 'completed' || t.status === 'cancelled' || !okClass(v.id)) continue
    if (!branches.includes(t.fromBranchId) && !branches.includes(t.toBranchId)) continue
    out.push({ id: `tr-${t.id}`, at: t.plannedAt, kind: 'transfer', title: `${t.no} · ${v.plate}`, sub: `${d.branches.find((b) => b.id === t.fromBranchId)?.code} → ${d.branches.find((b) => b.id === t.toBranchId)?.code}`, link: { type: 'vehicle', id: v.id }, branchId: t.fromBranchId })
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

type View = 'hafta' | 'gun' | 'ay' | 'gundem'

export function CalendarPage() {
  const d = useDb()
  const f = useFmt()
  const { active } = useBranchScope()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [view, setView] = useUrlState('gorunum', 'hafta')
  const [date, setDate] = useUrlState('tarih', today)
  const [branch, setBranch] = useUrlState('sube', 'all')
  const [cls, setCls] = useUrlState('sinif', 'all')
  const v = (view as View) || 'hafta'
  const branches = branch === 'all' ? active : [branch]
  const events = useMemo(() => eventsOf(d, branches, cls), [d, branches.join(','), cls]) // eslint-disable-line react-hooks/exhaustive-deps
  const step = v === 'ay' ? 30 : v === 'gundem' ? 14 : v === 'gun' ? 1 : 7
  const shift = (dir: number) => {
    if (v === 'ay') {
      const [y, m] = date.split('-').map(Number) as [number, number]
      const nd = new Date(Date.UTC(y, m - 1 + dir, 1))
      setDate(nd.toISOString().slice(0, 10))
    } else setDate(addDaysYmd(date, dir * step))
  }
  const eventsOn = (ymd: string) => events.filter((e) => dayOf(e.at, f.zone(e.branchId)) === ymd)
  const title = v === 'ay' ? new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 7)}-01T00:00:00Z`)) : v === 'gun' ? new Intl.DateTimeFormat(locale(), { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : `${date} → ${addDaysYmd(date, v === 'hafta' ? 6 : 13)}`
  return (
    <Page
      title={L('Takvim', 'Calendar')}
      description={L('Teslim, iade, bakım ve transferler; kayıtların aynı verisinden çizilir. Çizelge araç müsaitliğini (Availability) gösterir, hazırlığı değil.', 'Pickups, returns, maintenance and transfers drawn from the same records. The timeline shows vehicle availability, not readiness.')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<View> label={L('Takvim görünümü', 'Calendar view')} value={v} onChange={setView} options={[{ id: 'gun', label: L('Gün', 'Day') }, { id: 'hafta', label: L('Hafta', 'Week') }, { id: 'ay', label: L('Ay', 'Month') }, { id: 'gundem', label: L('Gündem', 'Agenda') }]} />
        <div className="flex items-center gap-2">
          <button type="button" className={cn(btnSecondary, 'px-2.5')} aria-label={L('Önceki', 'Previous')} onClick={() => shift(-1)}><CaretLeft size={15} /></button>
          <span className="min-w-[150px] text-center text-[14px] font-medium capitalize">{title}</span>
          <button type="button" className={cn(btnSecondary, 'px-2.5')} aria-label={L('Sonraki', 'Next')} onClick={() => shift(1)}><CaretRight size={15} /></button>
          <button type="button" className={btnSecondary} onClick={() => setDate(today)}>{L('Bugün', 'Today')}</button>
        </div>
      </div>
      <FilterBar onReset={() => { setBranch('all'); setCls('all') }} active={branch !== 'all' || cls !== 'all'}>
        <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
        <FilterSelect label={L('Sınıf', 'Class')} value={cls} onChange={setCls} options={[{ id: 'all', label: L('Tüm sınıflar', 'All classes') }, ...classOptions(d)]} />
      </FilterBar>

      {v === 'hafta' && <WeekTimeline from={date} days={7} branches={branches} cls={cls} />}
      {v === 'gun' && <DayAgenda events={eventsOn(date)} />}
      {v === 'ay' && <MonthGrid date={date} today={today} eventsOn={eventsOn} onPick={(y) => { setDate(y); setView('gun') }} />}
      {v === 'gundem' && (
        <div className="space-y-4">
          {Array.from({ length: 14 }, (_, i) => addDaysYmd(date, i)).map((ymd) => {
            const ev = eventsOn(ymd)
            if (!ev.length) return null
            return (
              <Panel key={ymd} title={new Intl.DateTimeFormat(locale(), { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`))} flush>
                <EventList events={ev} />
              </Panel>
            )
          })}
          {Array.from({ length: 14 }, (_, i) => eventsOn(addDaysYmd(date, i)).length).every((n) => n === 0) && <Empty title={L('Bu aralıkta olay yok', 'No events in this range')} />}
        </div>
      )}
    </Page>
  )
}

function EventList({ events }: { events: CalEvent[] }) {
  const f = useFmt()
  const labels = KIND_LABEL()
  if (!events.length) return <p className="px-4 py-5 text-[13px] text-ink-2 sm:px-5">{L('Bu gün için kayıt yok.', 'Nothing scheduled for this day.')}</p>
  return (
    <ul className="divide-y divide-line-soft">
      {events.map((e) => (
        <li key={e.id}>
          <Link to={entityHref(e.link.type, e.link.id) as never} className="grid grid-cols-[52px_92px_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 text-[13.5px] hover:bg-ground/60 sm:px-5">
            <span className="tnum font-medium">{f.time(e.at, e.branchId)}</span>
            <span className={cn('inline-flex h-6 w-fit items-center rounded border px-2 text-[12px] font-medium', KIND_STYLE[e.kind])}>{labels[e.kind]}</span>
            <span className="min-w-0"><span className="block truncate font-medium">{e.title}</span><span className="block truncate text-[12.5px] text-ink-2">{e.sub}</span></span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function DayAgenda({ events }: { events: CalEvent[] }) {
  return (
    <Panel title={L('Günün planı', "Day's plan")} description={`${events.length} ${L('kayıt', 'item(s)')}`} flush>
      <EventList events={events} />
    </Panel>
  )
}

function MonthGrid({ date, today, eventsOn, onPick }: { date: string; today: string; eventsOn: (ymd: string) => CalEvent[]; onPick: (ymd: string) => void }) {
  const d = useDb()
  const first = `${date.slice(0, 7)}-01`
  const dow = new Date(`${first}T00:00:00Z`).getUTCDay()
  const startDow = d.settings.locale.firstDay
  const lead = (dow - startDow + 7) % 7
  const gridStart = addDaysYmd(first, -lead)
  const daysInMonth = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate()
  const weeks = Math.ceil((lead + daysInMonth) / 7)
  const names = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + ((startDow + i) % 7)))))
  const labels = KIND_LABEL()
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <div className="grid min-w-[640px] grid-cols-7 border-b border-line text-[12px] font-medium text-ink-2">
        {names.map((n) => <div key={n} className="px-2 py-2">{n}</div>)}
      </div>
      <div className="grid min-w-[640px] grid-cols-7">
        {Array.from({ length: weeks * 7 }, (_, i) => addDaysYmd(gridStart, i)).map((ymd) => {
          const ev = eventsOn(ymd)
          const inMonth = ymd.slice(0, 7) === date.slice(0, 7)
          const counts = (['pickup', 'return', 'maintenance', 'transfer'] as Kind[]).map((k) => [k, ev.filter((e) => e.kind === k).length] as const).filter(([, n]) => n)
          return (
            <button key={ymd} type="button" onClick={() => onPick(ymd)} aria-label={`${ymd}: ${ev.length} ${L('kayıt', 'item(s)')}`} className={cn('min-h-[92px] border-b border-r border-line-soft p-2 text-left hover:bg-ground/60', !inMonth && 'bg-ground/40 text-ink-3')}>
              <span className={cn('tnum inline-flex size-6 items-center justify-center rounded-full text-[12.5px]', ymd === today && 'bg-blue font-semibold text-white')}>{Number(ymd.slice(8))}</span>
              <span className="mt-1 flex flex-col gap-0.5">
                {counts.map(([k, n]) => <span key={k} className={cn('truncate rounded border px-1.5 py-px text-[11px] font-medium', KIND_STYLE[k])}>{n} {labels[k]}</span>)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekTimeline({ from, days, branches, cls }: { from: string; days: number; branches: Id[]; cls: string }) {
  const d = useDb()
  const tz = d.settings.company.tz
  const start = startOfDay(from, tz)
  const end = startOfDay(addDaysYmd(from, days), tz)
  const vehicles = d.vehicles.filter((v) => v.status !== 'sold' && branches.includes(v.homeBranchId) && (cls === 'all' || v.classId === cls)).sort((a, b) => a.classId.localeCompare(b.classId) || a.plate.localeCompare(b.plate))
  const rows = useMemo(() => vehicles.map((v) => ({ v, holds: vehicleHolds(d, { ...v, source: 'internal' }, start, end, d.clock.now) })), [d, start, end, vehicles.length, cls, branches.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const nowPct = ((Date.parse(d.clock.now) - Date.parse(start)) / (Date.parse(end) - Date.parse(start))) * 100
  if (!vehicles.length) return <Empty title={L('Bu filtrede araç yok', 'No vehicles match this filter')} />
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[170px_minmax(0,1fr)] items-end border-b border-line px-3 pt-2">
            <span className="pb-1 text-[12px] font-medium text-ink-2">{L('Araç', 'Vehicle')}</span>
            <DayAxis from={start} days={days} tz={tz} />
          </div>
          <ul className="divide-y divide-line-soft">
            {rows.map(({ v, holds }) => (
              <li key={v.id} className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
                <VehicleCell v={v} sub={false} />
                <div className="relative"><HoldBars holds={holds} from={Date.parse(start)} to={Date.parse(end)} height={holds.length > 1 ? 34 : 24} />
                  {nowPct > 0 && nowPct < 100 && <span className="pointer-events-none absolute inset-y-0 w-px bg-alert" style={{ left: `${nowPct}%` }} aria-hidden />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <TimelineLegend />
      <p className="text-[12px] text-ink-3">{fmtDayShort(Date.parse(start), tz)} – {fmtDayShort(Date.parse(end) - 1, tz)} · {L('kırmızı çizgi demo zamanı', 'red line is the demo time')}</p>
    </div>
  )
}
