import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { computeCashExpected } from '../../core/calc/finance'
import { userName } from '../../core/helpers'
import { fmt } from '../../core/money'
import { overdueReturns } from '../../core/metrics'
import { dayOf } from '../../core/time'
import type { Cur, Id } from '../../core/types'
import { L } from '../../i18n'
import { branchOptions, DateF } from '../../ui/forms'
import { useBranchScope, useDb, useFmt, useUrlState } from '../../ui/hooks'
import { Empty, FilterBar, FilterSelect, Kpis, Panel } from '../../ui/kit'
import { METHOD_LABEL } from '../../ui/status'
import { PrintButton } from '../shared/ContractSheet'

// End of day (decision document L.6): what was collected, refunded and spent that day, how each drawer closed (expected, counted,
// variance and its reason) and what is still open. Per currency, never mixed. It is a view over the same records as the screens.

const add = (rec: Record<Cur, number>, cur: Cur, minor: number) => {
  rec[cur] = (rec[cur] ?? 0) + minor
}
const sumText = (rec: Record<Cur, number>) => (Object.keys(rec).length ? Object.entries(rec).map(([c, v]) => fmt(v, c)).join(' · ') : '—')

export function EndOfDay() {
  const d = useDb()
  const f = useFmt()
  const { active } = useBranchScope()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const [date, setDate] = useUrlState('tarih', today)
  const [branch, setBranch] = useUrlState('sube', 'all')
  const branches: Id[] = branch === 'all' ? active : [branch]
  const sameDay = (iso: string | undefined, branchId?: Id) => !!iso && dayOf(iso, f.zone(branchId)) === date

  const pays = d.payments.filter((p) => branches.includes(p.branchId) && p.status !== 'voided' && sameDay(p.recordedAt, p.branchId))
  const byMethod: Record<string, Record<Cur, number>> = {}
  const collected: Record<Cur, number> = {}
  for (const p of pays) {
    add((byMethod[p.method] ??= {}), p.tender.cur, p.tender.minor)
    add(collected, p.tender.cur, p.tender.minor)
  }
  const refunds = d.refunds.filter((r) => r.status === 'completed' && sameDay(r.completedAt) && (!r.drawerId || branches.includes(d.drawers.find((x) => x.id === r.drawerId)?.branchId ?? '')))
  const refunded: Record<Cur, number> = {}
  for (const r of refunds) add(refunded, r.amount.cur, r.amount.minor)
  const exps = d.expenses.filter((e) => e.status === 'posted' && branches.includes(e.branchId) && e.date === date)
  const spent: Record<Cur, number> = {}
  for (const e of exps) add(spent, e.amount.cur, e.amount.minor)

  const drawers = d.drawers.filter((x) => branches.includes(x.branchId))
  const sessions = d.cashSessions.filter((s) => drawers.some((x) => x.id === s.drawerId) && (sameDay(s.openedAt, d.drawers.find((x) => x.id === s.drawerId)?.branchId) || sameDay(s.closedAt, d.drawers.find((x) => x.id === s.drawerId)?.branchId)))

  const unverified = d.payments.filter((p) => branches.includes(p.branchId) && p.status === 'recorded' && !p.verifiedAt)
  const unverifiedDeposits = d.deposits.filter((x) => x.state === 'held' && !x.verifiedAt && branches.includes(d.rentals.find((r) => r.id === x.rentalId)?.pickupBranchId ?? ''))
  const openDrawers = drawers.filter((x) => x.status === 'open')
  const pendingApprovals = d.approvals.filter((a) => a.status === 'requested' || a.status === 'approved')
  const late = overdueReturns(d, branches)
  const checks = [
    { key: 'drawers', ok: openDrawers.length === 0, text: openDrawers.length === 0 ? L('Açık kasa oturumu yok.', 'No open drawer session.') : L(`${openDrawers.length} kasa hâlâ açık: sayıp kapatın.`, `${openDrawers.length} drawer(s) still open: count and close them.`), to: '/sube-kasalari' },
    { key: 'verify', ok: unverified.length + unverifiedDeposits.length === 0, text: unverified.length + unverifiedDeposits.length === 0 ? L('Doğrulama bekleyen tahsilat/depozito yok.', 'No payment or deposit awaits verification.') : L(`${unverified.length} ödeme ve ${unverifiedDeposits.length} depozito doğrulama bekliyor.`, `${unverified.length} payment(s) and ${unverifiedDeposits.length} deposit(s) await verification.`), to: '/finans?sekme=dikkat' },
    { key: 'approvals', ok: pendingApprovals.length === 0, text: pendingApprovals.length === 0 ? L('Açık onay talebi yok.', 'No open approval request.') : L(`${pendingApprovals.length} onay talebi açık.`, `${pendingApprovals.length} approval request(s) open.`), to: '/onay-merkezi' },
    { key: 'late', ok: late.length === 0, text: late.length === 0 ? L('Geciken iade yok.', 'No overdue returns.') : L(`${late.length} geciken iade.`, `${late.length} overdue return(s).`), to: '/kiralamalar?gecikme=1' },
  ]

  return (
    <div className="space-y-5" data-testid="end-of-day">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar onReset={() => { setDate(today); setBranch('all') }} active={date !== today || branch !== 'all'}>
          <DateF id="eod-d" label={L('Gün', 'Day')} value={date} onChange={setDate} />
          <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
        </FilterBar>
        <PrintButton label={L('Yazdır', 'Print')} />
      </div>
      <div className="contract-print space-y-5">
        <Kpis
          items={[
            { label: L('Tahsil kaydı', 'Recorded collections'), value: sumText(collected), hint: `${pays.length} ${L('satır; doğrulama ayrı', 'line(s); verification is separate')}` },
            { label: L('İade', 'Refunds'), value: sumText(refunded), hint: L('Gider değildir', 'Not an expense') },
            { label: L('Masraf', 'Expenses'), value: sumText(spent) },
            { label: L('Kasa oturumu', 'Drawer sessions'), value: sessions.length },
          ]}
        />
        <Panel title={L('Tahsilat (yönteme göre, para biriminde)', 'Collections (by method, per currency)')} flush>
          {Object.keys(byMethod).length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-2 sm:px-5">{L('Bu gün tahsilat kaydı yok.', 'No collection was recorded that day.')}</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {Object.entries(byMethod).map(([m, rec]) => (
                <li key={m} className="flex justify-between gap-3 px-4 py-2.5 text-[13.5px] sm:px-5"><span>{METHOD_LABEL()[m as keyof ReturnType<typeof METHOD_LABEL>] ?? m}</span><span className="tnum font-medium">{sumText(rec)}</span></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={L('Kasa oturumları', 'Drawer sessions')} flush>
          {sessions.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-2 sm:px-5">{L('Bu gün kasa oturumu yok.', 'No drawer session that day.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead><tr className="border-b border-line text-left text-[12px] text-ink-2"><th scope="col" className="px-4 py-2 font-medium sm:px-5">{L('Kasa', 'Drawer')}</th><th scope="col" className="px-2 py-2 text-right font-medium">{L('Beklenen', 'Expected')}</th><th scope="col" className="px-2 py-2 text-right font-medium">{L('Sayılan', 'Counted')}</th><th scope="col" className="px-2 py-2 text-right font-medium">{L('Fark', 'Variance')}</th><th scope="col" className="px-4 py-2 font-medium sm:px-5">{L('Gerekçe', 'Reason')}</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {sessions.map((s) => {
                    const dr = d.drawers.find((x) => x.id === s.drawerId)!
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-2.5 font-medium sm:px-5">{dr.name}<span className="block text-[12px] font-normal text-ink-2">{userName(d, s.openedBy)}</span></td>
                        <td className="tnum px-2 text-right">{fmt(s.closedAt ? s.expectedMinor ?? 0 : computeCashExpected(d, s), dr.currency)}</td>
                        <td className="tnum px-2 text-right">{s.closedAt ? fmt(s.countedMinor ?? 0, dr.currency) : <span className="text-hold">{L('Açık', 'Open')}</span>}</td>
                        <td className={`tnum px-2 text-right ${s.varianceMinor ? 'font-medium text-hold' : ''}`}>{s.closedAt ? fmt(s.varianceMinor ?? 0, dr.currency) : '—'}</td>
                        <td className="px-4 py-2.5 text-[13px] text-ink-2 sm:px-5">{s.varianceReason || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title={L('Gün sonu kontrolü', 'End-of-day check')} description={L('Gün sonunu engelleyen veya takip isteyen açık işler.', 'Open items that block or follow the end of the day.')} flush>
          <ul className="divide-y divide-line-soft">
            {checks.map((c) => (
              <li key={c.key} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px] sm:px-5">
                {c.ok ? <CheckCircle size={17} weight="fill" className="text-ok" /> : <WarningCircle size={17} weight="fill" className="text-hold" />}
                <span className="flex-1">{c.text}</span>
                {!c.ok && <Link to={c.to as never} className="text-[13px] font-medium text-blue hover:underline">{L('Aç', 'Open')}</Link>}
              </li>
            ))}
          </ul>
        </Panel>
        {pays.length + refunds.length + exps.length + sessions.length === 0 && <Empty title={L('Bu gün için hareket yok', 'No activity for this day')} />}
      </div>
    </div>
  )
}
