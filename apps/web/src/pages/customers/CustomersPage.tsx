import { CUSTOMER_PAGE_SIZES, type CustomerListItem, type CustomerSort } from '@acarvo/shared'
import { Archive, CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, Info, MagnifyingGlass, Plus, Users, X } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Select } from '@/components/fields'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, customersApi } from '@/lib/api'
import { countryName, RESIDENCY_LABELS } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { CustomerFormSheet } from './CustomerForm'
import { type CustomerListSearch, rememberedText, rememberListSearch, rememberText } from './search'

const FILTER_KEYS = ['residency', 'status', 'branchId'] as const

function SortHeader({ label, sort, search, className }: { label: string; sort: CustomerSort; search: CustomerListSearch; className?: string }) {
  const navigate = useNavigate({ from: '/musteriler' })
  const active = (search.sort ?? 'name') === sort
  const dir = active ? (search.dir ?? 'asc') : undefined
  const Icon = dir === 'asc' ? CaretUp : dir === 'desc' ? CaretDown : CaretUpDown
  return (
    <th scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={cn('px-3 font-medium first:pl-5', className)}>
      <button
        type="button"
        onClick={() =>
          navigate({
            search: (prev) => ({ ...prev, sort: sort === 'name' && dir === 'desc' ? undefined : sort, dir: active && dir === 'asc' ? 'desc' : undefined, page: undefined }),
            replace: true,
          })
        }
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
    <Select
      compact
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={cn('w-auto max-w-[170px] [&_select]:truncate', value && '[&_select]:border-ink-3/50 [&_select]:font-medium')}
    >
      {children}
    </Select>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="h-[56px]">
          <td className="pl-5">
            <span className="block h-3 w-16 animate-pulse rounded bg-line-soft" />
          </td>
          <td className="px-3">
            <span className="block h-3 w-40 animate-pulse rounded bg-line-soft" />
          </td>
          <td colSpan={5} className="px-3">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-line-soft" />
          </td>
        </tr>
      ))}
    </>
  )
}

