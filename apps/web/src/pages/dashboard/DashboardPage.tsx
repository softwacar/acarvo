import { type DashboardItem, type DashboardResponse, FLEET_BUCKETS, type FleetBucket, formatMoney } from '@acarvo/shared'
import { ArrowClockwise, ArrowRight, CalendarCheck, CaretRight, CheckCircle, Info, Key, ListChecks, Wrench } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Select } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ErrorState, PageHeader } from '@/components/states'
import { dashboardApi } from '@/lib/api'
import { SERVICE_DUE_LABELS } from '@/lib/operation-labels'
import { formatLate } from '@/lib/rental-labels'
import { cn } from '@/lib/utils'
import { formatKm } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'

const FLEET_LABEL: Record<FleetBucket, string> = {
  available: 'Müsait',
  reserved: 'Rezervasyona ayrılmış',
  rented: 'Kirada',
  maintenance: 'Bakımda',
  transfer: 'Transferde',
  unavailable: 'Kullanılamaz',
}
const FLEET_HINT: Record<FleetBucket, string> = {
  available: 'Şu an hiçbir kayıt tutmuyor',
  reserved: 'Atanmış onaylı rezervasyon veya hazır kiralama',
  rented: 'Araç müşteride',
  maintenance: 'Planlı veya süren bakım',
  transfer: 'Onaylı transfer veya yolda',
  unavailable: 'Hasar engeli veya hizmet dışı',
}
const FLEET_COLOR: Record<FleetBucket, string> = {
  available: 'bg-ok',
  reserved: 'bg-blue',
  rented: 'bg-ink',
  maintenance: 'bg-hold',
  transfer: 'bg-ink-3',
  unavailable: 'bg-alert',
}

const KIND_LABEL: Record<DashboardItem['kind'], string> = { reservation: 'Rezervasyon', rental: 'Kiralama', maintenance: 'Bakım', damage: 'Hasar', transfer: 'Transfer' }

function ItemLink({ item, children, className }: { item: DashboardItem; children: ReactNode; className?: string }) {
  switch (item.kind) {
    case 'reservation':
      return <Link to="/rezervasyonlar/$reservationId" params={{ reservationId: item.id }} className={className}>{children}</Link>
    case 'rental':
      return <Link to="/kiralamalar/$rentalId" params={{ rentalId: item.id }} className={className}>{children}</Link>
    case 'maintenance':
      return <Link to="/bakim-servis/$maintenanceId" params={{ maintenanceId: item.id }} className={className}>{children}</Link>
    case 'damage':
      return <Link to="/hasar-kayitlari/$damageId" params={{ damageId: item.id }} className={className}>{children}</Link>
    case 'transfer':
      return <Link to="/araclar/transferler/$transferId" params={{ transferId: item.id }} className={className}>{children}</Link>
  }
}

