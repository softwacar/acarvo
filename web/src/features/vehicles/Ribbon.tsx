import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { NOW_OFFSET, WINDOW_DAYS, type Segment, type SegmentKind } from './data'
import { dayInfo, fmtRange } from './derive'

export const DAY_W = 18
export const RIBBON_W = DAY_W * WINDOW_DAYS

export const KIND_LABEL: Record<SegmentKind, string> = {
  rental: 'Kiralama',
  reservation: 'Rezervasyon',
  maintenance: 'Bakım',
  transfer: 'Transfer',
  out: 'Kullanım dışı',
}

/** Fill per booking kind. Patterns differ as well as colour, so the ribbon reads in greyscale. */
export const KIND_FILL: Record<SegmentKind, string> = {
  rental: 'bg-plate text-white',
  reservation: 'bg-plate-soft text-plate shadow-[inset_0_0_0_1px_var(--ac-plate)]',
  maintenance: 'hatch-amber',
  transfer: 'hatch-graphite',
  out: 'hatch-signal',
}

const clamp = (n: number, days: number) => Math.min(Math.max(n, 0), days)
const TODAY = Math.floor(NOW_OFFSET)

/** Day grid shared by header and rows; Monday lines are slightly stronger to mark weeks. */
function DayGrid({ days, dayW }: { days: number; dayW: number }) {
  return (
    <div aria-hidden className="absolute inset-0 flex">
      {Array.from({ length: days }, (_, i) => (
        <div
          key={i}
          className={cn('h-full border-l first:border-l-0', dayInfo(i).weekday === 'Pzt' ? 'border-ink/15' : 'border-rule-soft')}
          style={{ width: dayW }}
        />
      ))}
    </div>
  )
}

const SHORT: Record<string, string> = { Pzt: 'Pt', Sal: 'Sa', Çar: 'Ça', Per: 'Pe', Cum: 'Cu', Cmt: 'Ct', Paz: 'Pz' }

export function RibbonHeader() {
  return (
    <div className="flex" style={{ width: RIBBON_W }}>
      {Array.from({ length: WINDOW_DAYS }, (_, i) => {
        const d = dayInfo(i)
        const isToday = i === TODAY
        return (
          <div
            key={i}
            className={cn('figures flex flex-col items-center gap-[3px] leading-none', d.weekday === 'Pzt' && i > 0 && 'border-l border-ink/15')}
            style={{ width: DAY_W }}
          >
            <span className={cn('text-[10.5px]', isToday ? 'font-semibold text-ink' : d.weekend ? 'text-faint' : 'text-graphite')}>
              {SHORT[d.weekday]}
            </span>
            <span
              className={cn(
                'grid h-[17px] min-w-[17px] place-items-center rounded-[3px] text-[12px]',
                isToday ? 'bg-ink font-semibold text-white' : d.weekend ? 'text-graphite' : 'text-ink',
              )}
            >
              {d.day}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function Ribbon({
  segments,
  overdueFrom,
  days = WINDOW_DAYS,
  dayW = DAY_W,
  height = 'row',
}: {
  segments: Segment[]
  overdueFrom?: number
  days?: number
  dayW?: number
  height?: 'row' | 'panel'
}) {
  const width = days * dayW
  const barH = height === 'row' ? 'h-[14px] top-[3px]' : 'h-[16px] top-[4px]'
  return (
    <div className={cn('relative', height === 'row' ? 'h-5' : 'h-6')} style={{ width }}>
      {/* days already passed sit on a grey ground */}
      <div aria-hidden className="absolute inset-y-0 left-0 bg-ground" style={{ width: Math.min(NOW_OFFSET, days) * dayW }} />
      <DayGrid days={days} dayW={dayW} />
      {segments.map((s) => {
        const from = clamp(s.from, days)
        const to = clamp(s.to, days)
        if (to <= from) return null
        const w = (to - from) * dayW - 2
        const label = s.kind === 'rental' || s.kind === 'reservation' ? lastName(s.who) : undefined
        return (
          <Tooltip key={s.ref}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`${KIND_LABEL[s.kind]} ${s.ref}, ${fmtRange(s)}`}
                className={cn(
                  'absolute z-10 overflow-hidden rounded-[3px] px-1 text-left text-[10.5px] leading-[14px] font-medium whitespace-nowrap',
                  barH,
                  KIND_FILL[s.kind],
                  s.to <= NOW_OFFSET && 'opacity-60',
                )}
                style={{ left: from * dayW + 1, width: Math.max(w, 3) }}
              >
                {label && w >= 46 ? label : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-64">
              <div className="font-medium">
                {KIND_LABEL[s.kind]} {s.ref}
              </div>
              <div className="figures opacity-80">{fmtRange(s)}</div>
              {(s.who || s.note) && <div className="opacity-80">{s.who ?? s.note}</div>}
            </TooltipContent>
          </Tooltip>
        )
      })}
      {overdueFrom !== undefined && (
        <div
          aria-hidden
          className={cn('hatch-signal absolute z-10 rounded-r-[3px]', barH)}
          style={{ left: overdueFrom * dayW, width: (NOW_OFFSET - overdueFrom) * dayW }}
        />
      )}
      <div
        aria-hidden
        className={cn('absolute z-20 w-[1.5px] bg-ink', height === 'row' ? '-inset-y-[15px]' : 'inset-y-0')}
        style={{ left: NOW_OFFSET * dayW - 0.75 }}
      />
    </div>
  )
}

function lastName(who?: string) {
  if (!who) return undefined
  if (who.startsWith('Kurumsal: ')) return who.slice(10)
  const parts = who.split(' ')
  return parts[parts.length - 1]
}
