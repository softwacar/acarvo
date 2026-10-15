import type { TransferListItem, TransferView } from '@acarvo/shared'
import { ArrowLeft, ArrowRight, Plus, Truck } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Select } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ForbiddenState, PageHeader } from '@/components/states'
import { ApiRequestError, transfersApi } from '@/lib/api'
import { TRANSFER_STATUS_LABELS, TRANSFER_STATUS_TONE } from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { BranchCode, EmptyList, ListFrame, type ListTab, Pill, SkeletonRows, useSearchText } from './OpsParts'
import type { TransferListSearch } from './search'

const TABS: [TransferView, string][] = [
  ['open', 'Açık'],
  ['incoming', 'Gelen (teslim alınacak)'],
  ['requested', 'Talep'],
  ['approved', 'Onaylı'],
  ['in_transit', 'Yolda'],
  ['late', 'Geciken'],
  ['completed', 'Teslim alınan'],
  ['cancelled', 'İptal'],
  ['all', 'Tümü'],
]

function Row({ t }: { t: TransferListItem }) {
  const session = useSession()
  const navigate = useNavigate()
  const done = t.status === 'completed' || t.status === 'cancelled'
  const label = t.late ? 'Yolda · gecikti' : TRANSFER_STATUS_LABELS[t.status]
  return (
    <tr onClick={() => navigate({ to: '/araclar/transferler/$transferId', params: { transferId: t.id } })} className={cn('group h-[60px] cursor-pointer hover:bg-blue-soft/35', done && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{t.transferNo}</span>
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <span className="flex min-w-0 items-center gap-2">
          <Plate plate={t.vehicle.plate} country={session.company?.country} />
          <Link to="/araclar/transferler/$transferId" params={{ transferId: t.id }} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 font-medium text-ink group-hover:text-blue-ink hover:underline">
            <BranchCode code={t.fromBranch.code} />
            <ArrowRight size={12} aria-label="→" />
            <BranchCode code={t.toBranch.code} />
          </Link>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
          <span className="tnum sm:hidden">{t.transferNo} · </span>
          {t.vehicle.make} {t.vehicle.model}
        </span>
        <span className="mt-1 block md:hidden">
          <Pill tone={t.late ? 'alert' : TRANSFER_STATUS_TONE[t.status]}>{label}</Pill>
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight md:table-cell">
        <span className="tnum block whitespace-nowrap text-ink">{formatMoment(t.plannedDeparture)}</span>
        <span className={cn('tnum mt-0.5 block text-[12.5px] whitespace-nowrap', t.late ? 'font-medium text-alert' : 'text-ink-2')}>→ {formatMoment(t.plannedArrival)}</span>
      </td>
      <td className="hidden pr-5 pl-3 md:table-cell">
        <Pill tone={t.late ? 'alert' : TRANSFER_STATUS_TONE[t.status]}>{label}</Pill>
      </td>
    </tr>
  )
}

/** Araç Transferleri: between branches of the company. In transit is not arrived; only the destination receives. */
export function TransfersPage() {
  const session = useSession()
  const companyId = session.company?.id
  const search = useSearch({ from: '/app/araclar/transferler' }) as TransferListSearch
  const navigate = useNavigate({ from: '/araclar/transferler' })
  const set = (patch: Partial<TransferListSearch>) => navigate({ search: (prev: TransferListSearch) => ({ ...prev, ...patch, page: patch.page }), replace: true })
  const { text, setText, q } = useSearchText(() => search.page && set({}))
  const view = search.view ?? 'open'
  const page = search.page ?? 1
  const pageSize = search.pageSize ?? 25
  const branches = useQuery({ queryKey: ['ops-branches', companyId, 'transfer'], queryFn: () => transfersApi.branches() })
  const body = { q: q || undefined, view, branchId: search.branchId, sort: search.sort ?? 'departure', dir: search.dir ?? 'desc', page, pageSize }
  const list = useQuery({ queryKey: ['transfers', companyId, body], queryFn: () => transfersApi.search(body), placeholderData: keepPreviousData })
  const data = list.data
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const tabs: ListTab<TransferView>[] = TABS.map(([v, label]) => ({
    view: v,
    label,
    count: data && v in data.counts ? data.counts[v as keyof typeof data.counts] : undefined,
    tone: v === 'late' ? 'alert' : v === 'incoming' || v === 'requested' ? 'hold' : undefined,
  }))
  return (
    <div className="space-y-5">
      <div>
        <Link to="/araclar" className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-ink-2 hover:bg-ground hover:text-ink">
          <ArrowLeft size={14} />
          Araçlar
        </Link>
      </div>
      <PageHeader title="Araç Transferleri" description={session.company ? `${session.company.name} · şubeler arası araç hareketleri` : undefined}>
        {can(session, 'transfers.request') && (
          <Link to="/araclar/transferler/yeni" className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Transfer talebi
          </Link>
        )}
      </PageHeader>
      {forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <ListFrame
          label="Transfer görünümü"
          tabs={tabs}
          view={view}
          onView={(v) => set({ view: v === 'open' ? undefined : v })}
          text={text}
          onText={setText}
          placeholder="Transfer no, plaka, neden"
          filters={
            (branches.data?.branches.length ?? 0) > 1 && (
              <Select compact aria-label="Şube" value={search.branchId ?? ''} onChange={(e) => set({ branchId: e.target.value || undefined })} className="w-auto max-w-[200px]">
                <option value="">Tüm şubeler</option>
                {branches.data!.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (çıkış veya varış)
                  </option>
                ))}
              </Select>
            )
          }
          info="Planlanan çıkış çıkış şubesinin, planlanan varış varış şubesinin yerel saatidir. Yoldaki araç teslim alınana kadar varış şubesinde sayılmaz; aracın ana şubesi değişmez."
          totalText={data ? `${data.total} transfer` : ''}
          loading={list.isPlaceholderData}
          error={list.isError ? list.error : null}
          onRetry={() => list.refetch()}
          empty={
            data && data.total === 0 ? (
              <EmptyList icon={Truck} title={view === 'open' && !q && !search.branchId ? 'Açık transfer yok' : 'Bu görünümde transfer yok'}>
                <p>{view === 'open' ? 'Bir aracı başka şubeye taşımak için transfer talebi oluşturun.' : 'Görünümü veya filtreleri değiştirin.'}</p>
              </EmptyList>
            ) : null
          }
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={(p) => set({ page: p > 1 ? p : undefined })}
          onPageSize={(n) => set({ pageSize: n === 25 ? undefined : n })}
          unit="transfer"
        >
          <table className="w-full table-fixed text-left sm:min-w-[520px]">
            <thead>
              <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                <th scope="col" className="hidden w-[100px] px-3 pl-5 font-medium sm:table-cell">
                  No
                </th>
                <th scope="col" className="pr-3 pl-4 font-medium sm:px-3">
                  Araç ve güzergâh
                </th>
                <th scope="col" className="hidden w-[200px] px-3 font-medium md:table-cell">
                  Planlanan çıkış → varış
                </th>
                <th scope="col" className="hidden w-[170px] pr-5 pl-3 font-medium md:table-cell">
                  Durum
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">{!data ? <SkeletonRows cols={4} /> : data.items.map((t) => <Row key={t.id} t={t} />)}</tbody>
          </table>
        </ListFrame>
      )}
    </div>
  )
}
