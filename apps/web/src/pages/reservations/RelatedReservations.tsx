import { Info, Plus } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { reservationsApi } from '@/lib/api'
import { can, useSession } from '@/session'
import { ReservationMiniList } from './ReservationParts'

/** "Rezervasyonlar" tab of Müşteri 360°, Kurumsal Hesap 360° and the vehicle's planning tab: real reservations. */
export function RelatedReservations({ kind, id }: { kind: 'customer' | 'account' | 'vehicle'; id: string }) {
  const session = useSession()
  const q = useQuery({
    queryKey: ['related-reservations', session.company?.id, kind, id],
    queryFn: () => (kind === 'customer' ? reservationsApi.forCustomer(id) : kind === 'account' ? reservationsApi.forAccount(id) : reservationsApi.forVehicle(id)),
  })
  const title = kind === 'vehicle' ? 'Bu aracın rezervasyonları' : 'Rezervasyonlar'
  const empty = kind === 'customer' ? 'Bu kişinin müşteri, sürücü veya rezervasyonu yapan olarak yer aldığı rezervasyon yok.' : kind === 'account' ? 'Bu kurumsal hesapla yapılmış rezervasyon yok.' : 'Bu araca atanmış rezervasyon yok.'
  return (
    <section aria-labelledby="related-res-title" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="related-res-title" className="text-[15px] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {can(session, 'reservations.manage') && (
          <Link to="/rezervasyonlar/yeni" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground">
            <Plus size={14} weight="bold" />
            Yeni rezervasyon
          </Link>
        )}
      </div>
      <ReservationMiniList items={q.data?.items} isPending={q.isPending} error={q.error} onRetry={() => q.refetch()} empty={empty} />
      <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
        {kind === 'vehicle'
          ? 'Kiralamalar ayrı listede. Bakım ve transfer blokları ilgili modüller geliştirildiğinde görünecek.'
          : 'Yetki alanınızdaki şubelerin rezervasyonları gösterilir. Kiralamalar ayrı listede.'}
      </p>
    </section>
  )
}
