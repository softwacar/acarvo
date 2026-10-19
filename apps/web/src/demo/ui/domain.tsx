import { CheckCircle, WarningCircle, XCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { Plate } from '@/components/Plate'
import { cn } from '@/lib/utils'
import { HOLD_LABEL, type Hold, type ReadinessItem, vehicleHolds } from '../core/calc/availability'
import { fmt } from '../core/money'
import { DAY, dayOf, fmtDayShort, startOfDay, addDaysYmd } from '../core/time'
import type { Customer, Iso, PriceSnapshot, Vehicle } from '../core/types'
import { L, loc } from '../i18n'
import { entityHref, useDb, useFmt } from './hooks'
import { Notice } from './kit'

export function VehicleCell({ v, sub = true }: { v: Vehicle; sub?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Link to={entityHref('vehicle', v.id) as never} className="inline-flex shrink-0" aria-label={`${L('Araç', 'Vehicle')} ${v.plate}`}>
        <Plate plate={v.plate} country={v.homeBranchId === 'b-dbv' ? undefined : 'BA'} />
      </Link>
      {sub && (
        <span className="hidden min-w-0 truncate text-[13px] text-ink-2 sm:block">
          {v.make} {v.model}
        </span>
      )}
    </span>
  )
}

export function CustomerLink({ c, className }: { c?: Customer; className?: string }) {
  if (!c) return <span className="text-ink-3">—</span>
  return (
    <Link to={entityHref('customer', c.id) as never} className={cn('font-medium text-blue hover:underline', className)}>
      {c.name}
    </Link>
  )
}

export function PriceBreakdown({ price, compact }: { price: PriceSnapshot | null; compact?: boolean }) {
  if (!price) return <p className="text-[13px] text-ink-2">{L('Fiyat hesaplanmadı.', 'Price not calculated.')}</p>
  return (
    <div className="space-y-3">
      {price.blockers.length > 0 && (
        <Notice tone="alert">
          <p className="font-medium">{L('Fiyat hesaplanamadı', 'Price cannot be calculated')}</p>
          <ul className="mt-1 list-disc pl-5">
            {price.blockers.map((b) => (
              <li key={b}>{loc(b)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {price.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-2">
                <th scope="col" className="py-1.5 pr-3 font-medium">{L('Kalem', 'Line')}</th>
                {!compact && <th scope="col" className="px-2 py-1.5 text-right font-medium">{L('Adet', 'Qty')}</th>}
                {!compact && <th scope="col" className="px-2 py-1.5 text-right font-medium">{L('Birim', 'Unit')}</th>}
                <th scope="col" className="py-1.5 pl-2 text-right font-medium">{L('Tutar', 'Amount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {price.lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-2 pr-3">{loc(l.label)}</td>
                  {!compact && <td className="tnum whitespace-nowrap px-2 py-2 text-right">{l.qty}</td>}
                  {!compact && <td className="tnum whitespace-nowrap px-2 py-2 text-right">{fmt(l.unitMinor, price.cur)}</td>}
                  <td className={cn('tnum whitespace-nowrap py-2 pl-2 text-right font-medium', l.totalMinor < 0 && 'text-ok')}>{fmt(l.totalMinor, price.cur)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-[13px]">
              <tr className="border-t border-line">
                <td colSpan={compact ? 1 : 3} className="py-1.5 pr-3 text-ink-2">{L('Net', 'Net')}</td>
                <td className="tnum whitespace-nowrap py-1.5 pl-2 text-right">{fmt(price.netMinor, price.cur)}</td>
              </tr>
              {price.taxLines.map((t) => (
                <tr key={t.ruleId}>
                  <td colSpan={compact ? 1 : 3} className="py-1 pr-3 text-ink-2">
                    {loc(t.name)} ({t.mode === 'inclusive' ? L('dahil', 'incl.') : L('hariç', 'excl.')})
                  </td>
                  <td className="tnum whitespace-nowrap py-1 pl-2 text-right">{fmt(t.taxMinor, price.cur)}</td>
                </tr>
              ))}
              <tr className="border-t border-line text-[14px] font-semibold">
                <td colSpan={compact ? 1 : 3} className="py-2 pr-3">{L('Toplam', 'Total')} ({price.cur})</td>
                <td className="tnum whitespace-nowrap py-2 pl-2 text-right">{fmt(price.grossMinor, price.cur)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[12px] text-ink-3">
        {L('Fiyat sürümü', 'Price version')} {price.revisionId} · {price.days} {L('gün', 'days')} · {L('tek işlem para birimi; fiyatlarda kur dönüşümü yoktur.', 'single transaction currency; pricing never converts currencies.')}
      </p>
    </div>
  )
}

export function ReadinessList({ items }: { items: ReadinessItem[] }) {
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-3 py-2.5">
          {i.ok ? <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" /> : i.severity === 'blocker' ? <XCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-alert" /> : <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-hold" />}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium">
              {loc(i.label)}
              {!i.ok && <span className={cn('ml-2 text-[12px] font-medium', i.severity === 'blocker' ? 'text-alert' : 'text-hold')}>{i.severity === 'blocker' ? L('Engel', 'Blocker') : L('Uyarı', 'Warning')}</span>}
            </p>
            <p className="text-[12.5px] text-ink-2">{loc(i.detail)}</p>
          </div>
          {i.link && (
            <Link to={entityHref(i.link.type, i.link.id) as never} className="shrink-0 text-[12.5px] font-medium text-blue hover:underline">
              {L('Kayda git', 'Open')}
            </Link>
          )}
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- availability timeline (one vehicle, many days)

const HOLD_STYLE: Record<Hold['kind'], string> = {
  rental: 'bg-blue text-white',
  reservation: 'border border-dashed border-blue bg-blue-soft text-blue-ink',
  maintenance: 'bg-hold text-white',
  damage_block: 'bg-alert text-white',
  transfer: 'bg-ink-3 text-white',
  engagement_gap: 'bg-line text-ink-2',
  out_of_service: 'bg-ink text-white',
}
export const HOLD_LEGEND: { kind: Hold['kind']; label: () => string }[] = [
  { kind: 'rental', label: () => L('Kiralama', 'Rental') },
  { kind: 'reservation', label: () => L('Onaylı rezervasyon', 'Confirmed reservation') },
  { kind: 'maintenance', label: () => L('Bakım', 'Service') },
  { kind: 'damage_block', label: () => L('Hasar engeli', 'Damage block') },
  { kind: 'transfer', label: () => L('Transfer', 'Transfer') },
]

export function TimelineLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {HOLD_LEGEND.map((h) => (
        <li key={h.kind} className="inline-flex items-center gap-1.5">
          <span className={cn('h-3 w-5 rounded-sm', HOLD_STYLE[h.kind])} aria-hidden />
          {h.label()}
        </li>
      ))}
    </ul>
  )
}

/** One row of holds across a window; bars are links to their source record. */
export function HoldBars({ holds, from, to, height = 26 }: { holds: Hold[]; from: number; to: number; height?: number }) {
  const span = Math.max(1, to - from)
  const lanes: Hold[][] = []
  for (const h of holds) {
    const lane = lanes.find((l) => l.every((x) => !(x.from < (h.to ?? Infinity) && h.from < (x.to ?? Infinity))))
    if (lane) lane.push(h)
    else lanes.push([h])
  }
  const laneH = lanes.length > 1 ? height / lanes.length : height
  return (
    <div className="relative" style={{ height }}>
      {lanes.map((lane, li) =>
        lane.map((h) => {
          const l = Math.max(0, ((h.from - from) / span) * 100)
          const r = Math.min(100, (((h.to ?? to) - from) / span) * 100)
          if (r <= 0 || l >= 100) return null
          const el = (
            <span className={cn('absolute flex items-center overflow-hidden rounded-[4px] px-1.5 text-[11px] leading-none font-medium whitespace-nowrap', HOLD_STYLE[h.kind])} style={{ left: `${l}%`, width: `${Math.max(0.6, r - l)}%`, top: li * laneH, height: Math.max(8, laneH - 2) }} title={`${h.label} · ${h.detail}`}>
              {r - l > 9 ? h.refNo : ''}
            </span>
          )
          return h.link ? (
            <Link key={`${h.kind}-${h.refId}`} to={entityHref(h.link, h.refId) as never} aria-label={`${h.label}: ${h.detail}`}>
              {el}
            </Link>
          ) : (
            <span key={`${h.kind}-${h.refId}`}>{el}</span>
          )
        }),
      )}
    </div>
  )
}

export function DayAxis({ from, days, tz }: { from: Iso; days: number; tz: string }) {
  const every = days > 45 ? 14 : days > 20 ? 7 : days > 10 ? 2 : 1
  return (
    <div className="relative h-5 text-[11px] text-ink-3" aria-hidden>
      {Array.from({ length: days }, (_, i) => i)
        .filter((i) => i % every === 0)
        .map((i) => (
          <span key={i} className="tnum absolute -translate-x-0" style={{ left: `${(i / days) * 100}%` }}>
            {fmtDayShort(Date.parse(from) + i * DAY + 3_600_000, tz)}
          </span>
        ))}
    </div>
  )
}

export function VehicleTimeline({ v, days = 30, startOffset = -3 }: { v: Vehicle; days?: number; startOffset?: number }) {
  const d = useDb()
  const f = useFmt()
  const tz = f.zone(v.homeBranchId)
  const today = dayOf(d.clock.now, tz)
  const from = startOfDay(addDaysYmd(today, startOffset), tz)
  const to = startOfDay(addDaysYmd(today, startOffset + days), tz)
  const holds = useMemo(() => vehicleHolds(d, { ...v, source: 'internal' }, from, to, d.clock.now), [d, v, from, to])
  const nowPct = ((Date.parse(d.clock.now) - Date.parse(from)) / (Date.parse(to) - Date.parse(from))) * 100
  return (
    <div>
      <DayAxis from={from} days={days} tz={tz} />
      <div className="relative overflow-hidden rounded-lg border border-line bg-rail p-1.5">
        <div className="relative">
          <HoldBars holds={holds} from={Date.parse(from)} to={Date.parse(to)} height={holds.length > 1 ? 40 : 28} />
          <span className="pointer-events-none absolute inset-y-0 w-px bg-alert" style={{ left: `${nowPct}%` }} aria-hidden title={L('Demo zamanı', 'Demo time')} />
        </div>
      </div>
      <div className="mt-2">
        <TimelineLegend />
      </div>
    </div>
  )
}

export const holdKindLabel = (k: Hold['kind']) => HOLD_LABEL[k]
