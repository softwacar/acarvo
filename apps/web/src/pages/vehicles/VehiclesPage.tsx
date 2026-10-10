import { FUEL_TYPES, PAGE_SIZES, TRANSMISSIONS, VEHICLE_STATUSES, type VehicleListItem, type VehicleSort } from '@acarvo/shared'
import { CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, CarProfile, Info, MagnifyingGlass, PencilSimple, Plus, Wrench, X } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Select } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, vehiclesApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FUEL_LABELS, formatDate, formatKm, LOCATION_LABELS, STATUS_LABELS, TRANSMISSION_LABELS } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'
import { rememberListSearch, type VehicleSearch } from './search'

const FILTER_KEYS = ['q', 'classId', 'branchId', 'status', 'fuelType', 'transmission'] as const

function SortHeader({
  label,
  sort,
  search,
  align = 'left',
  className,
}: {
  label: string
  sort: VehicleSort
  search: VehicleSearch
  align?: 'left' | 'right'
  className?: string
}) {
  const navigate = useNavigate({ from: '/araclar' })
  const active = (search.sort ?? 'plate') === sort
  const dir = active ? (search.dir ?? 'asc') : undefined
  const Icon = dir === 'asc' ? CaretUp : dir === 'desc' ? CaretDown : CaretUpDown
  return (
    <th scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={cn('px-3 font-medium first:pl-5', className)}>
      <button
        type="button"
        onClick={() =>
          navigate({
            search: (prev) => ({ ...prev, sort: sort === 'plate' && dir === 'desc' ? undefined : sort, dir: active && dir === 'asc' ? 'desc' : undefined, page: undefined }),
            replace: true,
          })
        }
        className={cn('-mx-1 inline-flex h-7 items-center gap-1 rounded px-1 hover:text-ink', active && 'text-ink', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        <Icon size={11} weight="bold" className={active ? 'text-ink' : 'text-ink-3/60'} />
      </button>
    </th>
  )
}

function SearchBox({ value }: { value?: string }) {
  const navigate = useNavigate({ from: '/araclar' })
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  useEffect(() => {
    if ((value ?? '') === text.trim()) return
    const t = setTimeout(() => navigate({ search: (prev) => ({ ...prev, q: text.trim() || undefined, page: undefined }), replace: true }), 250)
    return () => clearTimeout(t)
  }, [text, value, navigate])
  return (
    <div className="relative min-w-0 basis-full lg:w-[248px] lg:flex-none lg:basis-auto">
      <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        aria-label="Araçlarda ara"
        placeholder="Plaka, kod, marka, model"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15"
      />
    </div>
  )
}

function FilterSelect({ label, value, onChange, children }: { label: string; value?: string; onChange: (v?: string) => void; children: ReactNode }) {
  return (
    <Select
      compact
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={cn('w-auto max-w-[146px] [&_select]:truncate', value && '[&_select]:border-ink-3/50 [&_select]:font-medium')}
    >
      {children}
    </Select>
  )
}

function StatusText({ status }: { status: VehicleListItem['status'] }) {
  if (status === 'active') return <span className="text-ink-2">{STATUS_LABELS.active}</span>
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-hold">
      <Wrench size={14} weight="bold" />
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Home branch (security/ownership) and last recorded physical location are different facts; the second line says where the car is. */
function BranchCell({ v }: { v: VehicleListItem }) {
  const where = v.location ? (v.location.type === 'branch' ? v.location.branchName : LOCATION_LABELS[v.location.type]) : null
  const away = v.location && (v.location.type !== 'branch' || v.location.branchName !== v.homeBranch.name)
  return (
    <span className="block leading-tight">
      <span className="flex items-center gap-2 text-ink">
        <span className="rounded-[4px] border border-line px-1 text-[11px] font-semibold tracking-[0.05em] text-ink">{v.homeBranch.code}</span>
        <span className="truncate">{v.homeBranch.name}</span>
      </span>
      <span className="mt-0.5 block truncate text-[13px] text-ink-2">
        {!v.location ? (
          'Konum kaydı yok'
        ) : away ? (
          <>
            Şu an <span className="font-medium text-hold">{where}</span> · <span className="tnum">{formatDate(v.location.at)}</span>
          </>
        ) : (
          <>
            Şubede · <span className="tnum">{formatDate(v.location.at)}</span>
          </>
        )}
      </span>
    </span>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className="h-[52px]">
          <td className="pl-5">
            <span className="block h-[26px] w-[104px] animate-pulse rounded-[5px] bg-line-soft" />
          </td>
          <td className="px-3">
            <span className="block h-3 w-40 animate-pulse rounded bg-line-soft" />
          </td>
          <td colSpan={7} className="px-3">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-line-soft" />
          </td>
        </tr>
      ))}
    </>
  )
}

