import { type FinanceListQuery, type FinanceSummaryRow, PAYMENT_METHODS } from '@acarvo/shared'
import { CaretLeft, CaretRight, Coins, Info, MagnifyingGlass } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { Input, Select } from '@/components/fields'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { branchesApi, financeApi } from '@/lib/api'
import {
  CHARGE_STATUS_LABEL,
  CHARGE_TONE,
  DEPOSIT_METHOD_LABEL,
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_TONE,
  depositState,
  EVENT_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TONE,
  REFUND_STATUS_LABEL,
  REFUND_TONE,
} from '@/lib/finance-labels'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { Money, Pill, Section } from './FinanceParts'
import { FileTable } from './PartyFinancePanel'

import { FINANCE_TABS, type FinanceTab } from './search'
const TAB_LABEL: Record<FinanceTab, string> = { genel: 'Genel görünüm', bekleyen: 'Bekleyen doğrulamalar', tahsilatlar: 'Tahsilatlar', depozitolar: 'Depozitolar', iadeler: 'Depozito iadeleri', dosyalar: 'Kiralama finans dosyaları', hareketler: 'İşlem geçmişi' }

type Filters = Partial<FinanceListQuery> & { page: number }
const STATUS_OPTIONS: Partial<Record<FinanceTab, Record<string, string>>> = {
  tahsilatlar: PAYMENT_STATUS_LABEL,
  depozitolar: DEPOSIT_STATUS_LABEL,
  iadeler: REFUND_STATUS_LABEL,
  dosyalar: { open: 'Açık', closed: 'Finansal olarak kapandı', reopened: 'Yeniden açıldı' },
  hareketler: { charge: 'İç hesap kalemi', payment: 'Tahsilat', deposit: 'Depozito', refund: 'Depozito iadesi', finance: 'Finans dosyası' },
}

