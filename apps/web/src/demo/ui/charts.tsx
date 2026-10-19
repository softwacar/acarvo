import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { L } from '../i18n'
import { Panel, Segmented } from './kit'

// Small, dependency-free charts. Every chart sits in a ChartCard with a table twin (spec §82.5): the numbers are
// readable without the picture. Colours are few and always paired with a legend or label.

export const SERIES = ['var(--ac-blue)', '#8aa0f0', '#475467', 'var(--ac-hold)', 'var(--ac-ok)', 'var(--ac-alert)']

export function ChartCard({ title, description, source, chart, head, rows, action }: { title: string; description?: ReactNode; source?: string; chart: ReactNode; head: string[]; rows: ReactNode[][]; action?: ReactNode }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <Panel
      title={title}
      description={description}
      action={
        <div className="flex items-center gap-2">
          {action}
          <Segmented label={L('Görünüm', 'View')} value={view} onChange={setView} options={[{ id: 'chart', label: L('Grafik', 'Chart') }, { id: 'table', label: L('Tablo', 'Table') }]} />
        </div>
      }
    >
      {view === 'chart' ? (
        chart
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-2">
                {head.map((h, i) => (
                  <th key={h + i} scope="col" className={cn('px-2 py-2 font-medium', i > 0 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={cn('tnum px-2 py-2', j > 0 && 'text-right')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {source && <p className="mt-3 text-[12px] text-ink-3">{source}</p>}
    </Panel>
  )
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((s) => (
        <li key={s.name} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  )
}

/** Horizontal bars: best for comparing categories, also on a phone. */
export function BarsH({ rows, format = (n: number) => String(n), max }: { rows: { label: ReactNode; value: number; sub?: ReactNode; color?: string }[]; format?: (n: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(80px,140px)_minmax(0,1fr)_auto] items-center gap-3 text-[13px]">
          <span className="min-w-0 truncate text-ink-2">{r.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-line-soft">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (r.value / top) * 100)}%`, background: r.color ?? SERIES[0] }} />
          </span>
          <span className="tnum min-w-[48px] text-right font-medium">
            {format(r.value)}
            {r.sub && <span className="ml-1 font-normal text-ink-3">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Vertical columns, optionally stacked. Scrolls sideways inside its card when there are many columns. */
export function BarsV({ cols, series, height = 180, format = (n: number) => String(n), stacked }: { cols: { label: string; values: number[] }[]; series: { name: string; color: string }[]; height?: number; format?: (n: number) => string; stacked?: boolean }) {
  const max = Math.max(1, ...cols.map((c) => (stacked ? c.values.reduce((a, b) => a + b, 0) : Math.max(...c.values))))
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-end gap-1.5" style={{ height, minWidth: Math.max(0, cols.length * 26) }} role="img" aria-label={series.map((s) => s.name).join(', ')}>
          {cols.map((c) => (
            <div key={c.label} className="flex min-w-[20px] flex-1 flex-col items-center justify-end" style={{ height: '100%' }} title={`${c.label}: ${c.values.map((v, i) => `${series[i]?.name} ${format(v)}`).join(' · ')}`}>
              <div className={cn('flex w-full items-end justify-center gap-0.5', stacked && 'flex-col-reverse items-stretch')} style={{ height: height - 22 }}>
                {c.values.map((v, i) => (
                  <span key={i} className={cn('rounded-t-[3px]', stacked ? 'w-full' : 'flex-1')} style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0, background: series[i]?.color ?? SERIES[i], alignSelf: stacked ? 'stretch' : 'flex-end' }} />
                ))}
              </div>
              <span className="mt-1 h-[18px] truncate text-[10.5px] text-ink-3">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
      {series.length > 1 && <Legend items={series} />}
    </div>
  )
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(480)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => e && setW(Math.floor(e.contentRect.width)))
    ro.observe(el)
    setW(el.clientWidth || 480)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export function LineChart({ points, series, height = 190, format = (n: number) => String(n) }: { points: { x: string; ys: number[] }[]; series: { name: string; color: string }[]; height?: number; format?: (n: number) => string }) {
  const [ref, w] = useWidth()
  const pad = { l: 40, r: 10, t: 10, b: 24 }
  const iw = Math.max(40, w - pad.l - pad.r)
  const ih = height - pad.t - pad.b
  const max = Math.max(1, ...points.flatMap((p) => p.ys))
  const x = (i: number) => pad.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 70))))
  return (
    <div ref={ref} className="w-full">
      <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ')}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih - t * ih} y2={pad.t + ih - t * ih} stroke="var(--ac-line)" strokeDasharray={t === 0 ? undefined : '3 3'} />
            <text x={pad.l - 6} y={pad.t + ih - t * ih + 4} textAnchor="end" fontSize="10.5" fill="var(--ac-ink-3)">
              {format(Math.round(max * t))}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 ? (
            <text key={p.x} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--ac-ink-3)">
              {p.x}
            </text>
          ) : null,
        )}
        {series.map((s, si) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" points={points.map((p, i) => `${x(i)},${y(p.ys[si] ?? 0)}`).join(' ')} />
            {points.length <= 31 && points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.ys[si] ?? 0)} r={2.5} fill="var(--ac-surface)" stroke={s.color} strokeWidth={1.5} />)}
          </g>
        ))}
      </svg>
      {series.length > 1 && <Legend items={series} />}
    </div>
  )
}

export function Donut({ parts, center, size = 150 }: { parts: { label: string; value: number; color: string }[]; center?: ReactNode; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ac-line-soft)" strokeWidth={14} />
          {parts.map((p) => {
            const len = (p.value / total) * c
            const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={14} strokeDasharray={`${Math.max(0, len - 1.5)} ${c - Math.max(0, len - 1.5)}`} strokeDashoffset={-acc} />
            acc += len
            return el
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
      </div>
      <ul className="min-w-[160px] flex-1 space-y-1.5 text-[13px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-2">{p.label}</span>
            <span className="tnum font-medium">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Spark({ values, color = 'var(--ac-blue)', width = 90, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * (width - 2) + 1},${height - 2 - (v / max) * (height - 4)}`).join(' ')
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth={1.8} points={pts} />
    </svg>
  )
}
