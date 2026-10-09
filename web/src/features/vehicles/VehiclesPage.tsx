import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Menu, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { BRANCHES, CLASSES, vehicles, type Vehicle } from './data'
import { type Current, currentOf, fmtKm, NOW_LABEL, NOW_ORDER, type NowState, nextEventOf } from './derive'
import { FacetFilter, type FacetOption } from './FacetFilter'
import { Plate } from './Plate'
import { READINESS_LABEL, ReadinessText } from './ReadinessText'
import { KIND_FILL, Ribbon, RIBBON_W, RibbonHeader } from './Ribbon'
import { VehiclePeek } from './VehiclePeek'

interface Row {
  v: Vehicle
  cur: Current
}

/** Legend keys for the summary: the same fills the ribbon uses. */
const STATE_KEY: Record<NowState, string> = {
  free: 'bg-surface shadow-[inset_0_0_0_1px_rgb(20_23_26/0.35)]',
  rental: KIND_FILL.rental,
  reservation: KIND_FILL.reservation,
  maintenance: KIND_FILL.maintenance,
  transfer: KIND_FILL.transfer,
  out: KIND_FILL.out,
}

type Filters = { branch: string[]; cls: string[]; source: string[]; state: string[]; readiness: string[] }
const EMPTY: Filters = { branch: [], cls: [], source: [], state: [], readiness: [] }

function count<T>(rows: Row[], key: (r: Row) => T, value: T) {
  return rows.filter((r) => key(r) === value).length
}

type Align = { align?: 'right' }

