import { RESERVATION_PAGE_SIZES, type ReservationListItem, type ReservationSort, todayIn } from '@acarvo/shared'
import { Buildings, CalendarCheck, CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, Info, ListBullets, MagnifyingGlass, Plus, Rows, X } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Select } from '@/components/fields'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, reservationsApi, vehiclesApi } from '@/lib/api'
import { formatMoment, RESERVATION_STATUS_LABELS } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { StatusBadge } from './ReservationParts'
import { ReservationTimeline } from './ReservationTimeline'
import { type ReservationListSearch, rememberedText, rememberListSearch, rememberText } from './search'

const FILTER_KEYS = ['status', 'from', 'to', 'branchId', 'vehicleClassId', 'assigned'] as const

function SortHeader({ label, sort, search, className }: { label: string; sort: ReservationSort; search: ReservationListSearch; className?: string }) {
  const navigate = useNavigate({ from: '/rezervasyonlar' })
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

function FilterSelect({ label, value, onChange, children }: { label: string; value?: string; onChange: (v?: string) => void; children: ReactNode }) {
  return (
    <Select compact aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={cn('w-auto max-w-[180px] [&_select]:truncate', value && '[&_select]:border-ink-3/50 [&_select]:font-medium')}>
      {children}
    </Select>
  )
}

function Row({ r, onOpen, zone }: { r: ReservationListItem; onOpen: () => void; zone?: string }) {
  const closed = r.status === 'cancelled' || r.status === 'no_show'
  return (
    <tr onClick={onOpen} className={cn('group h-[60px] cursor-pointer hover:bg-blue-soft/35', closed && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{r.reservationNo}</span>
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <Link
          to="/rezervasyonlar/$reservationId"
          params={{ reservationId: r.id }}
          onClick={(e) => e.stopPropagation()}
          className={cn('block truncate font-medium group-hover:text-blue-ink hover:underline', closed ? 'text-ink-2' : 'text-ink')}
          title={r.customer.displayName}
        >
          {r.customer.displayName}
        </Link>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[12.5px] text-ink-2">
          <span className="tnum sm:hidden">{r.reservationNo} · </span>
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
          <StatusBadge status={r.status} /> <span className="tnum text-ink-2">· {formatMoment(r.pickup, zone)}</span>
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight lg:table-cell">
        {r.vehicle ? (
          <>
            <span className="tnum block truncate font-medium text-ink">{r.vehicle.plate}</span>
            <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
              {r.vehicle.make} {r.vehicle.model} · {r.vehicleClass.name}
            </span>
          </>
        ) : (
          <>
            <span className="block truncate text-ink">{r.vehicleClass.name}</span>
            <span className="mt-0.5 block text-[12.5px] text-hold">Araç atanmadı</span>
          </>
        )}
      </td>
      <td className="hidden px-3 py-2 leading-tight md:table-cell">
        <span className="tnum block whitespace-nowrap text-ink">{formatMoment(r.pickup, zone)}</span>
        <span className="tnum mt-0.5 block text-[12.5px] whitespace-nowrap text-ink-2">→ {formatMoment(r.return, zone)}</span>
      </td>
      <td className="hidden px-3 py-2 xl:table-cell">
        <span className="flex items-center gap-1.5 text-[13px]">
          <span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{r.pickupBranch.code}</span>
          {r.returnBranch.id !== r.pickupBranch.id && (
            <>
              →<span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{r.returnBranch.code}</span>
            </>
          )}
        </span>
      </td>
      <td className="hidden pr-5 pl-3 md:table-cell">
        <StatusBadge status={r.status} className="text-[13px]" />
      </td>
    </tr>
  )
}

/** Rezervasyonlar: list with filters, or a 14-day vehicle timeline. Price is not shown: the pricing module does not exist yet. */
export function ReservationsPage() {
  const session = useSession()
  const companyId = session.company?.id
  const zone = session.company?.timezone
  const search = useSearch({ from: '/app/rezervasyonlar' })
  const navigate = useNavigate({ from: '/rezervasyonlar' })
  const canManage = can(session, 'reservations.manage')
  const pageSize = search.pageSize ?? 25
  const page = search.page ?? 1
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

  const branches = useQuery({ queryKey: ['reservation-branches', companyId], queryFn: () => reservationsApi.branches() })
  const classes = useQuery({ queryKey: ['vehicle-classes', companyId], queryFn: () => vehiclesApi.classes() })
  const timelineView = search.view === 'takvim'
  const body = { q: q || undefined, status: search.status ?? 'active', from: search.from, to: search.to, branchId: search.branchId, vehicleClassId: search.vehicleClassId, assigned: search.assigned, sort: search.sort ?? 'pickup', dir: search.dir ?? 'asc', page, pageSize }
  const list = useQuery({ queryKey: ['reservations', companyId, body], queryFn: () => reservationsApi.search(body), placeholderData: keepPreviousData, enabled: !timelineView })
  const set = (patch: Partial<ReservationListSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }), replace: true })
  const filtersActive = FILTER_KEYS.some((k) => search[k] !== undefined) || q !== ''
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const open = (id: string) => navigate({ to: '/rezervasyonlar/$reservationId', params: { reservationId: id } })

  return (
    <div className="space-y-5">
      <PageHeader title="Rezervasyonlar" description={session.company ? `${session.company.name} · bekleyen ve onaylı rezervasyonlar, araç planı` : undefined}>
        {canManage && (
          <Link to="/rezervasyonlar/yeni" className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Yeni rezervasyon
          </Link>
        )}
      </PageHeader>

      <div role="tablist" aria-label="Görünüm" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
        {[
          [false, 'Liste', ListBullets],
          [true, 'Zaman çizelgesi', Rows],
        ].map(([isTimeline, label, Ico]) => (
          <button
            key={label as string}
            role="tab"
            type="button"
            aria-selected={timelineView === isTimeline}
            onClick={() => set({ view: isTimeline ? 'takvim' : undefined })}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13.5px] font-medium', timelineView === isTimeline ? 'bg-blue-soft text-blue-ink' : 'text-ink-2 hover:text-ink')}
          >
            {(() => {
              const I = Ico as typeof Rows
              return <I size={15} />
            })()}
            {label as string}
          </button>
        ))}
      </div>

      {timelineView ? (
        <ReservationTimeline branches={branches.data?.items ?? []} classes={classes.data?.items ?? []} today={zone ? todayIn(zone) : new Date().toISOString().slice(0, 10)} />
      ) : forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="relative min-w-0 basis-full lg:w-[280px] lg:flex-none lg:basis-auto">
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                aria-label="Rezervasyonlarda ara"
                placeholder="Rezervasyon no, müşteri, plaka veya telefon"
                value={text}
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
              />
            </div>
            <FilterSelect label="Durum" value={search.status} onChange={(status) => set({ status: status as ReservationListSearch['status'] })}>
              <option value="">Etkin (bekleyen ve onaylı)</option>
              {(['pending', 'confirmed', 'cancelled', 'no_show'] as const).map((s) => (
                <option key={s} value={s}>
                  {RESERVATION_STATUS_LABELS[s]}
                </option>
              ))}
              <option value="all">Tümü</option>
            </FilterSelect>
            <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
              <span className="sr-only">Başlangıç günü</span>
              <input type="date" aria-label="Başlangıç günü" value={search.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-blue" />
              –
              <input type="date" aria-label="Bitiş günü" value={search.to ?? ''} min={search.from} onChange={(e) => set({ to: e.target.value || undefined })} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-blue" />
            </label>
            {(branches.data?.items.length ?? 0) > 1 && (
              <FilterSelect label="Şube" value={search.branchId} onChange={(branchId) => set({ branchId })}>
                <option value="">Tüm şubeler</option>
                {branches.data!.items.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Araç sınıfı" value={search.vehicleClassId} onChange={(vehicleClassId) => set({ vehicleClassId })}>
              <option value="">Tüm sınıflar</option>
              {classes.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Araç ataması" value={search.assigned} onChange={(assigned) => set({ assigned: assigned as ReservationListSearch['assigned'] })}>
              <option value="">Araç: tümü</option>
              <option value="yes">Araç atanmış</option>
              <option value="no">Araç atanmamış</option>
            </FilterSelect>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setText('')
                  setQ('')
                  navigate({ search: (prev) => ({ sort: prev.sort, dir: prev.dir, pageSize: prev.pageSize }), replace: true })
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
              Saatler şubenin yerel saatidir. Fiyat ve kaparo Fiyatlandırma ve Finans modülleriyle gelecek; bu listede fiyat gösterilmez.
            </p>
            <span className="tnum shrink-0 font-medium text-ink" aria-live="polite">
              {data ? `${data.total} rezervasyon` : ''}
            </span>
          </div>

          {list.isError ? (
            <div className="p-4">
              <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
            </div>
          ) : data && data.total === 0 ? (
            filtersActive ? (
              <StatePanel icon={MagnifyingGlass} title="Aramaya uyan rezervasyon yok" className="rounded-none border-0">
                <p>Aramayı veya filtreleri değiştirin. İptal edilenler için durum filtresini kullanın.</p>
              </StatePanel>
            ) : (
              <StatePanel icon={CalendarCheck} title="Henüz rezervasyon yok" className="rounded-none border-0">
                <p>{canManage ? 'İlk rezervasyonu oluşturarak başlayın.' : 'Etkin rezervasyon bulunmuyor.'}</p>
                {canManage && (
                  <Link to="/rezervasyonlar/yeni" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                    <Plus size={15} weight="bold" />
                    Yeni rezervasyon
                  </Link>
                )}
              </StatePanel>
            )
          ) : (
            <div className="relative overflow-x-auto">
              <table className={cn('w-full table-fixed text-left transition-opacity sm:min-w-[560px]', list.isPlaceholderData && 'opacity-60')}>
                <thead>
                  <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                    <SortHeader label="No" sort="number" search={search} className="hidden w-[100px] sm:table-cell" />
                    <th scope="col" className="pr-3 pl-4 font-medium sm:px-3">
                      Müşteri
                    </th>
                    <th scope="col" className="hidden w-[20%] px-3 font-medium lg:table-cell">
                      Araç / sınıf
                    </th>
                    <SortHeader label="Alış → iade" sort="pickup" search={search} className="hidden w-[170px] md:table-cell" />
                    <th scope="col" className="hidden w-[110px] px-3 font-medium xl:table-cell">
                      Şube
                    </th>
                    <th scope="col" className="hidden w-[130px] pr-5 pl-3 font-medium md:table-cell">
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
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} / {data.total} rezervasyon
              </span>
              <div className="flex items-center gap-2">
                <Select compact aria-label="Sayfa başına rezervasyon" value={pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) === 25 ? undefined : Number(e.target.value) })} className="w-[118px]">
                  {RESERVATION_PAGE_SIZES.map((n) => (
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
