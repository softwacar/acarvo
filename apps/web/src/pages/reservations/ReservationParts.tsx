import type { ReservationListItem, ReservationStatus } from '@acarvo/shared'
import { ArrowRight, Buildings, CalendarBlank } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { ErrorState } from '@/components/states'
import { formatMoment, RESERVATION_STATUS_LABELS, RESERVATION_STATUS_TONE } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'

export function StatusBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  const tone = RESERVATION_STATUS_TONE[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium whitespace-nowrap', tone.text, className)}>
      <span aria-hidden className={cn('size-2 rounded-full', tone.dot)} />
      {RESERVATION_STATUS_LABELS[status]}
    </span>
  )
}

/** Compact reservation rows for the 360° tabs of customers, corporate accounts and vehicles. */
export function ReservationMiniList({ items, isPending, error, onRetry, empty }: { items?: ReservationListItem[]; isPending: boolean; error?: Error | null; onRetry: () => void; empty: string }) {
  const session = useSession()
  if (isPending) return <div className="h-24 animate-pulse rounded-lg bg-line-soft/60" aria-busy="true" />
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />
  if (!items?.length)
    return (
      <p className="flex items-center gap-2 text-ink-2">
        <CalendarBlank size={17} className="text-ink-3" />
        {empty}
      </p>
    )
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((r) => (
        <li key={r.id}>
          <Link to="/rezervasyonlar/$reservationId" params={{ reservationId: r.id }} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-ground/50">
            <span className="tnum w-[84px] shrink-0 text-[13px] font-medium text-ink-2">{r.reservationNo}</span>
            <span className="min-w-0 flex-1 basis-[180px]">
              <span className="block truncate font-medium text-ink group-hover:text-blue-ink">{r.customer.displayName}</span>
              <span className="block truncate text-[12.5px] text-ink-2">
                {r.vehicle ? `${r.vehicle.plate} · ${r.vehicle.make} ${r.vehicle.model}` : `${r.vehicleClass.name} · araç atanmadı`}
                {r.corporateAccount && (
                  <span className="ml-1 inline-flex items-center gap-1">
                    · <Buildings size={12} /> {r.corporateAccount.accountNo}
                  </span>
                )}
              </span>
            </span>
            <span className="tnum min-w-0 basis-full text-[12.5px] text-ink-2 sm:basis-auto">
              {formatMoment(r.pickup, session.company?.timezone)} <ArrowRight size={11} className="inline" /> {formatMoment(r.return, session.company?.timezone)}
            </span>
            <StatusBadge status={r.status} className="text-[13px]" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
