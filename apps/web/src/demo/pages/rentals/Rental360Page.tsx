import { LinkedTasks, useLinkedTasks } from '../../ui/linkedTasks'
import { isOpenTask } from '../../core/ops/tasks'
import { CaretDown } from '@phosphor-icons/react'
import { Link, useParams } from '@tanstack/react-router'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { checkVehicleAvailable, readinessOf } from '../../core/calc/availability'
import { rentalFinance } from '../../core/calc/finance'
import { fmt } from '../../core/money'
import { releaseDeposit } from '../../core/ops/finance'
import { AuditButton, StageBadge, VerifyButton } from '../shared/FinanceBits'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { cancelRental, closeFinancial, exceptionClose, extendRental, financialCloseChecks, reopenFinancial, swapVehicle } from '../../core/ops/rentals'
import type { Rental } from '../../core/types'
import { L } from '../../i18n'
import { AreaF, DateTimeF, SelectF } from '../../ui/forms'
import { METHOD_LABEL } from '../../ui/status'
import { CustomerLink, PriceBreakdown, ReadinessList, VehicleCell } from '../../ui/domain'
import { runAction, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { AdvanceStatus, BackLink, btnPrimary, btnSecondary, btnSmall, Empty, Facts, FinanceDialog, Kpis, Link2, Notice, Page, Panel, Status, Tabs, Timeline } from '../../ui/kit'
import { DamageDialog, IncidentDialog } from '../shared/FleetDialogs'
import { PaymentDialog } from '../shared/PaymentDialog'
import { ContractTab, DeskTab, ReturnTab } from './RentalDesk'

const menuItem = 'flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-[13.5px] text-ink-2 outline-none data-[highlighted]:bg-ground data-[highlighted]:text-ink'

export function Rental360Page() {
  const { id } = useParams({ strict: false }) as { id: string }
  const d = useDb()
  const r = d.rentals.find((x) => x.id === id)
  if (!r)
    return (
      <div className="space-y-4">
        <BackLink to="/kiralamalar" label={L('Kiralamalar', 'Rentals')} />
        <Empty title={L('Kiralama bulunamadı', 'Rental not found')} action={<Link to={'/kiralamalar' as never} className={btnSecondary}>{L('Listeye dön', 'Back to list')}</Link>} />
      </div>
    )
  return <Detail r={r} />
}

type Dlg = null | 'extend' | 'swap' | 'cancel' | 'exception' | 'loss' | 'pay' | 'damage' | 'incident' | 'reopen'
type TabId = 'ozet' | 'teslim' | 'iade' | 'sozlesme' | 'sigorta' | 'finans' | 'gorevler' | 'gecmis'

function Detail({ r }: { r: Rental }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const defTab: TabId = r.status === 'prepared' ? 'teslim' : r.status === 'delivered' ? 'iade' : 'ozet'
  const [tab, setTab] = useUrlState('sekme', defTab)
  const openTasks = useLinkedTasks('rental', r.id).filter(isOpenTask).length
  const [dlg, setDlg] = useState<Dlg>(null)
  const [error, setError] = useState<string | null>(null)
  const customer = d.customers.find((c) => c.id === r.customerId)
  const vehicle = d.vehicles.find((v) => v.id === r.vehicleId)!
  const fin = rentalFinance(d, r.id)
  const overdue = r.status === 'delivered' && Date.parse(r.plannedReturnAt) < Date.parse(d.clock.now)
  const opDone = r.status === 'closed' || r.status === 'exception_closed' || r.status === 'loss_closed'
  const live = r.status === 'prepared' || r.status === 'delivered'
  const go = (t: string) => setTab(t)
  const act = (fn: Parameters<typeof runAction<unknown>>[0], msg: string) => {
    const x = runAction(fn, msg)
    setError(x.ok ? null : x.error)
    return x
  }

  return (
    <div className="space-y-4">
      <BackLink to="/kiralamalar" label={L('Kiralamalar', 'Rentals')} />
      <Page
        title={r.no}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Status kind="rental" value={r.status} />
            {r.status !== 'prepared' && r.status !== 'cancelled' && <Status kind="finance" value={r.financeStatus} />}
            {overdue && <span className="rounded border border-alert/40 bg-alert-soft px-2 py-0.5 text-[12px] font-medium text-alert">{L('İade gecikti', 'Return overdue')}</span>}
            <span>{`${customer?.name} · ${vehicle.plate} · ${f.dt(r.plannedPickupAt, r.pickupBranchId)} → ${f.dt(r.plannedReturnAt, r.returnBranchId)}`}</span>
          </span>
        }
        actions={
          <>
            {r.status === 'prepared' && <button type="button" className={btnPrimary} disabled={tab === 'teslim'} title={tab === 'teslim' ? L('Zaten Teslim Masası ekranındasınız', 'You are already at the Delivery Desk') : undefined} onClick={() => go('teslim')}>{L('Teslim Masası', 'Delivery Desk')}</button>}
            {r.status === 'delivered' && can('rentals:handover') && <button type="button" className={btnPrimary} disabled={tab === 'iade'} title={tab === 'iade' ? L('Zaten iade ekranındasınız', 'You are already on the return screen') : undefined} onClick={() => go('iade')}>{L('İade al', 'Receive return')}</button>}
            {r.status === 'returned' && can('rentals:handover') && <button type="button" className={btnPrimary} onClick={() => go('iade')}>{L('Operasyonel kapat', 'Close operationally')}</button>}
            {opDone && r.financeStatus === 'open' && can('finance:apply') && <button type="button" className={btnPrimary} onClick={() => go('finans')}>{L('Finansal kapanış', 'Financial closure')}</button>}
            {(r.status === 'delivered' || r.status === 'returned' || opDone) && can('finance:record') && <button type="button" className={btnSecondary} onClick={() => setDlg('pay')}>{L('Ödeme al', 'Take payment')}</button>}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className={cn(btnSecondary, 'gap-1.5')}>
                {L('Diğer işlemler', 'More actions')} <CaretDown size={12} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[230px] rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(16_24_40/0.18)]">
                  {live && can('rentals:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('extend')}>{L('Süreyi uzat', 'Extend')}</DropdownMenu.Item>}
                  {live && can('rentals:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('swap')}>{L('Araç değiştir', 'Swap vehicle')}</DropdownMenu.Item>}
                  {r.status === 'prepared' && can('rentals:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('cancel')}>{L('Kiralamayı iptal et', 'Cancel rental')}</DropdownMenu.Item>}
                  {r.status === 'delivered' && can('rentals:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('exception')}>{L('İstisnai kapanış', 'Exception closure')}</DropdownMenu.Item>}
                  {r.status === 'delivered' && can('rentals:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('loss')}>{L('Kayıp / çalıntı kapanışı', 'Loss / theft closure')}</DropdownMenu.Item>}
                  {can('damages:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('damage')}>{L('Hasar kaydı aç', 'Open damage')}</DropdownMenu.Item>}
                  {can('incidents:manage') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('incident')}>{L('Olay kaydı aç', 'Open incident')}</DropdownMenu.Item>}
                  {opDone && r.financeStatus === 'closed' && can('finance:apply') && <DropdownMenu.Item className={menuItem} onSelect={() => setDlg('reopen')}>{L('Finansı yeniden aç', 'Reopen finance')}</DropdownMenu.Item>}
                  <DropdownMenu.Item className={menuItem} asChild><Link to={`/araclar/${vehicle.id}` as never}>{L('Aracı aç', 'Open vehicle')}</Link></DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </>
        }
      >
        {error && <Notice tone="alert">{error}</Notice>}
        {r.status === 'prepared' && <Notice tone="blue">{L('Hazırlanan kiralama: araç henüz müşteride değil. Teslim, Teslim Masası kontrolleri geçilince tek adımda yapılır.', 'Prepared rental: the vehicle is not with the customer yet. Handover happens in one step once the Delivery Desk checks pass.')}</Notice>}
        {overdue && <Notice tone="alert">{L('Planlanan iade zamanı geçti; araç hâlâ müşteride. İade alın, uzatın veya istisnai kapanış yapın.', 'The planned return time has passed and the vehicle is still with the customer. Receive the return, extend, or close as an exception.')}</Notice>}
        {r.status === 'returned' && <Notice tone="hold">{L('İade alındı, kiralama operasyonel olarak kapanmadı.', 'Returned but not yet operationally closed.')}</Notice>}
        {opDone && r.financeStatus === 'open' && <Notice tone="hold">{L('Operasyonel olarak kapandı ama finans açık: bakiye, depozito ve bekleyen onaylar çözülmeli. Operasyonel kapanış finansal kapanış değildir.', 'Operationally closed but finance is open: balance, deposit and pending approvals must be resolved. Operational closure is not financial closure.')}</Notice>}

        <Tabs<TabId>
          label={L('Kiralama bölümleri', 'Rental sections')}
          value={tab as TabId}
          onChange={setTab}
          tabs={[
            { id: 'ozet', label: L('Özet', 'Overview') },
            { id: 'teslim', label: L('Teslim Masası', 'Delivery Desk') },
            { id: 'iade', label: L('İade', 'Return') },
            { id: 'sozlesme', label: L('Sözleşme', 'Contract') },
            { id: 'sigorta', label: L('Sigorta ve Hasar', 'Cover and Damage') },
            { id: 'finans', label: L('Finans', 'Finance'), count: fin.outstandingMinor > 0 ? 1 : undefined },
            { id: 'gorevler', label: L('Görevler', 'Tasks'), count: openTasks || undefined },
            { id: 'gecmis', label: L('Geçmiş', 'History'), count: r.history.length },
          ]}
        />

        {tab === 'ozet' && <OverviewTab r={r} go={go} />}
        {tab === 'gorevler' && <LinkedTasks type="rental" id={r.id} defaultTitle={`${r.no}: `} />}
        {tab === 'teslim' && <DeskTab r={r} go={go} />}
        {tab === 'iade' && <ReturnTab r={r} go={go} />}
        {tab === 'sozlesme' && <ContractTab r={r} />}
        {tab === 'sigorta' && <CoverTab r={r} onDamage={() => setDlg('damage')} onIncident={() => setDlg('incident')} />}
        {tab === 'finans' && <FinanceTab r={r} onPay={() => setDlg('pay')} onReopen={() => setDlg('reopen')} act={act} />}
        {tab === 'gecmis' && (
          <Panel title={L('Geçmiş', 'History')}>
            <Timeline entries={r.history} />
          </Panel>
        )}
      </Page>

      {dlg === 'pay' && <PaymentDialog rentalId={r.id} onClose={() => setDlg(null)} />}
      {dlg === 'damage' && <DamageDialog rentalId={r.id} vehicleId={r.vehicleId} onClose={() => setDlg(null)} />}
      {dlg === 'incident' && <IncidentDialog rentalId={r.id} vehicleId={r.vehicleId} onClose={() => setDlg(null)} />}
      {dlg === 'extend' && <ExtendDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'swap' && <SwapDialog r={r} onClose={() => setDlg(null)} />}
      {dlg === 'cancel' && <ReasonDialog title={L('Kiralamayı iptal et', 'Cancel rental')} desc={L('Yalnız teslim öncesi kiralama iptal edilir. Teslim edilmiş kiralama iade veya istisnai kapanışla biter.', 'Only a rental before delivery can be cancelled. A delivered rental ends by return or exception closure.')} confirm={L('İptal et', 'Cancel rental')} danger min={3} onClose={() => setDlg(null)} run={(reason) => runAction((s) => cancelRental(s, r.id, reason), L('Kiralama iptal edildi.', 'Rental cancelled.'))} />}
      {dlg === 'exception' && <ReasonDialog title={L('İstisnai kapanış', 'Exception closure')} desc={L('Normal iade kanıtı zorlanmaz; borç ve depozito ayrıca çözülür. Kayıt Riskler ve İstisnalar’a düşer.', 'Normal return evidence is not forced; debt and deposit are resolved separately. It appears in Risks and Exceptions.')} confirm={L('İstisnai kapat', 'Close as exception')} danger min={10} onClose={() => setDlg(null)} run={(reason) => runAction((s) => exceptionClose(s, r.id, 'exception', reason), L('İstisnai kapandı; finans ve depozito çözümü bekliyor.', 'Closed as exception; finance and deposit resolution pending.'))} />}
      {dlg === 'loss' && <ReasonDialog title={L('Kayıp / çalıntı kapanışı', 'Loss / theft closure')} desc={L('Araç servis dışı olur ve konumu bilinmiyor sayılır. Sigorta ve finans süreçleri ayrıca yürür.', 'The vehicle goes out of service with an unknown location. Insurance and finance run separately.')} confirm={L('Kayıp olarak kapat', 'Close as loss')} danger min={10} onClose={() => setDlg(null)} run={(reason) => runAction((s) => exceptionClose(s, r.id, 'loss', reason), L('Kayıp olarak kapandı.', 'Closed as loss.'))} />}
      {dlg === 'reopen' && <ReasonDialog title={L('Finansı yeniden aç', 'Reopen finance')} desc={L('Gerekçe kayda geçer; kapalı dosya yeniden düzeltmeye açılır.', 'The reason is recorded; the closed file is reopened for correction.')} confirm={L('Yeniden aç', 'Reopen')} min={5} onClose={() => setDlg(null)} run={(reason) => runAction((s) => reopenFinancial(s, r.id, reason), L('Finans dosyası yeniden açıldı.', 'Finance file reopened.'))} />}
    </div>
  )
}

function OverviewTab({ r, go }: { r: Rental; go: (t: string) => void }) {
  const d = useDb()
  const f = useFmt()
  const vehicle = d.vehicles.find((v) => v.id === r.vehicleId)!
  const corp = d.corporates.find((c) => c.id === r.corporateId)
  const res = d.reservations.find((x) => x.id === r.reservationId)
  const fin = rentalFinance(d, r.id)
  const ready = readinessOf(d, vehicle, d.clock.now)
  const avail = checkVehicleAvailable(d, vehicle, r.plannedPickupAt, r.plannedReturnAt, d.clock.now, { rentalId: r.id, reservationId: r.reservationId })
  const customer = d.customers.find((c) => c.id === r.customerId)
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={L('Evrak ve sürücüler', 'Documents and drivers')}>
          <ul className="space-y-1.5 text-[13.5px]">
            {r.drivers.map((x) => {
              const c = d.customers.find((y) => y.id === x.customerId)
              return <li key={x.customerId}><CustomerLink c={c} /> {x.primary && <span className="text-[12px] text-ink-2">({L('asıl', 'primary')})</span>}</li>
            })}
          </ul>
          <p className="mt-2 text-[12.5px] text-ink-2">{r.gate.docsChecked ? L('Belgeler kontrol edildi.', 'Documents checked.') : L('Belge kontrolü Teslim Masası’nda yapılır.', 'The document check is done at the Delivery Desk.')}</p>
        </Panel>
        <Panel title={L('Araç ve hazırlık', 'Vehicle and readiness')}>
          <VehicleCell v={vehicle} />
          <p className={`mt-2 text-[13px] ${ready.ready ? 'text-ok' : 'text-hold'}`}>{ready.ready ? L('Hazır', 'Ready') : L(`${ready.blockers} hazırlık engeli`, `${ready.blockers} readiness blocker(s)`)}</p>
          <p className={`text-[13px] ${avail.ok ? 'text-ink-2' : 'text-alert'}`}>{avail.ok ? L('Müsaitlik: çakışma yok', 'Availability: no conflict') : `${L('Müsaitlik', 'Availability')}: ${avail.conflicts.map((c) => c.label).join(', ')}`}</p>
        </Panel>
        <Panel title={L('Fiyat, sigorta ve depozito', 'Price, cover and deposit')}>
          <p className="tnum text-[18px] font-semibold">{r.price ? fmt(r.price.grossMinor, r.price.cur) : '—'}</p>
          <p className="text-[13px] text-ink-2">{r.coverageSnapshot ? `${r.coverageSnapshot.name} · ${L('muafiyet', 'deductible')} ${fmt(r.coverageSnapshot.deductible.minor, r.coverageSnapshot.deductible.cur)}` : L('Sigorta paketi yok', 'No cover package')}</p>
          <p className="text-[13px] text-ink-2">{L('Depozito', 'Deposit')}: {r.deposit.required.minor > 0 ? `${fmt(r.deposit.required.minor, r.deposit.required.cur)} · ${r.deposit.state}` : L('gerekmiyor', 'none')}</p>
        </Panel>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-5">
          <Panel title={L('Kiralama', 'Rental')}>
            <Facts
              rows={[
                [L('Müşteri', 'Customer'), <CustomerLink key="c" c={customer} />],
                [L('Kurumsal hesap', 'Corporate'), corp ? <Link2 key="k" type="corporate" id={corp.id}>{corp.name}</Link2> : L('Bireysel', 'Individual')],
                [L('Rezervasyon', 'Reservation'), res ? <Link2 key="r" type="reservation" id={res.id}>{res.no}</Link2> : L('Doğrudan kiralama', 'Direct rental')],
                [L('Teslim', 'Pickup'), `${f.dt(r.actualPickupAt ?? r.plannedPickupAt, r.pickupBranchId)}${r.actualPickupAt ? '' : ` (${L('plan', 'planned')})`} · ${d.branches.find((b) => b.id === r.pickupBranchId)?.name}`],
                [L('İade', 'Return'), `${f.dt(r.actualReturnAt ?? r.plannedReturnAt, r.returnBranchId)}${r.actualReturnAt ? '' : ` (${L('plan', 'planned')})`} · ${d.branches.find((b) => b.id === r.returnBranchId)?.name}`],
                [L('Uzatmalar', 'Extensions'), r.extensions.length ? r.extensions.map((e) => `${f.date(e.toReturn, r.returnBranchId)} (${fmt(e.deltaMinor, r.currency)})`).join(', ') : '—'],
                [L('Araç değişimi', 'Vehicle swaps'), r.swaps.length ? r.swaps.map((s) => `${d.vehicles.find((v) => v.id === s.fromVehicleId)?.plate} → ${d.vehicles.find((v) => v.id === s.toVehicleId)?.plate}`).join(', ') : '—'],
                [L('Bakiye', 'Balance'), r.status === 'prepared' ? L('Teslimde doğar', 'Arises at handover') : fin.outstandingMinor ? <button key="b" type="button" className="font-medium text-blue hover:underline" onClick={() => go('finans')}>{fmt(fin.outstandingMinor, fin.cur)}</button> : fmt(0, fin.cur)],
              ]}
            />
          </Panel>
        </div>
        <Panel title={L('Fiyat', 'Price')} description={L('Fiyat sürümü rezervasyon/hazırlık anında dondurulur.', 'The price version is frozen when the reservation/rental is prepared.')}>
          <PriceBreakdown price={r.price} />
        </Panel>
      </div>
    </div>
  )
}

function CoverTab({ r, onDamage, onIncident }: { r: Rental; onDamage: () => void; onIncident: () => void }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const dmg = d.damages.filter((x) => x.rentalId === r.id)
  const inc = d.incidents.filter((x) => x.rentalId === r.id)
  const fines = d.fines.filter((x) => x.rentalId === r.id)
  return (
    <div className="space-y-5">
      <Panel title={L('Sigorta paketi', 'Cover package')} description={L('Kiralamada dondurulan koşullar; sonradan paket değişse de bu kayıt değişmez.', 'Terms frozen with the rental; later package edits do not change this record.')}>
        {r.coverageSnapshot ? (
          <Facts rows={[[L('Paket', 'Package'), `${r.coverageSnapshot.name} (${r.coverageSnapshot.code})`], [L('Günlük bedel', 'Daily price'), fmt(r.coverageSnapshot.dailyPrice.minor, r.coverageSnapshot.dailyPrice.cur)], [L('Muafiyet', 'Deductible'), fmt(r.coverageSnapshot.deductible.minor, r.coverageSnapshot.deductible.cur)]]} />
        ) : (
          <p className="text-[13.5px] text-ink-2">{L('Bu kiralamada sigorta paketi seçilmedi.', 'No cover package was chosen for this rental.')}</p>
        )}
      </Panel>
      <Panel title={L('Hasar kayıtları', 'Damage records')} action={can('damages:manage') ? <button type="button" className={btnSmall} onClick={onDamage}>{L('Hasar kaydı aç', 'Open damage')}</button> : undefined}>
        {dmg.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Bu kiralamaya bağlı hasar yok.', 'No damage linked to this rental.')}</p> : (
          <ul className="divide-y divide-line-soft">
            {dmg.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]"><Link2 type="damage" id={x.id}>{x.no}</Link2><span className="text-ink-2">{x.area} · {x.description}</span><Status kind="damage" value={x.status} /></li>)}
          </ul>
        )}
      </Panel>
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={L('Olaylar', 'Incidents')} action={can('incidents:manage') ? <button type="button" className={btnSmall} onClick={onIncident}>{L('Olay aç', 'Open incident')}</button> : undefined}>
          {inc.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Olay yok.', 'No incidents.')}</p> : <ul className="divide-y divide-line-soft">{inc.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 py-2 text-[13.5px]"><Link2 type="incident" id={x.id}>{x.no} · {x.title}</Link2><Status kind="incident" value={x.status} /></li>)}</ul>}
        </Panel>
        <Panel title={L('Cezalar', 'Fines')}>
          {fines.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Bu kiralamaya atanmış ceza yok.', 'No fine assigned to this rental.')}</p> : <ul className="divide-y divide-line-soft">{fines.map((x) => <li key={x.id} className="flex items-center justify-between gap-2 py-2 text-[13.5px]"><Link2 type="fine" id={x.id}>{x.no}</Link2><span className="tnum text-ink-2">{f.date(x.occurredAt)}</span><Status kind="fine" value={x.status} /></li>)}</ul>}
        </Panel>
      </div>
    </div>
  )
}

function FinanceTab({ r, onPay, onReopen, act }: { r: Rental; onPay: () => void; onReopen: () => void; act: (fn: Parameters<typeof runAction<unknown>>[0], msg: string) => unknown }) {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const fin = rentalFinance(d, r.id)
  const checks = financialCloseChecks(d, r.id)
  const deposits = d.deposits.filter((x) => x.rentalId === r.id)
  const refunds = d.refunds.filter((x) => x.rentalId === r.id)
  const opDone = r.status === 'closed' || r.status === 'exception_closed' || r.status === 'loss_closed'
  const [voiding, setVoiding] = useState<string | null>(null)
  return (
    <div className="space-y-5">
      <Kpis
        items={[
          { label: L('Hesap kalemleri', 'Charges'), value: fmt(fin.chargesMinor, fin.cur), hint: L('Hesaplanan borç', 'Amount owed') },
          { label: L('Uygulanan', 'Applied'), value: fmt(fin.appliedMinor, fin.cur), hint: L('Kalemlere işlenen ödeme', 'Payments allocated to charges') },
          { label: L('Kalan', 'Outstanding'), value: fmt(fin.outstandingMinor, fin.cur), tone: fin.outstandingMinor ? 'hold' : undefined },
          { label: L('Uygulanmamış', 'Unapplied'), value: fmt(fin.unappliedMinor, fin.cur), hint: fin.unverifiedMinor ? L(`${fmt(fin.unverifiedMinor, fin.cur)} doğrulama bekliyor`, `${fmt(fin.unverifiedMinor, fin.cur)} awaiting verification`) : L('Kaydedildi ama uygulanmadı', 'Recorded but not applied'), tone: fin.unappliedMinor ? 'hold' : undefined },
        ]}
      />
      <Panel title={L('Hesap kalemleri', 'Charges')} description={L('Hesap kalemi ödeme değildir; ödeme kaydedilince de başka bir yetkili doğrulayıp kaleme uygulanana kadar borç düşmez. Kalem iptali yüksek riskli bir Finansal Düzeltmedir.', 'A charge is not a payment; recording a payment does not reduce the balance until somebody else verifies it and it is applied. Voiding a charge is a high-risk Financial Correction.')} action={r.status !== 'prepared' && r.status !== 'cancelled' && can('finance:record') ? <button type="button" className={btnPrimary} onClick={onPay}>{L('Ödeme al', 'Take payment')}</button> : undefined}>
        {fin.charges.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Teslimle birlikte kiralama bedeli hesap kalemi doğar.', 'The rental charge arises at handover.')}</p> : (
          <ul className="divide-y divide-line-soft">
            {fin.charges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                <span><span className="tnum font-medium">{c.no}</span> · {c.label}</span>
                <span className="flex items-center gap-3"><span className={cn('tnum', c.status === 'voided' && 'text-ink-3 line-through')}>{fmt(c.amountMinor, c.cur)}</span>
                  <Status kind="charge" value={c.status} />
                  {c.status === 'posted' && can('approvals:request') && <button type="button" className={btnSmall} onClick={() => setVoiding(c.id)}>{L('Düzeltme talep et', 'Request correction')}</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={L('Ödemeler', 'Payments')}>
        {fin.payments.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Ödeme kaydı yok.', 'No payments recorded.')}</p> : (
          <ul className="divide-y divide-line-soft">
            {fin.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13.5px]">
                <span><span className="tnum font-medium">{p.no}</span> · {fmt(p.tender.minor, p.tender.cur)} · {METHOD_LABEL()[p.method]}{p.tender.cur !== p.obligationCur ? ` · ${L('eşdeğer', 'equiv.')} ${fmt(p.appliedMinor, p.obligationCur)}` : ''}<span className="block text-[12.5px] text-ink-2">{f.dt(p.recordedAt, p.branchId)}{p.rate ? ` · ${L('kur', 'rate')} 1 ${p.rate.base} = ${p.rate.rate} ${p.rate.quote}` : ''}</span></span>
                <span className="flex flex-wrap items-center gap-2">{p.kind === 'advance' && <AdvanceStatus p={p} />}<StageBadge p={p} /><VerifyButton p={p} /><AuditButton needles={[p.no, p.id]} title={`${L('Ödeme', 'Payment')} ${p.no}`} /></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={L('Depozito', 'Deposit')} description={L('Depozito gelir değildir.', 'A deposit is not revenue.')}>
          {deposits.length === 0 ? <p className="text-[13.5px] text-ink-2">{r.deposit.required.minor > 0 ? `${L('Gerekli', 'Required')}: ${fmt(r.deposit.required.minor, r.deposit.required.cur)} · ${r.deposit.state}` : L('Depozito yok.', 'No deposit.')}</p> : (
            <ul className="divide-y divide-line-soft">
              {deposits.map((x) => (
                <li key={x.id} className="space-y-2 py-2.5 text-[13.5px]">
                  <div className="flex items-center justify-between gap-2"><span className="tnum font-medium">{fmt(x.amount.minor, x.amount.cur)} · {METHOD_LABEL()[x.method]}</span><span className="flex items-center gap-2"><Status kind="deposit" value={x.state} /><span className="text-[12px] text-ink-2">{x.verifiedAt ? L('doğrulandı', 'verified') : L('doğrulama bekliyor', 'awaiting verification')}</span></span></div>
                  {x.state === 'held' && (
                    <div className="flex flex-wrap gap-2">
                      <VerifyButton dep={x} />
                      {can('finance:apply') && <button type="button" className={btnSmall} disabled={!x.verifiedAt} title={x.verifiedAt ? undefined : L('Önce başka bir yetkili doğrulamalı', 'Another authorized person must verify it first')} onClick={() => act((s) => releaseDeposit(s, x.id, 'released'), L('Depozito iade edildi.', 'Deposit released.'))}>{L('İade et', 'Release')}</button>}
                      {can('finance:apply') && <button type="button" className={btnSmall} disabled={!x.verifiedAt} title={x.verifiedAt ? undefined : L('Önce başka bir yetkili doğrulamalı', 'Another authorized person must verify it first')} onClick={() => act((s) => releaseDeposit(s, x.id, 'applied'), L('Depozito açık bakiyeye mahsup edildi.', 'Deposit applied to the open balance.'))}>{L('Bakiyeye mahsup et', 'Apply to balance')}</button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {refunds.length > 0 && <p className="mt-2 text-[12.5px] text-ink-2">{refunds.length} {L('iade talebi var (Finans Merkezi / Onay Merkezi).', 'refund request(s) (Finance Center / Approval Center).')}</p>}
        </Panel>
        <Panel title={L('Finansal kapanış', 'Financial closure')} description={L('Operasyonel kapanıştan ayrıdır.', 'Separate from operational closure.')}>
          <ReadinessList items={checks.items.map((i) => ({ key: i.key, label: i.label, ok: i.ok, severity: 'blocker' as const, detail: i.detail }))} />
          <div className="mt-3">
            {r.financeStatus === 'closed' ? (
              <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-medium text-ok">{L('Finans dosyası kapalı', 'Finance file closed')}</span>{can('finance:apply') && <button type="button" className={btnSmall} onClick={onReopen}>{L('Yeniden aç', 'Reopen')}</button>}</div>
            ) : (
              <>
                <button type="button" className={btnPrimary} disabled={!checks.canClose || !can('finance:apply') || !opDone} onClick={() => act((s) => closeFinancial(s, r.id), L('Finansal olarak kapandı.', 'Financially closed.'))}>{L('Finansal kapat', 'Close financially')}</button>
                {(!checks.canClose || !opDone) && <p className="mt-2 text-[12.5px] text-ink-2">{L('Pasif: yukarıda kırmızı kontroller çözülmeli.', 'Disabled: resolve the failing checks above.')}</p>}
              </>
            )}
          </div>
        </Panel>
      </div>
      {voiding && <ApprovalRequestDialog type="financial_correction" target={{ type: 'payment', id: voiding }} onClose={() => setVoiding(null)} hint={L('Hesap kalemi iptali yüksek riskli (Seviye 2) bir işlemdir; bağımsız bir yetkili onaylar ve uygular.', 'Voiding a charge is a high-risk (level 2) action; an independent authorizer approves and applies it.')} />}
    </div>
  )
}

function ReasonDialog({ title, desc, confirm, danger, min, onClose, run }: { title: string; desc: string; confirm: string; danger?: boolean; min: number; onClose: () => void; run: (reason: string) => { ok: true } | { ok: false; error: string; fields: Record<string, string> } }) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  return (
    <FinanceDialog
      title={title}
      description={desc}
      confirm={confirm}
      danger={danger}
      onClose={onClose}
      onSubmit={() => {
        if (reason.trim().length < min) {
          setErr(L(`En az ${min} karakter yazın`, `Write at least ${min} characters`))
          return L('Gerekçe zorunlu.', 'A reason is required.')
        }
        const x = run(reason)
        if (!x.ok) {
          setErr(x.fields.reason)
          return x.error
        }
        onClose()
      }}
    >
      <AreaF id="rs-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={err} rows={3} />
    </FinanceDialog>
  )
}

function ExtendDialog({ r, onClose }: { r: Rental; onClose: () => void }) {
  const f = useFmt()
  const tz = f.zone(r.returnBranchId)
  const [to, setTo] = useState(new Date(Date.parse(r.plannedReturnAt) + 24 * 3600_000).toISOString())
  const [note, setNote] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  return (
    <FinanceDialog
      title={L('Süreyi uzat', 'Extend rental')}
      description={L('Yeni dönem için araç müsaitliği, fiyat, sigorta ve depozito yeniden değerlendirilir. Teslim edilmiş kiralamada fark hesap kalemi olarak eklenir.', 'Availability, price, cover and deposit are re-evaluated for the new period. On a delivered rental the difference is posted as a charge.')}
      confirm={L('Uzat', 'Extend')}
      onClose={onClose}
      onSubmit={() => {
        const x = runAction((s) => extendRental(s, r.id, to, note), L('Kiralama uzatıldı.', 'Rental extended.'))
        if (!x.ok) {
          setFields(x.fields)
          return x.error
        }
        onClose()
      }}
    >
      <DateTimeF id="ex-to" label={L('Yeni iade zamanı', 'New return time')} required value={to} onChange={setTo} tz={tz} error={fields.returnAt} hint={`${L('Mevcut', 'Current')}: ${f.dt(r.plannedReturnAt, r.returnBranchId)}`} />
      <AreaF id="ex-n" label={L('Gerekçe', 'Reason')} required value={note} onChange={setNote} error={fields.note} rows={2} />
    </FinanceDialog>
  )
}

function SwapDialog({ r, onClose }: { r: Rental; onClose: () => void }) {
  const d = useDb()
  const [vid, setVid] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | undefined>()
  const from = r.actualPickupAt ?? r.plannedPickupAt
  const choices = d.vehicles
    .filter((v) => v.status !== 'sold' && v.id !== r.vehicleId)
    .map((v) => ({ v, av: checkVehicleAvailable(d, v, from, r.plannedReturnAt, d.clock.now, { rentalId: r.id }), rd: readinessOf(d, v, d.clock.now) }))
    .sort((a, b) => Number(b.av.ok && b.rd.ready) - Number(a.av.ok && a.rd.ready))
  return (
    <FinanceDialog
      title={L('Araç değiştir', 'Swap vehicle')}
      description={L('Yeni araç müsait ve hazır olmalı. Sigorta ve fiyat anlaşması korunur; sınıf fiyat farkı varsa elle ayrı kalem eklenir.', 'The new vehicle must be available and ready. Cover and price agreement are kept; a class price difference is added manually as a separate item.')}
      confirm={L('Değiştir', 'Swap')}
      onClose={onClose}
      onSubmit={() => {
        if (!vid) return L('Yeni araç seçin.', 'Choose the new vehicle.')
        const x = runAction((s) => swapVehicle(s, r.id, vid, reason), L('Araç değiştirildi.', 'Vehicle swapped.'))
        if (!x.ok) {
          setErr(x.fields.reason)
          return x.error
        }
        onClose()
      }}
    >
      <SelectF id="sw-v" label={L('Yeni araç', 'New vehicle')} value={vid} onChange={setVid} placeholder={L('Araç seçin', 'Choose a vehicle')} options={choices.map(({ v, av, rd }) => ({ id: v.id, label: `${v.plate} · ${v.make} ${v.model}${av.ok ? '' : ` — ${L('uygun değil', 'unavailable')}`}${av.ok && !rd.ready ? ` — ${L('hazır değil', 'not ready')}` : ''}`, disabled: !av.ok || !rd.ready }))} />
      <AreaF id="sw-r" label={L('Gerekçe', 'Reason')} required value={reason} onChange={setReason} error={err} rows={2} />
    </FinanceDialog>
  )
}

