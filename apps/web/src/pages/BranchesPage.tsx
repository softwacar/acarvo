import { CheckCircle, Info, MapPin, SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from 'radix-ui'
import { useMemo, useState } from 'react'
import { Field, Select } from '@/components/fields'
import { ErrorState, ForbiddenState, PageHeader, StatePanel } from '@/components/states'
import { toast } from '@/components/Toaster'
import { useReturnFocus } from '@/components/useReturnFocus'
import { ApiRequestError, type BranchRow, branchesApi } from '@/lib/api'
import { countryName, countryOptions } from '@/lib/customer-labels'
import { can, sessionQuery, useSession } from '@/session'

function CountryOptions({ companyCountry }: { companyCountry?: string | null }) {
  const { frequent, all } = useMemo(() => countryOptions(companyCountry), [companyCountry])
  return (
    <>
      <optgroup label="Sık kullanılanlar">
        {frequent.map((c) => (
          <option key={`f-${c.code}`} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Tüm ülkeler">
        {all.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </>
  )
}

/** One branch's country, editable inline by the owner. Saved explicitly; nothing is filled in automatically. */
function CountryCell({ b, canManage }: { b: BranchRow; canManage: boolean }) {
  const session = useSession()
  const qc = useQueryClient()
  const [value, setValue] = useState(b.country ?? '')
  const save = useMutation({
    mutationFn: () => branchesApi.setCountry(b.id, value || null),
    onSuccess: (r) => {
      qc.setQueryData(['branches', session.company?.id], r)
      void qc.invalidateQueries({ queryKey: sessionQuery.queryKey })
      toast(`${b.name}: ülke ${value ? countryName(value) : 'kaldırıldı'}.`)
    },
  })
  if (!canManage) return b.country ? <span>{countryName(b.country)}</span> : <span className="text-[13px] text-ink-3">Tanımlanmamış</span>
  const dirty = value !== (b.country ?? '')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select compact aria-label={`${b.name} şubesinin ülkesi`} value={value} onChange={(e) => setValue(e.target.value)} className="w-[220px] max-w-full">
        <option value="">Tanımlanmamış</option>
        <CountryOptions companyCountry={session.company?.country} />
      </Select>
      {dirty && (
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue px-3 text-[13px] font-medium text-white hover:bg-blue-ink disabled:opacity-60"
        >
          {save.isPending && <SpinnerGap size={14} className="animate-spin" />}
          Kaydet
        </button>
      )}
      {save.isError && (
        <span role="alert" className="text-[13px] text-alert">
          {save.error.message}
        </span>
      )}
    </div>
  )
}

/** Bulk assignment: choose a country, see exactly which branches would change, then confirm. */
function BulkCountryDialog({ onClose }: { onClose: () => void }) {
  const session = useSession()
  const qc = useQueryClient()
  const returnFocus = useReturnFocus()
  const [country, setCountry] = useState(session.company?.country ?? '')
  const preview = useMutation({ mutationFn: () => branchesApi.previewCountry(country) })
  const apply = useMutation({
    mutationFn: () => branchesApi.applyCountry(preview.data!.country, preview.data!.branches.map((b) => b.id)),
    onSuccess: (r) => {
      qc.setQueryData(['branches', session.company?.id], { items: r.items })
      void qc.invalidateQueries({ queryKey: sessionQuery.queryKey })
      toast(r.changed.length ? `${r.changed.length} şubeye ülke atandı.` : 'Değişiklik yapılmadı: şubelerin ülkesi zaten tanımlı.')
      onClose()
    },
  })
  const shown = preview.data && preview.data.country === country ? preview.data : null
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Dialog.Content
          onCloseAutoFocus={returnFocus}
          className="fixed top-1/2 left-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 animate-fade rounded-xl border border-line bg-surface p-5 shadow-xl outline-none"
        >
          <Dialog.Title className="text-[17px] font-semibold">Ülkesi tanımlanmamış şubelere toplu atama</Dialog.Title>
          <Dialog.Description className="mt-1 text-[13.5px] text-ink-2">
            Yalnız ülkesi henüz girilmemiş şubeler değişir. Önce hangi şubelerin etkileneceğini görürsünüz; onaylamadan hiçbir şey kaydedilmez.
          </Dialog.Description>
          <div className="mt-4">
            <Field id="bulk-country" label="Atanacak ülke">
              <Select id="bulk-country" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="">Seçin</option>
                <CountryOptions companyCountry={session.company?.country} />
              </Select>
            </Field>
          </div>
          {!shown ? (
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
              <button
                type="button"
                disabled={!country || preview.isPending}
                onClick={() => preview.mutate()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink hover:bg-line-soft disabled:opacity-60"
              >
                {preview.isPending && <SpinnerGap size={16} className="animate-spin" />}
                Önizle
              </button>
            </div>
          ) : (
            <div className="mt-4">
              {shown.branches.length === 0 ? (
                <p className="flex items-start gap-2 rounded-lg bg-ground/70 px-3 py-2.5 text-[13px] text-ink-2">
                  <CheckCircle size={16} className="mt-px shrink-0 text-ok" />
                  Ülkesi tanımlanmamış şube yok; değişecek bir şey bulunmuyor.
                </p>
              ) : (
                <div role="region" aria-label="Etkilenecek şubeler" className="rounded-lg border border-hold/35 bg-hold-soft px-3.5 py-3 text-[13px]">
                  <p className="font-medium text-ink">
                    {shown.branches.length} şubenin ülkesi “{countryName(shown.country)}” olacak:
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-ink-2">
                    {shown.branches.map((b) => (
                      <li key={b.id}>
                        <span className="font-medium text-ink">{b.code}</span> · {b.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {apply.isError && (
                <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-alert">
                  <WarningCircle size={16} className="mt-px shrink-0" />
                  {apply.error.message}
                </p>
              )}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Dialog.Close className="h-10 rounded-lg px-3.5 font-medium text-ink-2 hover:bg-ground hover:text-ink">Vazgeç</Dialog.Close>
                {shown.branches.length > 0 && (
                  <button
                    type="button"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-4 font-medium text-white hover:bg-blue-ink disabled:opacity-60"
                  >
                    {apply.isPending && <SpinnerGap size={16} className="animate-spin" />}
                    Onayla ve uygula
                  </button>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Branch list of the active company, straight from the database. The owner sets each branch's country (M2). */
export function BranchesPage() {
  const session = useSession()
  const canManage = can(session, 'branches.manage')
  const [bulk, setBulk] = useState(false)
  const q = useQuery({ queryKey: ['branches', session.company?.id], queryFn: branchesApi.list })
  const forbidden = q.error instanceof ApiRequestError && q.error.status === 403
  const missing = q.data?.items.filter((b) => !b.country).length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title="Şubeler" description={session.company ? `${session.company.name} şubeleri. Şube ekleme ve düzenleme henüz geliştirilmedi.` : undefined}>
        {canManage && missing > 0 && (
          <button type="button" onClick={() => setBulk(true)} className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 font-medium text-ink hover:bg-line-soft">
            <MapPin size={16} />
            Toplu ülke ata
          </button>
        )}
      </PageHeader>
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
          <p className="flex items-start gap-2 border-b border-line-soft bg-ground/50 px-5 py-2 text-[12.5px] text-ink-2">
            <Info size={15} className="mt-px shrink-0 text-ink-3" />
            Şube ülkesi, kiralamada Yerli/Yabancı (ikamet) değerlendirmesinin ve ülke belge gereksinimlerinin referansıdır. Otomatik doldurulmaz; şirket sahibi girer.
          </p>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead>
                  <tr className="h-10 border-b border-line text-[12px] text-ink-3">
                    <th scope="col" className="w-28 px-5 font-medium">
                      Kod
                    </th>
                    <th scope="col" className="px-5 font-medium">
                      Şube adı
                    </th>
                    <th scope="col" className="w-[320px] px-5 font-medium">
                      Ülke
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {q.data.items.map((b) => (
                    <tr key={b.id} className="h-12">
                      <td className="px-5">
                        <span className="inline-flex h-6 items-center rounded-[5px] border border-line px-1.5 text-[12px] font-semibold tracking-[0.06em]">{b.code}</span>
                      </td>
                      <td className="px-5 font-medium">{b.name}</td>
                      <td className="px-5 py-1.5">
                        <CountryCell key={`${b.id}-${b.country}`} b={b} canManage={canManage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {bulk && <BulkCountryDialog onClose={() => setBulk(false)} />}
    </div>
  )
}
