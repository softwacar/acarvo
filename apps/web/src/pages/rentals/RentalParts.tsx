import type { RentalGate, RentalListItem, RentalStatus } from '@acarvo/shared'
import { ArrowRight, Buildings, CheckCircle, Clock, Info, Key, WarningCircle, XCircle } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { ErrorState } from '@/components/states'
import { formatMoment } from '@/lib/reservation-labels'
import { formatLate, GATE_LABELS, gateText, RENTAL_STATUS_LABELS, RENTAL_STATUS_TONE } from '@/lib/rental-labels'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'

export function RentalStatusBadge({ status, overdueMinutes, className }: { status: RentalStatus; overdueMinutes?: number | null; className?: string }) {
  if (status === 'delivered' && overdueMinutes != null) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-alert', className)}>
        <span aria-hidden className="size-2 rounded-full bg-alert" />
        Gecikmede · {formatLate(overdueMinutes)}
      </span>
    )
  }
  const tone = RENTAL_STATUS_TONE[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', tone.text, className)}>
      <span aria-hidden className={cn('size-2 rounded-full', tone.dot)} />
      {RENTAL_STATUS_LABELS[status]}
    </span>
  )
}

const GATE_ICON = { ok: CheckCircle, attention: Info, blocked: XCircle } as const
const GATE_TONE = { ok: 'text-ok', attention: 'text-hold', blocked: 'text-alert' } as const
const GATE_STATE_TEXT = { ok: 'Tamam', attention: 'Dikkat', blocked: 'Engel' } as const

/** The handover desk / close checklist (spec §85.4): every item with its state written, its reason and what to do. */
export function GateList({ gates, kind = 'handover', className }: { gates: RentalGate[]; kind?: 'handover' | 'return'; className?: string }) {
  return (
    <ul className={cn('divide-y divide-line-soft', className)}>
      {gates.map((g) => {
        const Icon = GATE_ICON[g.state]
        return (
          <li key={g.code} className="flex items-start gap-3 py-2.5">
            <Icon size={18} weight={g.state === 'ok' ? 'fill' : 'regular'} className={cn('mt-0.5 shrink-0', GATE_TONE[g.state])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-medium text-ink">{GATE_LABELS[g.code]}</span>
                <span className={cn('text-[12px] font-semibold', GATE_TONE[g.state])}>{GATE_STATE_TEXT[g.state]}</span>
              </p>
              <p className="text-[13px] text-ink-2">{gateText(g.code, g.state, g.detail, kind)}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Compact rental rows for the 360° tabs of customers, corporate accounts and vehicles. */
export function RentalMiniList({ items, isPending, error, onRetry, empty }: { items?: RentalListItem[]; isPending: boolean; error?: Error | null; onRetry: () => void; empty: string }) {
  const session = useSession()
  const zone = session.company?.timezone
  if (isPending) return <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />
  if (!items?.length)
    return (
      <p className="flex items-center gap-2 text-ink-2">
        <Key size={17} className="text-ink-3" />
        {empty}
      </p>
    )
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((r) => (
        <li key={r.id}>
          <Link to="/kiralamalar/$rentalId" params={{ rentalId: r.id }} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-ground/50">
            <span className="tnum w-[84px] shrink-0 text-[13px] font-medium text-ink-2">{r.rentalNo}</span>
            <span className="min-w-0 flex-1 basis-[180px]">
              <span className="block truncate font-medium text-ink group-hover:text-blue-ink">{r.customer.displayName}</span>
              <span className="block truncate text-[12.5px] text-ink-2">
                {r.vehicle.plate} · {r.vehicle.make} {r.vehicle.model}
                {r.corporateAccount && (
                  <span className="ml-1 inline-flex items-center gap-1">
                    · <Buildings size={12} /> {r.corporateAccount.accountNo}
                  </span>
                )}
              </span>
            </span>
            <span className="tnum min-w-0 basis-full text-[12.5px] text-ink-2 sm:basis-auto">
              {formatMoment(r.delivered ?? r.plannedPickup, zone)} <ArrowRight size={11} className="inline" /> {formatMoment(r.returned ?? r.plannedReturn, zone)}
            </span>
            <RentalStatusBadge status={r.status} overdueMinutes={r.overdueMinutes} className="text-[13px]" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** A short honest note (finance, contract, damage) used across the rental screens. */
export function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  const Icon = tone === 'warn' ? WarningCircle : Info
  return (
    <p className="flex items-start gap-1.5 text-[12.5px] text-ink-2">
      <Icon size={14} className={cn('mt-[3px] shrink-0', tone === 'warn' ? 'text-hold' : 'text-ink-3')} />
      <span>{children}</span>
    </p>
  )
}

export function OverdueLine({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-alert">
      <Clock size={13} /> {formatLate(minutes)} gecikme
    </span>
  )
}
