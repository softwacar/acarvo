import { Link } from '@tanstack/react-router'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { rentalFinance } from '../../core/calc/finance'
import { fmt } from '../../core/money'
import { financeSummary } from '../../core/metrics'
import type { Cur, Db, Id, LinkType } from '../../core/types'
import { L } from '../../i18n'
import { BarsV, ChartCard, SERIES } from '../../ui/charts'
import { SelectF } from '../../ui/forms'
import { entityHref, useBranchScope, useDb, useUrlState } from '../../ui/hooks'
import { Kpis, Page, Panel } from '../../ui/kit'
import { byCurText } from '../fleet/common'

// Revenue control: reconciliation checks over the same finance records. Every check names the records that fail it.

interface Check {
  key: string
  label: string
  rule: string
  failing: { type: LinkType; id: Id; text: string }[]
}

function checksOf(d: Db, branches: Id[]): Check[] {
  const rentals = d.rentals.filter((r) => branches.includes(r.pickupBranchId))
  const fin = (id: Id) => rentalFinance(d, id)
  const delivered = rentals.filter((r) => ['delivered', 'returned', 'closed', 'exception_closed', 'loss_closed'].includes(r.status))
  const noCharge = delivered.filter((r) => !d.charges.some((c) => c.rentalId === r.id && c.kind === 'base' && c.status === 'posted'))
  const dupBase = delivered.filter((r) => d.charges.filter((c) => c.rentalId === r.id && c.kind === 'base' && c.status === 'posted').length > 1)
  const over = rentals.filter((r) => fin(r.id).overpaidMinor > 0)
  const unapplied = rentals.filter((r) => fin(r.id).unappliedMinor > 0)
  const closedOpen = rentals.filter((r) => ['closed', 'exception_closed', 'loss_closed'].includes(r.status) && r.financeStatus === 'open')
  const cashPays = d.payments.filter((p) => p.method === 'cash' && p.status !== 'voided' && p.drawerId && branches.includes(p.branchId))
  const cashMissing = cashPays.filter((p) => !d.cashMovements.some((m) => m.sourceType === 'payment' && m.sourceId === p.id && m.kind === 'in'))
  const nonCashInDrawer = d.cashMovements.filter((m) => m.sourceType === 'payment' && d.payments.find((p) => p.id === m.sourceId)?.method !== 'cash')
  const depAsRevenue = d.payments.filter((p) => p.payer.name === 'Depozito mahsubu' && p.status === 'applied' && !d.deposits.some((x) => p.reference.includes(x.id)))
  const voidedApplied = d.charges.filter((c) => c.status === 'voided' && d.payments.some((p) => p.status === 'applied' && p.allocations.some((a) => a.chargeId === c.id)))
  const link = (r: { id: Id; no: string }, text: string) => ({ type: 'rental' as const, id: r.id, text: `${r.no} · ${text}` })
  return [
    { key: 'nocharge', label: L('Teslim edilmiş, kiralama bedeli kalemi yok', 'Delivered without a rental charge'), rule: L('Her teslimde tam bir kiralama bedeli kalemi doğar.', 'Every handover posts exactly one rental charge.'), failing: noCharge.map((r) => link(r, r.status)) },
    { key: 'dup', label: L('Birden fazla kiralama bedeli kalemi', 'More than one rental charge'), rule: L('Aynı anahtarla ikinci kalem açılmaz (tek seferlik).', 'A second charge with the same key is never created (idempotent).'), failing: dupBase.map((r) => link(r, L('mükerrer kalem', 'duplicate charge'))) },
    { key: 'over', label: L('Fazla ödenmiş kiralama', 'Overpaid rentals'), rule: L('Kalemden fazla uygulanan tutar iade adayıdır; negatif bakiye olarak gizlenmez.', 'Applied above the charge is a refund candidate; never hidden as a negative balance.'), failing: over.map((r) => link(r, fmt(fin(r.id).overpaidMinor, fin(r.id).cur))) },
    { key: 'unapplied', label: L('Uygulanmamış ödeme', 'Unapplied payments'), rule: L('Kaydedilen ödeme kalemlere uygulanana kadar borcu düşürmez.', 'A recorded payment does not reduce the balance until applied.'), failing: unapplied.map((r) => link(r, fmt(fin(r.id).unappliedMinor, fin(r.id).cur))) },
    { key: 'closedopen', label: L('Operasyonel kapalı, finans açık', 'Operationally closed, finance open'), rule: L('Operasyonel kapanış finansal kapanış değildir; bakiye, depozito ve onaylar çözülmelidir.', 'Operational closure is not financial closure; balance, deposit and approvals must be resolved.'), failing: closedOpen.map((r) => link(r, `${fmt(fin(r.id).outstandingMinor, fin(r.id).cur)} ${L('kalan', 'outstanding')}`)) },
    { key: 'cashmissing', label: L('Nakit ödemenin kasa hareketi yok', 'Cash payment without a drawer movement'), rule: L('Her nakit ödeme, o para birimindeki açık kasaya bir giriş yazar.', 'Every cash payment posts one inflow to the open drawer of that currency.'), failing: cashMissing.map((p) => ({ type: 'payment' as const, id: p.id, text: `${p.no} · ${fmt(p.tender.minor, p.tender.cur)}` })) },
    { key: 'noncash', label: L('Nakit olmayan ödemenin kasaya yazılması', 'Non-cash payment posted to a drawer'), rule: L('Kart ve havale hiçbir zaman nakit kasasına girmez.', 'Card and bank transfer never enter a cash drawer.'), failing: nonCashInDrawer.map((m) => ({ type: 'payment' as const, id: m.sourceId!, text: m.reason })) },
    { key: 'dep', label: L('Depozito gelir sayılıyor mu', 'Deposit counted as revenue'), rule: L('Depozito yalnız bakiyeye mahsup edilirse kalemi kapatır; tutulan depozito gelir değildir.', 'A deposit closes a charge only when applied to the balance; a held deposit is not revenue.'), failing: depAsRevenue.map((p) => ({ type: 'payment' as const, id: p.id, text: p.no })) },
    { key: 'voided', label: L('İptal edilmiş kaleme uygulanmış ödeme', 'Payment applied to a voided charge'), rule: L('Ödeme uygulanmış kalem iptal edilmeden önce ödeme ters kaydedilmelidir.', 'A payment must be reversed before its charge can be voided.'), failing: voidedApplied.map((c) => ({ type: 'rental' as const, id: c.rentalId, text: c.no })) },
  ]
}