function formatters(timeZone: string) {
  const time = new Intl.DateTimeFormat('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit' })
  const dayTime = new Intl.DateTimeFormat('tr-TR', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const day = new Intl.DateTimeFormat('tr-TR', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return { time: (iso: string) => time.format(new Date(iso)), dayTime: (iso: string) => dayTime.format(new Date(iso)), day: (iso: string) => day.format(new Date(iso)) }
}

/** Panel with a title row; quiet by design, the data carries the weight. */
function Panel({ title, count, action, children, className, tone }: { title: string; count?: number | null; action?: ReactNode; children: ReactNode; className?: string; tone?: 'alert' }) {
  const id = `db-${title.replace(/\W+/g, '-')}`
  return (
    <section aria-labelledby={id} className={cn('min-w-0 rounded-xl border border-line bg-surface', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 sm:px-5">
        <h2 id={id} className="flex items-center gap-2 text-[14.5px] font-semibold tracking-[-0.01em]">
          {title}
          {count != null && <span className={cn('tnum rounded-md px-1.5 text-[12px] font-medium', tone === 'alert' && count > 0 ? 'bg-alert-soft text-alert' : 'bg-ground text-ink-2')}>{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function ItemRows({ items, when, empty }: { items: DashboardItem[]; when: (iso: string) => string; empty: string }) {
  if (!items.length) return <p className="px-4 py-5 text-[13px] text-ink-2 sm:px-5">{empty}</p>
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((i) => (
        <li key={`${i.kind}-${i.id}-${i.label}`}>
          <ItemLink item={i} className="group grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-ground/60 focus-visible:bg-ground/60 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:px-5">
            <span className="tnum text-[13px] font-medium text-ink">{when(i.at)}</span>
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {i.plate ? <Plate plate={i.plate} /> : <span className="text-[12.5px] text-ink-3">Araç atanmadı</span>}
                <span className="truncate text-[13px] text-ink">{i.label}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
                <span className="tnum">{i.no}</span> · {KIND_LABEL[i.kind]}
                {i.branchCode ? ` · ${i.branchCode}` : ''}
                {i.customer ? ` · ${i.customer}` : ''}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {i.overdueMinutes != null && i.overdueMinutes > 0 && <span className="tnum rounded-md bg-alert-soft px-1.5 py-0.5 text-[12px] font-medium whitespace-nowrap text-alert">{formatLate(i.overdueMinutes)}</span>}
              <CaretRight size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
            </span>
          </ItemLink>
        </li>
      ))}
    </ul>
  )
}

/** One compact strip of facts; every number opens the list it comes from. */
function Summary({ d }: { d: DashboardResponse }) {
  const c = d.counts
  const overdue = (c.overdueReturns ?? 0) + (c.overduePickups ?? 0)
  const cells: { label: string; value: number | null; hint: string; to: string; tone?: 'alert' | 'hold' | 'ok' }[] = [
    { label: 'Bugün teslim', value: c.pickupsToday, hint: 'Onaylı rezervasyon + hazır kiralama', to: '/kiralamalar' },
    { label: 'Bugün iade', value: c.returnsToday, hint: 'Müşterideki araçlar', to: '/kiralamalar' },
    { label: 'Aktif kiralama', value: c.activeRentals, hint: 'Araç müşteride', to: '/kiralamalar' },
    { label: 'Gecikmiş', value: c.overdueReturns == null && c.overduePickups == null ? null : overdue, hint: `${c.overdueReturns ?? 0} iade · ${c.overduePickups ?? 0} teslim`, to: '/kiralamalar', tone: overdue ? 'alert' : undefined },
    { label: 'Müsait araç (şimdi)', value: d.fleet ? d.fleet.buckets.available : null, hint: d.fleet ? `${d.fleet.total} araçtan` : '', to: '/araclar', tone: 'ok' },
    { label: 'Onay bekleyen rezervasyon', value: c.pendingReservations, hint: `${c.confirmedUpcoming ?? 0} onaylı yaklaşan`, to: '/rezervasyonlar', tone: c.pendingReservations ? 'hold' : undefined },
  ]
  const shown = cells.filter((x) => x.value != null)
  if (!shown.length) return null
  return (
    <section aria-label="Bugünün özeti" className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-3 xl:grid-cols-6" style={{ gap: 1 }}>
      {shown.map((x) => (
        <Link key={x.label} to={x.to} className="group bg-surface px-4 py-3.5 hover:bg-ground/50 focus-visible:bg-ground/50">
          <span className="block text-[12.5px] text-ink-2">{x.label}</span>
          <span className={cn('tnum mt-1 block text-[26px] leading-none font-semibold tracking-[-0.02em]', x.tone === 'alert' ? 'text-alert' : x.tone === 'hold' ? 'text-hold' : 'text-ink')}>{x.value}</span>
          <span className="mt-1.5 block truncate text-[12px] text-ink-3">{x.hint}</span>
        </Link>
      ))}
    </section>
  )
}

function Fleet({ d }: { d: DashboardResponse }) {
  const f = d.fleet!
  return (
    <Panel
      title="Filo durumu · şimdi"
      count={f.total}
      action={
        <Link to="/araclar" className="inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline">
          Araçlar <ArrowRight size={13} />
        </Link>
      }
    >
      <div className="px-4 pt-4 sm:px-5">
        {f.total > 0 ? (
          <div className="flex h-2.5 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={FLEET_BUCKETS.map((b) => `${FLEET_LABEL[b]} ${f.buckets[b]}`).join(', ')}>
            {FLEET_BUCKETS.filter((b) => f.buckets[b]).map((b) => (
              <span key={b} className={cn('h-full border-r-2 border-surface last:border-r-0', FLEET_COLOR[b])} style={{ width: `${(f.buckets[b] / f.total) * 100}%` }} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">Kapsamda araç yok.</p>
        )}
      </div>
      <ul className="mt-2 divide-y divide-line-soft">
        {FLEET_BUCKETS.map((b) => (
          <li key={b} className="flex items-center gap-3 px-4 py-2 sm:px-5">
            <span className={cn('size-2.5 shrink-0 rounded-full', FLEET_COLOR[b])} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink">{FLEET_LABEL[b]}</span>
              <span className="block truncate text-[12px] text-ink-3">{FLEET_HINT[b]}</span>
            </span>
            <span className="tnum text-[14px] font-semibold">{f.buckets[b]}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-3 sm:px-5">
        Rezervasyon ve kiralama ekranlarıyla aynı müsaitlik kuralından gelir; yalnız şu anı gösterir, ileri tarih müsaitliği için ilgili ekranda tarih seçin.
        {f.outOfService ? ` ${f.outOfService} araç hizmet dışı.` : ''}
      </p>
    </Panel>
  )
}

function Operations({ d }: { d: DashboardResponse }) {
  const c = d.counts
  const rows: { label: string; value: number | null; to: string; tone?: 'alert' | 'hold' }[] = [
    { label: 'Bakımda', value: c.inMaintenance, to: '/bakim-servis' },
    { label: 'Bakım planı onay bekliyor', value: c.maintenancePendingApproval, to: '/bakim-servis', tone: 'hold' },
    { label: 'Geciken bakım', value: c.maintenanceOverdue, to: '/bakim-servis', tone: 'alert' },
    { label: 'Periyodik bakımı yaklaşan / geçen', value: c.serviceDueSoon == null ? null : c.serviceDueSoon + (c.serviceOverdue ?? 0), to: '/bakim-servis', tone: c.serviceOverdue ? 'alert' : 'hold' },
    { label: 'Hasar nedeniyle kullanılamaz araç', value: c.blockedVehicles, to: '/hasar-kayitlari', tone: 'alert' },
    { label: 'Açık hasar dosyası', value: c.openDamages, to: '/hasar-kayitlari' },
    { label: 'Engel kaldırma ikinci onay bekliyor', value: c.releasesPending, to: '/hasar-kayitlari', tone: 'hold' },
    { label: 'Yolda (transfer)', value: c.inTransit, to: '/araclar/transferler' },
    { label: 'Şubeye gelen transfer', value: c.incomingTransfers, to: '/araclar/transferler' },
    { label: 'Geciken transfer', value: c.lateTransfers, to: '/araclar/transferler', tone: 'alert' },
  ]
  const shown = rows.filter((r) => r.value != null)
  if (!shown.length) return null
  return (
    <Panel title="Bakım, hasar ve transfer">
      <ul className="divide-y divide-line-soft">
        {shown.map((r) => (
          <li key={r.label}>
            <Link to={r.to} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-ground/60 sm:px-5">
              <span className="min-w-0 flex-1 text-ink">{r.label}</span>
              <span className={cn('tnum font-semibold', r.value && r.tone === 'alert' ? 'text-alert' : r.value && r.tone === 'hold' ? 'text-hold' : r.value ? 'text-ink' : 'text-ink-3')}>{r.value}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ServiceDue({ d }: { d: DashboardResponse }) {
  if (!d.serviceDue.length) return null
  return (
    <Panel title="Periyodik bakım" count={d.serviceDue.length}>
      <ul className="divide-y divide-line-soft">
        {d.serviceDue.map((s) => (
          <li key={s.vehicleId}>
            <Link to="/araclar/$vehicleId" params={{ vehicleId: s.vehicleId }} search={{ sekme: 'bakim' }} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-ground/60 sm:px-5">
              <Plate plate={s.plate} />
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {[s.kmLeft != null ? `${s.kmLeft < 0 ? 'aşıldı ' : ''}${formatKm(Math.abs(s.kmLeft))}` : null, s.daysLeft != null ? `${s.daysLeft < 0 ? `${-s.daysLeft} gün geçti` : `${s.daysLeft} gün`}` : null].filter(Boolean).join(' · ')}
              </span>
              <span className={cn('rounded-md px-1.5 py-0.5 text-[12px] font-medium', s.state === 'overdue' ? 'bg-alert-soft text-alert' : 'bg-hold-soft text-hold')}>{SERVICE_DUE_LABELS[s.state]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Branches({ d }: { d: DashboardResponse }) {
  if (d.branches.length < 2 || !d.fleet) return null
  return (
    <Panel title="Şubeler">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
              <th scope="col" className="px-4 py-2 font-medium sm:px-5">Şube</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Araç</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Müsait</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Kirada</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Bakım / engel</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Bugün teslim</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Bugün iade</th>
              <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Gecikmiş</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {d.branches.map((b) => {
              const total = FLEET_BUCKETS.reduce((s, k) => s + b.fleet[k], 0)
              return (
                <tr key={b.id} className="h-11">
                  <th scope="row" className="px-4 text-left font-normal sm:px-5">
                    <span className="mr-2 rounded border border-line px-1.5 py-0.5 text-[11.5px] font-semibold tracking-[0.04em] text-ink-2">{b.code}</span>
                    <span className="text-ink">{b.name}</span>
                  </th>
                  <td className="tnum px-3 text-right">{total}</td>
                  <td className="tnum px-3 text-right text-ok">{b.fleet.available}</td>
                  <td className="tnum px-3 text-right">{b.fleet.rented}</td>
                  <td className="tnum px-3 text-right">{b.fleet.maintenance + b.fleet.unavailable}</td>
                  <td className="tnum px-3 text-right">{b.pickupsToday}</td>
                  <td className="tnum px-3 text-right">{b.returnsToday}</td>
                  <td className={cn('tnum px-4 text-right sm:px-5', b.overdue ? 'font-semibold text-alert' : 'text-ink-3')}>{b.overdue}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-3 sm:px-5">Araç sayıları aracın ana şubesine göredir; teslim ve iadeler kaydın şubesine göre sayılır.</p>
    </Panel>
  )
}

function Finance({ d }: { d: DashboardResponse }) {
  const f = d.finance!
  const p = f.pending
  return (
    <Panel
      title="Finans · para birimine göre"
      action={
        <Link to="/finans" className="inline-flex items-center gap-1 text-[13px] font-medium text-blue hover:underline">
          Finans Merkezi <ArrowRight size={13} />
        </Link>
      }
    >
      {f.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line-soft text-left text-[12px] text-ink-2">
                <th scope="col" className="px-4 py-2 font-medium sm:px-5">Para birimi</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Onaylı iç hesap kalemi</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Doğrulanmış tahsilat</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Doğrulama bekleyen</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Kalan</th>
                <th scope="col" className="px-4 py-2 text-right font-medium sm:px-5">Tutulan depozito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {f.rows.map((r) => (
                <tr key={r.currency} className="h-11">
                  <th scope="row" className="px-4 text-left font-semibold sm:px-5">{r.currency}</th>
                  <td className="tnum px-3 text-right">{formatMoney(r.postedChargesMinor, r.currency)}</td>
                  <td className="tnum px-3 text-right text-ok">{formatMoney(r.verifiedPaymentsMinor, r.currency)}</td>
                  <td className="tnum px-3 text-right text-ink-2">{formatMoney(r.recordedPaymentsMinor, r.currency)}</td>
                  <td className={cn('tnum px-3 text-right', r.outstandingMinor ? 'text-hold' : 'text-ink-3')}>{formatMoney(r.outstandingMinor, r.currency)}</td>
                  <td className="tnum px-4 text-right sm:px-5">{formatMoney(r.depositsHeldMinor, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-5 text-[13px] text-ink-2 sm:px-5">Kapsamda finans dosyası yok.</p>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line-soft px-4 py-3 text-[13px] sm:px-5">
        <span className="text-ink-2">Onay bekleyen:</span>
        <span>
          <span className="tnum font-semibold">{p.payments}</span> tahsilat doğrulaması
        </span>
        <span>
          <span className="tnum font-semibold">{p.charges}</span> kalem / ters kayıt
        </span>
        <span>
          <span className="tnum font-semibold">{p.deposits}</span> depozito
        </span>
        <span>
          <span className="tnum font-semibold">{p.refunds}</span> depozito iadesi
        </span>
      </div>
      <p className="flex items-start gap-2 border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-3 sm:px-5">
        <Info size={14} className="mt-px shrink-0" />
        İç işlem kayıtlarıdır; resmî muhasebe raporu veya gelir tablosu değildir. Para birimleri birbirine çevrilmez ve toplanmaz. Teklif gelir, depozito tahsilat sayılmaz.
      </p>
    </Panel>
  )
}

function ReadinessNote() {
  const session = useSession()
  const allowed = can(session, 'readiness.read')
  const q = useQuery({ queryKey: ['readiness', session.company?.id], queryFn: () => dashboardApi.readiness(), enabled: allowed, retry: false, staleTime: 60_000 })
  if (!allowed || !q.data) return null
  const s = q.data.summary
  const open = s.missing + s.decision_required + s.unavailable
  return (
    <Link to="/ayarlar/hazirlik" className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] hover:bg-ground/50 sm:px-5">
      <ListChecks size={17} className={open ? 'text-hold' : 'text-ok'} />
      <span className="font-medium text-ink">Operasyonel hazırlık</span>
      <span className="text-ink-2">
        {open ? `${open} madde eksik veya karar bekliyor` : 'Eksik madde yok'} · {s.not_verified} madde doğrulanmadı
      </span>
      <span className="ml-auto inline-flex items-center gap-1 font-medium text-blue">
        Kontrol listesi <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

/** Ana Ekran (spec §6, §59A): what needs doing today and what needs attention, from real records only. */
export function DashboardPage() {
  const session = useSession()
  const search = useSearch({ from: '/app/' })
  const navigate = useNavigate({ from: '/' })
  const branchId = search.sube
  const q = useQuery({ queryKey: ['dashboard', session.company?.id, branchId ?? 'all'], queryFn: () => dashboardApi.get(branchId), refetchInterval: 60_000, retry: false })
  if (q.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ana Ekran" />
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      </div>
    )
  }
  if (!q.data) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Ana ekran yükleniyor">
        <div className="h-12 w-72 animate-pulse rounded-lg bg-line-soft/70" />
        <div className="h-24 animate-pulse rounded-xl bg-line-soft/60" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-80 animate-pulse rounded-xl bg-line-soft/60" />
          <div className="h-80 animate-pulse rounded-xl bg-line-soft/60" />
        </div>
      </div>
    )
  }
  const d = q.data
  const fmt = formatters(d.timeZone)
  const s = d.sections
  const nothing = !s.fleet && !s.reservations && !s.rentals && !s.maintenance && !s.damage && !s.transfers && !s.finance
  const todayCount = d.todayItems.pickups.length + d.todayItems.returns.length
  return (
    <div className="space-y-5">
      <PageHeader
        title="Ana Ekran"
        description={
          <>
            {fmt.day(d.generatedAt)} · <span className="tnum">{fmt.time(d.generatedAt)}</span> itibarıyla · saat dilimi {d.timeZone}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {d.scope.branches.length > 1 && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="sr-only sm:not-sr-only">Şube</span>
              <Select aria-label="Şube" className="w-56" value={branchId ?? ''} onChange={(e) => void navigate({ search: e.target.value ? { sube: e.target.value } : {} })}>
                <option value="">{d.scope.allBranches ? 'Tüm şubeler' : 'Yetkili olduğum tüm şubeler'}</option>
                {d.scope.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <button type="button" onClick={() => void q.refetch()} disabled={q.isFetching} className="inline-flex size-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-ground disabled:opacity-60" aria-label="Yenile" title="Yenile">
            <ArrowClockwise size={17} className={q.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </PageHeader>

      {nothing ? (
        <section className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-ink-2">Bu ekranda gösterebileceğimiz bir bölüm için yetkiniz yok. Yetki için şirket yöneticinize başvurun.</section>
      ) : (
        <>
          <Summary d={d} />
          <ReadinessNote />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              {(s.reservations || s.rentals) && (
                <>
                  <Panel title="Gecikenler" count={d.overdue.length} tone="alert">
                    <ItemRows items={d.overdue} when={fmt.dayTime} empty="Geciken teslim veya iade yok." />
                  </Panel>
                  <div className="grid gap-5 xl:grid-cols-2">
                    <Panel title="Bugün teslim" count={d.counts.pickupsToday}>
                      <ItemRows items={d.todayItems.pickups} when={fmt.time} empty="Bugün için teslim yok." />
                    </Panel>
                    <Panel title="Bugün iade" count={d.counts.returnsToday}>
                      <ItemRows items={d.todayItems.returns} when={fmt.time} empty="Bugün için iade yok." />
                    </Panel>
                  </div>
                  {todayCount === 0 && d.upcoming.length === 0 && d.overdue.length === 0 && (
                    <p className="flex items-center gap-2 text-[13px] text-ink-2">
                      <CheckCircle size={16} className="text-ok" /> Bugün ve önümüzdeki üç gün için bekleyen teslim veya iade yok.
                    </p>
                  )}
                  <Panel title="Önümüzdeki üç gün" count={d.upcoming.length}>
                    <ItemRows items={d.upcoming} when={fmt.dayTime} empty="Önümüzdeki üç gün için teslim veya iade yok." />
                  </Panel>
                </>
              )}
              {(s.maintenance || s.damage || s.transfers) && (
                <Panel title="Dikkat gerektirenler" count={d.attention.length}>
                  <ItemRows items={d.attention} when={fmt.dayTime} empty="Bakım, hasar veya transferde dikkat gerektiren kayıt yok." />
                </Panel>
              )}
            </div>
            <div className="min-w-0 space-y-5">
              {d.fleet && <Fleet d={d} />}
              <Operations d={d} />
              <ServiceDue d={d} />
              {!s.reservations && !s.rentals && (
                <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
                  <Info size={14} className="mt-px shrink-0" /> Rezervasyon ve kiralama listeleri yetkiniz olmadığı için gösterilmiyor.
                </p>
              )}
            </div>
          </div>
          <Branches d={d} />
          {d.finance && <Finance d={d} />}
          <nav aria-label="Hızlı geçiş" className="flex flex-wrap gap-2 text-[13px]">
            {can(session, 'reservations.read') && (
              <Link to="/rezervasyonlar" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-ink-2 hover:bg-ground">
                <CalendarCheck size={15} /> Rezervasyonlar
              </Link>
            )}
            {can(session, 'rentals.read') && (
              <Link to="/kiralamalar" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-ink-2 hover:bg-ground">
                <Key size={15} /> Kiralamalar
              </Link>
            )}
            {can(session, 'maintenance.read') && (
              <Link to="/bakim-servis" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-ink-2 hover:bg-ground">
                <Wrench size={15} /> Bakım & Servis
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  )
}
