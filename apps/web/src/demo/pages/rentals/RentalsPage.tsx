import { Plus } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { rentalFinance } from '../../core/calc/finance'
import { fmt } from '../../core/money'
import type { Rental } from '../../core/types'
import { L } from '../../i18n'
import { branchOptions } from '../../ui/forms'
import { useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, Embedded, Empty, FilterBar, FilterSelect, Kpis, Page, SearchBox, Status, Tabs } from '../../ui/kit'
import { ContractsPage } from '../records/ContractsPage'
import { CustomerLink, VehicleCell } from '../../ui/domain'
import { STATUS } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'

type View = 'liste' | 'sozlesmeler'

/** Rentals with a second view: the contracts of those rentals (the old Contracts link, decision document I.2 row 30). */
export function RentalsPage() {
  const can = useCan()
  const [viewRaw, setView] = useUrlState('gorunum', 'liste')
  const view: View = viewRaw === 'sozlesmeler' && can('contracts:view') ? 'sozlesmeler' : 'liste'
  const tabs = (
    <Tabs<View>
      label={L('Kiralama görünümleri', 'Rental views')}
      value={view}
      onChange={setView}
      tabs={[
        { id: 'liste', label: L('Kiralamalar', 'Rentals') },
        { id: 'sozlesmeler', label: L('Sözleşmeler', 'Contracts'), hidden: !can('contracts:view') },
      ]}
    />
  )
  if (view === 'sozlesmeler')
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{L('Kiralamalar', 'Rentals')}</h1>
          <p className="mt-1 max-w-[860px] text-ink-2">{L('Sözleşme kiralamanın parçasıdır: üretilen metin dondurulur, imza yüz yüze alınır. Şablonlar Ayarlar → Sözleşme şablonları altındadır.', 'The contract is part of the rental: the issued text is frozen and the signature is taken in person. Templates are under Settings → Contract templates.')}</p>
        </header>
        {tabs}
        <Embedded>
          <ContractsPage />
        </Embedded>
      </div>
    )
  return <RentalList tabs={tabs} />
}

