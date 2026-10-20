import { useMemo } from 'react'
import { rentalFinance } from '../../core/calc/finance'
import { customerDocChecks } from '../../core/calc/policy'
import { COUNTED_VEHICLE, utilisation } from '../../core/metrics'
import { fmt, sumByCur } from '../../core/money'
import { addDaysYmd, dayOf, fmtDateTime, startOfDay } from '../../core/time'
import type { Db, Id } from '../../core/types'
import { L } from '../../i18n'
import { branchOptions } from '../../ui/forms'
import { useBranchScope, useCan, useDb, useUrlState } from '../../ui/hooks'
import { btnSecondary, DemoNote, Embedded, Empty, FilterBar, FilterSelect, Page, Panel, SearchBox } from '../../ui/kit'
import { MAINT_TYPE_LABEL, METHOD_LABEL, statusOf } from '../../ui/status'
import { PrintButton } from '../shared/ContractSheet'
import { GatedView } from '../../ui/gate'
import { FleetAnalysisPage } from './FleetAnalysisPage'

// Reports: eight families built from the same records as every screen. CSV is a real file generated in the browser; the
// print view uses the browser's print dialog. Money is always grouped per currency.

type Cell = string | number
interface Report {
  head: string[]
  rows: Cell[][]
  note?: string
}
interface Params {
  d: Db
  from: string
  to: string
  branches: Id[]
}
interface Family {
  id: string
  /** V1 families are the core reports; V1.5 / V2 families stay in the code and open under the concept preview. */
  scope: 'v1' | 'v15' | 'v2'
  /** A whole screen shown as this report family (Fleet analysis). */
  embed?: 'fleet'
  label: () => string
  desc: () => string
  finance?: boolean
  run: (p: Params) => Report
}

const inRange = (iso: string | undefined, p: Params) => !!iso && iso >= p.from && iso < p.to

