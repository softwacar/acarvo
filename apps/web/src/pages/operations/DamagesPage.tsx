import { DAMAGE_SEVERITIES, type DamageListItem, type DamageListView, type DamageSeverity } from '@acarvo/shared'
import { Bandaids, Plus, Prohibit } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { Select } from '@/components/fields'
import { Plate } from '@/components/Plate'
import { ForbiddenState, PageHeader } from '@/components/states'
import { ApiRequestError, damagesApi } from '@/lib/api'
import { DAMAGE_REVIEW_LABELS, DAMAGE_REVIEW_TONE, DAMAGE_SEVERITY_LABELS, DAMAGE_SEVERITY_TONE, DAMAGE_TYPE_LABELS, DAMAGE_VIEW_LABELS } from '@/lib/operation-labels'
import { formatMoment } from '@/lib/reservation-labels'
import { cn } from '@/lib/utils'
import { can, useSession } from '@/session'
import { BranchCode, EmptyList, ListFrame, type ListTab, Pill, SkeletonRows, useSearchText } from './OpsParts'
import type { DamageListSearch } from './search'

const TABS: [DamageListView, string][] = [
  ['open', 'Açık'],
  ['blocked', 'Aracı engelleyen'],
  ['reported', 'Bildirilen'],
  ['under_review', 'İncelenen'],
  ['assessed', 'Değerlendirilen'],
  ['closed', 'Kapatılan'],
  ['all', 'Tümü'],
]

function Row({ d, zone }: { d: DamageListItem; zone?: string }) {
  const session = useSession()
  const navigate = useNavigate()
  return (
    <tr onClick={() => navigate({ to: '/hasar-kayitlari/$damageId', params: { damageId: d.id } })} className={cn('group h-[60px] cursor-pointer hover:bg-blue-soft/35', d.reviewStatus === 'closed' && 'text-ink-2')}>
      <td className="hidden py-2 pr-3 pl-5 sm:table-cell">
        <span className="tnum text-[13px] font-medium whitespace-nowrap text-ink-2">{d.damageNo}</span>
      </td>
      <td className="py-2 pr-3 pl-4 sm:px-3">
        <span className="flex min-w-0 items-center gap-2">
          <Plate plate={d.vehicle.plate} country={session.company?.country} />
          <Link to="/hasar-kayitlari/$damageId" params={{ damageId: d.id }} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-ink group-hover:text-blue-ink hover:underline">
            {DAMAGE_TYPE_LABELS[d.damageType]} · {DAMAGE_VIEW_LABELS[d.view]}
          </Link>
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-ink-2">
          <span className="tnum sm:hidden">{d.damageNo} · </span>
          {d.blocked && (
            <span className="inline-flex items-center gap-1 font-medium text-alert">
              <Prohibit size={12} weight="bold" />
              Aracı engelliyor ·
            </span>
          )}
          <span className="truncate">{d.area ?? (d.rental ? `Kiralama ${d.rental.rentalNo}` : 'Alan girilmemiş')}</span>
        </span>
      </td>
      <td className="hidden px-3 py-2 lg:table-cell">
        <Pill tone={DAMAGE_SEVERITY_TONE[d.severity]}>{DAMAGE_SEVERITY_LABELS[d.severity]}</Pill>
      </td>
      <td className="hidden px-3 py-2 md:table-cell">
        <span className="tnum whitespace-nowrap text-ink">{formatMoment(d.detected, zone)}</span>
      </td>
      <td className="hidden px-3 py-2 xl:table-cell">
        <BranchCode code={d.branch.code} />
      </td>
      <td className="hidden pr-5 pl-3 md:table-cell">
        <Pill tone={DAMAGE_REVIEW_TONE[d.reviewStatus]}>{DAMAGE_REVIEW_LABELS[d.reviewStatus]}</Pill>
      </td>
    </tr>
  )
}

