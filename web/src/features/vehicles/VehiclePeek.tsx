import { CircleAlert, CircleCheck, Info, MoreHorizontal, OctagonX, X } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { NOW_OFFSET, WINDOW_DAYS, type Segment, type Vehicle } from './data'
import {
  actionsFor,
  type CheckState,
  currentOf,
  dayInfo,
  fmtKm,
  fmtRelative,
  fmtWhen,
  NOW_LABEL,
  nextEventOf,
  readinessChecks,
} from './derive'
import { Plate } from './Plate'
import { KIND_FILL, KIND_LABEL, Ribbon } from './Ribbon'

const PANEL_W = 420
const MINI_DAY_W = (PANEL_W - 40) / WINDOW_DAYS

const CHECK_ICON = { ok: CircleCheck, warn: CircleAlert, block: OctagonX }
const CHECK_TONE: Record<CheckState, string> = { ok: 'text-faint', warn: 'text-amber', block: 'text-signal' }
const CHECK_BAR: Record<CheckState, string> = { ok: 'bg-ink/20', warn: 'bg-amber', block: 'bg-signal' }

/** Right-hand summary of the selected vehicle; the full record lives in Araç 360°. */
export function VehiclePeek({ vehicle: v, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const cur = currentOf(v)
  const next = nextEventOf(v, cur)
  const checks = readinessChecks(v)
  const done = checks.filter((c) => c.state === 'ok').length
  const actions = actionsFor(v, cur)
  const blockedActions = actions.filter((a) => a.disabledReason)

  return (
    <aside
      aria-label={`${v.plate} önizleme`}
      className="fixed inset-y-0 right-0 z-40 flex flex-col border-l border-rule bg-surface shadow-[-16px_0_40px_-24px_rgb(20_23_26/0.35)]"
      style={{ width: PANEL_W }}
    >
      {/* identity */}
      <header className="px-5 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Plate value={v.plate} size="lg" />
          {v.source === 'external' && (
            <span className="rounded-[3px] border border-plate/40 px-1.5 py-0.5 text-[11.5px] font-medium text-plate">Dış kaynak</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" className="h-8 px-2.5 text-[12.5px]">
              Araç 360°
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Önizlemeyi kapat"
              className="grid size-8 place-items-center rounded-md text-graphite hover:bg-ground hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <h2 className="mt-3 text-[18px] leading-tight font-semibold tracking-[-0.015em]">
          {v.make} {v.model}
        </h2>
        <p className="mt-1 text-[12.5px] text-graphite">
          {v.vehicleClass}, {v.year}, {v.spec.toLocaleLowerCase('tr-TR')}
          {v.supplier && <>, {v.supplier}</>}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* what the car is doing now */}
        <section className="border-y border-rule bg-ground/60 px-5 pt-3.5 pb-4">
          <div className="flex items-baseline gap-3">
            <span className={cn('text-[20px] leading-none font-semibold tracking-[-0.01em]', next?.late && 'text-signal')}>
              {NOW_LABEL[cur.state]}
            </span>
            {cur.segment?.who && <span className="min-w-0 truncate text-ink/80">{cur.segment.who}</span>}
            <span className="figures ml-auto shrink-0 text-[11.5px] text-faint">14:30 itibarıyla</span>
          </div>
          {next && (
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-graphite">{next.text}</span>
              <span className={cn('figures text-[15px] font-semibold', next.late && 'text-signal')}>{next.when}</span>
              {!next.late && cur.segment && cur.state !== 'free' && (
                <span className="figures text-[12px] text-graphite">{fmtRelative(cur.segment.to)}</span>
              )}
              <a href="#" className="figures ml-auto text-[12px] text-plate hover:underline">
                {next.ref}
              </a>
            </div>
          )}
          <div className="mt-3">
            <MiniHeader />
            <Ribbon
              segments={v.segments}
              overdueFrom={cur.overdueHours ? cur.segment?.to : undefined}
              dayW={MINI_DAY_W}
              height="panel"
            />
          </div>
        </section>

        {/* delivery readiness */}
        <section className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Teslime hazırlık</h3>
            <span className="figures ml-auto text-[12px] text-graphite">
              {done} / {checks.length} tamam
            </span>
            <span aria-hidden className="flex gap-[3px]">
              {checks.map((c) => (
                <span key={c.area} className={cn('h-1.5 w-3.5 rounded-[1px]', CHECK_BAR[c.state])} />
              ))}
            </span>
          </div>
          <ul className="mt-2">
            {checks.map((c) => {
              const Icon = CHECK_ICON[c.state]
              return c.state === 'ok' ? (
                <li key={c.area} className="grid grid-cols-[18px_1fr] items-center gap-x-2.5 border-t border-rule-soft py-[7px] first:border-t-0">
                  <Icon className={cn('size-4', CHECK_TONE[c.state])} strokeWidth={2} />
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-ink/75">{c.area}</span>
                    <span className="truncate text-[12px] text-faint">{c.detail}</span>
                  </div>
                </li>
              ) : (
                <li key={c.area} className="grid grid-cols-[18px_1fr_auto] items-start gap-x-2.5 border-t border-rule-soft py-2.5 first:border-t-0">
                  <Icon className={cn('mt-px size-4', CHECK_TONE[c.state])} strokeWidth={2} />
                  <div className="min-w-0">
                    <div className="font-medium">{c.area}</div>
                    <div className="text-[12px] text-ink/80">{c.detail}</div>
                  </div>
                  {c.fix && (
                    <Button variant="outline" className="h-7 px-2 text-[12px]">
                      {c.fix}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {/* facts */}
        <section className="mx-5 grid grid-cols-2 border-t border-rule py-1">
          <Fact label="Kilometre">
            <span className="figures font-medium">{fmtKm(v.km)} km</span>
            <span className="block text-[11.5px] text-faint">{v.kmNote}</span>
          </Fact>
          <Fact label="Yakıt">
            <FuelGauge level={v.fuel} />
            <span className="block text-[11.5px] text-faint">Son inceleme kaydı</span>
          </Fact>
          <Fact label="Konum">{v.location.label}</Fact>
          <Fact label="Ana şube">{v.homeBranch}</Fact>
          <Fact label="Anahtar" wide>
            {v.keys}
          </Fact>
        </section>

        {/* timeline */}
        <section className="border-t border-rule px-5 pt-4 pb-5">
          <h3 className="mb-3 font-semibold">Sıradaki işler</h3>
          <Timeline segments={v.segments} nowLabel={NOW_LABEL[cur.state]} />
        </section>
      </div>

      {/* actions follow the car's current state */}
      <footer className="border-t border-rule px-5 pt-3 pb-3.5">
        <div className="flex items-center gap-2">
          {actions.map((a) => {
            const btn = (
              <Button
                key={a.label}
                variant={a.primary ? 'default' : 'outline'}
                disabled={!!a.disabledReason}
                className="h-9 px-3 disabled:opacity-45"
              >
                {a.label}
              </Button>
            )
            return a.disabledReason ? (
              <Tooltip key={a.label}>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>{btn}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64">
                  {a.disabledReason}
                </TooltipContent>
              </Tooltip>
            ) : (
              btn
            )
          })}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="Diğer işlemler" className="ml-auto size-9 p-0">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-48">
              <DropdownMenuItem>Rezervasyon oluştur</DropdownMenuItem>
              <DropdownMenuItem>Bakım planla</DropdownMenuItem>
              <DropdownMenuItem>Hasar bildir</DropdownMenuItem>
              <DropdownMenuItem>Ceza kaydet</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Transfer başlat</DropdownMenuItem>
              <DropdownMenuItem>Belge ekle</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {blockedActions.map((a) => (
          <p key={a.label} className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-graphite">
            <Info className="mt-px size-3.5 shrink-0" />
            <span>
              <span className="font-medium text-ink">{a.label}</span> kapalı. {a.disabledReason}
            </span>
          </p>
        ))}
      </footer>
    </aside>
  )
}

function MiniHeader() {
  const today = Math.floor(NOW_OFFSET)
  return (
    <div className="mb-1 flex">
      {Array.from({ length: WINDOW_DAYS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'figures text-center text-[10.5px] leading-4',
            i === today ? 'font-semibold text-ink' : dayInfo(i).weekend ? 'text-faint' : 'text-graphite',
          )}
          style={{ width: MINI_DAY_W }}
        >
          {dayInfo(i).day}
        </span>
      ))}
    </div>
  )
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('border-b border-rule-soft py-2.5 last:border-b-0', wide && 'col-span-2')}>
      <div className="text-[11.5px] text-graphite">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  )
}

const FUEL_STEPS = ['Boş', '1/4', '1/2', '3/4', 'Dolu']

/** The five fixed fuel values (§59B) drawn as four cells. */
function FuelGauge({ level }: { level: string }) {
  const idx = FUEL_STEPS.indexOf(level)
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="flex gap-[2px]">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={cn('h-2.5 w-3 rounded-[1px]', n <= idx ? (idx <= 1 ? 'bg-amber' : 'bg-ink/70') : 'bg-ink/12')} />
        ))}
      </span>
      <span className="figures font-medium">{level}</span>
    </span>
  )
}

