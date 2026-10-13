import { Info, Plus } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { rentalsApi } from '@/lib/api'
import { can, useSession } from '@/session'
import { RentalMiniList } from './RentalParts'

/** "Kiralamalar" tab of Müşteri 360°, Kurumsal Hesap 360° and Araç 360°: real rentals in the user's branch scope. */
export function RelatedRentals({ kind, id }: { kind: 'customer' | 'account' | 'vehicle'; id: string }) {
  const session = useSession()
  const q = useQuery({
    queryKey: ['related-rentals', session.company?.id, kind, id],
    queryFn: () => (kind === 'customer' ? rentalsApi.forCustomer(id) : kind === 'account' ? rentalsApi.forAccount(id) : rentalsApi.forVehicle(id)),
  })
  const empty = kind === 'customer' ? 'Bu kişinin kiracı veya sürücü olarak yer aldığı kiralama yok.' : kind === 'account' ? 'Bu kurumsal hesapla yapılmış kiralama yok.' : 'Bu aracın kiralaması yok.'
  return (
    <section aria-labelledby="related-rentals-title" className="rounded-xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="related-rentals-title" className="text-[15px] font-semibold tracking-[-0.01em]">
          {kind === 'vehicle' ? 'Bu aracın kiralamaları' : 'Kiralamalar'}
        </h2>
        {can(session, 'rentals.manage') && (
          <Link to="/kiralamalar/yeni" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-ground">
            <Plus size={14} weight="bold" />
            Yeni kiralama
          </Link>
        )}
      </div>
      <RentalMiniList items={q.data?.items} isPending={q.isPending} error={q.error} onRetry={() => q.refetch()} empty={empty} />
      <p className="mt-3 flex items-start gap-1.5 border-t border-line-soft pt-3 text-[12.5px] text-ink-2">
        <Info size={14} className="mt-[3px] shrink-0 text-ink-3" />
        Yetki alanınızdaki şubelerin kiralamaları gösterilir. Fiyat, ödeme ve sözleşme bilgisi Finans ve Sözleşme modülleriyle gelecek.
      </p>
    </section>
  )
}