export function RevenuePage() {
  const d = useDb()
  const { active } = useBranchScope()
  const sum = financeSummary(d, active)
  const checks = checksOf(d, active)
  const bad = checks.filter((c) => c.failing.length)
  const curs = [...new Set(d.charges.filter((c) => c.status === 'posted').map((c) => c.cur))].sort() as Cur[]
  const [cur, setCur] = useUrlState('para', curs[0] ?? d.settings.company.baseCurrency)
  const tz = d.settings.company.tz
  const months = Array.from({ length: 6 }, (_, i) => {
    const base = new Date(d.clock.now)
    const t = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - (5 - i), 1))
    return t.toISOString().slice(0, 7)
  })
  const monthOf = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date(iso))
  const charged = months.map((m) => d.charges.filter((c) => c.status === 'posted' && c.cur === cur && c.postedAt && monthOf(c.postedAt) === m && active.some((b) => d.rentals.find((r) => r.id === c.rentalId)?.pickupBranchId === b)).reduce((a, c) => a + c.amountMinor, 0))
  const collected = months.map((m) => d.payments.filter((p) => p.status === 'applied' && p.obligationCur === cur && monthOf(p.recordedAt) === m && active.includes(p.branchId)).reduce((a, p) => a + p.allocations.reduce((x, y) => x + y.minor, 0), 0))
  return (
    <Page
      title={L('Gelir Kontrolü', 'Revenue Control')}
      description={L('Kayıtlar arası mutabakat kontrolleri: hesap kalemi, ödeme, depozito ve kasa birbirini tutmalı. Her kontrol, başarısız olan kayıtları adıyla listeler. Toplamlar para birimi başınadır.', 'Reconciliation checks between records: charges, payments, deposits and cash must agree. Each check lists the failing records by name. Totals are per currency.')}
    >
      <Kpis items={[{ label: L('Hesaplanan', 'Charged'), value: byCurText(sum.charged, fmt) }, { label: L('Tahsil edilen', 'Collected'), value: byCurText(sum.collected, fmt) }, { label: L('Açık bakiye', 'Outstanding'), value: byCurText(sum.outstanding, fmt), tone: 'hold' }, { label: L('Başarısız kontrol', 'Failing checks'), value: `${bad.length} / ${checks.length}`, tone: bad.length ? 'alert' : 'ok' }]} />
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{L('Aylık hesaplanan ve tahsil edilen', 'Monthly charged and collected')}</h2>
        <div className="w-28"><SelectF id="rv-c" label={L('Para birimi', 'Currency')} value={cur} onChange={setCur} options={(curs.length ? curs : [cur]).map((c) => ({ id: c, label: c }))} /></div>
      </div>
      <ChartCard
        title={`${L('Hesaplanan ve tahsil edilen', 'Charged and collected')} (${cur})`}
        description={L('Aylara göre; para birimleri karıştırılmaz.', 'By month; currencies are not mixed.')}
        source={L('Kaynak: hesap kalemleri ve uygulanmış ödemeler', 'Source: posted charges and applied payments')}
        chart={<BarsV cols={months.map((m, i) => ({ label: m.slice(2), values: [charged[i]!, collected[i]!] }))} series={[{ name: L('Hesaplanan', 'Charged'), color: SERIES[0]! }, { name: L('Tahsil edilen', 'Collected'), color: SERIES[2]! }]} format={(n) => fmt(n, cur)} />}
        head={[L('Ay', 'Month'), L('Hesaplanan', 'Charged'), L('Tahsil edilen', 'Collected')]}
        rows={months.map((m, i) => [m, fmt(charged[i]!, cur), fmt(collected[i]!, cur)])}
      />
      <Panel title={L('Mutabakat kontrolleri', 'Reconciliation checks')} flush>
        <ul className="divide-y divide-line-soft">
          {checks.map((c) => (
            <li key={c.key} className="px-4 py-3 sm:px-5">
              <div className="flex items-start gap-3">
                {c.failing.length === 0 ? <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" /> : <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-alert" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{c.label} <span className={`ml-1 text-[12px] font-medium ${c.failing.length ? 'text-alert' : 'text-ok'}`}>{c.failing.length ? `${c.failing.length} ${L('kayıt', 'record(s)')}` : L('Geçti', 'Passed')}</span></p>
                  <p className="text-[12.5px] text-ink-2">{c.rule}</p>
                  {c.failing.length > 0 && <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">{c.failing.slice(0, 8).map((f) => <li key={f.id + f.text}><Link to={entityHref(f.type, f.id) as never} className="text-blue hover:underline">{f.text}</Link></li>)}{c.failing.length > 8 && <li className="text-ink-2">+{c.failing.length - 8}</li>}</ul>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  )
}