interface TimelineEvent {
  at: number
  title: string
  ref: string
  who?: string
  kind: Segment['kind']
  span?: string
}

function Timeline({ segments, nowLabel }: { segments: Segment[]; nowLabel: string }) {
  const events: TimelineEvent[] = segments
    .filter((s) => s.to > NOW_OFFSET || (s.kind === 'rental' && s.to <= NOW_OFFSET && s.to > NOW_OFFSET - 1))
    .map((s): TimelineEvent => {
      const days = Math.max(1, Math.round(s.to - s.from))
      if (s.from <= NOW_OFFSET) {
        const endTitle = { rental: 'İade', reservation: 'Rezervasyon bitişi', maintenance: 'Servisten çıkış', transfer: 'Varış', out: 'Kullanıma dönüş' }[s.kind]
        return { at: s.to, title: endTitle, ref: s.ref, who: s.who ?? s.note, kind: s.kind }
      }
      const startTitle = { rental: 'Teslim', reservation: 'Teslim', maintenance: 'Servise giriş', transfer: 'Transfer', out: 'Tedarikçiye iade' }[s.kind]
      return { at: s.from, title: startTitle, ref: s.ref, who: s.who ?? s.note, kind: s.kind, span: `${days} gün` }
    })
    .sort((a, b) => a.at - b.at)

  if (events.length === 0) return <p className="text-graphite">Önümüzdeki 14 günde planlı iş yok.</p>

  return (
    <ol className="relative">
      <span aria-hidden className="absolute top-2 bottom-2 left-[71px] w-px bg-rule" />
      <li className="relative grid grid-cols-[64px_16px_1fr] items-center gap-x-2 pb-3">
        <span className="figures text-right text-[12px] font-semibold">Şimdi</span>
        <span aria-hidden className="relative z-10 mx-auto size-2.5 rounded-full border-2 border-ink bg-surface" />
        <span className="text-graphite">{nowLabel}</span>
      </li>
      {events.map((e) => {
        const when = fmtWhen(e.at)
        const [day, time] = splitWhen(when)
        return (
          <li key={e.ref + e.at} className="relative grid grid-cols-[64px_16px_1fr] gap-x-2 pb-3 last:pb-0">
            <span className="figures text-right leading-tight">
              <span className="block text-[12px] text-graphite">{day}</span>
              <span className="block font-medium">{time}</span>
            </span>
            <span aria-hidden className={cn('relative z-10 mx-auto mt-[3px] h-3 w-3 rounded-[2px]', KIND_FILL[e.kind])} />
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="font-medium">{e.title}</span>
                <span className="text-[12px] text-graphite">{KIND_LABEL[e.kind].toLocaleLowerCase('tr-TR')}</span>
                {e.span && <span className="figures text-[12px] text-faint">{e.span}</span>}
                <a href="#" className="figures ml-auto text-[12px] text-plate hover:underline">
                  {e.ref}
                </a>
              </span>
              {e.who && <span className="block truncate text-[12.5px] text-ink/75">{e.who}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** "bugün 18:00" → ["Bugün", "18:00"]; "12.10 Pzt 16:00" → ["12.10 Pzt", "16:00"]. */
function splitWhen(when: string): [string, string] {
  const i = when.lastIndexOf(' ')
  const day = when.slice(0, i)
  return [day.charAt(0).toLocaleUpperCase('tr-TR') + day.slice(1), when.slice(i + 1)]
}