/** Finans: the company's finance records in the user's branch scope. Totals per currency; nothing summed across them. */
export function FinanceCenterPage() {
  const session = useSession()
  const navigate = useNavigate()
  const { sekme } = useSearch({ from: '/app/finans' })
  const tab: FinanceTab = sekme ?? 'genel'
  const [filters, setFilters] = useState<Filters>({ page: 1 })
  if (!can(session, 'finance.reports.read')) {
    return (
      <div className="space-y-5">
        <PageHeader title="Finans" />
        <ForbiddenState message="Finans merkezi listeleri ve raporları yetkili kullanıcılara açıktır. Kiralamanın finans sekmesini yetkinize göre kullanabilirsiniz." />
      </div>
    )
  }
  const onTab = (t: FinanceTab) => {
    setFilters({ page: 1 })
    void navigate({ to: '/finans', search: t === 'genel' ? {} : { sekme: t }, replace: true })
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Finans" description="Tahsilat, depozito ve iç hesap kayıtları. Tutarlar para birimi başına ayrıdır; kur dönüşümü yapılmaz." />
      <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
        <Info size={16} className="mt-0.5 shrink-0 text-ink-3" />
        İç operasyon kayıtlarıdır: resmî muhasebe defteri, vergi beyannamesi, fatura veya banka mutabakatı değildir. ACARVO para tahsil etmez veya iade etmez.
      </p>
      <div className="border-b border-line">
        <div role="tablist" aria-label="Finans bölümleri" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
          {FINANCE_TABS.map((t) => (
            <button key={t} role="tab" type="button" id={`ftab-${t}`} aria-selected={t === tab} aria-controls="finance-tabpanel" onClick={() => onTab(t)} className={cn('relative h-11 shrink-0 px-3 font-medium whitespace-nowrap', t === tab ? 'text-ink' : 'text-ink-2 hover:text-ink')}>
              {TAB_LABEL[t]}
              {t === tab && <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-blue" />}
            </button>
          ))}
        </div>
      </div>
      <div key={tab} id="finance-tabpanel" role="tabpanel" aria-labelledby={`ftab-${tab}`} className="animate-fade space-y-4">
        {tab !== 'bekleyen' && <FilterBar tab={tab} filters={filters} setFilters={setFilters} />}
        {tab === 'genel' && <Overview filters={filters} />}
        {tab === 'bekleyen' && <PendingTab />}
        {tab === 'tahsilatlar' && <PaymentsTab filters={filters} setFilters={setFilters} />}
        {tab === 'depozitolar' && <DepositsTab filters={filters} setFilters={setFilters} />}
        {tab === 'iadeler' && <RefundsTab filters={filters} setFilters={setFilters} />}
        {tab === 'dosyalar' && <FilesTab filters={filters} setFilters={setFilters} />}
        {tab === 'hareketler' && <EventsTab filters={filters} setFilters={setFilters} />}
      </div>
    </div>
  )
}

function FilterBar({ tab, filters, setFilters }: { tab: FinanceTab; filters: Filters; setFilters: (f: Filters) => void }) {
  const session = useSession()
  const branches = useQuery({ queryKey: ['branches', session.company?.id], queryFn: branchesApi.list, enabled: can(session, 'branches.read') })
  const [q, setQ] = useState(filters.q ?? '')
  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch, page: 1 })
  const statuses = STATUS_OPTIONS[tab]
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        set({ q: q.trim() || undefined })
      }}
      aria-label="Filtreler"
    >
      {tab !== 'genel' && (
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block text-[12px] text-ink-2">Kiralama, müşteri veya hesap no</span>
          <span className="relative block">
            <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
            <Input type="search" aria-label="Finans kayıtlarında ara" className="h-9 pl-9 text-[13.5px]" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => set({ q: q.trim() || undefined })} placeholder="ör. K-000012" />
          </span>
        </label>
      )}
      <label className="w-[140px]">
        <span className="mb-1 block text-[12px] text-ink-2">Başlangıç</span>
        <Input type="date" className="h-9 text-[13.5px]" value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
      </label>
      <label className="w-[140px]">
        <span className="mb-1 block text-[12px] text-ink-2">Bitiş</span>
        <Input type="date" className="h-9 text-[13.5px]" value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
      </label>
      {branches.data && (
        <label className="w-[170px]">
          <span className="mb-1 block text-[12px] text-ink-2">Şube</span>
          <Select compact value={filters.branchId ?? ''} onChange={(e) => set({ branchId: e.target.value || undefined })}>
            <option value="">Tüm şubeler</option>
            {branches.data.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <label className="w-[110px]">
        <span className="mb-1 block text-[12px] text-ink-2">Para birimi</span>
        <Input className="h-9 text-[13.5px] uppercase" maxLength={3} value={filters.currency ?? ''} onChange={(e) => { const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); set({ currency: v.length === 3 ? v : undefined }) }} placeholder="EUR" />
      </label>
      {statuses && (
        <label className="w-[190px]">
          <span className="mb-1 block text-[12px] text-ink-2">{tab === 'hareketler' ? 'Kayıt türü' : 'Durum'}</span>
          <Select compact value={filters.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
            <option value="">Tümü</option>
            {Object.entries(statuses).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </label>
      )}
      {(tab === 'tahsilatlar' || tab === 'iadeler') && (
        <label className="w-[190px]">
          <span className="mb-1 block text-[12px] text-ink-2">Yöntem</span>
          <Select compact value={filters.method ?? ''} onChange={(e) => set({ method: e.target.value || undefined })}>
            <option value="">Tümü</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </label>
      )}
      {['tahsilatlar', 'depozitolar', 'iadeler'].includes(tab) && (
        <label className="w-[160px]">
          <span className="mb-1 block text-[12px] text-ink-2">Sıralama</span>
          <Select compact value={filters.sort ?? 'newest'} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}>
            <option value="newest">En yeni</option>
            <option value="oldest">En eski</option>
            <option value="amount_desc">Tutar (büyükten)</option>
            <option value="amount_asc">Tutar (küçükten)</option>
          </Select>
        </label>
      )}
    </form>
  )
}

function useList<T>(name: string, fn: (b: unknown) => Promise<{ items: T[]; total: number; page: number; pageSize: number }>, filters: Filters) {
  const session = useSession()
  return useQuery({ queryKey: ['finance', name, session.company?.id, filters], queryFn: () => fn(filters), placeholderData: keepPreviousData })
}

function Pager({ total, filters, setFilters, pageSize = 25 }: { total: number; filters: Filters; setFilters: (f: Filters) => void; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return <p className="text-[12.5px] text-ink-2">{total} kayıt</p>
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
      <span>
        {total} kayıt · sayfa {filters.page} / {pages}
      </span>
      <span className="flex gap-1.5">
        <button type="button" aria-label="Önceki sayfa" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })} className="grid size-9 place-items-center rounded-lg border border-line bg-surface disabled:opacity-40">
          <CaretLeft size={14} />
        </button>
        <button type="button" aria-label="Sonraki sayfa" disabled={filters.page >= pages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })} className="grid size-9 place-items-center rounded-lg border border-line bg-surface disabled:opacity-40">
          <CaretRight size={14} />
        </button>
      </span>
    </div>
  )
}