export function VehiclesPage({ onMenu }: { onMenu: () => void }) {
  const rows = useMemo<Row[]>(() => vehicles.map((v) => ({ v, cur: currentOf(v) })), [])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<string | null>(() => window.location.hash.slice(1) || null)

  useEffect(() => {
    history.replaceState(null, '', selected ? `#${selected}` : window.location.pathname)
  }, [selected])

  const set = (k: keyof Filters) => (next: string[]) => setFilters((f) => ({ ...f, [k]: next }))
  const clearAll = () => {
    setFilters(EMPTY)
    setQuery('')
  }

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return rows.filter(({ v, cur }) => {
      if (q && !`${v.plate} ${v.make} ${v.model}`.toLocaleLowerCase('tr-TR').includes(q)) return false
      if (filters.branch.length && !filters.branch.includes(v.homeBranch)) return false
      if (filters.cls.length && !filters.cls.includes(v.vehicleClass)) return false
      if (filters.source.length && !filters.source.includes(v.source)) return false
      if (filters.state.length && !filters.state.includes(cur.state)) return false
      if (filters.readiness.length && !filters.readiness.includes(v.readiness)) return false
      return true
    })
  }, [rows, query, filters])

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'plate',
        header: 'Plaka',
        accessorFn: (r) => r.v.plate,
        size: 116,
        cell: ({ row }) => <Plate value={row.original.v.plate} />,
      },
      {
        id: 'vehicle',
        header: 'Araç',
        accessorFn: (r) => `${r.v.make} ${r.v.model}`,
        size: 200,
        cell: ({ row }) => {
          const v = row.original.v
          return (
            <div className="min-w-0">
              <div className="truncate font-medium" title={`${v.make} ${v.model}`}>
                {v.make} {v.model}
              </div>
              <div className="truncate text-[12px] text-graphite">
                {v.vehicleClass}, {v.year}
                {v.source === 'external' && <span className="text-plate">, dış kaynak</span>}
              </div>
            </div>
          )
        },
      },
      {
        id: 'now',
        header: 'Şimdi',
        accessorFn: (r) => NOW_ORDER.indexOf(r.cur.state),
        size: 168,
        cell: ({ row }) => {
          const { v, cur } = row.original
          const next = nextEventOf(v, cur)
          return (
            <div className="min-w-0">
              <div className={cn('font-medium', next?.late && 'text-signal')}>{NOW_LABEL[cur.state]}</div>
              {next && (
                <div className={cn('figures truncate text-[12px]', next.late ? 'text-signal' : 'text-graphite')}>
                  {next.text} {next.when}
                </div>
              )}
            </div>
          )
        },
      },
      {
        id: 'ribbon',
        header: () => <RibbonHeader />,
        enableSorting: false,
        size: RIBBON_W + 24,
        cell: ({ row }) => {
          const { v, cur } = row.original
          return <Ribbon segments={v.segments} overdueFrom={cur.overdueHours ? cur.segment?.to : undefined} />
        },
      },
      {
        id: 'readiness',
        header: 'Teslime hazırlık',
        accessorFn: (r) => ['blocked', 'check', 'ready'].indexOf(r.v.readiness),
        size: 184,
        cell: ({ row }) => <ReadinessText v={row.original.v} withReason />,
      },
      {
        id: 'location',
        header: 'Konum',
        accessorFn: (r) => r.v.location.label,
        size: 150,
        cell: ({ row }) => {
          const v = row.original.v
          const away = v.location.label !== v.homeBranch
          return (
            <div className="min-w-0">
              <div className="truncate">{v.location.label}</div>
              {away && <div className="truncate text-[12px] text-graphite">{v.homeBranch}</div>}
            </div>
          )
        },
      },
      {
        id: 'km',
        header: 'Km',
        accessorFn: (r) => r.v.km,
        size: 80,
        meta: { align: 'right' } satisfies Align,
        cell: ({ row }) => <span className="figures">{fmtKm(row.original.v.km)}</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">İşlemler</span>,
        enableSorting: false,
        size: 44,
        cell: ({ row }) => <RowActions v={row.original.v} />,
      },
    ],
    [],
  )

  const table = useReactTable({
    data: visible,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.v.id,
  })

  const facet = (key: (r: Row) => string, values: readonly string[], label: (v: string) => string = (v) => v): FacetOption[] =>
    values.map((value) => ({ value, label: label(value), count: count(rows, key, value) }))

  const activeFilters = Object.values(filters).some((f) => f.length) || query.length > 0
  const selectedVehicle = vehicles.find((v) => v.id === selected)

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {/* page title and page-level actions */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-rule px-5">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Menüyü aç"
          className="-ml-1 grid size-8 place-items-center rounded-md text-graphite hover:bg-ground xl:hidden"
        >
          <Menu className="size-4" />
        </button>
        <h1 className="text-[20px] leading-none font-semibold tracking-[-0.015em]">Araçlar</h1>
        <span className="figures mt-0.5 text-graphite">
          {rows.length} araç, {BRANCHES.length} şube
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" className="h-9 px-3" aria-label="Dışa aktar">
            <Download className="size-4" /> <span className="hidden md:inline">Dışa aktar</span>
          </Button>
          <Button className="h-9 px-3.5">
            <Plus className="size-4" /> Yeni araç
          </Button>
        </div>
      </header>

      <FleetSummary rows={rows} filters={filters} onState={set('state')} onReadiness={set('readiness')} />

      {/* filters and the period control share one bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule px-5 py-2.5">
        <label className="flex h-8 w-[220px] items-center gap-2 rounded-md border border-rule bg-surface px-2.5 focus-within:border-plate focus-within:ring-2 focus-within:ring-plate/15">
          <Search className="size-3.5 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Plaka veya model ara"
            aria-label="Plaka veya model ara"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
          />
          {query && (
            <button type="button" aria-label="Aramayı temizle" onClick={() => setQuery('')} className="text-faint hover:text-ink">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <span aria-hidden className="mx-1 h-5 w-px bg-rule" />
        <FacetFilter title="Şube" options={facet((r) => r.v.homeBranch, BRANCHES)} selected={filters.branch} onChange={set('branch')} />
        <FacetFilter title="Sınıf" options={facet((r) => r.v.vehicleClass, CLASSES)} selected={filters.cls} onChange={set('cls')} />
        <FacetFilter
          title="Kaynak"
          options={facet((r) => r.v.source, ['own', 'external'], (v) => (v === 'own' ? 'Kendi filo' : 'Dış kaynak'))}
          selected={filters.source}
          onChange={set('source')}
        />
        <FacetFilter
          title="Durum"
          options={facet((r) => r.cur.state, NOW_ORDER, (v) => NOW_LABEL[v as NowState])}
          selected={filters.state}
          onChange={set('state')}
        />
        <FacetFilter
          title="Hazırlık"
          options={facet((r) => r.v.readiness, ['ready', 'check', 'blocked'], (v) => READINESS_LABEL[v as Vehicle['readiness']])}
          selected={filters.readiness}
          onChange={set('readiness')}
        />
        {activeFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-graphite hover:bg-ground hover:text-ink"
          >
            <X className="size-3.5" /> Temizle
          </button>
        )}
        <div className="ml-auto flex h-8 items-center rounded-md border border-rule">
          <button type="button" aria-label="Önceki hafta" className="grid h-full w-8 place-items-center text-graphite hover:bg-ground hover:text-ink">
            <ChevronLeft className="size-4" />
          </button>
          <span className="figures border-x border-rule px-2.5 leading-[30px] font-medium">7–20 Ekim</span>
          <button type="button" className="h-full border-r border-rule px-2.5 text-graphite hover:bg-ground hover:text-ink">
            Bugün
          </button>
          <button type="button" aria-label="Sonraki hafta" className="grid h-full w-8 place-items-center text-graphite hover:bg-ground hover:text-ink">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-max table-fixed border-separate border-spacing-0">
          <colgroup>
            {table.getAllLeafColumns().map((c) => (
              <col key={c.id} style={{ width: c.getSize() }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-30">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sort = h.column.getIsSorted()
                  const right = (h.column.columnDef.meta as Align | undefined)?.align === 'right'
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        'h-11 border-b border-ink/12 bg-[#fafaf8] px-3 text-left align-middle text-[12px] font-medium text-graphite first:sticky first:left-0 first:z-10 first:pl-5 last:pr-5',
                        right && 'text-right',
                      )}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn('inline-flex items-center gap-1 hover:text-ink', sort && 'text-ink')}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sort === 'asc' && <ArrowUp className="size-3" />}
                          {sort === 'desc' && <ArrowDown className="size-3" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const on = row.id === selected
              return (
                <tr
                  key={row.id}
                  onClick={() => setSelected(on ? null : row.id)}
                  aria-selected={on}
                  className={cn('group cursor-pointer', on ? 'bg-plate-soft/60' : 'hover:bg-[#f7f8f5]')}
                >
                  {row.getVisibleCells().map((cell) => {
                    const right = (cell.column.columnDef.meta as Align | undefined)?.align === 'right'
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'h-[50px] border-b border-rule-soft px-3 align-middle first:sticky first:left-0 first:z-[25] first:pl-5 last:pr-5',
                          on ? 'first:bg-[#eef1f8] first:shadow-[inset_3px_0_0_var(--ac-plate)]' : 'first:bg-surface group-hover:first:bg-[#f7f8f5]',
                          right && 'text-right',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <p className="text-[15px] font-semibold">{query ? `“${query}” ile eşleşen araç yok` : 'Bu filtrelerle eşleşen araç yok'}</p>
            <p className="mt-1 text-graphite">Plaka, marka veya model ile arayın ya da filtreleri gevşetin.</p>
            <Button variant="outline" className="mt-4 h-9 px-3.5" onClick={clearAll}>
              Filtreleri temizle
            </Button>
          </div>
        ) : (
          <p className="figures px-5 py-3 text-[12px] text-graphite">
            {visible.length} / {rows.length} araç gösteriliyor
          </p>
        )}
      </div>

      {selectedVehicle && <VehiclePeek vehicle={selectedVehicle} onClose={() => setSelected(null)} />}
    </main>
  )
}

function FleetSummary({
  rows,
  filters,
  onState,
  onReadiness,
}: {
  rows: Row[]
  filters: Filters
  onState: (v: string[]) => void
  onReadiness: (v: string[]) => void
}) {
  const byState = NOW_ORDER.map((s) => ({ s, n: count(rows, (r) => r.cur.state, s) }))
  const blocked = count(rows, (r) => r.v.readiness, 'blocked')
  const check = count(rows, (r) => r.v.readiness, 'check')
  const late = rows.filter((r) => nextEventOf(r.v, r.cur)?.late).length
  const only = (list: string[], v: string) => list.length === 1 && list[0] === v
  const toggle = (list: string[], v: string, fn: (v: string[]) => void) => fn(only(list, v) ? [] : [v])

  return (
    <section aria-label="Filo durumu" className="flex flex-wrap items-stretch gap-y-3 border-b border-rule px-5 py-3">
      <div className="flex items-stretch">
        {byState.map(({ s, n }) => (
          <Stat
            key={s}
            label={NOW_LABEL[s]}
            n={n}
            on={only(filters.state, s)}
            onClick={() => toggle(filters.state, s, onState)}
            legend={<span aria-hidden className={cn('h-2 w-3.5 rounded-[2px]', STATE_KEY[s])} />}
          />
        ))}
      </div>
      <div className="flex items-stretch border-ink/12 lg:ml-auto lg:border-l lg:pl-2">
        <Stat label="İade veya teslim gecikti" n={late} tone="signal" />
        <Stat
          label="Teslime hazır değil"
          n={blocked}
          tone="signal"
          on={only(filters.readiness, 'blocked')}
          onClick={() => toggle(filters.readiness, 'blocked', onReadiness)}
        />
        <Stat
          label="Kontrol gerekli"
          n={check}
          tone="amber"
          on={only(filters.readiness, 'check')}
          onClick={() => toggle(filters.readiness, 'check', onReadiness)}
        />
      </div>
      <p className="figures w-full text-[11.5px] text-faint">09.10.2026 Cuma 14:30 itibarıyla, Sarajevo saati. Bir sayıya tıklayınca liste süzülür.</p>
    </section>
  )
}

function Stat({
  label,
  n,
  tone,
  legend,
  on,
  onClick,
}: {
  label: string
  n: number
  tone?: 'signal' | 'amber'
  legend?: React.ReactNode
  on?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={onClick ? on : undefined}
      className={cn(
        'group/stat relative rounded-md px-3 py-1.5 text-left',
        onClick ? 'hover:bg-ground' : 'cursor-default',
        on && 'bg-plate-soft hover:bg-plate-soft',
      )}
    >
      <span className="flex items-center gap-1.5 text-[12px] whitespace-nowrap text-graphite">
        {legend}
        {label}
      </span>
      <span
        className={cn(
          'figures mt-0.5 block text-[20px] leading-tight font-semibold',
          tone === 'signal' && n > 0 && 'text-signal',
          tone === 'amber' && n > 0 && 'text-amber',
          n === 0 && 'text-faint',
        )}
      >
        {n}
      </span>
      {on && <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-plate" />}
    </button>
  )
}

function RowActions({ v }: { v: Vehicle }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${v.plate} işlemleri`}
          onClick={(e) => e.stopPropagation()}
          className="grid size-7 place-items-center rounded-md text-faint opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem>Araç 360°’ı aç</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Rezervasyon oluştur</DropdownMenuItem>
        <DropdownMenuItem>Kiralama aç</DropdownMenuItem>
        <DropdownMenuItem>Müsaitliği kontrol et</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Bakım planla</DropdownMenuItem>
        <DropdownMenuItem>Hasar bildir</DropdownMenuItem>
        <DropdownMenuItem>Transfer başlat</DropdownMenuItem>
        <DropdownMenuItem>Belge ekle</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
