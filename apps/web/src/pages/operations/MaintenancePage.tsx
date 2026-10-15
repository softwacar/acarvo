import { MAINTENANCE_TYPES, type MaintenanceListItem, type MaintenanceType, type MaintenanceView } from '@acarvo/shared'
import { Plus, Wrench } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Select } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ForbiddenState, PageHeader } from '@/components/states'
import { ApiRequestError, maintenanceApi } from '@/lib/api'
import { MAINTENANCE_STATUS_LABELS, MAINTENANCE_STATUS_TONE, MAINTENANCE_TYPE_LABELS } from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { BranchCode, EmptyList, ListFrame, type ListTab, Pill, SkeletonRows, useSearchText } from './OpsParts'
import type { MaintenanceListSearch } from './search'

const TABS: [MaintenanceView, string][] = [
  ['open', 'Açık'],
  ['pending_approval', 'Onay bekleyen'],
  ['planned', 'Planlı'],
  ['in_service', 'Bakımda'],
  ['awaiting_check', 'Kontrol bekleyen'],
  ['overdue', 'Geciken'],
  ['completed', 'Tamamlanan'],
  ['cancelled', 'İptal'],
  ['all', 'Tümü'],
]

function Row({ m, zone }: { m: MaintenanceListItem; zone?: string }) {
  const session = useSession()
  const navigate = useNavigate()
  const done = m.status === 'completed' || m.status === 'cancelled'
  return (
    <tr onClick={() => navigate({ to: '/bakim-servis/$maintenanceId', params: { maintenanceId: m.id } })} className={cn('group h-[60px] cursor-pointer hover:bg-blue-soft/35', done && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{m.maintenanceNo}</span>
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <span className="flex min-w-0 items-center gap-2">
          <Plate plate={m.vehicle.plate} country={session.company?.country} />
          <Link to="/bakim-servis/$maintenanceId" params={{ maintenanceId: m.id }} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-ink group-hover:text-blue-ink hover:underline">
            {MAINTENANCE_TYPE_LABELS[m.type]}
          </Link>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">
          <span className="tnum sm:hidden">{m.maintenanceNo} · </span>
          {m.reason}
        </span>
        <span className="mt-1 block md:hidden">
          <Pill tone={m.overdue ? 'alert' : MAINTENANCE_STATUS_TONE[m.status]}>{m.overdue ? `${MAINTENANCE_STATUS_LABELS[m.status]} · gecikti` : MAINTENANCE_STATUS_LABELS[m.status]}</Pill>
        </span>
      </td>
      <td className="hidden px-3 py-2 leading-tight lg:table-cell">
        <span className="block truncate text-ink">
          {m.vehicle.make} {m.vehicle.model}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{m.providerName ?? 'Servis sağlayıcı girilmemiş'}</span>
      </td>
      <td className="hidden px-3 py-2 leading-tight md:table-cell">
        <span className="tnum block whitespace-nowrap text-ink">{formatMoment(m.plannedStart, zone)}</span>
        <span className={cn('tnum mt-0.5 block text-[12.5px] whitespace-nowrap', m.overdue ? 'font-medium text-alert' : 'text-ink-2')}>→ {formatMoment(m.plannedEnd, zone)}</span>
      </td>
      <td className="hidden px-3 py-2 xl:table-cell">
        <BranchCode code={m.branch.code} />
      </td>
      <td className="hidden pr-5 pl-3 md:table-cell">
        <Pill tone={m.overdue ? 'alert' : MAINTENANCE_STATUS_TONE[m.status]}>{m.overdue ? `${MAINTENANCE_STATUS_LABELS[m.status]} · gecikti` : MAINTENANCE_STATUS_LABELS[m.status]}</Pill>
      </td>
    </tr>
  )
}

/** Bakım & Servis: every maintenance record the user may see; overdue is a derived flag, not a state. */
export function MaintenancePage() {
  const session = useSession()
  const companyId = session.company?.id
  const zone = session.company?.timezone
  const search = useSearch({ from: '/app/bakim-servis' }) as MaintenanceListSearch
  const navigate = useNavigate({ from: '/bakim-servis' })
  const set = (patch: Partial<MaintenanceListSearch>) => navigate({ search: (prev: MaintenanceListSearch) => ({ ...prev, ...patch, page: patch.page }), replace: true })
  const { text, setText, q } = useSearchText(() => search.page && set({}))
  const [type, setType] = useState<MaintenanceType | ''>('')
  const view = search.view ?? 'open'
  const page = search.page ?? 1
  const pageSize = search.pageSize ?? 25
  const branches = useQuery({ queryKey: ['ops-branches', companyId], queryFn: () => maintenanceApi.branches() })
  const body = { q: q || undefined, view, type: type || undefined, branchId: search.branchId, sort: search.sort ?? 'planned', dir: search.dir ?? 'desc', page, pageSize }
  const list = useQuery({ queryKey: ['maintenance', companyId, body], queryFn: () => maintenanceApi.search(body), placeholderData: keepPreviousData })
  const data = list.data
  const canManage = can(session, 'maintenance.manage')
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const tabs: ListTab<MaintenanceView>[] = TABS.map(([v, label]) => ({
    view: v,
    label,
    count: data && v in data.counts ? data.counts[v as keyof typeof data.counts] : undefined,
    tone: v === 'overdue' ? 'alert' : v === 'pending_approval' || v === 'awaiting_check' ? 'hold' : undefined,
  }))
  const filtered = !!(q || type || search.branchId)

  return (
    <div className="space-y-5">
      <PageHeader title="Bakım & Servis" description={session.company ? `${session.company.name} · planlı, süren ve tamamlanan bakımlar` : undefined}>
        {canManage && (
          <Link to="/bakim-servis/yeni" className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Bakım planla
          </Link>
        )}
      </PageHeader>
      {forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <ListFrame
          label="Bakım görünümü"
          tabs={tabs}
          view={view}
          onView={(v) => set({ view: v === 'open' ? undefined : v })}
          text={text}
          onText={setText}
          placeholder="Bakım no, plaka, neden, servis"
          filters={
            <>
              <Select compact aria-label="Bakım türü" value={type} onChange={(e) => setType(e.target.value as MaintenanceType | '')} className="w-auto max-w-[180px]">
                <option value="">Tüm türler</option>
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MAINTENANCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              {(branches.data?.branches.length ?? 0) > 1 && (
                <Select compact aria-label="Şube" value={search.branchId ?? ''} onChange={(e) => set({ branchId: e.target.value || undefined })} className="w-auto max-w-[180px]">
                  <option value="">Tüm şubeler</option>
                  {branches.data!.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
              <Select compact aria-label="Sıralama" value={`${search.sort ?? 'planned'}:${search.dir ?? 'desc'}`} onChange={(e) => {
                const [sort, dir] = e.target.value.split(':') as ['planned' | 'created' | 'number', 'asc' | 'desc']
                set({ sort: sort === 'planned' ? undefined : sort, dir: dir === 'desc' ? undefined : dir })
              }} className="w-auto max-w-[220px]">
                <option value="planned:desc">Plan tarihi (yeni → eski)</option>
                <option value="planned:asc">Plan tarihi (eski → yeni)</option>
                <option value="created:desc">Oluşturma (yeni → eski)</option>
                <option value="number:desc">Numara</option>
              </Select>
            </>
          }
          info="Saatler sorumlu şubenin yerel saatidir. Planlı bakım aracı ayırır, onay bekleyen ayırmaz. Bakımın tamamlanması aracın teslime hazır olduğu anlamına gelmez."
          totalText={data ? `${data.total} bakım` : ''}
          loading={list.isPlaceholderData}
          error={list.isError ? list.error : null}
          onRetry={() => list.refetch()}
          empty={
            data && data.total === 0 ? (
              filtered || view !== 'open' ? (
                <EmptyList icon={Wrench} title="Bu görünümde bakım yok">
                  <p>Görünümü, aramayı veya filtreleri değiştirin.</p>
                </EmptyList>
              ) : (
                <EmptyList icon={Wrench} title="Açık bakım yok">
                  <p>{canManage ? 'Bir araç için bakım planlayın; çakışma varsa sistem gösterir.' : 'Planlı veya süren bakım bulunmuyor.'}</p>
                </EmptyList>
              )
            ) : null
          }
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={(p) => set({ page: p > 1 ? p : undefined })}
          onPageSize={(n) => set({ pageSize: n === 25 ? undefined : n })}
          unit="bakım"
        >
          <table className="w-full table-fixed text-left sm:min-w-[560px]">
            <thead>
              <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                <th scope="col" className="hidden w-[100px] px-3 pl-5 font-medium sm:table-cell">
                  No
                </th>
                <th scope="col" className="pr-3 pl-4 font-medium sm:px-3">
                  Araç ve bakım
                </th>
                <th scope="col" className="hidden w-[20%] px-3 font-medium lg:table-cell">
                  Model ve servis
                </th>
                <th scope="col" className="hidden w-[190px] px-3 font-medium md:table-cell">
                  Plan
                </th>
                <th scope="col" className="hidden w-[80px] px-3 font-medium xl:table-cell">
                  Şube
                </th>
                <th scope="col" className="hidden w-[190px] pr-5 pl-3 font-medium md:table-cell">
                  Durum
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">{!data ? <SkeletonRows cols={6} /> : data.items.map((m) => <Row key={m.id} m={m} zone={zone} />)}</tbody>
          </table>
        </ListFrame>
      )}
    </div>
  )
}