function ListState<T>({ q, empty, children }: { q: { isPending: boolean; isError: boolean; error: Error | null; data?: { items: T[] }; refetch: () => unknown }; empty: string; children: (items: T[]) => ReactNode }) {
  if (q.isPending) return <div className="h-40 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" />
  if (q.isError) return <ErrorState message={q.error!.message} onRetry={() => q.refetch()} />
  if (!q.data!.items.length)
    return (
      <StatePanel icon={Coins} title="Kayıt yok">
        <p>{empty}</p>
      </StatePanel>
    )
  return <>{children(q.data!.items)}</>
}

const RentalLink = ({ id, no }: { id: string; no: string }) => (
  <Link to="/kiralamalar/$rentalId" params={{ rentalId: id }} search={{ sekme: 'finans' }} className="tnum font-medium text-blue-ink hover:underline">
    {no}
  </Link>
)

function Overview({ filters }: { filters: Filters }) {
  const session = useSession()
  const q = useQuery({ queryKey: ['finance', 'summary', session.company?.id, filters], queryFn: () => financeApi.summary(filters) })
  if (q.isPending) return <div className="h-48 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" />
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  if (!q.data.rows.length)
    return (
      <StatePanel icon={Coins} title="Finans kaydı yok">
        <p>Bu filtrelerde tahsilat, depozito veya iç hesap kaydı yok. Örnek veya tahmini tutar gösterilmez.</p>
      </StatePanel>
    )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {q.data.rows.map((r) => (
        <CurrencyCard key={r.currency} r={r} />
      ))}
    </div>
  )
}

function CurrencyCard({ r }: { r: FinanceSummaryRow }) {
  const c = r.currency
  const rows: [string, number, string?][] = [
    ['Doğrulanmış tahsilat', r.verifiedPaymentsMinor, 'text-ok'],
    ['Doğrulama bekleyen tahsilat', r.recordedPaymentsMinor, 'text-hold'],
    ['Kayıtlı iç hesap kalemleri', r.postedChargesMinor],
    ['Onay bekleyen kalemler', r.pendingChargesMinor, 'text-hold'],
    ['Kalan (kayıtlı kalemlere göre)', r.outstandingMinor],
    ['Tutulan depozito', r.depositsHeldMinor],
    ['Doğrulama bekleyen depozito', r.depositsReportedMinor, 'text-hold'],
    ['Bekleyen depozito iadeleri', r.refundsOpenMinor],
    ['İade edildiği bildirilen', r.refundsCompletedMinor],
  ]
  return (
    <Section title={c} description="Bu para birimindeki kayıtlar; diğer para birimleriyle toplanmaz.">
      <dl className="divide-y divide-line-soft">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-[13px] text-ink-2">{k}</dt>
            <dd className={cn('font-semibold', v > 0 ? tone : v === 0 && 'text-ink-3')}>
              <Money minor={v} currency={c} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[12.5px] text-ink-2">
        Doğrulanmış tahsilat yöntemlere göre:{' '}
        {PAYMENT_METHODS.some((m) => r.verifiedByMethod[m])
          ? PAYMENT_METHODS.filter((m) => r.verifiedByMethod[m]).map((m, i) => (
              <span key={m}>
                {i > 0 && ' · '}
                {PAYMENT_METHOD_LABEL[m]} <Money minor={r.verifiedByMethod[m]} currency={c} />
              </span>
            ))
          : 'yok'}
      </p>
    </Section>
  )
}

