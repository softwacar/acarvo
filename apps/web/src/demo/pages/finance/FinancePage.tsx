import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { rentalFinance, stageOf } from '../../core/calc/finance'
import { describeRate, isRateActive } from '../../core/calc/fx'
import { fmt } from '../../core/money'
import { financeSummary } from '../../core/metrics'
import { completeRefund, reconcilePayments, releaseDeposit } from '../../core/ops/finance'
import type { Charge, Payment, Rental } from '../../core/types'
import { L } from '../../i18n'
import { ComboF } from '../../ui/forms'
import { CustomerLink } from '../../ui/domain'
import { runAction, useBranchScope, useCan, useDb, useFmt, useMe, useUrlState } from '../../ui/hooks'
import { btnPrimary, btnSecondary, btnSmall, Empty, FilterBar, FilterSelect, FinanceDialog, Kpis, Link2, Notice, Page, Panel, SearchBox, Status, Tabs } from '../../ui/kit'
import { METHOD_LABEL } from '../../ui/status'
import { type Col, DataTable, downloadCsv } from '../../ui/table'
import { byCurText, PromptDialog } from '../fleet/common'
import { ApprovalRequestDialog } from '../shared/ApprovalRequestDialog'
import { AdvanceLedgerCard, AuditButton, StageBadge, VerifyButton } from '../shared/FinanceBits'
import { PaymentDialog } from '../shared/PaymentDialog'
import { AttentionTab } from './FinanceAttention'

// Finance (decision document M.1): ONE model. A payment is recorded, then verified by somebody else, then applied; reconciliation is a
// separate flag and the audit trail is the immutable event list. Reversals and refunds are formal approvals (risk levels).

type TabId = 'dikkat' | 'acik' | 'odemeler' | 'kalemler' | 'kaparo' | 'depozito' | 'iade' | 'kurlar'

