import { MapPin } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { ApiRequestError, branchesApi } from '@/lib/api'
import { useSession } from '@/session'

/** Read-only branch list of the active company, straight from the database. */
export function BranchesPage() {
  const session = useSession()
  const q = useQuery({ queryKey: ['branches', session.company?.id], queryFn: branchesApi.list })
  const forbidden = q.error instanceof ApiRequestError && q.error.status === 403

  return (
    <div className="space-y-6">
      <PageHeader
        title="Şubeler"
        description={session.company ? `${session.company.name} şubeleri. Şube ekleme ve düzenleme henüz geliştirilmedi.` : undefined}
      />
      {forbidden ? (
        <ForbiddenState message={(q.error as ApiRequestError).message} />
      ) : q.isError ? (
        <ErrorState message={q.error.message} onRetry={() => q.refetch()} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-semibold">Şube listesi</h2>
            <span className="tnum text-[13px] text-ink-3">{q.data ? `${q.data.items.length} şube` : ''}</span>
          </div>
          {q.isPending ? (
            <div aria-busy="true" aria-label="Şubeler yükleniyor" className="divide-y divide-line-soft">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-11 items-center gap-6 px-5">
                  <span className="h-3 w-12 animate-pulse rounded bg-line-soft" />
                  <span className="h-3 w-40 animate-pulse rounded bg-line-soft" />
                </div>
              ))}
            </div>
          ) : q.data.items.length === 0 ? (
            <StatePanel icon={MapPin} title="Görebileceğiniz şube yok" className="rounded-none border-0">
              <p>Hesabınıza henüz şube atanmamış.</p>
            </StatePanel>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="h-10 border-b border-line text-[12px] text-ink-3">
                  <th scope="col" className="w-28 px-5 font-medium">
                    Kod
                  </th>
                  <th scope="col" className="px-5 font-medium">
                    Şube adı
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {q.data.items.map((b) => (
                  <tr key={b.id} className="h-11">
                    <td className="px-5">
                      <span className="inline-flex h-6 items-center rounded-[5px] border border-line px-1.5 text-[12px] font-semibold tracking-[0.06em]">{b.code}</span>
                    </td>
                    <td className="px-5 font-medium">{b.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  )
}
