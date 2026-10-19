import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { rentalFinance } from '../../core/calc/finance'
import { describeRate, isRateActive } from '../../core/calc/fx'
import { fmt } from '../../core/money'
import { financeSummary } from '../../core/metrics'
import { completeRefund, releaseDeposit, voidCharge, voidPayment } from '../../core/ops/finance'
import type { Charge, Payment, Rental } from '../../core/types'
import { L } from '../../i18n'
import { ComboF } from '../../ui/forms'
import { CustomerLink } from '../../ui/domain'
import { runAction, useBranchScope, useCan, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, Empty, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Notice, Page, Panel, SearchBox, Status, Tabs } from '../../ui/kit'
import { METHOD_LABEL } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { byCurText, PromptDialog } from '../fleet/common'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { PaymentDialog } from '../shared/PaymentDialog'

type TabId = 'acik' | 'odemeler' | 'kalemler' | 'kaparo' | 'depozito' | 'iade' | 'kurlar'

export function FinancePage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const [tab, setTab] = useUrlState('sekme', 'acik')
  const [q, setQ] = useUrlState('q')
  const [method, setMethod] = useUrlState('yontem', 'all')
  const [pay, setPay] = useState<{ rentalId: string } | 'pick' | null>(null)
  const [refund, setRefund] = useState<'pick' | { rentalId: string } | null>(null)
  const [voidTarget, setVoidTarget] = useState<{ kind: 'payment' | 'charge'; id: string } | null>(null)
  const sum = financeSummary(d, active)
  const methods = METHOD_LABEL()
  const rentals = d.rentals.filter((r) => active.includes(r.pickupBranchId))
  const open = rentals.filter((r) => !['prepared', 'cancelled'].includes(r.status)).map((r) => ({ r, fin: rentalFinance(d, r.id) })).filter((x) => x.fin.outstandingMinor > 0)
  const rentalOf = (id?: string) => d.rentals.find((r) => r.id === id)
  const myPayments = d.payments.filter((p) => active.includes(p.branchId))
  const payments = myPayments.filter((p) => (method === 'all' ? true : p.method === method)).filter((p) => !q || `${p.no} ${p.payer.name} ${rentalOf(p.rentalId)?.no ?? ''}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  const advances = myPayments.filter((p) => p.kind === 'advance').sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  const charges = d.charges.filter((c) => { const r = rentalOf(c.rentalId); return r && active.includes(r.pickupBranchId) }).sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
  const deposits = d.deposits.filter((x) => { const r = rentalOf(x.rentalId); return r && active.includes(r.pickupBranchId) })
  const refunds = d.refunds
  const canRecord = can('finance:record')

  const payCols: Col<Payment>[] = [
    { id: 'no', header: L('Ödeme', 'Payment'), cell: (p) => <span className="tnum whitespace-nowrap font-medium">{p.no}</span>, sort: (p) => p.no, csv: (p) => p.no },
    { id: 'rental', header: L('Kayıt', 'Record'), cell: (p) => (p.rentalId ? <Link2 type="rental" id={p.rentalId}>{rentalOf(p.rentalId)?.no}</Link2> : p.reservationId ? <Link2 type="reservation" id={p.reservationId}>{d.reservations.find((r) => r.id === p.reservationId)?.no}</Link2> : '—'), csv: (p) => rentalOf(p.rentalId)?.no ?? '' },
    { id: 'payer', header: L('Ödeyen', 'Payer'), cell: (p) => p.payer.name, hideBelow: 'lg', csv: (p) => p.payer.name },
    { id: 'tender', header: L('Alınan', 'Tendered'), align: 'right', cell: (p) => <span className="tnum whitespace-nowrap">{fmt(p.tender.minor, p.tender.cur)}</span>, csv: (p) => p.tender.minor },
    { id: 'eq', header: L('Uygulanan eşdeğer', 'Applied equivalent'), align: 'right', cell: (p) => <span className="tnum whitespace-nowrap">{fmt(p.appliedMinor, p.obligationCur)}</span>, hideBelow: 'md' },
    { id: 'rate', header: L('Kur', 'Rate'), cell: (p) => (p.rate && p.rate.base !== p.rate.quote ? <span className="tnum text-[12.5px]">1 {p.rate.base} = {p.rate.rate} {p.rate.quote}</span> : <span className="text-ink-3">—</span>), hideBelow: 'lg' },
    { id: 'method', header: L('Yöntem', 'Method'), cell: (p) => methods[p.method], hideBelow: 'md', csv: (p) => p.method },
    { id: 'when', header: L('Zaman', 'Time'), cell: (p) => <span className="tnum text-[13px]">{f.dt(p.recordedAt, p.branchId)}</span>, sort: (p) => p.recordedAt, hideBelow: 'lg', csv: (p) => p.recordedAt },
    { id: 'st', header: L('Durum', 'Status'), cell: (p) => <span className="flex gap-1.5"><Status kind="payment" value={p.status} />{p.kind === 'advance' && <Status kind="advance" value={p.advanceState ?? 'unapplied'} />}</span>, csv: (p) => p.status },
    { id: 'act', header: '', align: 'right', cell: (p) => (p.status !== 'voided' && can('finance:apply') ? <button type="button" className={btnSmall} onClick={(e) => { e.stopPropagation(); setVoidTarget({ kind: 'payment', id: p.id }) }}>{L('Ters kayıt', 'Reverse')}</button> : null) },
  ]
  const openCols: Col<{ r: Rental; fin: ReturnType<typeof rentalFinance> }>[] = [
    { id: 'no', header: L('Kiralama', 'Rental'), cell: (x) => <Link2 type="rental" id={x.r.id}>{x.r.no}</Link2>, sort: (x) => x.r.no, csv: (x) => x.r.no },
    { id: 'cust', header: L('Müşteri', 'Customer'), cell: (x) => <CustomerLink c={d.customers.find((c) => c.id === x.r.customerId)} />, csv: (x) => d.customers.find((c) => c.id === x.r.customerId)?.name ?? '' },
    { id: 'st', header: L('Operasyon', 'Operations'), cell: (x) => <Status kind="rental" value={x.r.status} />, hideBelow: 'md' },
    { id: 'ch', header: L('Hesaplanan', 'Charged'), align: 'right', cell: (x) => <span className="tnum whitespace-nowrap">{fmt(x.fin.chargesMinor, x.fin.cur)}</span>, hideBelow: 'md', csv: (x) => x.fin.chargesMinor },
    { id: 'ap', header: L('Uygulanan', 'Applied'), align: 'right', cell: (x) => <span className="tnum whitespace-nowrap">{fmt(x.fin.appliedMinor, x.fin.cur)}</span>, hideBelow: 'lg', csv: (x) => x.fin.appliedMinor },
    { id: 'out', header: L('Kalan', 'Outstanding'), align: 'right', cell: (x) => <span className="tnum whitespace-nowrap font-medium">{fmt(x.fin.outstandingMinor, x.fin.cur)}</span>, sort: (x) => x.fin.outstandingMinor, csv: (x) => x.fin.outstandingMinor },
    { id: 'act', header: '', align: 'right', cell: (x) => (canRecord ? <button type="button" className={btnSmall} onClick={(e) => { e.stopPropagation(); setPay({ rentalId: x.r.id }) }}>{L('Ödeme al', 'Take payment')}</button> : null) },
  ]
  const rates = d.fxRates.filter((r) => isRateActive(r, d.clock.now))

  return (
    <Page
      title={L('Finans Merkezi', 'Finance Center')}
      description={L('Hesap kalemi ödeme değildir; kaydedilen ödeme uygulanana kadar borcu düşürmez. Depozito gelir sayılmaz, iade gider sayılmaz. Toplamlar para birimi başınadır.', 'A charge is not a payment; a recorded payment does not reduce the balance until applied. A deposit is not revenue and a refund is not an expense. Totals are per currency.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('odemeler', payCols, payments)}>CSV</button>
          {canRecord && <button type="button" className={btnPrimary} onClick={() => setPay('pick')}>{L('Ödeme al', 'Take payment')}</button>}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Hesaplanan', 'Charged'), value: byCurText(sum.charged, fmt), hint: L('Kesilmiş hesap kalemleri', 'Posted charges') },
          { label: L('Tahsil edilen', 'Collected'), value: byCurText(sum.collected, fmt), hint: L('Kalemlere uygulanan', 'Applied to charges') },
          { label: L('Açık bakiye', 'Outstanding'), value: byCurText(sum.outstanding, fmt), tone: 'hold' },
          { label: L('Uygulanmamış', 'Unapplied'), value: byCurText(sum.unapplied, fmt), hint: L('Kaydedildi, uygulanmadı', 'Recorded, not applied') },
          { label: L('Tutulan depozito', 'Deposits held'), value: byCurText(sum.depositsHeld, fmt), hint: L('Gelir değildir', 'Not revenue') },
        ]}
      />
      <Tabs<TabId>
        label={L('Finans bölümleri', 'Finance sections')}
        value={tab as TabId}
        onChange={setTab}
        tabs={[
          { id: 'acik', label: L('Açık bakiyeler', 'Open balances'), count: open.length || undefined },
          { id: 'odemeler', label: L('Ödemeler', 'Payments'), count: myPayments.length },
          { id: 'kalemler', label: L('Hesap kalemleri', 'Charges') },
          { id: 'kaparo', label: L('Kaparo', 'Advances'), count: advances.length || undefined },
          { id: 'depozito', label: L('Depozitolar', 'Deposits'), count: deposits.filter((x) => x.state === 'held').length || undefined },
          { id: 'iade', label: L('İadeler', 'Refunds'), count: refunds.length || undefined },
          { id: 'kurlar', label: L('Kurlar', 'Rates') },
        ]}
      />
      {tab === 'acik' && <DataTable rows={open} cols={openCols} rowKey={(x) => x.r.id} label={L('Açık bakiyeler', 'Open balances')} urlKey="ab" defaultSort={{ id: 'out', dir: 'desc' }} empty={<Empty title={L('Açık bakiye yok', 'No open balances')} />} />}
      {tab === 'odemeler' && (
        <>
          <FilterBar onReset={() => { setQ(''); setMethod('all') }} active={q !== '' || method !== 'all'}>
            <SearchBox label={L('Ödemelerde ara', 'Search payments')} placeholder={L('Ödeme, ödeyen, kiralama…', 'Payment, payer, rental…')} value={q} onChange={setQ} />
            <FilterSelect label={L('Yöntem', 'Method')} value={method} onChange={setMethod} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.entries(methods).map(([id, label]) => ({ id, label }))]} />
          </FilterBar>
          <DataTable rows={payments} cols={payCols} rowKey={(p) => p.id} label={L('Ödemeler', 'Payments')} urlKey="od" defaultSort={{ id: 'when', dir: 'desc' }} empty={<Empty title={L('Ödeme yok', 'No payments')} />} />
          <p className="text-[12.5px] text-ink-2">{L('Ödeme silinmez: “Ters kayıt” iptal gerekçesiyle ters hareket üretir; nakit ise kasadan geri çıkar.', 'A payment is never deleted: “Reverse” creates a reversing movement with a reason; for cash the drawer is reversed too.')}</p>
        </>
      )}
      {tab === 'kalemler' && (
        <Panel flush>
          {charges.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Hesap kalemi yok.', 'No charges.')}</p> : (
            <ul className="divide-y divide-line-soft">
              {charges.map((c: Charge) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{c.no}</span> · {c.label}<span className="block text-[12.5px] text-ink-2"><Link2 type="rental" id={c.rentalId}>{rentalOf(c.rentalId)?.no}</Link2></span></span><span className="flex items-center gap-3"><span className={`tnum ${c.status === 'voided' ? 'text-ink-3 line-through' : ''}`}>{fmt(c.amountMinor, c.cur)}</span><Status kind="charge" value={c.status} />{c.status === 'posted' && can('finance:apply') && <button type="button" className={btnSmall} onClick={() => setVoidTarget({ kind: 'charge', id: c.id })}>{L('İptal', 'Void')}</button>}</span></li>)}
            </ul>
          )}
        </Panel>
      )}
      {tab === 'kaparo' && (
        <Panel title={L('Kaparo (avans)', 'Advances')} description={L('Kaparo gelir değildir: tutuluyor → kiralamaya aktarıldı → teslimde hesap kalemine uygulandı.', 'An advance is not revenue: held → transferred to the rental → applied to the charge at delivery.')} flush>
          {advances.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Kaparo kaydı yok. Rezervasyon sayfasından kaparo alınır.', 'No advances. Take an advance from a reservation page.')}</p> : (
            <ul className="divide-y divide-line-soft">{advances.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{p.no}</span> · {fmt(p.tender.minor, p.tender.cur)} · {methods[p.method]}<span className="block text-[12.5px] text-ink-2">{p.reservationId ? <Link2 type="reservation" id={p.reservationId}>{d.reservations.find((r) => r.id === p.reservationId)?.no}</Link2> : <Link2 type="rental" id={p.rentalId!}>{rentalOf(p.rentalId)?.no}</Link2>} · {f.dt(p.recordedAt, p.branchId)}</span></span><span className="flex gap-1.5"><Status kind="payment" value={p.status} /><Status kind="advance" value={p.advanceState ?? 'unapplied'} /></span></li>)}</ul>
          )}
        </Panel>
      )}
      {tab === 'depozito' && (
        <Panel title={L('Depozitolar', 'Deposits')} description={L('Tutulan depozito iade edilir veya aynı para birimindeki açık bakiyeye mahsup edilir.', 'A held deposit is released or applied to an open balance in the same currency.')} flush>
          {deposits.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Depozito yok.', 'No deposits.')}</p> : (
            <ul className="divide-y divide-line-soft">{deposits.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{fmt(x.amount.minor, x.amount.cur)}</span> · {methods[x.method]}<span className="block text-[12.5px] text-ink-2"><Link2 type="rental" id={x.rentalId}>{rentalOf(x.rentalId)?.no}</Link2></span></span><span className="flex items-center gap-2"><Status kind="deposit" value={x.state} />{x.state === 'held' && can('finance:apply') && <><button type="button" className={btnSmall} onClick={() => runAction((s) => releaseDeposit(s, x.id, 'released'), L('Depozito iade edildi.', 'Deposit released.'))}>{L('İade et', 'Release')}</button><button type="button" className={btnSmall} onClick={() => runAction((s) => releaseDeposit(s, x.id, 'applied'), L('Depozito bakiyeye mahsup edildi.', 'Deposit applied to balance.'))}>{L('Mahsup et', 'Apply')}</button></>}</span></li>)}</ul>
          )}
        </Panel>
      )}
      {tab === 'iade' && (
        <Panel title={L('İadeler', 'Refunds')} description={L('İade, Onay Merkezi’nde ikinci bir yetkili onaylayıp uygulayınca "onaylandı" olur; ödeme dışarıda yapılır, burada kayda geçirilir.', 'A refund becomes "approved" when a second authorised person approves and applies it in the Approval Center; the payout happens outside, and is recorded here.')} action={can('approvals:request') ? <button type="button" className={btnSmall} onClick={() => setRefund('pick')}>{L('İade talebi aç', 'Request refund')}</button> : undefined} flush>
          {refunds.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('İade yok.', 'No refunds.')}</p> : (
            <ul className="divide-y divide-line-soft">{refunds.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{x.no}</span> · {fmt(x.amount.minor, x.amount.cur)} · {methods[x.method]}<span className="block text-[12.5px] text-ink-2">{x.reason}</span></span><span className="flex items-center gap-2"><Status kind="refund" value={x.status} />{x.status === 'approved' && can('finance:apply') && <button type="button" className={btnSmall} onClick={() => runAction((s) => completeRefund(s, x.id), L('İade ödemesi kaydedildi.', 'Refund payout recorded.'))}>{L('İade edildi kaydet', 'Record payout')}</button>}{x.approvalId && <Link2 type="approval" id={x.approvalId}>{L('Onay', 'Approval')}</Link2>}</span></li>)}</ul>
          )}
        </Panel>
      )}
      {tab === 'kurlar' && (
        <div className="space-y-4">
          <Notice tone="blue" action={<Link to={'/ayarlar?bolum=kurlar' as never} className={btnSmall}>{L('Kurları düzenle', 'Edit rates')}</Link>}>
            {L('Kurlar tek yerde, Ayarlar → Döviz Kurları’nda yönetilir. Bu liste yalnız okunur. Kurlar işletmenin kendi belirlediği manuel orandır; piyasa veya merkez bankası kuru değildir.', 'Rates are managed in one place, Settings → Exchange Rates. This list is read-only. Rates are manual business-defined values, not market or central-bank rates.')}
          </Notice>
          <Panel title={L('Geçerli kurlar', 'Active rates')} flush>
            {rates.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Geçerli kur yok.', 'No active rates.')}</p> : <ul className="divide-y divide-line-soft">{rates.map((r) => <li key={r.id} className="px-5 py-2.5 text-[13.5px]">{describeRate(r)}</li>)}</ul>}
          </Panel>
        </div>
      )}

      {pay === 'pick' && <PickRental title={L('Hangi kiralama için ödeme?', 'Payment for which rental?')} filter={(r) => !['prepared', 'cancelled'].includes(r.status)} onPick={(id) => setPay({ rentalId: id })} onClose={() => setPay(null)} />}
      {pay && pay !== 'pick' && <PaymentDialog rentalId={pay.rentalId} onClose={() => setPay(null)} />}
      {refund === 'pick' && <PickRental title={L('Hangi kiralama için iade?', 'Refund for which rental?')} filter={() => true} onPick={(id) => setRefund({ rentalId: id })} onClose={() => setRefund(null)} />}
      {refund && refund !== 'pick' && <ApprovalRequestDialog type="refund" target={{ type: 'rental', id: refund.rentalId }} cur={rentalOf(refund.rentalId)?.currency} onClose={() => setRefund(null)} hint={L('İade, kaydın para biriminde istenir.', 'A refund is requested in the record’s currency.')} />}
      {voidTarget && <PromptDialog title={voidTarget.kind === 'payment' ? L('Ödemeyi ters kaydet', 'Reverse payment') : L('Hesap kalemini iptal et', 'Void charge')} description={L('Silinmez: gerekçeyle ters kayıt olarak kalır.', 'Nothing is deleted: it remains as a reversal with a reason.')} label={L('Gerekçe', 'Reason')} confirm={L('Onayla', 'Confirm')} danger run={(t) => runAction((s) => (voidTarget.kind === 'payment' ? voidPayment(s, voidTarget.id, t) : voidCharge(s, voidTarget.id, t)), L('Ters kayıt oluşturuldu.', 'Reversal recorded.'))} onClose={() => setVoidTarget(null)} />}
    </Page>
  )
}

function PickRental({ title, filter, onPick, onClose }: { title: string; filter: (r: Rental) => boolean; onPick: (id: string) => void; onClose: () => void }) {
  const d = useDb()
  const [id, setId] = useState('')
  return (
    <FinanceDialog title={title} description={L('Ödeme ve iade bir kiralamaya veya rezervasyona bağlıdır.', 'Payments and refunds belong to a rental or reservation.')} confirm={L('Devam', 'Continue')} onClose={onClose}
      onSubmit={() => { if (!id) return L('Kiralama seçin.', 'Choose a rental.'); onPick(id) }}>
      <ComboF id="pk-r" label={L('Kiralama', 'Rental')} items={d.rentals.filter(filter).map((r) => ({ id: r.id, label: r.no, sub: `${d.customers.find((c) => c.id === r.customerId)?.name} · ${r.currency}` }))} value={id} onChange={setId} />
    </FinanceDialog>
  )
}
