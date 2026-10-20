import { ArrowRight, CaretRight, ClockCounterClockwise, Info, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { createContext, type ReactNode, useContext, useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/fields'
import { Plate } from '@/components/Plate'
import type { Tone } from '@/lib/finance-labels'
import { cn } from '@/lib/utils'
import { btnGhost, btnPrimary, btnSecondary, Pill, Section } from '@/pages/finance/FinanceParts'
import { FinanceDialog } from './dialogs'
import { L } from '../i18n'
import { fmt } from '../core/money'
import type { HistoryEntry, Id, LinkType, Money, Vehicle } from '../core/types'
import { useDb, useFmt, entityHref } from './hooks'
import { statusOf, STATUS } from './status'
import { userName } from '../core/helpers'

export { btnGhost, btnPrimary, btnSecondary, FinanceDialog, Pill, Section }
export const btnSmall = 'inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-line-soft disabled:opacity-60'
export const btnDanger = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-alert px-4 font-medium text-white transition-colors hover:bg-alert/90 disabled:opacity-60'

// ---------------------------------------------------------------- page scaffolding

const EmbeddedCtx = createContext(false)
/** A screen shown inside another screen (a view or tab of the 21-link menu): its title becomes a section heading, not a second h1. */
export function Embedded({ children }: { children: ReactNode }) {
  return <EmbeddedCtx.Provider value>{children}</EmbeddedCtx.Provider>
}

export function Page({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const embedded = useContext(EmbeddedCtx)
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {embedded ? <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2> : <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{title}</h1>}
          {description && <p className="mt-1 max-w-[860px] text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

export function Panel({ title, description, action, children, className, flush }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  const id = useId()
  return (
    <section aria-labelledby={title ? id : undefined} className={cn('min-w-0 rounded-xl border border-line bg-surface', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 id={id} className="text-[14.5px] font-semibold tracking-[-0.01em]">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-[12.5px] text-ink-2">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  )
}

export function Kpis({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode; to?: string; tone?: Tone }[] }) {
  return (
    <section aria-label={L('Özet', 'Summary')} className="grid overflow-hidden rounded-xl border border-line bg-line-soft" style={{ gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {items.map((k) => {
        const inner = (
          <>
            <span className="block text-[12.5px] text-ink-2">{k.label}</span>
            <span className={cn('tnum mt-1 block text-[20px] leading-[1.15] sm:text-[24px] font-semibold tracking-[-0.02em]', k.tone === 'alert' ? 'text-alert' : k.tone === 'hold' ? 'text-hold' : k.tone === 'ok' ? 'text-ok' : 'text-ink')}>{typeof k.value === 'string' && k.value.includes('\n') ? k.value.split('\n').map((line) => <span key={line} className="block whitespace-nowrap">{line}</span>) : k.value}</span>
            {k.hint && <span className="mt-1.5 line-clamp-2 block text-[12px] text-ink-3">{k.hint}</span>}
          </>
        )
        return k.to ? (
          <Link key={k.label} to={k.to as never} className="block bg-surface px-4 py-3.5 hover:bg-ground/50 focus-visible:bg-ground/50">
            {inner}
          </Link>
        ) : (
          <div key={k.label} className="bg-surface px-4 py-3.5">
            {inner}
          </div>
        )
      })}
    </section>
  )
}

export function Notice({ tone = 'hold', children, action }: { tone?: 'hold' | 'alert' | 'blue' | 'ok'; children: ReactNode; action?: ReactNode }) {
  const cls = { hold: 'border-hold/35 bg-hold-soft', alert: 'border-alert/30 bg-alert-soft', blue: 'border-blue/25 bg-blue-soft/60', ok: 'border-ok/30 bg-ok-soft' }[tone]
  const color = { hold: 'text-hold', alert: 'text-alert', blue: 'text-blue-ink', ok: 'text-ok' }[tone]
  const Ico = tone === 'blue' ? Info : WarningCircle
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] text-ink', cls)}>
      <Ico size={17} className={cn('mt-px shrink-0', color)} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[460px] text-[13px] text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Facts({ rows, single }: { rows: [string, ReactNode][]; single?: boolean }) {
  return (
    <dl className={cn('grid gap-x-8', !single && 'sm:grid-cols-2')}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line-soft py-2.5">
          <dt className="shrink-0 text-[13px] text-ink-2">{k}</dt>
          <dd className="min-w-0 text-right font-medium break-words text-ink">{v ?? <span className="font-normal text-ink-3">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------- tabs, segmented

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number; hidden?: boolean }[]; value: T; onChange: (v: T) => void; label?: string }) {
  const visible = tabs.filter((t) => !t.hidden)
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1 [scrollbar-width:thin]">
      {visible.map((t) => {
        const on = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={cn('relative h-10 shrink-0 px-3 text-[13.5px] font-medium whitespace-nowrap', on ? 'text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:rounded-full after:bg-blue' : 'text-ink-2 hover:text-ink')}
          >
            {t.label}
            {t.count !== undefined && <span className={cn('tnum ml-1.5 rounded-md px-1.5 text-[11.5px]', on ? 'bg-blue-soft text-blue-ink' : 'bg-ground text-ink-3')}>{t.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-ground p-0.5">
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)} className={cn('h-8 rounded-md px-3 text-[13px] font-medium', o.id === value ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--ac-line)]' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- filters

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
      <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
      <Input
        type="search"
        role="searchbox"
        aria-label={label}
        value={local}
        placeholder={placeholder}
        className="pl-9"
        onChange={(e) => {
          setLocal(e.target.value)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => onChange(e.target.value), 200)
        }}
      />
    </div>
  )
}

export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; className?: string }) {
  return (
    <label className={cn('flex items-center gap-2 text-[13px] text-ink-2', className)}>
      <span className="sr-only sm:not-sr-only">{label}</span>
      <span className="relative block">
        <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 max-w-[220px] appearance-none rounded-lg border border-line bg-surface pr-8 pl-3 text-[13.5px] text-ink outline-none hover:border-ink-3/50 focus:border-blue focus:ring-3 focus:ring-blue/15">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <CaretRight size={12} aria-hidden className="pointer-events-none absolute top-1/2 right-3 rotate-90 text-ink-3" />
      </span>
    </label>
  )
}

export function FilterBar({ children, onReset, active }: { children: ReactNode; onReset?: () => void; active?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {onReset && active && (
        <button type="button" onClick={onReset} className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-blue hover:bg-blue-soft">
          <X size={14} /> {L('Filtreleri sıfırla', 'Reset filters')}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- small display pieces

export function Status({ kind, value }: { kind: keyof typeof STATUS; value: string }) {
  const s = statusOf(kind, value)
  return <Pill tone={s.tone}>{s.label}</Pill>
}

/** One pill for an advance: its own lifecycle (held → moved → applied, or refunded / policy fee). A reversed line shows the payment status. */
export function AdvanceStatus({ p }: { p: { status: string; advanceState?: string } }) {
  return p.status === 'voided' ? <Status kind="payment" value="voided" /> : <Status kind="advance" value={p.advanceState ?? 'unapplied'} />
}

export function MoneyText({ m, minor, cur, className }: { m?: Money; minor?: number; cur?: string; className?: string }) {
  const mm = m ?? { minor: minor ?? 0, cur: cur ?? 'EUR' }
  return <span className={cn('tnum whitespace-nowrap', className)}>{fmt(mm.minor, mm.cur)}</span>
}

export function Link2({ type, id, children, className }: { type: LinkType; id: Id; children: ReactNode; className?: string }) {
  return (
    <Link to={entityHref(type, id) as never} className={cn('font-medium text-blue hover:underline', typeof children === 'string' && /^[A-Z]{1,3}-[0-9]+$/.test(children) && 'whitespace-nowrap', className)}>
      {children}
    </Link>
  )
}

export function VehicleChip({ v, link = true }: { v: Vehicle; link?: boolean }) {
  const chip = <Plate plate={v.plate} country={v.homeBranchId === 'b-dbv' ? undefined : 'BA'} />
  return link ? (
    <Link to={entityHref('vehicle', v.id) as never} className="inline-flex" aria-label={`${L('Araç', 'Vehicle')} ${v.plate}`}>
      {chip}
    </Link>
  ) : (
    chip
  )
}

export function BranchTag({ code }: { code: string }) {
  return <span className="rounded border border-line px-1.5 py-0.5 text-[11.5px] font-semibold tracking-[0.04em] text-ink-2">{code}</span>
}

export function Timeline({ entries }: { entries: HistoryEntry[] }) {
  const d = useDb()
  const f = useFmt()
  if (!entries.length) return <p className="text-[13px] text-ink-2">{L('Henüz kayıt yok.', 'No entries yet.')}</p>
  return (
    <ol className="divide-y divide-line-soft">
      {[...entries].reverse().map((e) => (
        <li key={e.id} className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-2.5 py-2.5">
          <ClockCounterClockwise size={16} className="mt-0.5 text-ink-3" />
          <div className="min-w-0">
            <p className="font-medium text-ink">{e.action}</p>
            <p className="tnum text-[12.5px] text-ink-2">
              {f.dt(e.at)} · {userName(d, e.by)}
            </p>
            {e.detail && <p className="mt-0.5 text-[13px] break-words text-ink-2">{e.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to as never} className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
      <ArrowRight size={14} className="rotate-180" /> {label}
    </Link>
  )
}

/** "Honest demo" note used where a real-world integration would exist. */
export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[12.5px] text-ink-3">
      <Info size={14} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** Shows an action error (rule violation) inline. */
export function ActionError({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-alert/30 bg-alert-soft px-3.5 py-2.5 text-[13px] font-medium text-alert">
      <WarningCircle size={17} className="mt-px shrink-0" />
      {error}
    </p>
  )
}