const FAMILIES: Family[] = [
  {
    id: 'filo',
    scope: 'v1',
    embed: 'fleet',
    label: () => L('Filo', 'Fleet'),
    desc: () => L('Kiralanma oranı, bakım ve boşta saat, araç başına gelir.', 'Utilisation, maintenance and idle hours, revenue per vehicle.'),
    run: () => ({ head: [], rows: [] }),
  },
  {
    id: 'kiralama',
    scope: 'v1',
    label: () => L('Kiralama özeti', 'Rental summary'),
    desc: () => L('Dönemde teslim planlanan kiralamalar.', 'Rentals planned for pickup in the period.'),
    run: (p) => ({
      head: [L('Kiralama', 'Rental'), L('Müşteri', 'Customer'), L('Araç', 'Vehicle'), L('Teslim', 'Pickup'), L('İade', 'Return'), L('Durum', 'Status'), L('Fiyat', 'Price')],
      rows: p.d.rentals.filter((r) => p.branches.includes(r.pickupBranchId) && inRange(r.plannedPickupAt, p)).sort((a, b) => a.plannedPickupAt.localeCompare(b.plannedPickupAt)).map((r) => [r.no, p.d.customers.find((c) => c.id === r.customerId)?.name ?? '', p.d.vehicles.find((v) => v.id === r.vehicleId)?.plate ?? '', fmtDateTime(r.plannedPickupAt, p.d.settings.company.tz), fmtDateTime(r.plannedReturnAt, p.d.settings.company.tz), statusOf('rental', r.status).label, r.price ? fmt(r.price.grossMinor, r.price.cur) : '—']),
    }),
  },
  {
    id: 'gelir',
    scope: 'v1',
    label: () => L('Gelir (hesaplanan)', 'Revenue (charged)'),
    desc: () => L('Kesilmiş hesap kalemleri, tür ve para birimi başına.', 'Posted charges by kind and currency.'),
    finance: true,
    run: (p) => {
      const rows: Cell[][] = []
      const map = new Map<string, number>()
      for (const c of p.d.charges) {
        const r = p.d.rentals.find((x) => x.id === c.rentalId)
        if (c.status !== 'posted' || !r || !p.branches.includes(r.pickupBranchId) || !inRange(c.postedAt, p)) continue
        map.set(`${c.kind}|${c.cur}`, (map.get(`${c.kind}|${c.cur}`) ?? 0) + c.amountMinor)
      }
      for (const [k, v] of [...map.entries()].sort()) { const [kind, cur] = k.split('|') as [string, string]; rows.push([kind, cur, fmt(v, cur)]) }
      return { head: [L('Kalem türü', 'Charge kind'), L('Para birimi', 'Currency'), L('Tutar', 'Amount')], rows, note: L('Depozito ve iade bu rapora girmez; para birimleri toplanmaz.', 'Deposits and refunds are not included; currencies are not summed.') }
    },
  },
  {
    id: 'tahsilat',
    scope: 'v1',
    label: () => L('Tahsilat ve bakiye', 'Collections and balances'),
    desc: () => L('Yönteme göre uygulanan ödemeler ve açık bakiyeler.', 'Applied payments by method, and open balances.'),
    finance: true,
    run: (p) => {
      const m = METHOD_LABEL()
      const map = new Map<string, number>()
      for (const x of p.d.payments) if (x.status === 'applied' && p.branches.includes(x.branchId) && inRange(x.recordedAt, p)) map.set(`${x.method}|${x.obligationCur}`, (map.get(`${x.method}|${x.obligationCur}`) ?? 0) + x.allocations.reduce((a, y) => a + y.minor, 0))
      const rows: Cell[][] = [...map.entries()].sort().map(([k, v]) => { const [method, cur] = k.split('|') as [keyof typeof m, string]; return [L('Tahsilat', 'Collected'), m[method], cur, fmt(v, cur)] })
      const out = sumByCur(p.d.rentals.filter((r) => p.branches.includes(r.pickupBranchId) && !['prepared', 'cancelled'].includes(r.status)), (r) => ({ minor: rentalFinance(p.d, r.id).outstandingMinor, cur: r.currency }))
      for (const [cur, v] of Object.entries(out)) rows.push([L('Açık bakiye', 'Outstanding'), '—', cur, fmt(v, cur)])
      return { head: [L('Bölüm', 'Section'), L('Yöntem', 'Method'), L('Para birimi', 'Currency'), L('Tutar', 'Amount')], rows }
    },
  },
  {
    id: 'kullanim',
    scope: 'v15',
    label: () => L('Araç kullanımı', 'Vehicle utilisation'),
    desc: () => L('Araç başına kiralanma oranı, km ve süreler.', 'Per-vehicle rented share, km and durations.'),
    run: (p) => ({
      head: [L('Plaka', 'Plate'), L('Araç', 'Vehicle'), L('Kiralanma %', 'Rented %'), L('Kiralama', 'Rentals'), L('Km', 'Km'), L('Bakım saati', 'Maintenance h'), L('Boşta saat', 'Idle h')],
      rows: p.d.vehicles.filter((v) => COUNTED_VEHICLE(p.d, v) && p.branches.includes(v.homeBranchId)).map((v) => { const u = utilisation(p.d, v, p.from, p.to); return [v.plate, `${v.make} ${v.model}`, Math.round(u.rate * 100), u.rentals, u.km, Math.round(u.maintenanceHours), Math.round(u.idleHours)] }),
    }),
  },
  {
    id: 'musteri',
    scope: 'v15',
    label: () => L('Müşteriler', 'Customers'),
    desc: () => L('Kiralama sayısı ve belge durumu.', 'Rental counts and document state.'),
    run: (p) => ({
      head: [L('Müşteri', 'Customer'), L('Ülke', 'Country'), L('Kiralama', 'Rentals'), L('Belge', 'Documents'), L('Kısıt', 'Restrictions')],
      rows: p.d.customers.filter((c) => !c.archived).map((c) => { const chk = customerDocChecks(p.d, c, p.d.clock.now); const st = chk.some((x) => x.state === 'missing') ? 'eksik' : chk.some((x) => x.state === 'expired') ? 'süresi dolmuş' : chk.some((x) => x.state === 'expiring') ? 'yaklaşıyor' : 'geçerli'; return [c.name, c.country, p.d.rentals.filter((r) => r.customerId === c.id && inRange(r.plannedPickupAt, p)).length, st, c.restrictions.length] }).sort((a, b) => Number(b[2]) - Number(a[2])),
    }),
  },
  {
    id: 'bakim',
    scope: 'v15',
    label: () => L('Bakım ve hasar maliyeti', 'Maintenance and damage cost'),
    desc: () => L('Tamamlanan bakım maliyeti ve hasar dosyaları.', 'Completed maintenance cost and damage files.'),
    finance: true,
    run: (p) => {
      const rows: Cell[][] = []
      const map = new Map<string, number>()
      for (const m of p.d.maintenance) { const v = p.d.vehicles.find((x) => x.id === m.vehicleId); if (m.status === 'completed' && m.cost && v && p.branches.includes(v.homeBranchId) && inRange(m.actualEnd ?? m.plannedEnd, p)) map.set(`${m.type}|${m.cost.cur}`, (map.get(`${m.type}|${m.cost.cur}`) ?? 0) + m.cost.minor) }
      for (const [k, v] of [...map.entries()].sort()) { const [t, cur] = k.split('|') as [string, string]; rows.push([L('Bakım', 'Maintenance'), MAINT_TYPE_LABEL()[t as keyof ReturnType<typeof MAINT_TYPE_LABEL>] ?? t, cur, fmt(v, cur)]) }
      const dm = p.d.damages.filter((x) => inRange(x.createdAt, p))
      rows.push([L('Hasar dosyası', 'Damage files'), L('adet', 'count'), '—', dm.length])
      return { head: [L('Bölüm', 'Section'), L('Tür', 'Type'), L('Para birimi', 'Currency'), L('Değer', 'Value')], rows }
    },
  },
  {
    id: 'kasa',
    scope: 'v1',
    label: () => L('Kasa oturumları', 'Cash sessions'),
    desc: () => L('Oturum bazında beklenen, sayılan ve fark.', 'Expected, counted and variance per session.'),
    finance: true,
    run: (p) => ({
      head: [L('Kasa', 'Drawer'), L('Açılış', 'Opened'), L('Beklenen', 'Expected'), L('Sayılan', 'Counted'), L('Fark', 'Variance'), L('Gerekçe', 'Reason')],
      rows: p.d.cashSessions.filter((s) => { const dr = p.d.drawers.find((x) => x.id === s.drawerId); return dr && p.branches.includes(dr.branchId) && inRange(s.openedAt, p) }).map((s) => { const dr = p.d.drawers.find((x) => x.id === s.drawerId)!; return [dr.name, fmtDateTime(s.openedAt, p.d.settings.company.tz), s.closedAt ? fmt(s.expectedMinor ?? 0, dr.currency) : L('açık', 'open'), s.closedAt ? fmt(s.countedMinor ?? 0, dr.currency) : '—', s.closedAt ? fmt(s.varianceMinor ?? 0, dr.currency) : '—', s.varianceReason ?? ''] }),
    }),
  },
  {
    id: 'partner',
    scope: 'v2',
    label: () => L('Partner ve tedarikçi', 'Partners and suppliers'),
    desc: () => L('Komisyon doğan/ödenen ve tedarikçi borçları.', 'Commission earned/paid and supplier payables.'),
    finance: true,
    run: (p) => {
      const paid = new Set(p.d.partnerPayments.flatMap((x) => x.commissionIds))
      const rows: Cell[][] = []
      for (const pt of p.d.partners) {
        const cs = p.d.commissions.filter((c) => c.partnerId === pt.id)
        const earned = sumByCur(cs, (c) => c.amount)
        const unpaid = sumByCur(cs.filter((c) => !paid.has(c.id)), (c) => c.amount)
        for (const cur of Object.keys(earned)) rows.push([pt.name, cur, fmt(earned[cur]!, cur), fmt(unpaid[cur] ?? 0, cur)])
      }
      const pay = sumByCur(p.d.settlements.filter((s) => s.status === 'open'), (s) => s.payable)
      for (const [cur, v] of Object.entries(pay)) rows.push([L('Tedarikçi mutabakatı (açık)', 'Supplier settlements (open)'), cur, '—', fmt(v, cur)])
      return { head: [L('Taraf', 'Party'), L('Para birimi', 'Currency'), L('Doğan', 'Earned'), L('Ödenmemiş', 'Unpaid')], rows, note: L('Doğan komisyon ödenmiş sayılmaz; ödeme kaydıyla kapanır.', 'Earned commission is not paid; it closes with a payment record.') }
    },
  },
]

