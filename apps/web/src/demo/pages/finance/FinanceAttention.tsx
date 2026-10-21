import { CheckCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { advanceLedger, rentalFinance, stageOf } from '../../core/calc/finance'
import { fmt } from '../../core/money'
import type { Cur, Id } from '../../core/types'
import { L } from '../../i18n'
import { entityHref, useBranchScope, useCan, useDb, useFmt } from '../../ui/hooks'
import { Panel, Pill } from '../../ui/kit'
import { RevenueChart } from '../analytics/RevenuePage'
import { IndependencePanel } from '../shared/Independence'
import { VerifyButton } from '../shared/FinanceBits'

// Finance → Attention: the real finance items that need a person (the old "Revenue Control" attention part). Every row opens its
// source, every amount is per currency, and nothing invented: an empty section says so. The system-consistency checks live in
// Settings → Operational readiness.

interface Row {
  key: string
  to?: string
  left: ReactNode
  right?: string
  action?: ReactNode
}
interface Section {
  key: string
  title: string
  hint: string
  rows: Row[]
  sums: Record<Cur, number>
}

const addTo = (rec: Record<Cur, number>, cur: Cur, minor: number) => {
  rec[cur] = (rec[cur] ?? 0) + minor
}
const sumText = (rec: Record<Cur, number>) => Object.entries(rec).filter(([, v]) => v).map(([c, v]) => fmt(v, c)).join(' · ')

export function AttentionTab() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const rentalOf = (id?: Id) => d.rentals.find((r) => r.id === id)
  const mine = d.payments.filter((p) => active.includes(p.branchId))
  const sections: Section[] = []
  const section = (key: string, title: string, hint: string): Section => {
    const s: Section = { key, title, hint, rows: [], sums: {} }
    sections.push(s)
    return s
  }

  const unverified = section('verify', L('Doğrulama bekleyen tahsilat ve kaparo', 'Payments and advances awaiting verification'), L('Kaydı açan kişi doğrulayamaz; ikinci bir yetkili doğrular. Doğrulanana kadar bakiye düşmez.', 'The person who recorded a line cannot verify it; a second authorized person does. The balance does not drop until it is verified.'))
  for (const p of mine.filter((x) => x.status === 'recorded' && stageOf(x) === 'recorded')) {
    addTo(unverified.sums, p.tender.cur, p.tender.minor)
    unverified.rows.push({ key: p.id, to: entityHref(p.rentalId ? 'rental' : 'reservation', (p.rentalId ?? p.reservationId)!), left: <><span className="tnum font-medium">{p.no}</span> · {p.payer.name}<span className="block text-[12.5px] text-ink-2">{f.dt(p.recordedAt, p.branchId)}</span></>, right: fmt(p.tender.minor, p.tender.cur), action: <VerifyButton p={p} /> })
  }
  const unverifiedDep = section('verifyDep', L('Doğrulama bekleyen depozito', 'Deposits awaiting verification'), L('İade veya mahsup için doğrulanmış olmalı.', 'A deposit must be verified before it can be released or offset.'))
  for (const x of d.deposits.filter((dp) => dp.state === 'held' && !dp.verifiedAt && active.includes(rentalOf(dp.rentalId)?.pickupBranchId ?? ''))) {
    addTo(unverifiedDep.sums, x.amount.cur, x.amount.minor)
    unverifiedDep.rows.push({ key: x.id, to: entityHref('rental', x.rentalId), left: <>{rentalOf(x.rentalId)?.no}<span className="block text-[12.5px] text-ink-2">{f.dt(x.heldAt)}</span></>, right: fmt(x.amount.minor, x.amount.cur), action: <VerifyButton dep={x} /> })
  }
  const waiting = section('apply', L('Doğrulandı, hesap kalemi bekliyor', 'Verified, waiting for a charge'), L('Ödeme doğrulandı; ilgili hesap kalemi doğunca uygulanır.', 'The payment is verified; it is applied when the charge arises.'))
  for (const p of mine.filter((x) => x.kind === 'payment' && x.status === 'recorded' && x.verifiedAt)) {
    addTo(waiting.sums, p.tender.cur, p.tender.minor)
    waiting.rows.push({ key: p.id, to: entityHref('rental', p.rentalId!), left: <><span className="tnum font-medium">{p.no}</span> · {rentalOf(p.rentalId)?.no}</>, right: fmt(p.tender.minor, p.tender.cur) })
  }
  const recon = section('recon', L('Mutabakat bekleyen', 'Awaiting reconciliation'), L('Uygulanmış ama kasa sayımı, POS özeti veya ekstreyle eşlenmemiş ödemeler. Mutabakat ayrı bir izdir.', 'Applied payments not yet matched with a drawer count, POS slip or statement. Reconciliation is a separate track.'))
  for (const p of mine.filter((x) => x.status === 'applied' && !x.reconciledAt)) {
    addTo(recon.sums, p.tender.cur, p.tender.minor)
    recon.rows.push({ key: p.id, to: entityHref('rental', p.rentalId ?? ''), left: <><span className="tnum font-medium">{p.no}</span> · {p.payer.name}</>, right: fmt(p.tender.minor, p.tender.cur) })
  }
  const open = section('open', L('İade alındı veya kapandı, bakiye açık', 'Returned or closed with an open balance'), L('Operasyonel kapanış finansal kapanış değildir.', 'Operational closure is not financial closure.'))
  for (const r of d.rentals.filter((x) => (x.status === 'returned' || x.status === 'closed') && x.financeStatus === 'open' && active.includes(x.pickupBranchId))) {
    const fin = rentalFinance(d, r.id)
    if (fin.outstandingMinor <= 0) continue
    addTo(open.sums, fin.cur, fin.outstandingMinor)
    open.rows.push({ key: r.id, to: entityHref('rental', r.id), left: <>{r.no}<span className="block text-[12.5px] text-ink-2">{d.customers.find((c) => c.id === r.customerId)?.name}</span></>, right: fmt(fin.outstandingMinor, fin.cur) })
  }
  const over = section('over', L('Fazla ödenmiş (iade adayı)', 'Overpaid (refund candidates)'), L('Kalemden fazla uygulanan tutar negatif bakiye olarak gizlenmez.', 'An amount applied above the charge is never hidden as a negative balance.'))
  for (const r of d.rentals.filter((x) => active.includes(x.pickupBranchId))) {
    const fin = rentalFinance(d, r.id)
    if (fin.overpaidMinor <= 0) continue
    addTo(over.sums, fin.cur, fin.overpaidMinor)
    over.rows.push({ key: r.id, to: entityHref('rental', r.id), left: r.no, right: fmt(fin.overpaidMinor, fin.cur) })
  }
  const refunds = section('refund', L('Bekleyen iade', 'Pending refunds'), L('İade, ikinci bir yetkili onaylayıp uygulayınca kayda geçer.', 'A refund is recorded when a second authorized person approves and applies it.'))
  for (const x of d.refunds.filter((r) => r.status === 'requested' || r.status === 'approved')) {
    addTo(refunds.sums, x.amount.cur, x.amount.minor)
    refunds.rows.push({ key: x.id, to: x.approvalId ? entityHref('approval', x.approvalId) : undefined, left: <><span className="tnum font-medium">{x.no}</span><span className="block text-[12.5px] text-ink-2">{x.status === 'requested' ? L('Karar bekliyor', 'Awaiting a decision') : L('Onaylandı, uygulanmadı', 'Approved, not applied')}</span></>, right: fmt(x.amount.minor, x.amount.cur) })
  }
  const recv = section('recv', L('Politika bedeli müşteri alacağı', 'Customer receivable from a policy fee'), L('İptal/gelmeme bedeli kaparoyu aştığında fark müşteriden alınacak tutar olarak görünür; tahsilat sayılmaz.', 'When a cancellation / no-show fee exceeds the advance, the difference shows as owed by the customer; it is not a collection.'))
  for (const p of mine.filter((x) => x.kind === 'advance')) {
    const l = advanceLedger(d, p)
    if (l.receivableMinor <= 0) continue
    addTo(recv.sums, l.cur, l.receivableMinor)
    recv.rows.push({ key: p.id, to: entityHref('reservation', p.reservationId ?? ''), left: <><span className="tnum font-medium">{p.no}</span> · {p.payer.name}</>, right: fmt(l.receivableMinor, l.cur) })
  }
  const plans = section('plan', L('Gecikmiş ödeme planı', 'Overdue payment plan lines'), L('Plan satırı tahsilat sayılmaz.', 'A plan line is not a collection.'))
  for (const x of d.paymentPlans.filter((pl) => pl.status !== 'completed' && Date.parse(pl.dueAt) < Date.parse(d.clock.now))) {
    addTo(plans.sums, x.amount.cur, x.amount.minor)
    plans.rows.push({ key: x.id, to: entityHref('rental', x.rentalId), left: <>{x.payerName}<span className="block text-[12.5px] text-ink-2">{L('Vade', 'Due')} {f.date(x.dueAt)}</span></>, right: fmt(x.amount.minor, x.amount.cur) })
  }
  const cash = section('cash', L('Kasa farkı', 'Cash variance'), L('Son kapanışlarda sayılan ile beklenen arasındaki fark.', 'The difference between counted and expected at the last closes.'))
  for (const s of d.cashSessions.filter((x) => x.closedAt && x.varianceMinor)) {
    const dr = d.drawers.find((x) => x.id === s.drawerId)!
    if (!active.includes(dr.branchId)) continue
    addTo(cash.sums, dr.currency, Math.abs(s.varianceMinor!))
    cash.rows.push({ key: s.id, to: '/sube-kasalari', left: <>{dr.name}<span className="block text-[12.5px] text-ink-2">{f.dt(s.closedAt!)}</span></>, right: fmt(s.varianceMinor!, dr.currency) })
  }

  const total = sections.reduce((a, s) => a + s.rows.length, 0)
  return (
    <div className="space-y-5" data-testid="finance-attention">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
        {total === 0 ? <><CheckCircle size={16} className="text-ok" /> {L('Finansta şu an dikkat gerektiren kayıt yok.', 'Nothing in finance needs attention right now.')}</> : <>{L(`${total} kayıt dikkat bekliyor.`, `${total} record(s) need attention.`)}</>}
        {can('cash:view') && <Link to={'/sube-kasalari' as never} className="font-medium text-blue hover:underline">{L('Şube Kasaları', 'Branch Cash Registers')}</Link>}
        {can('approvals:view') && <Link to={'/onay-merkezi' as never} className="font-medium text-blue hover:underline">{L('Onay Merkezi', 'Approval Center')}</Link>}
      </p>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {sections.map((s) => (
          <Panel key={s.key} title={<span className="flex items-center gap-2">{s.title} <Pill tone={s.rows.length ? 'hold' : 'muted'}>{s.rows.length}</Pill></span>} description={sumText(s.sums) ? `${sumText(s.sums)} · ${s.hint}` : s.hint} flush>
            {s.rows.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-2 sm:px-5">{L('Kayıt yok.', 'No records.')}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {s.rows.slice(0, 6).map((r) => (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px] sm:px-5">
                    {r.to ? <Link to={r.to as never} className="min-w-0 hover:underline">{r.left}</Link> : <span className="min-w-0">{r.left}</span>}
                    <span className="flex items-center gap-3">{r.right && <span className="tnum whitespace-nowrap font-medium">{r.right}</span>}{r.action}</span>
                  </li>
                ))}
                {s.rows.length > 6 && <li className="px-4 py-2 text-[12.5px] text-ink-2 sm:px-5">+{s.rows.length - 6}</li>}
              </ul>
            )}
          </Panel>
        ))}
      </div>
      <IndependencePanel />
      <RevenueChart />
      <p className="text-[12.5px] text-ink-2">
        {L('Sistemin kendi tutarlılığını sınayan teknik kontroller (eski Gelir Kontrolü mutabakat kuralları) ', 'The technical checks that test the system’s own consistency (the former Revenue Control reconciliation rules) are in ')}
        <Link to={'/ayarlar?bolum=hazirlik' as never} className="font-medium text-blue hover:underline">{L('Ayarlar → Operasyonel hazırlık', 'Settings → Operational readiness')}</Link>.
      </p>
    </div>
  )
}
