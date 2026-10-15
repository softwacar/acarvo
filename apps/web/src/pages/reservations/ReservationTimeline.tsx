import type { ReservationBranch, VehicleClassSummary } from '@acarvo/shared'
import { CaretLeft, CaretRight, Info } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Select } from '@/components/fields'
import { ErrorState } from '@/components/states'
import { reservationsApi } from '@/lib/api'
import { dayLabel, RESERVATION_STATUS_LABELS } from '@/lib/reservation-labels'
import { RENTAL_STATUS_LABELS } from '@/lib/rental-labels'
import { cn } from '@/lib/utils'
import { useSession } from '@/session'

const DAYS = 14
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

/**
 * 14-day vehicle plan: one row per vehicle (in the user's branch scope), confirmed reservations as solid bars, pending
 * ones dashed (they hold nothing, spec §9.2). Bars are positioned in the company's days; it scrolls inside its card.
 */
export function ReservationTimeline({ branches, classes, today }: { branches: ReservationBranch[]; classes: VehicleClassSummary[]; today: string }) {
  const session = useSession()
  const [from, setFrom] = useState(today)
  const [branchId, setBranchId] = useState('')
  const [classId, setClassId] = useState('')
  const body = { from, days: DAYS, branchId: branchId || undefined, vehicleClassId: classId || undefined }
  const q = useQuery({ queryKey: ['reservation-timeline', session.company?.id, body], queryFn: () => reservationsApi.timeline(body), placeholderData: keepPreviousData })
  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i))
  const t = q.data
  // Placed against the window's real instants in the company zone (DST days are 23 or 25 hours long).
  const windowStart = t ? Date.parse(t.windowStart) : 0
  const span = t ? Date.parse(t.windowEnd) - windowStart : 1
  const pos = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - windowStart) / span) * 100))
  return (
    <section aria-label="Araç zaman çizelgesi" className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex overflow-hidden rounded-lg border border-line">
          <button type="button" aria-label="Önceki iki hafta" onClick={() => setFrom(addDays(from, -DAYS))} className="grid size-9 place-items-center text-ink-2 hover:bg-ground">
            <CaretLeft size={14} />
          </button>
          <button type="button" onClick={() => setFrom(today)} className="h-9 border-x border-line px-3 text-[13px] font-medium text-ink hover:bg-ground">
            Bugün
          </button>
          <button type="button" aria-label="Sonraki iki hafta" onClick={() => setFrom(addDays(from, DAYS))} className="grid size-9 place-items-center text-ink-2 hover:bg-ground">
            <CaretRight size={14} />
          </button>
        </div>
        <span className="tnum text-[13px] font-medium text-ink">
          {dayLabel(days[0]!)} – {dayLabel(days[DAYS - 1]!)}.{days[DAYS - 1]!.slice(0, 4)}
        </span>
        {branches.length > 1 && (
          <Select compact aria-label="Ana şube" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-auto max-w-[180px]">
            <option value="">Tüm şubelerin araçları</option>
            {branches
              .filter((b) => b.inScope)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
        )}
        <Select compact aria-label="Araç sınıfı" value={classId} onChange={(e) => setClassId(e.target.value)} className="w-auto max-w-[160px]">
          <option value="">Tüm sınıflar</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <span className="ml-auto flex items-center gap-3 text-[12.5px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-5 rounded-sm bg-ok/80" /> Onaylı
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-5 rounded-sm border border-dashed border-hold bg-hold-soft" /> Bekleyen (aracı tutmaz)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-5 rounded-sm bg-blue/80" /> Kiralama
          </span>
        </span>
      </div>
      {q.isError ? (
        <div className="p-4">
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className={cn('min-w-[760px] transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            <div className="grid grid-cols-[150px_1fr] border-b border-line text-[11.5px] text-ink-2">
              <span className="px-4 py-2 font-medium">Araç</span>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
                {days.map((d) => {
                  const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
                  return (
                    <span key={d} className={cn('border-l border-line-soft px-1 py-2 text-center', d === today && 'bg-blue-soft/40 font-semibold text-blue-ink', (wd === 0 || wd === 6) && d !== today && 'bg-ground/60')}>
                      <span className="block">{WEEKDAYS[wd]}</span>
                      <span className="tnum block">{dayLabel(d)}</span>
                    </span>
                  )
                })}
              </div>
            </div>
            {!t ? (
              <div className="h-40 animate-pulse bg-line-soft/40" aria-busy="true" />
            ) : t.vehicles.length === 0 ? (
              <p className="px-5 py-6 text-ink-2">Bu filtrelere uyan araç yok.</p>
            ) : (
              <ul>
                {t.vehicles.map((v) => (
                  <li key={v.id} className="grid grid-cols-[150px_1fr] border-b border-line-soft last:border-0">
                    <span className="min-w-0 px-4 py-2 leading-tight">
                      <span className="tnum block truncate text-[13px] font-medium text-ink">{v.plate}</span>
                      <span className="block truncate text-[11.5px] text-ink-2">
                        {v.className}
                        {v.status !== 'active' && ' · hizmet dışı'}
                      </span>
                    </span>
                    <div className="relative h-11" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(100% / ${DAYS} - 1px), var(--ac-line-soft, #eef0f3) calc(100% / ${DAYS} - 1px), var(--ac-line-soft, #eef0f3) calc(100% / ${DAYS}))` }}>
                      {t.bars
                        .filter((b) => b.vehicleId === v.id)
                        .map((b) => {
                          const left = pos(b.pickupAt)
                          const width = Math.max(1.2, pos(b.returnAt) - left)
                          return (
                            <Link
                              key={b.id}
                              to="/rezervasyonlar/$reservationId"
                              params={{ reservationId: b.id }}
                              aria-label={`${b.reservationNo}, ${RESERVATION_STATUS_LABELS[b.status]}`}
                              className={cn(
                                'absolute top-2 bottom-2 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap',
                                b.status === 'confirmed' ? 'bg-ok/80 text-white hover:bg-ok' : 'border border-dashed border-hold bg-hold-soft text-hold hover:bg-hold-soft/70',
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              {b.reservationNo}
                            </Link>
                          )
                        })}
                      {t.rentalBars
                        .filter((b) => b.vehicleId === v.id)
                        .map((b) => {
                          const left = pos(b.startsAt)
                          // Open end: handed over, planned return passed and not back yet; it runs to the window's end.
                          const width = Math.max(1.2, (b.endsAt ? pos(b.endsAt) : 100) - left)
                          return (
                            <Link
                              key={b.id}
                              to="/kiralamalar/$rentalId"
                              params={{ rentalId: b.id }}
                              aria-label={`${b.rentalNo}, kiralama ${RENTAL_STATUS_LABELS[b.status]}${b.endsAt ? '' : ', iade gecikti'}`}
                              className={cn(
                                'absolute top-2 bottom-2 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap text-white',
                                b.endsAt ? 'bg-blue/80 hover:bg-blue' : 'bg-alert/85 hover:bg-alert',
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              {b.rentalNo}
                              {!b.endsAt && ' · gecikmede'}
                            </Link>
                          )
                        })}
                      {(t.holdBars ?? [])
                        .filter((b) => b.vehicleId === v.id)
                        .map((b) => {
                          const left = Math.max(0, pos(b.startsAt))
                          // Open end: a running maintenance or transfer past its planned end, or a damage block not lifted.
                          const width = Math.max(1.2, (b.endsAt ? pos(b.endsAt) : 100) - left)
                          const label = { maintenance: 'bakım', damage: 'hasar engeli', transfer: 'transfer' }[b.kind]
                          const to = { maintenance: '/bakim-servis/$maintenanceId', damage: '/hasar-kayitlari/$damageId', transfer: '/araclar/transferler/$transferId' }[b.kind]
                          const params = b.kind === 'maintenance' ? { maintenanceId: b.id } : b.kind === 'damage' ? { damageId: b.id } : { transferId: b.id }
                          return (
                            <Link
                              key={`${b.kind}${b.id}`}
                              to={to}
                              params={params as never}
                              aria-label={`${b.refNo}, ${label}${b.endsAt ? '' : ', bitişi belirsiz'}`}
                              className={cn(
                                'absolute top-2 bottom-2 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap',
                                b.kind === 'damage' ? 'border border-alert/60 bg-alert-soft text-alert' : b.kind === 'maintenance' ? 'bg-hold/85 text-white hover:bg-hold' : 'bg-ink-2/80 text-white hover:bg-ink-2',
                              )}
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              {b.refNo} · {label}
                            </Link>
                          )
                        })}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="flex items-start gap-1.5 border-t border-line-soft px-4 py-2.5 text-[12.5px] text-ink-2 sm:px-5">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
        {t?.unassigned ? `${t.unassigned} bekleyen rezervasyonda henüz araç atanmadı (yalnız sınıf). ` : ''}
        Kiralamalar mavi gösterilir; iadesi gecikmiş kiralama araç geri gelene kadar aracı tutar. Bakım ve transfer kayıtları ilgili modüllerle görünecek.
      </p>
    </section>
  )
}
