import { CORPORATE_PAGE_SIZES, type CorporateListItem, type CorporateSort } from '@acarvo/shared'
import { Archive, Buildings, CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, EnvelopeSimple, MagnifyingGlass, Phone, Plus, X } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Select } from '@/components/fields'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, corporateApi } from '@/lib/api'
import { countryName, countryOptions } from '@/lib/customer-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { CorporateFormSheet } from './CorporateForm'
import { type CorporateListSearch, rememberedText, rememberListSearch, rememberText } from './search'

const FILTER_KEYS = ['country', 'status', 'people'] as const

function SortHeader({ label, sort, search, className }: { label: string; sort: CorporateSort; search: CorporateListSearch; className?: string }) {
  const navigate = useNavigate({ from: '/kurumsal-hesaplar' })
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
      className={cn('w-auto max-w-[190px] [&_select]:truncate', value && '[&_select]:border-ink-3/50 [&_select]:font-medium')}
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
            <span className="block h-3 w-44 animate-pulse rounded bg-line-soft" />
          </td>
          <td colSpan={4} className="px-3">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-line-soft" />
          </td>
        </tr>
      ))}
    </>
  )
}

function peopleText(a: CorporateListItem) {
  if (!a.peopleCount) return 'Bağlı kişi yok'
  return a.driverCount ? `${a.peopleCount} kişi · ${a.driverCount} sürücü` : `${a.peopleCount} kişi`
}