function PendingTab() {
  const session = useSession()
  const q = useQuery({ queryKey: ['finance', 'pending', session.company?.id], queryFn: financeApi.pending })
  if (q.isPending) return <div className="h-40 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" />
  if (q.isError) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
  const d = q.data
  const total = d.payments.length + d.charges.length + d.deposits.length + d.refunds.length
  if (!total)
    return (
      <StatePanel icon={Coins} title="Bekleyen doğrulama yok">
        <p>Doğrulama veya onay bekleyen tahsilat, kalem, depozito ya da iade yok.</p>
      </StatePanel>
    )
  const Row = ({ rental, no, label, tone, status, minor, currency, sub }: { rental: { id: string; no: string }; no: string; label: string; tone: Parameters<typeof Pill>[0]['tone']; status: string; minor: number; currency: string; sub: string }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-[13px]">
      <span className="min-w-0">
        <RentalLink {...rental} /> <span className="tnum text-ink-2">· {no} · {label}</span>
        <span className="block text-[12px] text-ink-3">{sub}</span>
      </span>
      <span className="flex items-center gap-2">
        <Pill tone={tone}>{status}</Pill>
        <Money minor={minor} currency={currency} className="font-semibold" />
      </span>
    </li>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={`Tahsilatlar (${d.payments.length})`} description="Kaydeden dışında bir yetkili doğrular.">
        <ul className="divide-y divide-line-soft">{d.payments.map((p) => <Row key={p.id} rental={p.rental} no={p.paymentNo} label={PAYMENT_METHOD_LABEL[p.method]} tone={PAYMENT_TONE[p.status]} status={PAYMENT_STATUS_LABEL[p.status]} minor={p.amountMinor} currency={p.currency} sub={`${p.created.name ?? ''} · ${formatDateTime(p.receivedAt)}`} />)}</ul>
        {!d.payments.length && <p className="text-[13px] text-ink-2">Yok.</p>}
      </Section>
      <Section title={`İç hesap kalemleri (${d.charges.length})`} description="Onay veya ters kayıt onayı bekleyenler.">
        <ul className="divide-y divide-line-soft">{d.charges.map((c) => <Row key={c.id} rental={c.rental} no={c.chargeNo} label={c.description} tone={CHARGE_TONE[c.status]} status={CHARGE_STATUS_LABEL[c.status]} minor={c.amountMinor} currency={c.currency} sub={`${c.created.name ?? ''} · ${c.created.at ? formatDateTime(c.created.at) : ''}`} />)}</ul>
        {!d.charges.length && <p className="text-[13px] text-ink-2">Yok.</p>}
      </Section>
      <Section title={`Depozitolar (${d.deposits.length})`} description="Doğrulama bekleyen veya incelemedeki depozitolar.">
        <ul className="divide-y divide-line-soft">{d.deposits.map((x) => <Row key={x.id} rental={x.rental} no={x.depositNo} label={x.method ? DEPOSIT_METHOD_LABEL[x.method] : '—'} tone={x.inReview ? 'alert' : DEPOSIT_TONE[x.status]} status={x.inReview ? 'İnceleme' : DEPOSIT_STATUS_LABEL[x.status]} minor={x.amountMinor} currency={x.currency} sub={x.reported.name ? `bildiren ${x.reported.name}` : ''} />)}</ul>
        {!d.deposits.length && <p className="text-[13px] text-ink-2">Yok.</p>}
      </Section>
      <Section title={`Depozito iadeleri (${d.refunds.length})`} description="Onay veya iade bildirimi bekleyenler.">
        <ul className="divide-y divide-line-soft">{d.refunds.map((r) => <Row key={r.id} rental={r.rental} no={r.refundNo} label={`${r.deposit.no} · ${PAYMENT_METHOD_LABEL[r.method]}`} tone={REFUND_TONE[r.status]} status={REFUND_STATUS_LABEL[r.status]} minor={r.amountMinor} currency={r.currency} sub={`talep eden ${r.created.name ?? ''}`} />)}</ul>
        {!d.refunds.length && <p className="text-[13px] text-ink-2">Yok.</p>}
      </Section>
    </div>
  )
}

