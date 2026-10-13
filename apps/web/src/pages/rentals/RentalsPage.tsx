import { RENTAL_PAGE_SIZES, type RentalListItem, type RentalSort, type RentalView } from '@acarvo/shared'
import { Buildings, CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, Info, Key, MagnifyingGlass, Plus, X } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Select } from '@/components/fields'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, rentalsApi } from '@/lib/api'
import { formatMoment } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { RentalStatusBadge } from './RentalParts'
import { type RentalListSearch, rememberedText, rememberListSearch, rememberText } from './search'

const VIEW_LABELS: [RentalView, string][] = [
  ['active', 'Etkin'],
  ['prepared', 'Teslim bekleyen'],
  ['delivered', 'Kirada'],
  ['overdue', 'Geciken'],
  ['returned', 'İade kontrolü'],
  ['closed', 'Kapanan'],
  ['cancelled', 'İptal'],
  ['all', 'Tümü'],
]

function SortHeader({ label, sort, search, className }: { label: string; sort: RentalSort; search: RentalListSearch; className?: string }) {
  const navigate = useNavigate({ from: '/kiralamalar' })
  const active = (search.sort ?? 'pickup') === sort
  const dir = active ? (search.dir ?? 'asc') : undefined
  const Icon = dir === 'asc' ? CaretUp : dir === 'desc' ? CaretDown : CaretUpDown
  return (
    <th scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={cn('px-3 font-medium first:pl-5', className)}>
      <button
        type="button"
        onClick={() => navigate({ search: (prev) => ({ ...prev, sort: sort === 'pickup' && dir === 'desc' ? undefined : sort, dir: active && dir === 'asc' ? 'desc' : undefined, page: undefined }), replace: true })}
        className={cn('-mx-1 inline-flex h-7 items-center gap-1 rounded px-1 hover:text-ink', active && 'text-ink')}
      >
        {label}
        <Icon size={11} weight="bold" className={active ? 'text-ink' : 'text-ink-3/60'} />
      </button>
    </th>
  )
}