/** Araçlar: fleet master list (spec §13.1) from the database, filtered, sorted and paged on the server. */
export function VehiclesPage() {
  const session = useSession()
  const search = useSearch({ from: '/app/araclar' })
  const navigate = useNavigate({ from: '/araclar' })
  const canCreate = can(session, 'vehicles.create')
  const canEdit = can(session, 'vehicles.update')
  const pageSize = search.pageSize ?? 25
  const page = search.page ?? 1
  useEffect(() => rememberListSearch(search), [search])

  const q = useQuery({
    queryKey: ['vehicles', session.company?.id, search],
    queryFn: () => vehiclesApi.list({ ...search, pageSize, page }),
    placeholderData: keepPreviousData,
  })
  const classes = useQuery({ queryKey: ['vehicle-classes', session.company?.id], queryFn: vehiclesApi.classes })

  const set = (patch: Partial<VehicleSearch>) => navigate({ search: (prev) => ({ ...prev, ...patch, page: undefined }), replace: true })
  const filtersActive = FILTER_KEYS.some((k) => search[k] !== undefined)
  const forbidden = q.error instanceof ApiRequestError && q.error.status === 403
  const data = q.data
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1
  const from = data && data.total ? (page - 1) * pageSize + 1 : 0
  const to = data ? Math.min(page * pageSize, data.total) : 0
  const open360 = (id: string) => navigate({ to: '/araclar/$vehicleId', params: { vehicleId: id } })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Araçlar"
        description={session.company ? `${session.company.name} filosu${session.allBranches ? '' : ` · ${session.branches.map((b) => b.name).join(', ')}`}` : undefined}
      >
        {canCreate && (
          <Link to="/araclar/yeni" className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Yeni araç
          </Link>
        )}
      </PageHeader>

      {forbidden ? (
        <ForbiddenState message={(q.error as ApiRequestError).message} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <SearchBox value={search.q} />
            <FilterSelect label="Sınıf" value={search.classId} onChange={(classId) => set({ classId })}>
              <option value="">Tüm sınıflar</option>
              {classes.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FilterSelect>
            {session.branches.length > 1 && (
              <FilterSelect label="Ana şube" value={search.branchId} onChange={(branchId) => set({ branchId })}>
                <option value="">Tüm şubeler</option>
                {session.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect label="Kullanım durumu" value={search.status} onChange={(status) => set({ status: status as VehicleSearch['status'] })}>
              <option value="">Tüm durumlar</option>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Yakıt" value={search.fuelType} onChange={(fuelType) => set({ fuelType: fuelType as VehicleSearch['fuelType'] })}>
              <option value="">Tüm yakıtlar</option>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {FUEL_LABELS[f]}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Vites" value={search.transmission} onChange={(transmission) => set({ transmission: transmission as VehicleSearch['transmission'] })}>
              <option value="">Tüm vitesler</option>
              {TRANSMISSIONS.map((t) => (
                <option key={t} value={t}>
                  {TRANSMISSION_LABELS[t]}
                </option>
              ))}
            </FilterSelect>
            {filtersActive && (
              <button
                type="button"
                onClick={() => navigate({ search: (prev) => ({ sort: prev.sort, dir: prev.dir, pageSize: prev.pageSize }), replace: true })}
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
              Müsaitlik, hazırlık ve kiralama durumu ilgili modüller geliştirildiğinde bu listede gösterilecek. Kilometre ve konum, araçların kayıtlı geçmişinden gelir.
            </p>
            <span className="tnum shrink-0 font-medium text-ink" aria-live="polite">
              {data ? `${data.total} araç` : ''}
            </span>
          </div>

          {q.isError ? (
            <div className="p-4">
              <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
            </div>
          ) : data && data.total === 0 ? (
            filtersActive ? (
              <StatePanel icon={MagnifyingGlass} title="Filtrelere uyan araç yok" className="rounded-none border-0">
                <p>Aramayı veya filtreleri değiştirin.</p>
              </StatePanel>
            ) : (
              <StatePanel icon={CarProfile} title="Henüz araç yok" className="rounded-none border-0">
                <p>{canCreate ? 'İlk aracı ekleyerek filonuzu oluşturmaya başlayın.' : 'Görebileceğiniz şubelerde kayıtlı araç bulunmuyor.'}</p>
                {canCreate && (
                  <Link to="/araclar/yeni" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue px-3.5 font-medium text-white hover:bg-blue-ink">
                    <Plus size={15} weight="bold" />
                    Yeni araç
                  </Link>
                )}
              </StatePanel>
            )
          ) : (
            <div className="relative overflow-x-auto">
              {/* min width: on phones the table scrolls inside its card instead of collapsing the vehicle column (and its link) to zero */}
              <table className={cn('w-full min-w-[600px] table-fixed text-left transition-opacity', q.isPlaceholderData && 'opacity-60')}>
                <thead>
                  <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                    <SortHeader label="Plaka" sort="plate" search={search} className="w-[140px] sm:w-[148px]" />
                    <SortHeader label="Araç" sort="vehicle" search={search} />
                    <SortHeader label="Sınıf" sort="class" search={search} className="hidden w-[92px] xl:table-cell" />
                    <SortHeader label="Ana şube ve konum" sort="branch" search={search} className="hidden w-[236px] xl:table-cell" />
                    <SortHeader label="Kilometre" sort="km" search={search} align="right" className="w-[108px] text-right" />
                    <th scope="col" className="hidden w-[96px] px-3 font-medium xl:table-cell">
                      Yakıt / vites
                    </th>
                    <th scope="col" className="w-[116px] px-3 font-medium">
                      Durum
                    </th>
                    {canEdit && (
                      <th scope="col" className="w-[64px] pr-4 xl:w-[108px]">
                        <span className="sr-only">İşlemler</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {!data ? (
                    <SkeletonRows />
                  ) : (
                    data.items.map((v) => {
                      const name = `${v.make} ${v.model}`
                      return (
                        <tr
                          key={v.id}
                          onClick={() => open360(v.id)}
                          className={cn('group h-[56px] cursor-pointer hover:bg-blue-soft/35', v.status !== 'active' && 'bg-hold-soft/30')}
                        >
                          <td className="py-2 pr-3 pl-5">
                            <Plate plate={v.plate} country={session.company?.country} className="flex w-fit" />
                            {v.vehicleCode && <span className="tnum mt-0.5 block text-[12px] leading-4 text-ink-2">{v.vehicleCode}</span>}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to="/araclar/$vehicleId"
                              params={{ vehicleId: v.id }}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate font-medium text-ink group-hover:text-blue-ink hover:underline focus-visible:underline"
                              title={[name, v.modelYear].filter(Boolean).join(' · ')}
                            >
                              {name}
                              {v.modelYear && <span className="tnum font-normal text-ink-2"> · {v.modelYear}</span>}
                            </Link>
                            <span className="mt-0.5 block truncate text-[13px] text-ink-2" title={[v.className, v.homeBranch.name, v.trim].filter(Boolean).join(' · ')}>
                              <span className="xl:hidden">
                                {v.className} · {v.homeBranch.code}
                                {v.trim && ' · '}
                              </span>
                              {v.trim ?? <span className="hidden text-ink-3 xl:inline">Donanım girilmemiş</span>}
                            </span>
                          </td>
                          <td className="hidden truncate px-3 text-ink xl:table-cell">{v.className}</td>
                          <td className="hidden px-3 xl:table-cell">
                            <BranchCell v={v} />
                          </td>
                          <td className="px-3 text-right whitespace-nowrap">
                            {v.odometer ? (
                              <span className="tnum text-ink">{formatKm(v.odometer.km)}</span>
                            ) : (
                              <span className="text-[13px] text-ink-2">Doğrulanmadı</span>
                            )}
                          </td>
                          <td className="hidden px-3 leading-tight text-ink xl:table-cell">
                            {FUEL_LABELS[v.fuelType]}
                            <span className="mt-0.5 block text-[13px] text-ink-2">{TRANSMISSION_LABELS[v.transmission]}</span>
                          </td>
                          <td className="px-3 whitespace-nowrap">
                            <StatusText status={v.status} />
                          </td>
                          {canEdit && (
                            <td className="pr-4 text-right">
                              <Link
                                to="/araclar/$vehicleId/duzenle"
                                params={{ vehicleId: v.id }}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`${v.plate} aracını düzenle`}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-ink-2 transition-colors group-hover:border-blue/40 group-hover:text-blue-ink hover:bg-blue-soft xl:px-2.5"
                              >
                                <PencilSimple size={15} />
                                <span className="hidden xl:inline">Düzenle</span>
                              </Link>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-ink-2 sm:px-5">
              <span className="tnum">
                {from}–{to} / {data.total} araç
              </span>
              <div className="flex items-center gap-2">
                <Select
                  compact
                  aria-label="Sayfa başına araç"
                  value={pageSize}
                  onChange={(e) => set({ pageSize: Number(e.target.value) === 25 ? undefined : Number(e.target.value) })}
                  className="w-[118px]"
                >
                  {PAGE_SIZES.map((n) => (
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
    </div>
  )
}
