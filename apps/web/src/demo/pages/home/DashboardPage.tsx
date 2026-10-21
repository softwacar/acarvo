import { ArrowRight, CaretRight, CheckCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Plate } from '@/components/Plate'
import { cn } from '@/lib/utils'
import { BUCKET_ORDER, type Bucket } from '../../core/calc/availability'
import { fmt } from '../../core/money'
import { inboxOf, REASON_LABEL } from '../../core/inbox'
import { canSeeTask, isOpenTask } from '../../core/ops/tasks'
import { activeRentals, fleetBuckets, financeSummary, overdueReturns, reservationsBy, todayPickups, todayReturns, type DayItem } from '../../core/metrics'
import { dayOf, addDaysYmd, startOfDay } from '../../core/time'
import { L } from '../../i18n'
import { useAlerts, useBranchScope, useCan, useDb, useFmt, entityHref } from '../../ui/hooks'
import { BranchTag, Empty, Kpis, Notice, Page, Panel } from '../../ui/kit'
import { statusOf } from '../../ui/status'

const BUCKET_COLOR: Record<Bucket, string> = { available: 'bg-ok', reserved: 'bg-blue', rented: 'bg-ink', maintenance: 'bg-hold', transfer: 'bg-ink-3', unavailable: 'bg-alert' }