export function FinancePage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const me = useMe()
  const { active } = useBranchScope()
  const [tab, setTab] = useUrlState('sekme', 'acik')
  const [q, setQ] = useUrlState('q')
  const [method, setMethod] = useUrlState('yontem', 'all')
  const [pay, setPay] = useState<{ rentalId: string } | 'pick' | null>(null)
  const [refund, setRefund] = useState<'pick' | { rentalId: string } | null>(null)
  const [correct, setCorrect] = useState<{ kind: 'payment' | 'charge'; id: string } | null>(null)
  const [recSel, setRecSel] = useState<string[]>([])
  const [recDlg, setRecDlg] = useState(false)
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
  const unverified = myPayments.filter((p) => p.status === 'recorded' && stageOf(p) === 'recorded')
  const unverifiedSum: Record<string, number> = {}
  for (const p of unverified) unverifiedSum[p.tender.cur] = (unverifiedSum[p.tender.cur] ?? 0) + p.tender.minor
  const attention = unverified.length + deposits.filter((x) => x.state === 'held' && !x.verifiedAt).length + refunds.filter((x) => x.status === 'requested' || x.status === 'approved').length
  const reconcilable = (p: Payment) => p.status === 'applied' && !p.reconciledAt

  const payCols: Col<Payment>[] = [
    { id: 'pick', header: L('Seç', 'Select'), cell: (p) => (can('finance:reconcile') && reconcilable(p) ? <input type="checkbox" aria-label={`${L('Mutabakat için seç', 'Select for reconciliation')} ${p.no}`} checked={recSel.includes(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => setRecSel((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} className="size-4 accent-[var(--ac-blue)]" /> : null) },
    { id: 'no', header: L('Ödeme', 'Payment'), cell: (p) => <span className="tnum whitespace-nowrap font-medium">{p.no}</span>, sort: (p) => p.no, csv: (p) => p.no },
    { id: 'rental', header: L('Kayıt', 'Record'), cell: (p) => (p.rentalId ? <Link2 type="rental" id={p.rentalId}>{rentalOf(p.rentalId)?.no}</Link2> : p.reservationId ? <Link2 type="reservation" id={p.reservationId}>{d.reservations.find((r) => r.id === p.reservationId)?.no}</Link2> : '—'), csv: (p) => rentalOf(p.rentalId)?.no ?? '' },
    { id: 'payer', header: L('Ödeyen', 'Payer'), cell: (p) => p.payer.name, hideBelow: 'lg', csv: (p) => p.payer.name },
    { id: 'tender', header: L('Alınan', 'Tendered'), align: 'right', cell: (p) => <span className="tnum whitespace-nowrap">{fmt(p.tender.minor, p.tender.cur)}</span>, csv: (p) => p.tender.minor },
    { id: 'eq', header: L('Uygulanan eşdeğer', 'Applied equivalent'), align: 'right', cell: (p) => <span className="tnum whitespace-nowrap">{fmt(p.appliedMinor, p.obligationCur)}</span>, hideBelow: 'md' },
    { id: 'rate', header: L('Kur', 'Rate'), cell: (p) => (p.rate && p.rate.base !== p.rate.quote ? <span className="tnum text-[12.5px]">1 {p.rate.base} = {p.rate.rate} {p.rate.quote}</span> : <span className="text-ink-3">—</span>), hideBelow: 'lg' },
    { id: 'method', header: L('Yöntem', 'Method'), cell: (p) => methods[p.method], hideBelow: 'md', csv: (p) => p.method },
    { id: 'when', header: L('Zaman', 'Time'), cell: (p) => <span className="tnum text-[13px]">{f.dt(p.recordedAt, p.branchId)}</span>, sort: (p) => p.recordedAt, hideBelow: 'lg', csv: (p) => p.recordedAt },
    { id: 'st', header: L('Aşama', 'Stage'), cell: (p) => <StageBadge p={p} />, csv: (p) => stageOf(p) },
    {
      id: 'act',
      header: '',
      align: 'right',
      cell: (p) => (
        <span className="inline-flex flex-wrap justify-end gap-1.5">
          <VerifyButton p={p} />
          {p.status !== 'voided' && can('approvals:request') && p.kind === 'payment' && <button type="button" className={btnSmall} onClick={(e) => { e.stopPropagation(); setCorrect({ kind: 'payment', id: p.id }) }}>{L('Düzeltme talep et', 'Request correction')}</button>}
          <AuditButton needles={[p.no, p.id]} title={`${L('Ödeme', 'Payment')} ${p.no}`} />
        </span>
      ),
    },
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
      title={L('Finans', 'Finance')}
      description={L('Ödeme önce kaydedilir, sonra başka bir yetkili doğrular, sonra uygulanır; doğrulanana kadar bakiyeyi düşürmez. Mutabakat ve denetim geçmişi bu çizginin adımı değil, ayrı izlerdir. Hesap kalemi ödeme değildir; depozito gelir, iade gider sayılmaz. Toplamlar para birimi başınadır.', 'A payment is recorded, then verified by somebody else, then applied; it does not reduce the balance until verified. Reconciliation and the audit trail are separate tracks, not steps of that line. A charge is not a payment; a deposit is not revenue and a refund is not an expense. Totals are per currency.')}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => downloadCsv('odemeler', payCols, payments)}>CSV</button>
          {canRecord && <button type="button" className={btnPrimary} onClick={() => setPay('pick')}>{L('Ödeme al', 'Take payment')}</button>}
        </>
      }
    >
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label={L('İlgili ekranlar', 'Related screens')}>
        {can('cash:view') && <Link to={'/sube-kasalari' as never} className="font-medium text-blue hover:underline">{L('Kasa işlemleri: Şube Kasaları', 'Cash: Branch Cash Registers')}</Link>}
        {can('approvals:view') && <Link to={'/onay-merkezi' as never} className="font-medium text-blue hover:underline">{L('Onaylar: Onay Merkezi', 'Approvals: Approval Center')}</Link>}
        {can('reports:view') && <Link to={'/raporlar?rapor=gunsonu' as never} className="font-medium text-blue hover:underline">{L('Gün sonu özeti', 'End-of-day summary')}</Link>}
      </p>
      <Kpis
        items={[
          { label: L('Hesaplanan', 'Charged'), value: byCurText(sum.charged, fmt), hint: L('Kesilmiş hesap kalemleri', 'Posted charges') },
          { label: L('Tahsil edilen', 'Collected'), value: byCurText(sum.collected, fmt), hint: L('Kalemlere uygulanan', 'Applied to charges') },
          { label: L('Açık bakiye', 'Outstanding'), value: byCurText(sum.outstanding, fmt), tone: 'hold' },
          { label: L('Doğrulama bekleyen', 'Awaiting verification'), value: byCurText(unverifiedSum, fmt), hint: L('Kaydedildi, doğrulanmadı', 'Recorded, not verified'), tone: unverified.length ? 'hold' : undefined, to: '/finans?sekme=dikkat' },
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
          { id: 'dikkat', label: L('Dikkat', 'Attention'), count: attention || undefined },
        ]}
      />
      {tab === 'dikkat' && <AttentionTab />}
      {tab === 'acik' && <DataTable rows={open} cols={openCols} rowKey={(x) => x.r.id} label={L('Açık bakiyeler', 'Open balances')} urlKey="ab" defaultSort={{ id: 'out', dir: 'desc' }} empty={<Empty title={L('Açık bakiye yok', 'No open balances')} />} />}
      {tab === 'odemeler' && (
        <>
          <FilterBar onReset={() => { setQ(''); setMethod('all') }} active={q !== '' || method !== 'all'}>
            <SearchBox label={L('Ödemelerde ara', 'Search payments')} placeholder={L('Ödeme, ödeyen, kiralama…', 'Payment, payer, rental…')} value={q} onChange={setQ} />
            <FilterSelect label={L('Yöntem', 'Method')} value={method} onChange={setMethod} options={[{ id: 'all', label: L('Tümü', 'All') }, ...Object.entries(methods).map(([id, label]) => ({ id, label }))]} />
          </FilterBar>
          {recSel.length > 0 && (
            <div role="region" aria-label={L('Mutabakat', 'Reconciliation')} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
              <span className="text-[13px] font-medium">{recSel.length} {L('ödeme seçili', 'selected')}</span>
              <button type="button" className={btnSmall} onClick={() => setRecDlg(true)}>{L('Mutabakat işaretle', 'Mark reconciled')}</button>
              <button type="button" className={btnSmall} onClick={() => setRecSel([])}>{L('Seçimi temizle', 'Clear selection')}</button>
            </div>
          )}
          <DataTable rows={payments} cols={payCols} rowKey={(p) => p.id} label={L('Ödemeler', 'Payments')} urlKey="od" defaultSort={{ id: 'when', dir: 'desc' }} empty={<Empty title={L('Ödeme yok', 'No payments')} />} />
          <p className="text-[12.5px] text-ink-2">{L('Ödeme silinmez. Ters kayıt yüksek riskli bir işlemdir (Seviye 2): “Düzeltme talep et” bir Finansal Düzeltme açar; bağımsız bir yetkili onaylayıp uygulayınca ters hareket oluşur, nakit ise kasadan geri çıkar.', 'A payment is never deleted. A reversal is a high-risk action (level 2): “Request correction” opens a Financial Correction; when an independent authorizer approves and applies it, a reversing movement is created, and for cash the drawer is reversed too.')}</p>
        </>
      )}
      {tab === 'kalemler' && (
        <Panel flush>
          {charges.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Hesap kalemi yok.', 'No charges.')}</p> : (
            <ul className="divide-y divide-line-soft">
              {charges.map((c: Charge) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{c.no}</span> · {c.label}<span className="block text-[12.5px] text-ink-2"><Link2 type="rental" id={c.rentalId}>{rentalOf(c.rentalId)?.no}</Link2></span></span><span className="flex items-center gap-3"><span className={`tnum ${c.status === 'voided' ? 'text-ink-3 line-through' : ''}`}>{fmt(c.amountMinor, c.cur)}</span><Status kind="charge" value={c.status} />{c.status === 'posted' && can('approvals:request') && <button type="button" className={btnSmall} onClick={() => setCorrect({ kind: 'charge', id: c.id })}>{L('Düzeltme talep et', 'Request correction')}</button>}</span></li>)}
            </ul>
          )}
        </Panel>
      )}
      {tab === 'kaparo' && (
        <Panel title={L('Kaparo (avans)', 'Advances')} description={L('Kaparo gelir değildir: tutuluyor → kiralamaya aktarıldı → teslimde hesap kalemine uygulandı. İptalde şirket politikası bedeli otomatik hesaplanır; kalan tutar tam veya kısmi iade edilebilir.', 'An advance is not revenue: held → transferred to the rental → applied to the charge at delivery. On cancellation the company policy computes the fee; the rest can be refunded in full or in part.')}>
          {advances.length === 0 ? <p className="text-[13.5px] text-ink-2">{L('Kaparo kaydı yok. Rezervasyon sayfasından kaparo alınır.', 'No advances. Take an advance from a reservation page.')}</p> : (
            <div className="space-y-3">{advances.map((p) => <AdvanceLedgerCard key={p.id} p={p} reservation={d.reservations.find((r) => r.id === p.reservationId)} />)}</div>
          )}
        </Panel>
      )}
      {tab === 'depozito' && (
        <Panel title={L('Depozitolar', 'Deposits')} description={L('Depozito kaydedilir, başka bir yetkili doğrular; doğrulanmış tutulan depozito iade edilir veya aynı para birimindeki açık bakiyeye mahsup edilir.', 'A deposit is recorded and verified by somebody else; a verified held deposit is released or applied to an open balance in the same currency.')} flush>
          {deposits.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('Depozito yok.', 'No deposits.')}</p> : (
            <ul className="divide-y divide-line-soft">{deposits.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{fmt(x.amount.minor, x.amount.cur)}</span> · {methods[x.method]}<span className="block text-[12.5px] text-ink-2"><Link2 type="rental" id={x.rentalId}>{rentalOf(x.rentalId)?.no}</Link2> · {x.verifiedAt ? L('doğrulandı', 'verified') : L('doğrulama bekliyor', 'awaiting verification')}</span></span><span className="flex flex-wrap items-center gap-2"><Status kind="deposit" value={x.state} />{x.state === 'held' && <VerifyButton dep={x} />}{x.state === 'held' && can('finance:apply') && <><button type="button" className={btnSmall} disabled={!x.verifiedAt} title={x.verifiedAt ? undefined : L('Önce başka bir yetkili doğrulamalı', 'Another authorized person must verify it first')} onClick={() => runAction((s) => releaseDeposit(s, x.id, 'released'), L('Depozito iade edildi.', 'Deposit released.'))}>{L('İade et', 'Release')}</button><button type="button" className={btnSmall} disabled={!x.verifiedAt} title={x.verifiedAt ? undefined : L('Önce başka bir yetkili doğrulamalı', 'Another authorized person must verify it first')} onClick={() => runAction((s) => releaseDeposit(s, x.id, 'applied'), L('Depozito bakiyeye mahsup edildi.', 'Deposit applied to balance.'))}>{L('Mahsup et', 'Apply')}</button></>}</span></li>)}</ul>
          )}
        </Panel>
      )}
      {tab === 'iade' && (
        <Panel title={L('İadeler', 'Refunds')} description={L('İade, Onay Merkezi’nde ikinci bir yetkili onaylayıp uygulayınca "onaylandı" olur; ödeme dışarıda yapılır, burada kayda geçirilir. Gerçek para hareketi yoktur: demo kaydıdır.', 'A refund becomes "approved" when a second authorised person approves and applies it in the Approval Center; the payout happens outside and is recorded here. No real money moves: this is a demo record.')} action={can('approvals:request') ? <button type="button" className={btnSmall} onClick={() => setRefund('pick')}>{L('İade talebi aç', 'Request refund')}</button> : undefined} flush>
          {refunds.length === 0 ? <p className="px-5 py-5 text-[13.5px] text-ink-2">{L('İade yok.', 'No refunds.')}</p> : (
            <ul className="divide-y divide-line-soft">{refunds.map((x) => <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13.5px]"><span><span className="tnum font-medium">{x.no}</span> · {fmt(x.amount.minor, x.amount.cur)} · {methods[x.method]}<span className="block text-[12.5px] text-ink-2">{x.reason}</span></span><span className="flex items-center gap-2"><Status kind="refund" value={x.status} />{x.status === 'approved' && can('finance:apply') && x.requestedBy !== me.id && <button type="button" className={btnSmall} onClick={() => runAction((s) => completeRefund(s, x.id), L('İade ödemesi kaydedildi.', 'Refund payout recorded.'))}>{L('İade edildi kaydet', 'Record payout')}</button>}{x.approvalId && <Link2 type="approval" id={x.approvalId}>{L('Onay', 'Approval')}</Link2>}</span></li>)}</ul>
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
      {correct && <ApprovalRequestDialog type="financial_correction" target={{ type: 'payment', id: correct.id }} onClose={() => setCorrect(null)} hint={correct.kind === 'payment' ? L('Ödeme ters kaydı yüksek riskli (Seviye 2) bir işlemdir; bağımsız bir yetkili onaylar ve uygular.', 'Reversing a payment is a high-risk (level 2) action; an independent authorizer approves and applies it.') : L('Hesap kalemi iptali yüksek riskli (Seviye 2) bir işlemdir; bağımsız bir yetkili onaylar ve uygular.', 'Voiding a charge is a high-risk (level 2) action; an independent authorizer approves and applies it.')} />}
      {recDlg && <PromptDialog title={L('Mutabakat işaretle', 'Mark reconciled')} description={L('Seçilen uygulanmış ödemeler kasa sayımı, POS özeti veya ekstreyle eşlendi. Bu bakiyeyi değiştirmez; yalnız mutabakat izini tutar.', 'The selected applied payments were matched with a drawer count, POS slip or statement. It does not change any balance; it only keeps the reconciliation trail.')} label={L('Referans (sayım, POS özeti veya ekstre)', 'Reference (count, POS slip or statement)')} confirm={L('Mutabık say', 'Mark reconciled')} min={3} run={(t) => { const r = runAction((s) => reconcilePayments(s, recSel, t), L('Mutabakat işaretlendi.', 'Marked as reconciled.')); if (r.ok) setRecSel([]); return r as never }} onClose={() => setRecDlg(false)} />}
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