function Row({ r, onOpen, zone }: { r: RentalListItem; onOpen: () => void; zone?: string }) {
  const done = r.status === 'cancelled' || r.status === 'closed'
  const start = r.delivered ?? r.plannedPickup
  return (
    <tr onClick={onOpen} className={cn('group h-[60px] cursor-pointer hover:bg-blue-soft/35', done && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{r.rentalNo}</span>
        {r.reservation && <span className="tnum block text-[11.5px] text-ink-3">{r.reservation.reservationNo}</span>}
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <Link
          to="/kiralamalar/$rentalId"
          params={{ rentalId: r.id }}
          onClick={(e) => e.stopPropagation()}
          className={cn('block truncate font-medium group-hover:text-blue-ink hover:underline', done ? 'text-ink-2' : 'text-ink')}
          title={r.customer.displayName}
        >
          {r.customer.displayName}
        </Link>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[12.5px] text-ink-2">
          <span className="tnum sm:hidden">{r.rentalNo} · </span>
          {r.corporateAccount ? (
            <>
              <Buildings size={12} className="shrink-0" />
              <span className="truncate">{r.corporateAccount.legalName}</span>
            </>
          ) : (
            <span className="truncate">{r.customer.customerNo}</span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] md:hidden">
          <RentalStatusBadge status={r.status} overdueMinutes={r.overdueMinutes} /> <span className="tnum text-ink-2">· {r.vehicle.plate}</span>
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight lg:table-cell">
        <span className="tnum block truncate font-medium text-ink">{r.vehicle.plate}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
          {r.vehicle.make} {r.vehicle.model} · {r.vehicleClass.name}
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight md:table-cell">
        <span className="tnum block whitespace-nowrap text-ink">
          {formatMoment(start, zone)}
          {r.delivered && <span className="ml-1 text-[11.5px] text-ink-2">teslim</span>}
        </span>
        <span className={cn('tnum mt-0.5 block text-[12.5px] whitespace-nowrap', r.overdueMinutes != null ? 'font-medium text-alert' : 'text-ink-2')}>
          → {formatMoment(r.returned ?? r.plannedReturn, zone)}
          {r.returned ? <span className="ml-1 text-[11.5px]">iade</span> : <span className="ml-1 text-[11.5px]">plan</span>}
        </span>
      </td>
      <td className="hidden px-3 py-2 xl:table-cell">
        <span className="flex items-center gap-1.5 text-[13px]">
          <span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{r.pickupBranch.code}</span>
          {(r.actualReturnBranch ?? r.returnBranch).id !== r.pickupBranch.id && (
            <>
              →<span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{(r.actualReturnBranch ?? r.returnBranch).code}</span>
            </>
          )}
        </span>
      </td>
      <td className="hidden pr-5 pl-3 md:table-cell">
        <RentalStatusBadge status={r.status} overdueMinutes={r.overdueMinutes} className="text-[13px]" />
      </td>
    </tr>
  )
}

/** Kiralamalar: operational list. Price, payment and contract are not shown: those modules do not exist yet (K1). */
export function RentalsPage() {
  const session = useSession()
  const companyId = session.company?.id
  const zone = session.company?.timezone
  const search = useSearch({ from: '/app/kiralamalar' })
  const navigate = useNavigate({ from: '/kiralamalar' })
  const canManage = can(session, 'rentals.manage')
  const pageSize = search.pageSize ?? 25
  const page = search.page ?? 1
  const view = search.view ?? 'active'
  const [text, setText] = useState(() => rememberedText(companyId))
  const [q, setQ] = useState(() => rememberedText(companyId).trim())
  useEffect(() => rememberListSearch(companyId, search), [companyId, search])
  useEffect(() => {
    rememberText(companyId, text)
    const t = setTimeout(() => {
      if (text.trim() === q) return
      setQ(text.trim())
      if (search.page) navigate({ search: (prev) => ({ ...prev, page: undefined }), replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [text, q, companyId, search.page, navigate])

  const branches = useQuery({ queryKey: ['rental-branches', companyId], queryFn: () => rentalsApi.branches() })
  const body = { q: q || undefined, view, from: search.from, to: search.to, branchId: search.branchId, sort: search.sort ?? 'pickup', dir: search.dir ?? 'asc', page, pageSize }
  const list = useQuery({ queryKey: ['rentals', companyId, body], queryFn: () => rentalsApi.search(body), placeholderData: keepPreviousData })
  const set = (patch: Partial<RentalListSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }), replace: true })
  const filtersActive = !!(search.from || search.to || search.branchId) || q !== ''
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const open = (id: string) => navigate({ to: '/kiralamalar/$rentalId', params: { rentalId: id } })
  const count = (v: RentalView) => (data && v in data.counts ? data.counts[v as keyof typeof data.counts] : undefined)

  return (
    <div className="space-y-5">
      <PageHeader title="Kiralamalar" description={session.company ? `${session.company.name} · teslim, aktif kiralama, iade ve kapanış` : undefined}>
        {canManage && (
          <Link to="/kiralamalar/yeni" className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Yeni kiralama
          </Link>
        )}
      </PageHeader>

      {forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line">
            <div role="tablist" aria-label="Kiralama görünümü" className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:px-4">
              {VIEW_LABELS.map(([v, label]) => {
                const n = count(v)
                return (
                  <button
                    key={v}
                    role="tab"
                    type="button"
                    aria-selected={view === v}
                    onClick={() => set({ view: v === 'active' ? undefined : v })}
                    className={cn('relative inline-flex h-11 shrink-0 items-center gap-1.5 px-2.5 text-[13.5px] font-medium whitespace-nowrap', view === v ? 'text-ink' : 'text-ink-2 hover:text-ink')}
                  >
                    {label}
                    {n !== undefined && n > 0 && (
                      <span className={cn('tnum rounded-full px-1.5 text-[11.5px] font-semibold', v === 'overdue' ? 'bg-alert-soft text-alert' : 'bg-ground text-ink-2')}>{n}</span>
                    )}
                    {view === v && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-blue" />}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="relative min-w-0 basis-full lg:w-[300px] lg:flex-none lg:basis-auto">
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                aria-label="Kiralamalarda ara"
                placeholder="Kiralama/rezervasyon no, müşteri, plaka, telefon"
                value={text}
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
              <input type="date" aria-label="Başlangıç günü" value={search.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-blue" />
              –
              <input type="date" aria-label="Bitiş günü" value={search.to ?? ''} min={search.from} onChange={(e) => set({ to: e.target.value || undefined })} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-blue" />
            </label>
            {(branches.data?.items.length ?? 0) > 1 && (
              <Select compact aria-label="Şube" value={search.branchId ?? ''} onChange={(e) => set({ branchId: e.target.value || undefined })} className={cn('w-auto max-w-[180px]', search.branchId && '[&_select]:border-ink-3/50 [&_select]:font-medium')}>
                <option value="">Tüm şubeler</option>
                {branches.data!.items.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setText('')
                  setQ('')
                  navigate({ search: (prev) => ({ view: prev.view, sort: prev.sort, dir: prev.dir, pageSize: prev.pageSize }), replace: true })
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 font-medium text-ink-2 hover:bg-ground hover:text-ink"
              >
                <X size={14} />
                Temizle
              </button>
            )}
          </div>
          <div className="flex items-start gap-4 border-b border-line-soft bg-ground/50 px-4 py-2 text-[12.5px] text-ink-2 sm:px-5">
            <p className="flex flex-1 items-start gap-2">
              <Info size={15} className="mt-px shrink-0 text-ink-3" />
              Saatler şubenin yerel saatidir. Fiyat, ödeme, depozito ve sözleşme Finans ve Sözleşme modülleriyle gelecek; bu listede gösterilmez.
            </p>
            <span className="tnum shrink-0 font-medium text-ink" aria-live="polite">
              {data ? `${data.total} kiralama` : ''}
            </span>
          </div>

          {list.isError ? (
            <div className="p-4">
              <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
            </div>
          ) : data && data.total === 0 ? (
            filtersActive || view !== 'active' ? (
              <StatePanel icon={MagnifyingGlass} title="Bu görünümde kiralama yok" className="rounded-none border-0">
                <p>Görünümü, aramayı veya filtreleri değiştirin.</p>
              </StatePanel>
            ) : (
              <StatePanel icon={Key} title="Etkin kiralama yok" className="rounded-none border-0">
                <p>{canManage ? 'Onaylı bir rezervasyonu kiralamaya dönüştürün veya doğrudan kiralama hazırlayın.' : 'Teslim bekleyen veya kirada araç bulunmuyor.'}</p>
                {canManage && (
                  <Link to="/kiralamalar/yeni" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                    <Plus size={15} weight="bold" />
                    Yeni kiralama
                  </Link>
                )}
              </StatePanel>
            )
          ) : (
            <div className="relative overflow-x-auto">
              <table className={cn('w-full table-fixed text-left transition-opacity sm:min-w-[560px]', list.isPlaceholderData && 'opacity-60')}>
                <thead>
                  <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                    <SortHeader label="No" sort="number" search={search} className="hidden w-[108px] sm:table-cell" />
                    <th scope="col" className="pr-3 pl-4 font-medium sm:px-3">
                      Müşteri
                    </th>
                    <th scope="col" className="hidden w-[20%] px-3 font-medium lg:table-cell">
                      Araç
                    </th>
                    <SortHeader label="Teslim → iade" sort="pickup" search={search} className="hidden w-[190px] md:table-cell" />
                    <th scope="col" className="hidden w-[110px] px-3 font-medium xl:table-cell">
                      Şube
                    </th>
                    <th scope="col" className="hidden w-[170px] pr-5 pl-3 font-medium md:table-cell">
                      Durum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {!data
                    ? Array.from({ length: 6 }, (_, i) => (
                        <tr key={i} className="h-[60px]">
                          <td colSpan={6} className="px-5">
                            <span className="block h-3 w-2/3 animate-pulse rounded bg-line-soft" />
                          </td>
                        </tr>
                      ))
                    : data.items.map((r) => <Row key={r.id} r={r} zone={zone} onOpen={() => open(r.id)} />)}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-ink-2 sm:px-5">
              <span className="tnum">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} / {data.total} kiralama
              </span>
              <div className="flex items-center gap-2">
                <Select compact aria-label="Sayfa başına kiralama" value={pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) === 25 ? undefined : Number(e.target.value) })} className="w-[118px]">
                  {RENTAL_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} / sayfa
                    </option>
                  ))}
                </Select>
                <span className="tnum px-1">
                  Sayfa {page} / {pages}
                </span>
                <div className="flex overflow-hidden rounded-lg border border-line">
                  <button type="button" aria-label="Önceki sayfa" disabled={page <= 1} onClick={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 > 1 ? page - 1 : undefined }), replace: true })} className="grid size-9 place-items-center text-ink-2 hover:bg-ground disabled:text-ink-3/50">
                    <CaretLeft size={14} />
                  </button>
                  <button type="button" aria-label="Sonraki sayfa" disabled={page >= pages} onClick={() => navigate({ search: (prev) => ({ ...prev, page: page + 1 }), replace: true })} className="grid size-9 place-items-center border-l border-line text-ink-2 hover:bg-ground disabled:text-ink-3/50">
                    <CaretRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