export function ItemRows({ items, showTime = true, empty }: { items: DayItem[]; showTime?: boolean; empty: string }) {
  const d = useDb()
  const f = useFmt()
  if (!items.length) return <p className="px-4 py-5 text-[13px] text-ink-2 sm:px-5">{empty}</p>
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((i) => {
        const v = d.vehicles.find((x) => x.id === i.vehicleId)
        const c = d.customers.find((x) => x.id === i.customerId)
        const b = d.branches.find((x) => x.id === i.branchId)
        return (
          <li key={`${i.kind}-${i.id}`}>
            <Link to={entityHref(i.kind, i.id) as never} className="group grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-ground/60 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:px-5">
              <span className="tnum text-[13px] font-medium">{showTime ? f.time(i.at, i.branchId) : f.date(i.at, i.branchId)}</span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {v ? <Plate plate={v.plate} /> : <span className="text-[12.5px] font-medium text-hold">{L('Araç atanmadı', 'No vehicle assigned')}</span>}
                  <span className="truncate text-[13px]">{c?.name}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                  <span className="tnum">{i.no}</span> · {i.note} · {b?.code}
                </span>
              </span>
              <CaretRight size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function DashboardPage() {
  const d = useDb()
  const can = useCan()
  const f = useFmt()
  const { active } = useBranchScope()
  const alerts = useAlerts()
  const inbox = useMemo(() => inboxOf(d), [d])

  const fleet = useMemo(() => fleetBuckets(d, active), [d, active])
  const pickups = useMemo(() => todayPickups(d, active), [d, active])
  const returns = useMemo(() => todayReturns(d, active), [d, active])
  const overdue = useMemo(() => overdueReturns(d, active), [d, active])
  const rentalsOut = useMemo(() => activeRentals(d, active), [d, active])
  const pending = reservationsBy(d, active, 'pending').length
  const confirmed = d.reservations.filter((r) => r.status === 'confirmed' && Date.parse(r.pickupAt) >= Date.parse(d.clock.now) && active.includes(r.pickupBranchId)).length
  const waitingApprovals = can('approvals:view') ? d.approvals.filter((a) => a.status === 'requested' || a.status === 'approved').length : 0
  const openTasks = d.tasks.filter((t) => isOpenTask(t) && canSeeTask(d, t) && (!t.branchId || active.includes(t.branchId))).length
  const tz = d.settings.company.tz
  const today = dayOf(d.clock.now, tz)

  const upcoming = useMemo(() => {
    const from = Date.parse(startOfDay(addDaysYmd(today, 1), tz))
    const to = Date.parse(startOfDay(addDaysYmd(today, 4), tz))
    const items: (DayItem & { label: string })[] = []
    for (const r of d.reservations) if (r.status === 'confirmed' && active.includes(r.pickupBranchId) && Date.parse(r.pickupAt) >= from && Date.parse(r.pickupAt) < to) items.push({ kind: 'reservation', id: r.id, no: r.no, at: r.pickupAt, branchId: r.pickupBranchId, vehicleId: r.vehicleId, customerId: r.customerId, classId: r.classId, note: L('Teslim', 'Pickup'), label: '' })
    for (const r of d.rentals) {
      if (r.status === 'delivered' && active.includes(r.returnBranchId) && Date.parse(r.plannedReturnAt) >= from && Date.parse(r.plannedReturnAt) < to) items.push({ kind: 'rental', id: r.id, no: r.no, at: r.plannedReturnAt, branchId: r.returnBranchId, vehicleId: r.vehicleId, customerId: r.customerId, classId: r.classId, note: L('İade', 'Return'), label: '' })
    }
    return items.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 8)
  }, [d, active, today, tz])

  const mineTop = inbox.mine.slice(0, 6)
  const warnings = alerts.filter((a) => a.severity !== 'critical').length
  const showFinance = can('finance:view') && can('reports:finance')
  const sum = useMemo(() => financeSummary(d, active), [d, active])
  const curs = useMemo(() => [...new Set([...Object.keys(sum.charged), ...Object.keys(sum.collected), ...Object.keys(sum.outstanding)])].sort(), [sum])

  const branchRows = useMemo(
    () =>
      d.branches
        .filter((b) => active.includes(b.id))
        .map((b) => {
          const fb = fleetBuckets(d, [b.id])
          return { b, total: fb.total, free: fb.buckets.available, rented: fb.buckets.rented, blocked: fb.buckets.maintenance + fb.buckets.unavailable, pick: todayPickups(d, [b.id]).length, ret: todayReturns(d, [b.id]).length, late: overdueReturns(d, [b.id]).length }
        }),
    [d, active],
  )

  const dateText = new Intl.DateTimeFormat(L('tr-TR', 'en-GB'), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d.clock.now))

  return (
    <Page
      title={L('Ana Ekran', 'Home')}
      description={
        <>
          {dateText} · <span className="tnum">{f.time(d.clock.now)}</span> · {L('demo zamanı', 'demo time')}
        </>
      }
    >
      <Kpis
        items={[
          { label: L('Bugün teslim', 'Pickups today'), value: pickups.length, hint: L('Onaylı rezervasyon + hazır kiralama', 'Confirmed reservations + prepared rentals'), to: '/kiralamalar?durum=prepared' },
          { label: L('Bugün iade', 'Returns today'), value: returns.length, hint: L('Müşterideki araçlar', 'Vehicles with customers'), to: '/kiralamalar?durum=delivered' },
          { label: L('Aktif kiralama', 'Active rentals'), value: rentalsOut.length, hint: L('Araç müşteride', 'Vehicle out'), to: '/kiralamalar?durum=delivered' },
          { label: L('Geciken iade', 'Overdue returns'), value: overdue.length, hint: L('Planlanan iade geçti', 'Planned return passed'), to: '/kiralamalar?gecikme=1', tone: overdue.length ? 'alert' : undefined },
          { label: L('Müsait (şimdi)', 'Available (now)'), value: fleet.buckets.available, hint: L(`${fleet.total} araçtan`, `of ${fleet.total} vehicles`), to: '/araclar?durum=available', tone: 'ok' },
          { label: L('Bekleyen rezervasyon', 'Pending reservations'), value: pending, hint: L(`${confirmed} onaylı yaklaşan`, `${confirmed} confirmed upcoming`), to: '/rezervasyonlar?durum=pending', tone: pending ? 'hold' : undefined },
          { label: L('Bana düşen işler', 'My work'), value: inbox.counts.mine, hint: L(inbox.counts.tasks + ' görev · ' + inbox.counts.approvals + ' onay', inbox.counts.tasks + ' tasks · ' + inbox.counts.approvals + ' approvals'), to: '/islerim', tone: inbox.counts.mine ? 'hold' : undefined },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {overdue.length > 0 && (
            <Panel title={L('Gecikenler', 'Overdue')} description={L('Araç hâlâ müşteride; kayıt açılınca aynı bilgiyi Kiralama 360° gösterir.', 'The vehicle is still with the customer; Rental 360° shows the same facts.')} flush>
              <ul className="divide-y divide-line-soft">
                {overdue.map((r) => {
                  const v = d.vehicles.find((x) => x.id === r.vehicleId)!
                  const c = d.customers.find((x) => x.id === r.customerId)
                  const h = Math.floor((Date.parse(d.clock.now) - Date.parse(r.plannedReturnAt)) / 3_600_000)
                  return (
                    <li key={r.id}>
                      <Link to={entityHref('rental', r.id) as never} className="group grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-ground/60 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:px-5">
                        <span className="tnum text-[13px] font-medium">{f.date(r.plannedReturnAt, r.returnBranchId)}</span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Plate plate={v.plate} />
                            <span className="truncate text-[13px]">{c?.name}</span>
                          </span>
                          <span className="tnum mt-0.5 block truncate text-[12.5px] text-ink-2">{r.no} · {L('iade planı', 'planned return')} {f.time(r.plannedReturnAt, r.returnBranchId)}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tnum rounded-md bg-alert-soft px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap text-alert">{h < 48 ? `${h} ${L('sa', 'h')}` : `${Math.floor(h / 24)} ${L('gün', 'd')}`}</span>
                          <CaretRight size={14} className="text-ink-3" />
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          )}
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title={L('Bugün teslim', 'Pickups today')} action={<span className="tnum rounded-md bg-ground px-1.5 text-[12px] text-ink-2">{pickups.length}</span>} flush>
              <ItemRows items={pickups} empty={L('Bugün için teslim yok.', 'No pickups today.')} />
            </Panel>
            <Panel title={L('Bugün iade', 'Returns today')} action={<span className="tnum rounded-md bg-ground px-1.5 text-[12px] text-ink-2">{returns.length}</span>} flush>
              <ItemRows items={returns} empty={L('Bugün için iade yok.', 'No returns today.')} />
            </Panel>
          </div>
          <Panel title={L('Önümüzdeki üç gün', 'Next three days')} description={L('Teslim ve iade tarihleri, şubenin yerel saatiyle.', "Pickups and returns in the branch's local time.")} flush>
            <ItemRows items={upcoming} showTime={false} empty={L('Önümüzdeki üç gün için teslim veya iade yok.', 'No pickups or returns in the next three days.')} />
          </Panel>
          <Panel title={L('Bana düşen işler', 'My work')} description={L('İşlerim ile aynı kaynak; her satır kendi kaydına gider.', 'Same source as My Work; each row opens its own record.')} action={<Link to={'/islerim' as never} className="inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline">{L('İşlerim', 'My Work')} <ArrowRight size={13} /></Link>} flush>
            {mineTop.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-ink-2 sm:px-5">
                <CheckCircle size={16} className="text-ok" /> {L('Şu an size düşen iş yok.', 'Nothing needs you right now.')}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {mineTop.map((i) => (
                  <li key={i.key}>
                    <Link to={entityHref(i.link.type, i.link.id) as never} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-ground/60 sm:px-5">
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.severity === 'critical' ? 'bg-alert' : i.severity === 'warning' ? 'bg-hold' : 'bg-blue')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium">{i.title}</span>
                        <span className="block truncate text-[12.5px] text-ink-2">{REASON_LABEL[i.reason]()} · {i.detail}</span>
                      </span>
                      <CaretRight size={14} className="mt-1 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {warnings > 0 && (
              <p className="border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-2 sm:px-5">
                {L(`${warnings} uyarı daha var: `, `${warnings} more warning(s): `)}
                <Link to={'/islerim?sekme=uyarilar' as never} className="font-medium text-blue hover:underline">{L('İşlerim → Uyarılar', 'My Work → Alerts')}</Link>
              </p>
            )}
          </Panel>
        </div>
        <div className="min-w-0 space-y-5">
          <Panel title={L('Filo durumu · şimdi', 'Fleet · now')} description={L(`${fleet.total} araç`, `${fleet.total} vehicles`)} action={<Link to={'/araclar' as never} className="inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline">{L('Araçlar', 'Vehicles')} <ArrowRight size={13} /></Link>} flush>
            <div className="px-4 pt-4 sm:px-5">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={BUCKET_ORDER.map((b) => `${statusOf('bucket', b).label} ${fleet.buckets[b]}`).join(', ')}>
                {BUCKET_ORDER.filter((b) => fleet.buckets[b]).map((b) => (
                  <span key={b} className={cn('h-full border-r-2 border-surface last:border-r-0', BUCKET_COLOR[b])} style={{ width: `${(fleet.buckets[b] / Math.max(1, fleet.total)) * 100}%` }} />
                ))}
              </div>
            </div>
            <ul className="mt-2 divide-y divide-line-soft">
              {BUCKET_ORDER.map((b) => (
                <li key={b}>
                  <Link to={`/araclar?durum=${b}` as never} className="flex items-center gap-3 px-4 py-2 hover:bg-ground/50 sm:px-5">
                    <span className={cn('size-2.5 shrink-0 rounded-full', BUCKET_COLOR[b])} aria-hidden />
                    <span className="flex-1 text-[13px]">{statusOf('bucket', b).label}</span>
                    <span className="tnum text-[14px] font-semibold">{fleet.buckets[b]}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-3 sm:px-5">{L('Şu anki uygunluk; rezervasyon, kiralama, bakım, hasar ve transfer ile aynı kuraldan gelir. İleri tarih uygunluğu Takvim’dedir. Hazırlık ayrı bir durumdur.', 'Availability right now, from the same rule as reservations, rentals, maintenance, damage and transfers. Future availability is in the Calendar. Readiness is a separate state.')}</p>
          </Panel>

          <Panel title={L('Bakım, hasar, transfer', 'Maintenance, damage, transfers')} flush>
            <ul className="divide-y divide-line-soft text-[13px]">
              {[
                { l: L('Bakımda', 'In service'), v: d.maintenance.filter((m) => m.status === 'in_progress').length, to: '/bakim-servis?durum=in_progress', show: can('maintenance:view') },
                { l: L('Planlı bakım', 'Planned service'), v: d.maintenance.filter((m) => m.status === 'planned').length, to: '/bakim-servis?durum=planned', show: can('maintenance:view') },
                { l: L('Hasar engelli araç', 'Vehicles blocked by damage'), v: d.damages.filter((x) => x.blocksVehicle && x.status !== 'closed').length, to: '/hasar-ve-olaylar', tone: 'alert', show: can('damages:view') },
                { l: L('Açık hasar dosyası', 'Open damage files'), v: d.damages.filter((x) => x.status !== 'closed').length, to: '/hasar-ve-olaylar', show: can('damages:view') },
                { l: L('Yolda (transfer)', 'In transit'), v: d.transfers.filter((t) => t.status === 'in_transit').length, to: '/araclar?durum=transfer', show: can('vehicles:view') },
                { l: L('Onay bekleyen', 'Awaiting approval'), v: waitingApprovals, to: '/onay-merkezi', tone: waitingApprovals ? 'hold' : undefined, show: can('approvals:view') },
                { l: L('Açık görev', 'Open tasks'), v: openTasks, to: '/gorevler?gorunum=ekip', show: can('tasks:view') },
              ].filter((r) => r.show).map((r) => (
                <li key={r.l}>
                  <Link to={r.to as never} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ground/60 sm:px-5">
                    <span className="min-w-0 flex-1">{r.l}</span>
                    <span className={cn('tnum font-semibold', r.v && r.tone === 'alert' ? 'text-alert' : r.v && r.tone === 'hold' ? 'text-hold' : '')}>{r.v}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {branchRows.length > 1 && (
        <Panel title={L('Şubeler', 'Branches')} description={L('Araç sayıları ana şubeye, teslim/iade sayıları kaydın şubesine göredir.', 'Vehicle counts follow the home branch; pickups and returns follow the record branch.')} flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">{L('Şube', 'Branch')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Araç', 'Vehicles')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Müsait', 'Available')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Kirada', 'Rented')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Bakım / engel', 'Service / blocked')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Teslim', 'Pickups')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('İade', 'Returns')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">{L('Geciken', 'Overdue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {branchRows.map((r) => (
                  <tr key={r.b.id} className="h-11">
                    <th scope="row" className="px-4 text-left font-normal sm:px-5">
                      <BranchTag code={r.b.code} /> <span className="ml-1">{r.b.name}</span>
                    </th>
                    <td className="tnum px-3 text-right">{r.total}</td>
                    <td className="tnum px-3 text-right text-ok">{r.free}</td>
                    <td className="tnum px-3 text-right">{r.rented}</td>
                    <td className="tnum px-3 text-right">{r.blocked}</td>
                    <td className="tnum px-3 text-right">{r.pick}</td>
                    <td className="tnum px-3 text-right">{r.ret}</td>
                    <td className={cn('tnum px-4 text-right font-medium sm:px-5', r.late ? 'text-alert' : 'text-ink-3')}>{r.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {showFinance && (
        <Panel
          title={L('Finans · para birimine göre', 'Finance · by currency')}
          description={L('Para birimleri birbirine çevrilmez ve toplanmaz. İç işlem kayıtlarıdır; resmî muhasebe raporu değildir.', 'Currencies are never converted or added. Internal records, not an official accounting report.')}
          action={<Link to={'/finans' as never} className="inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline">{L('Finans', 'Finance')} <ArrowRight size={13} /></Link>}
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                  <th scope="col" className="px-4 py-2 font-medium sm:px-5">{L('Para birimi', 'Currency')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Kayıtlı hesap kalemi', 'Posted charges')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Uygulanan tahsilat', 'Applied collections')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{L('Açık bakiye', 'Outstanding')}</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">{L('Tutulan depozito', 'Deposits held')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {curs.map((c) => (
                  <tr key={c} className="h-11">
                    <th scope="row" className="px-4 text-left font-semibold sm:px-5">{c}</th>
                    <td className="tnum px-3 text-right">{fmt(sum.charged[c] ?? 0, c)}</td>
                    <td className="tnum px-3 text-right text-ok">{fmt(sum.collected[c] ?? 0, c)}</td>
                    <td className={cn('tnum px-3 text-right', (sum.outstanding[c] ?? 0) > 0 && 'text-hold')}>{fmt(sum.outstanding[c] ?? 0, c)}</td>
                    <td className="tnum px-4 text-right sm:px-5">{fmt(sum.depositsHeld[c] ?? 0, c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-3 sm:px-5">{L('Teklif gelir sayılmaz; depozito tahsilat veya gelir değildir; “uygulanan” yalnız hesap kalemlerine mahsup edilmiş tutarlardır.', 'A quote is not revenue; a deposit is neither collection nor revenue; "applied" counts only amounts allocated to charges.')}</p>
        </Panel>
      )}
      {!d.settings.setup.done && can('settings:view') && (
        <Notice tone="hold" action={<Link to={'/kurulum' as never} className="inline-flex h-9 items-center rounded-lg bg-blue px-3 text-[13px] font-medium text-white hover:bg-blue-ink">{L('Kurulumu sürdür', 'Continue the setup')}</Link>}>
          {L('Kurulum tamamlanmadı. Sihirbaz şirket, şube, kullanıcı, fiyat ve politika adımlarını ve hazırlık kontrolünü içerir.', 'The setup is not finished. The wizard covers company, branches, users, prices and policies, and the readiness check.')}
        </Notice>
      )}
      {!showFinance && <Notice tone="blue">{L('Finans göstergeleri bu demo rolünde görünmez (yetki: Finans raporları). Rol menüsünden Sahip veya Muhasebe ile deneyin.', 'Finance figures are hidden for this demo role (permission: finance reports). Try Owner or Accounting from the role menu.')}</Notice>}
      {pending + overdue.length + pickups.length + returns.length === 0 && <Empty title={L('Bugün sakin', 'Quiet day')} />}
    </Page>
  )
}