function CustomerRow({ c, onOpen }: { c: CustomerListItem; onOpen: () => void }) {
  const archived = c.status === 'archived'
  return (
    <tr onClick={onOpen} className={cn('group h-[56px] cursor-pointer hover:bg-blue-soft/35', archived && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{c.customerNo}</span>
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <Link
          to="/musteriler/$customerId"
          params={{ customerId: c.id }}
          onClick={(e) => e.stopPropagation()}
          className={cn('block truncate font-medium group-hover:text-blue-ink hover:underline focus-visible:underline', archived ? 'text-ink-2' : 'text-ink')}
          title={c.displayName}
        >
          {c.displayName}
        </Link>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2 lg:hidden">
          <span className="tnum sm:hidden">{c.customerNo} · </span>
          {c.phone ?? c.email ?? '—'}
          {archived && <span className="font-medium sm:hidden"> · Arşivde</span>}
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight lg:table-cell">
        {c.phone ? <span className="tnum block truncate text-ink">{c.phone}</span> : <span className="block text-[13px] text-ink-3">Telefon yok</span>}
        <span className="mt-0.5 block truncate text-[13px] text-ink-2" title={c.email ?? undefined}>
          {c.email ?? 'E-posta yok'}
        </span>
      </td>
      <td className="py-2 pr-4 pl-3 leading-tight sm:px-3">
        <span className="block text-ink">{RESIDENCY_LABELS[c.residency]}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2">{countryName(c.nationality) ?? 'Uyruk girilmemiş'}</span>
      </td>
      <td className="hidden px-3 xl:table-cell">
        {c.createdBranch ? (
          <span className="flex items-center gap-2 text-ink" title={c.createdBranch.name}>
            <span className="shrink-0 rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em]">{c.createdBranch.code}</span>
            {/* Long names wrap inside the row instead of being cut off. */}
            <span className="min-w-0 leading-tight break-words">{c.createdBranch.name}</span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-3">Belirtilmemiş</span>
        )}
      </td>
      <td className="tnum hidden px-3 whitespace-nowrap text-ink-2 md:table-cell">{formatDate(c.createdAt)}</td>
      <td className="hidden pr-5 pl-3 whitespace-nowrap sm:table-cell">
        {archived ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
            <Archive size={14} />
            Arşivde
          </span>
        ) : (
          <span className="text-ink-2">Etkin</span>
        )}
      </td>
    </tr>
  )
}

/** Müşteriler: the company's people, from every branch (plan §9.2), searched and paged on the server. */
export function CustomersPage() {
  const session = useSession()
  const companyId = session.company?.id
  const search = useSearch({ from: '/app/musteriler' })
  const navigate = useNavigate({ from: '/musteriler' })
  const canManage = can(session, 'customers.manage')
  const pageSize = search.pageSize ?? 25
  const page = search.page ?? 1
  const [text, setText] = useState(() => rememberedText(companyId))
  const [q, setQ] = useState(() => rememberedText(companyId).trim())
  const [creating, setCreating] = useState(false)
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

  const body = { q: q || undefined, residency: search.residency, status: search.status ?? 'active', branchId: search.branchId, sort: search.sort ?? 'name', dir: search.dir ?? 'asc', page, pageSize }
  const list = useQuery({
    // The query key holds the search text in memory only; it is sent in the request body.
    queryKey: ['customers', companyId, body],
    queryFn: () => customersApi.search(body),
    placeholderData: keepPreviousData,
  })

  const set = (patch: Partial<CustomerListSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }), replace: true })
  const filtersActive = FILTER_KEYS.some((k) => search[k] !== undefined) || q !== ''
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const from = data && data.total ? (page - 1) * pageSize + 1 : 0
  const to = data ? Math.min(page * pageSize, data.total) : 0
  const open = (id: string) => navigate({ to: '/musteriler/$customerId', params: { customerId: id } })
  const statusLabel = search.status === 'archived' ? 'arşivdeki müşteri' : 'müşteri'

  return (
    <div className="space-y-5">
      <PageHeader title="Müşteriler" description={session.company ? `${session.company.name} · şirketin tüm şubelerindeki müşteri kayıtları` : undefined}>
        {canManage && (
          <button type="button" onClick={() => setCreating(true)} className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Yeni müşteri
          </button>
        )}
      </PageHeader>

      {forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="relative min-w-0 basis-full lg:w-[300px] lg:flex-none lg:basis-auto">
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                aria-label="Müşterilerde ara"
                placeholder="Ad, müşteri no, telefon veya e-posta"
                value={text}
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
              />
            </div>
            <FilterSelect label="Yerli veya yabancı" value={search.residency} onChange={(residency) => set({ residency: residency as CustomerListSearch['residency'] })}>
              <option value="">Yerli ve yabancı</option>
              <option value="local">Yerli</option>
              <option value="foreign">Yabancı</option>
            </FilterSelect>
            {session.branches.length > 1 && (
              <FilterSelect label="Kayıt şubesi" value={search.branchId} onChange={(branchId) => set({ branchId })}>
                <option value="">Tüm kayıt şubeleri</option>
                {session.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Durum" value={search.status} onChange={(status) => set({ status: status as CustomerListSearch['status'] })}>
              <option value="">Etkin müşteriler</option>
              <option value="archived">Arşivdekiler</option>
              <option value="all">Tümü</option>
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
              Kimlik ve ehliyet belgeleri, kurumsal hesap bağlantıları ve kiralama geçmişi ilgili aşamalar geliştirildiğinde bu listede gösterilecek.
            </p>
            <span className="tnum shrink-0 font-medium text-ink" aria-live="polite">
              {data ? `${data.total} ${statusLabel}` : ''}
            </span>
          </div>

          {list.isError ? (
            <div className="p-4">
              <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
            </div>
          ) : data && data.total === 0 ? (
            filtersActive ? (
              <StatePanel icon={MagnifyingGlass} title="Aramaya uyan müşteri yok" className="rounded-none border-0">
                <p>Aramayı veya filtreleri değiştirin. Arşivdeki kayıtlar için durum filtresini kullanın.</p>
              </StatePanel>
            ) : (
              <StatePanel icon={Users} title="Henüz müşteri yok" className="rounded-none border-0">
                <p>{canManage ? 'İlk müşteri kaydını oluşturarak başlayın.' : 'Şirketinizde kayıtlı müşteri bulunmuyor.'}</p>
                {canManage && (
                  <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                    <Plus size={15} weight="bold" />
                    Yeni müşteri
                  </button>
                )}
              </StatePanel>
            )
          ) : (
            <div className="relative overflow-x-auto">
              {/* On phones the table scrolls inside its card instead of squeezing the name column. */}
              <table className={cn('w-full table-fixed sm:min-w-[560px] text-left transition-opacity', list.isPlaceholderData && 'opacity-60')}>
                <thead>
                  <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                    <SortHeader label="No" sort="customerNo" search={search} className="hidden w-[108px] sm:table-cell" />
                    <SortHeader label="Müşteri" sort="name" search={search} className="pl-4 sm:pl-3" />
                    <th scope="col" className="hidden w-[19%] px-3 font-medium lg:table-cell">
                      İletişim
                    </th>
                    <th scope="col" className="w-[124px] pr-4 pl-3 font-medium sm:px-3">
                      Yerli / yabancı
                    </th>
                    <th scope="col" className="hidden w-[200px] px-3 font-medium xl:table-cell">
                      Kayıt şubesi
                    </th>
                    <SortHeader label="Kayıt" sort="created" search={search} className="hidden w-[96px] md:table-cell" />
                    <th scope="col" className="hidden w-[88px] pr-5 pl-3 font-medium sm:table-cell">
                      Durum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">{!data ? <SkeletonRows /> : data.items.map((c) => <CustomerRow key={c.id} c={c} onOpen={() => open(c.id)} />)}</tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-ink-2 sm:px-5">
              <span className="tnum">
                {from}–{to} / {data.total} {statusLabel}
              </span>
              <div className="flex items-center gap-2">
                <Select
                  compact
                  aria-label="Sayfa başına müşteri"
                  value={pageSize}
                  onChange={(e) => set({ pageSize: Number(e.target.value) === 25 ? undefined : Number(e.target.value) })}
                  className="w-[118px]"
                >
                  {CUSTOMER_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} / sayfa
                    </option>
                  ))}
                </Select>
                <span className="tnum px-1">
                  Sayfa {page} / {pages}
                </span>
                <div className="flex overflow-hidden rounded-lg border border-line">
                  <button
                    type="button"
                    aria-label="Önceki sayfa"
                    disabled={page <= 1}
                    onClick={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 > 1 ? page - 1 : undefined }), replace: true })}
                    className="grid size-9 place-items-center text-ink-2 hover:bg-ground hover:text-ink disabled:pointer-events-none disabled:text-ink-3/50"
                  >
                    <CaretLeft size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Sonraki sayfa"
                    disabled={page >= pages}
                    onClick={() => navigate({ search: (prev) => ({ ...prev, page: page + 1 }), replace: true })}
                    className="grid size-9 place-items-center border-l border-line text-ink-2 hover:bg-ground hover:text-ink disabled:pointer-events-none disabled:text-ink-3/50"
                  >
                    <CaretRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {creating && <CustomerFormSheet mode="create" onClose={() => setCreating(false)} onSaved={(c) => open(c.id)} />}
    </div>
  )
}