function toCsv(r: Report): string {
  const esc = (v: Cell) => `"${String(v).replace(/"/g, '""')}"`
  return '﻿' + [r.head, ...r.rows].map((row) => row.map(esc).join(';')).join('\r\n')
}

export function ReportsPage() {
  const d = useDb()
  const can = useCan()
  const { active } = useBranchScope()
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)
  const allowed = FAMILIES.filter((f) => !f.finance || can('reports:finance'))
  const families = allowed.filter((f) => f.scope === 'v1' || d.session.preview)
  const [fam, setFam] = useUrlState('rapor', families[0]!.id)
  const gated = allowed.find((f) => f.id === fam && !families.includes(f))
  const [period, setPeriod] = useUrlState('donem', '30')
  const [branch, setBranch] = useUrlState('sube', 'all')
  const [q, setQ] = useUrlState('q')
  const family = gated ?? families.find((f) => f.id === fam) ?? families[0]!
  const days = Number(period)
  const params: Params = { d, from: startOfDay(addDaysYmd(today, -days + 1), tz), to: startOfDay(addDaysYmd(today, 1), tz), branches: branch === 'all' ? active : [branch] }
  const report = useMemo(() => family.run(params), [d, family.id, period, branch, active.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = report.rows.filter((r) => !q || r.join(' ').toLowerCase().includes(q.toLowerCase()))
  const exportCsv = () => {
    const blob = new Blob([toCsv({ ...report, rows })], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `acarvo-demo-${family.id}-${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const body = family.embed === 'fleet' ? (
    <div className="min-w-0">
      <Embedded>
        <FleetAnalysisPage />
      </Embedded>
    </div>
  ) : (
    <div className="contract-print min-w-0 space-y-4">
    <FilterBar onReset={() => { setPeriod('30'); setBranch('all'); setQ('') }} active={period !== '30' || branch !== 'all' || q !== ''}>
      <FilterSelect label={L('Dönem', 'Period')} value={period} onChange={setPeriod} options={[{ id: '7', label: L('Son 7 gün', 'Last 7 days') }, { id: '30', label: L('Son 30 gün', 'Last 30 days') }, { id: '90', label: L('Son 90 gün', 'Last 90 days') }, { id: '365', label: L('Son 365 gün', 'Last 365 days') }]} />
      <FilterSelect label={L('Şube', 'Branch')} value={branch} onChange={setBranch} options={[{ id: 'all', label: L('Tüm şubeler', 'All branches') }, ...branchOptions(d, active)]} />
      <SearchBox label={L('Rapor içinde ara', 'Search in report')} placeholder={L('Ara…', 'Search…')} value={q} onChange={setQ} />
    </FilterBar>
    <Panel title={family.label()} description={`${L('Dönem', 'Period')}: ${addDaysYmd(today, -days + 1)} → ${today} · ${rows.length} ${L('satır', 'row(s)')}`} flush>
      {rows.length === 0 ? <Empty title={L('Bu dönemde veri yok', 'No data in this period')} /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-[13.5px]">
          <thead><tr className="border-b border-line text-left text-[12px] text-ink-2">{report.head.map((h) => <th key={h} scope="col" className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line-soft">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-4 py-2 ${typeof c === 'number' ? 'tnum text-right' : ''}`}>{c}</td>)}</tr>)}</tbody>
        </table></div>
      )}
    </Panel>
    {report.note && <DemoNote>{report.note}</DemoNote>}
  </div>
  )
  return (
    <Page
      title={L('Raporlar', 'Reports')}
      description={L('Sekiz rapor ailesi, ekranlarla aynı kayıtlardan üretilir. CSV tarayıcıda gerçek bir dosya olarak indirilir; yazdırma tarayıcı yazdırma penceresini kullanır. Finans raporları ayrı yetki ister.', 'Eight report families built from the same records as the screens. CSV is downloaded as a real file in the browser; printing uses the browser print dialog. Finance reports need a separate permission.')}
      actions={
        <>
          {can('reports:export') && <button type="button" className={btnSecondary} onClick={exportCsv}>CSV</button>}
          <PrintButton label={L('Yazdır', 'Print')} />
        </>
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label={L('Rapor aileleri', 'Report families')}>
          <ul className="space-y-1.5">
            {families.map((f) => (
              <li key={f.id}>
                <button type="button" aria-current={f.id === family.id} onClick={() => setFam(f.id)} className={`w-full rounded-lg border px-3 py-2.5 text-left ${f.id === family.id ? 'border-blue bg-blue-soft' : 'border-line bg-surface hover:bg-line-soft'}`}>
                  <span className="block text-[13.5px] font-medium">{f.label()}{f.scope !== 'v1' && <span className="ml-1.5 text-[11.5px] font-semibold text-hold">{f.scope === 'v15' ? 'V1.5' : 'V2'}</span>}</span>
                  <span className="block text-[12px] text-ink-2">{f.desc()}</span>
                </button>
              </li>
            ))}
          </ul>
          {allowed.length < FAMILIES.length && <p className="mt-3 text-[12px] text-ink-3">{L('Bu rolde finans raporları görünmez (rapor-finans yetkisi yok).', 'Finance reports are hidden for this role (no finance-report permission).')}</p>}
          {!d.session.preview && <p className="mt-3 text-[12px] text-ink-3">{L('Gelişmiş raporlar (V1.5 / V2) Demo → Gelişmiş konsept ön izlemesiyle açılır.', 'Advanced reports (V1.5 / V2) open with Demo → Advanced concept preview.')}</p>}
        </nav>
        {gated ? (
          <GatedView scope={gated.scope} title={gated.label()} note={L('Gelişmiş rapor ailesi V1.5 / V2 kapsamındadır; V1’in çekirdek raporları Kiralama, Filo, Finans ve Kasa/Gün sonudur.', 'This advanced report family is in V1.5 / V2; the V1 core reports are Rentals, Fleet, Finance and Cash/End of day.')}>
            {body}
          </GatedView>
        ) : (
          body
        )}
      </div>
    </Page>
  )
}