/** Hasar Kayıtları: findings and their review. A finding is not a liability; no charge or claim exists here. */
export function DamagesPage() {
  const session = useSession()
  const companyId = session.company?.id
  const zone = session.company?.timezone
  const search = useSearch({ from: '/app/hasar-kayitlari' }) as DamageListSearch
  const navigate = useNavigate({ from: '/hasar-kayitlari' })
  const set = (patch: Partial<DamageListSearch>) => navigate({ search: (prev: DamageListSearch) => ({ ...prev, ...patch, page: patch.page }), replace: true })
  const { text, setText, q } = useSearchText(() => search.page && set({}))
  const [severity, setSeverity] = useState<DamageSeverity | ''>('')
  const view = search.view ?? 'open'
  const page = search.page ?? 1
  const pageSize = search.pageSize ?? 25
  const branches = useQuery({ queryKey: ['ops-branches', companyId, 'damage'], queryFn: () => damagesApi.branches() })
  const body = { q: q || undefined, view, severity: severity || undefined, branchId: search.branchId, sort: search.sort ?? 'detected', dir: search.dir ?? 'desc', page, pageSize }
  const list = useQuery({ queryKey: ['damages', companyId, body], queryFn: () => damagesApi.search(body), placeholderData: keepPreviousData })
  const data = list.data
  const canReport = can(session, 'damage.report')
  const forbidden = list.error instanceof ApiRequestError && list.error.status === 403
  const tabs: ListTab<DamageListView>[] = TABS.map(([v, label]) => ({
    view: v,
    label,
    count: data && v in data.counts ? data.counts[v as keyof typeof data.counts] : undefined,
    tone: v === 'blocked' ? 'alert' : v === 'reported' ? 'hold' : undefined,
  }))
  const filtered = !!(q || severity || search.branchId)
  return (
    <div className="space-y-5">
      <PageHeader title="Hasar Kayıtları" description={session.company ? `${session.company.name} · bulgular, inceleme ve onarım durumu` : undefined}>
        {canReport && (
          <Link to="/hasar-kayitlari/yeni" className="flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white transition-colors hover:bg-blue-ink">
            <Plus size={16} weight="bold" />
            Hasar bildir
          </Link>
        )}
      </PageHeader>
      {forbidden ? (
        <ForbiddenState message={(list.error as ApiRequestError).message} />
      ) : (
        <ListFrame
          label="Hasar görünümü"
          tabs={tabs}
          view={view}
          onView={(v) => set({ view: v === 'open' ? undefined : v })}
          text={text}
          onText={setText}
          placeholder="Hasar no, plaka, kiralama no, açıklama"
          filters={
            <>
              <Select compact aria-label="Ağırlık" value={severity} onChange={(e) => setSeverity(e.target.value as DamageSeverity | '')} className="w-auto max-w-[160px]">
                <option value="">Tüm ağırlıklar</option>
                {DAMAGE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {DAMAGE_SEVERITY_LABELS[s]}
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
              <Select compact aria-label="Sıralama" value={`${search.sort ?? 'detected'}:${search.dir ?? 'desc'}`} onChange={(e) => {
                const [sort, dir] = e.target.value.split(':') as ['detected' | 'created' | 'number', 'asc' | 'desc']
                set({ sort: sort === 'detected' ? undefined : sort, dir: dir === 'desc' ? undefined : dir })
              }} className="w-auto max-w-[220px]">
                <option value="detected:desc">Tespit (yeni → eski)</option>
                <option value="detected:asc">Tespit (eski → yeni)</option>
                <option value="number:desc">Numara</option>
              </Select>
            </>
          }
          info="Hasar bulgusu sorumluluk kararı değildir; kusur, ücret, sigorta talebi veya depozito kesintisi oluşturulmaz. Kullanılamaz işaretli araç rezervasyon onayına ve teslime kapalıdır."
          totalText={data ? `${data.total} hasar dosyası` : ''}
          loading={list.isPlaceholderData}
          error={list.isError ? list.error : null}
          onRetry={() => list.refetch()}
          empty={
            data && data.total === 0 ? (
              <EmptyList icon={Bandaids} title={filtered || view !== 'open' ? 'Bu görünümde hasar dosyası yok' : 'Açık hasar dosyası yok'}>
                <p>{filtered || view !== 'open' ? 'Görünümü, aramayı veya filtreleri değiştirin.' : 'Teslim veya iade bulgusundan ya da doğrudan hasar dosyası açılabilir.'}</p>
              </EmptyList>
            ) : null
          }
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPage={(p) => set({ page: p > 1 ? p : undefined })}
          onPageSize={(n) => set({ pageSize: n === 25 ? undefined : n })}
          unit="hasar dosyası"
        >
          <table className="w-full table-fixed text-left sm:min-w-[560px]">
            <thead>
              <tr className="h-10 border-b border-line text-[12.5px] whitespace-nowrap text-ink-2">
                <th scope="col" className="hidden w-[100px] px-3 pl-5 font-medium sm:table-cell">
                  No
                </th>
                <th scope="col" className="pr-3 pl-4 font-medium sm:px-3">
                  Araç ve hasar
                </th>
                <th scope="col" className="hidden w-[110px] px-3 font-medium lg:table-cell">
                  Ağırlık
                </th>
                <th scope="col" className="hidden w-[160px] px-3 font-medium md:table-cell">
                  Tespit
                </th>
                <th scope="col" className="hidden w-[80px] px-3 font-medium xl:table-cell">
                  Şube
                </th>
                <th scope="col" className="hidden w-[150px] pr-5 pl-3 font-medium md:table-cell">
                  İnceleme
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">{!data ? <SkeletonRows cols={6} /> : data.items.map((d) => <Row key={d.id} d={d} zone={zone} />)}</tbody>
          </table>
        </ListFrame>
      )}
    </div>
  )
}