function AccountRow({ a, onOpen }: { a: CorporateListItem; onOpen: () => void }) {
  const archived = a.status === 'archived'
  const ContactIcon = a.primaryContact?.kind === 'email' ? EnvelopeSimple : Phone
  return (
    <tr onClick={onOpen} className={cn('group h-[56px] cursor-pointer hover:bg-blue-soft/35', archived && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{a.accountNo}</span>
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <Link
          to="/kurumsal-hesaplar/$accountId"
          params={{ accountId: a.id }}
          onClick={(e) => e.stopPropagation()}
          className={cn('block font-medium leading-snug break-words group-hover:text-blue-ink hover:underline focus-visible:underline', archived ? 'text-ink-2' : 'text-ink')}
        >
          {a.legalName}
        </Link>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2">
          <span className="tnum sm:hidden">{a.accountNo} · </span>
          {a.tradeName ?? countryName(a.country)}
          <span className="md:hidden"> · {peopleText(a)}</span>
          {archived && <span className="font-medium sm:hidden"> · Arşivde</span>}
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight lg:table-cell">
        {a.primaryTaxId ? (
          <>
            <span className="tnum block truncate text-ink">{a.primaryTaxId.value}</span>
            <span className="mt-0.5 block truncate text-[13px] text-ink-2">
              {a.primaryTaxId.scheme} · {countryName(a.primaryTaxId.country)}
            </span>
          </>
        ) : (
          <span className="text-[13px] text-ink-3">Vergi kimliği yok</span>
        )}
      </td>
      <td className="hidden px-3 py-2 xl:table-cell">
        {a.primaryContact ? (
          <span className="flex min-w-0 items-center gap-1.5 text-ink">
            <ContactIcon size={14} className="shrink-0 text-ink-3" />
            <span className="tnum truncate">{a.primaryContact.value}</span>
          </span>
        ) : (
          <span className="text-[13px] text-ink-3">İletişim yok</span>
        )}
      </td>
      <td className="hidden px-3 whitespace-nowrap text-ink-2 md:table-cell">{peopleText(a)}</td>
      <td className="hidden pr-5 pl-3 whitespace-nowrap sm:table-cell">
        {archived ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
            <Archive size={14} />
            Arşivde
          </span>
        ) : (
          <span className="text-ink-2">{countryName(a.country)}</span>
        )}
      </td>
    </tr>
  )
}

/** Kurumsal Hesaplar: the company's commercial customers, searched and paged on the server (plan M3 §4). */
export function CorporatePage() {
  const session = useSession()
  const companyId = session.company?.id
  const search = useSearch({ from: '/app/kurumsal-hesaplar' })
  const navigate = useNavigate({ from: '/kurumsal-hesaplar' })
  const canManage = can(session, 'corporate.manage')
  const pageSize = search.pageSize ?? 25
  const page = search.page ?? 1
  const [text, setText] = useState(() => rememberedText(companyId))
  const [q, setQ] = useState(() => rememberedText(companyId).trim())
  const [creating, setCreating] = useState(false)
  const countries = useMemo(() => countryOptions(session.company?.country), [session.company?.country])
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

  const body = { q: q || undefined, country: search.country, status: search.status ?? 'active', people: search.people, sort: search.sort ?? 'name', dir: search.dir ?? 'asc', page, pageSize }
  const list = useQuery({
    // The query key holds the search text in memory only; it is sent in the request body.
    queryKey: ['corporate-accounts', companyId, body],
    queryFn: () => corporateApi.search(body),
    placeholderData: keepPreviousData,
  })

  const set = (patch: Partial<CorporateListSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }), replace: true })
  const filtersActive = FILTER_KEYS.some((k) => search[k] !== undefined) || q !== ''
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const data = list.data
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const from = data && data.total ? (page - 1) * pageSize + 1 : 0
  const to = data ? Math.min(page * pageSize, data.total) : 0
  const open = (id: string) => navigate({ to: '/kurumsal-hesaplar/$accountId', params: { accountId: id } })
  const statusLabel = search.status === 'archived' ? 'arşivdeki hesap' : 'kurumsal hesap'

  return (
    <div className="space-y-5">
      <PageHeader title="Kurumsal Hesaplar" description={session.company ? `${session.company.name} · çalıştığınız şirketler, bağlı kişileri ve sürücüleri` : undefined}>
        {canManage && (
          <button type="button" onClick={() => setCreating(true)} className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Yeni kurumsal hesap
          </button>
        )}
      </PageHeader>

      {forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="relative min-w-0 basis-full lg:w-[320px] lg:flex-none lg:basis-auto">
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                aria-label="Kurumsal hesaplarda ara"
                placeholder="Unvan, hesap no, vergi kimliği veya iletişim"
                value={text}
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
              />
            </div>
            <FilterSelect label="Ülke" value={search.country} onChange={(country) => set({ country })}>
              <option value="">Ülke: tümü</option>
              {countries.frequent.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
              <option disabled>──────────</option>
              {countries.all.map((c) => (
                <option key={`a-${c.code}`} value={c.code}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Kişiler" value={search.people} onChange={(people) => set({ people: people as CorporateListSearch['people'] })}>
              <option value="">Kişiler: tümü</option>
              <option value="with_drivers">Yetkili sürücüsü olanlar</option>
              <option value="without_people">Bağlı kişisi olmayanlar</option>
            </FilterSelect>
            <FilterSelect label="Durum" value={search.status} onChange={(status) => set({ status: status as CorporateListSearch['status'] })}>
              <option value="">Etkin hesaplar</option>
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
            <span className="tnum ml-auto hidden shrink-0 text-[13px] font-medium text-ink sm:block" aria-live="polite">
              {data ? `${data.total} ${statusLabel}` : ''}
            </span>
          </div>

          {list.isError ? (
            <div className="p-4">
              <ErrorState message={list.error.message} onRetry={() => list.refetch()} />
            </div>
          ) : data && data.total === 0 ? (
            filtersActive ? (
              <StatePanel icon={MagnifyingGlass} title="Aramaya uyan kurumsal hesap yok" className="rounded-none border-0">
                <p>Aramayı veya filtreleri değiştirin. Arşivdeki hesaplar için durum filtresini kullanın.</p>
              </StatePanel>
            ) : (
              <StatePanel icon={Buildings} title="Henüz kurumsal hesap yok" className="rounded-none border-0">
                <p>{canManage ? 'Çalıştığınız ilk şirketi ekleyerek başlayın. Kişileri ve sürücüleri mevcut müşteri kayıtlarından bağlarsınız.' : 'Şirketinizde kayıtlı kurumsal hesap bulunmuyor.'}</p>
                {canManage && (
                  <button type="button" onClick={() => setCreating(true)} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                    <Plus size={15} weight="bold" />
                    Yeni kurumsal hesap
                  </button>
                )}
              </StatePanel>
            )
          ) : (
            <div className="relative overflow-x-auto">
              <table className={cn('w-full table-fixed text-left transition-opacity sm:min-w-[560px]', list.isPlaceholderData && 'opacity-60')}>
                <thead>
                  <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                    <SortHeader label="No" sort="accountNo" search={search} className="hidden w-[96px] sm:table-cell" />
                    <SortHeader label="Kurumsal hesap" sort="name" search={search} className="pl-4 sm:pl-3" />
                    <th scope="col" className="hidden w-[20%] px-3 font-medium lg:table-cell">
                      Birincil vergi kimliği
                    </th>
                    <th scope="col" className="hidden w-[22%] px-3 font-medium xl:table-cell">
                      Birincil iletişim
                    </th>
                    <th scope="col" className="hidden w-[150px] px-3 font-medium md:table-cell">
                      Kişiler
                    </th>
                    <th scope="col" className="hidden w-[130px] pr-5 pl-3 font-medium sm:table-cell">
                      Ülke / durum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">{!data ? <SkeletonRows /> : data.items.map((a) => <AccountRow key={a.id} a={a} onOpen={() => open(a.id)} />)}</tbody>
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
                  aria-label="Sayfa başına hesap"
                  value={pageSize}
                  onChange={(e) => set({ pageSize: Number(e.target.value) === 25 ? undefined : Number(e.target.value) })}
                  className="w-[118px]"
                >
                  {CORPORATE_PAGE_SIZES.map((n) => (
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

      {creating && <CorporateFormSheet mode="create" onClose={() => setCreating(false)} onSaved={(a) => open(a.id)} />}
    </div>
  )
}
