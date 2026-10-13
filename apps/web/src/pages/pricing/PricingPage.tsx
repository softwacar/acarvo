import type { PriceListSummary } from '@acarvo/shared'
import { Plus, Tag } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, pricingApi } from '@/lib/api'
import { DAY_METHOD_LABEL, PRICE_LIST_STATUS_LABEL, TAX_MODE_LABEL } from '@/lib/pricing-labels'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime } from '@/lib/vehicle-labels'
import { can, useSession } from '@/session'

const btnPrimary = 'inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink disabled:opacity-60'
export const STATUS_TONE: Record<string, string> = { active: 'border-ok/30 bg-ok-soft text-ok', draft: 'border-blue/25 bg-blue-soft text-blue-ink', archived: 'border-line bg-ground text-ink-3' }

export function PriceListStatusBadge({ status }: { status: string }) {
  return <span className={cn('inline-flex h-6 items-center rounded-md border px-2 text-[12.5px] font-medium', STATUS_TONE[status])}>{PRICE_LIST_STATUS_LABEL[status] ?? status}</span>
}

const validity = (l: Pick<PriceListSummary, 'validFrom' | 'validUntil'>) =>
  l.validFrom || l.validUntil ? `${l.validFrom ? formatDate(l.validFrom) : 'başlangıç yok'} – ${l.validUntil ? formatDate(l.validUntil) : 'bitiş yok'}` : 'Süresiz'

/** Fiyatlandırma: the company's price lists. Each save creates a new revision; saved quotes keep theirs. */
export function PricingPage() {
  const session = useSession()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['price-lists', session.company?.id], queryFn: pricingApi.lists, retry: false })
  if (!can(session, 'pricing.read')) return <ForbiddenState />
  const canManage = can(session, 'pricing.manage')
  const sorted = [...(q.data?.items ?? [])].sort((a, b) => ['active', 'draft', 'archived'].indexOf(a.status) - ['active', 'draft', 'archived'].indexOf(b.status) || b.priority - a.priority || a.name.localeCompare(b.name, 'tr'))
  return (
    <div className="space-y-5">
      <PageHeader title="Fiyatlandırma" description="Fiyat listeleri, sınıf tarifeleri, sezonlar, ek hizmetler, indirimler ve vergi ayarı. Tutarlar sunucuda hesaplanır; teklif ödeme değildir.">
        {canManage && (
          <Link to="/fiyatlandirma/yeni" className={btnPrimary}>
            <Plus size={16} /> Yeni fiyat listesi
          </Link>
        )}
      </PageHeader>
      {q.isError ? (
        q.error instanceof ApiRequestError && q.error.status === 403 ? (
          <ForbiddenState />
        ) : (
          <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
        )
      ) : !q.data ? (
        <div className="h-48 animate-pulse rounded-xl bg-line-soft/60" aria-busy="true" aria-label="Fiyat listeleri yükleniyor" />
      ) : sorted.length === 0 ? (
        <StatePanel icon={Tag} title="Fiyat listesi yok">
          <p>Fiyat listesi olmadan rezervasyon ve kiralamalarda fiyat “Hesaplanmadı” olarak kalır. Vergi oranı ve para birimi tahmin edilmez.</p>
          {canManage && (
            <Link to="/fiyatlandirma/yeni" className={cn(btnPrimary, 'mt-4')}>
              <Plus size={16} /> İlk fiyat listesini oluştur
            </Link>
          )}
        </StatePanel>
      ) : (
        <section aria-label="Fiyat listeleri" className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13.5px]">
              <thead>
                <tr className="h-10 border-b border-line text-left text-[12px] text-ink-2">
                  <th scope="col" className="pl-5 font-medium">
                    Liste
                  </th>
                  <th scope="col" className="px-3 font-medium">
                    Durum
                  </th>
                  <th scope="col" className="px-3 font-medium">
                    Kapsam
                  </th>
                  <th scope="col" className="px-3 font-medium">
                    Geçerlilik
                  </th>
                  <th scope="col" className="px-3 font-medium">
                    Vergi
                  </th>
                  <th scope="col" className="px-3 text-right font-medium">
                    Sınıf
                  </th>
                  <th scope="col" className="pr-5 pl-3 font-medium">
                    Son değişiklik
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {sorted.map((l) => (
                  <tr key={l.id} onClick={() => navigate({ to: '/fiyatlandirma/$priceListId', params: { priceListId: l.id } })} className={cn('h-[56px] cursor-pointer hover:bg-blue-soft/35', l.status === 'archived' && 'text-ink-2')}>
                    <td className="py-2 pl-5">
                      <Link to="/fiyatlandirma/$priceListId" params={{ priceListId: l.id }} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-blue-ink hover:underline">
                        {l.name}
                      </Link>
                      <span className="block text-[12px] text-ink-3">
                        {l.currency} · revizyon {l.revision} · öncelik {l.priority}
                      </span>
                    </td>
                    <td className="px-3">
                      <PriceListStatusBadge status={l.status} />
                    </td>
                    <td className="px-3">{l.branch ? `${l.branch.name} (${l.branch.code})` : 'Tüm şubeler'}</td>
                    <td className="tnum px-3">{validity(l)}</td>
                    <td className={cn('px-3', l.taxMode === 'not_configured' && 'text-hold')}>{TAX_MODE_LABEL[l.taxMode]}</td>
                    <td className="tnum px-3 text-right">{l.rateCount}</td>
                    <td className="pr-5 pl-3 text-[12.5px] text-ink-2">
                      {formatDateTime(l.updatedAt)}
                      {l.updatedByName && <span className="block">{l.updatedByName}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <p className="text-[12.5px] text-ink-2">
        Liste seçimi: şubeye özel liste genel listeden önce gelmez; en yüksek öncelikli etkin ve geçerli liste kullanılır. Aynı öncelikte birden fazla uygun liste varsa sistem seçmez, kullanıcıdan seçim ister. Gün hesabı her listede belirtilir ({DAY_METHOD_LABEL.rolling_24h.toLocaleLowerCase('tr')} veya {DAY_METHOD_LABEL.calendar_day.toLocaleLowerCase('tr')}).
      </p>
    </div>
  )
}