function RentalList({ tabs }: { tabs: React.ReactNode }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const navigate = useNavigate()
  const { active } = useBranchScope()
  const [q, setQ] = useUrlState('q')
  const [state, setState] = useUrlState('durum', 'all')
  const [fin, setFin] = useUrlState('finans', 'all')
  const [branch, setBranch] = useUrlState('sube', 'all')
  const [late, setLate] = useUrlState('gecikme', 'all')
  const now = Date.parse(d.clock.now)
  const isLate = (r: Rental) => r.status === 'delivered' && Date.parse(r.plannedReturnAt) < now

  const scoped = d.rentals.filter((r) => active.includes(r.pickupBranchId) || active.includes(r.returnBranchId))
  const rows = useMemo(
    () =>
      scoped
        .filter((r) => (state === 'all' ? true : r.status === state))
        .filter((r) => (fin === 'all' ? true : fin === 'open' ? r.financeStatus === 'open' && r.status !== 'cancelled' && r.status !== 'prepared' : r.financeStatus === 'closed'))
        .filter((r) => (branch === 'all' ? true : r.pickupBranchId === branch))
        .filter((r) => (late === 'all' ? true : isLate(r)))
        .filter((r) => {
          if (!q) return true
          const c = d.customers.find((x) => x.id === r.customerId)
          const v = d.vehicles.find((x) => x.id === r.vehicleId)
          return `${r.no} ${c?.name} ${v?.plate}`.toLowerCase().includes(q.toLowerCase())
        })
        .sort((a, b) => b.plannedPickupAt.localeCompare(a.plannedPickupAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d, active, state, fin, branch, late, q],
  )
  const count = (fn: (r: Rental) => boolean) => scoped.filter(fn).length
  const openFinance = count((r) => (r.status === 'closed' || r.status === 'exception_closed' || r.status === 'loss_closed') && r.financeStatus === 'open')

  const cols: Col<Rental>[] = [
    { id: 'no', header: L('Kiralama', 'Rental'), cell: (r) => <Link to={`/kiralamalar/${r.id}` as never} className="tnum font-medium text-blue hover:underline">{r.no}</Link>, sort: (r) => r.no, csv: (r) => r.no },
    { id: 'cust', header: L('Müşteri', 'Customer'), cell: (r) => <CustomerLink c={d.customers.find((c) => c.id === r.customerId)} />, sort: (r) => d.customers.find((c) => c.id === r.customerId)?.name, csv: (r) => d.customers.find((c) => c.id === r.customerId)?.name ?? '' },
    { id: 'veh', header: L('Araç', 'Vehicle'), cell: (r) => <VehicleCell v={d.vehicles.find((v) => v.id === r.vehicleId)!} sub={false} />, csv: (r) => d.vehicles.find((v) => v.id === r.vehicleId)?.plate ?? '' },
    { id: 'when', header: L('Plan', 'Plan'), cell: (r) => <span className="tnum text-[13px]">{f.dt(r.plannedPickupAt, r.pickupBranchId)} → {f.date(r.plannedReturnAt, r.returnBranchId)}</span>, sort: (r) => r.plannedPickupAt, hideBelow: 'md', csv: (r) => r.plannedPickupAt },
    {
      id: 'op',
      header: L('Operasyon', 'Operations'),
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Status kind="rental" value={r.status} />
          {isLate(r) && <span className="rounded border border-alert/40 bg-alert-soft px-1.5 py-0.5 text-[11.5px] font-medium text-alert">{L('Gecikmiş', 'Overdue')}</span>}
        </span>
      ),
      sort: (r) => r.status,
      csv: (r) => r.status,
    },
    { id: 'fin', header: L('Finans', 'Finance'), cell: (r) => (r.status === 'prepared' || r.status === 'cancelled' ? <span className="text-ink-3">—</span> : <Status kind="finance" value={r.financeStatus} />), hideBelow: 'lg', csv: (r) => r.financeStatus },
    {
      id: 'due',
      header: L('Kalan', 'Outstanding'),
      align: 'right',
      cell: (r) => {
        if (r.status === 'prepared' || r.status === 'cancelled') return <span className="text-ink-3">—</span>
        const x = rentalFinance(d, r.id)
        return <span className={x.outstandingMinor ? 'tnum font-medium' : 'tnum text-ink-3'}>{fmt(x.outstandingMinor, x.cur)}</span>
      },
      hideBelow: 'md',
      csv: (r) => rentalFinance(d, r.id).outstandingMinor,
    },
  ]
  const on = q !== '' || state !== 'all' || fin !== 'all' || branch !== 'all' || late !== 'all'

  return (
    <Page
      title={L('Kiralamalar', 'Rentals')}
      description={L('Operasyonel durum ve finansal durum ayrı kolonlardır: Operasyonel Kapandı, Finansal Kapandı demek değildir.', 'Operational and financial states are separate columns: Operationally Closed does not mean Financially Closed.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('kiralamalar', cols, rows)}>CSV</button>
          {can('rentals:manage') && (
            <Link to={'/kiralamalar/yeni' as never} className={btnPrimary}>
              <Plus size={16} /> {L('Yeni kiralama', 'New rental')}
            </Link>
          )}
        </>
      }
    >
      {tabs}
      <Kpis
        items={[
          { label: L('Teslime hazırlanan', 'Preparing'), value: count((r) => r.status === 'prepared'), to: '/kiralamalar?durum=prepared' },
          { label: L('Müşteride', 'With customer'), value: count((r) => r.status === 'delivered'), to: '/kiralamalar?durum=delivered' },
          { label: L('Geciken iade', 'Overdue returns'), value: count(isLate), tone: count(isLate) ? 'alert' : undefined, hint: L('Planlanan iade geçti', 'Planned return has passed'), to: '/kiralamalar?gecikme=1' },
          { label: L('İade alındı (kapanmadı)', 'Returned (not closed)'), value: count((r) => r.status === 'returned'), to: '/kiralamalar?durum=returned' },
          { label: L('Kapanmış, finans açık', 'Closed, finance open'), value: openFinance, tone: openFinance ? 'hold' : undefined, to: '/kiralamalar?finans=open' },
        ]}
      />
      <FilterBar onReset={() => { setQ(''); setState('all'); setFin('all'); setBranch('all'); setLate('all') }} active={on}>
        <SearchBox label={L('Kiralamalarda ara', 'Search rentals')} placeholder={L('No, müşteri, plaka…', 'No, customer, plate…')} value={q} onChange={setQ} />
        <FilterSelect label={L('Operasyon', 'Operations')} value={state} onChange={setState} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.keys(STATUS.rental!).map((k) => ({ id: k, label: STATUS.rental![k]!().label }))]} />
        <FilterSelect label={L('Finans', 'Finance')} value={fin} onChange={setFin} options={[{ id: 'all', label: L('Tümü', 'All') }, { id: 'open', label: L('Finans açık', 'Finance open') }, { id: 'closed', label: L('Finansal kapandı', 'Financially closed') }]} />
        <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
        <FilterSelect label={L('Gecikme', 'Overdue')} value={late} onChange={setLate} options={[{ id: 'all', label: L('Hepsi', 'All') }, { id: '1', label: L('Yalnız gecikenler', 'Overdue only') }]} />
      </FilterBar>
      <DataTable rows={rows} cols={cols} rowKey={(r) => r.id} label={L('Kiralama listesi', 'Rental list')} urlKey="kir" defaultSort={{ id: 'when', dir: 'desc' }} onRowClick={(r) => void navigate({ to: `/kiralamalar/${r.id}` as never })} empty={<Empty title={L('Bu filtrelerle kiralama yok', 'No rentals match')} />} />
    </Page>
  )
}
