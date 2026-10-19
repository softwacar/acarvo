import { ArrowDown, ArrowUp, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { type ReactNode, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { L } from '../i18n'
import { useUrlState } from './hooks'
import { Empty } from './kit'

export interface Col<T> {
  id: string
  header: ReactNode
  cell: (r: T) => ReactNode
  align?: 'right' | 'center'
  /** Sort key; columns without one are not sortable. */
  sort?: (r: T) => string | number | null | undefined
  hideBelow?: 'sm' | 'md' | 'lg'
  className?: string
  /** Plain text of the cell for CSV export. */
  csv?: (r: T) => string | number
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

export function DataTable<T>({
  rows,
  cols,
  rowKey,
  label,
  pageSize = 12,
  urlKey,
  empty,
  defaultSort,
  onRowClick,
  rowHref,
  footer,
  dense,
}: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => string
  label: string
  pageSize?: number
  /** Keeps the page in the URL (back button restores it). */
  urlKey?: string
  empty?: ReactNode
  defaultSort?: { id: string; dir: 'asc' | 'desc' }
  onRowClick?: (r: T) => void
  rowHref?: (r: T) => string | undefined
  footer?: ReactNode
  dense?: boolean
}) {
  const navigate = useNavigate()
  const [sort, setSort] = useState(defaultSort)
  const [pageStr, setPageStr] = useUrlState(urlKey ? `${urlKey}_s` : '__p')
  const [localPage, setLocalPage] = useState(0)
  const page = urlKey ? Math.max(0, Number(pageStr || '1') - 1) : localPage
  const setPage = (n: number) => (urlKey ? setPageStr(n === 0 ? '' : String(n + 1)) : setLocalPage(n))

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = cols.find((c) => c.id === sort.id)
    if (!col?.sort) return rows
    const f = col.sort
    return [...rows].sort((a, b) => {
      const x = f(a)
      const y = f(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr')
      return sort.dir === 'asc' ? r : -r
    })
  }, [rows, sort, cols])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const cur = Math.min(page, pages - 1)
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize)

  if (!rows.length) return <div className="rounded-xl border border-line bg-surface">{empty ?? <Empty title={L('Kayıt yok', 'No records')} />}</div>

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table aria-label={label} className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-rail text-left text-[12px] text-ink-2">
              {cols.map((c) => {
                const active = sort?.id === c.id
                return (
                  <th key={c.id} scope="col" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={cn('px-3 py-2.5 font-medium whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideBelow && HIDE[c.hideBelow])}>
                    {c.sort ? (
                      <button type="button" onClick={() => { setSort(active && sort!.dir === 'asc' ? { id: c.id, dir: 'desc' } : { id: c.id, dir: 'asc' }); setPage(0) }} className="inline-flex items-center gap-1 hover:text-ink">
                        {c.header}
                        {active && (sort!.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {slice.map((r) => {
              const href = rowHref?.(r)
              return (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : href ? () => void navigate({ to: href as never }) : undefined}
                  className={cn((onRowClick || href) && 'cursor-pointer hover:bg-ground/50', dense ? 'h-10' : 'h-12')}
                >
                  {cols.map((c) => (
                    <td key={c.id} className={cn('px-3 py-1.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.hideBelow && HIDE[c.hideBelow], c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          {footer && <tfoot>{footer}</tfoot>}
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-2">
          <span className="tnum">
            {cur * pageSize + 1}–{Math.min(sorted.length, cur * pageSize + pageSize)} / {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={L('Önceki sayfa', 'Previous page')} disabled={cur === 0} onClick={() => setPage(cur - 1)} className="grid size-8 place-items-center rounded-md border border-line hover:bg-ground disabled:opacity-40">
              <CaretLeft size={14} />
            </button>
            <span className="tnum px-2">
              {cur + 1} / {pages}
            </span>
            <button type="button" aria-label={L('Sonraki sayfa', 'Next page')} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} className="grid size-8 place-items-center rounded-md border border-line hover:bg-ground disabled:opacity-40">
              <CaretRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Real browser CSV download of the rows as shown (no server involved). */
export function downloadCsv<T>(name: string, cols: Col<T>[], rows: T[]) {
  const usable = cols.filter((c) => c.csv)
  const esc = (v: string | number) => {
    const t = String(v)
    return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const head = usable.map((c) => esc(typeof c.header === 'string' ? c.header : c.id)).join(';')
  const body = rows.map((r) => usable.map((c) => esc(c.csv!(r))).join(';')).join('\n')
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