function Table({ head, children, min = 760 }: { head: string[]; children: ReactNode; min?: number }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]" style={{ minWidth: min }}>
          <thead>
            <tr className="h-10 border-b border-line text-left text-[12px] text-ink-2">
              {head.map((h, i) => (
                <th key={h} scope="col" className={cn('px-3 font-medium first:pl-5 last:pr-5', i >= head.length - 2 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">{children}</tbody>
        </table>
      </div>
    </section>
  )
}

function PaymentsTab({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const q = useList('payments', financeApi.payments, filters)
  return (
    <ListState q={q} empty="Bu filtrelerde tahsilat kaydı yok.">
      {(items) => (
        <>
          <Table head={['Tahsilat', 'Kiralama / sorumlu', 'Ödeyen', 'Yöntem', 'Durum', 'Tutar']}>
            {items.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="py-2.5 pr-3 pl-5">
                  <span className="tnum font-medium">{p.paymentNo}</span>
                  <span className="block text-[12px] text-ink-3">{formatDateTime(p.receivedAt)} · {p.branch.code}</span>
                </td>
                <td className="px-3 py-2.5">
                  <RentalLink {...p.rental} />
                  <span className="block text-[12px] text-ink-2">{p.responsible.name}</span>
                </td>
                <td className="px-3 py-2.5">{p.payer.name}</td>
                <td className="px-3 py-2.5">{PAYMENT_METHOD_LABEL[p.method]}{p.externalReference && <span className="block text-[12px] text-ink-3">ref. {p.externalReference}</span>}</td>
                <td className="px-3 py-2.5 text-right"><Pill tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Pill></td>
                <td className="py-2.5 pr-5 pl-3 text-right font-semibold"><Money minor={p.amountMinor} currency={p.currency} /></td>
              </tr>
            ))}
          </Table>
          <Pager total={q.data!.total} filters={filters} setFilters={setFilters} />
        </>
      )}
    </ListState>
  )
}

function DepositsTab({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const q = useList('deposits', financeApi.deposits, filters)
  return (
    <ListState q={q} empty="Bu filtrelerde depozito kaydı yok.">
      {(items) => (
        <>
          <Table head={['Depozito', 'Kiralama', 'Yöntem', 'Tutulan / iade', 'Durum', 'Tutar']}>
            {items.map((d) => (
              <tr key={d.id} className="align-top">
                <td className="py-2.5 pr-3 pl-5"><span className="tnum font-medium">{d.depositNo}</span><span className="block text-[12px] text-ink-3">{d.created.at && formatDateTime(d.created.at)}</span></td>
                <td className="px-3 py-2.5"><RentalLink {...d.rental} /></td>
                <td className="px-3 py-2.5">{d.method ? DEPOSIT_METHOD_LABEL[d.method] : '—'}</td>
                <td className="px-3 py-2.5 text-[13px]">
                  <Money minor={d.heldMinor} currency={d.currency} /> tutulan
                  {d.refundedMinor > 0 && <span className="block text-ink-2"><Money minor={d.refundedMinor} currency={d.currency} /> iade</span>}
                </td>
                <td className="px-3 py-2.5 text-right"><Pill tone={depositState(d).tone}>{depositState(d).label}</Pill></td>
                <td className="py-2.5 pr-5 pl-3 text-right font-semibold"><Money minor={d.amountMinor} currency={d.currency} /></td>
              </tr>
            ))}
          </Table>
          <Pager total={q.data!.total} filters={filters} setFilters={setFilters} />
        </>
      )}
    </ListState>
  )
}

function RefundsTab({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const q = useList('refunds', financeApi.refunds, filters)
  return (
    <ListState q={q} empty="Bu filtrelerde depozito iadesi yok.">
      {(items) => (
        <>
          <Table head={['İade', 'Kiralama / depozito', 'Yöntem', 'Gerekçe', 'Durum', 'Tutar']}>
            {items.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="py-2.5 pr-3 pl-5"><span className="tnum font-medium">{r.refundNo}</span><span className="block text-[12px] text-ink-3">{r.created.at && formatDateTime(r.created.at)}</span></td>
                <td className="px-3 py-2.5"><RentalLink {...r.rental} /><span className="tnum block text-[12px] text-ink-2">{r.deposit.no}</span></td>
                <td className="px-3 py-2.5">{PAYMENT_METHOD_LABEL[r.method]}{r.externalReference && <span className="block text-[12px] text-ink-3">ref. {r.externalReference}</span>}</td>
                <td className="max-w-[240px] px-3 py-2.5 text-[13px] break-words text-ink-2">{r.reason}</td>
                <td className="px-3 py-2.5 text-right"><Pill tone={REFUND_TONE[r.status]}>{REFUND_STATUS_LABEL[r.status]}</Pill></td>
                <td className="py-2.5 pr-5 pl-3 text-right font-semibold"><Money minor={r.amountMinor} currency={r.currency} /></td>
              </tr>
            ))}
          </Table>
          <Pager total={q.data!.total} filters={filters} setFilters={setFilters} />
        </>
      )}
    </ListState>
  )
}

function FilesTab({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const q = useList('files', financeApi.files, filters)
  return (
    <ListState q={q} empty="Bu filtrelerde finans dosyası yok.">
      {(items) => (
        <>
          <Section title="Kiralama bazlı finans durumu" description="Her dosya kendi işlem para biriminde.">
            <FileTable files={items} />
          </Section>
          <Pager total={q.data!.total} filters={filters} setFilters={setFilters} />
        </>
      )}
    </ListState>
  )
}

function EventsTab({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const q = useList('events', (b) => financeApi.events({ ...(b as object), pageSize: 50 }), filters)
  return (
    <ListState q={q} empty="Bu filtrelerde işlem kaydı yok.">
      {(items) => (
        <>
          <Section title="Finans işlem geçmişi" description="Kim, ne zaman, hangi kayıtta, önceki ve yeni durum. Kayıtlar silinmez.">
            <ol className="divide-y divide-line-soft">
              {items.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-[13px]">
                  <span className="min-w-0">
                    <RentalLink {...e.rental} /> <span className="text-ink">· {EVENT_LABEL[e.kind] ?? e.kind}</span>
                    {e.entityNo && <span className="tnum text-ink-2"> · {e.entityNo}</span>}
                    {e.amountMinor != null && e.currency && <span className="text-ink-2"> · <Money minor={e.amountMinor} currency={e.currency} /></span>}
                  </span>
                  <span className="tnum text-[12.5px] text-ink-2">{formatDateTime(e.at)}{e.actorName && ` · ${e.actorName}`}</span>
                </li>
              ))}
            </ol>
          </Section>
          <Pager total={q.data!.total} filters={filters} setFilters={setFilters} pageSize={50} />
        </>
      )}
    </ListState>
  )
}
